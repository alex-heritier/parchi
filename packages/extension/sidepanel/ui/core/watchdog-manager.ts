/**
 * Watchdog Manager Module
 * Manages watchdog timer for detecting stuck states
 */

import { SidePanelUI } from './panel-ui.js';

const sidePanelProto = (SidePanelUI as any).prototype as SidePanelUI & Record<string, unknown>;

// Maximum silence (no runtime updates from background) before the UI shows the
// "model may be stuck" banner. Lowered to 60s so users get a visible signal
// quickly when remote providers (e.g., reasoning models that buffer text
// after reasoning_content ends) stall. The banner is soft — it just says the
// model may still be working, not that it has failed — so a shorter window
// is fine.
const WATCHDOG_SILENCE_LIMIT_MS = 60_000;
const WATCHDOG_SILENCE_LIMIT_SEC = Math.round(WATCHDOG_SILENCE_LIMIT_MS / 1000);

/**
 * Start the watchdog timer to detect stuck states
 */
export const startWatchdog = function startWatchdog(this: SidePanelUI & Record<string, unknown>) {
  this.stopWatchdog();
  this._lastRuntimeMessageAt = Date.now();
  this._watchdogTimerId = setInterval(() => {
    const isRunning = this.elements.composer?.classList.contains('running');
    if (!isRunning) {
      this.stopWatchdog();
      return;
    }
    const silence = Date.now() - (this._lastRuntimeMessageAt || 0);
    if (silence > WATCHDOG_SILENCE_LIMIT_MS) {
      this.recoverFromStuckState();
    }
  }, 15_000);
};

sidePanelProto.startWatchdog = startWatchdog;

/**
 * Stop the watchdog timer
 */
export const stopWatchdog = function stopWatchdog(this: SidePanelUI & Record<string, unknown>) {
  if (this._watchdogTimerId != null) {
    clearInterval(this._watchdogTimerId as unknown as number);
    this._watchdogTimerId = null;
  }
};

sidePanelProto.stopWatchdog = stopWatchdog;

/**
 * Insert a stopped divider in the chat
 */
export const insertStoppedDivider = function insertStoppedDivider(this: SidePanelUI & Record<string, unknown>) {
  const el = document.createElement('div');
  el.className = 'stopped-divider';
  el.innerHTML = '<span>Stopped</span>';
  this.elements.chatMessages?.appendChild(el);
  this.scrollToBottom();
};

sidePanelProto.insertStoppedDivider = insertStoppedDivider;

/**
 * Recover from a stuck state when background is unresponsive
 */
export const recoverFromStuckState = function recoverFromStuckState(this: SidePanelUI & Record<string, unknown>) {
  if (!this.lifecyclePort) {
    this.connectLifecyclePort?.();
  }
  const backgroundReachable = Boolean(this.lifecyclePort);
  this._lastRuntimeMessageAt = Date.now();

  if (backgroundReachable) {
    this.showErrorBanner(`No runtime updates for ${WATCHDOG_SILENCE_LIMIT_SEC}s. The model may still be working.`, {
      category: 'timeout',
      action: 'Wait, or press Stop if the run is hung.',
    });
    if (!this.thinkingTimerId) {
      this.updateStatus('Waiting on model…', 'active');
    }
    return;
  }

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
  this.showErrorBanner('Run interrupted — the background service is unavailable. You can send the message again.', {
    category: 'timeout',
    action: 'Try sending your message again.',
  });
  this.updateStatus('Interrupted', 'warning');
};

sidePanelProto.recoverFromStuckState = recoverFromStuckState;
