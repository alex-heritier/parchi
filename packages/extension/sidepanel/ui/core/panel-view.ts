import { setSidebarOpen, showRightPanel as showRightPanelContent } from './panel-navigation.js';
import { SidePanelUI } from './panel-ui.js';
const sidePanelProto = SidePanelUI.prototype as SidePanelUI & Record<string, unknown>;


sidePanelProto.switchView = function switchView(view: 'chat' | 'history') {
  this.currentView = view;
  // History is now a top drawer overlay, not a main view.
  // Keep chat visible and let showRightPanel() control sidebar content.
  if (!this.elements.chatInterface) return;
  this.elements.chatInterface.classList.remove('hidden');
};

sidePanelProto.openSidebar = function openSidebar() {
  setSidebarOpen(this.elements, true);
};

sidePanelProto.closeSidebar = function closeSidebar() {
  setSidebarOpen(this.elements, false);
};

sidePanelProto.showRightPanel = function showRightPanel(panelName: 'settings' | null) {
  showRightPanelContent(this.elements, panelName);
};

sidePanelProto.openChatView = function openChatView() {
  this.closeSidebar();
  this.switchView('chat');
};

sidePanelProto.openHistoryDrawer = function openHistoryDrawer() {
  this.elements.historyDrawer?.classList.remove('hidden');
  this.elements.historyDrawerScrim?.classList.remove('hidden');
  this.loadHistoryList();
  // Focus search input for quick filtering
  setTimeout(() => this.elements.historySearchInput?.focus(), 100);
};

sidePanelProto.closeHistoryDrawer = function closeHistoryDrawer() {
  this.elements.historyDrawer?.classList.add('hidden');
  this.elements.historyDrawerScrim?.classList.add('hidden');
  // Clear search on close
  if (this.elements.historySearchInput) {
    this.elements.historySearchInput.value = '';
  }
};

sidePanelProto.openSettingsPanel = function openSettingsPanel() {
  this.openSidebar();
  this.showRightPanel('settings');
  this.switchSettingsTab(this.currentSettingsTab || 'setup');
  void this.refreshAccountPanel?.({ silent: true });
};

sidePanelProto.startNewSession = function startNewSession() {
  // Auto-save current session before clearing state
  this.autoSaveSessionJsonl?.();

  if (this.elements.composer?.classList.contains('running')) {
    this.requestRunStop?.('Stopped (new session)');
  }
  this.displayHistory = [];
  this.contextHistory = [];
  const suffix = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now());
  this.sessionId = `session-${suffix}`;
  this.sessionStartedAt = Date.now();
  this.firstUserMessage = '';
  this.sessionTokensUsed = 0;
  this.lastUsage = null;
  this.sessionTokenTotals = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
  this.currentPlan = null;
  this.hidePlanDrawer();
  this.stopThinkingTimer?.();
  this.stopRunTimer?.();
  this.stopWatchdog?.();
  this.elements.composer?.classList.remove('running');
  this.pendingToolCount = 0;
  this.isStreaming = false;
  this.activeToolName = null;
  this._lastTypingAt = 0;
  this._mascotBubbleOpen = false;
  const mascotBubble = document.getElementById('mascotBubble');
  if (mascotBubble) mascotBubble.classList.add('hidden');
  this.updateMascotEyeState?.();
  this.subagents.clear();
  this.activeAgent = 'main';
  this.historyTurnMap.clear();
  // Revoke blob URLs and abort listeners before clearing
  for (const img of this.reportImages.values()) {
    if (img._blobUrl) {
      URL.revokeObjectURL(img._blobUrl);
    }
  }
  this.reportImages.clear();
  this.reportImageOrder = [];
  this.selectedReportImageIds.clear();
  this.pendingTurnDraft = null;
  this.elements.chatMessages.innerHTML = '';
  for (const entry of this.toolCallViews.values()) {
    entry.abortController?.abort();
  }
  this.toolCallViews.clear();
  this.updateChatEmptyState?.();
  this.resetActivityPanel();
  this.hideAgentNav();
  // Clear session tabs HUD
  this.sessionTabsState = {
    tabs: [],
    activeTabId: null,
    maxTabs: 5,
    groupTitle: undefined,
    interactingTabId: null,
  };
  this.renderSessionTabsHud?.();
  this.updateStatus('Ready for a new session', 'success');
  this.switchView('chat');
  this.updateContextUsage();
  this.scrollToBottom({ force: true });
};
