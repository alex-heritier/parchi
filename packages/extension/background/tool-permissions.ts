import type { BrowserTools } from '../tools/browser-tools.js';

export function getToolPermissionCategory(toolName: string) {
  const mapping = {
    navigate: 'navigate',
    openTab: 'navigate',
    click: 'interact',
    type: 'interact',
    pressKey: 'interact',
    scroll: 'interact',
    getContent: 'read',
    findHtml: 'read',
    screenshot: 'screenshots',
    watchVideo: 'screenshots',
    getVideoInfo: 'screenshots',
    getTabs: 'tabs',
    closeTab: 'tabs',
    switchTab: 'tabs',
    groupTabs: 'tabs',
    focusTab: 'tabs',
    describeSessionTabs: 'tabs',
  };
  return mapping[toolName] || null;
}

export function parseAllowedDomains(value = '') {
  return String(value)
    .split(/[\n,]/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isUrlAllowed(url: string, allowlist: string[]) {
  if (!allowlist.length) return true;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return allowlist.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch (_error) {
    return false;
  }
}

export async function resolveToolUrl(
  _toolName: string,
  args: Record<string, any>,
  sessionId: string | undefined,
  currentSessionId: string | null,
  getBrowserTools: (id: string) => BrowserTools,
) {
  if (args?.url) return args.url;
  const tools = getBrowserTools(sessionId || currentSessionId || 'default');
  const tabId = args?.tabId || tools.getCurrentSessionTabId();
  try {
    if (tabId) {
      const tab = await chrome.tabs.get(tabId);
      return tab?.url || '';
    }
  } catch (error) {
    console.warn('Failed to resolve tab URL for permissions:', error);
  }
  const [active] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return active?.url || '';
}

export async function checkToolPermission(
  toolName: string,
  args: Record<string, any>,
  settingsOverride: Record<string, any> | null | undefined,
  currentSettings: Record<string, any> | null,
  sessionId: string | undefined,
  currentSessionId: string | null,
  getBrowserTools: (id: string) => BrowserTools,
) {
  const settings = settingsOverride || currentSettings;
  if (!settings) return { allowed: true };
  const permissions = settings.toolPermissions || {};
  const category = getToolPermissionCategory(toolName);
  if (category && permissions[category] === false) {
    return {
      allowed: false,
      reason: `Permission blocked: ${category}`,
      policy: {
        type: 'permission',
        category,
        reason: `Permission blocked: ${category}`,
      },
    };
  }

  if (category === 'tabs') return { allowed: true };

  const allowlist = parseAllowedDomains(settings.allowedDomains || '');
  if (!allowlist.length) return { allowed: true };

  const targetUrl = await resolveToolUrl(toolName, args, sessionId, currentSessionId, getBrowserTools);
  if (!isUrlAllowed(targetUrl, allowlist)) {
    return {
      allowed: false,
      reason: 'Blocked by allowed domains list.',
      policy: {
        type: 'allowlist',
        domain: targetUrl,
        reason: 'Blocked by allowed domains list.',
      },
    };
  }

  return { allowed: true };
}
