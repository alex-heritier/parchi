import type { OAuthProviderKey, OAuthProviderState, OAuthTokenSet } from './types.js';

const STORAGE_KEY = 'oauthProviders';

type StoredProviders = Record<string, OAuthProviderState>;

async function readAll(): Promise<StoredProviders> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as StoredProviders) || {};
}

async function writeAll(data: StoredProviders): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

export async function getProviderState(key: OAuthProviderKey): Promise<OAuthProviderState | null> {
  const all = await readAll();
  return all[key] || null;
}

export async function getAllProviderStates(): Promise<StoredProviders> {
  return readAll();
}

export async function saveProviderTokens(key: OAuthProviderKey, tokens: OAuthTokenSet): Promise<void> {
  const all = await readAll();
  all[key] = {
    provider: key,
    connected: true,
    tokens,
    email: tokens.email,
    lastRefreshedAt: Date.now(),
  };
  await writeAll(all);
}

export async function updateProviderTokens(key: OAuthProviderKey, partial: Partial<OAuthTokenSet>): Promise<void> {
  const all = await readAll();
  const state = all[key];
  if (!state?.tokens) return;
  state.tokens = { ...state.tokens, ...partial };
  state.lastRefreshedAt = Date.now();
  await writeAll(all);
}

export async function setProviderError(key: OAuthProviderKey, error: string): Promise<void> {
  const all = await readAll();
  const existing = all[key] || { provider: key, connected: false };
  existing.connected = false;
  existing.error = error;
  all[key] = existing;
  await writeAll(all);
}

export async function disconnectProvider(key: OAuthProviderKey): Promise<void> {
  const all = await readAll();
  delete all[key];
  await writeAll(all);
}

export async function getConnectedProviders(): Promise<OAuthProviderKey[]> {
  const all = await readAll();
  return Object.values(all)
    .filter((state) => state.connected && state.tokens?.accessToken)
    .map((state) => state.provider);
}
