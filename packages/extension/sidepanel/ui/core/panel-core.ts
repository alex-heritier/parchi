import { isRuntimeMessage } from '@parchi/shared';
import { createMessage, normalizeConversationHistory } from '../../../ai/message-schema.js';
import type { Message } from '../../../ai/message-schema.js';
import { appendTrace, pruneOldTraces } from '../chat/trace-store.js';
import { recordUsage } from '../settings/usage-store.js';
import { bindSidebarNavigation, setSidebarOpen } from './panel-navigation.js';

const debounce = (fn: (...args: any[]) => void, ms: number) => {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};
import { SidePanelUI } from './panel-ui.js';
const sidePanelProto = SidePanelUI.prototype as SidePanelUI & Record<string, unknown>;

const resolveTextAreaMaxHeight = (textarea: HTMLTextAreaElement, fallbackHeight: number): number => {
  const computedMaxHeight = Number.parseFloat(getComputedStyle(textarea).maxHeight);
  if (Number.isFinite(computedMaxHeight) && computedMaxHeight > 0) {
    return computedMaxHeight;
  }
  return fallbackHeight;
};

const autoResizeTextArea = (textarea: HTMLTextAreaElement | null, maxHeight: number, minHeight = 0) => {
  if (!textarea) return;
  const resolvedMaxHeight = resolveTextAreaMaxHeight(textarea, maxHeight);
  const resolvedMinHeight = Math.min(Math.max(0, minHeight), resolvedMaxHeight);
  textarea.style.height = 'auto';
  const nextHeight = Math.min(textarea.scrollHeight, resolvedMaxHeight);
  const clampedHeight = Math.max(nextHeight, resolvedMinHeight);
  textarea.style.height = `${clampedHeight}px`;
  textarea.style.overflowY =
    textarea.scrollHeight > resolvedMaxHeight || clampedHeight >= resolvedMaxHeight ? 'auto' : 'hidden';
};

const MAX_HISTORY_TURN_ENTRIES = 200;
const MAX_TOOL_EVENTS_PER_TURN = 160;
const MAX_TRACE_STRING_LENGTH = 4000;
const MAX_TRACE_ARRAY_ITEMS = 40;
const MAX_TRACE_OBJECT_KEYS = 60;

const clampHistoryTurnMap = (self: any) => {
  if (!self?.historyTurnMap || self.historyTurnMap.size <= MAX_HISTORY_TURN_ENTRIES) return;
  const overflow = self.historyTurnMap.size - MAX_HISTORY_TURN_ENTRIES;
  const keys = self.historyTurnMap.keys();
  for (let i = 0; i < overflow; i += 1) {
    const key = keys.next().value;
    if (key === undefined) break;
    self.historyTurnMap.delete(key);
  }
};

const capTurnToolEvents = (turnEntry: any) => {
  if (!turnEntry || !Array.isArray(turnEntry.toolEvents)) return;
  if (turnEntry.toolEvents.length <= MAX_TOOL_EVENTS_PER_TURN) return;
  turnEntry.toolEvents.splice(0, turnEntry.toolEvents.length - MAX_TOOL_EVENTS_PER_TURN);
};

const sanitizeTracePayload = (value: any, depth = 0): any => {
  if (value == null) return value;
  if (typeof value === 'string') {
    if (value.startsWith('data:image/') || value.startsWith('data:application/octet-stream')) {
      return '[omitted dataUrl]';
    }
    if (value.length <= MAX_TRACE_STRING_LENGTH) return value;
    return `${value.slice(0, MAX_TRACE_STRING_LENGTH)}…`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'function') return undefined;
  if (depth > 5) return '[truncated]';
  if (Array.isArray(value)) {
    const cap = Math.min(value.length, MAX_TRACE_ARRAY_ITEMS);
    const out = new Array(cap);
    for (let i = 0; i < cap; i += 1) {
      out[i] = sanitizeTracePayload(value[i], depth + 1);
    }
    if (value.length > cap) {
      out.push(`[+${value.length - cap} items truncated]`);
    }
    return out;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: sanitizeTracePayload(value.stack || '', depth + 1),
    };
  }
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    let keysSeen = 0;
    for (const [key, raw] of Object.entries(value)) {
      keysSeen += 1;
      if (keysSeen > MAX_TRACE_OBJECT_KEYS) {
        out.__truncatedKeys = `[+${Object.keys(value).length - MAX_TRACE_OBJECT_KEYS} keys truncated]`;
        break;
      }
      const lower = key.toLowerCase();
      if (lower.includes('dataurl') || lower === 'dataurl' || lower.endsWith('base64')) {
        out[key] = '[omitted dataUrl]';
        continue;
      }
      if (lower === 'frames' && Array.isArray(raw)) {
        out[key] = { count: raw.length, omitted: true };
        continue;
      }
      out[key] = sanitizeTracePayload(raw, depth + 1);
    }
    return out;
  }
  return String(value);
};

sidePanelProto.init = async function init() {
  try {
    this.connectLifecyclePort();
    this.setupEventListeners();
    this.setupPlanDrawer();
    this.setupResizeObserver();
    setSidebarOpen(this.elements, false);
    await this.loadSettings();
    await this.initAccountPanel?.();
    this.initProviderCardListeners?.();
    this.populateProviderDropdown?.();
    this.renderApiProviderGrid?.();
    await this.loadWorkflows();
    await this.loadHistoryList();
    this.updateContextUsage?.();
    this.updateStatus('Ready', 'success');
    this.updateModelDisplay();
    this.fetchAvailableModels();
    this.updateChatEmptyState?.();
    this.initMascotBubble?.();
    this.initSessionTabsOrb?.();
    // Prune old traces (>7 days) in background — fire and forget
    pruneOldTraces().catch(() => {});
  } catch (error) {
    console.error('[Parchi] init() failed:', error);
    this.updateStatus('Initialization failed - check console', 'error');
  }
};

sidePanelProto.connectLifecyclePort = function connectLifecyclePort() {
  if (this.lifecyclePort) return;
  try {
    const port = chrome.runtime.connect({ name: 'sidepanel-lifecycle' });
    this.lifecyclePort = port;
    port.onDisconnect.addListener(() => {
      if (this.lifecyclePort === port) {
        this.lifecyclePort = null;
      }
    });
  } catch (error) {
    console.warn('[Parchi] Failed to connect sidepanel lifecycle port:', error);
  }
};

sidePanelProto.requestRunStop = function requestRunStop(note = 'Stopped') {
  if (!this.lifecyclePort) {
    this.connectLifecyclePort?.();
  }
  const payload = {
    type: 'stop_run',
    sessionId: this.sessionId,
    note,
  };
  try {
    void chrome.runtime.sendMessage(payload);
  } catch {}
  try {
    this.lifecyclePort?.postMessage(payload);
  } catch {}
};

sidePanelProto.setupEventListeners = function setupEventListeners() {
  bindSidebarNavigation(this.elements, {
    onOpen: () => this.openSettingsPanel(),
    onClose: () => this.closeSidebar(),
  });

  const stopOnClose = () => {
    this.requestRunStop('Stopped (panel closed)');
  };
  window.addEventListener('pagehide', stopOnClose);
  window.addEventListener('beforeunload', () => {
    stopOnClose();
    this.autoSaveSessionJsonl?.();
  });

  this.elements.startNewSessionBtn?.addEventListener('click', () => this.startNewSession());
  this.elements.newSessionFab?.addEventListener('click', () => this.startNewSession());
  this.elements.clearHistoryBtn?.addEventListener('click', () => this.clearAllHistory());

  // History drawer
  this.elements.historyFab?.addEventListener('click', () => this.openHistoryDrawer());
  this.elements.closeHistoryDrawerBtn?.addEventListener('click', () => this.closeHistoryDrawer());
  this.elements.historyDrawerScrim?.addEventListener('click', () => this.closeHistoryDrawer());
  this.elements.drawerClearHistoryBtn?.addEventListener('click', () => this.clearAllHistory());
  this.elements.drawerNewSessionBtn?.addEventListener('click', () => {
    this.closeHistoryDrawer();
    this.startNewSession();
  });
  this.elements.historySearchInput?.addEventListener(
    'input',
    debounce(() => {
      const query = (this.elements.historySearchInput?.value || '').trim();
      this.filterHistoryList(query);
    }, 150),
  );

  // Balance popover on status bar click
  const statusBar = document.getElementById('statusBar');
  const balancePopover = document.getElementById('balancePopover');
  const balancePopoverClose = document.getElementById('balancePopoverClose');
  if (statusBar && balancePopover) {
    statusBar.addEventListener('click', () => this.toggleBalancePopover?.());
    balancePopoverClose?.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      balancePopover.classList.add('hidden');
    });
    // Close popover when clicking outside
    document.addEventListener('click', (e: Event) => {
      if (
        !balancePopover.classList.contains('hidden') &&
        !balancePopover.contains(e.target as Node) &&
        !statusBar.contains(e.target as Node)
      ) {
        balancePopover.classList.add('hidden');
      }
    });
  }

  this.elements.contextInspectorBtn?.addEventListener('click', () => {
    void this.requestManualContextCompaction?.();
  });

  // Provider change — also refresh model catalog for setup tab
  const debouncedSetupModelRefresh = debounce(() => this.refreshModelCatalog({ force: true }), 800);
  this.elements.provider?.addEventListener('change', () => {
    this.toggleCustomEndpoint();
    this.updateScreenshotToggleState();
    debouncedSetupModelRefresh();
  });

  // Custom endpoint validation + model refresh
  this.elements.customEndpoint?.addEventListener('input', () => {
    this.validateCustomEndpoint();
    debouncedSetupModelRefresh();
  });
  this.elements.apiKey?.addEventListener('input', debouncedSetupModelRefresh);
  this.elements.model?.addEventListener('input', () => {
    if (!this.configs?.[this.currentConfig]) return;
    this.configs[this.currentConfig] = {
      ...this.configs[this.currentConfig],
      model: String(this.elements.model?.value || '').trim(),
    };
    this.populateModelSelect?.();
    this.updateModelDisplay?.();
  });

  // Temperature slider
  this.elements.temperature?.addEventListener('input', () => {
    if (this.elements.temperatureValue) {
      this.elements.temperatureValue.textContent = this.elements.temperature.value;
    }
  });

  // Configuration management
  this.elements.newConfigBtn?.addEventListener('click', () => this.createNewConfig());
  this.elements.newProfileInput?.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.createNewConfig();
    }
  });
  this.elements.deleteConfigBtn?.addEventListener('click', () => this.deleteConfig());
  this.elements.activeConfig?.addEventListener('change', () => this.switchConfig());

  this.elements.settingsTabProvidersBtn?.addEventListener('click', () => this.switchSettingsTab('providers'));
  this.elements.settingsTabProfilesBtn?.addEventListener('click', () => this.switchSettingsTab('profiles'));
  this.elements.settingsTabDesignBtn?.addEventListener('click', () => this.switchSettingsTab('design'));
  this.elements.settingsTabAdvancedBtn?.addEventListener('click', () => this.switchSettingsTab('advanced'));
  document.getElementById('usageRefreshBtn')?.addEventListener('click', () => this.refreshUsageTab?.());
  document.getElementById('usageClearBtn')?.addEventListener('click', () => this.clearUsageData?.());
  this.elements.createProfileBtn?.addEventListener('click', () => this.createProfileFromInput());
  this.elements.agentGrid?.addEventListener('click', (event) => {
    if ((event.target as HTMLElement | null)?.closest('.profile-editor')) {
      return;
    }
    const deleteBtn = (event.target as HTMLElement | null)?.closest('.agent-card-delete') as HTMLElement | null;
    if (deleteBtn) {
      event.stopPropagation();
      const profileName = deleteBtn.dataset.deleteProfile;
      if (profileName) this.deleteProfileByName(profileName);
      return;
    }
    const pill = (event.target as HTMLElement | null)?.closest('.role-pill');
    if (pill) {
      const role = (pill as HTMLElement).dataset.role;
      const profile = (pill as HTMLElement).dataset.profile;
      this.assignProfileRole(profile, role);
      return;
    }
    const card = (event.target as HTMLElement | null)?.closest('.agent-card');
    if (card) {
      const profile = (card as HTMLElement).dataset.profile;
      this.editProfile(profile);
    }
  });
  this.elements.refreshProfilesBtn?.addEventListener('click', () => this.renderProfileGrid());

  // Screenshot + vision controls
  this.elements.enableScreenshots?.addEventListener('change', () => this.updateScreenshotToggleState());
  this.elements.visionProfile?.addEventListener('change', () => {
    this.updateScreenshotToggleState();
    this.updatePromptSections?.();
  });
  this.elements.sendScreenshotsAsImages?.addEventListener('change', () => this.updateScreenshotToggleState());
  this.elements.orchestratorToggle?.addEventListener('change', () => this.updatePromptSections?.());
  this.elements.orchestratorProfile?.addEventListener('change', () => this.updatePromptSections?.());

  // Auto-save sessions toggle
  this.elements.autoSaveSession?.addEventListener('change', () => {
    const enabled = this.elements.autoSaveSession?.value === 'true';
    const folderGroup = document.getElementById('autoSaveFolderGroup');
    if (folderGroup) folderGroup.style.display = enabled ? '' : 'none';
  });
  this.elements.autoSaveFolderBtn?.addEventListener('click', async () => {
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      this._autoSaveDirHandle = handle;
      if (this.elements.autoSaveFolderLabel) this.elements.autoSaveFolderLabel.textContent = handle.name;
    } catch {
      // User cancelled or API unavailable
    }
  });

  // Save settings
  this.elements.saveSettingsBtn?.addEventListener('click', () => {
    void this.saveSettings();
  });
  this.elements.saveRelayBtn?.addEventListener('click', async () => {
    await this.persistAllSettings({ silent: false });
    // Ensure the MV3 service worker wakes up and immediately applies the new config.
    try {
      await chrome.runtime.sendMessage({ type: 'relay_reconfigure' });
    } catch {}
  });

  this.elements.copyRelayEnvBtn?.addEventListener('click', async () => {
    const rawUrl = String(this.elements.relayUrl?.value || '').trim();
    const token = String(this.elements.relayToken?.value || '').trim();
    if (!rawUrl) {
      this.updateStatus('Enter a relay URL first', 'warning');
      return;
    }
    if (!token) {
      this.updateStatus('Enter a relay token first', 'warning');
      return;
    }

    let host = '127.0.0.1';
    let port = '17373';
    try {
      const url = new URL(rawUrl);
      host = url.hostname || host;
      port = url.port || port;
    } catch {
      const cleaned = rawUrl.replace(/^https?:\/\//, '');
      const [h, p] = cleaned.split(':');
      if (h) host = h;
      if (p) port = p;
    }

    const text = `export PARCHI_RELAY_TOKEN="${token}"
export PARCHI_RELAY_HOST="${host}"
export PARCHI_RELAY_PORT="${port}"`;

    try {
      await navigator.clipboard.writeText(text);
      this.updateStatus('Relay env vars copied', 'success');
    } catch {
      this.updateStatus('Unable to copy relay env vars', 'error');
    }
  });

  // Cancel settings
  this.elements.cancelSettingsBtn?.addEventListener('click', () => {
    void this.cancelSettings();
  });

  this.elements.exportSettingsBtn?.addEventListener('click', () => this.exportSettings());
  this.elements.importSettingsBtn?.addEventListener('click', () => {
    this.elements.importSettingsInput?.click();
  });
  this.elements.importSettingsInput?.addEventListener('change', (event) => this.importSettings(event));

  // Send message, queue, or stop depending on running state
  this.elements.sendBtn?.addEventListener('click', () => {
    const isRunning = this.elements.composer?.classList.contains('running');
    const hasText = this.elements.userInput?.value.trim();

    if (isRunning && hasText) {
      // Queue the message — it will send after the current turn completes
      this.queuedMessage = this.elements.userInput.value.trim();
      this.elements.userInput.value = '';
      this.elements.userInput.style.height = '';
      this.updateStatus('Message queued', 'active');
    } else if (isRunning) {
      // No text — stop the run
      this.requestRunStop('Stopped by user');
      this.stopWatchdog?.();
      this.stopThinkingTimer?.();
      this.stopRunTimer?.();
      this.elements.composer?.classList.remove('running');
      this.pendingTurnDraft = null;
      this.pendingRecordedContext = null;
      this.hideRecordedContextBadge?.();
      this.pendingToolCount = 0;
      this.isStreaming = false;
      this.activeToolName = null;
      this.queuedMessage = null;
      this.updateActivityState();
      this.finishStreamingMessage();
      this.clearErrorBanner?.();
      this.insertStoppedDivider();
      this.updateStatus('Stopped', 'warning');
    } else {
      this.sendMessage();
    }
  });

  // Enter to send (Shift+Enter for newline), workflow menu gets priority
  // When running: Enter queues the message (same as clicking the send button)
  this.elements.userInput?.addEventListener('keydown', (event: KeyboardEvent) => {
    if (this.workflowMenuOpen && this.handleWorkflowKeydown(event)) {
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const isRunning = this.elements.composer?.classList.contains('running');
      const hasText = this.elements.userInput?.value.trim();

      if (isRunning && hasText) {
        // Queue the message — it will send after the current turn completes
        this.queuedMessage = this.elements.userInput.value.trim();
        this.elements.userInput.value = '';
        this.elements.userInput.style.height = '';
        this.updateStatus('Message queued', 'active');
      } else if (isRunning) {
        // No text — stop the run
        this.requestRunStop('Stopped by user');
        this.stopWatchdog?.();
        this.stopThinkingTimer?.();
        this.stopRunTimer?.();
        this.elements.composer?.classList.remove('running');
        this.pendingTurnDraft = null;
        this.pendingRecordedContext = null;
        this.hideRecordedContextBadge?.();
        this.pendingToolCount = 0;
        this.isStreaming = false;
        this.activeToolName = null;
        this.queuedMessage = null;
        this.updateActivityState();
        this.finishStreamingMessage();
        this.clearErrorBanner?.();
        this.insertStoppedDivider();
        this.updateStatus('Stopped', 'warning');
      } else {
        this.sendMessage();
      }
    }
  });
  this.elements.userInput?.addEventListener('paste', (event: ClipboardEvent) => {
    const files = Array.from(event.clipboardData?.files || []) as File[];
    if (!files.length) return;
    event.preventDefault();
    void this.ingestFilesIntoComposer?.(files, 'paste');
  });

  // Auto-expand textarea height as user types
  const userInput = this.elements.userInput;
  userInput?.addEventListener('input', () => {
    autoResizeTextArea(userInput, 280);
    this.handleWorkflowInput();
  });
  this.elements.systemPrompt?.addEventListener('input', () => {
    autoResizeTextArea(this.elements.systemPrompt, 500, 500);
  });
  this.elements.profileEditorPrompt?.addEventListener('input', () => {
    autoResizeTextArea(this.elements.profileEditorPrompt, 500);
  });
  autoResizeTextArea(userInput, 280);
  autoResizeTextArea(this.elements.systemPrompt, 500, 500);
  autoResizeTextArea(this.elements.profileEditorPrompt, 500);

  // Model selector (now shows profiles)
  this.elements.modelSelect?.addEventListener('change', () => {
    void this.handleModelSelectChange();
  });
  this.elements.setupAccessBtn?.addEventListener('click', () => {
    void this.handleSetupAccessClick?.();
  });

  // File upload
  this.elements.fileBtn?.addEventListener('click', () => {
    this.elements.fileInput?.click();
  });
  this.elements.fileInput?.addEventListener('change', (event) => this.handleFileSelection(event));

  // Recording
  this.elements.recordBtn?.addEventListener('click', () => {
    if (this.recordingState.status === 'idle') {
      this.startRecording();
    } else if (this.recordingState.status === 'recording') {
      this.stopRecording();
    }
  });
  this.elements.recordedContextRemove?.addEventListener('click', () => {
    this.removeRecordedContext();
  });

  // Zoom controls
  this.elements.zoomInBtn?.addEventListener('click', () => this.adjustUiZoom(0.05));
  this.elements.zoomOutBtn?.addEventListener('click', () => this.adjustUiZoom(-0.05));
  this.elements.zoomResetBtn?.addEventListener('click', () => this.applyUiZoom(1));
  this.elements.uiZoom?.addEventListener('input', () => {
    const value = Number.parseFloat(this.elements.uiZoom.value || '1');
    this.applyUiZoom(value);
  });
  this.elements.fontPreset?.addEventListener('change', () => {
    this.applyTypography(this.elements.fontPreset?.value || 'default', this.fontStylePreset || 'normal');
  });
  this.elements.fontStylePreset?.addEventListener('change', () => {
    this.applyTypography(this.fontPreset || 'default', this.elements.fontStylePreset?.value || 'normal');
  });

  // Tab selector
  this.elements.tabSelectorBtn?.addEventListener('click', () => this.toggleTabSelector());
  this.elements.closeTabSelector?.addEventListener('click', () => this.closeTabSelector());
  this.elements.tabSelectorAddActive?.addEventListener('click', () => this.addActiveTabToSelection());
  this.elements.tabSelectorClear?.addEventListener('click', () => this.clearSelectedTabs());
  const tabBackdrop = this.elements.tabSelector?.querySelector('.modal-backdrop');
  tabBackdrop?.addEventListener('click', () => this.closeTabSelector());

  // Export button
  this.elements.exportBtn?.addEventListener('click', () => this.showExportMenu());

  this.elements.chatMessages?.addEventListener('scroll', () => this.handleChatScroll());

  // Delegated click: copy button inside code blocks
  this.elements.chatMessages?.addEventListener('click', (e: Event) => {
    const btn = (e.target as HTMLElement).closest('.code-copy-btn') as HTMLButtonElement | null;
    if (!btn) return;
    const wrap = btn.closest('.code-block-wrap');
    const code = wrap?.querySelector('code');
    if (!code) return;
    navigator.clipboard.writeText(code.textContent || '').then(() => {
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 2000);
    });
  });
  this.elements.scrollToLatestBtn?.addEventListener('click', () => this.scrollToBottom({ force: true }));

  // Stop/reset is now handled by the send button above

  // Profile editor controls
  this.elements.profileEditorProvider?.addEventListener('change', () => {
    this.toggleProfileEditorEndpoint();
    this.refreshModelCatalogForProfileEditor?.();
  });

  // Sync model text input to hidden select
  this.elements.profileEditorModelInput?.addEventListener('input', () => {
    const val = (this.elements.profileEditorModelInput?.value || '').trim();
    const select = this.elements.profileEditorModel as HTMLSelectElement | null;
    if (select) {
      if (val && !Array.from(select.options).some((o: HTMLOptionElement) => o.value === val)) {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        select.insertBefore(opt, select.options[1] || null);
      }
      select.value = val;
    }
  });

  // Also refetch models when endpoint or API key changes (debounced)
  const debouncedModelRefresh = debounce(() => this.refreshModelCatalogForProfileEditor?.(), 800);
  this.elements.profileEditorEndpoint?.addEventListener('input', debouncedModelRefresh);
  this.elements.profileEditorApiKey?.addEventListener('input', debouncedModelRefresh);

  this.elements.profileEditorHeaders?.addEventListener('input', () => this.validateProfileEditorHeaders());
  this.elements.profileEditorTemperature?.addEventListener('input', () => {
    if (this.elements.profileEditorTemperatureValue) {
      this.elements.profileEditorTemperatureValue.textContent = this.elements.profileEditorTemperature.value;
    }
  });
  this.elements.saveProfileBtn?.addEventListener('click', () => this.saveProfileEdits());
  this.elements.profileEditorCancelBtn?.addEventListener('click', () =>
    this.editProfile(this.profileEditorTarget || this.currentConfig, true),
  );
  this.elements.refreshProfileJsonBtn?.addEventListener('click', () => this.refreshProfileJsonEditor());
  this.elements.copyProfileJsonBtn?.addEventListener('click', () => this.copyProfileJsonEditor());
  this.elements.applyProfileJsonBtn?.addEventListener('click', () => this.applyProfileJsonEditor());

  // Provider headers validation
  this.elements.customHeaders?.addEventListener('input', () => this.validateCustomHeaders());

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((message) => {
    if (isRuntimeMessage(message)) {
      this.handleRuntimeMessage(message);
      return;
    }
    // Recording messages (not runtime messages — they have their own schema)
    const recordingTypes = ['recording_tick', 'recording_complete', 'recording_context_ready', 'recording_error'];
    if (message?.type && recordingTypes.includes(message.type)) {
      this.handleRecordingMessage?.(message);
    }
  });

  // Keep relay connection status fresh while Settings is open.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (!changes.relayConnected && !changes.relayLastError) return;
    const next: Record<string, any> = {};
    if (changes.relayConnected) next.relayConnected = changes.relayConnected.newValue;
    if (changes.relayLastError) next.relayLastError = changes.relayLastError.newValue;
    this.updateRelayStatusFromSettings?.(next);
  });
};

sidePanelProto.setupResizeObserver = function setupResizeObserver() {
  if (!this.elements.chatMessages || typeof ResizeObserver === 'undefined') return;
  this.chatResizeObserver = new ResizeObserver(() => {
    if (this.shouldAutoScroll() && this.isNearBottom) {
      this.scrollToBottom();
    }
  });
  this.chatResizeObserver.observe(this.elements.chatMessages);
};

sidePanelProto.flushQueuedMessage = function flushQueuedMessage() {
  if (!this.queuedMessage) return;
  const msg = this.queuedMessage;
  this.queuedMessage = null;
  // Stuff the queued text into the input and send
  this.elements.userInput.value = msg;
  this.sendMessage();
};

sidePanelProto.startWatchdog = function startWatchdog() {
  this.stopWatchdog();
  this._lastRuntimeMessageAt = Date.now();
  this._watchdogTimerId = setInterval(() => {
    const isRunning = this.elements.composer?.classList.contains('running');
    if (!isRunning) {
      this.stopWatchdog();
      return;
    }
    const silence = Date.now() - this._lastRuntimeMessageAt;
    if (silence > 90_000) {
      this.recoverFromStuckState();
    }
  }, 15_000);
};

sidePanelProto.stopWatchdog = function stopWatchdog() {
  if (this._watchdogTimerId != null) {
    clearInterval(this._watchdogTimerId);
    this._watchdogTimerId = null;
  }
};

sidePanelProto.insertStoppedDivider = function insertStoppedDivider() {
  const el = document.createElement('div');
  el.className = 'stopped-divider';
  el.innerHTML = '<span>Stopped</span>';
  this.elements.chatMessages?.appendChild(el);
  this.scrollToBottom();
};

sidePanelProto.recoverFromStuckState = function recoverFromStuckState() {
  this.stopWatchdog();
  this.stopThinkingTimer?.();
  this.stopRunTimer?.();
  this.elements.composer?.classList.remove('running');
  this.pendingTurnDraft = null;
  this.pendingRecordedContext = null;
  this.hideRecordedContextBadge?.();
  this.pendingToolCount = 0;
  this.isStreaming = false;
  this.activeToolName = null;
  this.queuedMessage = null;
  this.updateActivityState();
  this.finishStreamingMessage();
  this.showErrorBanner('Connection lost — the background service may have restarted. You can send a new message.', {
    category: 'timeout',
    action: 'Try sending your message again.',
  });
  this.updateStatus('Disconnected', 'error');
};

sidePanelProto.handleRuntimeMessage = function handleRuntimeMessage(message: any) {
  this._lastRuntimeMessageAt = Date.now();
  // Runtime messages are broadcast to all extension views. Only render events
  // that belong to the currently active session to avoid spilling output across
  // New Chat / history-loaded sessions.
  if (message?.sessionId && typeof message.sessionId === 'string' && message.sessionId !== this.sessionId) {
    return;
  }
  if (message.type === 'assistant_stream_start') {
    this.streamingReasoning = '';
    this.handleAssistantStream({ status: 'start' });
    return;
  }
  if (message.type === 'assistant_stream_delta') {
    if (message.channel === 'reasoning') {
      const delta = message.content || '';
      this.streamingReasoning = `${this.streamingReasoning}${delta}`;
      // Track thinking text for later use but don't render a second inline block;
      // updateStreamReasoning already renders the .stream-event-reasoning block.
      this.latestThinking = this.streamingReasoning;
      // When streaming is disabled, the background still emits reasoning deltas,
      // but we won't get assistant_stream_start. Create a container so reasoning
      // and tool events can render inline in chat.
      if (!this.streamingState) {
        this.startStreamingMessage();
      }
      this.updateStreamReasoning(delta);
      return;
    }
    this.handleAssistantStream({ status: 'delta', content: message.content });
    return;
  }
  if (message.type === 'assistant_stream_stop') {
    this.handleAssistantStream({ status: 'stop' });
    return;
  }

  if (message.type === 'run_status') {
    const phase = typeof message.phase === 'string' ? message.phase : '';
    const isCompactionStage = String((message as any).stage || '') === 'compaction';

    if (isCompactionStage) {
      if (phase === 'planning' || phase === 'executing' || phase === 'finalizing') {
        this.setContextCompactionState?.({
          inProgress: true,
          lastResult: null,
          lastMessage: message.note || null,
        });
      } else if (phase === 'completed') {
        this.setContextCompactionState?.({
          inProgress: false,
          lastMessage: message.note || null,
          lastCompletedAt: Date.now(),
        });
      } else if (phase === 'failed' || phase === 'stopped') {
        this.setContextCompactionState?.({
          inProgress: false,
          lastResult: phase === 'stopped' ? 'skipped' : 'error',
          lastMessage: message.note || null,
          lastCompletedAt: Date.now(),
        });
      }
    }

    if (phase === 'stopped' || phase === 'failed' || phase === 'completed') {
      this.stopWatchdog?.();
      this.stopThinkingTimer?.();
      this.stopRunTimer?.();
      this.elements.composer?.classList.remove('running');
      this.pendingTurnDraft = null;
      this.pendingRecordedContext = null;
      this.hideRecordedContextBadge?.();
      this.pendingToolCount = 0;
      this.isStreaming = false;
      this.activeToolName = null;
      this.updateActivityState();
      this.finishStreamingMessage();
    }

    if (phase === 'stopped') {
      this.updateStatus(message.note || 'Stopped', 'warning');
      this.flushQueuedMessage?.();
    } else if (phase === 'failed') {
      this.updateStatus(message.note || 'Failed', 'error');
      this.flushQueuedMessage?.();
    } else if (phase === 'completed') {
      this.updateStatus(message.note || 'Ready', 'success');
      // Note: flushQueuedMessage is called from displayAssistantMessage for completed runs
    } else if (phase === 'planning' || phase === 'executing' || phase === 'finalizing') {
      // Surface non-terminal phases with retry counts
      const phaseLabel = phase.charAt(0).toUpperCase() + phase.slice(1);
      const retryInfo =
        message.attempts && message.maxRetries
          ? (() => {
              const parts: string[] = [];
              if (message.attempts.api > 0) parts.push(`api ${message.attempts.api}/${message.maxRetries.api}`);
              if (message.attempts.tool > 0) parts.push(`tool ${message.attempts.tool}/${message.maxRetries.tool}`);
              return parts.length ? ` (retries: ${parts.join(', ')})` : '';
            })()
          : '';
      this.updateStatus(message.note || `${phaseLabel}${retryInfo}`, 'active');
    } else if (phase) {
      this.updateStatus(message.note || phase, 'active');
    }
    return;
  }

  if (message.type === 'plan_update') {
    this.applyPlanUpdate(message.plan);

    if (!this.isReplayingHistory && this.pendingTurnDraft?.userMessage) {
      const now = Date.now();
      const turnId = (message as any).turnId || `turn-${now}`;
      const existing = this.historyTurnMap.get(turnId);
      const entry =
        existing ||
        ({
          id: turnId,
          startedAt: this.pendingTurnDraft.startedAt,
          userMessage: this.pendingTurnDraft.userMessage,
          plan: null,
          toolEvents: [],
        } as any);
      entry.plan = message.plan;
      this.historyTurnMap.set(turnId, entry);

      // Persist plan trace to IndexedDB
      appendTrace({
        sessionId: this.sessionId,
        ts: Date.now(),
        kind: 'plan_update',
        plan: message.plan,
      });
    }

    return;
  }

  if (message.type === 'manual_plan_update') {
    this.applyManualPlanUpdate(message.steps);
    return;
  }

  if (message.type === 'tool_execution_start') {
    this.pendingToolCount += 1;
    this.clearErrorBanner();
    this.updateActivityState();
    this.activeToolName = message.tool || null;
    // Track which tab the model is interacting with.
    // Many browser tools resolve tabId internally via resolveTabId() so args.tabId
    // may be missing. Fall back to the session's active tab for known browser tools.
    const browserTools = [
      'navigate',
      'openTab',
      'click',
      'type',
      'pressKey',
      'scroll',
      'getContent',
      'screenshot',
      'switchTab',
      'focusTab',
      'closeTab',
      'watchVideo',
      'getVideoInfo',
    ];
    let toolTabId = typeof message.args?.tabId === 'number' ? message.args.tabId : null;
    if (!toolTabId && browserTools.includes(message.tool)) {
      toolTabId = this.sessionTabsState?.activeTabId ?? null;
    }
    this.setInteractingTab(toolTabId);
    if (!this.streamingState) {
      this.startStreamingMessage();
    }

    if (typeof (message as any).stepIndex === 'number') {
      this.ensureStepContainer((message as any).stepIndex, (message as any).stepTitle);
    }

    if (!this.isReplayingHistory && this.pendingTurnDraft?.userMessage) {
      const now = Date.now();
      const turnId = (message as any).turnId || `turn-${now}`;
      const existing = this.historyTurnMap.get(turnId);
      const entry =
        existing ||
        ({
          id: turnId,
          startedAt: this.pendingTurnDraft.startedAt,
          userMessage: this.pendingTurnDraft.userMessage,
          plan: this.currentPlan || null,
          toolEvents: [],
        } as any);
      entry.toolEvents.push({
        type: 'tool_execution_start',
        tool: message.tool,
        id: (message as any).id,
        args: sanitizeTracePayload((message as any).args),
        stepIndex: (message as any).stepIndex,
        stepTitle: (message as any).stepTitle,
        timestamp: (message as any).timestamp,
      });
      capTurnToolEvents(entry);
      this.historyTurnMap.set(turnId, entry);
      clampHistoryTurnMap(this);

      // Persist full trace to IndexedDB
      appendTrace({
        sessionId: this.sessionId,
        ts: Date.now(),
        kind: 'tool_start',
        tool: message.tool,
        toolId: (message as any).id,
        args: sanitizeTracePayload((message as any).args),
        stepIndex: (message as any).stepIndex,
        stepTitle: (message as any).stepTitle,
      });
    }

    this.displayToolExecution(message.tool, message.args, null, message.id);
    return;
  }
  if (message.type === 'tool_execution_result') {
    this.pendingToolCount = Math.max(0, this.pendingToolCount - 1);
    this.updateActivityState();
    this.activeToolName = null;
    if (this.pendingToolCount === 0) {
      this.setInteractingTab(null);
    }
    if (!this.streamingState) {
      this.startStreamingMessage();
    }

    if (typeof (message as any).stepIndex === 'number') {
      this.ensureStepContainer((message as any).stepIndex, (message as any).stepTitle);
    }

    if (!this.isReplayingHistory && this.pendingTurnDraft?.userMessage) {
      const now = Date.now();
      const turnId = (message as any).turnId || `turn-${now}`;
      const existing = this.historyTurnMap.get(turnId);
      const entry =
        existing ||
        ({
          id: turnId,
          startedAt: this.pendingTurnDraft.startedAt,
          userMessage: this.pendingTurnDraft.userMessage,
          plan: this.currentPlan || null,
          toolEvents: [],
        } as any);
      entry.toolEvents.push({
        type: 'tool_execution_result',
        tool: message.tool,
        id: (message as any).id,
        args: sanitizeTracePayload((message as any).args),
        result: sanitizeTracePayload((message as any).result),
        stepIndex: (message as any).stepIndex,
        stepTitle: (message as any).stepTitle,
        timestamp: (message as any).timestamp,
      });
      capTurnToolEvents(entry);
      this.historyTurnMap.set(turnId, entry);
      clampHistoryTurnMap(this);

      // Persist full trace to IndexedDB
      appendTrace({
        sessionId: this.sessionId,
        ts: Date.now(),
        kind: 'tool_result',
        tool: message.tool,
        toolId: (message as any).id,
        args: sanitizeTracePayload((message as any).args),
        result: sanitizeTracePayload((message as any).result),
        stepIndex: (message as any).stepIndex,
        stepTitle: (message as any).stepTitle,
      });
    }

    this.displayToolExecution(message.tool, message.args, message.result, message.id);
    return;
  }

  if (message.type === 'assistant_final') {
    if (!this.isReplayingHistory && this.pendingTurnDraft?.userMessage) {
      const now = Date.now();
      const turnId = (message as any).turnId || `turn-${now}`;
      const existing = this.historyTurnMap.get(turnId);
      const entry =
        existing ||
        ({
          id: turnId,
          startedAt: this.pendingTurnDraft.startedAt,
          userMessage: this.pendingTurnDraft.userMessage,
          plan: this.currentPlan || null,
          toolEvents: [],
        } as any);
      entry.assistantFinal = {
        content: message.content,
        thinking: message.thinking || null,
        model: message.model || null,
        usage: (message as any).usage || null,
      };
      this.historyTurnMap.set(turnId, entry);
      clampHistoryTurnMap(this);

      // Persist full trace to IndexedDB
      appendTrace({
        sessionId: this.sessionId,
        ts: Date.now(),
        kind: 'assistant_final',
        content: message.content,
        thinking: message.thinking || null,
        model: message.model || null,
        usage: (message as any).usage || null,
      });
    }

    this.displayAssistantMessage(message.content, message.thinking, message.usage, message.model);
    this.appendContextMessages(message.responseMessages, message.content, message.thinking);

    // Record usage to persistent local store
    if (message.usage && (message.usage.inputTokens || message.usage.outputTokens)) {
      const activeConfig = this.configs?.[this.currentConfig] || {};
      const usageModel = message.model || activeConfig.model || 'unknown';
      const usageProvider = activeConfig.provider || 'unknown';
      recordUsage(usageModel, usageProvider, {
        inputTokens: message.usage.inputTokens || 0,
        outputTokens: message.usage.outputTokens || 0,
      }).catch((err) => console.warn('[Parchi] recordUsage failed:', err));
    }

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

    void this.clearParchiRuntimeHealth?.();

    return;
  }

  if (message.type === 'context_compacted') {
    this.handleContextCompaction(message);
    return;
  }

  if (message.type === 'run_error') {
    this.stopWatchdog?.();
    this.stopThinkingTimer?.();
    this.stopRunTimer?.();
    this.elements.composer?.classList.remove('running');
    this.pendingTurnDraft = null;
    this.pendingToolCount = 0;
    this.isStreaming = false;
    this.activeToolName = null;
    this.updateActivityState();
    this.finishStreamingMessage();
    this.showErrorBanner(message.message, {
      category: (message as any).errorCategory,
      action: (message as any).action,
      recoverable: (message as any).recoverable,
    });
    if (String((message as any).stage || '') === 'compaction') {
      this.setContextCompactionState?.({
        inProgress: false,
        lastResult: 'error',
        lastMessage: message.message || 'Compaction failed',
        lastCompletedAt: Date.now(),
      });
    }
    void this.setParchiRuntimeHealth?.({
      level: 'error',
      summary: String(message.message || 'Paid runtime failed.'),
      detail: String((message as any).action || ''),
      category: String((message as any).errorCategory || ''),
    });
    this.updateStatus('Error', 'error');
    this.flushQueuedMessage?.();
    return;
  }
  if (message.type === 'run_warning') {
    const isCompactionWarning = String((message as any).stage || '') === 'compaction';
    if (!isCompactionWarning) {
      this.showErrorBanner(message.message);
    }
    if (isCompactionWarning) {
      this.setContextCompactionState?.({
        inProgress: false,
        lastResult: 'skipped',
        lastMessage: message.message || 'No compaction applied',
        lastCompletedAt: Date.now(),
      });
      this.updateStatus(message.message || 'Compaction skipped', 'warning');
    }
    const warningText = String(message.message || '');
    if (warningText) {
      const lower = warningText.toLowerCase();
      if (lower.includes('model') || lower.includes('retrying') || lower.includes('unavailable')) {
        void this.setParchiRuntimeHealth?.({
          level: 'warning',
          summary: warningText,
        });
      }
    }
    return;
  }
  if (message.type === 'session_tabs_update') {
    this.handleSessionTabsUpdate(message);
    return;
  }
  if (message.type === 'report_image_captured') {
    this.recordReportImage?.(message.image);
    this.updateReportImageSelection?.(message.selectedImageIds || []);
    return;
  }
  if (message.type === 'report_images_selection') {
    this.updateReportImageSelection?.(message.selectedImageIds || []);
    return;
  }
  if (message.type === 'subagent_start') {
    this.addSubagent(message.id, message.name, message.tasks);
    this.updateStatus(`Sub-agent "${message.name}" started`, 'active');
    return;
  }
  if (message.type === 'subagent_complete') {
    const status = message.success ? 'completed' : 'error';
    this.updateSubagentStatus(message.id, status, message.summary);
    if (message.success) {
      this.updateStatus(`Sub-agent "${message.name || message.id}" completed`, 'success');
    } else {
      this.updateStatus(`Sub-agent "${message.name || message.id}" failed`, 'error');
    }
    return;
  }
};

sidePanelProto.appendContextMessages = function appendContextMessages(
  responseMessages?: Array<Record<string, unknown>>,
  fallbackContent?: string,
  fallbackThinking?: string | null,
) {
  if (!responseMessages || responseMessages.length === 0) {
    const assistantEntry = createMessage({
      role: 'assistant',
      content: fallbackContent || '',
      thinking: fallbackThinking || null,
    });
    if (assistantEntry) {
      this.contextHistory.push(assistantEntry);
    }
    return;
  }
  const normalized = normalizeConversationHistory(responseMessages as unknown as Message[]);
  this.contextHistory.push(...normalized);

  // Soft cap — prevent unbounded growth if compaction is delayed
  const CONTEXT_HISTORY_SOFT_CAP = 600;
  if (this.contextHistory.length > CONTEXT_HISTORY_SOFT_CAP) {
    this.contextHistory.splice(0, this.contextHistory.length - CONTEXT_HISTORY_SOFT_CAP);
  }
};

sidePanelProto.handleContextCompaction = function handleContextCompaction(message: any) {
  const trimmedCount = Number(message.trimmedCount || 0);
  const preservedCount = Number(message.preservedCount || 0);
  const source = String(message.source || 'auto');
  const percent =
    typeof message.contextUsage?.percent === 'number'
      ? Math.max(0, Math.min(100, Math.round(message.contextUsage.percent)))
      : null;
  const beforePercent =
    typeof message.beforeContextUsage?.percent === 'number'
      ? Math.max(0, Math.min(100, Math.round(message.beforeContextUsage.percent)))
      : null;
  const parts = [
    trimmedCount > 0 ? `${trimmedCount} summarized` : 'Context compacted',
    preservedCount > 0 ? `${preservedCount} preserved` : null,
    beforePercent !== null && percent !== null ? `${beforePercent}% → ${percent}%` : null,
    beforePercent === null && percent !== null ? `${percent}% after compaction` : null,
  ].filter(Boolean);
  if (parts.length > 0) {
    this.updateStatus(`Context compacted: ${parts.join(', ')}`, 'success');
  }

  const normalized = normalizeConversationHistory(message.contextMessages as unknown as Message[]);
  this.contextHistory = normalized;
  this.sessionId = message.newSessionId || this.sessionId;
  if (message.startFreshSession === true) {
    this.displayHistory = [];
    this.elements.chatMessages.innerHTML = '';
    this.lastChatTurn = null;
    this.pendingTurnDraft = null;
    this.historyTurnMap.clear();
    this.currentPlan = null;
    this.hidePlanDrawer?.();
    this.toolCallViews.clear();
  }

  const summaryText = message.summary || 'Context compacted.';
  const summaryEntry = createMessage({
    role: 'system',
    content: summaryText,
    meta: {
      kind: 'summary',
      summaryOfCount: message.trimmedCount,
      source: 'auto',
    },
  });
  if (summaryEntry) {
    this.displayHistory.push(summaryEntry);
    this.displaySummaryMessage(summaryEntry);
  }

  if (typeof message.contextUsage?.approxTokens === 'number') {
    this.updateContextUsage(message.contextUsage.approxTokens);
  }

  this.setContextCompactionState?.({
    inProgress: false,
    lastResult: 'success',
    lastMessage: parts.join(', '),
    lastTrimmedCount: trimmedCount,
    lastPreservedCount: preservedCount,
    lastSource: source,
    lastCompactedAt: Date.now(),
    lastCompletedAt: Date.now(),
    lastBeforePercent: beforePercent,
    lastAfterPercent: percent,
  });

  // Trigger compaction sweep animation on the context bar
  const bar = document.getElementById('contextBar');
  if (bar) {
    bar.classList.remove('compacting');
    // Force reflow so re-adding the class restarts the animation
    void bar.offsetWidth;
    bar.classList.add('compacting');
    bar.addEventListener('animationend', () => bar.classList.remove('compacting'), { once: true });
  }

  // Auto-continue: if compaction was triggered automatically at end of turn,
  // send a continuation prompt so the model resumes with the compacted context.
  if (source === 'auto' && !this.elements.composer?.classList.contains('running')) {
    setTimeout(() => {
      this.elements.userInput.value = 'Continue where you left off. The context was compacted — use the summary above as your source of truth.';
      this.sendMessage();
    }, 400);
  }
};
