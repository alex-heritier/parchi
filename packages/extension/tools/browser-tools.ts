import { clickAtTool, clickTool } from './browser-click-tools.js';
import { pressKeyTool, scrollTool, typeTool } from './browser-input-tools.js';
import { getVideoInfoTool, screenshotTool, watchVideoTool } from './browser-media-tools.js';
import { findHtmlTool, getContentTool } from './browser-read-tools.js';
import {
  captureActiveTabState,
  configureSessionTabsState,
  ensureSessionTabGroupState,
  getGroupTitle,
  groupTabsInternalState,
  resolveSessionWindowIdState,
  updateGroupTitleState,
} from './browser-session-state.js';
import {
  closeTabTool,
  describeSessionTabsTool,
  focusTabTool,
  getTabsTool,
  groupTabsTool,
  navigateTool,
  openTabTool,
} from './browser-tab-tools.js';
import { type BrowserToolName, getBrowserToolDefinitions, getBrowserToolMap } from './browser-tool-definitions.js';
import {
  type ActionOverlayPayload,
  type BrowserToolArgs,
  type BrowserToolResult,
  DEFAULT_SESSION_GROUP,
  type GroupOptions,
  MAX_SESSION_TABS,
  type SessionTabSummary,
  formatToolError,
  isToolSuccess,
} from './browser-tool-shared.js';

export class BrowserTools {
  tools: Partial<Record<BrowserToolName, true>>;
  toolHandlers: Record<BrowserToolName, (args: BrowserToolArgs) => Promise<unknown>>;
  sessionTabs: Map<number, SessionTabSummary>;
  currentSessionTabId: number | null;
  sessionTabGroupId: number | null;
  supportsTabGroups: boolean;
  screenshotQuality: 'high' | 'medium' | 'low' | undefined;

  constructor() {
    this.sessionTabs = new Map();
    this.currentSessionTabId = null;
    this.sessionTabGroupId = null;
    this.supportsTabGroups =
      typeof globalThis.chrome?.tabs?.group === 'function' &&
      typeof globalThis.chrome?.tabGroups?.update === 'function';
    this.tools = getBrowserToolMap(this.supportsTabGroups);
    this.toolHandlers = {
      navigate: (args) => navigateTool(this, args),
      openTab: (args) => openTabTool(this, args),
      click: (args) => clickTool(this, args),
      clickAt: (args) => clickAtTool(this, args),
      type: (args) => typeTool(this, args),
      pressKey: (args) => pressKeyTool(this, args),
      scroll: (args) => scrollTool(this, args),
      getContent: (args) => getContentTool(this, args),
      findHtml: (args) => findHtmlTool(this, args),
      screenshot: (args) => screenshotTool(this, args),
      getTabs: () => getTabsTool(),
      closeTab: (args) => closeTabTool(this, args),
      switchTab: (args) => focusTabTool(this, args),
      focusTab: (args) => focusTabTool(this, args),
      groupTabs: (args) => groupTabsTool(this, args),
      describeSessionTabs: () => describeSessionTabsTool(this),
      watchVideo: (args) => watchVideoTool(this, args),
      getVideoInfo: (args) => getVideoInfoTool(this, args),
    };
  }

  private hasToolHandler(toolName: string): toolName is BrowserToolName {
    return Object.hasOwn(this.toolHandlers, toolName);
  }

  getToolDefinitions(): ReturnType<typeof getBrowserToolDefinitions> {
    return getBrowserToolDefinitions(this.supportsTabGroups);
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
    await configureSessionTabsState(
      this.sessionTabs,
      tabs,
      options,
      (tab) => this.toSessionTabSummary(tab),
      (tabId) => {
        this.currentSessionTabId = tabId;
      },
      (groupId) => {
        this.sessionTabGroupId = groupId;
      },
      this.supportsTabGroups,
      (groupOptions) => this.ensureSessionTabGroup(groupOptions),
    );
  }

  getGroupTitle(options: GroupOptions): string {
    return getGroupTitle(this.sessionTabs, options);
  }

  async ensureSessionTabGroup(options: GroupOptions = DEFAULT_SESSION_GROUP) {
    await ensureSessionTabGroupState(
      this.sessionTabs,
      this.supportsTabGroups,
      this.sessionTabGroupId,
      (groupId) => {
        this.sessionTabGroupId = groupId;
      },
      options,
    );
  }

  async updateGroupTitle() {
    await updateGroupTitleState(this.supportsTabGroups, this.sessionTabGroupId, this.sessionTabs);
  }

  async executeTool(toolName: string, args: BrowserToolArgs = {}) {
    try {
      if (!this.hasToolHandler(toolName)) {
        return { success: false, error: `Unknown tool: ${toolName}` };
      }
      return await this.toolHandlers[toolName](args);
    } catch (error) {
      console.error(`Tool execution error (${toolName}):`, error);
      return {
        success: false,
        error: `Tool "${toolName}" failed: ${formatToolError(error)}`,
        hint: 'Try a different approach or check the arguments.',
      };
    }
  }

  async resolveTabId(args: BrowserToolArgs = {}) {
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

  async captureActiveTab() {
    return captureActiveTabState(this.sessionTabs, (tabId) => {
      this.currentSessionTabId = tabId;
    });
  }

  async runInTab<TArgs extends unknown[], TResult>(
    tabId: number,
    func: (...args: TArgs) => TResult | Promise<TResult>,
    args: TArgs,
  ): Promise<BrowserToolResult<TResult>> {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: func as (...args: unknown[]) => unknown,
        args: [...args],
      });
      return (results?.[0]?.result ?? null) as TResult;
    } catch (error) {
      return {
        success: false,
        error: 'executeScript failed.',
        details: formatToolError(error),
      };
    }
  }

  async runInAllFrames<TArgs extends unknown[], TResult>(
    tabId: number,
    func: (...args: TArgs) => TResult | Promise<TResult>,
    args: TArgs,
  ): Promise<BrowserToolResult<TResult>> {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: func as (...args: unknown[]) => unknown,
        args: [...args],
      });
      const successEntry = results.find((entry) => isToolSuccess(entry?.result));
      if (successEntry?.result) return successEntry.result as TResult;
      const first = results.find((entry) => entry?.result);
      return (first?.result ?? null) as TResult;
    } catch (error) {
      return {
        success: false,
        error: 'executeScript failed (allFrames).',
        details: formatToolError(error),
      };
    }
  }

  async sendOverlay(tabId: number, payload: ActionOverlayPayload, retries = 0) {
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'action_overlay', ...payload });
    } catch (error) {
      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return this.sendOverlay(tabId, payload, retries - 1);
      }
    }
  }

  async resolveSessionWindowId(): Promise<number | undefined> {
    return resolveSessionWindowIdState(this.currentSessionTabId, this.sessionTabs);
  }

  async groupTabsInternal(tabIds: number[], options: GroupOptions) {
    await groupTabsInternalState(this.supportsTabGroups, tabIds, options);
  }
}
