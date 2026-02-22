import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

type StoredAuth = {
  convexAccessToken?: string;
  convexRefreshToken?: string;
  convexTokenExpiresAt?: number;
};

type AuthTokens = {
  token: string;
  refreshToken: string;
};

type AuthSignInResult = {
  tokens?: AuthTokens | null;
  redirect?: string;
  started?: boolean;
  verifier?: string;
};

const STORAGE_KEYS = {
  accessToken: 'convexAccessToken',
  refreshToken: 'convexRefreshToken',
  expiresAt: 'convexTokenExpiresAt',
  userId: 'convexUserId',
  userEmail: 'convexUserEmail',
  subscriptionPlan: 'convexSubscriptionPlan',
  subscriptionStatus: 'convexSubscriptionStatus',
  subscriptionCurrentPeriodEnd: 'convexSubscriptionCurrentPeriodEnd',
  subscriptionCheckedAt: 'convexSubscriptionCheckedAt',
  creditBalanceCents: 'convexCreditBalanceCents',
  convexUrl: 'convexUrl',
} as const;

export const CONVEX_DEPLOYMENT_URL = String(typeof __CONVEX_URL__ === 'string' ? __CONVEX_URL__ : '').trim();

let runtimeConvexUrl = CONVEX_DEPLOYMENT_URL;
export let convexClient = runtimeConvexUrl ? new ConvexHttpClient(runtimeConvexUrl) : null;

const resolveStoredConvexUrl = async () => {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.convexUrl]);
  return String(stored?.[STORAGE_KEYS.convexUrl] || '').trim();
};

const ensureClient = async () => {
  if (convexClient) return convexClient;
  if (!runtimeConvexUrl) {
    runtimeConvexUrl = await resolveStoredConvexUrl();
  }
  if (!runtimeConvexUrl) {
    throw new Error('Convex backend is not configured. Set CONVEX_URL in .env.local or storage.');
  }
  convexClient = new ConvexHttpClient(runtimeConvexUrl);
  return convexClient;
};

const decodeJwtExpiryMs = (token: string): number => {
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return Date.now() + 45 * 60 * 1000;
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    const expSeconds = Number(payload?.exp || 0);
    if (!Number.isFinite(expSeconds) || expSeconds <= 0) return Date.now() + 45 * 60 * 1000;
    return expSeconds * 1000;
  } catch {
    return Date.now() + 45 * 60 * 1000;
  }
};

const applyAuthTokenToClient = (token?: string) => {
  if (!convexClient) return;
  if (token) {
    convexClient.setAuth(token);
  } else {
    convexClient.clearAuth();
  }
};

const setStorageDefaults = async () => {
  const url = runtimeConvexUrl || (convexClient ? convexClient.url : '');
  if (!url) return;
  await chrome.storage.local.set({
    [STORAGE_KEYS.convexUrl]: url,
  });
};

const readStoredAuth = async (): Promise<StoredAuth> => {
  const stored = (await chrome.storage.local.get([
    STORAGE_KEYS.accessToken,
    STORAGE_KEYS.refreshToken,
    STORAGE_KEYS.expiresAt,
  ])) as StoredAuth;
  return stored;
};

const saveAuthTokens = async (tokens: AuthTokens) => {
  const expiresAt = decodeJwtExpiryMs(tokens.token);
  await chrome.storage.local.set({
    [STORAGE_KEYS.accessToken]: tokens.token,
    [STORAGE_KEYS.refreshToken]: tokens.refreshToken,
    [STORAGE_KEYS.expiresAt]: expiresAt,
  });
  applyAuthTokenToClient(tokens.token);
};

const clearAuthStorage = async () => {
  await chrome.storage.local.remove([
    STORAGE_KEYS.accessToken,
    STORAGE_KEYS.refreshToken,
    STORAGE_KEYS.expiresAt,
    STORAGE_KEYS.userId,
    STORAGE_KEYS.userEmail,
    STORAGE_KEYS.subscriptionPlan,
    STORAGE_KEYS.subscriptionStatus,
    STORAGE_KEYS.subscriptionCurrentPeriodEnd,
    STORAGE_KEYS.subscriptionCheckedAt,
    STORAGE_KEYS.creditBalanceCents,
  ]);
  applyAuthTokenToClient(undefined);
};

const maybePersistAuthResult = async (result: AuthSignInResult | null | undefined) => {
  if (result?.tokens?.token && result?.tokens?.refreshToken) {
    await saveAuthTokens(result.tokens);
  }
};

const refreshAccessTokenIfNeeded = async () => {
  if (!convexClient) return;
  const stored = await readStoredAuth();
  const accessToken = stored.convexAccessToken;
  if (!accessToken) {
    applyAuthTokenToClient(undefined);
    return;
  }

  const expiresAt = Number(stored.convexTokenExpiresAt || 0);
  if (Number.isFinite(expiresAt) && expiresAt > Date.now() + 60_000) {
    applyAuthTokenToClient(accessToken);
    return;
  }

  const refreshToken = stored.convexRefreshToken;
  if (!refreshToken) {
    applyAuthTokenToClient(accessToken);
    return;
  }

  try {
    const refreshed = (await convexClient.action(anyApi.auth.signIn, {
      refreshToken,
    })) as AuthSignInResult;
    await maybePersistAuthResult(refreshed);
  } catch {
    applyAuthTokenToClient(accessToken);
  }
};

const syncAccountSnapshotToStorage = async (user: any, subscription: any) => {
  await chrome.storage.local.set({
    [STORAGE_KEYS.userId]: user?._id || '',
    [STORAGE_KEYS.userEmail]: user?.email || '',
    [STORAGE_KEYS.subscriptionPlan]: subscription?.plan || 'free',
    [STORAGE_KEYS.subscriptionStatus]: subscription?.status || 'inactive',
    [STORAGE_KEYS.subscriptionCurrentPeriodEnd]: subscription?.currentPeriodEnd || null,
    [STORAGE_KEYS.subscriptionCheckedAt]: Date.now(),
    [STORAGE_KEYS.creditBalanceCents]: subscription?.creditBalanceCents ?? 0,
  });
};

const ensureAuthReady = async () => {
  await ensureClient();
  await setStorageDefaults();
  await refreshAccessTokenIfNeeded();
};

export const chromeTokenStorage = {
  async get() {
    return readStoredAuth();
  },
  async clear() {
    await clearAuthStorage();
  },
};

export async function signInWithPassword(email: string, password: string) {
  await ensureAuthReady();
  const client = await ensureClient();
  const result = (await client.action(anyApi.auth.signIn, {
    provider: 'password',
    params: { flow: 'signIn', email, password },
  })) as AuthSignInResult;
  await maybePersistAuthResult(result);
  return result;
}

export async function signUpWithPassword(email: string, password: string) {
  await ensureAuthReady();
  const client = await ensureClient();
  const result = (await client.action(anyApi.auth.signIn, {
    provider: 'password',
    params: { flow: 'signUp', email, password },
  })) as AuthSignInResult;
  await maybePersistAuthResult(result);
  return result;
}

export async function signInWithOAuth(provider: 'google' | 'github') {
  await ensureAuthReady();
  const client = await ensureClient();
  const result = (await client.action(anyApi.auth.signIn, {
    provider,
    params: {
      redirectTo: `https://parchi.ai/billing/success`,
    },
  })) as AuthSignInResult;
  await maybePersistAuthResult(result);
  return result;
}

export async function signOutAccount() {
  await ensureAuthReady();
  const client = await ensureClient();
  await client.action(anyApi.auth.signOut, {});
  await clearAuthStorage();
}

export async function getSubscription() {
  await ensureAuthReady();
  const client = await ensureClient();
  return client.query(anyApi.subscriptions.getCurrent, {});
}

export async function getAuthState() {
  await ensureAuthReady();
  const client = await ensureClient();
  const authenticated = await client.query(anyApi.auth.isAuthenticated, {});
  if (!authenticated) {
    await clearAuthStorage();
    return { authenticated: false, user: null, subscription: null };
  }
  const [user, subscription] = await Promise.all([
    client.query(anyApi.users.me, {}),
    client.query(anyApi.subscriptions.getCurrent, {}),
  ]);
  await syncAccountSnapshotToStorage(user, subscription);
  return { authenticated: true, user, subscription };
}

export async function createCheckoutSession() {
  await ensureAuthReady();
  const client = await ensureClient();
  return client.action(anyApi.payments.createCheckoutSession, {});
}

export async function manageSubscription() {
  await ensureAuthReady();
  const client = await ensureClient();
  return client.action(anyApi.payments.manageSubscription, {});
}

export const hasActiveSubscription = (subscription: any) =>
  Boolean(subscription && subscription.plan === 'pro' && subscription.status === 'active');

export const hasCreditBalance = (subscription: any) =>
  Number(subscription?.creditBalanceCents ?? 0) > 0;

export async function getCreditBalance() {
  await ensureAuthReady();
  const client = await ensureClient();
  return client.query(anyApi.subscriptions.getBalance, {});
}

export async function createCreditCheckout(packageCents: number) {
  await ensureAuthReady();
  const client = await ensureClient();
  return client.action(anyApi.payments.createCreditCheckoutSession, { packageCents });
}
