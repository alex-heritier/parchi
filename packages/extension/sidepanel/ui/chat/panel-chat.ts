import { createMessage } from '../../../ai/message-schema.js';
import type { Message } from '../../../ai/message-schema.js';
import { dedupeThinking, extractThinking } from '../../../ai/message-utils.js';
import { getActiveTab } from '../../../utils/active-tab.js';
import { clampContextHistory } from '../core/panel-session-memory.js';
import { SidePanelUI } from '../core/panel-ui.js';
import type { UsagePayload } from '../types/panel-types.js';

const sidePanelProto = SidePanelUI.prototype as SidePanelUI & Record<string, unknown>;
import { appendTrace } from './trace-store.js';

const formatTraceNumber = (value: unknown) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return '—';
  const rounded = Math.round(num);
  return rounded >= 1000 ? rounded.toLocaleString() : String(rounded);
};

const formatTraceSignedDelta = (value: unknown) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  const rounded = Math.round(num);
  if (rounded === 0) return '0';
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString()}`;
};

const formatTracePercent = (value: unknown) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return '—';
  return `${Math.round(num)}%`;
};

const MAX_DISPLAY_HISTORY = 400;

const truncate = (value: string, max = 12000) => {
  const text = String(value || '');
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
};

// Chrome runtime messaging can fail on large payloads or non-cloneable values.
// Keep history compact and remove heavy fields (e.g. screenshots/dataUrls) before sending to background.
const sanitizeForMessaging = (value: unknown, depth = 0): unknown => {
  if (value == null) return value;
  if (typeof value === 'string') {
    const s = value;
    if (s.startsWith('data:image/') || s.startsWith('data:application/octet-stream')) {
      return '[omitted dataUrl]';
    }
    return truncate(s, 12000);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'function') return undefined;
  if (depth > 6) return '[truncated]';

  if (Array.isArray(value)) {
    const looksLikeMessageHistory = value.every(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        !Array.isArray(entry) &&
        ('role' in (entry as any) || 'content' in (entry as any)),
    );
    if (looksLikeMessageHistory) {
      const historyLimit = 240;
      const start = Math.max(0, value.length - historyLimit);
      const out: unknown[] = [];
      for (let i = start; i < value.length; i += 1) {
        out.push(sanitizeForMessaging(value[i], depth + 1));
      }
      return out;
    }

    const out: unknown[] = [];
    const limit = Math.min(value.length, 80);
    for (let i = 0; i < limit; i += 1) {
      out.push(sanitizeForMessaging(value[i], depth + 1));
    }
    if (value.length > limit) out.push(`[+${value.length - limit} items truncated]`);
    return out;
  }

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: truncate(value.stack || '', 2000) };
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === 'dataUrl') {
        out[k] = '[omitted dataUrl]';
        continue;
      }
      out[k] = sanitizeForMessaging(v, depth + 1);
    }
    return out;
  }

  return String(value);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isMissingReceiverError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Receiving end does not exist|Could not establish connection/i.test(message);
};

const sendRuntimeMessageWithRetry = async (payload: Record<string, unknown>, retries = 1) => {
  let attempt = 0;
  while (true) {
    try {
      return await chrome.runtime.sendMessage(payload);
    } catch (error) {
      if (attempt >= retries || !isMissingReceiverError(error)) {
        throw error;
      }
      attempt += 1;
      await sleep(250);
    }
  }
};

sidePanelProto.getSendableContextHistory = function getSendableContextHistory() {
  return sanitizeForMessaging(this.contextHistory || []);
};

sidePanelProto.requestManualContextCompaction = async function requestManualContextCompaction() {
  if (this.elements.composer?.classList.contains('running')) {
    this.updateStatus('Finish the active run before compacting.', 'warning');
    return;
  }
  if (this.contextCompactionState?.inProgress) {
    return;
  }

  this.setContextCompactionState?.({
    inProgress: true,
    lastResult: null,
    lastRequestedAt: Date.now(),
    lastTrigger: 'manual',
    lastMessage: null,
  });
  this.updateStatus('Compacting context…', 'active');

  try {
    const response = await sendRuntimeMessageWithRetry({
      type: 'compact_context',
      sessionId: this.sessionId,
      conversationHistory: this.getSendableContextHistory?.(),
      trigger: 'manual',
    });
    if (!response?.accepted) {
      throw new Error(response?.error || 'Compaction request was not accepted');
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? 'Compaction request failed');
    this.setContextCompactionState?.({
      inProgress: false,
      lastResult: 'error',
      lastMessage: message,
      lastCompletedAt: Date.now(),
    });
    this.updateStatus(`Compaction failed: ${message}`, 'error');
  }
};

sidePanelProto.sendMessage = async function sendMessage() {
  if (this.activeAgent && this.activeAgent !== 'main') {
    this.updateStatus('Switch back to the orchestrator tab to send a new message.', 'warning');
    return;
  }
  const userMessage = this.elements.userInput.value.trim();
  if (!userMessage) return;

  this.pendingTurnDraft = { userMessage, startedAt: Date.now() };

  // Persist user message trace to IndexedDB
  appendTrace({
    sessionId: this.sessionId,
    ts: Date.now(),
    kind: 'user_message',
    content: userMessage,
  });

  this.elements.userInput.value = '';
  this.elements.userInput.style.height = '';
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
      if (activeTab && typeof activeTab.id === 'number') {
        const autoTab = this.buildSelectedTab(activeTab);
        selectedTabsPayload = [autoTab];
        tabsContext = this.getSelectedTabsContext(selectedTabsPayload, 'active');
      }
    } catch (error) {
      console.warn('Failed to capture active tab context:', error);
    }
  }

  const fullMessage = userMessage + tabsContext;
  const recordedContextForMessage = this.pendingRecordedContext
    ? {
        id: this.pendingRecordedContext.id,
        duration: this.pendingRecordedContext.duration,
        summary: this.pendingRecordedContext.summary,
        events: Array.isArray(this.pendingRecordedContext.events) ? this.pendingRecordedContext.events : [],
        selectedImages: Array.isArray(this.pendingRecordedContext.selectedImages)
          ? this.pendingRecordedContext.selectedImages.map((img: unknown) => {
              const entry = img as { index?: unknown; timestamp?: unknown; url?: unknown };
              return {
                index: Number(entry?.index ?? 0),
                timestamp: Number(entry?.timestamp ?? 0),
                url: String(entry?.url ?? ''),
              };
            })
          : [],
      }
    : null;
  const mediaAttachmentsForMessage = Array.isArray(this.pendingComposerAttachments)
    ? [...this.pendingComposerAttachments]
    : [];

  this.displayUserMessage(userMessage, recordedContextForMessage, mediaAttachmentsForMessage);

  const displayEntry = createMessage({ role: 'user', content: userMessage });
  if (displayEntry) {
    this.displayHistory.push(displayEntry);
    if (this.displayHistory.length > MAX_DISPLAY_HISTORY) {
      this.displayHistory.splice(0, this.displayHistory.length - MAX_DISPLAY_HISTORY);
    }
  }

  const contextEntry = createMessage({ role: 'user', content: fullMessage });
  if (contextEntry) {
    this.contextHistory.push(contextEntry);
    clampContextHistory(this.contextHistory);
  }
  this.updateContextUsage();

  this.updateStatus('Processing...', 'active');
  this.elements.composer?.classList.add('running');
  this.startRunTimer?.();
  this.startWatchdog?.();

  try {
    // Avoid sending huge tool payloads; also ensures errors are caught (promise-based APIs).
    const sendableHistory = this.getSendableContextHistory?.() || sanitizeForMessaging(this.contextHistory || []);
    const payload: Record<string, unknown> = {
      type: 'user_message',
      message: fullMessage,
      conversationHistory: sendableHistory,
      selectedTabs: selectedTabsPayload,
      sessionId: this.sessionId,
    };
    if (this.pendingRecordedContext) {
      payload.recordedContext = this.pendingRecordedContext;
      this.pendingRecordedContext = null;
      this.hideRecordedContextBadge?.();
    }
    if (mediaAttachmentsForMessage.length > 0) {
      payload.attachments = mediaAttachmentsForMessage;
      this.pendingComposerAttachments = [];
    }
    const response = await sendRuntimeMessageWithRetry(payload);
    if (response?.sessionId && typeof response.sessionId === 'string') {
      this.sessionId = response.sessionId;
    }
    // Note: persistHistory is called after the assistant response completes
    // in displayAssistantMessage to ensure complete conversation is saved
  } catch (error: unknown) {
    this.stopThinkingTimer?.();
    this.stopRunTimer?.();
    this.stopWatchdog?.();
    this.pendingTurnDraft = null;
    this.pendingRecordedContext = null;
    this.hideRecordedContextBadge?.();
    const message = error instanceof Error ? error.message : String(error ?? '');
    this.updateStatus('Error: ' + message, 'error');
    this.elements.composer?.classList.remove('running');
    this.displayAssistantMessage('Sorry, an error occurred: ' + message);
  }
};

sidePanelProto.displayUserMessage = function displayUserMessage(
  content: string,
  recordedContext: unknown = null,
  mediaAttachments: unknown[] = [],
) {
  const turn = document.createElement('div');
  turn.className = 'chat-turn';
  this.tagAgentView?.(turn, 'main');
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message user';
  const buildRecordingHtml = () => {
    if (!recordedContext) return '';
    const rc = recordedContext as any;
    const events = Array.isArray(rc.events)
      ? (rc.events as unknown[]).filter((event: unknown) => {
          const evt = event as { type?: unknown };
          return String(evt.type || '') !== 'dom_mutation';
        })
      : [];
    const selectedImages = Array.isArray(rc.selectedImages) ? rc.selectedImages : [];
    const durationMs = Math.max(0, Number(rc.duration || 0));
    const durationSec = Math.round(durationMs / 1000);
    const summary = String(rc.summary || '').trim();
    const firstEvent = events[0] as any;
    const firstImage = selectedImages[0] as any;
    const origin = String(firstEvent?.url || firstImage?.url || '').trim();
    const baseTs = Number(firstEvent?.timestamp || 0);
    const stepRows = events
      .map((event: unknown, index: number) => {
        const ev = event as any;
        const ts = Number(ev?.timestamp || 0);
        const deltaSec = baseTs > 0 && ts >= baseTs ? Math.round((ts - baseTs) / 1000) : null;
        const type = String(ev?.type || 'event');
        const line =
          type === 'click'
            ? `Click ${ev?.selector || ev?.tagName || 'element'}`
            : type === 'input'
              ? `Input ${ev?.selector || ev?.placeholder || ''}`.trim()
              : type === 'navigation'
                ? `Navigate to ${ev?.toUrl || ev?.url || ''}`.trim()
                : type === 'scroll'
                  ? `Scroll ${ev?.direction || ''}`.trim()
                  : `${type}`;
        const suffix = deltaSec === null ? '' : ` (+${deltaSec}s)`;
        return `<li>${this.escapeHtml(`${index + 1}. ${line}${suffix}`)}</li>`;
      })
      .join('');
    const sourceHtml = origin ? `<div class="user-recording-origin">${this.escapeHtml(origin)}</div>` : '';
    return `
      <details class="user-recording-block">
        <summary>Recording attached · ${events.length} steps · ${selectedImages.length} images · ${durationSec}s</summary>
        <div class="user-recording-content">
          ${summary ? `<div class="user-recording-summary">${this.escapeHtml(summary)}</div>` : ''}
          ${sourceHtml}
          <ol class="user-recording-steps">${stepRows || '<li>No interaction steps captured.</li>'}</ol>
        </div>
      </details>
    `;
  };
  const buildMediaHtml = () => {
    const attachments = Array.isArray(mediaAttachments) ? mediaAttachments : [];
    if (!attachments.length) return '';
    const rows = attachments
      .map((attachment: unknown) => {
        const a = attachment as any;
        const kind = String(a?.kind || 'file');
        const name = String(a?.name || `${kind}-attachment`);
        const mimeType = String(a?.mimeType || '');
        const size = Number(a?.size || 0);
        const kb = Math.max(1, Math.round(size / 1024));
        return `<li>${this.escapeHtml(`${kind.toUpperCase()}: ${name} (${mimeType || 'unknown'}, ${kb} KB)`)}</li>`;
      })
      .join('');
    return `
      <details class="user-attachments-block">
        <summary>Media attached · ${attachments.length}</summary>
        <ul class="user-attachments-list">${rows}</ul>
      </details>
    `;
  };
  messageDiv.innerHTML = `
      <div class="message-header">You</div>
      <div class="message-content">${this.escapeHtml(content)}</div>
      ${buildRecordingHtml()}
      ${buildMediaHtml()}
    `;
  turn.appendChild(messageDiv);
  this.elements.chatMessages.appendChild(turn);
  this.lastChatTurn = turn;
  this.scrollToBottom({ force: true });
  this.updateChatEmptyState();
};

sidePanelProto.displaySummaryMessage = function displaySummaryMessage(messageOrEntry: Message | string) {
  const content = typeof messageOrEntry === 'string' ? messageOrEntry : String(messageOrEntry.content || '');
  const meta = typeof messageOrEntry === 'object' && messageOrEntry !== null ? messageOrEntry.meta : null;
  const trimmedCount = typeof meta?.summaryOfCount === 'number' ? meta.summaryOfCount : 0;

  const container = document.createElement('div');
  container.className = 'message compaction-message';
  this.tagAgentView?.(container, 'main');

  const countLabel = trimmedCount > 0 ? `${trimmedCount} messages summarized` : '';

  container.innerHTML = `
    <div class="compaction-card">
      <div class="compaction-header">
        <div class="compaction-badge">
          <svg class="compaction-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
            <path d="M9 12h6"/>
          </svg>
          <span>Context compacted</span>
        </div>
        ${countLabel ? `<span class="compaction-count">${this.escapeHtml(countLabel)}</span>` : ''}
        <button class="compaction-toggle" type="button" aria-expanded="false" title="Show summary">
          <svg class="toggle-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 15 12 9 18 15"></polyline>
          </svg>
        </button>
      </div>
      <div class="compaction-body collapsed">
        <div class="compaction-detail">${this.renderMarkdown(content)}</div>
      </div>
    </div>
  `;

  const toggleBtn = container.querySelector('.compaction-toggle');
  const body = container.querySelector('.compaction-body');
  if (toggleBtn && body) {
    toggleBtn.addEventListener('click', () => {
      const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', String(!isExpanded));
      body.classList.toggle('collapsed', isExpanded);
    });
  }

  this.elements.chatMessages.appendChild(container);
  this.scrollToBottom();
  this.updateChatEmptyState();
};

sidePanelProto.displayTokenTraceMessage = function displayTokenTraceMessage(trace: {
  action?: unknown;
  reason?: unknown;
  note?: unknown;
  before?: unknown;
  after?: unknown;
  details?: unknown;
}) {
  const action = String(trace?.action || 'token_trace');
  const reason = String(trace?.reason || 'unknown');
  const note = String(trace?.note || '').trim();
  const before =
    (trace?.before && typeof trace.before === 'object' ? (trace.before as Record<string, unknown>) : {}) || {};
  const after = (trace?.after && typeof trace.after === 'object' ? (trace.after as Record<string, unknown>) : {}) || {};

  const beforeInput = Number(before.providerInputTokens ?? Number.NaN);
  const afterInput = Number(after.providerInputTokens ?? Number.NaN);
  const deltaInput =
    Number.isFinite(beforeInput) && Number.isFinite(afterInput) ? afterInput - beforeInput : Number.NaN;

  const beforeApprox = Number(before.contextApproxTokens ?? Number.NaN);
  const afterApprox = Number(after.contextApproxTokens ?? Number.NaN);
  const deltaApprox =
    Number.isFinite(beforeApprox) && Number.isFinite(afterApprox) ? afterApprox - beforeApprox : Number.NaN;

  const beforeSession = Number(before.sessionTotalTokens ?? Number.NaN);
  const afterSession = Number(after.sessionTotalTokens ?? Number.NaN);
  const deltaSession =
    Number.isFinite(beforeSession) && Number.isFinite(afterSession) ? afterSession - beforeSession : Number.NaN;

  const container = document.createElement('div');
  container.className = 'message token-trace-message';
  this.tagAgentView?.(container, 'main');
  container.innerHTML = `
    <div class="token-trace-card">
      <div class="token-trace-header">
        <span class="token-trace-title">Token trace</span>
        <span class="token-trace-badge">${this.escapeHtml(action)}</span>
        <span class="token-trace-reason">${this.escapeHtml(reason)}</span>
      </div>
      <div class="token-trace-grid">
        <div class="token-trace-row">
          <span class="token-trace-key">Provider input</span>
          <span class="token-trace-value">${formatTraceNumber(before.providerInputTokens)} → ${formatTraceNumber(after.providerInputTokens)} <strong>${formatTraceSignedDelta(deltaInput)}</strong></span>
        </div>
        <div class="token-trace-row">
          <span class="token-trace-key">Context approx</span>
          <span class="token-trace-value">${formatTraceNumber(before.contextApproxTokens)} (${formatTracePercent(before.contextPercent)}) → ${formatTraceNumber(after.contextApproxTokens)} (${formatTracePercent(after.contextPercent)}) <strong>${formatTraceSignedDelta(deltaApprox)}</strong></span>
        </div>
        <div class="token-trace-row">
          <span class="token-trace-key">Session total</span>
          <span class="token-trace-value">${formatTraceNumber(before.sessionTotalTokens)} → ${formatTraceNumber(after.sessionTotalTokens)} <strong>${formatTraceSignedDelta(deltaSession)}</strong></span>
        </div>
      </div>
      ${note ? `<div class="token-trace-note">${this.escapeHtml(note)}</div>` : ''}
      <details class="token-trace-details">
        <summary>Raw details</summary>
        <pre>${this.escapeHtml(JSON.stringify({ before, after, details: trace?.details }, null, 2))}</pre>
      </details>
    </div>
  `;

  this.elements.chatMessages.appendChild(container);
  this.scrollToBottom();
  this.updateChatEmptyState();
};

const EMPTY_TIPS = [
  'Add open tabs as context with the tab selector button.',
  'Type / in the composer to use skills.',
  'Click the record button to teach the model a workflow.',
  'Sessions older than 7 days are auto-pruned to keep things fast.',
  'Attach files like .md, .csv, or .json for richer answers.',
  'Switch profiles to try different models or prompts.',
  'Export your conversation as markdown from the toolbar.',
  'Use the history drawer to revisit past sessions.',
];

let _tipTimer: ReturnType<typeof setInterval> | null = null;
let _tipIndex = Math.floor(Math.random() * EMPTY_TIPS.length);

sidePanelProto.updateChatEmptyState = function updateChatEmptyState() {
  const emptyState = this.elements.chatEmptyState;
  if (!emptyState) return;
  const hasMessages =
    (this.displayHistory && this.displayHistory.length > 0) ||
    (this.elements.chatMessages && this.elements.chatMessages.children.length > 0);
  emptyState.classList.toggle('hidden', hasMessages);

  const tipEl = emptyState.querySelector('#emptyTip') as HTMLElement | null;
  if (!tipEl) return;

  if (hasMessages) {
    if (_tipTimer) {
      clearInterval(_tipTimer);
      _tipTimer = null;
    }
    return;
  }

  // Show first tip immediately
  if (!tipEl.textContent) {
    tipEl.textContent = EMPTY_TIPS[_tipIndex];
    tipEl.classList.add('visible');
  }

  if (!_tipTimer) {
    _tipTimer = setInterval(() => {
      tipEl.classList.remove('visible');
      setTimeout(() => {
        _tipIndex = (_tipIndex + 1) % EMPTY_TIPS.length;
        tipEl.textContent = EMPTY_TIPS[_tipIndex];
        tipEl.classList.add('visible');
      }, 300);
    }, 6000);
  }
};

sidePanelProto.displayAssistantMessage = function displayAssistantMessage(
  content: string,
  thinking: string | null = null,
  usage: UsagePayload | null = null,
  model: string | null = null,
) {
  this.stopThinkingTimer?.();
  const streamResult = this.finishStreamingMessage();
  const streamedContainer = streamResult?.container;
  const streamEventsEl = streamedContainer?.querySelector('.stream-events') as HTMLElement | null;
  const hasStreamEvents = Boolean(streamEventsEl && streamEventsEl.children.length > 0);
  let normalizedUsage = this.normalizeUsage(usage);
  const modelLabel = model || this.getActiveModelLabel();
  const combinedThinking = [streamResult?.thinking, thinking].filter(Boolean).join('\n\n') || null;
  const showThinking = this.elements.showThinking?.value === 'true';
  const estimatedApplied = Math.max(0, Number(this.streamingUsageEstimatedTokensApplied || 0));

  if ((!content || content.trim() === '') && !combinedThinking && !hasStreamEvents) {
    if (streamedContainer) {
      streamedContainer.remove();
    }
    this.updateStatus('Ready', 'success');
    this.elements.composer?.classList.remove('running');
    this.stopWatchdog?.();
    this.pendingToolCount = 0;
    this.updateActivityState();
    return;
  }

  const parsed = extractThinking(content, combinedThinking);
  content = parsed.content;
  thinking = parsed.thinking;
  if (thinking) {
    // (debug log removed)
  } else {
    // (debug log removed)
  }
  this.updateThinkingPanel(thinking, false);

  if (!normalizedUsage) {
    normalizedUsage = this.estimateUsageFromContent(content);
    if (normalizedUsage && estimatedApplied > 0) {
      normalizedUsage = {
        inputTokens: normalizedUsage.inputTokens,
        outputTokens: Math.max(0, normalizedUsage.outputTokens - estimatedApplied),
        totalTokens: Math.max(0, normalizedUsage.totalTokens - estimatedApplied),
      };
    }
  } else if (estimatedApplied > 0) {
    normalizedUsage = {
      inputTokens: normalizedUsage.inputTokens,
      outputTokens: Math.max(0, normalizedUsage.outputTokens - estimatedApplied),
      totalTokens: Math.max(0, normalizedUsage.totalTokens - estimatedApplied),
    };
  }
  if (
    normalizedUsage &&
    (normalizedUsage.inputTokens > 0 || normalizedUsage.outputTokens > 0 || normalizedUsage.totalTokens > 0)
  ) {
    this.updateUsageStats(normalizedUsage);
  }
  this.streamingUsageEstimatedTokens = 0;
  this.streamingUsageEstimatedTokensApplied = 0;
  const messageMeta = this.buildMessageMeta(normalizedUsage, modelLabel);
  const selectedReportImages =
    typeof this.getSelectedReportImagesForExport === 'function' ? this.getSelectedReportImagesForExport() : [];
  const buildReportImagesHtml = () => {
    if (!Array.isArray(selectedReportImages) || selectedReportImages.length === 0) return '';
    const cards = selectedReportImages
      .map((image: unknown, index: number) => {
        const img = image as { title?: unknown; url?: unknown; id?: unknown; dataUrl?: unknown };
        const label = this.escapeHtml(String(img.title || img.url || img.id || `Image ${index + 1}`));
        const src = String(img.dataUrl || '');
        if (!src) return '';
        return `
          <figure class="report-image-card">
            <img src="${src}" alt="${label}" loading="lazy" />
            <figcaption>${label}</figcaption>
          </figure>
        `;
      })
      .join('');
    if (!cards) return '';
    return `
      <div class="report-images-inline">
        <div class="report-images-inline-title">Selected report images</div>
        <div class="report-images-inline-grid">${cards}</div>
      </div>
    `;
  };

  const assistantEntry = createMessage({
    role: 'assistant',
    content,
    thinking,
  });
  if (assistantEntry) {
    this.displayHistory.push(assistantEntry);
    if (this.displayHistory.length > MAX_DISPLAY_HISTORY) {
      this.displayHistory.splice(0, this.displayHistory.length - MAX_DISPLAY_HISTORY);
    }
  }

  if (streamedContainer) {
    if (!streamedContainer.querySelector('.message-header')) {
      const header = document.createElement('div');
      header.className = 'message-header';
      header.textContent = 'Assistant';
      streamedContainer.prepend(header);
    }

    if (messageMeta) {
      let metaEl = streamedContainer.querySelector('.message-meta') as HTMLElement | null;
      if (!metaEl) {
        metaEl = document.createElement('div');
        metaEl.className = 'message-meta';
        const header = streamedContainer.querySelector('.message-header');
        if (header) {
          header.insertAdjacentElement('afterend', metaEl);
        } else {
          streamedContainer.prepend(metaEl);
        }
      }
      metaEl.textContent = messageMeta;
    }

    if (thinking && showThinking && streamEventsEl) {
      const existingThinking = streamedContainer.querySelector(
        '.thinking-block, .inline-thinking-block, .stream-event-reasoning',
      );
      const cleanedThinking = dedupeThinking(thinking);
      if (!existingThinking && cleanedThinking) {
        const thinkingBlock = document.createElement('div');
        thinkingBlock.className = 'thinking-block collapsed';
        thinkingBlock.innerHTML = `
            <button class="thinking-header" type="button" aria-expanded="false">
              <svg class="chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
              Thought process
            </button>
            <div class="thinking-content">${this.escapeHtml(cleanedThinking)}</div>
          `;

        const targetBody = streamedContainer.querySelector('.step-body') as HTMLElement | null;
        const target = targetBody || streamEventsEl;
        const firstChild = target.firstChild;
        if (firstChild) {
          target.insertBefore(thinkingBlock, firstChild);
        } else {
          target.appendChild(thinkingBlock);
        }

        const thinkingHeader = thinkingBlock.querySelector('.thinking-header');
        if (thinkingHeader) {
          thinkingHeader.addEventListener('click', () => {
            const block = thinkingHeader.closest('.thinking-block');
            if (!block || block.classList.contains('thinking-hidden')) return;
            block.classList.toggle('collapsed');
            const expanded = !block.classList.contains('collapsed');
            thinkingHeader.setAttribute('aria-expanded', expanded ? 'true' : 'false');
          });
        }
      }
    }

    // Clean up ALL streamed text blocks (they may contain raw <think> tags)
    if (streamEventsEl) {
      const textEvents = streamedContainer.querySelectorAll('.stream-event-text');
      Array.from(textEvents).forEach((el) => (el as Element).remove());
      // Add a single clean text block with the final content
      if (content && content.trim() !== '') {
        const textEvent = document.createElement('div');
        textEvent.className = 'stream-event stream-event-text';
        textEvent.innerHTML = this.renderMarkdown(content);
        streamEventsEl.appendChild(textEvent);
      }

      const reportImagesHtml = buildReportImagesHtml();
      if (reportImagesHtml) {
        const existing = streamEventsEl.querySelector('.report-images-inline');
        existing?.remove();
        const reportBlock = document.createElement('div');
        reportBlock.className = 'stream-event stream-event-report-images';
        reportBlock.innerHTML = reportImagesHtml;
        streamEventsEl.appendChild(reportBlock);
      }

      // Collapse tool rows by default with a summary toggle
      const toolRows = streamEventsEl.querySelectorAll('.tool-row');
      if (toolRows.length > 0) {
        const errorCount = streamEventsEl.querySelectorAll('.tool-row.error').length;
        const label = `${toolRows.length} tool call${toolRows.length !== 1 ? 's' : ''}${errorCount > 0 ? ` · ${errorCount} error${errorCount !== 1 ? 's' : ''}` : ''}`;
        const toggle = document.createElement('button');
        toggle.className = 'tool-group-toggle';
        toggle.type = 'button';
        toggle.innerHTML = `
          <svg class="tool-group-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
          <span>${label}</span>
        `;
        toggle.addEventListener('click', () => {
          streamEventsEl.classList.toggle('tools-collapsed');
        });
        // Insert before the first tool row
        toolRows[0].insertAdjacentElement('beforebegin', toggle);
        streamEventsEl.classList.add('tools-collapsed');
      }
    }

    this.scrollToBottom();
    this.updateStatus('Ready', 'success');
    this.elements.composer?.classList.remove('running');
    this.stopWatchdog?.();
    this.stopRunTimer?.();
    this.pendingToolCount = 0;
    this.updateActivityState();
    this.nullifyFinalizedToolData();
    this.pruneOldChatTurns();
    this.persistHistory();
    this.updateChatEmptyState();
    this.flushQueuedMessage?.();
    return;
  }

  const messageDiv = document.createElement('div');
  messageDiv.className = 'message assistant';
  this.tagAgentView?.(messageDiv, 'main');

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

  if (content && content.trim() !== '') {
    const renderedContent = this.renderMarkdown(content);
    html += `<div class="message-content markdown-body">${renderedContent}</div>`;
  }

  const reportImagesHtml = buildReportImagesHtml();
  if (reportImagesHtml) {
    html += reportImagesHtml;
  }

  messageDiv.innerHTML = html;

  const thinkingHeader = messageDiv.querySelector('.thinking-header');
  if (thinkingHeader) {
    thinkingHeader.addEventListener('click', () => {
      const block = thinkingHeader.closest('.thinking-block');
      if (!block || block.classList.contains('thinking-hidden')) return;
      block.classList.toggle('collapsed');
      const expanded = !block.classList.contains('collapsed');
      thinkingHeader.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    });
  }

  if (this.lastChatTurn) {
    this.lastChatTurn.appendChild(messageDiv);
  } else {
    this.elements.chatMessages.appendChild(messageDiv);
  }
  this.scrollToBottom();
  this.updateStatus('Ready', 'success');
  this.elements.composer?.classList.remove('running');
  this.stopWatchdog?.();
  this.stopRunTimer?.();
  this.pendingToolCount = 0;
  this.updateActivityState();
  this.nullifyFinalizedToolData();
  this.pruneOldChatTurns();
  this.persistHistory();
  this.updateChatEmptyState();
  this.flushQueuedMessage?.();
};

const MAX_CHAT_TURNS = 100;
const PRUNE_PLACEHOLDER_CLASS = 'chat-pruned-placeholder';

sidePanelProto.pruneOldChatTurns = function pruneOldChatTurns() {
  const container = this.elements.chatMessages;
  if (!container) return;

  const turns = Array.from(container.querySelectorAll('.chat-turn'));
  const excess = turns.length - MAX_CHAT_TURNS;
  if (excess <= 0) return;

  // Preserve scroll position relative to bottom
  const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

  let removed = 0;
  for (let i = 0; i < turns.length && removed < excess; i++) {
    const turn = turns[i] as HTMLElement;
    // Never remove a turn that's still streaming
    if (turn.querySelector('.streaming')) continue;
    turn.remove();
    removed++;
  }

  if (removed > 0) {
    // Insert or update placeholder at top
    let placeholder = container.querySelector(`.${PRUNE_PLACEHOLDER_CLASS}`) as HTMLElement | null;
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.className = PRUNE_PLACEHOLDER_CLASS;
      container.prepend(placeholder);
    }
    const totalPruned = Number(placeholder.dataset.count || 0) + removed;
    placeholder.dataset.count = String(totalPruned);
    placeholder.textContent = `${totalPruned} earlier messages hidden`;

    // Restore scroll position relative to bottom to prevent visual jump
    container.scrollTop = container.scrollHeight - container.clientHeight - scrollBottom;

    // Sweep toolCallViews — null out stale DOM refs for entries whose elements were pruned
    for (const entry of this.toolCallViews.values()) {
      if (entry.element && !entry.element.isConnected) {
        entry.abortController?.abort();
        entry.element = null;
        entry.statusEl = null;
        entry.durationEl = null;
      }
    }

    // Sweep reportImages — revoke blob URLs and remove orphaned non-selected images
    const orphanIds: string[] = [];
    for (const [id, img] of this.reportImages.entries()) {
      if (this.selectedReportImageIds.has(id)) continue;
      // Check if any live DOM preview references this image
      const livePreview = document.querySelector(`.report-image-toggle[data-report-image-id="${id}"]`);
      if (!livePreview) {
        if (img._blobUrl) URL.revokeObjectURL(img._blobUrl);
        orphanIds.push(id);
      }
    }
    for (const id of orphanIds) {
      this.reportImages.delete(id);
    }
    if (orphanIds.length > 0) {
      this.reportImageOrder = this.reportImageOrder.filter((id: string) => this.reportImages.has(id));
    }
  }
};
