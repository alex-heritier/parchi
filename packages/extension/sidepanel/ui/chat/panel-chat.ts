import { createMessage } from '../../../ai/message-schema.js';
import type { Message } from '../../../ai/message-schema.js';
import { dedupeThinking, extractThinking } from '../../../ai/message-utils.js';
import type { UsagePayload } from '../types/panel-types.js';
import { SidePanelUI } from '../core/panel-ui.js';

const truncate = (value: string, max = 12000) => {
  const text = String(value || '');
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
};

// Chrome runtime messaging can fail on large payloads or non-cloneable values.
// Keep history compact and remove heavy fields (e.g. screenshots/dataUrls) before sending to background.
const sanitizeForMessaging = (value: any, depth = 0): any => {
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
    const out: any[] = [];
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
    const out: Record<string, any> = {};
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

(SidePanelUI.prototype as any).sendMessage = async function sendMessage() {
  const userMessage = this.elements.userInput.value.trim();
  if (!userMessage) return;

  this.pendingTurnDraft = { userMessage, startedAt: Date.now() };
  if (!this.isAccessReady()) {
    this.updateAccessUI();
    this.updateStatus('Sign in required', 'warning');
    return;
  }

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
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
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

  this.displayUserMessage(userMessage);

  const displayEntry = createMessage({ role: 'user', content: userMessage });
  if (displayEntry) {
    this.displayHistory.push(displayEntry);
  }

  const contextEntry = createMessage({ role: 'user', content: fullMessage });
  if (contextEntry) {
    this.contextHistory.push(contextEntry);
  }
  this.updateContextUsage();

  this.updateStatus('Processing...', 'active');
  this.elements.composer?.classList.add('running');
  this.startRunTimer?.();

  try {
    // Avoid sending huge tool payloads; also ensures errors are caught (promise-based APIs).
    const sendableHistory = sanitizeForMessaging(this.contextHistory || []);
    const response = await chrome.runtime.sendMessage({
      type: 'user_message',
      message: fullMessage,
      conversationHistory: sendableHistory,
      selectedTabs: selectedTabsPayload,
      sessionId: this.sessionId,
    });
    if (response?.sessionId && typeof response.sessionId === 'string') {
      this.sessionId = response.sessionId;
    }
    // Note: persistHistory is called after the assistant response completes
    // in displayAssistantMessage to ensure complete conversation is saved
  } catch (error: any) {
    this.stopThinkingTimer?.();
    this.stopRunTimer?.();
    this.updateStatus('Error: ' + error.message, 'error');
    this.elements.composer?.classList.remove('running');
    this.displayAssistantMessage('Sorry, an error occurred: ' + error.message);
  }
};

(SidePanelUI.prototype as any).displayUserMessage = function displayUserMessage(content: string) {
  const turn = document.createElement('div');
  turn.className = 'chat-turn';
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message user';
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

(SidePanelUI.prototype as any).displaySummaryMessage = function displaySummaryMessage(
  messageOrEntry: Message | string,
) {
  const content = typeof messageOrEntry === 'string' ? messageOrEntry : String(messageOrEntry.content || '');
  const container = document.createElement('div');
  container.className = 'message summary';
  container.innerHTML = `
      <div class="summary-header">Context compacted</div>
      <div class="summary-body">${this.renderMarkdown(content)}</div>
    `;
  this.elements.chatMessages.appendChild(container);
  this.scrollToBottom();
  this.updateChatEmptyState();
};

(SidePanelUI.prototype as any).updateChatEmptyState = function updateChatEmptyState() {
  const emptyState = this.elements.chatEmptyState;
  if (!emptyState) return;
  const hasMessages =
    (this.displayHistory && this.displayHistory.length > 0) ||
    (this.elements.chatMessages && this.elements.chatMessages.children.length > 0);
  emptyState.classList.toggle('hidden', hasMessages);
};

(SidePanelUI.prototype as any).displayAssistantMessage = function displayAssistantMessage(
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

  if ((!content || content.trim() === '') && !combinedThinking && !hasStreamEvents) {
    if (streamedContainer) {
      streamedContainer.remove();
    }
    this.updateStatus('Ready', 'success');
    this.elements.composer?.classList.remove('running');
    this.pendingToolCount = 0;
    this.updateActivityState();
    return;
  }

  const parsed = extractThinking(content, combinedThinking);
  content = parsed.content;
  thinking = parsed.thinking;
  if (thinking) {
    console.debug('[Parchi] extracted thinking', thinking);
  } else {
    console.debug('[Parchi] no thinking extracted from content');
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
    role: 'assistant',
    content,
    thinking,
  });
  if (assistantEntry) {
    this.displayHistory.push(assistantEntry);
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
              <svg class="chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
              Thinking
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

    if (content && content.trim() !== '' && streamEventsEl) {
      let textEvent = streamEventsEl.querySelector('.stream-event-text') as HTMLElement | null;
      if (!textEvent) {
        textEvent = document.createElement('div');
        textEvent.className = 'stream-event stream-event-text';
        streamEventsEl.appendChild(textEvent);
      }
      textEvent.innerHTML = this.renderMarkdown(content);
    }

    this.scrollToBottom();
    this.updateStatus('Ready', 'success');
    this.elements.composer?.classList.remove('running');
    this.stopRunTimer?.();
    this.pendingToolCount = 0;
    this.updateActivityState();
    this.persistHistory();
    this.updateChatEmptyState();
    return;
  }

  const messageDiv = document.createElement('div');
  messageDiv.className = 'message assistant';

  let html = `<div class="message-header">Assistant</div>`;
  if (messageMeta) {
    html += `<div class="message-meta">${this.escapeHtml(messageMeta)}</div>`;
  }

  if (thinking && showThinking) {
    const cleanedThinking = dedupeThinking(thinking);
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

  if (content && content.trim() !== '') {
    const renderedContent = this.renderMarkdown(content);
    html += `<div class="message-content markdown-body">${renderedContent}</div>`;
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
  this.stopRunTimer?.();
  this.pendingToolCount = 0;
  this.updateActivityState();
  this.persistHistory();
  this.updateChatEmptyState();
};
