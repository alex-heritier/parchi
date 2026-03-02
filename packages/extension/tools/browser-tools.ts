import type { ToolDefinition } from '@parchi/shared';
import { getActiveTab } from '../utils/active-tab.js';
import { injectedClick } from './injected/click.js';
import { injectedType } from './injected/type.js';
import { injectedCaptureVideoFrame } from './injected/video-frame.js';
import { injectedVideoCheck } from './injected/video.js';
import { parseSelectorSpec } from './selector-spec.js';

type SessionTabSummary = {
  id: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  windowId?: number;
};

type GroupOptions = {
  title?: string;
  color?: chrome.tabGroups.ColorEnum;
};

type ActionOverlayPayload = {
  label: string;
  selector?: string;
  note?: string;
  status?: 'running' | 'done' | 'error';
  durationMs?: number;
  bringIntoView?: boolean;
};

// Maximum number of tabs allowed per session to prevent runaway tab creation
const MAX_SESSION_TABS = 5;

const DEFAULT_SESSION_GROUP: Required<GroupOptions> = {
  title: 'Parchi',
  color: 'blue',
};

const DEFAULT_WAIT_TIMEOUT_MS = 5000;
const MAX_WAIT_TIMEOUT_MS = 15_000;

type WaitTimeoutResolution = {
  timeoutMs: number;
  wasClamped: boolean;
};

const resolveWaitTimeoutMs = (rawValue: unknown): WaitTimeoutResolution => {
  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
    return {
      timeoutMs: DEFAULT_WAIT_TIMEOUT_MS,
      wasClamped: false,
    };
  }
  const normalized = Math.max(0, rawValue);
  const clamped = Math.min(normalized, MAX_WAIT_TIMEOUT_MS);
  return {
    timeoutMs: clamped,
    wasClamped: clamped !== normalized,
  };
};

export class BrowserTools {
  tools: Record<string, true>;
  private sessionTabs: Map<number, SessionTabSummary>;
  private currentSessionTabId: number | null;
  private sessionTabGroupId: number | null;
  private supportsTabGroups: boolean;
  screenshotQuality: 'high' | 'medium' | 'low' | undefined;

  constructor() {
    this.sessionTabs = new Map();
    this.currentSessionTabId = null;
    this.sessionTabGroupId = null;
    this.supportsTabGroups = typeof chrome.tabs.group === 'function' && typeof chrome.tabGroups?.update === 'function';
    this.tools = {
      navigate: true,
      openTab: true,
      click: true,
      clickAt: true,
      type: true,
      pressKey: true,
      scroll: true,
      getContent: true,
      findHtml: true,
      screenshot: true,
      getTabs: true,
      closeTab: true,
      switchTab: true,
      focusTab: true,
      groupTabs: true,
      describeSessionTabs: true,
    };
    if (!this.supportsTabGroups) {
      delete this.tools.groupTabs;
    }
  }

  getToolDefinitions(): ToolDefinition[] {
    const definitions: ToolDefinition[] = [
      {
        name: 'navigate',
        description: 'Navigate the current tab to a URL.',
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Absolute URL to visit.' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
          required: ['url'],
        },
      },
      {
        name: 'openTab',
        description: `Open a new tab with a URL. Limited to ${MAX_SESSION_TABS} tabs per session. Prefer navigating existing tabs or switching to current tabs first (use describeSessionTabs or getTabs).`,
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Absolute URL to open.' },
          },
          required: ['url'],
        },
      },
      {
        name: 'click',
        description:
          'Click an element by selector. Prefer a valid CSS selector (querySelector). Also supports simple text selectors like `text=Create note` and `button.contains("Create note")`.',
        input_schema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector to click.' },
            timeoutMs: { type: 'number', description: 'Optional wait timeout for element to appear (ms).' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
          required: ['selector'],
        },
      },
      {
        name: 'clickAt',
        description:
          'Click at exact viewport coordinates (x, y). Use this when you cannot identify an element by selector — for example after taking a screenshot and identifying a position visually. Coordinates are relative to the viewport top-left corner. Optionally double-click or right-click.',
        input_schema: {
          type: 'object',
          properties: {
            x: { type: 'number', description: 'X coordinate in viewport pixels (from left edge).' },
            y: { type: 'number', description: 'Y coordinate in viewport pixels (from top edge).' },
            button: {
              type: 'string',
              enum: ['left', 'right', 'middle'],
              description: 'Mouse button (default: left).',
            },
            doubleClick: { type: 'boolean', description: 'If true, perform a double-click.' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
          required: ['x', 'y'],
        },
      },
      {
        name: 'type',
        description:
          'Type text into an input/textarea/contenteditable. If selector points at a container (e.g. CodeMirror wrapper), it will try to find an editable descendant.',
        input_schema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector for the input.' },
            text: { type: 'string', description: 'Text to enter.' },
            timeoutMs: { type: 'number', description: 'Optional wait timeout for element to appear (ms).' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
          required: ['selector', 'text'],
        },
      },
      {
        name: 'pressKey',
        description: 'Press a key in the page.',
        input_schema: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Keyboard key (e.g., Enter, ArrowDown).' },
            selector: { type: 'string', description: 'Optional selector to target.' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
          required: ['key'],
        },
      },
      {
        name: 'scroll',
        description: 'Scroll the page.',
        input_schema: {
          type: 'object',
          properties: {
            direction: { type: 'string', description: 'up, down, top, or bottom.' },
            amount: { type: 'number', description: 'Scroll amount in pixels.' },
            selector: { type: 'string', description: 'Optional selector for a scrollable container.' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
        },
      },
      {
        name: 'getContent',
        description: 'Extract page content.',
        input_schema: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'text, html, title, url, or links.' },
            selector: { type: 'string', description: 'Optional selector to scope content.' },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
        },
      },
      {
        name: 'findHtml',
        description:
          'Check whether a provided HTML snippet exists in the current page DOM structure (full page by default). Useful for confirming exact markup presence.',
        input_schema: {
          type: 'object',
          properties: {
            htmlSnippet: { type: 'string', description: 'Exact HTML snippet to search for.' },
            selector: { type: 'string', description: 'Optional CSS selector to scope search.' },
            normalizeWhitespace: {
              type: 'boolean',
              description: 'Collapse whitespace in both snippet and page HTML before matching.',
            },
            maxMatches: {
              type: 'number',
              description: 'Maximum number of matches to return (default 8).',
            },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
          required: ['htmlSnippet'],
        },
      },
      {
        name: 'screenshot',
        description: 'Capture a screenshot of the current tab.',
        input_schema: {
          type: 'object',
          properties: {
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
        },
      },
      {
        name: 'getTabs',
        description: 'List tabs in the current window.',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'closeTab',
        description: 'Close a tab by id.',
        input_schema: {
          type: 'object',
          properties: {
            tabId: { type: 'number', description: 'Tab id to close.' },
          },
          required: ['tabId'],
        },
      },
      {
        name: 'switchTab',
        description: 'Activate a tab by id.',
        input_schema: {
          type: 'object',
          properties: {
            tabId: { type: 'number', description: 'Tab id to activate.' },
          },
          required: ['tabId'],
        },
      },
      {
        name: 'focusTab',
        description: 'Focus a tab by id.',
        input_schema: {
          type: 'object',
          properties: {
            tabId: { type: 'number', description: 'Tab id to focus.' },
          },
          required: ['tabId'],
        },
      },
      {
        name: 'groupTabs',
        description: 'Group tabs together with an optional name and color.',
        input_schema: {
          type: 'object',
          properties: {
            tabIds: { type: 'array', items: { type: 'number' }, description: 'Tabs to group.' },
            title: { type: 'string', description: 'Group title.' },
            color: { type: 'string', description: 'Group color name.' },
          },
        },
      },
      {
        name: 'describeSessionTabs',
        description: 'List tabs captured for this session.',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'watchVideo',
        description:
          'Watch and analyze a video on the current page. Captures multiple frames and describes what is happening. Requires a vision-capable profile to be configured.',
        input_schema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description:
                'Optional CSS selector for the video element. If not provided, uses the first video on page.',
            },
            durationSeconds: {
              type: 'number',
              description: 'How many seconds of video to analyze (default: 10, max: 60).',
            },
            frameIntervalSeconds: {
              type: 'number',
              description: 'Interval between captured frames in seconds (default: 2).',
            },
            question: {
              type: 'string',
              description: 'Optional specific question about the video content.',
            },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
        },
      },
      {
        name: 'getVideoInfo',
        description:
          'Get information about video elements on the page (duration, current time, playing state, dimensions).',
        input_schema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'Optional CSS selector for a specific video element.',
            },
            tabId: { type: 'number', description: 'Optional tab id.' },
          },
        },
      },
    ];

    return this.supportsTabGroups ? definitions : definitions.filter((tool) => tool.name !== 'groupTabs');
  }

  getSessionTabSummaries(): SessionTabSummary[] {
    return Array.from(this.sessionTabs.values());
  }

  getCurrentSessionTabId(): number | null {
    return this.currentSessionTabId;
  }

  getSessionState() {
    return {
      tabs: this.getSessionTabSummaries(),
      activeTabId: this.currentSessionTabId,
      maxTabs: MAX_SESSION_TABS,
      groupTitle: this.getGroupTitle(DEFAULT_SESSION_GROUP),
    };
  }

  private toSessionTabSummary(tab: chrome.tabs.Tab | null | undefined): SessionTabSummary | null {
    if (!tab || typeof tab.id !== 'number') return null;
    return {
      id: tab.id,
      title: tab.title,
      url: tab.url,
      favIconUrl: tab.favIconUrl,
      windowId: typeof tab.windowId === 'number' ? tab.windowId : undefined,
    };
  }

  async configureSessionTabs(tabs: chrome.tabs.Tab[], options: GroupOptions = {}) {
    this.sessionTabs.clear();
    this.currentSessionTabId = null;
    this.sessionTabGroupId = null;

    for (const candidate of tabs) {
      if (typeof candidate?.id !== 'number') continue;
      try {
        const tab = await chrome.tabs.get(candidate.id);
        const summary = this.toSessionTabSummary(tab);
        if (!summary) continue;
        this.sessionTabs.set(summary.id, summary);
        if (!this.currentSessionTabId) {
          this.currentSessionTabId = summary.id;
        }
      } catch {
        // Ignore stale IDs from sidepanel state; only keep live browser tabs.
      }
    }

    if (tabs.length > 0 && this.supportsTabGroups) {
      await this.ensureSessionTabGroup({
        title: options.title || DEFAULT_SESSION_GROUP.title,
        color: options.color || DEFAULT_SESSION_GROUP.color,
      });
    }
  }

  private getGroupTitle(options: GroupOptions): string {
    const base = options.title || DEFAULT_SESSION_GROUP.title;
    const count = this.sessionTabs.size;
    return count > 0 ? `${base} · ${count}/${MAX_SESSION_TABS}` : base;
  }

  async ensureSessionTabGroup(options: GroupOptions = DEFAULT_SESSION_GROUP) {
    if (!this.supportsTabGroups) return;
    const sessionTabIds = Array.from(this.sessionTabs.keys());
    if (sessionTabIds.length === 0) return;

    const title = this.getGroupTitle(options);
    const color = options.color || DEFAULT_SESSION_GROUP.color;

    try {
      if (this.sessionTabGroupId !== null) {
        await chrome.tabs.group({ groupId: this.sessionTabGroupId, tabIds: sessionTabIds });
        await chrome.tabGroups.update(this.sessionTabGroupId, {
          title,
          color,
          collapsed: false,
        });
      } else {
        const groupId = await chrome.tabs.group({ tabIds: sessionTabIds });
        await chrome.tabGroups.update(groupId, {
          title,
          color,
          collapsed: false,
        });
        this.sessionTabGroupId = groupId;
      }
    } catch (error) {
      console.warn('Failed to group tabs:', error);
    }
  }

  private async updateGroupTitle() {
    if (!this.supportsTabGroups || this.sessionTabGroupId === null) return;
    try {
      await chrome.tabGroups.update(this.sessionTabGroupId, {
        title: this.getGroupTitle(DEFAULT_SESSION_GROUP),
      });
    } catch {}
  }

  async executeTool(toolName: string, args: Record<string, any> = {}) {
    try {
      switch (toolName) {
        case 'navigate':
          return await this.navigate(args);
        case 'openTab':
          return await this.openTab(args);
        case 'click':
          return await this.click(args);
        case 'clickAt':
          return await this.clickAt(args);
        case 'type':
          return await this.type(args);
        case 'pressKey':
          return await this.pressKey(args);
        case 'scroll':
          return await this.scroll(args);
        case 'getContent':
          return await this.getContent(args);
        case 'findHtml':
          return await this.findHtml(args);
        case 'screenshot':
          return await this.screenshot(args);
        case 'getTabs':
          return await this.getTabs();
        case 'closeTab':
          return await this.closeTab(args);
        case 'switchTab':
          return await this.focusTab(args);
        case 'focusTab':
          return await this.focusTab(args);
        case 'groupTabs':
          return await this.groupTabs(args);
        case 'describeSessionTabs':
          if (this.sessionTabs.size === 0) {
            await this.captureActiveTab();
          }
          return {
            success: true,
            tabs: this.getSessionTabSummaries(),
            activeTabId: this.currentSessionTabId,
            tabCount: this.sessionTabs.size,
            maxTabs: MAX_SESSION_TABS,
            canOpenMore: this.sessionTabs.size < MAX_SESSION_TABS,
            groupId: this.sessionTabGroupId,
            groupTitle: this.getGroupTitle(DEFAULT_SESSION_GROUP),
          };
        case 'watchVideo':
          return await this.watchVideo(args);
        case 'getVideoInfo':
          return await this.getVideoInfo(args);
        default:
          return { success: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (error) {
      // Catch any unhandled errors in tool execution
      console.error(`Tool execution error (${toolName}):`, error);
      return {
        success: false,
        error: `Tool "${toolName}" failed: ${error?.message || String(error)}`,
        hint: 'Try a different approach or check the arguments.',
      };
    }
  }

  private async resolveTabId(args: Record<string, any> = {}) {
    if (typeof args.tabId === 'number') {
      return this.sessionTabs.has(args.tabId) ? args.tabId : null;
    }
    if (this.currentSessionTabId && this.sessionTabs.has(this.currentSessionTabId)) {
      return this.currentSessionTabId;
    }
    if (this.sessionTabs.size === 1) {
      const [onlyTabId] = this.sessionTabs.keys();
      return typeof onlyTabId === 'number' ? onlyTabId : null;
    }
    if (this.sessionTabs.size === 0) {
      await this.captureActiveTab();
      if (this.currentSessionTabId && this.sessionTabs.has(this.currentSessionTabId)) {
        return this.currentSessionTabId;
      }
    }
    return null;
  }

  private async captureActiveTab() {
    try {
      const activeTab = await getActiveTab();
      if (!activeTab || typeof activeTab.id !== 'number') return null;
      if (!this.sessionTabs.has(activeTab.id)) {
        this.sessionTabs.set(activeTab.id, {
          id: activeTab.id,
          title: activeTab.title,
          url: activeTab.url,
          windowId: typeof activeTab.windowId === 'number' ? activeTab.windowId : undefined,
        });
      }
      this.currentSessionTabId = activeTab.id;
      return activeTab.id;
    } catch (error) {
      console.warn('Failed to capture active tab:', error);
      return null;
    }
  }

  private async runInTab<TArgs extends unknown[], TResult>(
    tabId: number,
    func: (...args: TArgs) => TResult | Promise<TResult>,
    args: TArgs,
  ): Promise<TResult | { success: false; error: string; details: string }> {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: func as (...args: any[]) => unknown,
        args: args as any[],
      });
      return (results?.[0]?.result ?? null) as TResult;
    } catch (error: any) {
      return {
        success: false,
        error: 'executeScript failed.',
        details: error?.message || String(error),
      };
    }
  }

  private async runInAllFrames<TArgs extends unknown[], TResult>(
    tabId: number,
    func: (...args: TArgs) => TResult | Promise<TResult>,
    args: TArgs,
  ): Promise<TResult | { success: false; error: string; details: string }> {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: func as (...args: any[]) => unknown,
        args: args as any[],
      });
      const success = results.find((entry) => (entry?.result as any)?.success);
      if (success?.result) return success.result as TResult;
      const first = results.find((entry) => entry?.result);
      return (first?.result ?? null) as TResult;
    } catch (error: any) {
      return {
        success: false,
        error: 'executeScript failed (allFrames).',
        details: error?.message || String(error),
      };
    }
  }

  private async sendOverlay(tabId: number, payload: ActionOverlayPayload, retries = 0) {
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'action_overlay', ...payload });
    } catch (error) {
      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return this.sendOverlay(tabId, payload, retries - 1);
      }
    }
  }

  private async navigate(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) {
      return {
        success: false,
        error:
          'No session tab available. Pass tabId from describeSessionTabs(), or select a tab in the UI before running.',
      };
    }

    const url = args.url;
    if (!url || typeof url !== 'string') {
      return { success: false, error: 'Missing or invalid url parameter.' };
    }

    // Validate URL format
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('chrome://')) {
      return {
        success: false,
        error: `Invalid URL: "${url}". URLs must start with http://, https://, or chrome://`,
        hint: 'For Google searches, use: https://www.google.com/search?q=your+query',
      };
    }

    try {
      await this.sendOverlay(tabId, {
        label: 'Navigate',
        note: url.replace(/^https?:\/\//, ''),
        durationMs: 1800,
      });
      await chrome.tabs.update(tabId, { url });
      this.currentSessionTabId = tabId;
      // Update stored metadata so session tab summaries reflect the new URL
      const existing = this.sessionTabs.get(tabId);
      if (existing) {
        existing.url = url;
      }
      return { success: true, tabId, url };
    } catch (error) {
      return {
        success: false,
        error: `Navigation failed: ${error?.message || String(error)}`,
      };
    }
  }

  private async resolveSessionWindowId(): Promise<number | undefined> {
    const candidateTabIds: number[] = [];
    if (typeof this.currentSessionTabId === 'number') {
      candidateTabIds.push(this.currentSessionTabId);
    }
    for (const tabId of this.sessionTabs.keys()) {
      if (!candidateTabIds.includes(tabId)) {
        candidateTabIds.push(tabId);
      }
    }

    for (const tabId of candidateTabIds) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (typeof tab.windowId === 'number') {
          return tab.windowId;
        }
      } catch {
        // Ignore closed tabs and continue resolving from remaining session tabs.
      }
    }

    try {
      const activeTab = await getActiveTab();
      if (activeTab && typeof activeTab.windowId === 'number') {
        return activeTab.windowId;
      }
    } catch {}

    return undefined;
  }

  private async openTab(args: Record<string, any>) {
    // Enforce tab limit to prevent runaway tab creation
    if (this.sessionTabs.size >= MAX_SESSION_TABS) {
      return {
        success: false,
        error: `Tab limit reached (max ${MAX_SESSION_TABS} tabs per session). Close existing tabs with closeTab or use navigate on current tab.`,
        hint: 'Use closeTab({ tabId: <id> }) to close a tab, or navigate({ url: "..." }) to reuse current tab.',
      };
    }

    // Validate URL
    const url = args.url;
    if (!url || typeof url !== 'string') {
      return { success: false, error: 'Missing or invalid url parameter.' };
    }

    // Check if it looks like a valid URL
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('chrome://')) {
      return {
        success: false,
        error: `Invalid URL: "${url}". URLs must start with http://, https://, or chrome://`,
        hint: 'Use navigate({ url: "https://google.com/search?q=..." }) for searches.',
      };
    }

    try {
      const targetWindowId = await this.resolveSessionWindowId();
      const createOptions: chrome.tabs.CreateProperties = { url, active: true };
      if (typeof targetWindowId === 'number') {
        createOptions.windowId = targetWindowId;
      }

      const tab = await chrome.tabs.create(createOptions);
      if (typeof tab.id === 'number') {
        this.sessionTabs.set(tab.id, {
          id: tab.id,
          title: tab.title,
          url: tab.url,
          favIconUrl: tab.favIconUrl,
          windowId: typeof tab.windowId === 'number' ? tab.windowId : undefined,
        });
        this.currentSessionTabId = tab.id;

        if (this.supportsTabGroups && this.sessionTabGroupId !== null) {
          try {
            await chrome.tabs.group({ groupId: this.sessionTabGroupId, tabIds: [tab.id] });
            await this.updateGroupTitle();
          } catch (error) {
            console.warn('Failed to add tab to session group:', error);
          }
        }
        void this.sendOverlay(tab.id, { label: 'Opened tab', note: url.replace(/^https?:\/\//, '') }, 2);
      }
      return { success: true, tabId: tab.id, url };
    } catch (error) {
      return {
        success: false,
        error: `Failed to open tab: ${error?.message || String(error)}`,
        hint: 'Try using navigate() on current tab instead.',
      };
    }
  }

  private async focusTab(args: Record<string, any>) {
    const tabId = typeof args.tabId === 'number' ? args.tabId : null;
    if (!tabId) return { success: false, error: 'Missing tabId.' };
    const tab = await chrome.tabs.get(tabId);
    if (typeof tab.windowId === 'number') {
      try {
        await chrome.windows.update(tab.windowId, { focused: true });
      } catch {
        // Continue and at least activate the tab even if window focus fails.
      }
    }
    await chrome.tabs.update(tabId, { active: true });
    this.currentSessionTabId = tabId;
    const existing = this.sessionTabs.get(tabId);
    if (existing) {
      existing.windowId = typeof tab.windowId === 'number' ? tab.windowId : existing.windowId;
      existing.title = tab.title || existing.title;
      existing.url = tab.url || existing.url;
      existing.favIconUrl = tab.favIconUrl || existing.favIconUrl;
    }
    await this.sendOverlay(tabId, { label: 'Focused tab', durationMs: 1200 }, 1);
    return { success: true, tabId };
  }

  private async closeTab(args: Record<string, any>) {
    const tabId = typeof args.tabId === 'number' ? args.tabId : null;
    if (!tabId) return { success: false, error: 'Missing tabId.' };
    await chrome.tabs.remove(tabId);
    this.sessionTabs.delete(tabId);
    if (this.currentSessionTabId === tabId) {
      this.currentSessionTabId = null;
    }
    await this.updateGroupTitle();
    return { success: true, tabId };
  }

  private async click(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) {
      return {
        success: false,
        error:
          'No session tab available. Pass tabId from describeSessionTabs(), or select a tab in the UI before running.',
      };
    }

    const rawSelector = String(args.selector || '');
    if (!rawSelector) {
      return { success: false, error: 'Missing selector.' };
    }

    const timeout = resolveWaitTimeoutMs(args.timeoutMs);
    const timeoutMs = timeout.timeoutMs;

    await this.sendOverlay(tabId, {
      label: 'Click',
      selector: rawSelector,
      bringIntoView: true,
      durationMs: 2000,
    });

    const spec = parseSelectorSpec(rawSelector);

    const isNotFound = (value: unknown): value is { success: false; error: string } =>
      Boolean(value && typeof value === 'object' && (value as any).success === false && (value as any).error);

    let result = await this.runInTab(tabId, injectedClick, [spec, timeoutMs] as const);
    if (isNotFound(result) && result.error === 'Element not found.') {
      result = await this.runInAllFrames(tabId, injectedClick, [spec, timeoutMs] as const);
    }

    if (timeout.wasClamped && result && typeof result === 'object') {
      return {
        ...result,
        warning: `timeoutMs capped at ${MAX_WAIT_TIMEOUT_MS}ms to prevent runaway polling.`,
        timeoutMsRequested: args.timeoutMs,
        timeoutMsUsed: timeoutMs,
      };
    }

    return result || { success: false, error: 'Script execution failed.' };
  }

  private async clickAt(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) {
      return {
        success: false,
        error:
          'No session tab available. Pass tabId from describeSessionTabs(), or select a tab in the UI before running.',
      };
    }

    const x = typeof args.x === 'number' ? args.x : Number.NaN;
    const y = typeof args.y === 'number' ? args.y : Number.NaN;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { success: false, error: 'Missing or invalid x/y coordinates.' };
    }

    const button = ['left', 'right', 'middle'].includes(args.button) ? args.button : 'left';
    const doubleClick = args.doubleClick === true;

    await this.sendOverlay(tabId, {
      label: doubleClick ? 'Double-click' : 'Click',
      note: `(${Math.round(x)}, ${Math.round(y)})`,
      durationMs: 1500,
    });

    const clickAtScript = (cx: number, cy: number, btn: string, dblClick: boolean) => {
      const buttonCode = btn === 'right' ? 2 : btn === 'middle' ? 1 : 0;
      const el = document.elementFromPoint(cx, cy) as HTMLElement | null;

      const tag = el ? el.tagName.toLowerCase() : null;
      const id = el?.id || null;
      const text = el?.textContent?.trim().slice(0, 80) || null;

      const firePointer = (type: string, target: EventTarget) => {
        try {
          target.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: cx,
              clientY: cy,
              button: buttonCode,
              pointerId: 1,
              pointerType: 'mouse',
              isPrimary: true,
            }),
          );
        } catch {}
      };

      const fireMouse = (type: string, target: EventTarget) => {
        target.dispatchEvent(
          new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: cx,
            clientY: cy,
            button: buttonCode,
          }),
        );
      };

      const target: EventTarget = el || document.documentElement;

      // Focus the element if possible
      if (el && typeof el.focus === 'function') {
        el.focus();
      }

      // Full pointer + mouse event sequence
      firePointer('pointerover', target);
      fireMouse('mouseover', target);
      firePointer('pointerdown', target);
      fireMouse('mousedown', target);
      firePointer('pointerup', target);
      fireMouse('mouseup', target);
      fireMouse('click', target);

      if (dblClick) {
        firePointer('pointerdown', target);
        fireMouse('mousedown', target);
        firePointer('pointerup', target);
        fireMouse('mouseup', target);
        fireMouse('click', target);
        fireMouse('dblclick', target);
      }

      if (btn === 'right') {
        fireMouse('contextmenu', target);
      }

      // Also call native .click() for maximum compatibility
      if (el && typeof (el as any).click === 'function' && btn === 'left') {
        (el as any).click();
      }

      return {
        success: true,
        x: cx,
        y: cy,
        button: btn,
        doubleClick: dblClick,
        elementHit: el
          ? {
              tag,
              id,
              className: el.className ? String(el.className).slice(0, 120) : null,
              text: text ? (text.length > 80 ? text.slice(0, 77) + '…' : text) : null,
            }
          : null,
      };
    };

    const result = await this.runInTab(tabId, clickAtScript, [x, y, button, doubleClick] as const);
    return result || { success: false, error: 'Script execution failed.' };
  }

  private async type(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) {
      return {
        success: false,
        error:
          'No session tab available. Pass tabId from describeSessionTabs(), or select a tab in the UI before running.',
      };
    }

    const selector = String(args.selector || '');
    const text = String(args.text ?? '');
    const timeout = resolveWaitTimeoutMs(args.timeoutMs);
    const timeoutMs = timeout.timeoutMs;

    const preview = text.length > 28 ? `${text.slice(0, 28)}…` : text;
    await this.sendOverlay(tabId, {
      label: 'Type',
      selector,
      note: preview ? `"${preview}"` : undefined,
      bringIntoView: true,
      durationMs: 2200,
    });

    const isNotFound = (value: unknown): value is { success: false; error: string } =>
      Boolean(value && typeof value === 'object' && (value as any).success === false && (value as any).error);

    let result = await this.runInTab(tabId, injectedType, [selector, text, timeoutMs] as const);
    if (isNotFound(result) && result.error === 'Element not found.') {
      result = await this.runInAllFrames(tabId, injectedType, [selector, text, timeoutMs] as const);
    }

    if (timeout.wasClamped && result && typeof result === 'object') {
      return {
        ...result,
        warning: `timeoutMs capped at ${MAX_WAIT_TIMEOUT_MS}ms to prevent runaway polling.`,
        timeoutMsRequested: args.timeoutMs,
        timeoutMsUsed: timeoutMs,
      };
    }

    return result || { success: false, error: 'Script execution failed.' };
  }

  private async pressKey(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) {
      return {
        success: false,
        error:
          'No session tab available. Pass tabId from describeSessionTabs(), or select a tab in the UI before running.',
      };
    }
    const key = String(args.key || '');
    const selector = args.selector ? String(args.selector) : '';
    await this.sendOverlay(tabId, {
      label: 'Press key',
      selector: selector || undefined,
      note: key,
      bringIntoView: Boolean(selector),
      durationMs: 1500,
    });
    const result = await this.runInTab(
      tabId,
      (k: string, sel: string) => {
        const target = sel ? document.querySelector<HTMLElement>(sel) : document.body;
        if (!target) return { success: false, error: 'Target not found.' };
        target.focus?.();
        target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
        target.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
        return { success: true };
      },
      [key, selector] as const,
    );
    return result || { success: false, error: 'Script execution failed.' };
  }

  private async scroll(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) {
      return {
        success: false,
        error:
          'No session tab available. Pass tabId from describeSessionTabs(), or select a tab in the UI before running.',
      };
    }
    const direction = String(args.direction || 'down');
    const amount = typeof args.amount === 'number' ? args.amount : 600;
    const selector = args.selector ? String(args.selector) : '';
    await this.sendOverlay(tabId, {
      label: 'Scroll',
      note: direction === 'down' || direction === 'up' ? `${direction} ${amount}px` : direction,
      durationMs: 1200,
    });
    const result = await this.runInTab(
      tabId,
      (dir: string, amt: number, sel: string) => {
        const resolveScroller = () => {
          if (sel) {
            const el = document.querySelector(sel);
            if (el && (el as HTMLElement).scrollHeight - (el as HTMLElement).clientHeight > 24) {
              return el as HTMLElement;
            }
          }

          const root = (document.scrollingElement || document.documentElement) as HTMLElement | null;
          if (root && root.scrollHeight - root.clientHeight > 24) return root;

          // Fall back: find a likely scroll container (many apps don't scroll the window).
          const nodes = Array.from(
            document.querySelectorAll<HTMLElement>(
              'main, [role="main"], [data-scroll], .scroll, .scroller, .scroll-container, .cm-scroller, .CodeMirror-scroll',
            ),
          );
          const extras = Array.from(document.querySelectorAll<HTMLElement>('body *')).slice(0, 1200);
          const candidates = nodes.length ? nodes.concat(extras) : extras;

          let best: HTMLElement | null = null;
          let bestScore = 0;
          for (const el of candidates) {
            if (!el || el === document.body) continue;
            const ch = el.clientHeight || 0;
            if (ch < 80) continue;
            const overflow = getComputedStyle(el).overflowY;
            if (!(overflow === 'auto' || overflow === 'scroll')) continue;
            const delta = (el.scrollHeight || 0) - ch;
            if (delta < 40) continue;
            const score = delta + ch * 0.25;
            if (score > bestScore) {
              bestScore = score;
              best = el;
            }
          }

          return best || root || (document.documentElement as HTMLElement);
        };

        const scroller = resolveScroller();
        const before = scroller.scrollTop;
        const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);

        const normalized = String(dir || 'down').toLowerCase();
        if (normalized === 'top') {
          scroller.scrollTop = 0;
        } else if (normalized === 'bottom') {
          scroller.scrollTop = maxTop;
        } else if (normalized === 'up') {
          scroller.scrollTop = Math.max(0, before - amt);
        } else {
          scroller.scrollTop = Math.min(maxTop, before + amt);
        }

        const after = scroller.scrollTop;
        return {
          success: true,
          scroller: {
            tag: scroller.tagName,
            id: scroller.id || null,
            className: scroller.className || null,
          },
          before,
          after,
          moved: after !== before,
        };
      },
      [direction, amount, selector] as const,
    );
    return result || { success: false, error: 'Script execution failed.' };
  }

  private async getContent(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) {
      return {
        success: false,
        error:
          'No session tab available. Pass tabId from describeSessionTabs(), or select a tab in the UI before running.',
      };
    }
    const type = String(args.type || args.mode || 'text');
    const selector = args.selector ? String(args.selector) : '';
    const maxChars = typeof args.maxChars === 'number' && args.maxChars > 0 ? args.maxChars : 8000;
    await this.sendOverlay(tabId, {
      label: 'Read page',
      note: selector ? `from ${selector}` : type,
      durationMs: 1200,
    });
    const result = await this.runInTab(
      tabId,
      (t: string, sel: string, limit: number) => {
        const base = sel ? document.querySelector<HTMLElement>(sel) : document.body;
        if (!base) return { success: false, error: 'Target not found.' };
        const normalizedType = ['text', 'html', 'title', 'url', 'links'].includes(t) ? t : 'text';
        const truncate = (value: string) => {
          const length = value.length;
          if (length <= limit) {
            return { content: value, truncated: false, contentLength: length };
          }
          return { content: value.slice(0, limit), truncated: true, contentLength: length };
        };
        if (normalizedType === 'html') {
          const result = truncate(base.innerHTML);
          return { success: true, ...result };
        }
        if (normalizedType === 'title') {
          const result = truncate(document.title || '');
          return { success: true, ...result };
        }
        if (normalizedType === 'url') {
          const result = truncate(window.location.href || '');
          return { success: true, ...result };
        }
        if (normalizedType === 'links') {
          const links = Array.from(base.querySelectorAll('a'))
            .slice(0, 200)
            .map((link) => ({
              text: link.textContent || '',
              href: link.href,
            }));
          const result = truncate(JSON.stringify(links));
          return { success: true, items: links.length, ...result };
        }
        const result = truncate(base.innerText || '');
        return { success: true, ...result };
      },
      [type, selector, maxChars] as const,
    );
    return result || { success: false, error: 'Script execution failed.' };
  }

  private async findHtml(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) {
      return {
        success: false,
        error:
          'No session tab available. Pass tabId from describeSessionTabs(), or select a tab in the UI before running.',
      };
    }

    const htmlSnippet = String(args.htmlSnippet || args.snippet || '').trim();
    if (!htmlSnippet) {
      return {
        success: false,
        error: 'Missing htmlSnippet parameter.',
      };
    }

    const selector = args.selector ? String(args.selector) : '';
    const normalizeWhitespace = args.normalizeWhitespace === true;
    const maxMatches = Math.max(1, Math.min(20, Math.floor(Number(args.maxMatches) || 8)));
    await this.sendOverlay(tabId, {
      label: 'Find HTML snippet',
      note: selector ? `within ${selector}` : 'in document markup',
      durationMs: 700,
    });

    const result = await this.runInTab(
      tabId,
      (scopeSelector: string, needle: string, normalizeWs: boolean, matchLimit: number) => {
        const normalize = (value: string) => {
          if (!normalizeWs) return value;
          return value.replace(/\s+/g, ' ').trim();
        };

        let scope: HTMLElement | null = null;
        try {
          if (scopeSelector) {
            scope = document.querySelector(scopeSelector);
          }
        } catch {
          scope = null;
        }
        const sourceNode = scope || document.documentElement;
        if (!sourceNode) return { success: false, error: 'Target scope not found.' };

        const rawSource = sourceNode.outerHTML || '';
        const source = normalize(rawSource);
        const normalizedNeedle = normalize(needle);
        const indexNeedle = normalizeWs ? normalizedNeedle : needle;
        const haystack = normalizeWs ? source : rawSource;

        const matches: Array<{ index: number; context: string }> = [];
        const searchNeedle = normalizeWs ? indexNeedle : needle;
        if (searchNeedle && searchNeedle.length > 0) {
          let position = 0;
          while (matches.length < matchLimit) {
            const foundAt = haystack.indexOf(searchNeedle, position);
            if (foundAt < 0) break;
            const contextStart = Math.max(0, foundAt - 120);
            const contextEnd = Math.min(haystack.length, foundAt + searchNeedle.length + 120);
            matches.push({
              index: foundAt,
              context: haystack.slice(contextStart, contextEnd),
            });
            position = foundAt + Math.max(1, searchNeedle.length);
          }
        }

        if (!normalizeWs && matches.length === 0 && normalizedNeedle && normalizedNeedle !== needle) {
          const fallbackNeedle = normalizedNeedle;
          let position = 0;
          while (matches.length < matchLimit) {
            const foundAt = source.indexOf(fallbackNeedle, position);
            if (foundAt < 0) break;
            const contextStart = Math.max(0, foundAt - 120);
            const contextEnd = Math.min(source.length, foundAt + fallbackNeedle.length + 120);
            matches.push({
              index: -1,
              context: source.slice(contextStart, contextEnd),
            });
            position = foundAt + Math.max(1, fallbackNeedle.length);
          }
        }

        return {
          success: true,
          hasMatch: matches.length > 0,
          matchCount: matches.length,
          matched:
            matches.length > 0 ? `Found ${matches.length} match(es) for provided HTML.` : 'No exact match found.',
          scopeSelector: scopeSelector || ':root',
          snippetLength: normalizeWs ? normalizedNeedle.length : needle.length,
          sourceLength: haystack.length,
          matches,
        };
      },
      [selector, htmlSnippet, normalizeWhitespace, maxMatches] as const,
    );

    return result || { success: false, error: 'Script execution failed.' };
  }

  private static readonly JPEG_QUALITY_MAP: Record<string, number> = {
    high: 80,
    medium: 60,
    low: 40,
  };

  private async screenshot(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) {
      return {
        success: false,
        error:
          'No session tab available. Pass tabId from describeSessionTabs(), or select a tab in the UI before running.',
      };
    }
    const tab = await chrome.tabs.get(tabId);
    const quality = BrowserTools.JPEG_QUALITY_MAP[this.screenshotQuality || ''] ?? 70;
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'jpeg',
      quality,
    });
    await this.sendOverlay(tabId, { label: 'Screenshot captured', durationMs: 1000 }, 1);
    return { success: true, dataUrl };
  }

  private async getTabs() {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    return {
      success: true,
      tabs: tabs.map((tab) => ({ id: tab.id, title: tab.title, url: tab.url })),
    };
  }

  private async groupTabs(args: Record<string, any>) {
    if (!this.supportsTabGroups) {
      return { success: false, error: 'Tab grouping is not supported in this browser.' };
    }
    const tabIds = Array.isArray(args.tabIds) ? args.tabIds.filter((id) => typeof id === 'number') : [];
    if (!tabIds.length) {
      return { success: false, error: 'No tab ids provided.' };
    }
    await this.groupTabsInternal(tabIds, { title: args.title, color: args.color });
    return { success: true, tabIds };
  }

  private async groupTabsInternal(tabIds: number[], options: GroupOptions) {
    if (!this.supportsTabGroups || !tabIds.length) return;
    const groupId = await chrome.tabs.group({ tabIds });
    if (options.title || options.color) {
      await chrome.tabGroups.update(groupId, {
        title: options.title,
        color: options.color,
      });
    }
  }

  /**
   * Get information about video elements on the page.
   */
  private async getVideoInfo(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) {
      return {
        success: false,
        error:
          'No session tab available. Pass tabId from describeSessionTabs(), or select a tab in the UI before running.',
      };
    }

    const selector = args.selector ? String(args.selector) : '';
    await this.sendOverlay(tabId, { label: 'Get video info', durationMs: 800 }, 1);

    const result = await this.runInTab(
      tabId,
      (sel: string) => {
        const videos = sel
          ? Array.from(document.querySelectorAll<HTMLVideoElement>(sel))
          : Array.from(document.querySelectorAll<HTMLVideoElement>('video'));

        if (videos.length === 0) {
          return {
            success: false,
            error: 'No video elements found on the page.',
            hint: 'Make sure the page has a <video> element, or provide a specific selector.',
          };
        }

        const info = videos.map((video, index) => ({
          index,
          src: video.currentSrc || video.src || null,
          currentSrc: video.currentSrc || null,
          duration: video.duration || 0,
          currentTime: video.currentTime || 0,
          paused: video.paused,
          ended: video.ended,
          muted: video.muted,
          volume: video.volume,
          playbackRate: video.playbackRate || 1,
          readyState: video.readyState,
          networkState: video.networkState,
          videoWidth: video.videoWidth || 0,
          videoHeight: video.videoHeight || 0,
          aspectRatio: video.videoWidth && video.videoHeight ? `${video.videoWidth}x${video.videoHeight}` : null,
          id: video.id || null,
          className: video.className || null,
        }));

        return {
          success: true,
          videoCount: videos.length,
          videos: info,
        };
      },
      [selector] as const,
    );

    return result || { success: false, error: 'Script execution failed.' };
  }

  /**
   * Watch and analyze a video by capturing frames at intervals.
   * Returns frame data URLs that can be passed to a vision model.
   */
  private async watchVideo(args: Record<string, any>) {
    const tabId = await this.resolveTabId(args);
    if (!tabId) {
      return {
        success: false,
        error:
          'No session tab available. Pass tabId from describeSessionTabs(), or select a tab in the UI before running.',
      };
    }

    const selector = args.selector ? String(args.selector) : '';
    const durationSeconds = Math.min(Math.max(1, Number(args.durationSeconds) || 10), 60);
    const frameIntervalSeconds = Math.min(Math.max(0.5, Number(args.frameIntervalSeconds) || 2), 10);
    const question = args.question ? String(args.question) : null;

    // Limit max frames to prevent memory issues
    const maxFrames = 30;
    const effectiveInterval = Math.max(frameIntervalSeconds, durationSeconds / maxFrames);

    await this.sendOverlay(
      tabId,
      {
        label: 'Watching video',
        note: `${durationSeconds}s at ${effectiveInterval.toFixed(1)}s intervals`,
        durationMs: (durationSeconds + 3) * 1000,
      },
      1,
    );

    // First check video exists and get basic info
    const videoCheck = await this.runInTab(tabId, injectedVideoCheck, [selector] as const);

    if (!videoCheck?.success) {
      return videoCheck || { success: false, error: 'Failed to check video.' };
    }

    // Capture frames with proper async waiting for seek
    const frames: Array<{ time: number; timeFormatted: string; dataUrl: string }> = [];
    const startTime = Math.max(0, videoCheck.video.currentTime);
    const endTime = Math.min(videoCheck.video.duration || startTime + durationSeconds, startTime + durationSeconds);

    for (
      let currentTime = startTime;
      currentTime <= endTime && frames.length < maxFrames;
      currentTime += effectiveInterval
    ) {
      const frameResult = await this.runInTab(tabId, injectedCaptureVideoFrame, [selector, currentTime, 2000] as const);

      if (frameResult && typeof frameResult === 'object' && 'success' in frameResult && frameResult.success === true) {
        frames.push({
          time: frameResult.time,
          timeFormatted: frameResult.timeFormatted,
          dataUrl: frameResult.dataUrl,
        });
      } else if (
        frameResult &&
        typeof frameResult === 'object' &&
        'success' in frameResult &&
        frameResult.success === false &&
        'error' in frameResult
      ) {
        console.warn(`Frame capture at ${currentTime}s failed:`, (frameResult as any).error);
      }

      // Small delay between frames
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    if (frames.length === 0) {
      return {
        success: false,
        error: 'Failed to capture any frames from the video.',
        hint: 'The video may be protected (DRM), cross-origin, or not loaded properly.',
      };
    }

    return {
      success: true,
      video: videoCheck.video,
      frameCount: frames.length,
      frameIntervalSeconds: effectiveInterval,
      frames,
      question,
      note: `Captured ${frames.length} frames from video. These frames can be analyzed with a vision-capable model.`,
    };
  }
}
