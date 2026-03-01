import type { RunPlan } from '../../../../shared/src/plan.js';
import { dedupeThinking, extractThinking } from '../../../ai/message-utils.js';
import { SidePanelUI } from '../core/panel-ui.js';

const sidePanelProto = SidePanelUI.prototype as SidePanelUI & Record<string, unknown>;

const formatElapsed = (elapsedMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const minuteLabel = minutes.toString().padStart(1, '0');
  const secondLabel = seconds.toString().padStart(2, '0');
  return `${minuteLabel}:${secondLabel}`;
};

const MASCOT_VERBS = [
  'Vibing',
  'Slaying',
  'Cooking',
  'Grinding',
  'Manifesting',
  'Ghosting',
  'Flexing',
  'Streaming',
  'Hustling',
  'Glazing',
  'Mogging',
  'Coping',
  'Rizzing',
  'Finessing',
  'Fumbling',
  'Binging',
  'Canceling',
  'Yoinking',
  'Simping',
  'Dooming',
];
let _verbIndex = Math.floor(Math.random() * MASCOT_VERBS.length);
const nextVerb = () => {
  _verbIndex = (_verbIndex + 1) % MASCOT_VERBS.length;
  return MASCOT_VERBS[_verbIndex];
};

sidePanelProto.handleAssistantStream = function handleAssistantStream(event: { status?: string; content?: string }) {
  if (event.status === 'start') {
    this.isStreaming = true;
    this.clearErrorBanner();
    this.startStreamingMessage();
    this.startThinkingTimer();
  } else if (event.status === 'delta') {
    this.isStreaming = true;
    this.updateStreamingMessage(event.content || '');
  } else if (event.status === 'stop') {
    this.isStreaming = false;
    this.completeStreamingMessage();
    this.stopThinkingTimer();
  }
  this.updateActivityState();
};

sidePanelProto.startThinkingTimer = function startThinkingTimer() {
  if (this.thinkingTimerId) {
    window.clearInterval(this.thinkingTimerId);
  }
  this.thinkingStartedAt = Date.now();
  this._currentVerb = nextVerb();
  let tickCount = 0;
  const updateTimer = () => {
    const elapsed = formatElapsed(Date.now() - (this.thinkingStartedAt || Date.now()));
    // Rotate verb every 3 seconds
    tickCount++;
    if (tickCount % 3 === 0) {
      this._currentVerb = nextVerb();
    }
    this.updateStatus(`${this._currentVerb} ${elapsed}`, 'active');
    this.updateMascotBubbleContent(this._currentVerb, elapsed);
  };
  updateTimer();
  this.thinkingTimerId = window.setInterval(updateTimer, 1000);
};

sidePanelProto.stopThinkingTimer = function stopThinkingTimer() {
  if (this.thinkingTimerId) {
    window.clearInterval(this.thinkingTimerId);
    this.thinkingTimerId = null;
  }
  this.thinkingStartedAt = null;
  this._currentVerb = null;
  // Clear bubble verb when not thinking
  const bubbleVerb = document.getElementById('bubbleVerb');
  if (bubbleVerb) bubbleVerb.textContent = '';
};

sidePanelProto.startStreamingMessage = function startStreamingMessage() {
  if (this.streamingState) return;

  const container = document.createElement('div');
  container.className = 'message assistant streaming';
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

  const eventsEl = container.querySelector('.stream-events') as HTMLElement | null;

  this.streamingState = {
    container,
    eventsEl,
    lastEventType: undefined,
    textEventEl: null,
    reasoningEventEl: null,
    textBuffer: '',
    reasoningBuffer: '',
    planEl: null,
    planListEl: null,
    planMetaEl: null,
  };

  const mascot = document.getElementById('mascotCorner');
  if (mascot) mascot.classList.add('thinking');

  this.updateThinkingPanel(null, true);
  this.scrollToBottom();
};

sidePanelProto.updateStreamingMessage = function updateStreamingMessage(content: string) {
  if (!this.streamingState) {
    this.startStreamingMessage();
  }
  if (!this.streamingState?.eventsEl) return;

  if (this.streamingState.lastEventType !== 'text') {
    const textEvent = document.createElement('div');
    textEvent.className = 'stream-event stream-event-text';
    this.streamingState.eventsEl.appendChild(textEvent);
    this.streamingState.textEventEl = textEvent;
    this.streamingState.textBuffer = '';
    this.streamingState.lastEventType = 'text';
  }

  this.streamingState.textBuffer = `${this.streamingState.textBuffer || ''}${content || ''}`;
  if (this.streamingState.textEventEl) {
    const extracted = extractThinking(this.streamingState.textBuffer || '');
    if (extracted.thinking) {
      this.streamingReasoning = extracted.thinking;
      this.updateStreamReasoning(extracted.thinking, true);
    }
    const cleanedText = extracted.content || this.streamingState.textBuffer || '';
    this.streamingState.textEventEl.innerHTML = this.renderMarkdown(cleanedText);
  }

  this.scrollToBottom();
};

sidePanelProto.completeStreamingMessage = function completeStreamingMessage() {
  if (!this.streamingState?.container) return;
  const indicator = this.streamingState.container.querySelector('.typing-indicator');
  if (indicator) indicator.remove();
  this.streamingState.container.classList.remove('streaming');

  // Remove thinking state from mascot
  const mascot = document.getElementById('mascotCorner');
  if (mascot) mascot.classList.remove('thinking');

  if (this.streamingReasoning) {
    this.latestThinking = this.streamingReasoning;
  } else {
    this.latestThinking = null;
  }
};

sidePanelProto.updateStreamReasoning = function updateStreamReasoning(delta: string | null, replace = false) {
  if (!this.streamingState?.eventsEl) return;
  if (delta === null || delta === undefined) return;
  if (!delta.trim() && !this.streamingState.reasoningBuffer) return;

  const targetContainer = this.streamingState.eventsEl;

  let reasoningContentEl = targetContainer.querySelector(
    ':scope > .stream-event-reasoning .stream-reasoning-content',
  ) as HTMLElement | null;

  if (!reasoningContentEl) {
    const reasoningEvent = document.createElement('div');
    reasoningEvent.className = 'stream-event stream-event-reasoning';
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

    reasoningContentEl = reasoningEvent.querySelector('.stream-reasoning-content') as HTMLElement | null;
    this.streamingState.reasoningEventEl = reasoningContentEl;
    this.streamingState.reasoningBuffer = '';

    const mascot = document.getElementById('mascotCorner');
    if (mascot) mascot.classList.add('thinking');
  }

  const nextBuffer = replace ? delta : `${this.streamingState.reasoningBuffer || ''}${delta}`;
  this.streamingState.reasoningBuffer = nextBuffer;
  const cleaned = dedupeThinking(nextBuffer);
  if (reasoningContentEl) {
    reasoningContentEl.textContent = cleaned;
  }
  this.scrollToBottom();
};

sidePanelProto.applyPlanUpdate = function applyPlanUpdate(plan: RunPlan) {
  if (!plan) return;
  this.currentPlan = plan;
  this.renderPlanDrawer(plan);
};

sidePanelProto.applyManualPlanUpdate = function applyManualPlanUpdate(
  steps: Array<{ title: string; status?: string; notes?: string }> = [],
) {
  if (!steps || steps.length === 0) return;
  const now = Date.now();
  const normalizedSteps = steps
    .map((step, index) => {
      const status =
        step.status === 'running' || step.status === 'done' || step.status === 'blocked' ? step.status : 'pending';
      return {
        id: `step-${index + 1}`,
        title: step.title,
        status: status as RunPlan['steps'][number]['status'],
        notes: step.notes,
      };
    })
    .filter((step) => step.title);
  if (!normalizedSteps.length) return;
  this.currentPlan = {
    steps: normalizedSteps,
    createdAt: this.currentPlan?.createdAt || now,
    updatedAt: now,
  };
  if (this.currentPlan) {
    this.renderPlanDrawer(this.currentPlan);
  }
};

sidePanelProto.ensurePlanBlock = function ensurePlanBlock() {
  if (!this.streamingState?.eventsEl) return null;
  if (this.streamingState.planEl) return this.streamingState.planEl;

  const container = document.createElement('div');
  container.className = 'plan-block';
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
  this.streamingState.planListEl = container.querySelector('.plan-steps') as HTMLOListElement | null;
  this.streamingState.planMetaEl = container.querySelector('.plan-meta') as HTMLElement | null;
  return container;
};

sidePanelProto.finishStreamingMessage = function finishStreamingMessage() {
  if (!this.streamingState) return null;
  const streamingThinking = this.streamingReasoning;
  const container = this.streamingState.container;

  this.completeStreamingMessage();
  this.streamingState = null;
  this.isStreaming = false;
  this.updateActivityState();

  return { thinking: streamingThinking, container };
};
