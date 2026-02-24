const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_OPENROUTER_MODEL = 'moonshotai/kimi-k2';

type RequestInitWithJson = RequestInit & {
  json?: unknown;
};

export type OpenRouterLimitReset = 'daily' | 'weekly' | 'monthly' | null;

type OpenRouterCreateKeyResponse = {
  data?: {
    hash?: string;
    label?: string;
  };
  key?: string;
};

type OpenRouterGuardrail = {
  id: string;
  name: string;
};

type OpenRouterListGuardrailsResponse = {
  data?: OpenRouterGuardrail[];
  total_count?: number;
};

type OpenRouterCreateGuardrailResponse = {
  data?: OpenRouterGuardrail;
};

const readBooleanEnv = (key: string, fallback: boolean) => {
  const raw = String(process.env[key] || '').trim().toLowerCase();
  if (!raw) return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
};

const readLimitResetEnv = (key: string, fallback: OpenRouterLimitReset) => {
  const raw = String(process.env[key] || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'null' || raw === 'none') return null;
  if (raw === 'daily' || raw === 'weekly' || raw === 'monthly') return raw;
  throw new Error(`Invalid ${key}. Expected daily|weekly|monthly|null`);
};

const readOpenRouterManagementKey = () => {
  const key = String(process.env.OPENROUTER_MANAGEMENT_KEY || '').trim();
  if (!key) {
    throw new Error('Missing OPENROUTER_MANAGEMENT_KEY');
  }
  return key;
};

const openRouterFetch = async <T>(path: string, init: RequestInitWithJson = {}): Promise<T> => {
  const headers: Record<string, string> = {
    authorization: `Bearer ${readOpenRouterManagementKey()}`,
    ...(init.json ? { 'content-type': 'application/json' } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };

  const response = await fetch(`${OPENROUTER_BASE_URL}${path}`, {
    ...init,
    headers,
    body: init.json ? JSON.stringify(init.json) : init.body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const detail = text ? ` ${text}` : '';
    throw new Error(`OpenRouter ${init.method || 'GET'} ${path} failed (${response.status}).${detail}`.trim());
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

export const readOpenRouterProvisioningConfig = () => {
  const defaultModel = String(process.env.OPENROUTER_DEFAULT_MODEL || DEFAULT_OPENROUTER_MODEL).trim() ||
    DEFAULT_OPENROUTER_MODEL;
  const limitUsd = Number(process.env.OPENROUTER_KEY_LIMIT_USD || 20);
  if (!Number.isFinite(limitUsd) || limitUsd <= 0) {
    throw new Error('Invalid OPENROUTER_KEY_LIMIT_USD (must be a positive number)');
  }

  return {
    defaultModel,
    limitUsd,
    limitReset: readLimitResetEnv('OPENROUTER_LIMIT_RESET', 'monthly'),
    enforceModelGuardrail: readBooleanEnv('OPENROUTER_ENFORCE_MODEL_GUARDRAIL', true),
    enforceZdr: readBooleanEnv('OPENROUTER_ENFORCE_ZDR', false),
  };
};

export const createManagedOpenRouterKey = async (args: {
  name: string;
  limitUsd: number;
  limitReset: OpenRouterLimitReset;
}) => {
  const response = await openRouterFetch<OpenRouterCreateKeyResponse>('/keys', {
    method: 'POST',
    json: {
      name: args.name,
      limit: args.limitUsd,
      limit_reset: args.limitReset,
      include_byok_in_limit: true,
    },
  });

  const hash = String(response?.data?.hash || '').trim();
  const key = String(response?.key || '').trim();
  if (!hash || !key) {
    throw new Error('OpenRouter key creation returned an incomplete response');
  }

  return {
    hash,
    key,
    label: String(response?.data?.label || '').trim(),
  };
};

export const setManagedOpenRouterKeyDisabled = async (keyHash: string, disabled: boolean) => {
  const hash = String(keyHash || '').trim();
  if (!hash) {
    throw new Error('Missing OpenRouter key hash');
  }

  await openRouterFetch(`/keys/${encodeURIComponent(hash)}`, {
    method: 'PATCH',
    json: { disabled },
  });
};

const listGuardrails = async () => {
  const all: OpenRouterGuardrail[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const response = await openRouterFetch<OpenRouterListGuardrailsResponse>(
      `/guardrails?limit=${limit}&offset=${offset}`,
      { method: 'GET' },
    );
    const page = Array.isArray(response?.data) ? response.data : [];
    all.push(...page);

    if (page.length < limit) break;
    offset += limit;
    if (offset >= 1000) break;
  }

  return all;
};

export const ensureModelGuardrail = async (model: string, enforceZdr: boolean) => {
  return ensureAllowedModelsGuardrail({
    planId: `single-${String(model || '').trim()}`,
    allowedModels: [model],
    enforceZdr,
  });
};

export const assignKeyToGuardrail = async (guardrailId: string, keyHash: string) => {
  const normalizedGuardrailId = String(guardrailId || '').trim();
  const normalizedKeyHash = String(keyHash || '').trim();
  if (!normalizedGuardrailId) throw new Error('Missing OpenRouter guardrail id');
  if (!normalizedKeyHash) throw new Error('Missing OpenRouter key hash');

  await openRouterFetch(`/guardrails/${encodeURIComponent(normalizedGuardrailId)}/assignments/keys`, {
    method: 'POST',
    json: {
      key_hashes: [normalizedKeyHash],
    },
  });
};

const normalizeAllowedModels = (models: string[]) =>
  Array.from(
    new Set(
      (Array.isArray(models) ? models : [])
        .map((model) => String(model || '').trim())
        .filter(Boolean),
    ),
  );

const buildAllowedModelsGuardrailName = (planId: string, allowedModels: string[]) => {
  const normalizedPlanId = String(planId || '').trim() || 'default';
  const modelsCsv = normalizeAllowedModels(allowedModels).join(',');
  const raw = `parchi:plan:${normalizedPlanId}:models:${modelsCsv || 'none'}`;
  return raw.length <= 200 ? raw : raw.slice(0, 200);
};

const createAllowedModelsGuardrail = async (args: {
  name: string;
  allowedModels: string[];
  enforceZdr: boolean;
}) => {
  const normalizedModels = normalizeAllowedModels(args.allowedModels);
  if (normalizedModels.length === 0) {
    throw new Error('allowedModels must contain at least one model');
  }

  const response = await openRouterFetch<OpenRouterCreateGuardrailResponse>('/guardrails', {
    method: 'POST',
    json: {
      name: args.name,
      description: `Restrict keys to models: ${normalizedModels.join(', ')}`,
      allowed_models: normalizedModels,
      allowed_providers: null,
      enforce_zdr: args.enforceZdr,
      limit_usd: null,
      reset_interval: null,
    },
  });

  const id = String(response?.data?.id || '').trim();
  if (!id) {
    throw new Error('OpenRouter guardrail creation returned no id');
  }
  return id;
};

export const ensureAllowedModelsGuardrail = async (args: {
  planId: string;
  allowedModels: string[];
  enforceZdr: boolean;
}) => {
  const normalizedModels = normalizeAllowedModels(args.allowedModels);
  if (normalizedModels.length === 0) {
    throw new Error('Model allowlist is required for guardrail enforcement');
  }

  const guardrailName = buildAllowedModelsGuardrailName(args.planId, normalizedModels);
  const existing = (await listGuardrails()).find(
    (guardrail) => String(guardrail?.name || '').trim() === guardrailName,
  );
  if (existing?.id) {
    return existing.id;
  }

  return createAllowedModelsGuardrail({
    name: guardrailName,
    allowedModels: normalizedModels,
    enforceZdr: args.enforceZdr,
  });
};
