import { setSidebarOpen, showRightPanel as showRightPanelContent, updateNavActive } from './panel-navigation.js';
import { SidePanelUI } from './panel-ui.js';

(SidePanelUI.prototype as any).switchView = function switchView(view: 'chat' | 'history') {
  this.currentView = view;
  // History is a right-side panel now (see templates/panels/history.html), not a main view.
  // Keep chat visible and let showRightPanel() control sidebar content.
  if (!this.elements.chatInterface) return;
  this.elements.chatInterface.classList.remove('hidden');
};

(SidePanelUI.prototype as any).openSidebar = function openSidebar() {
  setSidebarOpen(this.elements, true);
};

(SidePanelUI.prototype as any).closeSidebar = function closeSidebar() {
  setSidebarOpen(this.elements, false);
};

(SidePanelUI.prototype as any).showRightPanel = function showRightPanel(panelName: 'history' | 'settings' | null) {
  showRightPanelContent(this.elements, panelName);
};

(SidePanelUI.prototype as any).setNavActive = function setNavActive(navName: 'history' | 'settings') {
  updateNavActive(this.elements, navName);
};

(SidePanelUI.prototype as any).openChatView = function openChatView() {
  this.closeSidebar();
  this.switchView('chat');
};

(SidePanelUI.prototype as any).openHistoryPanel = function openHistoryPanel() {
  this.openSidebar();
  this.showRightPanel('history');
  this.setNavActive('history');
  this.loadHistoryList(); // Refresh history when opening panel
};

(SidePanelUI.prototype as any).openSettingsPanel = function openSettingsPanel() {
  this.openSidebar();
  this.showRightPanel('settings');
  this.switchSettingsTab(this.currentSettingsTab || 'setup');
  this.setNavActive('settings');
};

(SidePanelUI.prototype as any).startNewSession = function startNewSession() {
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
  this.subagents.clear();
  this.activeAgent = 'main';
  this.historyTurnMap.clear();
  this.pendingTurnDraft = null;
  this.elements.chatMessages.innerHTML = '';
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
