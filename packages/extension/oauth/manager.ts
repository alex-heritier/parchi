import { refreshAuthCodeTokens, runAuthCodePkceFlow } from './flow-auth-code.js';
import {
  type DeviceCodeFlowCallbacks,
  refreshCopilotToken,
  refreshQwenToken,
  runDeviceCodeFlow,
} from './flow-device-code.js';
import { OAUTH_PROVIDERS } from './providers.js';
import {
  disconnectProvider,
  getProviderState,
  saveProviderTokens,
  setProviderError,
  updateProviderTokens,
} from './store.js';
import type { DeviceCodeResponse, OAuthProviderKey, OAuthProviderState, OAuthTokenSet } from './types.js';

export type { OAuthProviderKey, OAuthProviderState, OAuthTokenSet, DeviceCodeResponse };
export { OAUTH_PROVIDERS } from './providers.js';
export { getAllProviderStates, getConnectedProviders } from './store.js';

const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const activeFlows = new Map<string, AbortController>();

export function getProviderConfig(key: OAuthProviderKey) {
  return OAUTH_PROVIDERS[key] || null;
}

export async function connectProvider(
  key: OAuthProviderKey,
  callbacks?: {
    onDeviceCode?: (response: DeviceCodeResponse) => void;
  },
): Promise<OAuthTokenSet> {
  const config = OAUTH_PROVIDERS[key];
  if (!config) throw new Error(`Unknown OAuth provider: ${key}`);

  // Cancel any active flow for this provider
  const existing = activeFlows.get(key);
  if (existing) existing.abort();

  const controller = new AbortController();
  activeFlows.set(key, controller);

  try {
    let tokens: OAuthTokenSet;

    if (config.flowType === 'authorization_code_pkce') {
      tokens = await runAuthCodePkceFlow(config, controller.signal);
    } else {
      const deviceCallbacks: DeviceCodeFlowCallbacks = {
        onDeviceCode: (response) => callbacks?.onDeviceCode?.(response),
      };
      tokens = await runDeviceCodeFlow(config, deviceCallbacks, controller.signal);
    }

    await saveProviderTokens(key, tokens);
    return tokens;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!controller.signal.aborted) {
      await setProviderError(key, message);
    }
    throw error;
  } finally {
    activeFlows.delete(key);
  }
}

export function cancelConnection(key: OAuthProviderKey): void {
  const controller = activeFlows.get(key);
  if (controller) {
    controller.abort();
    activeFlows.delete(key);
  }
}

export async function disconnect(key: OAuthProviderKey): Promise<void> {
  cancelConnection(key);
  await disconnectProvider(key);
}

/**
 * Get a valid access token for a provider, refreshing if needed.
 * Returns null if the provider is not connected.
 */
export async function getAccessToken(key: OAuthProviderKey): Promise<string | null> {
  const state = await getProviderState(key);
  if (!state?.connected || !state.tokens) return null;

  const tokens = state.tokens;
  const isExpired = tokens.expiresAt && tokens.expiresAt - Date.now() < TOKEN_REFRESH_MARGIN_MS;

  if (!isExpired) return tokens.accessToken;

  // Token is expired or about to expire -- refresh
  try {
    const config = OAUTH_PROVIDERS[key];
    if (!config) return null;

    if (key === 'copilot' && tokens.refreshToken) {
      const refreshed = await refreshCopilotToken(tokens.refreshToken);
      await updateProviderTokens(key, {
        accessToken: refreshed.accessToken,
        expiresAt: refreshed.expiresAt,
      });
      return refreshed.accessToken;
    }

    if (key === 'qwen' && tokens.refreshToken) {
      const refreshed = await refreshQwenToken(config, tokens.refreshToken);
      await updateProviderTokens(key, {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt,
        resourceUrl: refreshed.resourceUrl,
      });
      return refreshed.accessToken;
    }

    if ((key === 'claude' || key === 'codex') && tokens.refreshToken) {
      const refreshed = await refreshAuthCodeTokens(config, tokens.refreshToken);
      await updateProviderTokens(key, {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken || tokens.refreshToken,
        expiresAt: refreshed.expiresAt,
      });
      return refreshed.accessToken;
    }

    // No refresh mechanism available
    return tokens.accessToken;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setProviderError(key, `Token refresh failed: ${message}`);
    return null;
  }
}

/**
 * Get the API base URL for a provider. Qwen uses a dynamic URL from the token response.
 */
export async function getApiBaseUrl(key: OAuthProviderKey): Promise<string | null> {
  const config = OAUTH_PROVIDERS[key];
  if (!config) return null;

  if (key === 'qwen') {
    const state = await getProviderState(key);
    return state?.tokens?.resourceUrl || config.apiBaseUrl || null;
  }

  return config.apiBaseUrl || null;
}

const MODEL_FETCH_TIMEOUT = 8000;

/**
 * Fetch available models from an OAuth provider's API using the stored access token.
 * Returns model IDs, or falls back to static list on failure.
 */
export async function fetchProviderModels(key: OAuthProviderKey): Promise<string[]> {
  const config = OAUTH_PROVIDERS[key];
  if (!config) return [];

  const accessToken = await getAccessToken(key);
  if (!accessToken) return config.models.map((m) => m.id);

  try {
    let models: string[] = [];

    if (key === 'claude') {
      models = await fetchAnthropicModels(accessToken, config.apiBaseUrl);
    } else if (key === 'codex') {
      models = await fetchOpenAIModels(accessToken);
    } else if (key === 'copilot') {
      models = await fetchCopilotModels(accessToken, config.apiBaseUrl, config.apiHeaders);
    } else if (key === 'qwen') {
      const apiBase = await getApiBaseUrl(key);
      if (apiBase) {
        models = await fetchOpenAICompatibleModels(accessToken, apiBase);
      }
    }

    if (models.length === 0) {
      return config.models.map((m) => m.id);
    }
    return models;
  } catch (err) {
    console.warn(`[OAuth] Failed to fetch models for ${key}:`, err);
    return config.models.map((m) => m.id);
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_FETCH_TIMEOUT);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Anthropic: GET https://api.anthropic.com/v1/models
 * Auth: X-Api-Key header (OAuth token used as API key)
 * Paginated: has_more + last_id, use limit=1000 to minimize pages
 */
async function fetchAnthropicModels(token: string, baseUrl: string): Promise<string[]> {
  const base = baseUrl.replace(/\/+$/, '');
  const allIds: string[] = [];
  let afterId: string | undefined;

  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams({ limit: '1000' });
    if (afterId) params.set('after_id', afterId);
    const url = `${base}/v1/models?${params.toString()}`;

    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'X-Api-Key': token,
        'anthropic-version': '2023-06-01',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`[OAuth] Anthropic /v1/models returned ${response.status}`);
      break;
    }

    const data = await response.json();
    const ids = extractModelIds(data);
    allIds.push(...ids);

    if (!data.has_more || !data.last_id) break;
    afterId = data.last_id;
  }

  return allIds;
}

/**
 * OpenAI (Codex OAuth): GET https://api.openai.com/v1/models
 * Auth: Authorization: Bearer {token}
 */
async function fetchOpenAIModels(token: string): Promise<string[]> {
  const url = 'https://api.openai.com/v1/models';
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    console.warn(`[OAuth] OpenAI /v1/models returned ${response.status}`);
    return [];
  }
  const data = await response.json();
  return extractModelIds(data);
}

/**
 * GitHub Copilot: GET https://api.githubcopilot.com/models
 * Auth: Authorization: Bearer {copilot JWT}
 * Requires Copilot-specific headers (User-Agent, Editor-Version, etc.)
 */
async function fetchCopilotModels(
  token: string,
  baseUrl: string,
  apiHeaders?: Record<string, string>,
): Promise<string[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/models`;
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(apiHeaders || {}),
    },
  });
  if (!response.ok) {
    console.warn(`[OAuth] Copilot /models returned ${response.status}`);
    return [];
  }
  const data = await response.json();
  return extractModelIds(data);
}

/**
 * Qwen or other OpenAI-compatible: try /models then /v1/models
 */
async function fetchOpenAICompatibleModels(token: string, baseUrl: string): Promise<string[]> {
  const base = baseUrl.replace(/\/+$/, '');
  const urls = base.endsWith('/v1') ? [`${base}/models`] : [`${base}/models`, `${base}/v1/models`];
  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
      if (!response.ok) continue;
      const data = await response.json();
      const ids = extractModelIds(data);
      if (ids.length > 0) return ids;
    } catch {}
  }
  return [];
}

function extractModelIds(payload: any): string[] {
  if (!payload) return [];
  const source = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : Array.isArray(payload)
        ? payload
        : [];
  return source
    .map((entry: any) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry.id === 'string') return entry.id;
      if (entry && typeof entry.name === 'string') return entry.name;
      return '';
    })
    .map((id: string) => id.trim())
    .filter((id: string) => id.length > 0);
}
