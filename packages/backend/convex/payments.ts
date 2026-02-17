import { getAuthUserId } from '@convex-dev/auth/server';
import { actionGeneric, anyApi, httpActionGeneric } from 'convex/server';
import Stripe from 'stripe';

const baseSiteUrl = () => String(process.env.SITE_URL || 'https://example.com').replace(/\/+$/, '');

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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadataUserId = session.metadata?.userId;
    if (metadataUserId) {
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
        periodEnd = Number((subscription as any).current_period_end || 0) * 1000 || undefined;
      }
      await ctx.runMutation(anyApi.subscriptions.upsertForUser, {
        userId: metadataUserId as any,
        plan: 'pro',
        status,
        stripeCustomerId: customerId || undefined,
        stripeSubscriptionId: subscriptionId || undefined,
        currentPeriodEnd: periodEnd,
      });
    }
  }

  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const subscription = event.data.object as Stripe.Subscription;
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
    const userId = existingBySubscription?.userId || existingByCustomer?.userId || (subscription.metadata?.userId as any);

    if (userId) {
      const mappedStatus = mapStripeStatus(subscription.status);
      const mappedPlan = mappedStatus === 'active' ? 'pro' : 'free';
      await ctx.runMutation(anyApi.subscriptions.upsertForUser, {
        userId,
        plan: mappedPlan,
        status: mappedStatus,
        stripeCustomerId: customerId || undefined,
        stripeSubscriptionId: subscription.id || undefined,
        currentPeriodEnd: Number((subscription as any).current_period_end || 0) * 1000 || undefined,
      });
    }
  }

  return new Response('ok', { status: 200 });
});
