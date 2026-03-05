import { RelayBridge } from '../../relay/relay-bridge.js';
import { getActiveTab } from '../../utils/active-tab.js';
import { getRuntimeFeatureFlags } from '../browser-compat.js';
import { isVisionModelProfile, resolveProfile, resolveTeamProfiles } from '../model-profiles.js';
import { checkToolPermission } from '../tool-permissions.js';
import type { ServiceContext } from '../service-context.js';

export type RelayRpcHandler = (params: unknown) => Promise<unknown>;

export function createRelayBridge(ctx: ServiceContext): RelayBridge {
  return new RelayBridge({
    getHelloPayload: async () => {
      const manifest = chrome.runtime.getManifest();
      const stored = await chrome.storage.local.get(['relayAgentId']);
      let agentId = typeof stored.relayAgentId === 'string' ? stored.relayAgentId : '';
      if (!agentId) {
        agentId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        await chrome.storage.local.set({ relayAgentId: agentId });
      }
      return {
        agentId,
        name: 'parchi-extension',
        version: String(manifest.version || ''),
        browser: getRuntimeFeatureFlags().browser,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        capabilities: { tools: true, agentRun: true },
      };
    },
    onRequest: async (req) => handleRelayRpc(ctx, req.method, req.params),
    onStatus: (status) => {
      if (!status.connected) scheduleRelayAutoPairCheck(ctx);
      clearTimeout(ctx._relayStatusTimer);
      ctx._relayStatusTimer = setTimeout(() => {
        const payload: Record<string, any> = { relayConnected: !!status.connected };
        if (status.connected) payload.relayLastConnectedAt = Date.now();
        if (status.lastError !== undefined) payload.relayLastError = status.lastError;
        chrome.storage.local.set(payload).catch(() => {});
      }, 500);
    },
  });
}

export function buildRelayRpcHandlers(ctx: ServiceContext): Record<string, RelayRpcHandler> {
  return {
    'tools.list': (params) => handleRelayToolsList(ctx, params),
    'tool.call': (params) => handleRelayToolCall(ctx, params),
    'session.setTabs': (params) => handleRelaySessionSetTabs(ctx, params),
    'settings.get': (params) => handleRelaySettingsGet(params),
    'settings.set': (params) => handleRelaySettingsSet(params),
    'agent.run': (params) => handleRelayAgentRun(ctx, params),
  };
}

export async function handleRelayRpc(ctx: ServiceContext, method: string, params: unknown) {
  const handlers = buildRelayRpcHandlers(ctx);
  const handler = handlers[method];
  if (!handler) {
    throw new Error(`Unknown method: ${method}`);
  }
  return await handler(params);
}

export function createApplyRelayConfig(ctx: ServiceContext) {
  let applying = false;
  return async () => {
    if (applying) return;
    applying = true;
    try {
      const stored = await chrome.storage.local.get(['relayEnabled', 'relayUrl', 'relayToken']);
      const enabled = stored.relayEnabled === true || stored.relayEnabled === 'true';
      const url = typeof stored.relayUrl === 'string' ? stored.relayUrl.trim() : '';
      const token = typeof stored.relayToken === 'string' ? stored.relayToken.trim() : '';
      if (enabled && (!url || !token)) {
        await chrome.storage.local
          .set({ relayConnected: false, relayLastError: 'Missing relay URL or token' })
          .catch(() => {});
      }
      if (enabled && url && token) {
        await ensureRelayKeepalive();
      } else {
        await closeRelayKeepalive();
      }
      ctx.relay.configure({ enabled, url, token });
    } finally {
      applying = false;
    }
  };
}

export async function initRelay(ctx: ServiceContext, applyRelayConfig: () => Promise<void>) {
  try {
    await applyRelayConfig();
  } catch (err) {
    console.warn('[relay] init failed:', err);
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    const relayKeys = ['relayEnabled', 'relayUrl', 'relayToken'];
    if (!relayKeys.some((k) => k in changes)) return;
    void applyRelayConfig();
  });

  tryNativeMessagingPair();
  scheduleRelayAutoPairCheck(ctx, 800);
}

export function scheduleRelayAutoPairCheck(ctx: ServiceContext, delayMs = 1500) {
  clearTimeout(ctx._relayAutoPairTimer);
  ctx._relayAutoPairTimer = setTimeout(
    () => {
      ctx._relayAutoPairTimer = undefined;
      void tryLoopbackHttpPair(ctx);
    },
    Math.max(0, delayMs),
  );
}

function isLoopbackHost(hostname: string) {
  const value = String(hostname || '').toLowerCase();
  return value === '127.0.0.1' || value === 'localhost' || value === '::1';
}

function toRelayHttpOrigin(rawUrl: string) {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'http:' &&
      parsed.protocol !== 'https:' &&
      parsed.protocol !== 'ws:' &&
      parsed.protocol !== 'wss:'
    ) {
      return '';
    }
    parsed.protocol = parsed.protocol === 'https:' || parsed.protocol === 'wss:' ? 'https:' : 'http:';
    parsed.pathname = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.origin;
  } catch {
    return '';
  }
}

async function fetchLoopbackPairToken(origin: string): Promise<string> {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), 1_500);
  try {
    const res = await fetch(`${origin}/v1/pair`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) return '';
    const data = await res.json().catch(() => null);
    const token = typeof data?.token === 'string' ? data.token.trim() : '';
    return token;
  } catch {
    return '';
  } finally {
    clearTimeout(timerId);
  }
}

async function tryLoopbackHttpPair(_ctx: ServiceContext) {
  const stored = await chrome.storage.local
    .get(['relayConnected', 'relayEnabled', 'relayUrl', 'relayToken'])
    .catch(() => ({}) as Record<string, any>);
  if (stored.relayConnected === true) return;
  if (stored.relayEnabled === false || stored.relayEnabled === 'false') return;

  const configuredOrigin = toRelayHttpOrigin(typeof stored.relayUrl === 'string' ? stored.relayUrl : '');
  const candidates: string[] = [];
  if (configuredOrigin) {
    const host = (() => {
      try {
        return new URL(configuredOrigin).hostname;
      } catch {
        return '';
      }
    })();
    if (isLoopbackHost(host)) candidates.push(configuredOrigin);
    else return;
  } else {
    candidates.push('http://127.0.0.1:17373');
  }

  const existingToken = typeof stored.relayToken === 'string' ? stored.relayToken.trim() : '';
  for (const origin of candidates) {
    const token = await fetchLoopbackPairToken(origin);
    if (!token) continue;
    if (existingToken === token && configuredOrigin === origin && stored.relayEnabled === true) return;
    await chrome.storage.local
      .set({
        relayEnabled: true,
        relayUrl: origin,
        relayToken: token,
      })
      .catch(() => {});
    return;
  }
}

function tryNativeMessagingPair() {
  chrome.storage.local.get(['relayEnabled', 'relayUrl', 'relayToken'], (stored) => {
    const enabled = stored.relayEnabled === true || stored.relayEnabled === 'true';
    const hasUrl = typeof stored.relayUrl === 'string' && stored.relayUrl.trim() !== '';
    const hasToken = typeof stored.relayToken === 'string' && stored.relayToken.trim() !== '';
    if (enabled && hasUrl && hasToken) return;

    try {
      const port = chrome.runtime.connectNative('com.parchi.bridge');

      port.onMessage.addListener((msg: any) => {
        if (msg?.type === 'auth_config' && typeof msg.url === 'string' && typeof msg.token === 'string') {
          chrome.storage.local
            .set({
              relayEnabled: true,
              relayUrl: msg.url,
              relayToken: msg.token,
            })
            .catch(() => {});
        }
        port.disconnect();
      });

      port.onDisconnect.addListener(() => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.debug('[native-messaging] Not available:', err.message);
        }
      });

      port.postMessage({ type: 'hello' });
    } catch {
      // Native messaging not available
    }
  });
}

async function ensureRelayKeepalive() {
  const offscreen = (chrome as any).offscreen;
  if (!offscreen?.createDocument) return;
  try {
    const hasDoc = typeof offscreen.hasDocument === 'function' ? await offscreen.hasDocument() : false;
    if (hasDoc) return;
    await offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: [offscreen.Reason?.DOM_PARSER || 'DOM_PARSER'],
      justification: 'Keep relay WebSocket alive for the extension relay agent in MV3.',
    });
  } catch (err) {
    console.warn('[relay] offscreen keepalive failed:', err);
  }
}

async function closeRelayKeepalive() {
  const offscreen = (chrome as any).offscreen;
  if (!offscreen?.closeDocument) return;
  try {
    const hasDoc = typeof offscreen.hasDocument === 'function' ? await offscreen.hasDocument() : false;
    if (!hasDoc) return;
    await offscreen.closeDocument();
  } catch (err) {
    // Ignore
  }
}

function validateRelayRunParams(params: unknown) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new Error('agent.run: params must be an object');
  }

  const promptRaw = (params as any).prompt;
  const prompt = typeof promptRaw === 'string' ? promptRaw.trim() : '';
  if (!prompt) {
    throw new Error('agent.run: missing prompt');
  }
  if (prompt.length > 20_000) {
    throw new Error('agent.run: prompt too large (max 20,000 chars)');
  }

  const sessionIdRaw = (params as any).sessionId;
  const sessionId =
    typeof sessionIdRaw === 'string' && sessionIdRaw.trim() ? sessionIdRaw.trim() : `session-${Date.now()}`;
  if (sessionId.length > 120) {
    throw new Error('agent.run: sessionId too long (max 120 chars)');
  }
  if (!/^[a-zA-Z0-9._:-]+$/.test(sessionId)) {
    throw new Error('agent.run: sessionId contains invalid characters');
  }

  const selectedTabIdsRaw = (params as any).selectedTabIds;
  if (selectedTabIdsRaw !== undefined && !Array.isArray(selectedTabIdsRaw)) {
    throw new Error('agent.run: selectedTabIds must be an array when provided');
  }
  if (Array.isArray(selectedTabIdsRaw) && selectedTabIdsRaw.length > 25) {
    throw new Error('agent.run: selectedTabIds supports at most 25 tabs');
  }

  const selectedTabIds = Array.isArray(selectedTabIdsRaw)
    ? Array.from(
        new Set(
          selectedTabIdsRaw.map((n) => Number(n)).filter((n) => Number.isInteger(n) && Number.isFinite(n) && n > 0),
        ),
      )
    : null;

  if (
    Array.isArray(selectedTabIdsRaw) &&
    selectedTabIdsRaw.length > 0 &&
    (!selectedTabIds || selectedTabIds.length === 0)
  ) {
    throw new Error('agent.run: selectedTabIds must contain positive integer tab IDs');
  }

  return { prompt, sessionId, selectedTabIds };
}

async function handleRelayToolsList(ctx: ServiceContext, _params: unknown) {
  const settings = await chrome.storage.local.get([
    'activeConfig',
    'provider',
    'apiKey',
    'model',
    'customEndpoint',
    'extraHeaders',
    'systemPrompt',
    'configs',
    'useOrchestrator',
    'orchestratorProfile',
    'visionBridge',
    'visionProfile',
    'enableScreenshots',
    'sendScreenshotsAsImages',
    'screenshotQuality',
    'showThinking',
    'streamResponses',
    'temperature',
    'maxTokens',
    'timeout',
    'contextLimit',
    'toolPermissions',
    'allowedDomains',
  ]);
  const activeProfileName = (settings as any).activeConfig || 'default';
  const activeProfile = resolveProfile(settings as any, activeProfileName);
  const orchestratorEnabled = (settings as any).useOrchestrator === true;
  const teamProfiles = resolveTeamProfiles(settings as any);
  const visionToolsEnabled = isVisionModelProfile(activeProfile);
  return ctx.getToolsForSession(settings as any, orchestratorEnabled, teamProfiles, visionToolsEnabled);
}

async function handleRelayToolCall(ctx: ServiceContext, params: unknown) {
  const tool = typeof (params as any)?.tool === 'string' ? (params as any).tool : '';
  const sessionId =
    typeof (params as any)?.sessionId === 'string'
      ? String((params as any).sessionId)
      : ctx.currentSessionId || 'relay';
  const args = (params as any)?.args;
  if (!tool) throw new Error('tool.call: missing tool');
  const safeArgs = args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, any>) : {};
  const settings = await chrome.storage.local.get(['toolPermissions', 'allowedDomains']);
  const perm = await checkToolPermission(
    tool,
    safeArgs,
    settings,
    ctx.currentSettings,
    sessionId,
    ctx.currentSessionId,
    (id) => ctx.getBrowserTools(id),
  );
  if (!perm.allowed) {
    throw new Error(perm.reason || 'Tool blocked by policy');
  }
  return await ctx.getBrowserTools(sessionId).executeTool(tool, safeArgs);
}

async function handleRelaySessionSetTabs(ctx: ServiceContext, params: unknown) {
  const sessionId =
    typeof (params as any)?.sessionId === 'string'
      ? String((params as any).sessionId)
      : ctx.currentSessionId || 'relay';
  const ids = Array.isArray((params as any)?.tabIds) ? (params as any).tabIds : [];
  const tabIds = ids.map((n: any) => Number(n)).filter((n: any) => Number.isFinite(n) && n > 0);
  const tabs: chrome.tabs.Tab[] = [];
  for (const tabId of tabIds) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab) tabs.push(tab);
    } catch {}
  }
  await ctx.getBrowserTools(sessionId).configureSessionTabs(tabs, { title: 'Parchi', color: 'blue' });
  return { ok: true, tabIds: tabs.map((t) => t.id).filter((id): id is number => typeof id === 'number') };
}

async function handleRelaySettingsGet(params: unknown) {
  const keys = (params as any)?.keys;
  if (!Array.isArray(keys)) throw new Error('settings.get: keys must be an array');
  return await chrome.storage.local.get(keys);
}

async function handleRelaySettingsSet(params: unknown) {
  const data = (params as any)?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('settings.set: data must be an object');
  }
  await chrome.storage.local.set(data);
  return { ok: true };
}

async function handleRelayAgentRun(ctx: ServiceContext, params: unknown) {
  const { prompt, sessionId, selectedTabIds } = validateRelayRunParams(params);
  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const turnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const selectedTabs: chrome.tabs.Tab[] = [];
  if (Array.isArray(selectedTabIds) && selectedTabIds.length) {
    for (const rawId of selectedTabIds) {
      const tabId = Number(rawId);
      if (!Number.isFinite(tabId) || tabId <= 0) continue;
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab) selectedTabs.push(tab);
      } catch {}
    }
  }
  if (selectedTabs.length === 0) {
    const activeTab = await getActiveTab();
    if (activeTab) selectedTabs.push(activeTab);
  }

  void ctx.processUserMessage(prompt, [], selectedTabs, sessionId, { runId, turnId, origin: 'relay' });

  return { runId, sessionId };
}
