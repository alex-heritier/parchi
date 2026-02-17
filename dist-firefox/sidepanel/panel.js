// packages/extension/sidepanel/ui/core/panel-elements.ts
var byId = (id) => document.getElementById(id);
var bySelector = (selector) => document.querySelector(selector);
var getSidePanelElements = () => ({
  // Sidebar elements
  sidebar: byId("sidebar"),
  sidebarScrim: byId("sidebarScrim"),
  openSidebarBtn: byId("openSidebarBtn"),
  closeSidebarBtn: byId("closeSidebarBtn"),
  navHistoryBtn: byId("navHistoryBtn"),
  navSettingsBtn: byId("navSettingsBtn"),
  rightPanel: byId("rightPanel"),
  rightPanelPanels: byId("rightPanelPanels") ?? bySelector(".right-panel-panels"),
  // Legacy references (kept for compatibility)
  settingsBtn: byId("settingsBtn"),
  settingsPanel: byId("settingsPanel"),
  chatInterface: byId("chatInterface"),
  statusText: byId("statusText"),
  statusMeta: byId("statusMeta"),
  statusBar: byId("statusBar"),
  agentNav: byId("agentNav"),
  tabSelectorBtn: byId("tabSelectorBtn"),
  exportBtn: byId("exportBtn"),
  tabSelector: byId("tabSelector"),
  tabSelectorSummary: byId("tabSelectorSummary"),
  tabSelectorAddActive: byId("tabSelectorAddActive"),
  tabSelectorClear: byId("tabSelectorClear"),
  tabList: byId("tabList"),
  closeTabSelector: byId("closeTabSelector"),
  selectedTabsBar: byId("selectedTabsBar"),
  scrollToLatestBtn: byId("scrollToLatestBtn"),
  newSessionFab: byId("newSessionFab"),
  historyPanel: byId("historyPanel"),
  historyItems: byId("historyItems"),
  clearHistoryBtn: byId("clearHistoryBtn"),
  startNewSessionBtn: byId("startNewSessionBtn"),
  settingsTabSetupBtn: byId("settingsTabSetupBtn"),
  settingsTabModelBtn: byId("settingsTabModelBtn"),
  settingsTabBrowserBtn: byId("settingsTabBrowserBtn"),
  settingsTabNetworkBtn: byId("settingsTabNetworkBtn"),
  settingsTabProfilesBtn: byId("settingsTabProfilesBtn"),
  settingsTabSetup: byId("settingsTabSetup"),
  settingsTabModel: byId("settingsTabModel"),
  settingsTabBrowser: byId("settingsTabBrowser"),
  settingsTabNetwork: byId("settingsTabNetwork"),
  settingsTabProfiles: byId("settingsTabProfiles"),
  newProfileNameInput: byId("newProfileNameInput"),
  createProfileBtn: byId("createProfileBtn"),
  profileEditorTitle: byId("profileEditorTitle"),
  profileEditorName: byId("profileEditorName"),
  profileEditorProvider: byId("profileEditorProvider"),
  profileEditorApiKey: byId("profileEditorApiKey"),
  profileEditorModel: byId("profileEditorModel"),
  profileEditorEndpoint: byId("profileEditorEndpoint"),
  profileEditorEndpointGroup: byId("profileEditorEndpointGroup"),
  profileEditorHeaders: byId("profileEditorHeaders"),
  profileEditorTemperature: byId("profileEditorTemperature"),
  profileEditorTemperatureValue: byId("profileEditorTemperatureValue"),
  profileEditorMaxTokens: byId("profileEditorMaxTokens"),
  profileEditorContextLimit: byId("profileEditorContextLimit"),
  profileEditorTimeout: byId("profileEditorTimeout"),
  profileEditorEnableScreenshots: byId("profileEditorEnableScreenshots"),
  profileEditorSendScreenshots: byId("profileEditorSendScreenshots"),
  profileEditorScreenshotQuality: byId("profileEditorScreenshotQuality"),
  profileEditorShowThinking: byId("profileEditorShowThinking"),
  profileEditorStreamResponses: byId("profileEditorStreamResponses"),
  profileEditorAutoScroll: byId("profileEditorAutoScroll"),
  profileEditorConfirmActions: byId("profileEditorConfirmActions"),
  profileEditorSaveHistory: byId("profileEditorSaveHistory"),
  profileEditorPrompt: byId("profileEditorPrompt"),
  saveProfileBtn: byId("saveProfileBtn"),
  profileJsonEditor: byId("profileJsonEditor"),
  refreshProfileJsonBtn: byId("refreshProfileJsonBtn"),
  copyProfileJsonBtn: byId("copyProfileJsonBtn"),
  applyProfileJsonBtn: byId("applyProfileJsonBtn"),
  permissionRead: byId("permissionRead"),
  permissionInteract: byId("permissionInteract"),
  permissionNavigate: byId("permissionNavigate"),
  permissionTabs: byId("permissionTabs"),
  permissionScreenshots: byId("permissionScreenshots"),
  allowedDomains: byId("allowedDomains"),
  exportSettingsBtn: byId("exportSettingsBtn"),
  importSettingsBtn: byId("importSettingsBtn"),
  importSettingsInput: byId("importSettingsInput"),
  // Relay
  relayEnabled: byId("relayEnabled"),
  relayUrl: byId("relayUrl"),
  relayToken: byId("relayToken"),
  saveRelayBtn: byId("saveRelayBtn"),
  copyRelayEnvBtn: byId("copyRelayEnvBtn"),
  relayConnectedBadge: byId("relayConnectedBadge"),
  relayLastErrorText: byId("relayLastErrorText"),
  // Form elements - Provider & model
  provider: byId("provider"),
  apiKey: byId("apiKey"),
  model: byId("model"),
  customEndpoint: byId("customEndpoint"),
  customEndpointGroup: byId("customEndpointGroup"),
  customHeaders: byId("customHeaders"),
  customHeadersGroup: byId("customHeadersGroup"),
  // Form elements - Model parameters
  temperature: byId("temperature"),
  temperatureValue: byId("temperatureValue"),
  maxTokens: byId("maxTokens"),
  contextLimit: byId("contextLimit"),
  timeout: byId("timeout"),
  // Form elements - Screenshots & vision
  enableScreenshots: byId("enableScreenshots"),
  sendScreenshotsAsImages: byId("sendScreenshotsAsImages"),
  screenshotQuality: byId("screenshotQuality"),
  visionBridge: byId("visionBridge"),
  visionProfile: byId("visionProfile"),
  // Form elements - Behavior
  showThinking: byId("showThinking"),
  streamResponses: byId("streamResponses"),
  autoScroll: byId("autoScroll"),
  confirmActions: byId("confirmActions"),
  saveHistory: byId("saveHistory"),
  // Form elements - Orchestrator
  orchestratorToggle: byId("orchestratorToggle"),
  orchestratorProfile: byId("orchestratorProfile"),
  // Form elements - System prompt
  systemPrompt: byId("systemPrompt"),
  // Form elements - Appearance
  uiZoom: byId("uiZoom"),
  uiZoomValue: byId("uiZoomValue"),
  themeGrid: byId("themeGrid"),
  // Settings actions
  saveSettingsBtn: byId("saveSettingsBtn"),
  cancelSettingsBtn: byId("cancelSettingsBtn"),
  // Profile management
  activeConfig: byId("activeConfig"),
  newConfigBtn: byId("newConfigBtn"),
  newProfileInput: byId("newProfileInput"),
  deleteConfigBtn: byId("deleteConfigBtn"),
  refreshProfilesBtn: byId("refreshProfilesBtn"),
  agentGrid: byId("agentGrid"),
  // Chat interface
  chatMessages: byId("chatMessages"),
  chatEmptyState: byId("chatEmptyState"),
  userInput: byId("userInput"),
  sendBtn: byId("sendBtn"),
  composer: byId("composer"),
  modelSelect: byId("modelSelect"),
  fileBtn: byId("fileBtn"),
  fileInput: byId("fileInput"),
  zoomOutBtn: byId("zoomOutBtn"),
  zoomInBtn: byId("zoomInBtn"),
  zoomResetBtn: byId("zoomResetBtn"),
  planDrawer: byId("planDrawer"),
  planDrawerToggle: byId("planDrawerToggle"),
  planChecklist: byId("planChecklist"),
  planStepCount: byId("planStepCount"),
  planClearBtn: byId("planClearBtn"),
  stopRunBtn: byId("stopRunBtn")
  // legacy, stop is now handled by sendBtn
});

// packages/extension/sidepanel/ui/core/panel-ui.ts
var SidePanelUI = class {
  elements;
  displayHistory;
  contextHistory;
  sessionId;
  sessionStartedAt;
  firstUserMessage;
  currentConfig;
  configs;
  toolCallViews;
  lastChatTurn;
  selectedTabs;
  tabGroupInfo;
  scrollPositions;
  pendingToolCount;
  isStreaming;
  thinkingStartedAt;
  thinkingTimerId;
  runStartedAt;
  runTimerId;
  streamingState;
  userScrolledUp;
  isNearBottom;
  chatResizeObserver;
  contextUsage;
  sessionTokensUsed;
  lastUsage;
  sessionTokenTotals;
  uiZoom;
  toolPermissions;
  auxAgentProfiles;
  currentView;
  currentSettingsTab;
  profileEditorTarget;
  subagents;
  activeAgent;
  activityPanelOpen;
  latestThinking;
  activeToolName;
  streamingReasoning;
  currentPlan;
  stepTimeline;
  historyTurnMap;
  pendingTurnDraft;
  isReplayingHistory;
  _lastRuntimeMessageAt;
  _watchdogTimerId;
  _deleteConfirmTarget;
  _deleteConfirmAt;
  timelineCollapsed;
  currentTheme;
  constructor() {
    this.elements = getSidePanelElements();
    this.displayHistory = [];
    this.contextHistory = [];
    const suffix = typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : String(Date.now());
    this.sessionId = `session-${suffix}`;
    this.sessionStartedAt = Date.now();
    this.firstUserMessage = "";
    this.currentConfig = "default";
    this.configs = { default: {} };
    this.toolCallViews = /* @__PURE__ */ new Map();
    this.lastChatTurn = null;
    this.selectedTabs = /* @__PURE__ */ new Map();
    this.tabGroupInfo = /* @__PURE__ */ new Map();
    this.scrollPositions = /* @__PURE__ */ new Map();
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
      maxContextTokens: 196e3,
      percent: 0
    };
    this.sessionTokensUsed = 0;
    this.lastUsage = null;
    this.sessionTokenTotals = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    };
    this.uiZoom = 1;
    this.toolPermissions = {
      read: true,
      interact: true,
      navigate: true,
      tabs: true,
      screenshots: true
    };
    this.auxAgentProfiles = [];
    this.currentView = "chat";
    this.currentSettingsTab = "setup";
    this.profileEditorTarget = "default";
    this.subagents = /* @__PURE__ */ new Map();
    this.activeAgent = "main";
    this.activityPanelOpen = false;
    this.latestThinking = null;
    this.activeToolName = null;
    this.streamingReasoning = "";
    this.currentPlan = null;
    this.stepTimeline = {
      steps: /* @__PURE__ */ new Map(),
      activeStepIndex: null,
      activeStepBody: null
    };
    this.historyTurnMap = /* @__PURE__ */ new Map();
    this.pendingTurnDraft = null;
    this.isReplayingHistory = false;
    this._lastRuntimeMessageAt = 0;
    this._watchdogTimerId = null;
    this._deleteConfirmTarget = null;
    this._deleteConfirmAt = null;
    this.timelineCollapsed = true;
    this.currentTheme = "void";
    void this.init();
  }
};

// packages/extension/sidepanel/ui/agents/panel-agents.ts
SidePanelUI.prototype.addSubagent = function addSubagent(id, name, tasks) {
  this.subagents.set(id, {
    name: name || `Sub-${this.subagents.size + 1}`,
    tasks: Array.isArray(tasks) ? tasks : [tasks || "Task"],
    status: "running",
    messages: [],
    startedAt: Date.now(),
    completedAt: null,
    summary: null
  });
  this.renderAgentNav();
  this.renderSubagentActivity(id, "start", { name, tasks });
};
SidePanelUI.prototype.updateSubagentStatus = function updateSubagentStatus(id, status, summary) {
  const agent = this.subagents.get(id);
  if (agent) {
    agent.status = status;
    if (status === "completed" || status === "error") {
      agent.completedAt = Date.now();
      agent.summary = summary || null;
    }
    this.renderAgentNav();
    this.renderSubagentActivity(id, status === "completed" ? "complete" : status, { summary });
  }
};
SidePanelUI.prototype.renderAgentNav = function renderAgentNav() {
  if (!this.elements.agentNav) return;
  if (this.subagents.size === 0) {
    this.hideAgentNav();
    return;
  }
  this.elements.agentNav.classList.remove("hidden");
  let html = `
      <div class="agent-nav-item main-agent ${this.activeAgent === "main" ? "active" : ""}" data-agent="main">
        <span class="agent-status"></span>
        <span>Main</span>
      </div>
    `;
  this.subagents.forEach((agent, id) => {
    const statusClass = agent.status === "running" ? "running" : agent.status === "completed" ? "completed" : "error";
    const statusIcon = agent.status === "running" ? "\u23F3" : agent.status === "completed" ? "\u2713" : "\u2717";
    html += `
        <div class="agent-nav-item sub-agent ${statusClass} ${this.activeAgent === id ? "active" : ""}" data-agent="${id}" title="${agent.name}: ${agent.status}">
          <span class="agent-status">${statusIcon}</span>
          <span>${agent.name}</span>
        </div>
      `;
  });
  this.elements.agentNav.innerHTML = html;
  this.elements.agentNav.querySelectorAll(".agent-nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      const agentId = item.dataset.agent;
      this.switchAgent(agentId);
    });
  });
};
SidePanelUI.prototype.switchAgent = function switchAgent(agentId) {
  this.activeAgent = agentId;
  this.renderAgentNav();
  if (agentId !== "main") {
    const agent = this.subagents.get(agentId);
    if (agent) {
      this.highlightSubagentMessages(agentId);
    }
  }
};
SidePanelUI.prototype.hideAgentNav = function hideAgentNav() {
  if (this.elements.agentNav) {
    this.elements.agentNav.classList.add("hidden");
  }
};
SidePanelUI.prototype.renderSubagentActivity = function renderSubagentActivity(subagentId, event, data) {
  const agent = this.subagents.get(subagentId);
  if (!agent) return;
  if (!this.streamingState?.eventsEl) return;
  let container = this.streamingState.eventsEl.querySelector(
    `.subagent-block[data-subagent-id="${subagentId}"]`
  );
  if (!container) {
    container = document.createElement("div");
    container.className = "subagent-block";
    container.dataset.subagentId = subagentId;
    this.streamingState.eventsEl.appendChild(container);
  }
  const icon = event === "start" ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' : event === "complete" ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  const statusClass = event === "start" ? "running" : event === "complete" ? "completed" : "error";
  container.className = `subagent-block ${statusClass}`;
  let html = `
    <div class="subagent-header">
      <span class="subagent-icon">${icon}</span>
      <span class="subagent-name">${this.escapeHtml(agent.name)}</span>
      <span class="subagent-status">${event === "start" ? "Running..." : event === "complete" ? "Completed" : "Failed"}</span>
    </div>
  `;
  if (agent.tasks && agent.tasks.length > 0) {
    html += `<div class="subagent-tasks">`;
    for (const task of agent.tasks) {
      html += `<div class="subagent-task">\u2022 ${this.escapeHtml(task)}</div>`;
    }
    html += "</div>";
  }
  if (data?.summary || agent.summary) {
    const summaryText = data?.summary || agent.summary || "";
    html += `
      <div class="subagent-summary">
        <div class="subagent-summary-label">Summary</div>
        <div class="subagent-summary-content">${this.renderMarkdown(summaryText)}</div>
      </div>
    `;
  }
  if (data?.error) {
    html += `<div class="subagent-error">${this.escapeHtml(data.error)}</div>`;
  }
  container.innerHTML = html;
  this.scrollToBottom();
};
SidePanelUI.prototype.highlightSubagentMessages = function highlightSubagentMessages(subagentId) {
  this.elements.chatMessages?.querySelectorAll(".subagent-highlight").forEach((el) => {
    el.classList.remove("subagent-highlight");
  });
  this.elements.chatMessages?.querySelectorAll(`.subagent-block[data-subagent-id="${subagentId}"]`).forEach((el) => {
    el.classList.add("subagent-highlight");
  });
  const first = this.elements.chatMessages?.querySelector(`.subagent-block[data-subagent-id="${subagentId}"]`);
  if (first) {
    first.scrollIntoView({ behavior: "smooth", block: "center" });
  }
};
SidePanelUI.prototype.getSubagentSummary = function getSubagentSummary() {
  if (!this.subagents || this.subagents.size === 0) return "";
  const parts = [];
  this.subagents.forEach((agent) => {
    const status = agent.status === "running" ? "running" : agent.status;
    parts.push(`${agent.name} (${status})`);
  });
  return parts.join(", ");
};

// packages/extension/ai/message-schema.ts
var ROLE_SET = /* @__PURE__ */ new Set(["system", "user", "assistant", "tool"]);
function createMessageId() {
  return `msg_${Date.now()}_${Math.floor(Math.random() * 1e5)}`;
}
function createMessage({ role, content, ...meta } = {}) {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return null;
  const message = {
    id: meta.id || createMessageId(),
    createdAt: meta.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
    role: normalizedRole,
    content: normalizeContent(content)
  };
  if (typeof meta.thinking === "string" && meta.thinking.trim()) {
    message.thinking = meta.thinking;
  }
  if (meta.toolCalls) message.toolCalls = normalizeToolCalls(meta.toolCalls);
  if (meta.toolCallId) message.toolCallId = String(meta.toolCallId);
  if (meta.toolName) message.toolName = String(meta.toolName);
  if (meta.name) message.name = String(meta.name);
  if (meta.usage) message.usage = normalizeUsage(meta.usage);
  if (meta.meta) message.meta = meta.meta;
  return message;
}
function normalizeConversationHistory(history = [], options = {}) {
  const messages = Array.isArray(history) ? history : [];
  const normalized = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const role = normalizeRole(msg.role || options.defaultRole);
    if (!role) continue;
    const base = {
      role,
      content: normalizeContent(msg.content)
    };
    const id = typeof msg.id === "string" ? msg.id : options.addIds === false ? null : createMessageId();
    if (id) base.id = id;
    const createdAt = typeof msg.createdAt === "string" ? msg.createdAt : options.addTimestamps === false ? null : (/* @__PURE__ */ new Date()).toISOString();
    if (createdAt) base.createdAt = createdAt;
    if (typeof msg.thinking === "string" && msg.thinking.trim()) {
      base.thinking = msg.thinking;
    }
    if (role === "assistant") {
      const toolCalls = msg.toolCalls || msg.tool_calls;
      if (Array.isArray(toolCalls)) {
        base.toolCalls = normalizeToolCalls(toolCalls);
      }
    }
    if (role === "tool") {
      const toolCallId = msg.toolCallId || msg.tool_call_id;
      if (toolCallId) base.toolCallId = String(toolCallId);
      if (msg.name) base.name = String(msg.name);
      if (msg.toolName) base.toolName = String(msg.toolName);
    }
    if (msg.usage) base.usage = normalizeUsage(msg.usage);
    if (msg.meta) base.meta = msg.meta;
    normalized.push(base);
  }
  return normalized;
}
function normalizeToolCalls(toolCalls = []) {
  return toolCalls.map((call) => ({
    id: typeof call?.id === "string" ? call.id : createMessageId(),
    name: typeof call?.name === "string" ? call.name : call && typeof call.function?.name === "string" ? String(call.function?.name) : "",
    args: normalizeArgs(
      call?.args ?? call?.arguments ?? call?.function?.arguments
    )
  }));
}
function normalizeUsage(usage = {}) {
  return {
    inputTokens: Number(usage.inputTokens || 0),
    outputTokens: Number(usage.outputTokens || 0),
    totalTokens: Number(usage.totalTokens || 0)
  };
}
function normalizeRole(role) {
  if (typeof role !== "string") return "";
  const lowered = role.toLowerCase();
  return ROLE_SET.has(lowered) ? lowered : "";
}
function normalizeContent(content) {
  if (content === null || content === void 0) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content;
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}
function normalizeArgs(args) {
  if (args && typeof args === "object" && !Array.isArray(args)) return args;
  if (Array.isArray(args)) return { value: args };
  if (typeof args === "string") {
    try {
      return JSON.parse(args);
    } catch {
      return { value: args };
    }
  }
  return {};
}

// packages/extension/ai/message-utils.ts
function extractThinking(content, existingThinking = null) {
  let thinking = existingThinking || null;
  let cleanedContent = content || "";
  const thinkRegex = /<\s*(think|analysis|thinking)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi;
  let match;
  const collected = [];
  while ((match = thinkRegex.exec(cleanedContent)) !== null) {
    if (match[2]) collected.push(match[2].trim());
  }
  if (collected.length > 0) {
    thinking = [existingThinking, ...collected].filter(Boolean).join("\n\n").trim();
    thinkRegex.lastIndex = 0;
    cleanedContent = cleanedContent.replace(thinkRegex, "").trim();
  }
  return { content: cleanedContent, thinking };
}
function dedupeThinking(thinking) {
  if (!thinking) return "";
  const paragraphs = thinking.split(/\n\n+/);
  const seenParagraphs = /* @__PURE__ */ new Set();
  const dedupedParagraphs = [];
  for (const para of paragraphs) {
    const normalized = para.trim().toLowerCase();
    if (normalized && !seenParagraphs.has(normalized)) {
      seenParagraphs.add(normalized);
      dedupedParagraphs.push(para.trim());
    }
  }
  const result = dedupedParagraphs.join("\n\n");
  const lines = result.split("\n");
  const deduplicated = [];
  let lastLine = null;
  let repeatCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === lastLine && trimmed !== "") {
      repeatCount++;
      if (repeatCount >= 2) {
      }
    } else {
      deduplicated.push(line);
      lastLine = trimmed;
      repeatCount = 0;
    }
  }
  return deduplicated.join("\n").trim();
}

// packages/extension/utils/active-tab.ts
var getActiveTab = async () => {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return activeTab || null;
};

// packages/extension/sidepanel/ui/chat/panel-chat.ts
var truncate = (value, max = 12e3) => {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\u2026`;
};
var sanitizeForMessaging = (value, depth = 0) => {
  if (value == null) return value;
  if (typeof value === "string") {
    const s = value;
    if (s.startsWith("data:image/") || s.startsWith("data:application/octet-stream")) {
      return "[omitted dataUrl]";
    }
    return truncate(s, 12e3);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "function") return void 0;
  if (depth > 6) return "[truncated]";
  if (Array.isArray(value)) {
    const out = [];
    const limit = Math.min(value.length, 80);
    for (let i = 0; i < limit; i += 1) {
      out.push(sanitizeForMessaging(value[i], depth + 1));
    }
    if (value.length > limit) out.push(`[+${value.length - limit} items truncated]`);
    return out;
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: truncate(value.stack || "", 2e3) };
  }
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "dataUrl") {
        out[k] = "[omitted dataUrl]";
        continue;
      }
      out[k] = sanitizeForMessaging(v, depth + 1);
    }
    return out;
  }
  return String(value);
};
SidePanelUI.prototype.sendMessage = async function sendMessage() {
  const userMessage = this.elements.userInput.value.trim();
  if (!userMessage) return;
  this.pendingTurnDraft = { userMessage, startedAt: Date.now() };
  this.elements.userInput.value = "";
  this.elements.userInput.style.height = "";
  if (!this.firstUserMessage) {
    this.firstUserMessage = userMessage;
  }
  this.pendingToolCount = 0;
  this.isStreaming = false;
  this.streamingState = null;
  this.stepTimeline.steps.clear();
  this.stepTimeline.activeStepIndex = null;
  this.stepTimeline.activeStepBody = null;
  this.activeToolName = null;
  this.latestThinking = null;
  this.clearRunIncompleteBanner();
  this.updateActivityState();
  let selectedTabsPayload = Array.from(this.selectedTabs.values());
  let tabsContext = this.getSelectedTabsContext(selectedTabsPayload);
  if (selectedTabsPayload.length === 0) {
    try {
      const activeTab = await getActiveTab();
      if (activeTab && typeof activeTab.id === "number") {
        const autoTab = this.buildSelectedTab(activeTab);
        selectedTabsPayload = [autoTab];
        tabsContext = this.getSelectedTabsContext(selectedTabsPayload, "active");
      }
    } catch (error) {
      console.warn("Failed to capture active tab context:", error);
    }
  }
  const fullMessage = userMessage + tabsContext;
  this.displayUserMessage(userMessage);
  const displayEntry = createMessage({ role: "user", content: userMessage });
  if (displayEntry) {
    this.displayHistory.push(displayEntry);
  }
  const contextEntry = createMessage({ role: "user", content: fullMessage });
  if (contextEntry) {
    this.contextHistory.push(contextEntry);
  }
  this.updateContextUsage();
  this.updateStatus("Processing...", "active");
  this.elements.composer?.classList.add("running");
  this.startRunTimer?.();
  this.startWatchdog?.();
  try {
    const sendableHistory = sanitizeForMessaging(this.contextHistory || []);
    const response = await chrome.runtime.sendMessage({
      type: "user_message",
      message: fullMessage,
      conversationHistory: sendableHistory,
      selectedTabs: selectedTabsPayload,
      sessionId: this.sessionId
    });
    if (response?.sessionId && typeof response.sessionId === "string") {
      this.sessionId = response.sessionId;
    }
  } catch (error) {
    this.stopThinkingTimer?.();
    this.stopRunTimer?.();
    this.stopWatchdog?.();
    this.pendingTurnDraft = null;
    this.updateStatus("Error: " + error.message, "error");
    this.elements.composer?.classList.remove("running");
    this.displayAssistantMessage("Sorry, an error occurred: " + error.message);
  }
};
SidePanelUI.prototype.displayUserMessage = function displayUserMessage(content) {
  const turn = document.createElement("div");
  turn.className = "chat-turn";
  const messageDiv = document.createElement("div");
  messageDiv.className = "message user";
  messageDiv.innerHTML = `
      <div class="message-header">You</div>
      <div class="message-content">${this.escapeHtml(content)}</div>
    `;
  turn.appendChild(messageDiv);
  this.elements.chatMessages.appendChild(turn);
  this.lastChatTurn = turn;
  this.scrollToBottom({ force: true });
  this.updateChatEmptyState();
};
SidePanelUI.prototype.displaySummaryMessage = function displaySummaryMessage(messageOrEntry) {
  const content = typeof messageOrEntry === "string" ? messageOrEntry : String(messageOrEntry.content || "");
  const container = document.createElement("div");
  container.className = "message summary";
  container.innerHTML = `
      <div class="summary-header">Context compacted</div>
      <div class="summary-body">${this.renderMarkdown(content)}</div>
    `;
  this.elements.chatMessages.appendChild(container);
  this.scrollToBottom();
  this.updateChatEmptyState();
};
SidePanelUI.prototype.updateChatEmptyState = function updateChatEmptyState() {
  const emptyState = this.elements.chatEmptyState;
  if (!emptyState) return;
  const hasMessages = this.displayHistory && this.displayHistory.length > 0 || this.elements.chatMessages && this.elements.chatMessages.children.length > 0;
  emptyState.classList.toggle("hidden", hasMessages);
};
SidePanelUI.prototype.displayAssistantMessage = function displayAssistantMessage(content, thinking = null, usage = null, model = null) {
  this.stopThinkingTimer?.();
  const streamResult = this.finishStreamingMessage();
  const streamedContainer = streamResult?.container;
  const streamEventsEl = streamedContainer?.querySelector(".stream-events");
  const hasStreamEvents = Boolean(streamEventsEl && streamEventsEl.children.length > 0);
  let normalizedUsage = this.normalizeUsage(usage);
  const modelLabel = model || this.getActiveModelLabel();
  const combinedThinking = [streamResult?.thinking, thinking].filter(Boolean).join("\n\n") || null;
  const showThinking = this.elements.showThinking?.value === "true";
  if ((!content || content.trim() === "") && !combinedThinking && !hasStreamEvents) {
    if (streamedContainer) {
      streamedContainer.remove();
    }
    this.updateStatus("Ready", "success");
    this.elements.composer?.classList.remove("running");
    this.stopWatchdog?.();
    this.pendingToolCount = 0;
    this.updateActivityState();
    return;
  }
  const parsed = extractThinking(content, combinedThinking);
  content = parsed.content;
  thinking = parsed.thinking;
  if (thinking) {
  } else {
  }
  this.updateThinkingPanel(thinking, false);
  if (!normalizedUsage) {
    normalizedUsage = this.estimateUsageFromContent(content);
  }
  if (normalizedUsage) {
    this.updateUsageStats(normalizedUsage);
  }
  const messageMeta = this.buildMessageMeta(normalizedUsage, modelLabel);
  const assistantEntry = createMessage({
    role: "assistant",
    content,
    thinking
  });
  if (assistantEntry) {
    this.displayHistory.push(assistantEntry);
  }
  if (streamedContainer) {
    if (!streamedContainer.querySelector(".message-header")) {
      const header = document.createElement("div");
      header.className = "message-header";
      header.textContent = "Assistant";
      streamedContainer.prepend(header);
    }
    if (messageMeta) {
      let metaEl = streamedContainer.querySelector(".message-meta");
      if (!metaEl) {
        metaEl = document.createElement("div");
        metaEl.className = "message-meta";
        const header = streamedContainer.querySelector(".message-header");
        if (header) {
          header.insertAdjacentElement("afterend", metaEl);
        } else {
          streamedContainer.prepend(metaEl);
        }
      }
      metaEl.textContent = messageMeta;
    }
    if (thinking && showThinking && streamEventsEl) {
      const existingThinking = streamedContainer.querySelector(
        ".thinking-block, .inline-thinking-block, .stream-event-reasoning"
      );
      const cleanedThinking = dedupeThinking(thinking);
      if (!existingThinking && cleanedThinking) {
        const thinkingBlock = document.createElement("div");
        thinkingBlock.className = "thinking-block collapsed";
        thinkingBlock.innerHTML = `
            <button class="thinking-header" type="button" aria-expanded="false">
              <svg class="chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
              Thought process
            </button>
            <div class="thinking-content">${this.escapeHtml(cleanedThinking)}</div>
          `;
        const targetBody = streamedContainer.querySelector(".step-body");
        const target = targetBody || streamEventsEl;
        const firstChild = target.firstChild;
        if (firstChild) {
          target.insertBefore(thinkingBlock, firstChild);
        } else {
          target.appendChild(thinkingBlock);
        }
        const thinkingHeader2 = thinkingBlock.querySelector(".thinking-header");
        if (thinkingHeader2) {
          thinkingHeader2.addEventListener("click", () => {
            const block = thinkingHeader2.closest(".thinking-block");
            if (!block || block.classList.contains("thinking-hidden")) return;
            block.classList.toggle("collapsed");
            const expanded = !block.classList.contains("collapsed");
            thinkingHeader2.setAttribute("aria-expanded", expanded ? "true" : "false");
          });
        }
      }
    }
    if (streamEventsEl) {
      const textEvents = streamedContainer.querySelectorAll(".stream-event-text");
      Array.from(textEvents).forEach((el) => el.remove());
      if (content && content.trim() !== "") {
        const textEvent = document.createElement("div");
        textEvent.className = "stream-event stream-event-text";
        textEvent.innerHTML = this.renderMarkdown(content);
        streamEventsEl.appendChild(textEvent);
      }
      const toolRows = streamEventsEl.querySelectorAll(".tool-row");
      if (toolRows.length > 0) {
        const errorCount = streamEventsEl.querySelectorAll(".tool-row.error").length;
        const label = `${toolRows.length} tool call${toolRows.length !== 1 ? "s" : ""}${errorCount > 0 ? ` \xB7 ${errorCount} error${errorCount !== 1 ? "s" : ""}` : ""}`;
        const toggle = document.createElement("button");
        toggle.className = "tool-group-toggle";
        toggle.type = "button";
        toggle.innerHTML = `
          <svg class="tool-group-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
          <span>${label}</span>
        `;
        toggle.addEventListener("click", () => {
          streamEventsEl.classList.toggle("tools-collapsed");
        });
        toolRows[0].insertAdjacentElement("beforebegin", toggle);
        streamEventsEl.classList.add("tools-collapsed");
      }
    }
    this.scrollToBottom();
    this.updateStatus("Ready", "success");
    this.elements.composer?.classList.remove("running");
    this.stopWatchdog?.();
    this.stopRunTimer?.();
    this.pendingToolCount = 0;
    this.updateActivityState();
    this.persistHistory();
    this.updateChatEmptyState();
    return;
  }
  const messageDiv = document.createElement("div");
  messageDiv.className = "message assistant";
  let html = `<div class="message-header">Assistant</div>`;
  if (messageMeta) {
    html += `<div class="message-meta">${this.escapeHtml(messageMeta)}</div>`;
  }
  if (thinking && showThinking) {
    const cleanedThinking = dedupeThinking(thinking);
    html += `
        <div class="thinking-block collapsed">
          <button class="thinking-header" type="button" aria-expanded="false">
            <svg class="chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
            Thought process
          </button>
          <div class="thinking-content">${this.escapeHtml(cleanedThinking)}</div>
        </div>
      `;
  }
  if (content && content.trim() !== "") {
    const renderedContent = this.renderMarkdown(content);
    html += `<div class="message-content markdown-body">${renderedContent}</div>`;
  }
  messageDiv.innerHTML = html;
  const thinkingHeader = messageDiv.querySelector(".thinking-header");
  if (thinkingHeader) {
    thinkingHeader.addEventListener("click", () => {
      const block = thinkingHeader.closest(".thinking-block");
      if (!block || block.classList.contains("thinking-hidden")) return;
      block.classList.toggle("collapsed");
      const expanded = !block.classList.contains("collapsed");
      thinkingHeader.setAttribute("aria-expanded", expanded ? "true" : "false");
    });
  }
  if (this.lastChatTurn) {
    this.lastChatTurn.appendChild(messageDiv);
  } else {
    this.elements.chatMessages.appendChild(messageDiv);
  }
  this.scrollToBottom();
  this.updateStatus("Ready", "success");
  this.elements.composer?.classList.remove("running");
  this.stopWatchdog?.();
  this.stopRunTimer?.();
  this.pendingToolCount = 0;
  this.updateActivityState();
  this.persistHistory();
  this.updateChatEmptyState();
};

// packages/extension/sidepanel/ui/chat/panel-context.ts
SidePanelUI.prototype.updateContextUsage = function updateContextUsage(actualTokens = null) {
  let approxTokens;
  if (actualTokens !== null && actualTokens > 0) {
    this.sessionTokensUsed = Math.max(this.sessionTokensUsed || 0, actualTokens);
    approxTokens = this.sessionTokensUsed;
  } else {
    const joined = this.contextHistory.map((msg) => {
      if (!msg) return "";
      if (typeof msg.content === "string") return msg.content;
      if (Array.isArray(msg.content)) {
        return msg.content.map((p) => {
          if (typeof p === "string") return p;
          if (p?.text) return p.text;
          if (p?.content) return JSON.stringify(p.content);
          if (p?.output) {
            const output = p.output?.value ?? p.output;
            if (typeof output === "string") return output;
            try {
              return JSON.stringify(output);
            } catch {
              return String(output);
            }
          }
          return "";
        }).join("");
      }
      return "";
    }).join("\n");
    const chars = joined.length;
    const baseTokens = this.estimateBaseContextTokens();
    const estimated = baseTokens + Math.ceil(chars / 4);
    approxTokens = Math.max(estimated, this.sessionTokensUsed || 0);
  }
  const maxContextTokens = this.getConfiguredContextLimit();
  const percent = Math.min(100, Math.round(approxTokens / maxContextTokens * 100));
  this.contextUsage = { approxTokens, maxContextTokens, percent };
  this.updateActivityState();
};
SidePanelUI.prototype.getConfiguredContextLimit = function getConfiguredContextLimit() {
  const active = this.configs[this.currentConfig] || {};
  const configured = active.contextLimit || Number.parseInt(this.elements.contextLimit?.value) || 2e5;
  return configured;
};
SidePanelUI.prototype.estimateBaseContextTokens = function estimateBaseContextTokens() {
  const active = this.configs[this.currentConfig] || {};
  const prompt = active.systemPrompt || this.getDefaultSystemPrompt();
  const promptTokens = Math.ceil((prompt?.length || 0) / 4);
  const toolBudget = 1200;
  return promptTokens + toolBudget;
};

// packages/shared/src/runtime-messages.ts
var RUNTIME_MESSAGE_SCHEMA_VERSION = 2;
var runtimeMessageTypes = [
  "user_run_start",
  "assistant_stream_start",
  "assistant_stream_delta",
  "assistant_stream_stop",
  "tool_execution_start",
  "tool_execution_result",
  "plan_update",
  "manual_plan_update",
  "run_status",
  "assistant_response",
  "assistant_final",
  "run_error",
  "run_warning",
  "context_compacted",
  "subagent_start",
  "subagent_complete"
];
function isRuntimeMessage(value) {
  if (!value || typeof value !== "object") return false;
  const message = value;
  if (message.schemaVersion !== RUNTIME_MESSAGE_SCHEMA_VERSION) return false;
  if (typeof message.type !== "string") return false;
  if (!runtimeMessageTypes.includes(message.type)) return false;
  if (typeof message.runId !== "string" || !message.runId) return false;
  if (typeof message.sessionId !== "string" || !message.sessionId) return false;
  if (typeof message.timestamp !== "number") return false;
  return true;
}

// packages/extension/sidepanel/ui/core/panel-navigation.ts
var PANEL_SELECTOR = ".right-panel-content";
var setSidebarOpen = (elements, open) => {
  elements.sidebar?.classList.toggle("closed", !open);
  document.body.classList.toggle("sidebar-open", open);
  if (!open) {
    document.body.removeAttribute("data-right-panel");
  }
};
var showRightPanel = (elements, panelName) => {
  const container = elements.rightPanelPanels ?? elements.rightPanel;
  if (!container) return;
  const panels = container.querySelectorAll(PANEL_SELECTOR);
  panels.forEach((panel) => panel.classList.add("hidden"));
  if (!panelName) {
    document.body.removeAttribute("data-right-panel");
    return;
  }
  const targetPanel = container.querySelector(`${PANEL_SELECTOR}[data-panel="${panelName}"]`);
  targetPanel?.classList.remove("hidden");
  document.body.dataset.rightPanel = panelName;
};
var updateNavActive = (elements, navName) => {
  elements.navHistoryBtn?.classList.remove("active");
  elements.navSettingsBtn?.classList.remove("active");
  switch (navName) {
    case "history":
      elements.navHistoryBtn?.classList.add("active");
      break;
    case "settings":
      elements.navSettingsBtn?.classList.add("active");
      break;
  }
};
var bindSidebarNavigation = (elements, handlers) => {
  elements.openSidebarBtn?.addEventListener("click", () => {
    const sidebar = elements.sidebar;
    if (!sidebar) {
      handlers.onOpen();
      return;
    }
    if (sidebar.classList.contains("closed")) {
      handlers.onOpen();
    } else {
      handlers.onClose();
    }
  });
  elements.closeSidebarBtn?.addEventListener("click", handlers.onClose);
  elements.sidebarScrim?.addEventListener("click", handlers.onClose);
  elements.navHistoryBtn?.addEventListener("click", handlers.onHistory);
  elements.navSettingsBtn?.addEventListener("click", handlers.onSettings);
};

// packages/extension/sidepanel/ui/core/panel-core.ts
SidePanelUI.prototype.init = async function init() {
  try {
    this.setupEventListeners();
    this.setupPlanDrawer();
    this.setupResizeObserver();
    setSidebarOpen(this.elements, false);
    await this.loadSettings();
    await this.loadHistoryList();
    this.updateStatus("Ready", "success");
    this.updateModelDisplay();
    this.fetchAvailableModels();
    this.updateChatEmptyState?.();
  } catch (error) {
    console.error("[Parchi] init() failed:", error);
    this.updateStatus("Initialization failed - check console", "error");
  }
};
SidePanelUI.prototype.setupEventListeners = function setupEventListeners() {
  bindSidebarNavigation(this.elements, {
    onOpen: () => this.openSettingsPanel(),
    onClose: () => this.closeSidebar(),
    onHistory: () => this.openHistoryPanel(),
    onSettings: () => this.openSettingsPanel()
  });
  this.elements.startNewSessionBtn?.addEventListener("click", () => this.startNewSession());
  this.elements.newSessionFab?.addEventListener("click", () => this.startNewSession());
  this.elements.clearHistoryBtn?.addEventListener("click", () => this.clearAllHistory());
  this.elements.provider?.addEventListener("change", () => {
    this.toggleCustomEndpoint();
    this.updateScreenshotToggleState();
  });
  this.elements.customEndpoint?.addEventListener("input", () => this.validateCustomEndpoint());
  this.elements.temperature?.addEventListener("input", () => {
    if (this.elements.temperatureValue) {
      this.elements.temperatureValue.textContent = this.elements.temperature.value;
    }
  });
  this.elements.newConfigBtn?.addEventListener("click", () => this.createNewConfig());
  this.elements.newProfileInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      this.createNewConfig();
    }
  });
  this.elements.deleteConfigBtn?.addEventListener("click", () => this.deleteConfig());
  this.elements.activeConfig?.addEventListener("change", () => this.switchConfig());
  this.elements.settingsTabSetupBtn?.addEventListener("click", () => this.switchSettingsTab("setup"));
  this.elements.settingsTabModelBtn?.addEventListener("click", () => this.switchSettingsTab("model"));
  this.elements.settingsTabBrowserBtn?.addEventListener("click", () => this.switchSettingsTab("browser"));
  this.elements.settingsTabNetworkBtn?.addEventListener("click", () => this.switchSettingsTab("network"));
  this.elements.settingsTabProfilesBtn?.addEventListener("click", () => this.switchSettingsTab("profiles"));
  this.elements.createProfileBtn?.addEventListener("click", () => this.createProfileFromInput());
  this.elements.agentGrid?.addEventListener("click", (event) => {
    const deleteBtn = event.target?.closest(".agent-card-delete");
    if (deleteBtn) {
      event.stopPropagation();
      const profileName = deleteBtn.dataset.deleteProfile;
      if (profileName) this.deleteProfileByName(profileName);
      return;
    }
    const pill = event.target?.closest(".role-pill");
    if (pill) {
      const role = pill.dataset.role;
      const profile = pill.dataset.profile;
      this.assignProfileRole(profile, role);
      return;
    }
    const card = event.target?.closest(".agent-card");
    if (card) {
      const profile = card.dataset.profile;
      this.editProfile(profile);
    }
  });
  this.elements.refreshProfilesBtn?.addEventListener("click", () => this.renderProfileGrid());
  this.elements.enableScreenshots?.addEventListener("change", () => this.updateScreenshotToggleState());
  this.elements.visionProfile?.addEventListener("change", () => this.updateScreenshotToggleState());
  this.elements.sendScreenshotsAsImages?.addEventListener("change", () => this.updateScreenshotToggleState());
  this.elements.saveSettingsBtn?.addEventListener("click", () => {
    void this.saveSettings();
  });
  this.elements.saveRelayBtn?.addEventListener("click", async () => {
    await this.persistAllSettings({ silent: false });
    try {
      await chrome.runtime.sendMessage({ type: "relay_reconfigure" });
    } catch {
    }
  });
  this.elements.copyRelayEnvBtn?.addEventListener("click", async () => {
    const rawUrl = String(this.elements.relayUrl?.value || "").trim();
    const token = String(this.elements.relayToken?.value || "").trim();
    if (!rawUrl) {
      this.updateStatus("Enter a relay URL first", "warning");
      return;
    }
    if (!token) {
      this.updateStatus("Enter a relay token first", "warning");
      return;
    }
    let host = "127.0.0.1";
    let port = "17373";
    try {
      const url = new URL(rawUrl);
      host = url.hostname || host;
      port = url.port || port;
    } catch {
      const cleaned = rawUrl.replace(/^https?:\/\//, "");
      const [h, p] = cleaned.split(":");
      if (h) host = h;
      if (p) port = p;
    }
    const text = `export PARCHI_RELAY_TOKEN="${token}"
export PARCHI_RELAY_HOST="${host}"
export PARCHI_RELAY_PORT="${port}"`;
    try {
      await navigator.clipboard.writeText(text);
      this.updateStatus("Relay env vars copied", "success");
    } catch {
      this.updateStatus("Unable to copy relay env vars", "error");
    }
  });
  this.elements.cancelSettingsBtn?.addEventListener("click", () => {
    void this.cancelSettings();
  });
  this.elements.exportSettingsBtn?.addEventListener("click", () => this.exportSettings());
  this.elements.importSettingsBtn?.addEventListener("click", () => {
    this.elements.importSettingsInput?.click();
  });
  this.elements.importSettingsInput?.addEventListener("change", (event) => this.importSettings(event));
  this.elements.sendBtn?.addEventListener("click", () => {
    if (this.elements.composer?.classList.contains("running")) {
      try {
        void chrome.runtime.sendMessage({ type: "stop_run", sessionId: this.sessionId });
      } catch {
      }
      this.stopWatchdog?.();
      this.stopThinkingTimer?.();
      this.stopRunTimer?.();
      this.elements.composer?.classList.remove("running");
      this.pendingTurnDraft = null;
      this.pendingToolCount = 0;
      this.isStreaming = false;
      this.activeToolName = null;
      this.updateActivityState();
      this.finishStreamingMessage();
      this.clearErrorBanner?.();
      this.updateStatus("Stopped", "warning");
    } else {
      this.sendMessage();
    }
  });
  this.elements.userInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  });
  const userInput = this.elements.userInput;
  userInput?.addEventListener("input", () => {
    userInput.style.height = "auto";
    userInput.style.height = `${userInput.scrollHeight}px`;
  });
  this.elements.modelSelect?.addEventListener("change", () => {
    void this.handleModelSelectChange();
  });
  this.elements.fileBtn?.addEventListener("click", () => {
    this.elements.fileInput?.click();
  });
  this.elements.fileInput?.addEventListener("change", (event) => this.handleFileSelection(event));
  this.elements.zoomInBtn?.addEventListener("click", () => this.adjustUiZoom(0.05));
  this.elements.zoomOutBtn?.addEventListener("click", () => this.adjustUiZoom(-0.05));
  this.elements.zoomResetBtn?.addEventListener("click", () => this.applyUiZoom(1));
  this.elements.uiZoom?.addEventListener("input", () => {
    const value = Number.parseFloat(this.elements.uiZoom.value || "1");
    this.applyUiZoom(value);
  });
  this.elements.tabSelectorBtn?.addEventListener("click", () => this.toggleTabSelector());
  this.elements.closeTabSelector?.addEventListener("click", () => this.closeTabSelector());
  this.elements.tabSelectorAddActive?.addEventListener("click", () => this.addActiveTabToSelection());
  this.elements.tabSelectorClear?.addEventListener("click", () => this.clearSelectedTabs());
  const tabBackdrop = this.elements.tabSelector?.querySelector(".modal-backdrop");
  tabBackdrop?.addEventListener("click", () => this.closeTabSelector());
  this.elements.exportBtn?.addEventListener("click", () => this.showExportMenu());
  this.elements.chatMessages?.addEventListener("scroll", () => this.handleChatScroll());
  this.elements.scrollToLatestBtn?.addEventListener("click", () => this.scrollToBottom({ force: true }));
  this.elements.profileEditorProvider?.addEventListener("change", () => this.toggleProfileEditorEndpoint());
  this.elements.profileEditorHeaders?.addEventListener("input", () => this.validateProfileEditorHeaders());
  this.elements.profileEditorTemperature?.addEventListener("input", () => {
    if (this.elements.profileEditorTemperatureValue) {
      this.elements.profileEditorTemperatureValue.textContent = this.elements.profileEditorTemperature.value;
    }
  });
  this.elements.saveProfileBtn?.addEventListener("click", () => this.saveProfileEdits());
  this.elements.refreshProfileJsonBtn?.addEventListener("click", () => this.refreshProfileJsonEditor());
  this.elements.copyProfileJsonBtn?.addEventListener("click", () => this.copyProfileJsonEditor());
  this.elements.applyProfileJsonBtn?.addEventListener("click", () => this.applyProfileJsonEditor());
  this.elements.customHeaders?.addEventListener("input", () => this.validateCustomHeaders());
  chrome.runtime.onMessage.addListener((message) => {
    if (isRuntimeMessage(message)) {
      this.handleRuntimeMessage(message);
    }
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (!changes.relayConnected && !changes.relayLastError) return;
    const next = {};
    if (changes.relayConnected) next.relayConnected = changes.relayConnected.newValue;
    if (changes.relayLastError) next.relayLastError = changes.relayLastError.newValue;
    this.updateRelayStatusFromSettings?.(next);
  });
};
SidePanelUI.prototype.setupResizeObserver = function setupResizeObserver() {
  if (!this.elements.chatMessages || typeof ResizeObserver === "undefined") return;
  this.chatResizeObserver = new ResizeObserver(() => {
    if (this.shouldAutoScroll() && this.isNearBottom) {
      this.scrollToBottom();
    }
  });
  this.chatResizeObserver.observe(this.elements.chatMessages);
};
SidePanelUI.prototype.startWatchdog = function startWatchdog() {
  this.stopWatchdog();
  this._lastRuntimeMessageAt = Date.now();
  this._watchdogTimerId = setInterval(() => {
    const isRunning = this.elements.composer?.classList.contains("running");
    if (!isRunning) {
      this.stopWatchdog();
      return;
    }
    const silence = Date.now() - this._lastRuntimeMessageAt;
    if (silence > 9e4) {
      this.recoverFromStuckState();
    }
  }, 15e3);
};
SidePanelUI.prototype.stopWatchdog = function stopWatchdog() {
  if (this._watchdogTimerId != null) {
    clearInterval(this._watchdogTimerId);
    this._watchdogTimerId = null;
  }
};
SidePanelUI.prototype.recoverFromStuckState = function recoverFromStuckState() {
  this.stopWatchdog();
  this.stopThinkingTimer?.();
  this.stopRunTimer?.();
  this.elements.composer?.classList.remove("running");
  this.pendingTurnDraft = null;
  this.pendingToolCount = 0;
  this.isStreaming = false;
  this.activeToolName = null;
  this.updateActivityState();
  this.finishStreamingMessage();
  this.showErrorBanner("Connection lost \u2014 the background service may have restarted. You can send a new message.", {
    category: "timeout",
    action: "Try sending your message again."
  });
  this.updateStatus("Disconnected", "error");
};
SidePanelUI.prototype.handleRuntimeMessage = function handleRuntimeMessage(message) {
  this._lastRuntimeMessageAt = Date.now();
  if (message?.sessionId && typeof message.sessionId === "string" && message.sessionId !== this.sessionId) {
    return;
  }
  if (message.type === "assistant_stream_start") {
    this.streamingReasoning = "";
    this.handleAssistantStream({ status: "start" });
    return;
  }
  if (message.type === "assistant_stream_delta") {
    if (message.channel === "reasoning") {
      const delta = message.content || "";
      this.streamingReasoning = `${this.streamingReasoning}${delta}`;
      this.latestThinking = this.streamingReasoning;
      if (!this.streamingState) {
        this.startStreamingMessage();
      }
      this.updateStreamReasoning(delta);
      return;
    }
    this.handleAssistantStream({ status: "delta", content: message.content });
    return;
  }
  if (message.type === "assistant_stream_stop") {
    this.handleAssistantStream({ status: "stop" });
    return;
  }
  if (message.type === "run_status") {
    const phase = typeof message.phase === "string" ? message.phase : "";
    if (phase === "stopped" || phase === "failed" || phase === "completed") {
      this.stopWatchdog?.();
      this.stopThinkingTimer?.();
      this.stopRunTimer?.();
      this.elements.composer?.classList.remove("running");
      this.pendingTurnDraft = null;
      this.pendingToolCount = 0;
      this.isStreaming = false;
      this.activeToolName = null;
      this.updateActivityState();
      this.finishStreamingMessage();
    }
    if (phase === "stopped") {
      this.updateStatus(message.note || "Stopped", "warning");
    } else if (phase === "failed") {
      this.updateStatus(message.note || "Failed", "error");
    } else if (phase === "completed") {
      this.updateStatus(message.note || "Ready", "success");
    } else if (phase) {
      this.updateStatus(message.note || phase, "active");
    }
    return;
  }
  if (message.type === "plan_update") {
    this.applyPlanUpdate(message.plan);
    if (!this.isReplayingHistory && this.pendingTurnDraft?.userMessage) {
      const now = Date.now();
      const turnId = message.turnId || `turn-${now}`;
      const existing = this.historyTurnMap.get(turnId);
      const entry = existing || {
        id: turnId,
        startedAt: this.pendingTurnDraft.startedAt,
        userMessage: this.pendingTurnDraft.userMessage,
        plan: null,
        toolEvents: []
      };
      entry.plan = message.plan;
      this.historyTurnMap.set(turnId, entry);
    }
    return;
  }
  if (message.type === "manual_plan_update") {
    this.applyManualPlanUpdate(message.steps);
    return;
  }
  if (message.type === "tool_execution_start") {
    this.pendingToolCount += 1;
    this.clearErrorBanner();
    this.updateActivityState();
    this.activeToolName = message.tool || null;
    if (!this.streamingState) {
      this.startStreamingMessage();
    }
    if (typeof message.stepIndex === "number") {
      this.ensureStepContainer(message.stepIndex, message.stepTitle);
    }
    if (!this.isReplayingHistory && this.pendingTurnDraft?.userMessage) {
      const now = Date.now();
      const turnId = message.turnId || `turn-${now}`;
      const existing = this.historyTurnMap.get(turnId);
      const entry = existing || {
        id: turnId,
        startedAt: this.pendingTurnDraft.startedAt,
        userMessage: this.pendingTurnDraft.userMessage,
        plan: this.currentPlan || null,
        toolEvents: []
      };
      entry.toolEvents.push({
        type: "tool_execution_start",
        tool: message.tool,
        id: message.id,
        args: message.args,
        stepIndex: message.stepIndex,
        stepTitle: message.stepTitle,
        timestamp: message.timestamp
      });
      this.historyTurnMap.set(turnId, entry);
    }
    this.displayToolExecution(message.tool, message.args, null, message.id);
    return;
  }
  if (message.type === "tool_execution_result") {
    this.pendingToolCount = Math.max(0, this.pendingToolCount - 1);
    this.updateActivityState();
    this.activeToolName = null;
    if (!this.streamingState) {
      this.startStreamingMessage();
    }
    if (typeof message.stepIndex === "number") {
      this.ensureStepContainer(message.stepIndex, message.stepTitle);
    }
    if (!this.isReplayingHistory && this.pendingTurnDraft?.userMessage) {
      const now = Date.now();
      const turnId = message.turnId || `turn-${now}`;
      const existing = this.historyTurnMap.get(turnId);
      const entry = existing || {
        id: turnId,
        startedAt: this.pendingTurnDraft.startedAt,
        userMessage: this.pendingTurnDraft.userMessage,
        plan: this.currentPlan || null,
        toolEvents: []
      };
      entry.toolEvents.push({
        type: "tool_execution_result",
        tool: message.tool,
        id: message.id,
        args: message.args,
        result: message.result,
        stepIndex: message.stepIndex,
        stepTitle: message.stepTitle,
        timestamp: message.timestamp
      });
      this.historyTurnMap.set(turnId, entry);
    }
    this.displayToolExecution(message.tool, message.args, message.result, message.id);
    return;
  }
  if (message.type === "assistant_final") {
    if (!this.isReplayingHistory && this.pendingTurnDraft?.userMessage) {
      const now = Date.now();
      const turnId = message.turnId || `turn-${now}`;
      const existing = this.historyTurnMap.get(turnId);
      const entry = existing || {
        id: turnId,
        startedAt: this.pendingTurnDraft.startedAt,
        userMessage: this.pendingTurnDraft.userMessage,
        plan: this.currentPlan || null,
        toolEvents: []
      };
      entry.assistantFinal = {
        content: message.content,
        thinking: message.thinking || null,
        model: message.model || null,
        usage: message.usage || null
      };
      this.historyTurnMap.set(turnId, entry);
    }
    this.displayAssistantMessage(message.content, message.thinking, message.usage, message.model);
    this.appendContextMessages(message.responseMessages, message.content, message.thinking);
    if (message.usage?.inputTokens) {
      this.updateContextUsage(message.usage.inputTokens);
    } else if (message.contextUsage?.approxTokens) {
      this.updateContextUsage(message.contextUsage.approxTokens);
    } else {
      this.updateContextUsage();
    }
    if (!this.isReplayingHistory) {
      this.pendingTurnDraft = null;
    }
    return;
  }
  if (message.type === "context_compacted") {
    this.handleContextCompaction(message);
    return;
  }
  if (message.type === "run_error") {
    this.stopWatchdog?.();
    this.stopThinkingTimer?.();
    this.stopRunTimer?.();
    this.elements.composer?.classList.remove("running");
    this.pendingTurnDraft = null;
    this.pendingToolCount = 0;
    this.isStreaming = false;
    this.activeToolName = null;
    this.updateActivityState();
    this.finishStreamingMessage();
    this.showErrorBanner(message.message, {
      category: message.errorCategory,
      action: message.action
    });
    this.updateStatus("Error", "error");
    return;
  }
  if (message.type === "run_warning") {
    this.showErrorBanner(message.message);
    return;
  }
  if (message.type === "subagent_start") {
    this.addSubagent(message.id, message.name, message.tasks);
    this.updateStatus(`Sub-agent "${message.name}" started`, "active");
    return;
  }
  if (message.type === "subagent_complete") {
    const status = message.success ? "completed" : "error";
    this.updateSubagentStatus(message.id, status, message.summary);
    if (message.success) {
      this.updateStatus(`Sub-agent "${message.name || message.id}" completed`, "success");
    } else {
      this.updateStatus(`Sub-agent "${message.name || message.id}" failed`, "error");
    }
    return;
  }
};
SidePanelUI.prototype.appendContextMessages = function appendContextMessages(responseMessages, fallbackContent, fallbackThinking) {
  if (!responseMessages || responseMessages.length === 0) {
    const assistantEntry = createMessage({
      role: "assistant",
      content: fallbackContent || "",
      thinking: fallbackThinking || null
    });
    if (assistantEntry) {
      this.contextHistory.push(assistantEntry);
    }
    return;
  }
  const normalized = normalizeConversationHistory(responseMessages);
  this.contextHistory.push(...normalized);
};
SidePanelUI.prototype.handleContextCompaction = function handleContextCompaction(message) {
  const normalized = normalizeConversationHistory(message.contextMessages);
  this.contextHistory = normalized;
  this.sessionId = message.newSessionId || this.sessionId;
  const summaryText = message.summary || "Context compacted.";
  const summaryEntry = createMessage({
    role: "system",
    content: summaryText,
    meta: {
      kind: "summary",
      summaryOfCount: message.trimmedCount,
      source: "auto"
    }
  });
  if (summaryEntry) {
    this.displayHistory.push(summaryEntry);
    this.displaySummaryMessage(summaryEntry);
  }
  if (message.contextUsage?.approxTokens) {
    this.updateContextUsage(message.contextUsage.approxTokens);
  }
};

// packages/extension/sidepanel/ui/chat/panel-export.ts
SidePanelUI.prototype.showExportMenu = function showExportMenu() {
  const existing = document.getElementById("exportMenu");
  if (existing) {
    existing.remove();
    return;
  }
  const menu = document.createElement("div");
  menu.id = "exportMenu";
  menu.className = "export-menu";
  menu.innerHTML = `
    <div class="export-menu-content">
      <div class="export-menu-header">
        <span>Export</span>
        <button class="export-menu-close" title="Close">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="export-menu-options">
        <button class="export-option" data-action="conversation">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <span>
            <strong>Full Conversation</strong>
            <small>Export all messages as markdown</small>
          </span>
        </button>
        <button class="export-option" data-action="response">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
          <span>
            <strong>Last Response</strong>
            <small>Export just the last assistant message</small>
          </span>
        </button>
        <button class="export-option" data-action="turns">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
            <line x1="3" y1="6" x2="3.01" y2="6"></line>
            <line x1="3" y1="12" x2="3.01" y2="12"></line>
            <line x1="3" y1="18" x2="3.01" y2="18"></line>
          </svg>
          <span>
            <strong>Detailed Turns</strong>
            <small>Export with tool events and plans</small>
          </span>
        </button>
      </div>
    </div>
  `;
  const btn = this.elements.exportBtn;
  if (btn) {
    const rect = btn.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
  }
  const closeBtn = menu.querySelector(".export-menu-close");
  closeBtn?.addEventListener("click", () => menu.remove());
  menu.querySelectorAll(".export-option").forEach((option) => {
    option.addEventListener("click", () => {
      const action = option.dataset.action;
      menu.remove();
      switch (action) {
        case "conversation":
          this.exportConversationToMarkdown();
          break;
        case "response":
          this.exportLastResponseToMarkdown();
          break;
        case "turns":
          this.exportTurnsToMarkdown();
          break;
      }
    });
  });
  const closeOnOutside = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener("click", closeOnOutside);
    }
  };
  setTimeout(() => document.addEventListener("click", closeOnOutside), 0);
  document.body.appendChild(menu);
};
SidePanelUI.prototype.exportConversationToMarkdown = function exportConversationToMarkdown() {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `conversation-${timestamp}.md`;
  let markdown = "";
  markdown += "# Conversation Export\n\n";
  markdown += `**Exported:** ${(/* @__PURE__ */ new Date()).toLocaleString()}
`;
  markdown += `**Session ID:** ${this.sessionId || "unknown"}

`;
  markdown += "---\n\n";
  if (this.displayHistory && this.displayHistory.length > 0) {
    for (const entry of this.displayHistory) {
      if (entry.role === "user") {
        markdown += "## User\n\n";
        markdown += `${this.extractTextContent(entry.content)}

`;
      } else if (entry.role === "assistant") {
        markdown += "## Assistant\n\n";
        if (entry.thinking) {
          markdown += `<details>
<summary>Thinking</summary>

${entry.thinking}

</details>

`;
        }
        markdown += `${this.extractTextContent(entry.content)}

`;
      } else if (entry.role === "system" && entry.meta?.kind === "summary") {
        markdown += `> **Context Summary:** ${this.extractTextContent(entry.content)}

`;
      }
    }
  }
  if (this.historyTurnMap && this.historyTurnMap.size > 0) {
    markdown += "---\n\n## Tool Events\n\n";
    this.historyTurnMap.forEach((turn, _turnId) => {
      if (turn.toolEvents && turn.toolEvents.length > 0) {
        markdown += `### Turn: ${turn.userMessage?.substring(0, 50) || "Unknown"}...

`;
        for (const event of turn.toolEvents) {
          if (event.type === "tool_execution_start") {
            markdown += `**${event.tool}**`;
            if (event.args && Object.keys(event.args).length > 0) {
              markdown += ` \`${JSON.stringify(event.args).substring(0, 100)}\``;
            }
            markdown += "\n";
          } else if (event.type === "tool_execution_result") {
            const resultPreview = event.result ? JSON.stringify(event.result).substring(0, 200) : "no result";
            markdown += `  \u2192 ${resultPreview}${resultPreview.length >= 200 ? "..." : ""}

`;
          }
        }
      }
    });
  }
  if (this.subagents && this.subagents.size > 0) {
    markdown += "---\n\n## Subagents\n\n";
    this.subagents.forEach((agent, _id) => {
      markdown += `- **${agent.name}** (${agent.status})
`;
      if (agent.tasks && agent.tasks.length > 0) {
        for (const task of agent.tasks) {
          markdown += `  - ${task}
`;
        }
      }
      markdown += "\n";
    });
  }
  if (this.currentPlan && this.currentPlan.steps) {
    markdown += "---\n\n## Plan\n\n";
    for (let i = 0; i < this.currentPlan.steps.length; i++) {
      const step = this.currentPlan.steps[i];
      const checkbox = step.status === "done" ? "[x]" : "[ ]";
      markdown += `${checkbox} ${step.title}
`;
    }
    markdown += "\n";
  }
  if (this.sessionTokenTotals && (this.sessionTokenTotals.inputTokens || this.sessionTokenTotals.outputTokens)) {
    markdown += "---\n\n## Usage Statistics\n\n";
    markdown += `- **Input tokens:** ${this.sessionTokenTotals.inputTokens.toLocaleString()}
`;
    markdown += `- **Output tokens:** ${this.sessionTokenTotals.outputTokens.toLocaleString()}
`;
    markdown += `- **Total tokens:** ${this.sessionTokenTotals.totalTokens.toLocaleString()}
`;
  }
  this.downloadMarkdown(markdown, filename);
};
SidePanelUI.prototype.exportLastResponseToMarkdown = function exportLastResponseToMarkdown() {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `response-${timestamp}.md`;
  let lastAssistant = null;
  if (this.displayHistory && this.displayHistory.length > 0) {
    for (let i = this.displayHistory.length - 1; i >= 0; i--) {
      if (this.displayHistory[i].role === "assistant") {
        lastAssistant = this.displayHistory[i];
        break;
      }
    }
  }
  if (!lastAssistant) {
    this.updateStatus("No assistant response to export", "warning");
    return;
  }
  let markdown = "";
  if (lastAssistant.thinking) {
    markdown += `<details>
<summary>Thinking</summary>

${lastAssistant.thinking}

</details>

`;
  }
  markdown += `${this.extractTextContent(lastAssistant.content)}
`;
  this.downloadMarkdown(markdown, filename);
};
SidePanelUI.prototype.exportTurnsToMarkdown = function exportTurnsToMarkdown() {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `turns-${timestamp}.md`;
  let markdown = "# Conversation Turns\n\n";
  markdown += `**Exported:** ${(/* @__PURE__ */ new Date()).toLocaleString()}

`;
  markdown += "---\n\n";
  if (!this.historyTurnMap || this.historyTurnMap.size === 0) {
    markdown += "No turn data available.\n";
    this.downloadMarkdown(markdown, filename);
    return;
  }
  this.historyTurnMap.forEach((turn, turnId) => {
    markdown += `## Turn ${turnId}

`;
    markdown += `**User:** ${turn.userMessage || "N/A"}

`;
    if (turn.plan && turn.plan.steps) {
      markdown += "### Plan\n\n";
      for (const step of turn.plan.steps) {
        const checkbox = step.status === "done" ? "[x]" : "[ ]";
        markdown += `${checkbox} ${step.title}
`;
      }
      markdown += "\n";
    }
    if (turn.toolEvents && turn.toolEvents.length > 0) {
      markdown += "### Tool Events\n\n";
      markdown += "| Tool | Args | Result |\n";
      markdown += "|------|------|--------|\n";
      for (const event of turn.toolEvents) {
        if (event.type === "tool_execution_result") {
          const argsPreview = event.args ? JSON.stringify(event.args).substring(0, 50).replace(/\|/g, "\\|") : "";
          const resultPreview = event.result ? JSON.stringify(event.result).substring(0, 80).replace(/\|/g, "\\|") : "";
          markdown += `| ${event.tool} | ${argsPreview} | ${resultPreview} |
`;
        }
      }
      markdown += "\n";
    }
    if (turn.assistantFinal) {
      markdown += "### Assistant Response\n\n";
      if (turn.assistantFinal.thinking) {
        markdown += `<details>
<summary>Thinking</summary>

${turn.assistantFinal.thinking}

</details>

`;
      }
      markdown += `${turn.assistantFinal.content || ""}

`;
    }
    markdown += "---\n\n";
  });
  this.downloadMarkdown(markdown, filename);
};
SidePanelUI.prototype.extractTextContent = function extractTextContent(content) {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object") {
        if (part.type === "text" && part.text) return part.text;
        if (part.type === "tool-result") {
          const output = part.output;
          if (output && typeof output === "object") {
            if (output.type === "text" && output.value) return output.value;
            if (output.type === "json") return JSON.stringify(output.value, null, 2);
            return JSON.stringify(output, null, 2);
          }
          return String(output || "");
        }
        return part.text || part.content || "";
      }
      return "";
    }).join("\n");
  }
  return String(content);
};
SidePanelUI.prototype.downloadMarkdown = function downloadMarkdown(content, filename) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
  this.updateStatus(`Exported to ${filename}`, "success");
};

// packages/shared/src/utils/html.ts
var coerce = (value) => value == null ? "" : String(value);
var escapeHtmlBasic = (value) => {
  const text = coerce(value);
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
};
var escapeHtml = (value) => {
  return escapeHtmlBasic(value).replace(/\n/g, "<br>");
};
var escapeAttribute = (value) => {
  return escapeHtmlBasic(value);
};

// packages/shared/src/utils/json.ts
var safeJsonStringify = (value) => {
  try {
    if (value === void 0) return "";
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

// packages/extension/sidepanel/ui/core/panel-helpers.ts
SidePanelUI.prototype.safeJsonStringify = (value) => safeJsonStringify(value);
SidePanelUI.prototype.truncateText = function truncateText(text, limit = 1200) {
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
};
SidePanelUI.prototype.escapeHtmlBasic = (text) => escapeHtmlBasic(text);
SidePanelUI.prototype.escapeHtml = (text) => escapeHtml(text);
SidePanelUI.prototype.escapeAttribute = (value) => escapeAttribute(value);
SidePanelUI.prototype.createStepContainer = function createStepContainer(stepIndex, title) {
  const el = document.createElement("div");
  el.className = "step-block current";
  el.dataset.stepIndex = String(stepIndex);
  el.innerHTML = `
    <button class="step-header" type="button" aria-expanded="true">
      <span class="step-title">${this.escapeHtmlBasic(`Step ${stepIndex + 1}: ${title}`)}</span>
      <span class="step-meta"></span>
      <span class="step-chevron" aria-hidden="true">\u25BE</span>
    </button>
    <div class="step-content">
      <div class="step-tools"></div>
      <div class="step-body"></div>
    </div>
  `;
  const header = el.querySelector(".step-header");
  header?.addEventListener("click", () => {
    el.classList.toggle("collapsed");
    const expanded = !el.classList.contains("collapsed");
    header.setAttribute("aria-expanded", expanded ? "true" : "false");
  });
  return {
    el,
    toolsEl: el.querySelector(".step-tools") || el,
    bodyEl: el.querySelector(".step-body") || el
  };
};
SidePanelUI.prototype.ensureStepContainer = function ensureStepContainer(stepIndex, stepTitle) {
  if (!this.streamingState?.eventsEl) return null;
  const normalizedIndex = Number.isFinite(stepIndex) ? stepIndex : 0;
  const existing = this.stepTimeline.steps.get(normalizedIndex);
  if (existing) {
    this.setActiveStep(normalizedIndex);
    if (stepTitle) {
      const titleEl = existing.el.querySelector(".step-title");
      if (titleEl) titleEl.textContent = `Step ${normalizedIndex + 1}: ${stepTitle}`;
    }
    return existing;
  }
  const title = stepTitle || `Step ${normalizedIndex + 1}`;
  const created = this.createStepContainer(normalizedIndex, title);
  this.streamingState.eventsEl.appendChild(created.el);
  this.stepTimeline.steps.set(normalizedIndex, created);
  this.setActiveStep(normalizedIndex);
  return created;
};
SidePanelUI.prototype.setActiveStep = function setActiveStep(stepIndex) {
  this.stepTimeline.activeStepIndex = stepIndex;
  const target = this.stepTimeline.steps.get(stepIndex) || null;
  this.stepTimeline.activeStepBody = target?.bodyEl || null;
  this.stepTimeline.steps.forEach((step, idx) => {
    step.el.classList.toggle("current", idx === stepIndex);
  });
};

// packages/extension/sidepanel/ui/history/panel-history.ts
var normalizeStoredSessions = (raw) => {
  if (Array.isArray(raw)) {
    return raw.filter(Boolean);
  }
  if (raw && typeof raw === "object") {
    return Object.values(raw).filter(Boolean);
  }
  return [];
};
var normalizeTranscript = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object") return Object.values(parsed).filter(Boolean);
      return [];
    } catch {
      return [];
    }
  }
  return [];
};
SidePanelUI.prototype.persistHistory = async function persistHistory() {
  const saveEnabled = this.elements.saveHistory?.value !== "false";
  if (!saveEnabled) return;
  if (!this.displayHistory || this.displayHistory.length === 0) return;
  const now = Date.now();
  const turns = Array.from(this.historyTurnMap.values()).filter((turn) => turn && typeof turn === "object").sort((a, b) => Number(a.startedAt || 0) - Number(b.startedAt || 0));
  const entry = {
    id: this.sessionId,
    startedAt: this.sessionStartedAt,
    updatedAt: now,
    title: this.firstUserMessage || "Session",
    messageCount: this.displayHistory.length,
    transcript: this.displayHistory.slice(-200),
    turns
  };
  try {
    const existing = await chrome.storage.local.get(["chatSessions"]);
    const sessions = normalizeStoredSessions(existing.chatSessions);
    const filtered = sessions.filter((s) => s?.id !== entry.id);
    filtered.unshift(entry);
    const trimmed = filtered.slice(0, 50);
    await chrome.storage.local.set({ chatSessions: trimmed });
    this.loadHistoryList();
  } catch (e) {
    console.error("Failed to persist history:", e);
  }
};
SidePanelUI.prototype.loadHistoryList = async function loadHistoryList() {
  if (!this.elements.historyItems) {
    this.elements.historyItems = document.getElementById("historyItems");
  }
  if (!this.elements.historyItems) return;
  const saveEnabled = this.elements.saveHistory?.value !== "false";
  if (!saveEnabled) {
    this.elements.historyItems.innerHTML = '<div class="history-empty">History is off. Enable \u201CSave History\u201D in Settings to see past chats.</div>';
    return;
  }
  try {
    const { chatSessions } = await chrome.storage.local.get(["chatSessions"]);
    const sessions = normalizeStoredSessions(chatSessions);
    this.elements.historyItems.innerHTML = "";
    if (!sessions.length) {
      this.elements.historyItems.innerHTML = '<div class="history-empty">No saved chats yet.</div>';
      return;
    }
    sessions.forEach((session) => {
      const item = document.createElement("div");
      item.className = "history-item";
      const date = new Date(session.updatedAt || session.startedAt || Date.now());
      const transcript = normalizeTranscript(session.transcript);
      const msgCount = session.messageCount || transcript.length || 0;
      const timeAgo = this.formatTimeAgo(date);
      item.innerHTML = `
        <div class="history-item-main">
          <div class="history-title">${this.escapeHtml(session.title || "Untitled Session")}</div>
          <div class="history-meta">
            <span>${timeAgo}</span>
            <span class="history-meta-dot">\xB7</span>
            <span>${msgCount} messages</span>
          </div>
        </div>
        <button class="history-delete" title="Delete" data-session-id="${session.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      `;
      item.querySelector(".history-item-main")?.addEventListener("click", () => {
        this.loadSession(session);
      });
      item.querySelector(".history-delete")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.deleteSession(session.id);
      });
      this.elements.historyItems.appendChild(item);
    });
  } catch (e) {
    console.error("Failed to load history:", e);
    this.elements.historyItems.innerHTML = '<div class="history-empty">Failed to load history.</div>';
  }
};
SidePanelUI.prototype.loadSession = function loadSession(session) {
  this.switchView("chat");
  this.recordScrollPosition();
  const transcript = normalizeTranscript(session.transcript);
  let turns = normalizeTranscript(session.turns);
  if (turns.length > 0 && transcript.length > 0) {
    const normalizedTranscript = normalizeConversationHistory(transcript);
    const userQueue = normalizedTranscript.filter((msg) => msg.role === "user");
    const assistantQueue = normalizedTranscript.filter((msg) => msg.role === "assistant");
    const takeUser = () => userQueue.shift();
    const takeAssistant = () => assistantQueue.shift();
    turns = turns.map((turn) => {
      const updated = { ...turn };
      if (!updated.userMessage) {
        const userMessage = takeUser();
        if (userMessage) {
          updated.userMessage = typeof userMessage.content === "string" ? userMessage.content : this.safeJsonStringify(userMessage.content);
        }
      }
      if (!updated.assistantFinal?.content) {
        const assistantMessage = takeAssistant();
        if (assistantMessage) {
          updated.assistantFinal = {
            content: typeof assistantMessage.content === "string" ? assistantMessage.content : this.safeJsonStringify(assistantMessage.content),
            thinking: assistantMessage.thinking || null
          };
        }
      }
      return updated;
    });
  }
  if (turns.length > 0) {
    this.isReplayingHistory = true;
    try {
      this.displayHistory = [];
      this.contextHistory = [];
      const suffix = typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : String(Date.now());
      this.sessionId = session.id || `session-${suffix}`;
      this.firstUserMessage = session.title || "";
      this.elements.chatMessages.innerHTML = "";
      this.toolCallViews.clear();
      this.resetActivityPanel();
      turns.forEach((turn) => {
        const userText = String(turn.userMessage || "").trim();
        if (userText) {
          this.displayUserMessage(userText);
          const entry = createMessage({ role: "user", content: userText });
          if (entry) {
            this.displayHistory.push(entry);
            this.contextHistory.push(entry);
          }
        }
        if (turn.plan) {
          this.applyPlanUpdate(turn.plan);
        }
        const toolEvents = Array.isArray(turn.toolEvents) ? turn.toolEvents : [];
        toolEvents.forEach((evt) => {
          if (evt && typeof evt === "object" && evt.type === "tool_execution_start") {
            this.handleRuntimeMessage({
              schemaVersion: 2,
              runId: "replay",
              sessionId: this.sessionId,
              turnId: turn.id || "replay",
              timestamp: Number(evt.timestamp || Date.now()),
              type: "tool_execution_start",
              tool: evt.tool,
              id: evt.id,
              args: evt.args || {},
              stepIndex: evt.stepIndex,
              stepTitle: evt.stepTitle
            });
          }
          if (evt && typeof evt === "object" && evt.type === "tool_execution_result") {
            this.handleRuntimeMessage({
              schemaVersion: 2,
              runId: "replay",
              sessionId: this.sessionId,
              turnId: turn.id || "replay",
              timestamp: Number(evt.timestamp || Date.now()),
              type: "tool_execution_result",
              tool: evt.tool,
              id: evt.id,
              args: evt.args || {},
              result: evt.result,
              stepIndex: evt.stepIndex,
              stepTitle: evt.stepTitle
            });
          }
        });
        if (turn.assistantFinal?.content) {
          this.displayAssistantMessage(
            String(turn.assistantFinal.content || ""),
            turn.assistantFinal.thinking || null,
            turn.assistantFinal.usage || null,
            turn.assistantFinal.model || null
          );
        }
      });
      this.updateContextUsage();
      this.updateChatEmptyState();
      this.scrollToBottom({ force: true });
    } finally {
      this.isReplayingHistory = false;
    }
    return;
  }
  if (transcript.length > 0) {
    const normalized = normalizeConversationHistory(transcript || []);
    this.displayHistory = normalized;
    this.contextHistory = normalized;
    const suffix = typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : String(Date.now());
    this.sessionId = session.id || `session-${suffix}`;
    this.firstUserMessage = session.title || "";
    this.renderConversationHistory();
    this.updateContextUsage();
  }
};
SidePanelUI.prototype.deleteSession = async function deleteSession(sessionId) {
  try {
    const { chatSessions } = await chrome.storage.local.get(["chatSessions"]);
    const sessions = normalizeStoredSessions(chatSessions);
    const filtered = sessions.filter((s) => s?.id !== sessionId);
    await chrome.storage.local.set({ chatSessions: filtered });
    this.loadHistoryList();
  } catch (e) {
    console.error("Failed to delete session:", e);
  }
};
SidePanelUI.prototype.clearAllHistory = async function clearAllHistory() {
  if (!confirm("Clear all chat history? This cannot be undone.")) return;
  try {
    await chrome.storage.local.set({ chatSessions: [] });
    this.loadHistoryList();
  } catch (e) {
    console.error("Failed to clear history:", e);
  }
};
SidePanelUI.prototype.formatTimeAgo = function formatTimeAgo(date) {
  const now = /* @__PURE__ */ new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 6e4);
  const hours = Math.floor(diff / 36e5);
  const days = Math.floor(diff / 864e5);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
};
SidePanelUI.prototype.renderConversationHistory = function renderConversationHistory() {
  this.elements.chatMessages.innerHTML = "";
  this.toolCallViews.clear();
  this.lastChatTurn = null;
  this.resetActivityPanel();
  this.displayHistory.forEach((msg) => {
    if (msg.role === "system" || msg.meta?.kind === "summary") {
      this.displaySummaryMessage(msg);
      return;
    }
    if (msg.role === "user") {
      const messageDiv = document.createElement("div");
      messageDiv.className = "message user";
      messageDiv.innerHTML = `
          <div class="message-header">You</div>
          <div class="message-content">${this.escapeHtml(msg.content || "")}</div>
        `;
      this.elements.chatMessages.appendChild(messageDiv);
    } else if (msg.role === "assistant") {
      const rawContent = typeof msg.content === "string" ? msg.content : this.safeJsonStringify(msg.content);
      const parsed = extractThinking(rawContent, msg.thinking || null);
      const messageDiv = document.createElement("div");
      messageDiv.className = "message assistant";
      let html = `<div class="message-header">Assistant</div>`;
      const showThinking = this.elements.showThinking.value === "true";
      if (parsed.thinking && showThinking) {
        const cleanedThinking = dedupeThinking(parsed.thinking);
        html += `
            <div class="thinking-block collapsed">
              <button class="thinking-header" type="button" aria-expanded="false">
                <svg class="chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
                Thinking
              </button>
              <div class="thinking-content">${this.escapeHtml(cleanedThinking)}</div>
            </div>
          `;
      }
      if (parsed.content && parsed.content.trim() !== "") {
        html += `<div class="message-content markdown-body">${this.renderMarkdown(parsed.content)}</div>`;
      }
      messageDiv.innerHTML = html;
      const thinkingHeader = messageDiv.querySelector(".thinking-header");
      if (thinkingHeader) {
        thinkingHeader.addEventListener("click", () => {
          const block = thinkingHeader.closest(".thinking-block");
          if (!block || block.classList.contains("thinking-hidden")) return;
          block.classList.toggle("collapsed");
          const expanded = !block.classList.contains("collapsed");
          thinkingHeader.setAttribute("aria-expanded", expanded ? "true" : "false");
        });
      }
      this.elements.chatMessages.appendChild(messageDiv);
    }
  });
  this.restoreScrollPosition();
  this.updateChatEmptyState();
};

// packages/extension/sidepanel/ui/chat/panel-markdown.ts
SidePanelUI.prototype.renderMarkdown = function renderMarkdown(text) {
  if (!text) return "";
  const escape = (value = "") => this.escapeHtmlBasic(value);
  const escapeAttr = (value = "") => this.escapeAttribute(value);
  let working = String(text).replace(/\r\n/g, "\n");
  const codeBlocks = [];
  const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
  working = working.replace(codeBlockRegex, (_, lang = "", body = "") => {
    const placeholder = `@@CODE_BLOCK_${codeBlocks.length}@@`;
    const languageClass = lang ? ` class="language-${escapeAttr(lang.toLowerCase())}"` : "";
    codeBlocks.push(`<pre><code${languageClass}>${escape(body)}</code></pre>`);
    return placeholder;
  });
  const tables = [];
  const tableRegex = /(?:^|\n)((?:\|[^\n]*)+\|(?:\n|\r?\n?))+/gm;
  working = working.replace(tableRegex, (match) => {
    const placeholder = `@@TABLE_${tables.length}@@`;
    tables.push(this.renderMarkdownTable(match.trim()));
    return placeholder;
  });
  const applyInline = (value = "") => {
    let html2 = escape(value);
    const inlineCode = [];
    html2 = html2.replace(/`([^`]+)`/g, (_, code) => {
      const placeholder = `@@INLINE_CODE_${inlineCode.length}@@`;
      inlineCode.push(`<code>${escape(code)}</code>`);
      return placeholder;
    });
    html2 = html2.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      (_, alt, url) => `<img alt="${escape(alt)}" src="${escapeAttr(url)}">`
    );
    html2 = html2.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_, label, url) => `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
    );
    html2 = html2.replace(
      /(^|[\s(])((?:https?:\/\/|www\.)[^\s<]+[^\s<\.)\],])/gi,
      (_, prefix, rawUrl) => {
        let url = rawUrl;
        let trailing = "";
        while (/[),.\]]$/.test(url)) {
          trailing = url.slice(-1) + trailing;
          url = url.slice(0, -1);
        }
        const href = url.startsWith("http") ? url : `https://${url}`;
        return `${prefix}<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escape(
          url
        )}</a>${trailing}`;
      }
    );
    html2 = html2.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html2 = html2.replace(/__(.+?)__/g, "<strong>$1</strong>");
    html2 = html2.replace(/~~(.+?)~~/g, "<del>$1</del>");
    html2 = html2.replace(/(?<!\*)\*(?!\s)(.+?)\*(?!\*)/g, "<em>$1</em>");
    html2 = html2.replace(/(?<!_)_(?!\s)(.+?)_(?!_)/g, "<em>$1</em>");
    inlineCode.forEach((codeBlock, index) => {
      const placeholder = `@@INLINE_CODE_${index}@@`;
      html2 = html2.split(placeholder).join(codeBlock);
    });
    return html2;
  };
  const lines = working.split("\n");
  const blocks = [];
  let paragraph = [];
  let inUl = false;
  let inOl = false;
  const closeLists = () => {
    if (inUl) {
      blocks.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      blocks.push("</ol>");
      inOl = false;
    }
  };
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${applyInline(paragraph.join("\n"))}</p>`);
    paragraph = [];
  };
  for (const rawLine of lines) {
    const line = rawLine;
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      closeLists();
      continue;
    }
    const placeholderMatch = trimmed.match(/^@@CODE_BLOCK_(\d+)@@$/);
    if (placeholderMatch) {
      flushParagraph();
      closeLists();
      blocks.push(trimmed);
      continue;
    }
    const tableMatch = trimmed.match(/^@@TABLE_(\d+)@@$/);
    if (tableMatch) {
      flushParagraph();
      closeLists();
      blocks.push(trimmed);
      continue;
    }
    if (/^([-*_])(\s*\1){2,}$/.test(trimmed)) {
      flushParagraph();
      closeLists();
      blocks.push("<hr>");
      continue;
    }
    const headingMatch = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      closeLists();
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${applyInline(headingMatch[2])}</h${level}>`);
      continue;
    }
    if (/^\s*>\s*/.test(line)) {
      flushParagraph();
      closeLists();
      blocks.push(`<blockquote>${applyInline(line.replace(/^\s*>\s?/, ""))}</blockquote>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      flushParagraph();
      if (inOl) {
        blocks.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        blocks.push("<ul>");
        inUl = true;
      }
      blocks.push(`<li>${applyInline(line.replace(/^\s*[-*]\s+/, ""))}</li>`);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      flushParagraph();
      if (inUl) {
        blocks.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        blocks.push("<ol>");
        inOl = true;
      }
      blocks.push(`<li>${applyInline(line.replace(/^\s*\d+[.)]\s+/, ""))}</li>`);
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  closeLists();
  let html = blocks.join("");
  codeBlocks.forEach((block, index) => {
    const placeholder = `@@CODE_BLOCK_${index}@@`;
    html = html.split(placeholder).join(block);
  });
  tables.forEach((table, index) => {
    const placeholder = `@@TABLE_${index}@@`;
    html = html.split(placeholder).join(table);
  });
  return html;
};
SidePanelUI.prototype.renderMarkdownTable = function renderMarkdownTable(tableText) {
  const escape = (value = "") => this.escapeHtmlBasic(value);
  const lines = tableText.trim().split("\n").filter((line) => line.trim());
  if (lines.length < 2) return `<p>${escape(tableText)}</p>`;
  const headerLine = lines[0];
  const headers = headerLine.split("|").map((cell) => cell.trim()).filter((cell) => cell);
  const separatorLine = lines[1];
  const isSeparator = /^\s*[-:|\s]+$/.test(separatorLine);
  const bodyStartIndex = isSeparator ? 2 : 1;
  const bodyLines = lines.slice(bodyStartIndex);
  if (headers.length === 0) return `<p>${escape(tableText)}</p>`;
  let html = '<div class="table-wrapper"><table class="markdown-table">';
  html += "<thead><tr>";
  headers.forEach((header) => {
    html += `<th>${escape(header)}</th>`;
  });
  html += "</tr></thead>";
  if (bodyLines.length > 0) {
    html += "<tbody>";
    bodyLines.forEach((rowLine) => {
      const cells = rowLine.split("|").map((cell) => cell.trim()).filter((cell) => cell);
      if (cells.length > 0) {
        html += "<tr>";
        cells.forEach((cell, idx) => {
          const tag = idx === 0 ? "th" : "td";
          html += `<${tag}>${escape(cell)}</${tag}>`;
        });
        for (let i = cells.length; i < headers.length; i++) {
          html += "<td></td>";
        }
        html += "</tr>";
      }
    });
    html += "</tbody>";
  }
  html += "</table></div>";
  return html;
};

// packages/extension/sidepanel/ui/chat/panel-plan.ts
SidePanelUI.prototype.setupPlanDrawer = function setupPlanDrawer() {
  this.elements.planDrawerToggle?.addEventListener("click", (e) => {
    if (e.target.closest(".plan-drawer-actions")) return;
    this.togglePlanDrawer();
  });
  this.elements.planClearBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    this.clearPlan();
  });
};
SidePanelUI.prototype.togglePlanDrawer = function togglePlanDrawer() {
  this.elements.planDrawer?.classList.toggle("collapsed");
};
SidePanelUI.prototype.showPlanDrawer = function showPlanDrawer() {
  this.elements.planDrawer?.classList.remove("hidden");
  this.elements.planDrawer?.classList.remove("collapsed");
};
SidePanelUI.prototype.hidePlanDrawer = function hidePlanDrawer() {
  this.elements.planDrawer?.classList.add("hidden");
};
SidePanelUI.prototype.clearPlan = function clearPlan() {
  this.currentPlan = null;
  this.hidePlanDrawer();
  if (this.elements.planChecklist) {
    this.elements.planChecklist.innerHTML = "";
  }
};
SidePanelUI.prototype.renderPlanDrawer = function renderPlanDrawer(plan) {
  if (!plan || !plan.steps || plan.steps.length === 0) {
    this.hidePlanDrawer();
    return;
  }
  const steps = plan.steps;
  const completedCount = steps.filter((s) => s.status === "done").length;
  const totalCount = steps.length;
  if (this.elements.planStepCount) {
    this.elements.planStepCount.textContent = completedCount === totalCount ? `${totalCount} steps \xB7 Done` : `${completedCount}/${totalCount} steps`;
  }
  if (this.elements.planChecklist) {
    this.elements.planChecklist.innerHTML = steps.map((step, index) => {
      const isDone = step.status === "done";
      const isBlocked = step.status === "blocked";
      const previousStepsDone = steps.slice(0, index).every((s) => s.status === "done");
      const canCheck = !isDone && previousStepsDone && !isBlocked;
      const isCurrent = !isDone && previousStepsDone && !isBlocked;
      const itemClass = [
        "plan-checklist-item",
        isDone ? "completed" : "",
        isCurrent ? "current" : "",
        isBlocked ? "blocked" : ""
      ].filter(Boolean).join(" ");
      const checkboxClass = ["plan-checklist-checkbox", isDone ? "checked" : ""].filter(Boolean).join(" ");
      const notes = step.notes ? `<div class="plan-checklist-notes">${this.escapeHtml(step.notes)}</div>` : "";
      return `
          <li class="${itemClass}" data-step-index="${index}" data-step-id="${step.id}">
            <button
              class="${checkboxClass}"
              ${!canCheck && !isDone ? "disabled" : ""}
              data-action="toggle-step"
              data-step-index="${index}"
              title="${isDone ? "Completed" : canCheck ? "Mark as done" : "Complete previous steps first"}"
            ></button>
            <div class="plan-checklist-content">
              <div class="plan-checklist-title">${this.escapeHtml(step.title)}</div>
              ${notes}
            </div>
          </li>
        `;
    }).join("");
    this.elements.planChecklist.querySelectorAll('[data-action="toggle-step"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const index = Number.parseInt(btn.dataset.stepIndex || "0", 10);
        this.togglePlanStep(index);
      });
    });
  }
  this.showPlanDrawer();
};
SidePanelUI.prototype.togglePlanStep = function togglePlanStep(index) {
  if (!this.currentPlan || !this.currentPlan.steps[index]) return;
  const step = this.currentPlan.steps[index];
  const previousStepsDone = this.currentPlan.steps.slice(0, index).every((s) => s.status === "done");
  if (!previousStepsDone && step.status !== "done") {
    this.updateStatus("Complete previous steps first", "warning");
    return;
  }
  if (step.status === "done") {
    for (let i = index; i < this.currentPlan.steps.length; i++) {
      if (this.currentPlan.steps[i].status === "done") {
        this.currentPlan.steps[i].status = "pending";
      }
    }
  } else {
    step.status = "done";
  }
  this.currentPlan.updatedAt = Date.now();
  this.renderPlanDrawer(this.currentPlan);
};

// packages/extension/sidepanel/ui/settings/panel-profiles.ts
var parseHeadersJson = (raw) => {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Headers must be a JSON object");
  }
  return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, value == null ? "" : String(value)]));
};
var formatHeadersJson = (headers) => {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return "";
  const entries = Object.entries(headers).filter(([_, value]) => value != null && String(value).length > 0);
  if (!entries.length) return "";
  const normalized = Object.fromEntries(entries.map(([key, value]) => [key, String(value)]));
  return JSON.stringify(normalized, null, 2);
};
SidePanelUI.prototype.createNewConfig = async function createNewConfig(name) {
  const inputA = this.elements.newProfileInput;
  const inputB = this.elements.newProfileNameInput;
  const trimmedName = (name || inputA?.value || inputB?.value || "").trim();
  if (!trimmedName) {
    this.updateStatus("Enter a profile name", "warning");
    return;
  }
  if (this.configs[trimmedName]) {
    this.updateStatus("Profile already exists", "warning");
    return;
  }
  if (inputA) inputA.value = "";
  if (inputB) inputB.value = "";
  const current = this.configs[this.currentConfig] || {};
  this.configs[trimmedName] = {
    provider: current.provider || "openai",
    apiKey: current.apiKey || "",
    model: current.model || "gpt-4o",
    customEndpoint: current.customEndpoint || "",
    extraHeaders: current.extraHeaders || {},
    systemPrompt: current.systemPrompt || "",
    temperature: current.temperature ?? 0.7,
    maxTokens: current.maxTokens || 4096,
    contextLimit: current.contextLimit || 2e5,
    timeout: current.timeout || 3e4,
    sendScreenshotsAsImages: current.sendScreenshotsAsImages || false,
    screenshotQuality: current.screenshotQuality || "high",
    streamResponses: current.streamResponses !== false,
    enableScreenshots: current.enableScreenshots || false,
    saveHistory: current.saveHistory !== false,
    showThinking: current.showThinking !== false,
    autoScroll: current.autoScroll !== false,
    confirmActions: current.confirmActions !== false
  };
  this.refreshConfigDropdown();
  this.setActiveConfig(trimmedName, true);
  await this.persistAllSettings({ silent: true });
  this.updateStatus(`Profile "${trimmedName}" created`, "success");
};
SidePanelUI.prototype.deleteConfig = async function deleteConfig() {
  if (this.currentConfig === "default") {
    this.updateStatus("Cannot delete default profile", "warning");
    return;
  }
  await this.deleteProfileByName(this.currentConfig);
};
SidePanelUI.prototype.deleteProfileByName = async function deleteProfileByName(name) {
  if (!name || name === "default") {
    this.updateStatus("Cannot delete default profile", "warning");
    return;
  }
  if (!this.configs[name]) return;
  delete this.configs[name];
  if (this.currentConfig === name) {
    this.currentConfig = "default";
  }
  if (this.profileEditorTarget === name) {
    this.profileEditorTarget = this.currentConfig;
    this.editProfile(this.currentConfig, true);
  }
  this.refreshConfigDropdown();
  this.updateModelDisplay();
  this.setActiveConfig(this.currentConfig, true);
  await this.persistAllSettings({ silent: true });
  this.updateStatus(`Profile "${name}" deleted`, "success");
};
SidePanelUI.prototype.switchConfig = async function switchConfig() {
  const newConfig = this.elements.activeConfig.value;
  if (!this.configs[newConfig]) {
    this.updateStatus("Profile not found", "warning");
    return;
  }
  this.configs[this.currentConfig] = this.collectCurrentFormProfile();
  this.setActiveConfig(newConfig);
  await this.persistAllSettings({ silent: true });
};
SidePanelUI.prototype.refreshConfigDropdown = function refreshConfigDropdown() {
  if (this.elements.activeConfig) {
    this.elements.activeConfig.innerHTML = "";
    Object.keys(this.configs).forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      if (name === this.currentConfig) {
        option.selected = true;
      }
      this.elements.activeConfig.appendChild(option);
    });
  }
  this.refreshProfileSelectors();
  this.updateModelDisplay();
  this.renderProfileGrid();
  this.updateContextUsage();
};
SidePanelUI.prototype.refreshProfileSelectors = function refreshProfileSelectors() {
  const names = Object.keys(this.configs);
  const selects = [this.elements.orchestratorProfile, this.elements.visionProfile];
  selects.forEach((select) => {
    if (!select) return;
    select.innerHTML = '<option value="">Use active config</option>';
    names.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
    const currentValue = select.value;
    if (!currentValue) return;
    if (!names.includes(currentValue)) {
      select.value = "";
    }
  });
};
SidePanelUI.prototype.renderProfileGrid = function renderProfileGrid() {
  if (!this.elements.agentGrid) return;
  this.elements.agentGrid.innerHTML = "";
  const currentVision = this.elements.visionProfile?.value;
  const currentOrchestrator = this.elements.orchestratorProfile?.value;
  const configs = Object.keys(this.configs);
  if (!configs.length) {
    this.elements.agentGrid.innerHTML = '<div class="history-empty">No profiles yet.</div>';
    return;
  }
  configs.forEach((name) => {
    const card = document.createElement("div");
    card.className = "agent-card";
    if (name === this.profileEditorTarget) {
      card.classList.add("editing");
    }
    card.dataset.profile = name;
    const rolePills = ["main", "vision", "orchestrator", "aux"].map((role) => {
      const isActive = this.isProfileActiveForRole(name, role, currentVision, currentOrchestrator);
      const label = this.getRoleLabel(role);
      return `<span class="role-pill ${isActive ? "active" : ""} ${role}-pill" data-role="${role}" data-profile="${name}">${label}</span>`;
    }).join("");
    const config = this.configs[name] || {};
    const deleteBtn = name !== "default" ? `<button class="agent-card-delete" data-delete-profile="${this.escapeHtml(name)}" title="Delete profile">&times;</button>` : "";
    card.innerHTML = `
        <div class="agent-card-header">
          <div>
            <h4>${this.escapeHtml(name)}</h4>
            <span>${this.escapeHtml(config.provider || "Provider")} \xB7 ${this.escapeHtml(config.model || "Model")}</span>
          </div>
          ${deleteBtn}
        </div>
        <div class="role-pills">${rolePills}</div>
      `;
    this.elements.agentGrid.appendChild(card);
  });
};
SidePanelUI.prototype.getRoleLabel = function getRoleLabel(role) {
  switch (role) {
    case "main":
      return "Main";
    case "vision":
      return "Vision";
    case "orchestrator":
      return "Orchestrator";
    default:
      return "Team";
  }
};
SidePanelUI.prototype.isProfileActiveForRole = function isProfileActiveForRole(name, role, visionName, orchestratorName) {
  if (role === "main") return name === this.currentConfig;
  if (role === "vision") return name && visionName === name;
  if (role === "orchestrator") return name && orchestratorName === name;
  if (role === "aux") return this.auxAgentProfiles.includes(name);
  return false;
};
SidePanelUI.prototype.assignProfileRole = function assignProfileRole(profileName, role) {
  if (!profileName) return;
  if (role === "main") {
    this.setActiveConfig(profileName);
    return;
  }
  if (role === "vision") {
    this.toggleProfileRole("visionProfile", profileName);
  } else if (role === "orchestrator") {
    this.toggleProfileRole("orchestratorProfile", profileName);
  } else if (role === "aux") {
    this.toggleAuxProfile(profileName);
  }
};
SidePanelUI.prototype.toggleProfileRole = function toggleProfileRole(elementId, profileName) {
  const element = this.elements[elementId];
  if (!element) return;
  element.value = element.value === profileName ? "" : profileName;
  this.renderProfileGrid();
};
SidePanelUI.prototype.toggleAuxProfile = function toggleAuxProfile(profileName) {
  const idx = this.auxAgentProfiles.indexOf(profileName);
  if (idx === -1) {
    this.auxAgentProfiles.push(profileName);
  } else {
    this.auxAgentProfiles.splice(idx, 1);
  }
  this.auxAgentProfiles = Array.from(new Set(this.auxAgentProfiles));
  this.renderProfileGrid();
};
SidePanelUI.prototype.editProfile = function editProfile(name, silent = false) {
  if (!name || !this.configs[name]) return;
  this.profileEditorTarget = name;
  const config = this.configs[name];
  if (this.elements.profileEditorTitle) this.elements.profileEditorTitle.textContent = `Editing: ${name}`;
  if (this.elements.profileEditorName) this.elements.profileEditorName.value = name;
  if (this.elements.profileEditorProvider) this.elements.profileEditorProvider.value = config.provider || "openai";
  if (this.elements.profileEditorApiKey) this.elements.profileEditorApiKey.value = config.apiKey || "";
  if (this.elements.profileEditorModel) this.elements.profileEditorModel.value = config.model || "";
  if (this.elements.profileEditorEndpoint) this.elements.profileEditorEndpoint.value = config.customEndpoint || "";
  if (this.elements.profileEditorHeaders)
    this.elements.profileEditorHeaders.value = formatHeadersJson(config.extraHeaders) || "";
  if (this.elements.profileEditorTemperature) {
    this.elements.profileEditorTemperature.value = config.temperature ?? 0.7;
    if (this.elements.profileEditorTemperatureValue) {
      this.elements.profileEditorTemperatureValue.textContent = this.elements.profileEditorTemperature.value;
    }
  }
  if (this.elements.profileEditorMaxTokens) this.elements.profileEditorMaxTokens.value = config.maxTokens || 2048;
  if (this.elements.profileEditorContextLimit)
    this.elements.profileEditorContextLimit.value = config.contextLimit || 2e5;
  if (this.elements.profileEditorTimeout) this.elements.profileEditorTimeout.value = config.timeout || 3e4;
  if (this.elements.profileEditorEnableScreenshots)
    this.elements.profileEditorEnableScreenshots.value = config.enableScreenshots ? "true" : "false";
  if (this.elements.profileEditorSendScreenshots)
    this.elements.profileEditorSendScreenshots.value = config.sendScreenshotsAsImages ? "true" : "false";
  if (this.elements.profileEditorScreenshotQuality)
    this.elements.profileEditorScreenshotQuality.value = config.screenshotQuality || "high";
  if (this.elements.profileEditorShowThinking)
    this.elements.profileEditorShowThinking.value = config.showThinking !== false ? "true" : "false";
  if (this.elements.profileEditorStreamResponses)
    this.elements.profileEditorStreamResponses.value = config.streamResponses !== false ? "true" : "false";
  if (this.elements.profileEditorAutoScroll)
    this.elements.profileEditorAutoScroll.value = config.autoScroll !== false ? "true" : "false";
  if (this.elements.profileEditorConfirmActions)
    this.elements.profileEditorConfirmActions.value = config.confirmActions !== false ? "true" : "false";
  if (this.elements.profileEditorSaveHistory)
    this.elements.profileEditorSaveHistory.value = config.saveHistory !== false ? "true" : "false";
  if (this.elements.profileEditorPrompt)
    this.elements.profileEditorPrompt.value = config.systemPrompt || this.getDefaultSystemPrompt();
  this.toggleProfileEditorEndpoint();
  this.refreshProfileJsonEditor?.();
  this.renderProfileGrid();
  if (!silent) {
    this.switchSettingsTab("profiles");
  }
};
SidePanelUI.prototype.collectProfileEditorData = function collectProfileEditorData() {
  return {
    provider: this.elements.profileEditorProvider.value,
    apiKey: this.elements.profileEditorApiKey.value,
    model: this.elements.profileEditorModel.value,
    customEndpoint: this.elements.profileEditorEndpoint.value,
    extraHeaders: (() => {
      const raw = this.elements.profileEditorHeaders?.value || "";
      if (!raw.trim()) return {};
      try {
        return parseHeadersJson(raw);
      } catch {
        return {};
      }
    })(),
    temperature: Number.parseFloat(this.elements.profileEditorTemperature.value) || 0.7,
    maxTokens: Number.parseInt(this.elements.profileEditorMaxTokens.value) || 2048,
    contextLimit: Number.parseInt(this.elements.profileEditorContextLimit?.value || "") || 2e5,
    timeout: Number.parseInt(this.elements.profileEditorTimeout.value) || 3e4,
    enableScreenshots: this.elements.profileEditorEnableScreenshots.value === "true",
    sendScreenshotsAsImages: this.elements.profileEditorSendScreenshots.value === "true",
    screenshotQuality: this.elements.profileEditorScreenshotQuality.value || "high",
    showThinking: this.elements.profileEditorShowThinking?.value !== "false",
    streamResponses: this.elements.profileEditorStreamResponses?.value !== "false",
    autoScroll: this.elements.profileEditorAutoScroll?.value !== "false",
    confirmActions: this.elements.profileEditorConfirmActions?.value !== "false",
    saveHistory: this.elements.profileEditorSaveHistory?.value !== "false",
    systemPrompt: this.elements.profileEditorPrompt.value || this.getDefaultSystemPrompt()
  };
};
SidePanelUI.prototype.saveProfileEdits = async function saveProfileEdits() {
  const target = this.profileEditorTarget;
  if (!target || !this.configs[target]) {
    this.updateStatus("Select a profile to edit", "warning");
    return;
  }
  if (!this.validateProfileEditorHeaders?.()) {
    this.updateStatus("Invalid headers JSON", "error");
    return;
  }
  const newName = (this.elements.profileEditorName?.value || "").trim();
  const isRename = newName && newName !== target;
  if (isRename) {
    if (!newName) {
      this.updateStatus("Profile name cannot be empty", "warning");
      return;
    }
    if (this.configs[newName]) {
      this.updateStatus(`Profile "${newName}" already exists`, "warning");
      return;
    }
    if (target === "default") {
      this.updateStatus("Cannot rename the default profile", "warning");
      return;
    }
  }
  const existing = this.configs[target] || {};
  const updated = { ...existing, ...this.collectProfileEditorData() };
  if (isRename) {
    this.configs[newName] = updated;
    delete this.configs[target];
    if (this.currentConfig === target) this.currentConfig = newName;
    this.profileEditorTarget = newName;
    if (this.elements.visionProfile?.value === target) this.elements.visionProfile.value = newName;
    if (this.elements.orchestratorProfile?.value === target) this.elements.orchestratorProfile.value = newName;
    const auxIdx = this.auxAgentProfiles.indexOf(target);
    if (auxIdx !== -1) this.auxAgentProfiles[auxIdx] = newName;
    if (this.elements.profileEditorTitle) this.elements.profileEditorTitle.textContent = `Editing: ${newName}`;
    this.refreshConfigDropdown();
    await this.persistAllSettings({ silent: true });
    this.updateStatus(`Profile renamed to "${newName}"`, "success");
  } else {
    this.configs[target] = updated;
    await this.persistAllSettings({ silent: true });
    if (target === this.currentConfig) {
      this.populateFormFromConfig(this.configs[target]);
      this.toggleCustomEndpoint();
    }
    this.renderProfileGrid();
    this.updateStatus(`Profile "${target}" saved`, "success");
  }
};
SidePanelUI.prototype.populateFormFromConfig = function populateFormFromConfig(config = {}) {
  if (this.elements.provider) this.elements.provider.value = config.provider || "openai";
  if (this.elements.apiKey) this.elements.apiKey.value = config.apiKey || "";
  if (this.elements.model) this.elements.model.value = config.model || "gpt-4o";
  if (this.elements.customEndpoint) this.elements.customEndpoint.value = config.customEndpoint || "";
  if (this.elements.customHeaders) this.elements.customHeaders.value = formatHeadersJson(config.extraHeaders) || "";
  if (this.elements.systemPrompt)
    this.elements.systemPrompt.value = config.systemPrompt || this.getDefaultSystemPrompt();
  if (this.elements.temperature) {
    this.elements.temperature.value = config.temperature !== void 0 ? config.temperature : 0.7;
    if (this.elements.temperatureValue) {
      this.elements.temperatureValue.textContent = this.elements.temperature.value;
    }
  }
  if (this.elements.maxTokens) this.elements.maxTokens.value = config.maxTokens || 4096;
  if (this.elements.contextLimit) this.elements.contextLimit.value = config.contextLimit || 2e5;
  if (this.elements.timeout) this.elements.timeout.value = config.timeout || 3e4;
  if (this.elements.enableScreenshots)
    this.elements.enableScreenshots.value = config.enableScreenshots ? "true" : "false";
  if (this.elements.sendScreenshotsAsImages)
    this.elements.sendScreenshotsAsImages.value = config.sendScreenshotsAsImages ? "true" : "false";
  if (this.elements.screenshotQuality) this.elements.screenshotQuality.value = config.screenshotQuality || "high";
  if (this.elements.streamResponses)
    this.elements.streamResponses.value = config.streamResponses !== false ? "true" : "false";
  if (this.elements.showThinking) this.elements.showThinking.value = config.showThinking !== false ? "true" : "false";
  if (this.elements.autoScroll) this.elements.autoScroll.value = config.autoScroll !== false ? "true" : "false";
  if (this.elements.confirmActions)
    this.elements.confirmActions.value = config.confirmActions !== false ? "true" : "false";
  if (this.elements.saveHistory) this.elements.saveHistory.value = config.saveHistory !== false ? "true" : "false";
};
SidePanelUI.prototype.setActiveConfig = function setActiveConfig(name, quiet = false) {
  if (!this.configs[name]) return;
  this.currentConfig = name;
  if (this.elements.activeConfig) this.elements.activeConfig.value = name;
  this.populateFormFromConfig(this.configs[name]);
  this.toggleCustomEndpoint();
  this.renderProfileGrid?.();
  this.updateScreenshotToggleState?.();
  this.editProfile?.(name, true);
  this.fetchAvailableModels();
  if (!quiet) {
    this.updateStatus(`Switched to "${name}"`, "success");
  }
};
SidePanelUI.prototype.refreshProfileJsonEditor = function refreshProfileJsonEditor() {
  if (!this.elements.profileJsonEditor) return;
  const target = this.profileEditorTarget || this.currentConfig;
  const config = this.configs[target] || {};
  this.elements.profileJsonEditor.value = JSON.stringify(config, null, 2);
};
SidePanelUI.prototype.copyProfileJsonEditor = async function copyProfileJsonEditor() {
  if (!this.elements.profileJsonEditor) return;
  const text = this.elements.profileJsonEditor.value || "";
  if (!text.trim()) {
    this.updateStatus("Profile JSON is empty", "warning");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    this.updateStatus("Profile JSON copied", "success");
  } catch {
    this.updateStatus("Unable to copy profile JSON", "error");
  }
};
SidePanelUI.prototype.applyProfileJsonEditor = async function applyProfileJsonEditor() {
  if (!this.elements.profileJsonEditor) return;
  const target = this.profileEditorTarget || this.currentConfig;
  if (!target || !this.configs[target]) {
    this.updateStatus("Select a profile to edit", "warning");
    return;
  }
  const raw = this.elements.profileJsonEditor.value || "";
  if (!raw.trim()) {
    this.updateStatus("Paste profile JSON first", "warning");
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    this.updateStatus("Invalid JSON format", "error");
    return;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    this.updateStatus("Profile JSON must be an object", "error");
    return;
  }
  const existing = this.configs[target] || {};
  if (parsed.extraHeaders && typeof parsed.extraHeaders === "string") {
    try {
      parsed.extraHeaders = parseHeadersJson(parsed.extraHeaders);
    } catch {
      parsed.extraHeaders = existing.extraHeaders || {};
    }
  }
  this.configs[target] = { ...existing, ...parsed };
  await this.persistAllSettings({ silent: true });
  this.editProfile(target, true);
  if (target === this.currentConfig) {
    this.populateFormFromConfig(this.configs[target]);
  }
  this.updateStatus(`Profile "${target}" updated`, "success");
};

// packages/extension/sidepanel/ui/core/panel-scroll.ts
SidePanelUI.prototype.scrollToBottom = function scrollToBottom({ force = false } = {}) {
  if (!this.elements.chatMessages) return;
  if (!force && !this.shouldAutoScroll()) return;
  requestAnimationFrame(() => {
    this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    this.isNearBottom = true;
    this.userScrolledUp = false;
    this.updateScrollButton();
  });
};
SidePanelUI.prototype.shouldAutoScroll = function shouldAutoScroll() {
  const autoScrollEnabled = this.elements.autoScroll?.value !== "false";
  return autoScrollEnabled && !this.userScrolledUp;
};
SidePanelUI.prototype.handleChatScroll = function handleChatScroll() {
  if (!this.elements.chatMessages) return;
  const { scrollTop, scrollHeight, clientHeight } = this.elements.chatMessages;
  const nearBottom = scrollHeight - scrollTop - clientHeight < 60;
  this.isNearBottom = nearBottom;
  this.userScrolledUp = !nearBottom;
  this.recordScrollPosition();
  this.updateScrollButton();
};
SidePanelUI.prototype.recordScrollPosition = function recordScrollPosition() {
  if (!this.elements.chatMessages) return;
  this.scrollPositions.set(this.sessionId, this.elements.chatMessages.scrollTop);
};
SidePanelUI.prototype.restoreScrollPosition = function restoreScrollPosition() {
  if (!this.elements.chatMessages) return;
  const saved = this.scrollPositions.get(this.sessionId);
  if (saved !== void 0) {
    requestAnimationFrame(() => {
      this.elements.chatMessages.scrollTop = saved;
      this.handleChatScroll();
    });
  } else {
    this.scrollToBottom({ force: true });
  }
};
SidePanelUI.prototype.updateScrollButton = function updateScrollButton() {
  if (!this.elements.scrollToLatestBtn) return;
  this.elements.scrollToLatestBtn.classList.toggle("hidden", !this.userScrolledUp);
};

// packages/shared/src/prompts.ts
var DEFAULT_AGENT_SYSTEM_PROMPT = `You are a browser automation agent. You execute tasks by calling tools in a strict sequence.

<rules priority="CRITICAL">
VIOLATIONS CAUSE TASK FAILURE. NO EXCEPTIONS.

1. NO PLAN = NO ACTION
   You CANNOT call navigate, click, type, scroll, or pressKey without an active plan.
   Your FIRST tool call MUST be set_plan.

2. ACTION \u2192 VERIFY \u2192 MARK
   Every browser action MUST be followed by getContent.
   Every completed step MUST be followed by update_plan.
   
3. SEQUENTIAL EXECUTION  
   Complete step N before starting step N+1.
   Never skip update_plan. Never.

4. EVIDENCE ONLY
   Never claim to see content you didn't fetch with getContent.
   Quote actual text from getContent results.

5. TAB AWARENESS
   Prefer existing session tabs. Call describeSessionTabs/getTabs before opening new tabs.
</rules>

<execution_protocol>
\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
\u2502  MANDATORY SEQUENCE FOR EVERY STEP                          \u2502
\u2502                                                             \u2502
\u2502  1. CHECK: Read <execution_state> for current step          \u2502
\u2502  2. ACT: Call ONE browser tool for that step                \u2502
\u2502  3. VERIFY: Call getContent (REQUIRED - no exceptions)      \u2502
\u2502  4. MARK: Call update_plan(step_index=N, status="done")     \u2502
\u2502  5. REPEAT: Go to step 1 for next step                      \u2502
\u2502                                                             \u2502
\u2502  \u26A0\uFE0F NEVER skip steps 3 or 4. The system tracks compliance.  \u2502
\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518
</execution_protocol>

<correct_example>
User: "Find the price of AirPods on Apple's website"

\u2705 CORRECT execution:

TURN 1:
set_plan({ steps: [
  { title: "Navigate to apple.com" },
  { title: "Search for AirPods" },
  { title: "Find and extract price" },
  { title: "Report findings" }
]})

TURN 2:
navigate({ url: "https://apple.com" })

TURN 3:
getContent({ mode: "text" })  \u2190 REQUIRED after navigate

TURN 4:
update_plan({ step_index: 0, status: "done" })  \u2190 REQUIRED before step 1

TURN 5:
click({ selector: "button[aria-label='Search']" })

TURN 6:
getContent({ mode: "text" })  \u2190 REQUIRED after click

... and so on, always: action \u2192 getContent \u2192 update_plan
</correct_example>

<wrong_example>
\u274C WRONG - Missing getContent:
navigate({ url: "https://apple.com" })
update_plan({ step_index: 0, status: "done" })  \u2190 ERROR: No getContent!

\u274C WRONG - Missing update_plan:
navigate({ url: "https://apple.com" })
getContent({ mode: "text" })
click({ selector: "..." })  \u2190 ERROR: Didn't mark step 0 done!

\u274C WRONG - No plan:
navigate({ url: "https://apple.com" })  \u2190 ERROR: No plan exists!

\u274C WRONG - Vague plan steps:
set_plan({ steps: [
  { title: "Research AirPods" },      \u2190 Too vague
  { title: "Phase 1: Discovery" },    \u2190 Not an action
  { title: "Gather information" }     \u2190 What information? How?
]})
</wrong_example>

<tools>
PLANNING (use these to manage your task):
\u2022 set_plan - Create action checklist. MUST BE YOUR FIRST CALL.
\u2022 update_plan - Mark step complete. CALL AFTER EACH STEP IS VERIFIED.

BROWSER ACTIONS (require getContent after):
\u2022 navigate - Go to URL
\u2022 click - Click element by CSS selector  
\u2022 type - Enter text into input field
\u2022 pressKey - Press keyboard key (Enter, Tab, Escape)
\u2022 scroll - Scroll page (up/down/top/bottom)

READING (call after every action):
\u2022 getContent - Read page content. REQUIRED after every browser action.
\u2022 screenshot - Capture visible area (if enabled)

TABS:
\u2022 getTabs, switchTab, openTab, closeTab, focusTab, groupTabs
\u2022 ALWAYS check describeSessionTabs/getTabs before openTab unless explicitly required.
</tools>

<error_recovery>
If a tool fails:
1. Call getContent to understand current page state
2. Try a different CSS selector
3. Scroll to find the element  
4. Try an alternative approach
5. If stuck, explain what's blocking you

Never give up after one failure. Adapt and retry.
</error_recovery>

<output_format>
During execution: Minimal commentary. Your tool calls are your actions.

After ALL steps are marked done:
**Task:** [What was requested]
**Result:** [What you found, with quotes from getContent]
**Sources:** [URLs you visited]
</output_format>`;

// packages/shared/src/settings.ts
var PARCHI_STORAGE_KEYS = [
  "provider",
  "apiKey",
  "model",
  "customEndpoint",
  "extraHeaders",
  "systemPrompt",
  "temperature",
  "maxTokens",
  "contextLimit",
  "timeout",
  "enableScreenshots",
  "sendScreenshotsAsImages",
  "screenshotQuality",
  "showThinking",
  "streamResponses",
  "autoScroll",
  "confirmActions",
  "saveHistory",
  "toolPermissions",
  "allowedDomains",
  "activeConfig",
  "configs",
  "auxAgentProfiles",
  "useOrchestrator",
  "orchestratorProfile",
  "visionProfile",
  "visionBridge",
  "uiZoom",
  "timelineCollapsed",
  "relayEnabled",
  "relayUrl",
  "relayToken",
  "relayConnected",
  "relayLastConnectedAt",
  "relayLastError",
  "theme"
];

// packages/extension/sidepanel/ui/settings/themes.ts
var THEMES = [
  {
    id: "void",
    name: "Void",
    preview: { bg: "#09090b", accent: "#818cf8", card: "#18181b" },
    vars: {
      "--background": "#09090b",
      "--foreground": "#fafafa",
      "--muted": "#a1a1aa",
      "--muted-dim": "#71717a",
      "--border": "#27272a",
      "--card": "#18181b",
      "--card-hover": "#1f1f23",
      "--accent": "#818cf8",
      "--accent-rgb": "129 140 248",
      "--accent-light": "#a5b4fc",
      "--accent-dark": "#6366f1",
      "--success": "#4ade80",
      "--warning": "#fbbf24",
      "--error": "#f87171"
    }
  },
  {
    id: "ember",
    name: "Ember",
    preview: { bg: "#0f0a07", accent: "#f59e0b", card: "#1a1209" },
    vars: {
      "--background": "#0f0a07",
      "--foreground": "#faf5ef",
      "--muted": "#a8977e",
      "--muted-dim": "#7a6d5a",
      "--border": "#2a2117",
      "--card": "#1a1209",
      "--card-hover": "#231a0f",
      "--accent": "#f59e0b",
      "--accent-rgb": "245 158 11",
      "--accent-light": "#fbbf24",
      "--accent-dark": "#d97706",
      "--success": "#4ade80",
      "--warning": "#fbbf24",
      "--error": "#f87171"
    }
  },
  {
    id: "forest",
    name: "Forest",
    preview: { bg: "#060e08", accent: "#34d399", card: "#0f1a12" },
    vars: {
      "--background": "#060e08",
      "--foreground": "#ecfdf5",
      "--muted": "#86a894",
      "--muted-dim": "#5c7a68",
      "--border": "#1a2e20",
      "--card": "#0f1a12",
      "--card-hover": "#152118",
      "--accent": "#34d399",
      "--accent-rgb": "52 211 153",
      "--accent-light": "#6ee7b7",
      "--accent-dark": "#10b981",
      "--success": "#4ade80",
      "--warning": "#fbbf24",
      "--error": "#f87171"
    }
  },
  {
    id: "ocean",
    name: "Ocean",
    preview: { bg: "#060a10", accent: "#22d3ee", card: "#0c1420" },
    vars: {
      "--background": "#060a10",
      "--foreground": "#ecfeff",
      "--muted": "#7faaba",
      "--muted-dim": "#567a8a",
      "--border": "#162233",
      "--card": "#0c1420",
      "--card-hover": "#121c2a",
      "--accent": "#22d3ee",
      "--accent-rgb": "34 211 238",
      "--accent-light": "#67e8f9",
      "--accent-dark": "#06b6d4",
      "--success": "#4ade80",
      "--warning": "#fbbf24",
      "--error": "#f87171"
    }
  },
  {
    id: "sakura",
    name: "Sakura",
    preview: { bg: "#0d080b", accent: "#f472b6", card: "#1a1017" },
    vars: {
      "--background": "#0d080b",
      "--foreground": "#fdf2f8",
      "--muted": "#b08a9d",
      "--muted-dim": "#7d5f70",
      "--border": "#2d1e28",
      "--card": "#1a1017",
      "--card-hover": "#22161e",
      "--accent": "#f472b6",
      "--accent-rgb": "244 114 182",
      "--accent-light": "#f9a8d4",
      "--accent-dark": "#ec4899",
      "--success": "#4ade80",
      "--warning": "#fbbf24",
      "--error": "#f87171"
    }
  },
  {
    id: "copper",
    name: "Copper",
    preview: { bg: "#0c0908", accent: "#d4845a", card: "#1a1210" },
    vars: {
      "--background": "#0c0908",
      "--foreground": "#f5ebe4",
      "--muted": "#a8917e",
      "--muted-dim": "#7a6b5c",
      "--border": "#2a2018",
      "--card": "#1a1210",
      "--card-hover": "#221916",
      "--accent": "#d4845a",
      "--accent-rgb": "212 132 90",
      "--accent-light": "#e4a580",
      "--accent-dark": "#b86e44",
      "--success": "#4ade80",
      "--warning": "#fbbf24",
      "--error": "#f87171"
    }
  },
  {
    id: "arctic",
    name: "Arctic",
    preview: { bg: "#080a0e", accent: "#7dd3fc", card: "#101418" },
    vars: {
      "--background": "#080a0e",
      "--foreground": "#f0f9ff",
      "--muted": "#94a3b8",
      "--muted-dim": "#64748b",
      "--border": "#1e293b",
      "--card": "#101418",
      "--card-hover": "#171c22",
      "--accent": "#7dd3fc",
      "--accent-rgb": "125 211 252",
      "--accent-light": "#bae6fd",
      "--accent-dark": "#38bdf8",
      "--success": "#4ade80",
      "--warning": "#fbbf24",
      "--error": "#f87171"
    }
  },
  {
    id: "neon",
    name: "Neon",
    preview: { bg: "#030303", accent: "#4ade80", card: "#111111" },
    vars: {
      "--background": "#030303",
      "--foreground": "#e8ffe8",
      "--muted": "#6ba87a",
      "--muted-dim": "#4a7a56",
      "--border": "#1a2a1e",
      "--card": "#111111",
      "--card-hover": "#181818",
      "--accent": "#4ade80",
      "--accent-rgb": "74 222 128",
      "--accent-light": "#86efac",
      "--accent-dark": "#22c55e",
      "--success": "#4ade80",
      "--warning": "#fbbf24",
      "--error": "#f87171"
    }
  },
  {
    id: "dusk",
    name: "Dusk",
    preview: { bg: "#0a090e", accent: "#a78bfa", card: "#141220" },
    vars: {
      "--background": "#0a090e",
      "--foreground": "#f5f3ff",
      "--muted": "#9d92b8",
      "--muted-dim": "#6e6590",
      "--border": "#251f3a",
      "--card": "#141220",
      "--card-hover": "#1a1828",
      "--accent": "#a78bfa",
      "--accent-rgb": "167 139 250",
      "--accent-light": "#c4b5fd",
      "--accent-dark": "#8b5cf6",
      "--success": "#4ade80",
      "--warning": "#fbbf24",
      "--error": "#f87171"
    }
  },
  {
    id: "rust",
    name: "Rust",
    preview: { bg: "#0d0907", accent: "#c2523c", card: "#1a120e" },
    vars: {
      "--background": "#0d0907",
      "--foreground": "#f5ebe6",
      "--muted": "#a08a7e",
      "--muted-dim": "#756358",
      "--border": "#2a1e18",
      "--card": "#1a120e",
      "--card-hover": "#221815",
      "--accent": "#c2523c",
      "--accent-rgb": "194 82 60",
      "--accent-light": "#e0776a",
      "--accent-dark": "#a03828",
      "--success": "#4ade80",
      "--warning": "#fbbf24",
      "--error": "#f87171"
    }
  }
];
var DEFAULT_THEME_ID = "void";
function getThemeById(id) {
  return THEMES.find((t) => t.id === id);
}
function applyTheme(id) {
  const theme = getThemeById(id) || THEMES[0];
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(theme.vars)) {
    root.style.setProperty(prop, value);
  }
}

// packages/extension/sidepanel/ui/settings/panel-settings.ts
var parseHeadersJson2 = (raw) => {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Headers must be a JSON object");
  }
  return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, value == null ? "" : String(value)]));
};
SidePanelUI.prototype.applyUiZoom = function applyUiZoom(value, { persist = true } = {}) {
  const next = Number.isFinite(value) ? value : 1;
  const clamped = Math.min(1.25, Math.max(0.85, next));
  this.uiZoom = clamped;
  document.documentElement.style.setProperty("--ui-zoom", String(clamped));
  if (this.elements.uiZoom) this.elements.uiZoom.value = clamped.toFixed(2);
  if (this.elements.uiZoomValue) this.elements.uiZoomValue.textContent = `${Math.round(clamped * 100)}%`;
  if (persist) {
    chrome.storage.local.set({ uiZoom: clamped }).catch(() => {
    });
  }
};
SidePanelUI.prototype.adjustUiZoom = function adjustUiZoom(delta) {
  const next = (this.uiZoom || 1) + delta;
  this.applyUiZoom(next);
};
SidePanelUI.prototype.cancelSettings = async function cancelSettings() {
  await this.loadSettings();
  this.openChatView?.();
};
SidePanelUI.prototype.toggleCustomEndpoint = function toggleCustomEndpoint() {
  const provider = this.elements.provider?.value;
  const isCustom = provider === "custom" || provider === "kimi";
  if (this.elements.customEndpointGroup) {
    this.elements.customEndpointGroup.classList.toggle("required", isCustom);
  }
  if (this.elements.customEndpoint) {
    if (provider === "kimi") {
      if (!this.elements.customEndpoint.value || this.elements.customEndpoint.value === "https://openrouter.ai/api/v1") {
        this.elements.customEndpoint.value = "https://api.kimi.com/coding";
      }
      this.elements.customEndpoint.placeholder = "https://api.kimi.com/coding";
    } else if (isCustom) {
      this.elements.customEndpoint.placeholder = "https://openrouter.ai/api/v1";
    } else {
      this.elements.customEndpoint.placeholder = "Leave empty for default API URL";
    }
  }
  const modelHint = document.getElementById("modelHint");
  if (modelHint) {
    switch (provider) {
      case "anthropic":
        modelHint.textContent = "Recommended: claude-sonnet-4-20250514";
        break;
      case "openai":
        modelHint.textContent = "Recommended: gpt-4o or gpt-4-turbo";
        break;
      case "kimi":
        modelHint.textContent = "Recommended: kimi-for-coding (or your Kimi model ID)";
        break;
      case "custom":
        modelHint.textContent = "Enter the model ID from your provider";
        break;
      default:
        modelHint.textContent = "";
    }
  }
};
SidePanelUI.prototype.validateCustomEndpoint = function validateCustomEndpoint() {
  if (!this.elements.customEndpoint) return true;
  const url = this.elements.customEndpoint.value.trim();
  if (!url) return true;
  try {
    new URL(url);
    this.elements.customEndpoint.style.borderColor = "";
    return true;
  } catch {
    this.elements.customEndpoint.style.borderColor = "var(--status-error)";
    return false;
  }
};
SidePanelUI.prototype.validateCustomHeaders = function validateCustomHeaders() {
  if (!this.elements.customHeaders) return true;
  const raw = this.elements.customHeaders.value || "";
  if (!raw.trim()) {
    this.elements.customHeaders.style.borderColor = "";
    return true;
  }
  try {
    parseHeadersJson2(raw);
    this.elements.customHeaders.style.borderColor = "";
    return true;
  } catch {
    this.elements.customHeaders.style.borderColor = "var(--status-error)";
    return false;
  }
};
SidePanelUI.prototype.validateProfileEditorHeaders = function validateProfileEditorHeaders() {
  if (!this.elements.profileEditorHeaders) return true;
  const raw = this.elements.profileEditorHeaders.value || "";
  if (!raw.trim()) {
    this.elements.profileEditorHeaders.style.borderColor = "";
    return true;
  }
  try {
    parseHeadersJson2(raw);
    this.elements.profileEditorHeaders.style.borderColor = "";
    return true;
  } catch {
    this.elements.profileEditorHeaders.style.borderColor = "var(--status-error)";
    return false;
  }
};
SidePanelUI.prototype.toggleProfileEditorEndpoint = function toggleProfileEditorEndpoint() {
  if (!this.elements.profileEditorEndpointGroup) return;
  const provider = this.elements.profileEditorProvider?.value;
  this.elements.profileEditorEndpointGroup.style.display = provider === "custom" || provider === "kimi" ? "block" : "none";
};
SidePanelUI.prototype.switchSettingsTab = function switchSettingsTab(tabName = "setup") {
  if (this.currentSettingsTab === "setup" && tabName !== "setup") {
    this.configs[this.currentConfig] = this.collectCurrentFormProfile();
    void this.persistAllSettings({ silent: true });
  }
  this.currentSettingsTab = tabName;
  const tabs = ["setup", "model", "browser", "network", "profiles"];
  const tabElements = {
    setup: this.elements.settingsTabSetup,
    model: this.elements.settingsTabModel,
    browser: this.elements.settingsTabBrowser,
    network: this.elements.settingsTabNetwork,
    profiles: this.elements.settingsTabProfiles
  };
  const btnElements = {
    setup: this.elements.settingsTabSetupBtn,
    model: this.elements.settingsTabModelBtn,
    browser: this.elements.settingsTabBrowserBtn,
    network: this.elements.settingsTabNetworkBtn,
    profiles: this.elements.settingsTabProfilesBtn
  };
  for (const tab of tabs) {
    const isActive = tab === tabName;
    tabElements[tab]?.classList.toggle("hidden", !isActive);
    btnElements[tab]?.classList.toggle("active", isActive);
    const pane = tabElements[tab]?.querySelector(".settings-tab-pane");
    pane?.classList.toggle("active", isActive);
  }
};
SidePanelUI.prototype.createProfileFromInput = function createProfileFromInput() {
  const name = (this.elements.newProfileNameInput?.value || "").trim();
  if (!name) {
    this.updateStatus("Enter a profile name first", "warning");
    return;
  }
  if (this.configs[name]) {
    this.updateStatus("Profile already exists", "warning");
    return;
  }
  if (this.elements.newProfileNameInput) this.elements.newProfileNameInput.value = "";
  this.createNewConfig(name);
  this.editProfile(name, true);
};
SidePanelUI.prototype.loadSettings = async function loadSettings() {
  let settings = {};
  try {
    settings = await chrome.storage.local.get(PARCHI_STORAGE_KEYS);
  } catch (error) {
    console.error("[Parchi] Failed to load settings from storage:", error);
    this.updateStatus("Failed to load settings", "error");
  }
  const storedConfigs = settings.configs || {};
  const baseConfig = {
    provider: "openai",
    apiKey: "",
    model: "gpt-4o",
    customEndpoint: "",
    extraHeaders: {},
    systemPrompt: this.getDefaultSystemPrompt(),
    temperature: 0.7,
    maxTokens: 4096,
    contextLimit: 2e5,
    timeout: 3e4,
    sendScreenshotsAsImages: false,
    screenshotQuality: "high",
    showThinking: true,
    streamResponses: true,
    autoScroll: true,
    confirmActions: true,
    saveHistory: true,
    enableScreenshots: true
  };
  this.configs = {
    default: { ...baseConfig, ...storedConfigs.default || {} },
    ...storedConfigs
  };
  this.currentConfig = this.configs[settings.activeConfig] ? settings.activeConfig : "default";
  this.auxAgentProfiles = settings.auxAgentProfiles || [];
  this.applyUiZoom(settings.uiZoom ?? 1, { persist: false });
  this.currentTheme = settings.theme || DEFAULT_THEME_ID;
  applyTheme(this.currentTheme);
  this.renderThemeGrid?.();
  if (this.elements.visionBridge)
    this.elements.visionBridge.value = settings.visionBridge !== void 0 ? String(settings.visionBridge) : "true";
  if (this.elements.visionProfile) this.elements.visionProfile.value = settings.visionProfile || "";
  if (this.elements.orchestratorToggle)
    this.elements.orchestratorToggle.value = settings.useOrchestrator !== void 0 ? String(settings.useOrchestrator) : "false";
  if (this.elements.orchestratorProfile) this.elements.orchestratorProfile.value = settings.orchestratorProfile || "";
  if (this.elements.showThinking)
    this.elements.showThinking.value = settings.showThinking !== void 0 ? String(settings.showThinking) : "true";
  if (this.elements.streamResponses)
    this.elements.streamResponses.value = settings.streamResponses !== void 0 ? String(settings.streamResponses) : "true";
  if (this.elements.autoScroll)
    this.elements.autoScroll.value = settings.autoScroll !== void 0 ? String(settings.autoScroll) : "true";
  if (this.elements.confirmActions)
    this.elements.confirmActions.value = settings.confirmActions !== void 0 ? String(settings.confirmActions) : "true";
  if (this.elements.saveHistory)
    this.elements.saveHistory.value = settings.saveHistory !== void 0 ? String(settings.saveHistory) : "true";
  this.timelineCollapsed = settings.timelineCollapsed !== void 0 ? settings.timelineCollapsed !== false : true;
  if (this.elements.relayEnabled)
    this.elements.relayEnabled.value = settings.relayEnabled !== void 0 ? String(settings.relayEnabled) : "false";
  if (this.elements.relayUrl) this.elements.relayUrl.value = settings.relayUrl || "http://127.0.0.1:17373";
  if (this.elements.relayToken) this.elements.relayToken.value = settings.relayToken || "";
  this.updateRelayStatusFromSettings?.(settings);
  const defaultPermissions = {
    read: true,
    interact: true,
    navigate: true,
    tabs: true,
    screenshots: true
  };
  const toolPermissions = {
    ...defaultPermissions,
    ...settings.toolPermissions || {}
  };
  this.toolPermissions = toolPermissions;
  if (this.elements.permissionRead) this.elements.permissionRead.value = String(toolPermissions.read);
  if (this.elements.permissionInteract) this.elements.permissionInteract.value = String(toolPermissions.interact);
  if (this.elements.permissionNavigate) this.elements.permissionNavigate.value = String(toolPermissions.navigate);
  if (this.elements.permissionTabs) this.elements.permissionTabs.value = String(toolPermissions.tabs);
  if (this.elements.permissionScreenshots)
    this.elements.permissionScreenshots.value = String(toolPermissions.screenshots);
  if (this.elements.allowedDomains) this.elements.allowedDomains.value = settings.allowedDomains || "";
  this.refreshConfigDropdown();
  this.setActiveConfig(this.currentConfig, true);
  this.toggleCustomEndpoint();
  this.updateScreenshotToggleState();
  this.editProfile(this.currentConfig, true);
};
SidePanelUI.prototype.updateRelayStatusFromSettings = function updateRelayStatusFromSettings(settings = {}) {
  const connected = settings.relayConnected === true;
  if (this.elements.relayConnectedBadge) {
    this.elements.relayConnectedBadge.textContent = connected ? "Connected" : "Disconnected";
    this.elements.relayConnectedBadge.classList.toggle("connected", connected);
  }
  if (this.elements.relayLastErrorText) {
    const raw = settings.relayLastError;
    this.elements.relayLastErrorText.textContent = raw ? String(raw) : "";
  }
};
SidePanelUI.prototype.saveSettings = async function saveSettings() {
  if ((this.elements.provider?.value === "custom" || this.elements.provider?.value === "kimi") && !this.validateCustomEndpoint()) {
    this.updateStatus("Invalid custom endpoint URL", "error");
    return;
  }
  if (!this.validateCustomHeaders()) {
    this.updateStatus("Invalid headers JSON", "error");
    return;
  }
  const profile = this.collectCurrentFormProfile();
  this.configs[this.currentConfig] = profile;
  await this.persistAllSettings();
  this.fetchAvailableModels();
  this.updateStatus("Settings saved successfully", "success");
};
SidePanelUI.prototype.exportSettings = async function exportSettings() {
  try {
    const settings = await chrome.storage.local.get(PARCHI_STORAGE_KEYS);
    const payload = {
      ...settings,
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      exportVersion: 1
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `parchi-settings-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.updateStatus("Settings export downloaded", "success");
  } catch (error) {
    this.updateStatus("Unable to export settings", "error");
  }
};
SidePanelUI.prototype.importSettings = async function importSettings(event) {
  const input = event?.target;
  const file = input?.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const payload = {};
    PARCHI_STORAGE_KEYS.forEach((key) => {
      if (data[key] !== void 0) {
        payload[key] = data[key];
      }
    });
    if (payload.configs && typeof payload.configs !== "object") {
      throw new Error("Invalid configs payload");
    }
    await chrome.storage.local.set(payload);
    await this.loadSettings();
    this.renderProfileGrid();
    this.updateStatus("Settings imported successfully", "success");
  } catch (error) {
    this.updateStatus("Unable to import settings", "error");
  } finally {
    if (input) input.value = "";
  }
};
SidePanelUI.prototype.collectCurrentFormProfile = function collectCurrentFormProfile() {
  const current = this.configs[this.currentConfig] || {};
  let extraHeaders = current.extraHeaders || {};
  if (this.elements.customHeaders) {
    const raw = this.elements.customHeaders.value || "";
    if (raw.trim().length > 0) {
      try {
        extraHeaders = parseHeadersJson2(raw);
      } catch {
        extraHeaders = current.extraHeaders || {};
      }
    } else {
      extraHeaders = {};
    }
  }
  return {
    provider: this.elements.provider?.value || current.provider || "openai",
    apiKey: this.elements.apiKey?.value || current.apiKey || "",
    model: this.elements.model?.value || current.model || "gpt-4o",
    customEndpoint: this.elements.customEndpoint?.value || current.customEndpoint || "",
    extraHeaders,
    systemPrompt: this.elements.systemPrompt?.value || current.systemPrompt || "",
    temperature: Number.parseFloat(this.elements.temperature?.value) || current.temperature || 0.7,
    maxTokens: Number.parseInt(this.elements.maxTokens?.value) || current.maxTokens || 4096,
    contextLimit: Number.parseInt(this.elements.contextLimit?.value) || current.contextLimit || 2e5,
    timeout: Number.parseInt(this.elements.timeout?.value) || current.timeout || 3e4,
    enableScreenshots: this.elements.enableScreenshots?.value === "true" || current.enableScreenshots || false,
    sendScreenshotsAsImages: this.elements.sendScreenshotsAsImages?.value === "true" || current.sendScreenshotsAsImages || false,
    screenshotQuality: this.elements.screenshotQuality?.value || current.screenshotQuality || "high",
    showThinking: this.elements.showThinking?.value === "true",
    streamResponses: this.elements.streamResponses?.value === "true",
    autoScroll: this.elements.autoScroll?.value === "true",
    confirmActions: this.elements.confirmActions?.value === "true",
    saveHistory: this.elements.saveHistory?.value === "true"
  };
};
SidePanelUI.prototype.collectToolPermissions = function collectToolPermissions() {
  const fallback = this.toolPermissions || {
    read: true,
    interact: true,
    navigate: true,
    tabs: true,
    screenshots: true
  };
  return {
    read: this.elements.permissionRead ? this.elements.permissionRead.value !== "false" : fallback.read !== false,
    interact: this.elements.permissionInteract ? this.elements.permissionInteract.value !== "false" : fallback.interact !== false,
    navigate: this.elements.permissionNavigate ? this.elements.permissionNavigate.value !== "false" : fallback.navigate !== false,
    tabs: this.elements.permissionTabs ? this.elements.permissionTabs.value !== "false" : fallback.tabs !== false,
    screenshots: this.elements.permissionScreenshots ? this.elements.permissionScreenshots.value === "true" : fallback.screenshots !== false
  };
};
SidePanelUI.prototype.persistAllSettings = async function persistAllSettings({ silent = false } = {}) {
  try {
    const activeProfile = this.configs[this.currentConfig] || {};
    const rawRelayUrl = (this.elements.relayUrl?.value || "").trim();
    const normalizedRelayUrl = rawRelayUrl && !rawRelayUrl.includes("://") ? `http://${rawRelayUrl}` : rawRelayUrl;
    const payload = {
      provider: activeProfile.provider || "openai",
      apiKey: activeProfile.apiKey || "",
      model: activeProfile.model || "gpt-4o",
      customEndpoint: activeProfile.customEndpoint || "",
      extraHeaders: activeProfile.extraHeaders || {},
      systemPrompt: activeProfile.systemPrompt || this.getDefaultSystemPrompt(),
      temperature: activeProfile.temperature ?? 0.7,
      maxTokens: activeProfile.maxTokens || 4096,
      contextLimit: activeProfile.contextLimit || 2e5,
      timeout: activeProfile.timeout || 3e4,
      enableScreenshots: activeProfile.enableScreenshots ?? false,
      sendScreenshotsAsImages: activeProfile.sendScreenshotsAsImages ?? false,
      screenshotQuality: activeProfile.screenshotQuality || "high",
      showThinking: activeProfile.showThinking !== false,
      streamResponses: activeProfile.streamResponses !== false,
      autoScroll: activeProfile.autoScroll !== false,
      confirmActions: activeProfile.confirmActions !== false,
      saveHistory: activeProfile.saveHistory !== false,
      visionBridge: this.elements.visionBridge?.value === "true",
      visionProfile: this.elements.visionProfile?.value || "",
      useOrchestrator: this.elements.orchestratorToggle?.value === "true",
      orchestratorProfile: this.elements.orchestratorProfile?.value || "",
      toolPermissions: this.collectToolPermissions(),
      allowedDomains: this.elements.allowedDomains?.value || "",
      auxAgentProfiles: this.auxAgentProfiles,
      uiZoom: this.uiZoom ?? 1,
      theme: this.currentTheme || DEFAULT_THEME_ID,
      relayEnabled: this.elements.relayEnabled?.value === "true",
      relayUrl: normalizedRelayUrl,
      relayToken: this.elements.relayToken?.value || "",
      activeConfig: this.currentConfig,
      configs: this.configs
    };
    await chrome.storage.local.set(payload);
    this.updateContextUsage();
    if (!silent) {
      this.updateStatus("Settings saved successfully", "success");
    }
  } catch (error) {
    console.error("[Parchi] persistAllSettings error:", error);
    if (!silent) {
      this.updateStatus("Failed to save settings", "error");
    }
    throw error;
  }
};
SidePanelUI.prototype.getDefaultSystemPrompt = function getDefaultSystemPrompt() {
  return DEFAULT_AGENT_SYSTEM_PROMPT;
};
SidePanelUI.prototype.renderThemeGrid = function renderThemeGrid() {
  const grid = this.elements.themeGrid;
  if (!grid) return;
  grid.innerHTML = "";
  for (const theme of THEMES) {
    const swatch = document.createElement("button");
    swatch.className = "theme-swatch";
    if (theme.id === this.currentTheme) swatch.classList.add("active");
    swatch.title = theme.name;
    swatch.dataset.themeId = theme.id;
    swatch.innerHTML = `
      <span class="theme-swatch-color" style="background:${theme.preview.bg}; border-color:${theme.preview.accent}">
        <span class="theme-swatch-accent" style="background:${theme.preview.accent}"></span>
      </span>
      <span class="theme-swatch-label">${theme.name}</span>
    `;
    swatch.addEventListener("click", () => this.setTheme(theme.id));
    grid.appendChild(swatch);
  }
};
SidePanelUI.prototype.setTheme = function setTheme(id) {
  this.currentTheme = id;
  applyTheme(id);
  this.renderThemeGrid();
  chrome.storage.local.set({ theme: id }).catch(() => {
  });
};
SidePanelUI.prototype.updateScreenshotToggleState = function updateScreenshotToggleState() {
  if (!this.elements.enableScreenshots) return;
  const wantsScreens = this.elements.enableScreenshots.value === "true";
  const visionProfile = this.elements.visionProfile?.value;
  const provider = this.elements.provider?.value;
  const hasVision = provider && provider !== "custom" || visionProfile;
  const controls = [this.elements.sendScreenshotsAsImages, this.elements.screenshotQuality];
  controls.forEach((ctrl) => {
    if (!ctrl) return;
    ctrl.disabled = !wantsScreens;
    ctrl.parentElement?.classList.toggle("disabled", !wantsScreens);
  });
  if (wantsScreens && !hasVision) {
    this.updateStatus("Enable a vision-capable profile before sending screenshots.", "warning");
  }
};

// packages/extension/sidepanel/ui/status/panel-status.ts
SidePanelUI.prototype.updateStatus = function updateStatus(text, type = "default") {
  if (this.elements.statusText) {
    this.elements.statusText.textContent = text;
  }
  const statusDot = document.getElementById("statusDot");
  if (statusDot) {
    statusDot.className = "status-dot";
    if (type === "error") statusDot.classList.add("error");
    else if (type === "warning") statusDot.classList.add("warning");
    else if (type === "active") statusDot.classList.add("active");
  }
  this.updateActivityState();
};
SidePanelUI.prototype.startRunTimer = function startRunTimer() {
  if (this.runTimerId) {
    window.clearInterval(this.runTimerId);
  }
  this.runStartedAt = Date.now();
  const tick = () => {
    this.updateActivityState?.();
  };
  tick();
  this.runTimerId = window.setInterval(tick, 1e3);
};
SidePanelUI.prototype.stopRunTimer = function stopRunTimer() {
  if (this.runTimerId) {
    window.clearInterval(this.runTimerId);
    this.runTimerId = null;
  }
  this.runStartedAt = null;
  this.updateActivityState?.();
};
SidePanelUI.prototype.updateModelDisplay = function updateModelDisplay() {
  if (this.elements.modelSelect) {
    this.elements.modelSelect.value = this.currentConfig;
  }
};
SidePanelUI.prototype.fetchAvailableModels = async function fetchAvailableModels() {
  this.populateModelSelect();
  this.updateModelDisplay();
};
SidePanelUI.prototype.populateModelSelect = function populateModelSelect() {
  let select = this.elements.modelSelect;
  if (!select) {
    select = document.getElementById("modelSelect");
    if (select) {
      this.elements.modelSelect = select;
    }
  }
  if (!select) {
    console.error("[Parchi] modelSelect element not found!");
    return;
  }
  select.innerHTML = "";
  const configNames = Object.keys(this.configs);
  if (configNames.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No profiles";
    select.appendChild(option);
    return;
  }
  for (const name of configNames) {
    const config = this.configs[name];
    const option = document.createElement("option");
    option.value = name;
    const providerIcon = this.getProviderIcon(config.provider);
    const modelShort = this.shortenModelName(config.model || "no-model");
    option.textContent = `${providerIcon} ${config.provider}/${modelShort}`;
    if (name === this.currentConfig) {
      option.selected = true;
    }
    select.appendChild(option);
  }
};
SidePanelUI.prototype.shortenModelName = function shortenModelName(model) {
  if (!model) return "unknown";
  const clean = model.replace(/^claude-/, "").replace(/^gpt-/, "").replace(/^kimi-/, "");
  if (clean.length <= 20) return clean;
  return clean.slice(0, 19) + "\u2026";
};
SidePanelUI.prototype.handleModelSelectChange = async function handleModelSelectChange() {
  const select = this.elements.modelSelect;
  if (!select) return;
  const selectedProfile = select.value;
  if (!selectedProfile || !this.configs[selectedProfile]) return;
  if (selectedProfile === this.currentConfig) return;
  try {
    this.setActiveConfig(selectedProfile, true);
    await this.persistAllSettings({ silent: true });
    this.updateStatus(
      `Switched to ${this.configs[selectedProfile].provider}/${this.configs[selectedProfile].model}`,
      "success"
    );
  } catch (error) {
    console.error("[Parchi] Failed to persist selected profile:", error);
    this.updateStatus("Failed to switch profile", "error");
  }
};
SidePanelUI.prototype.getProviderIcon = function getProviderIcon(provider) {
  const icons = {
    anthropic: "\u{1F152}",
    openai: "\u{1F15E}",
    kimi: "\u{1F15A}",
    custom: "\u2699\uFE0F"
  };
  return icons[provider] || "\u2699\uFE0F";
};

// packages/extension/sidepanel/ui/chat/panel-streaming.ts
var formatElapsed = (elapsedMs) => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1e3));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const minuteLabel = minutes.toString().padStart(1, "0");
  const secondLabel = seconds.toString().padStart(2, "0");
  return `${minuteLabel}:${secondLabel}`;
};
SidePanelUI.prototype.handleAssistantStream = function handleAssistantStream(event) {
  if (event.status === "start") {
    this.isStreaming = true;
    this.clearErrorBanner();
    this.startStreamingMessage();
    this.startThinkingTimer();
  } else if (event.status === "delta") {
    this.isStreaming = true;
    this.updateStreamingMessage(event.content || "");
  } else if (event.status === "stop") {
    this.isStreaming = false;
    this.completeStreamingMessage();
    this.stopThinkingTimer();
  }
  this.updateActivityState();
};
SidePanelUI.prototype.startThinkingTimer = function startThinkingTimer() {
  if (this.thinkingTimerId) {
    window.clearInterval(this.thinkingTimerId);
  }
  this.thinkingStartedAt = Date.now();
  const updateTimer = () => {
    const elapsed = formatElapsed(Date.now() - (this.thinkingStartedAt || Date.now()));
    this.updateStatus(`Thinking ${elapsed}`, "active");
  };
  updateTimer();
  this.thinkingTimerId = window.setInterval(updateTimer, 1e3);
};
SidePanelUI.prototype.stopThinkingTimer = function stopThinkingTimer() {
  if (this.thinkingTimerId) {
    window.clearInterval(this.thinkingTimerId);
    this.thinkingTimerId = null;
  }
  this.thinkingStartedAt = null;
};
SidePanelUI.prototype.startStreamingMessage = function startStreamingMessage() {
  if (this.streamingState) return;
  const container = document.createElement("div");
  container.className = "message assistant streaming";
  container.innerHTML = `
      <div class="message-content streaming-content markdown-body">
        <div class="stream-events"></div>
      </div>
    `;
  if (this.lastChatTurn) {
    this.lastChatTurn.appendChild(container);
  } else {
    this.elements.chatMessages.appendChild(container);
  }
  const eventsEl = container.querySelector(".stream-events");
  this.streamingState = {
    container,
    eventsEl,
    lastEventType: void 0,
    textEventEl: null,
    reasoningEventEl: null,
    textBuffer: "",
    reasoningBuffer: "",
    planEl: null,
    planListEl: null,
    planMetaEl: null
  };
  const mascot = document.getElementById("mascotCorner");
  if (mascot) mascot.classList.add("thinking");
  this.updateThinkingPanel(null, true);
  this.scrollToBottom();
};
SidePanelUI.prototype.updateStreamingMessage = function updateStreamingMessage(content) {
  if (!this.streamingState) {
    this.startStreamingMessage();
  }
  if (!this.streamingState?.eventsEl) return;
  if (this.streamingState.lastEventType !== "text") {
    const textEvent = document.createElement("div");
    textEvent.className = "stream-event stream-event-text";
    this.streamingState.eventsEl.appendChild(textEvent);
    this.streamingState.textEventEl = textEvent;
    this.streamingState.textBuffer = "";
    this.streamingState.lastEventType = "text";
  }
  this.streamingState.textBuffer = `${this.streamingState.textBuffer || ""}${content || ""}`;
  if (this.streamingState.textEventEl) {
    const extracted = extractThinking(this.streamingState.textBuffer || "");
    if (extracted.thinking) {
      this.streamingReasoning = extracted.thinking;
      this.updateStreamReasoning(extracted.thinking, true);
    }
    const cleanedText = extracted.content || this.streamingState.textBuffer || "";
    this.streamingState.textEventEl.innerHTML = this.renderMarkdown(cleanedText);
  }
  this.scrollToBottom();
};
SidePanelUI.prototype.completeStreamingMessage = function completeStreamingMessage() {
  if (!this.streamingState?.container) return;
  const indicator = this.streamingState.container.querySelector(".typing-indicator");
  if (indicator) indicator.remove();
  this.streamingState.container.classList.remove("streaming");
  const mascot = document.getElementById("mascotCorner");
  if (mascot) mascot.classList.remove("thinking");
  if (this.streamingReasoning) {
    this.latestThinking = this.streamingReasoning;
  } else {
    this.latestThinking = null;
  }
};
SidePanelUI.prototype.updateStreamReasoning = function updateStreamReasoning(delta, replace = false) {
  if (!this.streamingState?.eventsEl) return;
  if (delta === null || delta === void 0) return;
  if (!delta.trim() && !this.streamingState.reasoningBuffer) return;
  const targetContainer = this.streamingState.eventsEl;
  let reasoningContentEl = targetContainer.querySelector(
    ":scope > .stream-event-reasoning .stream-reasoning-content"
  );
  if (!reasoningContentEl) {
    const reasoningEvent = document.createElement("div");
    reasoningEvent.className = "stream-event stream-event-reasoning";
    reasoningEvent.innerHTML = `
        <div class="stream-reasoning-header">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a10 10 0 1 0 10 10H12V2z"/>
            <path d="M12 2a10 10 0 0 1 10 10"/>
          </svg>
          <span>Thinking...</span>
        </div>
        <div class="stream-reasoning-content"></div>
      `;
    targetContainer.prepend(reasoningEvent);
    reasoningContentEl = reasoningEvent.querySelector(".stream-reasoning-content");
    this.streamingState.reasoningEventEl = reasoningContentEl;
    this.streamingState.reasoningBuffer = "";
    const mascot = document.getElementById("mascotCorner");
    if (mascot) mascot.classList.add("thinking");
  }
  const nextBuffer = replace ? delta : `${this.streamingState.reasoningBuffer || ""}${delta}`;
  this.streamingState.reasoningBuffer = nextBuffer;
  const cleaned = dedupeThinking(nextBuffer);
  if (reasoningContentEl) {
    reasoningContentEl.textContent = cleaned;
  }
  this.scrollToBottom();
};
SidePanelUI.prototype.applyPlanUpdate = function applyPlanUpdate(plan) {
  if (!plan) return;
  this.currentPlan = plan;
  this.renderPlanDrawer(plan);
};
SidePanelUI.prototype.applyManualPlanUpdate = function applyManualPlanUpdate(steps = []) {
  if (!steps || steps.length === 0) return;
  const now = Date.now();
  const normalizedSteps = steps.map((step, index) => {
    const status = step.status === "running" || step.status === "done" || step.status === "blocked" ? step.status : "pending";
    return {
      id: `step-${index + 1}`,
      title: step.title,
      status,
      notes: step.notes
    };
  }).filter((step) => step.title);
  if (!normalizedSteps.length) return;
  this.currentPlan = {
    steps: normalizedSteps,
    createdAt: this.currentPlan?.createdAt || now,
    updatedAt: now
  };
  if (this.currentPlan) {
    this.renderPlanDrawer(this.currentPlan);
  }
};
SidePanelUI.prototype.ensurePlanBlock = function ensurePlanBlock() {
  if (!this.streamingState?.eventsEl) return null;
  if (this.streamingState.planEl) return this.streamingState.planEl;
  const container = document.createElement("div");
  container.className = "plan-block";
  container.innerHTML = `
      <div class="plan-header">
        <span class="plan-title">Plan</span>
        <span class="plan-meta"></span>
      </div>
      <ol class="plan-steps"></ol>
    `;
  const firstChild = this.streamingState.eventsEl.firstChild;
  if (firstChild) {
    this.streamingState.eventsEl.insertBefore(container, firstChild);
  } else {
    this.streamingState.eventsEl.appendChild(container);
  }
  this.streamingState.planEl = container;
  this.streamingState.planListEl = container.querySelector(".plan-steps");
  this.streamingState.planMetaEl = container.querySelector(".plan-meta");
  return container;
};
SidePanelUI.prototype.finishStreamingMessage = function finishStreamingMessage() {
  if (!this.streamingState) return null;
  const streamingThinking = this.streamingReasoning;
  const container = this.streamingState.container;
  this.completeStreamingMessage();
  this.streamingState = null;
  this.isStreaming = false;
  this.updateActivityState();
  return { thinking: streamingThinking, container };
};

// packages/extension/sidepanel/ui/tabs/panel-tabs.ts
SidePanelUI.prototype.handleFileSelection = async function handleFileSelection(event) {
  const input = event.target;
  if (!input) return;
  const files = Array.from(input.files || []);
  if (!files.length) return;
  const maxPerFile = 4e3;
  for (const file of files) {
    try {
      const text = await file.text();
      const trimmed = text.length > maxPerFile ? text.slice(0, maxPerFile) + "\n\u2026 (truncated)" : text;
      const prefix = `

[File: ${file.name}]
`;
      this.elements.userInput.value += prefix + trimmed;
    } catch (e) {
      console.warn("Failed to read file", file.name, e);
    }
  }
  input.value = "";
  this.elements.userInput.focus();
};
SidePanelUI.prototype.toggleTabSelector = async function toggleTabSelector() {
  const isHidden = this.elements.tabSelector.classList.contains("hidden");
  if (isHidden) {
    await this.loadTabs();
    this.updateTabSelectorButton();
    this.elements.tabSelector.classList.remove("hidden");
  } else {
    this.closeTabSelector();
  }
};
SidePanelUI.prototype.closeTabSelector = function closeTabSelector() {
  this.elements.tabSelector.classList.add("hidden");
};
SidePanelUI.prototype.addActiveTabToSelection = async function addActiveTabToSelection() {
  const activeTab = await getActiveTab();
  if (!activeTab || typeof activeTab.id !== "number") return;
  this.selectedTabs.set(activeTab.id, this.buildSelectedTab(activeTab));
  this.updateSelectedTabsBar();
  this.updateTabSelectorButton();
  this.loadTabs();
};
SidePanelUI.prototype.clearSelectedTabs = function clearSelectedTabs() {
  if (this.selectedTabs.size === 0) return;
  this.selectedTabs.clear();
  this.updateSelectedTabsBar();
  this.updateTabSelectorButton();
  this.loadTabs();
};
SidePanelUI.prototype.loadTabs = async function loadTabs() {
  const tabGroupsApi = chrome.tabGroups;
  const [tabs, groups] = await Promise.all([
    chrome.tabs.query({}),
    tabGroupsApi?.query ? tabGroupsApi.query({}) : Promise.resolve([])
  ]);
  this.tabGroupInfo = new Map(groups.map((group) => [group.id, group]));
  this.elements.tabList.innerHTML = "";
  const groupedTabs = /* @__PURE__ */ new Map();
  const ungroupedTabs = [];
  tabs.filter((tab) => typeof tab.id === "number").forEach((tab) => {
    const groupId = typeof tab.groupId === "number" ? tab.groupId : -1;
    if (groupId >= 0) {
      if (!groupedTabs.has(groupId)) groupedTabs.set(groupId, []);
      const bucket = groupedTabs.get(groupId);
      if (bucket) bucket.push(tab);
    } else {
      ungroupedTabs.push(tab);
    }
  });
  const renderGroup = (label, color, groupTabs) => {
    if (!groupTabs.length) return;
    const section = document.createElement("div");
    section.className = "tab-group";
    const allSelected = groupTabs.every((tab) => typeof tab.id === "number" && this.selectedTabs.has(tab.id));
    section.innerHTML = `
        <div class="tab-group-header" style="--group-color: ${color}">
          <div class="tab-group-label">
            <span>${this.escapeHtml(label)}</span>
            <span class="tab-group-count">${groupTabs.length}</span>
          </div>
          <button class="tab-group-toggle" type="button">${allSelected ? "Clear" : "Add all"}</button>
        </div>
      `;
    const toggleBtn = section.querySelector(".tab-group-toggle");
    toggleBtn?.addEventListener("click", (event) => {
      event.stopPropagation();
      this.toggleGroupSelection(groupTabs, !allSelected);
    });
    groupTabs.forEach((tab) => {
      const tabId = tab.id;
      const isSelected = typeof tabId === "number" && this.selectedTabs.has(tabId);
      const item = document.createElement("div");
      item.className = `tab-item${isSelected ? " selected" : ""}`;
      const urlLabel = this.formatTabLabel(tab.url || "");
      item.innerHTML = `
          <div class="tab-item-checkbox"></div>
          <img class="tab-item-favicon" src="${tab.favIconUrl || "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27%23666%27%3E%3Crect width=%2724%27 height=%2724%27 rx=%274%27/%3E%3C/svg%3E"}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27%23666%27%3E%3Crect width=%2724%27 height=%2724%27 rx=%274%27/%3E%3C/svg%3E'">
          <div class="tab-item-text">
            <span class="tab-item-title">${this.escapeHtml(tab.title || "Untitled")}</span>
            ${urlLabel ? `<span class="tab-item-url">${this.escapeHtml(urlLabel)}</span>` : ""}
          </div>
        `;
      item.addEventListener("click", () => this.toggleTabSelection(tab, item));
      section.appendChild(item);
    });
    this.elements.tabList.appendChild(section);
  };
  groupedTabs.forEach((groupTabs, groupId) => {
    const group = this.tabGroupInfo.get(groupId);
    const label = group?.title || `Group ${groupId}`;
    const color = this.mapGroupColor(group?.color);
    renderGroup(label, color, groupTabs);
  });
  renderGroup("Ungrouped", "var(--text-tertiary)", ungroupedTabs);
};
SidePanelUI.prototype.toggleGroupSelection = function toggleGroupSelection(groupTabs, shouldSelect) {
  groupTabs.forEach((tab) => {
    if (typeof tab.id !== "number") return;
    if (shouldSelect) {
      this.selectedTabs.set(tab.id, this.buildSelectedTab(tab));
    } else {
      this.selectedTabs.delete(tab.id);
    }
  });
  this.updateSelectedTabsBar();
  this.updateTabSelectorButton();
  this.loadTabs();
};
SidePanelUI.prototype.toggleTabSelection = function toggleTabSelection(tab, itemElement) {
  if (typeof tab.id !== "number") return;
  if (this.selectedTabs.has(tab.id)) {
    this.selectedTabs.delete(tab.id);
    itemElement.classList.remove("selected");
  } else {
    this.selectedTabs.set(tab.id, this.buildSelectedTab(tab));
    itemElement.classList.add("selected");
  }
  this.updateSelectedTabsBar();
  this.updateTabSelectorButton();
  this.loadTabs();
};
SidePanelUI.prototype.buildSelectedTab = function buildSelectedTab(tab) {
  const groupId = typeof tab.groupId === "number" ? tab.groupId : -1;
  const group = groupId >= 0 ? this.tabGroupInfo.get(groupId) : void 0;
  const hasGroup = groupId >= 0;
  return {
    id: tab.id,
    title: tab.title,
    url: tab.url,
    windowId: tab.windowId,
    groupId: hasGroup ? groupId : -1,
    groupTitle: hasGroup ? group?.title || `Group ${groupId}` : "Ungrouped",
    groupColor: hasGroup ? this.mapGroupColor(group?.color) : "var(--text-tertiary)"
  };
};
SidePanelUI.prototype.updateSelectedTabsBar = function updateSelectedTabsBar() {
  if (this.selectedTabs.size === 0) {
    this.elements.selectedTabsBar.classList.add("hidden");
    return;
  }
  this.elements.selectedTabsBar.classList.remove("hidden");
  this.elements.selectedTabsBar.innerHTML = "";
  const grouped = /* @__PURE__ */ new Map();
  this.selectedTabs.forEach((tab) => {
    const hasGroup = typeof tab.groupId === "number" && tab.groupId >= 0;
    const key = hasGroup ? `group-${tab.groupId}` : "ungrouped";
    if (!grouped.has(key)) grouped.set(key, []);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(tab);
  });
  grouped.forEach((tabs) => {
    const groupTitle = tabs[0]?.groupTitle || "Ungrouped";
    const groupLabel = this.truncateText(groupTitle, 18) || "Ungrouped";
    const groupColor = tabs[0]?.groupColor || "var(--text-tertiary)";
    const groupWrap = document.createElement("div");
    groupWrap.className = "selected-tabs-group";
    groupWrap.innerHTML = `
        <div class="selected-group-label" style="--group-color: ${groupColor}">
          <span>${this.escapeHtml(groupLabel)}</span>
          <span class="selected-group-count">${tabs.length}</span>
        </div>
        <div class="selected-tabs-chips"></div>
      `;
    const chipsRow = groupWrap.querySelector(".selected-tabs-chips");
    if (!chipsRow) {
      this.elements.selectedTabsBar.appendChild(groupWrap);
      return;
    }
    tabs.forEach((tab) => {
      const chip = document.createElement("div");
      chip.className = "selected-tab-chip";
      chip.innerHTML = `
          <span>${this.escapeHtml(tab.title?.substring(0, 25) || "Tab")}${tab.title?.length > 25 ? "..." : ""}</span>
          <button title="Remove">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        `;
      const removeBtn = chip.querySelector("button");
      removeBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        this.selectedTabs.delete(tab.id);
        this.updateSelectedTabsBar();
        this.updateTabSelectorButton();
        this.loadTabs();
      });
      chipsRow.appendChild(chip);
    });
    this.elements.selectedTabsBar.appendChild(groupWrap);
  });
};
SidePanelUI.prototype.updateTabSelectorButton = function updateTabSelectorButton() {
  const count = this.selectedTabs.size;
  if (count > 0) {
    this.elements.tabSelectorBtn.classList.add("has-selection");
    this.elements.tabSelectorBtn.dataset.count = String(count);
  } else {
    this.elements.tabSelectorBtn.classList.remove("has-selection");
    delete this.elements.tabSelectorBtn.dataset.count;
  }
  if (this.elements.tabSelectorSummary) {
    this.elements.tabSelectorSummary.textContent = count > 0 ? `${count} selected` : "No tabs selected";
  }
};
SidePanelUI.prototype.mapGroupColor = function mapGroupColor(colorName) {
  const palette = {
    grey: "#9aa0a6",
    blue: "#4c8bf5",
    red: "#ea4335",
    yellow: "#fbbc04",
    green: "#34a853",
    pink: "#f06292",
    purple: "#a142f4",
    cyan: "#24c1e0",
    orange: "#f29900"
  };
  return palette[colorName] || "var(--text-tertiary)";
};
SidePanelUI.prototype.formatTabLabel = function formatTabLabel(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
SidePanelUI.prototype.getSelectedTabsContext = function getSelectedTabsContext(tabs, source = "selected") {
  const tabList = tabs ?? Array.from(this.selectedTabs.values());
  if (!tabList.length) return "";
  const label = source === "active" ? "active tab" : "selected tabs";
  let context = `

[Context from ${label}:]
`;
  tabList.forEach((tab) => {
    const tabTitle = tab.title || "Untitled";
    const groupLabel = tab.groupTitle ? `${tab.groupTitle} \xB7 ` : "";
    const urlLabel = tab.url || "";
    context += `- ${groupLabel}"${tabTitle}": ${urlLabel}
`;
  });
  return context;
};

// packages/extension/sidepanel/ui/chat/panel-tools.ts
var toolIcons = {
  // Browser tools
  browser_navigate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 12l6-6m-6 6l6 6"/></svg>',
  browser_click: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8m-4-4h8"/></svg>',
  browser_type: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 12h8M8 16h4"/></svg>',
  browser_screenshot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  browser_get_page_text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  browser_scroll: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
  browser_go_back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a4 4 0 0 1 4 4v1"/></svg>',
  browser_go_forward: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 14l5-5-5-5"/><path d="M20 9H10a4 4 0 0 0-4 4v1"/></svg>',
  browser_refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
  browser_find_element: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>',
  browser_press_key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8M12 8v8"/></svg>',
  browser_select_option: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  browser_get_element_text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>',
  browser_get_element_attribute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  browser_execute_script: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  browser_wait: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  browser_set_viewport: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>',
  browser_clear_cookies: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/><path d="M8.5 8.5l7 7"/><path d="M15.5 8.5l-7 7"/></svg>',
  browser_get_cookies: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/></svg>',
  browser_set_cookie: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>',
  browser_delete_cookie: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/><path d="M8 12h8"/></svg>',
  // Default
  default: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6m4.22-10.22l4.24-4.24M6.34 6.34L2.1 2.1m20.9 9.9h-6m-6 0H2.1m16.12 4.24l4.24 4.24M6.34 17.66l-4.24 4.24"/></svg>'
};
SidePanelUI.prototype.displayToolExecution = function displayToolExecution(toolName, args, result, toolCallId = null) {
  const entryId = toolCallId || `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let entry = this.toolCallViews.get(entryId);
  const displayName = toolName;
  if (!entry) {
    entry = {
      id: entryId,
      toolName: displayName,
      fullToolName: toolName,
      args,
      startTime: Date.now(),
      element: null,
      statusEl: null,
      durationEl: null
    };
    this.toolCallViews.set(entryId, entry);
    if (this.streamingState?.eventsEl) {
      const toolEl = this.createToolElement(entry);
      entry.element = toolEl;
      this.streamingState.eventsEl.appendChild(toolEl);
      this.streamingState.lastEventType = "tool";
    }
    this.scrollToBottom();
  }
  if (result !== null && result !== void 0) {
    this.updateToolResult(entry, result);
    const isError = result && (result.error || result.success === false);
    if (isError) {
      const detail = result?.details ? ` (${this.truncateText?.(String(result.details), 140) || String(result.details)})` : "";
      this.showErrorBanner(`${displayName}: ${result.error || "Tool execution failed"}${detail}`);
    }
  }
  this.updateActivityToggle();
};
SidePanelUI.prototype.createToolElement = function createToolElement(entry) {
  const container = document.createElement("div");
  container.className = "tool-row running";
  container.dataset.toolId = entry.id;
  const icon = this.getToolIcon(entry.fullToolName);
  const argsTokens = this.getArgsTokens(entry.args);
  const argsLabel = argsTokens.join(" \xB7 ");
  if (argsLabel) {
    container.title = argsLabel;
  }
  container.innerHTML = `
    <span class="tool-icon">${icon}</span>
    <span class="tool-name">${this.escapeHtml(entry.toolName)}</span>
    ${argsLabel ? `<span class="tool-args">${this.escapeHtml(argsLabel)}</span>` : ""}
    <span class="tool-status">RUN</span>
    <span class="tool-duration">...</span>
  `;
  entry.statusEl = container.querySelector(".tool-status");
  entry.durationEl = container.querySelector(".tool-duration");
  this.animateToolDuration(entry);
  return container;
};
SidePanelUI.prototype.animateToolDuration = function animateToolDuration(entry) {
  if (!entry.durationEl || entry.endTime) return;
  const update = () => {
    if (!entry.durationEl || entry.endTime) return;
    const elapsed = Date.now() - entry.startTime;
    entry.durationEl.textContent = elapsed < 1e3 ? `${elapsed}ms` : `${(elapsed / 1e3).toFixed(1)}s`;
    requestAnimationFrame(() => setTimeout(update, 100));
  };
  update();
};
SidePanelUI.prototype.updateToolResult = function updateToolResult(entry, result) {
  if (!entry || !entry.element) return;
  entry.endTime = Date.now();
  const isError = result && (result.error || result.success === false);
  const duration = entry.endTime - entry.startTime;
  const isNoopScroll = entry.fullToolName === "scroll" && result && result.success === true && result.moved === false;
  entry.element.classList.remove("running");
  entry.element.classList.add(isError ? "error" : "done");
  entry.element.classList.toggle("noop", isNoopScroll);
  if (entry.durationEl) {
    entry.durationEl.textContent = duration < 1e3 ? `${duration}ms` : `${(duration / 1e3).toFixed(1)}s`;
  }
  if (entry.statusEl) {
    entry.statusEl.textContent = isError ? "ERR" : "OK";
  }
  if (isNoopScroll) {
    entry.element.title = "Scroll did not move. The page may use an inner scroll container; pass scroll.selector.";
    let noteEl = entry.element.querySelector(".tool-note");
    if (!noteEl) {
      noteEl = document.createElement("span");
      noteEl.className = "tool-note";
      noteEl.textContent = "no-op";
      const argsEl = entry.element.querySelector(".tool-args");
      if (argsEl && argsEl.parentElement) {
        argsEl.insertAdjacentElement("afterend", noteEl);
      } else {
        const statusEl = entry.element.querySelector(".tool-status");
        if (statusEl && statusEl.parentElement) {
          statusEl.insertAdjacentElement("beforebegin", noteEl);
        } else {
          entry.element.appendChild(noteEl);
        }
      }
    }
  }
  entry.result = result;
};
SidePanelUI.prototype.refreshTimelineHud = function refreshTimelineHud() {
};
SidePanelUI.prototype.getToolIcon = function getToolIcon(toolName) {
  if (toolIcons[toolName]) {
    return toolIcons[toolName];
  }
  for (const [key, icon] of Object.entries(toolIcons)) {
    if (key === "default") continue;
    const searchKey = key.replace(/^browser_/, "");
    if (toolName.toLowerCase().includes(searchKey.toLowerCase())) {
      return icon;
    }
  }
  return toolIcons.default;
};
SidePanelUI.prototype.getArgsTokens = function getArgsTokens(args) {
  if (!args || typeof args !== "object") return [];
  const tokens = [];
  if (args.tabId) tokens.push(`tab ${args.tabId}`);
  if (args.url)
    tokens.push(
      String(args.url).replace(/^https?:\/\//, "").substring(0, 36)
    );
  if (args.path) tokens.push(String(args.path).substring(0, 36));
  if (args.selector) tokens.push(String(args.selector).substring(0, 40));
  if (args.text) {
    const value = String(args.text);
    tokens.push(`"${value.substring(0, 24)}${value.length > 24 ? "\u2026" : ""}"`);
  }
  if (args.query) {
    const value = String(args.query);
    tokens.push(`"${value.substring(0, 24)}${value.length > 24 ? "\u2026" : ""}"`);
  }
  if (args.key) tokens.push(`key ${args.key}`);
  if (args.direction) tokens.push(`scroll ${args.direction}`);
  if (args.type) tokens.push(String(args.type));
  const keys = Object.keys(args).filter((k) => !k.startsWith("_") && !tokens.join(" ").includes(k));
  if (tokens.length === 0 && keys.length === 1) {
    tokens.push(String(args[keys[0]]).substring(0, 30));
  } else if (tokens.length === 0 && keys.length > 1) {
    tokens.push(`${keys.length} params`);
  }
  return tokens;
};
SidePanelUI.prototype.showErrorBanner = function showErrorBanner(message, opts) {
  document.querySelectorAll(".error-banner").forEach((el) => el.remove());
  const actionHtml = opts?.action ? `<span class="error-action">${this.escapeHtml(opts.action)}</span>` : "";
  const settingsBtnHtml = opts?.category === "auth" ? `<button class="error-settings-btn" title="Open Settings">Settings</button>` : "";
  const banner = document.createElement("div");
  banner.className = "error-banner";
  banner.innerHTML = `
    <svg class="error-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
    <div class="error-body">
      <span class="error-text">${this.escapeHtml(message)}</span>
      ${actionHtml}
    </div>
    ${settingsBtnHtml}
    <button class="error-dismiss" title="Dismiss">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;
  const dismissButton = banner.querySelector(".error-dismiss");
  dismissButton?.addEventListener("click", () => banner.remove());
  const settingsBtn = banner.querySelector(".error-settings-btn");
  settingsBtn?.addEventListener("click", () => {
    banner.remove();
    this.openSettingsPanel?.();
  });
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 12e3);
};
SidePanelUI.prototype.clearRunIncompleteBanner = function clearRunIncompleteBanner() {
  document.querySelectorAll(".run-incomplete-banner").forEach((el) => el.remove());
};
SidePanelUI.prototype.clearErrorBanner = function clearErrorBanner() {
  document.querySelectorAll(".error-banner").forEach((el) => el.remove());
};
SidePanelUI.prototype.updateToolMessage = function updateToolMessage(entry, result) {
  if (!entry) return;
  if (entry.element) {
    this.updateToolResult(entry, result);
  }
};
SidePanelUI.prototype.updateToolLogEntry = function updateToolLogEntry(_entry, _result) {
};
SidePanelUI.prototype.updateActivityState = function updateActivityState() {
  const labels = [];
  if (this.runStartedAt) {
    const elapsed = Math.max(0, Date.now() - this.runStartedAt);
    const totalSeconds = Math.floor(elapsed / 1e3);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const label = `${minutes.toString().padStart(1, "0")}:${seconds.toString().padStart(2, "0")}`;
    labels.push(`Run ${label}`);
  }
  if (this.pendingToolCount > 0) {
    labels.push(`${this.pendingToolCount} action${this.pendingToolCount > 1 ? "s" : ""} running`);
  }
  if (this.isStreaming) {
    labels.push("Streaming response");
  }
  if (this.contextUsage && this.contextUsage.maxContextTokens) {
    const used = Math.max(0, this.contextUsage.approxTokens || 0);
    const max = Math.max(1, this.contextUsage.maxContextTokens || 0);
    const usedLabel = used >= 1e4 ? `${(used / 1e3).toFixed(1)}k` : `${used}`;
    const maxLabel = max >= 1e4 ? `${(max / 1e3).toFixed(0)}k` : `${max}`;
    labels.push(`Context ~ ${usedLabel} / ${maxLabel}`);
  }
  const usageLabel = this.buildUsageLabel?.(this.lastUsage);
  if (usageLabel) {
    labels.push(usageLabel);
  }
  if (this.elements.statusMeta) {
    if (labels.length > 0) {
      this.elements.statusMeta.textContent = labels.join(" \xB7 ");
      this.elements.statusMeta.classList.remove("hidden");
      this.elements.statusBar?.classList.add("has-meta");
    } else {
      this.elements.statusMeta.textContent = "";
      this.elements.statusMeta.classList.add("hidden");
      this.elements.statusBar?.classList.remove("has-meta");
    }
  }
  this.updateActivityToggle();
};
SidePanelUI.prototype.updateActivityToggle = function updateActivityToggle() {
};
SidePanelUI.prototype.toggleActivityPanel = function toggleActivityPanel(_force) {
};
SidePanelUI.prototype.updateThinkingPanel = function updateThinkingPanel(thinking, isStreaming = false) {
  if (thinking) {
    this.latestThinking = dedupeThinking(thinking.trim());
  } else if (!isStreaming) {
    this.latestThinking = null;
  }
  if (this.streamingState?.eventsEl && this.latestThinking) {
    let thinkingBlock = this.streamingState.eventsEl.querySelector(".inline-thinking-block");
    if (!thinkingBlock) {
      thinkingBlock = document.createElement("div");
      thinkingBlock.className = "inline-thinking-block";
      thinkingBlock.innerHTML = `
        <div class="thinking-block-inner">
          <div class="thinking-header-inline">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4"/>
              <path d="M12 8h.01"/>
            </svg>
            <span>Thinking</span>
          </div>
          <div class="thinking-content-inline"></div>
        </div>
      `;
      const firstChild = this.streamingState.eventsEl.firstChild;
      if (firstChild) {
        this.streamingState.eventsEl.insertBefore(thinkingBlock, firstChild);
      } else {
        this.streamingState.eventsEl.appendChild(thinkingBlock);
      }
    }
    const contentEl = thinkingBlock.querySelector(".thinking-content-inline");
    if (contentEl) {
      contentEl.textContent = this.latestThinking;
    }
  }
};
SidePanelUI.prototype.resetActivityPanel = function resetActivityPanel() {
  if (this.elements.chatMessages) {
    const trees = this.elements.chatMessages.querySelectorAll(".tool-card, .step-block");
    trees.forEach((tree) => tree.remove());
  }
  this.latestThinking = null;
  this.activeToolName = null;
  this.toolCallViews.clear();
  this.stepTimeline.steps.clear();
  this.stepTimeline.activeStepIndex = null;
  this.stepTimeline.activeStepBody = null;
};

// packages/extension/sidepanel/ui/status/panel-usage.ts
SidePanelUI.prototype.formatCurrency = function formatCurrency(amount, currency = "usd") {
  if (amount === null || amount === void 0) return "";
  const value = Number(amount) / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase()
    }).format(value);
  } catch (error) {
    return `${value.toFixed(2)} ${currency.toUpperCase()}`;
  }
};
SidePanelUI.prototype.formatShortDate = function formatShortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString();
};
SidePanelUI.prototype.formatTokenCount = function formatTokenCount(value) {
  if (!value || value <= 0) return "0";
  if (value >= 1e3) {
    const precision = value >= 1e4 ? 0 : 1;
    return `${(value / 1e3).toFixed(precision)}k`;
  }
  return `${Math.round(value)}`;
};
SidePanelUI.prototype.normalizeUsage = function normalizeUsage2(usage) {
  if (!usage) return null;
  const inputTokens = Math.max(0, usage.inputTokens || 0);
  const outputTokens = Math.max(0, usage.outputTokens || 0);
  const totalTokens = Math.max(0, usage.totalTokens || inputTokens + outputTokens);
  if (!inputTokens && !outputTokens && !totalTokens) return null;
  return { inputTokens, outputTokens, totalTokens };
};
SidePanelUI.prototype.buildUsageLabel = function buildUsageLabel(usage) {
  if (!usage) return "";
  const parts = [];
  if (usage.inputTokens) {
    parts.push(`${this.formatTokenCount(usage.inputTokens)} in`);
  }
  if (usage.outputTokens) {
    parts.push(`${this.formatTokenCount(usage.outputTokens)} out`);
  }
  if (!parts.length && usage.totalTokens) {
    parts.push(`${this.formatTokenCount(usage.totalTokens)} total`);
  }
  return parts.length ? `Tokens ${parts.join(" / ")}` : "";
};
SidePanelUI.prototype.buildMessageMeta = function buildMessageMeta(usage, modelLabel) {
  const segments = [];
  const model = modelLabel?.trim();
  if (model) {
    segments.push(model);
  }
  const usageLabel = this.buildUsageLabel(usage);
  if (usageLabel) {
    segments.push(usageLabel);
  }
  return segments.join(" \xB7 ");
};
SidePanelUI.prototype.estimateUsageFromContent = function estimateUsageFromContent(content) {
  if (!content) return null;
  const tokens = Math.ceil(content.length / 4);
  if (!tokens) return null;
  return {
    inputTokens: 0,
    outputTokens: tokens,
    totalTokens: tokens
  };
};
SidePanelUI.prototype.getActiveModelLabel = function getActiveModelLabel() {
  const config = this.configs[this.currentConfig] || {};
  return config.model || "";
};
SidePanelUI.prototype.updateUsageStats = function updateUsageStats(usage) {
  if (!usage) return;
  this.lastUsage = usage;
  this.sessionTokenTotals = {
    inputTokens: this.sessionTokenTotals.inputTokens + usage.inputTokens,
    outputTokens: this.sessionTokenTotals.outputTokens + usage.outputTokens,
    totalTokens: this.sessionTokenTotals.totalTokens + usage.totalTokens
  };
  this.updateActivityState();
};

// packages/extension/sidepanel/ui/core/panel-view.ts
SidePanelUI.prototype.switchView = function switchView(view) {
  this.currentView = view;
  if (!this.elements.chatInterface) return;
  this.elements.chatInterface.classList.remove("hidden");
};
SidePanelUI.prototype.openSidebar = function openSidebar() {
  setSidebarOpen(this.elements, true);
};
SidePanelUI.prototype.closeSidebar = function closeSidebar() {
  setSidebarOpen(this.elements, false);
};
SidePanelUI.prototype.showRightPanel = function showRightPanel2(panelName) {
  showRightPanel(this.elements, panelName);
};
SidePanelUI.prototype.setNavActive = function setNavActive(navName) {
  updateNavActive(this.elements, navName);
};
SidePanelUI.prototype.openChatView = function openChatView() {
  this.closeSidebar();
  this.switchView("chat");
};
SidePanelUI.prototype.openHistoryPanel = function openHistoryPanel() {
  this.openSidebar();
  this.showRightPanel("history");
  this.setNavActive("history");
  this.loadHistoryList();
};
SidePanelUI.prototype.openSettingsPanel = function openSettingsPanel() {
  this.openSidebar();
  this.showRightPanel("settings");
  this.switchSettingsTab(this.currentSettingsTab || "setup");
  this.setNavActive("settings");
};
SidePanelUI.prototype.startNewSession = function startNewSession() {
  this.displayHistory = [];
  this.contextHistory = [];
  const suffix = typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : String(Date.now());
  this.sessionId = `session-${suffix}`;
  this.sessionStartedAt = Date.now();
  this.firstUserMessage = "";
  this.sessionTokensUsed = 0;
  this.lastUsage = null;
  this.sessionTokenTotals = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0
  };
  this.currentPlan = null;
  this.hidePlanDrawer();
  this.stopThinkingTimer?.();
  this.stopRunTimer?.();
  this.stopWatchdog?.();
  this.elements.composer?.classList.remove("running");
  this.pendingToolCount = 0;
  this.isStreaming = false;
  this.activeToolName = null;
  this.subagents.clear();
  this.activeAgent = "main";
  this.historyTurnMap.clear();
  this.pendingTurnDraft = null;
  this.elements.chatMessages.innerHTML = "";
  this.toolCallViews.clear();
  this.updateChatEmptyState?.();
  this.resetActivityPanel();
  this.hideAgentNav();
  this.updateStatus("Ready for a new session", "success");
  this.switchView("chat");
  this.updateContextUsage();
  this.scrollToBottom({ force: true });
};

// packages/extension/sidepanel/ui/core/layout-loader.ts
var loadTemplate = async (path) => {
  const url = chrome.runtime.getURL(`sidepanel/templates/${path}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load template: ${path}`);
  }
  return response.text();
};
var injectInnerHtml = (root, selector, html) => {
  const target = root.querySelector(selector);
  if (!target) return;
  target.innerHTML = html.trim();
};
var loadPanelLayout = async () => {
  const appRoot = document.getElementById("appRoot");
  if (!appRoot) return;
  const [sidebarShell, mainContent, historyPanel, settingsPanel, settingsGeneral, settingsProfiles, tabSelector] = await Promise.all([
    loadTemplate("sidebar-shell.html"),
    loadTemplate("main.html"),
    loadTemplate("panels/history.html"),
    loadTemplate("panels/settings.html"),
    loadTemplate("panels/settings-general.html"),
    loadTemplate("panels/settings-profiles.html"),
    loadTemplate("tab-selector.html")
  ]);
  appRoot.className = "app-container";
  appRoot.innerHTML = "";
  const appContainer = appRoot;
  appContainer.insertAdjacentHTML("beforeend", sidebarShell.trim());
  appContainer.insertAdjacentHTML("beforeend", mainContent.trim());
  const rightPanels = appContainer.querySelector("#rightPanelPanels");
  rightPanels?.insertAdjacentHTML("beforeend", (historyPanel + settingsPanel).trim());
  const tmp = document.createElement("div");
  tmp.innerHTML = settingsGeneral.trim();
  const panes = tmp.querySelectorAll(".settings-tab-pane[data-pane]");
  for (const pane of Array.from(panes)) {
    const paneName = pane.dataset.pane;
    if (!paneName) continue;
    const containerId = `#settingsTab${paneName.charAt(0).toUpperCase() + paneName.slice(1)}`;
    const container = appContainer.querySelector(containerId);
    if (container) {
      container.innerHTML = pane.outerHTML;
    }
  }
  injectInnerHtml(appContainer, "#settingsTabProfiles", settingsProfiles);
  const modalRoot = document.getElementById("modalRoot");
  if (modalRoot) {
    modalRoot.innerHTML = tabSelector;
  }
};

// packages/extension/sidepanel/panel.ts
var init2 = async () => {
  await loadPanelLayout();
  const ui = new SidePanelUI();
  window.sidePanelUI = ui;
};
void init2();
//# sourceMappingURL=panel.js.map
