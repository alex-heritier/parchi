import type { RunPlan } from '../../../../shared/src/plan.js';
import type { RecordedContext } from '../../../../shared/src/recording.js';
import type { Message } from '../../../ai/message-schema.js';
import type { UsageStats } from '../types/panel-types.js';
import { getSidePanelElements } from './panel-elements.js';

export class SidePanelUI {
  elements: Record<string, any>;
  displayHistory: Message[];
  contextHistory: Message[];
  sessionId: string;
  sessionStartedAt: number;
  firstUserMessage: string;
  currentConfig: string;
  configs: Record<string, any>;
  toolCallViews: Map<string, any>;
  lastChatTurn: HTMLElement | null;
  selectedTabs: Map<number, any>;
  tabGroupInfo: Map<number, chrome.tabGroups.TabGroup>;
  scrollPositions: Map<string, number>;
  pendingToolCount: number;
  isStreaming: boolean;
  thinkingStartedAt: number | null;
  thinkingTimerId: number | null;
  runStartedAt: number | null;
  runTimerId: number | null;
  streamingState: {
    container: HTMLElement;
    eventsEl: HTMLElement | null;
    lastEventType?: 'text' | 'reasoning' | 'tool' | 'plan';
    textEventEl?: HTMLElement | null;
    reasoningEventEl?: HTMLElement | null;
    textBuffer?: string;
    reasoningBuffer?: string;
    planEl?: HTMLElement | null;
    planListEl?: HTMLOListElement | null;
    planMetaEl?: HTMLElement | null;
  } | null;
  userScrolledUp: boolean;
  isNearBottom: boolean;
  chatResizeObserver: ResizeObserver | null;
  contextUsage: {
    approxTokens: number;
    maxContextTokens: number;
    percent: number;
  };
  sessionTokensUsed: number;
  lastUsage: UsageStats | null;
  sessionTokenTotals: UsageStats;
  uiZoom: number;
  toolPermissions: {
    read: boolean;
    interact: boolean;
    navigate: boolean;
    tabs: boolean;
    screenshots: boolean;
  };
  auxAgentProfiles: string[];
  currentView: 'chat' | 'history';
  currentSettingsTab: 'setup' | 'oauth' | 'model' | 'browser' | 'network' | 'prompt' | 'profiles';
  profileEditorTarget: string;
  subagents: Map<string, { name: string; status: string; messages: any[]; tasks?: string[] }>;
  activeAgent: string;
  activityPanelOpen: boolean;
  latestThinking: string | null;
  activeToolName: string | null;
  streamingReasoning: string;
  currentPlan: RunPlan | null;
  stepTimeline: {
    steps: Map<number, { el: HTMLElement; toolsEl: HTMLElement; bodyEl: HTMLElement }>;
    activeStepIndex: number | null;
    activeStepBody: HTMLElement | null;
  };
  historyTurnMap: Map<
    string,
    {
      id: string;
      startedAt: number;
      userMessage: string;
      plan: RunPlan | null;
      toolEvents: Array<Record<string, unknown>>;
      assistantFinal?: {
        content: string;
        thinking?: string | null;
        model?: string | null;
        usage?: Record<string, unknown> | null;
      };
    }
  >;
  pendingTurnDraft: { userMessage: string; startedAt: number } | null;
  isReplayingHistory: boolean;
  _lastRuntimeMessageAt: number;
  _watchdogTimerId: ReturnType<typeof setInterval> | null;
  _deleteConfirmTarget: string | null;
  _deleteConfirmAt: number | null;
  timelineCollapsed: boolean;
  currentTheme: string;
  sessionTabsState: {
    tabs: Array<{ id: number; title?: string; url?: string }>;
    activeTabId: number | null;
    maxTabs: number;
    groupTitle?: string;
    interactingTabId: number | null;
  };
  workflows: Array<{ id: string; name: string; prompt: string; createdAt: number }>;
  workflowMenuOpen: boolean;
  workflowMenuIndex: number;
  _lastTypingAt: number;
  _typingCheckTimerId: number | null;
  _mascotBubbleOpen: boolean;
  _currentVerb: string | null;
  recordingState: { status: 'idle' | 'recording' | 'selecting'; elapsedMs: number; timerId: number | null };
  pendingRecordedContext: RecordedContext | null;
  reviewState: {
    events: import('../../../../shared/src/recording.js').RecordingEvent[];
    screenshots: import('../../../../shared/src/recording.js').RecordingScreenshot[];
    excludedEventIndices: Set<number>;
    selectedScreenshotIds: Set<string>;
    activeTab: 'actions' | 'screenshots';
  } | null;

  // Methods attached via prototype in panel-modules
  declare init: () => Promise<void>;

  constructor() {
    this.elements = getSidePanelElements();

    this.displayHistory = [];
    this.contextHistory = [];
    const suffix = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now());
    this.sessionId = `session-${suffix}`;
    this.sessionStartedAt = Date.now();
    this.firstUserMessage = '';
    this.currentConfig = 'default';
    this.configs = { default: {} };
    this.toolCallViews = new Map();
    this.lastChatTurn = null;
    this.selectedTabs = new Map();
    this.tabGroupInfo = new Map();
    this.scrollPositions = new Map();
    this.pendingToolCount = 0;
    this.isStreaming = false;
    this.thinkingStartedAt = null;
    this.thinkingTimerId = null;
    this.runStartedAt = null;
    this.runTimerId = null;
    this.streamingState = null;
    this.userScrolledUp = false;
    this.isNearBottom = true;
    this.chatResizeObserver = null;
    this.contextUsage = {
      approxTokens: 0,
      maxContextTokens: 196000,
      percent: 0,
    };
    this.sessionTokensUsed = 0;
    this.lastUsage = null;
    this.sessionTokenTotals = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    this.uiZoom = 1;
    this.toolPermissions = {
      read: true,
      interact: true,
      navigate: true,
      tabs: true,
      screenshots: true,
    };
    this.auxAgentProfiles = [];
    this.currentView = 'chat';
    this.currentSettingsTab = 'setup';
    this.profileEditorTarget = 'default';
    this.subagents = new Map();
    this.activeAgent = 'main';
    this.activityPanelOpen = false;
    this.latestThinking = null;
    this.activeToolName = null;
    this.streamingReasoning = '';
    this.currentPlan = null;
    this.stepTimeline = {
      steps: new Map(),
      activeStepIndex: null,
      activeStepBody: null,
    };
    this.historyTurnMap = new Map();
    this.pendingTurnDraft = null;
    this.isReplayingHistory = false;
    this._lastRuntimeMessageAt = 0;
    this._watchdogTimerId = null;
    this._deleteConfirmTarget = null;
    this._deleteConfirmAt = null;
    this.timelineCollapsed = true;
    this.currentTheme = 'void';
    this.sessionTabsState = {
      tabs: [],
      activeTabId: null,
      maxTabs: 5,
      groupTitle: undefined,
      interactingTabId: null,
    };
    this.workflows = [];
    this.workflowMenuOpen = false;
    this.workflowMenuIndex = -1;
    this._lastTypingAt = 0;
    this._typingCheckTimerId = null;
    this._mascotBubbleOpen = false;
    this._currentVerb = null;
    this.recordingState = { status: 'idle', elapsedMs: 0, timerId: null };
    this.pendingRecordedContext = null;
    this.reviewState = null;
    void this.init();
  }
}
