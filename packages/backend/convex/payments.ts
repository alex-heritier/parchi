import { getAuthUserId } from '@convex-dev/auth/server';
import { type ActionCtx, actionGeneric, anyApi, httpActionGeneric } from 'convex/server';
import Stripe from 'stripe';
import type { Id } from './_generated/dataModel.js';
import {
  type OpenRouterLimitReset,
  assignKeyToGuardrail,
  createManagedOpenRouterKey,
  ensureAllowedModelsGuardrail,
  readOpenRouterProvisioningConfig,
  setManagedOpenRouterKeyDisabled,
} from './openrouterManagement.js';

type UserId = Id<'users'>;

const baseSiteUrl = () => String(process.env.SITE_URL || 'https://example.com').replace(/\/+$/, '');
const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization,stripe-signature',
  vary: 'origin',
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...corsHeaders,
    },
  });

const asString = (value: unknown) => String(value ?? '').trim();

const parseJsonBody = async (request: Request) => {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const randomHex = (byteLength: number) => {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
};

const sha256Hex = async (value: string) => {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return bytesToHex(new Uint8Array(digest));
};

const createRecoveryTokenForSubscription = async (subscriptionId: string) => {
  const secret = randomHex(24);
  const token = `ortk.v1.${subscriptionId}.${secret}`;
  const hash = await sha256Hex(secret);
  return { token, hash };
};

const parseRecoveryToken = (token: string) => {
  const normalized = asString(token);
  const parts = normalized.split('.');
  if (parts.length !== 4 || parts[0] !== 'ortk' || parts[1] !== 'v1') {
    throw new Error('Invalid recovery token format');
  }

  const subscriptionId = asString(parts[2]);
  const secret = asString(parts[3]);
  if (!subscriptionId.startsWith('sub_') || !secret) {
    throw new Error('Invalid recovery token payload');
  }
  return { subscriptionId, secret };
};

const getStripeClient = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('Missing STRIPE_SECRET_KEY');
  }
  return new Stripe(key);
};

const mapStripeStatus = (status: string | null | undefined): 'active' | 'canceled' | 'past_due' | 'inactive' => {
  switch (String(status || '').toLowerCase()) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      return 'inactive';
  }
};

const resolveProvisioningPriceId = () => {
  const priceId = asString(process.env.STRIPE_OPENROUTER_PRICE_ID || process.env.STRIPE_PRO_PRICE_ID);
  if (!priceId) {
    throw new Error('Missing STRIPE_OPENROUTER_PRICE_ID (or STRIPE_PRO_PRICE_ID fallback)');
  }
  return priceId;
};

const isSubscriptionEnabled = (status: string | null | undefined) => mapStripeStatus(status) === 'active';

type OpenRouterProvisioningPlan = {
  id: string;
  stripePriceId: string;
  keyLimitUsd: number;
  limitReset: OpenRouterLimitReset;
  allowedModels: string[];
  defaultModel: string;
};

type OpenRouterProvisioningRuntimeConfig = {
  defaultPlanId: string;
  enforceModelGuardrail: boolean;
  enforceZdr: boolean;
  plans: OpenRouterProvisioningPlan[];
};

const parseAllowedModels = (value: unknown, fallback: string[]) => {
  if (value === null) return [];

  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)));
  }

  if (typeof value === 'string') {
    const parsed = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return Array.from(new Set(parsed));
  }

  return fallback;
};

const parseLimitReset = (value: unknown, fallback: OpenRouterLimitReset): OpenRouterLimitReset => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'daily' || normalized === 'weekly' || normalized === 'monthly') return normalized;
  if (normalized === 'null' || normalized === 'none') return null;
  throw new Error(`Invalid limit_reset '${normalized}'. Expected daily|weekly|monthly|null`);
};

const parsePositiveNumber = (value: unknown, fallback: number, label: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    if (value == null || String(value).trim() === '') return fallback;
    throw new Error(`Invalid ${label}. Expected a positive number`);
  }
  return parsed;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const toUserId = (value: unknown): UserId | null => {
  const next = asString(value);
  return next ? (next as UserId) : null;
};

const subscriptionCurrentPeriodEndMs = (subscription: Stripe.Subscription): number | undefined => {
  const raw = asRecord(subscription)?.current_period_end;
  const seconds = Number(raw || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.floor(seconds * 1000);
};

const resolveOpenRouterProvisioningRuntimeConfig = (): OpenRouterProvisioningRuntimeConfig => {
  const fallbackConfig = readOpenRouterProvisioningConfig();
  const defaultPlanId = asString(process.env.OPENROUTER_DEFAULT_PLAN_ID) || 'default';
  const fallbackAllowedModels = parseAllowedModels(process.env.OPENROUTER_ALLOWED_MODELS, [
    fallbackConfig.defaultModel,
  ]);
  const fallbackStripePriceId = resolveProvisioningPriceId();

  const parsePlan = (raw: unknown, index: number): OpenRouterProvisioningPlan => {
    const row = asRecord(raw) || {};
    const id = asString(row.id) || `plan-${index + 1}`;
    const stripePriceId = asString(row.stripePriceId) || asString(row.stripe_price_id) || fallbackStripePriceId;
    if (!stripePriceId) {
      throw new Error(`Plan '${id}' is missing stripePriceId`);
    }

    const allowedModels = parseAllowedModels(row.allowedModels ?? row.allowed_models, fallbackAllowedModels);
    const defaultModelCandidate = asString(row.defaultModel ?? row.default_model) || fallbackConfig.defaultModel;
    const defaultModel =
      allowedModels.length > 0
        ? allowedModels.includes(defaultModelCandidate)
          ? defaultModelCandidate
          : allowedModels[0]
        : defaultModelCandidate;

    return {
      id,
      stripePriceId,
      keyLimitUsd: parsePositiveNumber(
        row.keyLimitUsd ?? row.key_limit_usd,
        fallbackConfig.limitUsd,
        `plan '${id}' keyLimitUsd`,
      ),
      limitReset: parseLimitReset(row.limitReset ?? row.limit_reset, fallbackConfig.limitReset),
      allowedModels,
      defaultModel,
    };
  };

  const rawCatalog = asString(process.env.OPENROUTER_PLAN_CATALOG_JSON);
  if (!rawCatalog) {
    return {
      defaultPlanId,
      enforceModelGuardrail: fallbackConfig.enforceModelGuardrail,
      enforceZdr: fallbackConfig.enforceZdr,
      plans: [
        {
          id: defaultPlanId,
          stripePriceId: fallbackStripePriceId,
          keyLimitUsd: fallbackConfig.limitUsd,
          limitReset: fallbackConfig.limitReset,
          allowedModels: fallbackAllowedModels,
          defaultModel: fallbackAllowedModels[0] || fallbackConfig.defaultModel,
        },
      ],
    };
  }

  let parsedCatalog: unknown;
  try {
    parsedCatalog = JSON.parse(rawCatalog);
  } catch (error) {
    throw new Error(`Invalid OPENROUTER_PLAN_CATALOG_JSON: ${(error as Error).message}`);
  }

  if (!Array.isArray(parsedCatalog) || parsedCatalog.length === 0) {
    throw new Error('OPENROUTER_PLAN_CATALOG_JSON must be a non-empty JSON array');
  }

  const plans = parsedCatalog.map((entry, index) => parsePlan(entry, index));
  return {
    defaultPlanId: plans.some((plan) => plan.id === defaultPlanId) ? defaultPlanId : plans[0].id,
    enforceModelGuardrail: fallbackConfig.enforceModelGuardrail,
    enforceZdr: fallbackConfig.enforceZdr,
    plans,
  };
};

const findPlanById = (runtime: OpenRouterProvisioningRuntimeConfig, planId: string) =>
  runtime.plans.find((plan) => plan.id === planId);

const findPlanByStripePriceId = (runtime: OpenRouterProvisioningRuntimeConfig, stripePriceId: string) =>
  runtime.plans.find((plan) => plan.stripePriceId === stripePriceId);

const choosePlanModelStrict = (plan: OpenRouterProvisioningPlan, requestedModel: string) => {
  const model = asString(requestedModel);
  if (model) {
    if (plan.allowedModels.length > 0 && !plan.allowedModels.includes(model)) {
      throw new Error(`Model '${model}' is not allowed for plan '${plan.id}'`);
    }
    return model;
  }
  if (plan.allowedModels.length > 0) {
    return plan.defaultModel || plan.allowedModels[0];
  }
  return plan.defaultModel;
};

const choosePlanModelLenient = (plan: OpenRouterProvisioningPlan, requestedModel: string) => {
  const model = asString(requestedModel);
  if (!model) {
    return plan.allowedModels.length > 0 ? plan.defaultModel || plan.allowedModels[0] : plan.defaultModel;
  }
  if (plan.allowedModels.length === 0) return model;
  if (plan.allowedModels.includes(model)) return model;
  return plan.defaultModel || plan.allowedModels[0];
};

const resolveCheckoutSelection = (body: Record<string, unknown>) => {
  const runtime = resolveOpenRouterProvisioningRuntimeConfig();
  const requestedPlanId = asString(body.plan_id) || runtime.defaultPlanId;
  const plan = findPlanById(runtime, requestedPlanId);
  if (!plan) {
    throw new Error(
      `Unknown plan '${requestedPlanId}'. Available plans: ${runtime.plans.map((entry) => entry.id).join(', ')}`,
    );
  }
  const model = choosePlanModelStrict(plan, asString(body.model));
  return { runtime, plan, model };
};

const readSubscriptionPrimaryPriceId = (subscription: Stripe.Subscription) =>
  asString(subscription.items?.data?.[0]?.price?.id);

const resolveProvisioningSelection = (subscription: Stripe.Subscription, session: Stripe.Checkout.Session | null) => {
  const runtime = resolveOpenRouterProvisioningRuntimeConfig();

  const metadataPlanId =
    asString(subscription.metadata?.parchi_plan_id) ||
    asString(session?.metadata?.parchi_plan_id) ||
    runtime.defaultPlanId;
  const metadataModel =
    asString(subscription.metadata?.parchi_model) ||
    asString(subscription.metadata?.openrouter_model) ||
    asString(session?.metadata?.parchi_model);

  const byId = findPlanById(runtime, metadataPlanId);
  const byPrice = findPlanByStripePriceId(runtime, readSubscriptionPrimaryPriceId(subscription));
  const plan = byId || byPrice || findPlanById(runtime, runtime.defaultPlanId) || runtime.plans[0];
  if (!plan) {
    throw new Error('No provisioning plan is configured');
  }

  return {
    runtime,
    plan,
    model: choosePlanModelLenient(plan, metadataModel),
  };
};

export const createCheckoutSession = actionGeneric(async (ctx) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Unauthorized');

  const stripePriceId = process.env.STRIPE_PRO_PRICE_ID;
  if (!stripePriceId) {
    throw new Error('Missing STRIPE_PRO_PRICE_ID');
  }

  const stripe = getStripeClient();
  const user = await ctx.runQuery(anyApi.users.me, {});
  const existing = await ctx.runQuery(anyApi.subscriptions.getByUserId, { userId });

  let customerId = existing?.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user?.email || undefined,
      metadata: {
        convexUserId: String(userId),
      },
    });
    customerId = customer.id;
  }

  const siteUrl = baseSiteUrl();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: stripePriceId, quantity: 1 }],
    success_url: `${siteUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/billing/cancel`,
    metadata: {
      userId: String(userId),
    },
    allow_promotion_codes: true,
  });

  await ctx.runMutation(anyApi.subscriptions.upsertForUser, {
    userId,
    plan: existing?.plan || 'free',
    status: existing?.status || 'inactive',
    stripeCustomerId: customerId,
    stripeSubscriptionId: existing?.stripeSubscriptionId,
    currentPeriodEnd: existing?.currentPeriodEnd,
  });

  return {
    id: session.id,
    url: session.url,
  };
});

export const createOpenRouterCheckout = httpActionGeneric(async (_ctx, request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const stripe = getStripeClient();
    const body = (await parseJsonBody(request)) || {};
    const { plan, model } = resolveCheckoutSelection(body);
    const allowedModelsCsv = plan.allowedModels.join(',');

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: `${baseSiteUrl()}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseSiteUrl()}/billing/cancel`,
      customer_email: asString(body.customer_email) || undefined,
      metadata: {
        parchi_plan_id: plan.id,
        parchi_model: model,
        parchi_allowed_models: allowedModelsCsv,
        parchi_key_limit_usd: String(plan.keyLimitUsd),
        parchi_limit_reset: plan.limitReset ?? '',
      },
      subscription_data: {
        metadata: {
          parchi_plan_id: plan.id,
          parchi_model: model,
          parchi_allowed_models: allowedModelsCsv,
          parchi_key_limit_usd: String(plan.keyLimitUsd),
          parchi_limit_reset: plan.limitReset ?? '',
        },
      },
      allow_promotion_codes: true,
    });

    return jsonResponse(200, {
      session_id: session.id,
      url: session.url,
      plan_id: plan.id,
      model,
      allowed_models: plan.allowedModels,
      key_limit_usd: plan.keyLimitUsd,
      limit_reset: plan.limitReset,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create checkout session';
    return jsonResponse(500, { error: message });
  }
});

const resolvePaidProvisioningSession = async (stripe: Stripe, sessionId: string) => {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (!isPaidCheckoutSession(session)) {
    throw new Error('Checkout session not paid');
  }
  if (session.mode !== 'subscription') {
    throw new Error('Expected subscription checkout session');
  }

  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : (session.subscription as Stripe.Subscription | null)?.id || '';
  if (!subscriptionId) {
    throw new Error('Missing subscription on checkout session');
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  return { session, subscription };
};

const issueOpenRouterKeyForSubscription = async (args: {
  stripe: Stripe;
  subscription: Stripe.Subscription;
  session: Stripe.Checkout.Session | null;
  allowReplace: boolean;
}) => {
  const { stripe, session, allowReplace } = args;
  let subscription = args.subscription;
  const existingHash = asString(subscription.metadata?.openrouter_key_hash);
  if (!allowReplace && existingHash) {
    return {
      alreadyProvisionedHash: existingHash,
    } as const;
  }

  if (!isSubscriptionEnabled(subscription.status)) {
    throw new Error('Subscription is not active. Reactivate billing, then retry key issuance.');
  }

  const { runtime, plan, model } = resolveProvisioningSelection(subscription, session);
  const createdKey = await createManagedOpenRouterKey({
    name: `parchi-sub-${subscription.id}`,
    limitUsd: plan.keyLimitUsd,
    limitReset: plan.limitReset,
  });
  const recovery = await createRecoveryTokenForSubscription(subscription.id);

  let guardrailId = '';
  try {
    if (runtime.enforceModelGuardrail && plan.allowedModels.length > 0) {
      guardrailId = await ensureAllowedModelsGuardrail({
        planId: plan.id,
        allowedModels: plan.allowedModels,
        enforceZdr: runtime.enforceZdr,
      });
      await assignKeyToGuardrail(guardrailId, createdKey.hash);
    }

    subscription = await stripe.subscriptions.retrieve(subscription.id);
    const refreshedExistingHash = asString(subscription.metadata?.openrouter_key_hash);
    if (!allowReplace && refreshedExistingHash) {
      await setManagedOpenRouterKeyDisabled(createdKey.hash, true).catch(() => {});
      return {
        alreadyProvisionedHash: refreshedExistingHash,
      } as const;
    }

    await stripe.subscriptions.update(subscription.id, {
      metadata: {
        ...subscription.metadata,
        parchi_plan_id: plan.id,
        parchi_model: model,
        parchi_allowed_models: plan.allowedModels.join(','),
        parchi_key_limit_usd: String(plan.keyLimitUsd),
        parchi_limit_reset: plan.limitReset ?? '',
        openrouter_key_hash: createdKey.hash,
        openrouter_key_label: createdKey.label || '',
        openrouter_guardrail_id: guardrailId,
        openrouter_model: model,
        openrouter_previous_key_hash: allowReplace ? refreshedExistingHash : '',
        openrouter_recovery_hash: recovery.hash,
      },
    });

    if (!isSubscriptionEnabled(subscription.status)) {
      await setManagedOpenRouterKeyDisabled(createdKey.hash, true);
    }

    if (allowReplace && refreshedExistingHash && refreshedExistingHash !== createdKey.hash) {
      await setManagedOpenRouterKeyDisabled(refreshedExistingHash, true).catch(() => {});
    }

    return {
      createdKey,
      plan,
      model,
      replacedKeyHash: allowReplace ? refreshedExistingHash : '',
      recoveryToken: recovery.token,
    } as const;
  } catch (error) {
    await setManagedOpenRouterKeyDisabled(createdKey.hash, true).catch(() => {});
    throw error;
  }
};

export const provisionOpenRouterKey = httpActionGeneric(async (_ctx, request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const stripe = getStripeClient();
  const body = await parseJsonBody(request);
  const sessionId = asString(body?.session_id);
  if (!sessionId) {
    return jsonResponse(400, { error: 'Missing session_id' });
  }

  try {
    const { session, subscription } = await resolvePaidProvisioningSession(stripe, sessionId);
    const result = await issueOpenRouterKeyForSubscription({
      stripe,
      subscription,
      session,
      allowReplace: false,
    });
    if ('alreadyProvisionedHash' in result) {
      return jsonResponse(409, {
        error: 'Already provisioned for this subscription (key secret is not stored).',
        openrouter_key_hash: result.alreadyProvisionedHash,
      });
    }

    return jsonResponse(200, {
      openrouter_api_base: OPENROUTER_API_BASE,
      openrouter_api_key: result.createdKey.key,
      recovery_token: result.recoveryToken,
      plan_id: result.plan.id,
      model: result.model,
      allowed_models: result.plan.allowedModels,
      key_limit_usd: result.plan.keyLimitUsd,
      limit_reset: result.plan.limitReset,
      note: 'Save this key now. The server does not store it and cannot show it again. If lost, regenerate with a dedicated replace flow.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provisioning failed';
    if (message.includes('Checkout session not paid')) {
      return jsonResponse(402, { error: message });
    }
    if (message.includes('Subscription is not active')) {
      return jsonResponse(402, { error: message });
    }
    if (message.includes('Expected subscription checkout session') || message.includes('Missing subscription')) {
      return jsonResponse(400, { error: message });
    }
    return jsonResponse(500, { error: message });
  }
});

export const regenerateOpenRouterKey = httpActionGeneric(async (_ctx, request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const stripe = getStripeClient();
  const body = await parseJsonBody(request);
  const sessionId = asString(body?.session_id);
  if (!sessionId) {
    return jsonResponse(400, { error: 'Missing session_id' });
  }

  try {
    const { session, subscription } = await resolvePaidProvisioningSession(stripe, sessionId);
    if (!asString(subscription.metadata?.openrouter_key_hash)) {
      return jsonResponse(400, {
        error: 'No existing OpenRouter key hash found. Provision first via /api/provision.',
      });
    }

    const result = await issueOpenRouterKeyForSubscription({
      stripe,
      subscription,
      session,
      allowReplace: true,
    });
    if ('alreadyProvisionedHash' in result) {
      return jsonResponse(500, { error: 'Unexpected regenerate state' });
    }

    return jsonResponse(200, {
      openrouter_api_base: OPENROUTER_API_BASE,
      openrouter_api_key: result.createdKey.key,
      recovery_token: result.recoveryToken,
      replaced_key_hash: result.replacedKeyHash,
      plan_id: result.plan.id,
      model: result.model,
      allowed_models: result.plan.allowedModels,
      key_limit_usd: result.plan.keyLimitUsd,
      limit_reset: result.plan.limitReset,
      note: 'Previous key has been disabled. Save this new key now; it is not stored server-side.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Regeneration failed';
    if (message.includes('Checkout session not paid')) {
      return jsonResponse(402, { error: message });
    }
    if (message.includes('Subscription is not active')) {
      return jsonResponse(402, { error: message });
    }
    if (message.includes('Expected subscription checkout session') || message.includes('Missing subscription')) {
      return jsonResponse(400, { error: message });
    }
    return jsonResponse(500, { error: message });
  }
});

export const recoverOpenRouterKey = httpActionGeneric(async (_ctx, request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const body = await parseJsonBody(request);
  const recoveryToken = asString(body?.recovery_token);
  if (!recoveryToken) {
    return jsonResponse(400, { error: 'Missing recovery_token' });
  }

  let parsedToken: { subscriptionId: string; secret: string };
  try {
    parsedToken = parseRecoveryToken(recoveryToken);
  } catch (error) {
    return jsonResponse(400, { error: (error as Error).message });
  }

  const stripe = getStripeClient();
  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(parsedToken.subscriptionId);
  } catch {
    return jsonResponse(401, { error: 'Invalid recovery token' });
  }

  const storedHash = asString(subscription.metadata?.openrouter_recovery_hash);
  if (!storedHash) {
    return jsonResponse(401, { error: 'Recovery token is not configured for this subscription' });
  }

  const providedHash = await sha256Hex(parsedToken.secret);
  if (providedHash !== storedHash) {
    return jsonResponse(401, { error: 'Invalid recovery token' });
  }

  try {
    const result = await issueOpenRouterKeyForSubscription({
      stripe,
      subscription,
      session: null,
      allowReplace: true,
    });
    if ('alreadyProvisionedHash' in result) {
      return jsonResponse(500, { error: 'Unexpected recovery state' });
    }

    return jsonResponse(200, {
      openrouter_api_base: OPENROUTER_API_BASE,
      openrouter_api_key: result.createdKey.key,
      recovery_token: result.recoveryToken,
      replaced_key_hash: result.replacedKeyHash,
      plan_id: result.plan.id,
      model: result.model,
      allowed_models: result.plan.allowedModels,
      key_limit_usd: result.plan.keyLimitUsd,
      limit_reset: result.plan.limitReset,
      note: 'Recovery complete. Previous key is disabled and recovery token is rotated.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Recovery failed';
    if (message.includes('Subscription is not active')) {
      return jsonResponse(402, { error: message });
    }
    return jsonResponse(500, { error: message });
  }
});

const CREDIT_PACKAGES_CENTS = [500, 1500, 5000] as const;

const isPaidCheckoutSession = (session: Stripe.Checkout.Session) => {
  const paymentStatus = String(session.payment_status || '').toLowerCase();
  const status = String(session.status || '').toLowerCase();
  return paymentStatus === 'paid' || status === 'complete';
};

const applyCreditCheckoutSession = async (ctx: ActionCtx, session: Stripe.Checkout.Session, stripeEventId?: string) => {
  const metadataUserId = toUserId(session.metadata?.userId);
  const creditAmountCents = Number(session.metadata?.creditAmountCents || 0);
  if (!metadataUserId || creditAmountCents <= 0 || !session.id) {
    return { applied: false, reason: 'missing-credit-metadata' as const };
  }
  if (!isPaidCheckoutSession(session)) {
    return { applied: false, reason: 'session-not-paid' as const };
  }

  const result = await ctx.runMutation(anyApi.subscriptions.applyCreditCheckoutSession, {
    userId: metadataUserId,
    stripeCheckoutSessionId: session.id,
    amountCents: creditAmountCents,
    stripeEventId,
  });
  return {
    applied: Boolean(result?.applied),
    reason: result?.alreadyApplied ? ('already-applied' as const) : ('applied' as const),
  };
};

export const createCreditCheckoutSession = actionGeneric(async (ctx, args: { packageCents: number }) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Unauthorized');

  const packageCents = Number(args.packageCents);
  if (!CREDIT_PACKAGES_CENTS.includes(packageCents as (typeof CREDIT_PACKAGES_CENTS)[number])) {
    throw new Error(
      `Invalid credit package. Choose from: ${CREDIT_PACKAGES_CENTS.map((c) => `$${c / 100}`).join(', ')}`,
    );
  }

  const stripe = getStripeClient();
  const user = await ctx.runQuery(anyApi.users.me, {});
  const existing = await ctx.runQuery(anyApi.subscriptions.getByUserId, { userId });

  let customerId = existing?.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user?.email || undefined,
      metadata: { convexUserId: String(userId) },
    });
    customerId = customer.id;
  }

  const siteUrl = baseSiteUrl();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: packageCents,
          product_data: {
            name: `Parchi Credits — $${(packageCents / 100).toFixed(0)}`,
          },
        },
        quantity: 1,
      },
    ],
    success_url: `${siteUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/billing/cancel`,
    metadata: {
      userId: String(userId),
      creditAmountCents: String(packageCents),
    },
  });

  // Ensure a subscription record exists so the webhook can find it
  if (!existing) {
    await ctx.runMutation(anyApi.subscriptions.upsertForUser, {
      userId,
      plan: 'free',
      status: 'inactive',
      stripeCustomerId: customerId,
    });
  } else if (!existing.stripeCustomerId) {
    await ctx.runMutation(anyApi.subscriptions.upsertForUser, {
      userId,
      plan: existing.plan || 'free',
      status: existing.status || 'inactive',
      stripeCustomerId: customerId,
      stripeSubscriptionId: existing.stripeSubscriptionId,
      currentPeriodEnd: existing.currentPeriodEnd,
    });
  }

  return { id: session.id, url: session.url };
});

export const manageSubscription = actionGeneric(async (ctx) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Unauthorized');

  const stripe = getStripeClient();
  const existing = await ctx.runQuery(anyApi.subscriptions.getByUserId, { userId });

  if (!existing?.stripeCustomerId) {
    return ctx.runAction(anyApi.payments.createCheckoutSession, {});
  }

  const siteUrl = baseSiteUrl();
  const portal = await stripe.billingPortal.sessions.create({
    customer: existing.stripeCustomerId,
    return_url: `${siteUrl}/billing`,
  });

  return { url: portal.url };
});

export const reconcileCreditPurchases = actionGeneric({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Unauthorized');

    const existing = await ctx.runQuery(anyApi.subscriptions.getByUserId, { userId });
    const customerId = String(existing?.stripeCustomerId || '').trim();
    if (!customerId) {
      return { reconciled: 0, scanned: 0, skipped: 0, reason: 'missing-customer' as const };
    }

    const stripe = getStripeClient();
    const sessions = await stripe.checkout.sessions.list({
      customer: customerId,
      limit: 25,
    });

    let reconciled = 0;
    let skipped = 0;
    for (const session of sessions.data) {
      const metadataUserId = String(session.metadata?.userId || '');
      const creditAmountCents = Number(session.metadata?.creditAmountCents || 0);
      if (metadataUserId !== String(userId) || creditAmountCents <= 0) {
        skipped += 1;
        continue;
      }
      const result = await applyCreditCheckoutSession(ctx, session);
      if (result.applied) {
        reconciled += 1;
      } else {
        skipped += 1;
      }
    }

    return {
      reconciled,
      scanned: sessions.data.length,
      skipped,
    };
  },
});

const syncOpenRouterKeyStatusFromSubscription = async (subscription: Stripe.Subscription) => {
  const keyHash = asString(subscription.metadata?.openrouter_key_hash);
  if (!keyHash) return;

  const shouldEnable = isSubscriptionEnabled(subscription.status);
  await setManagedOpenRouterKeyDisabled(keyHash, !shouldEnable);
};

export const stripeWebhook = httpActionGeneric(async (ctx, request) => {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return new Response('Missing STRIPE_WEBHOOK_SECRET', { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing stripe-signature', { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid webhook signature';
    return new Response(message, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadataUserId = String(session.metadata?.userId || '');

      const creditApplyResult = await applyCreditCheckoutSession(ctx, session, event.id);
      if (!creditApplyResult.applied && creditApplyResult.reason === 'missing-credit-metadata' && metadataUserId) {
        // Subscription checkout — existing flow
        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : (session.subscription as Stripe.Subscription | null)?.id;
        const customerId =
          typeof session.customer === 'string' ? session.customer : (session.customer as Stripe.Customer | null)?.id;
        let periodEnd: number | undefined;
        let status: 'active' | 'canceled' | 'past_due' | 'inactive' = 'active';
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          status = mapStripeStatus(subscription.status);
          periodEnd = subscriptionCurrentPeriodEndMs(subscription);
        }
        const checkoutUserId = toUserId(metadataUserId);
        if (checkoutUserId) {
          await ctx.runMutation(anyApi.subscriptions.upsertForUser, {
            userId: checkoutUserId,
            plan: 'pro',
            status,
            stripeCustomerId: customerId || undefined,
            stripeSubscriptionId: subscriptionId || undefined,
            currentPeriodEnd: periodEnd,
          });
        }
      }
    }

    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      await syncOpenRouterKeyStatusFromSubscription(subscription);

      const existingBySubscription = subscription.id
        ? await ctx.runQuery(anyApi.subscriptions.getByStripeSubscriptionId, {
            stripeSubscriptionId: subscription.id,
          })
        : null;
      const customerId = String(subscription.customer || '');
      const existingByCustomer = customerId
        ? await ctx.runQuery(anyApi.subscriptions.getByStripeCustomerId, {
            stripeCustomerId: customerId,
          })
        : null;
      const webhookUserId =
        existingBySubscription?.userId || existingByCustomer?.userId || toUserId(subscription.metadata?.userId);

      if (webhookUserId) {
        const mappedStatus = mapStripeStatus(subscription.status);
        const mappedPlan = mappedStatus === 'active' ? 'pro' : 'free';
        await ctx.runMutation(anyApi.subscriptions.upsertForUser, {
          userId: webhookUserId,
          plan: mappedPlan,
          status: mappedStatus,
          stripeCustomerId: customerId || undefined,
          stripeSubscriptionId: subscription.id || undefined,
          currentPeriodEnd: subscriptionCurrentPeriodEndMs(subscription),
        });
      }
    }

    return new Response('ok', { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook handler error';
    console.error('[stripeWebhook] processing failed', message);
    return new Response(message, { status: 500 });
  }
});
