import type { RunPlan } from '../../../../shared/src/plan.js';
import { dedupeThinking, extractThinking } from '../../../ai/message-utils.js';
import { SidePanelUI } from '../core/panel-ui.js';

const formatElapsed = (elapsedMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const minuteLabel = minutes.toString().padStart(1, '0');
  const secondLabel = seconds.toString().padStart(2, '0');
  return `${minuteLabel}:${secondLabel}`;
};

(SidePanelUI.prototype as any).handleAssistantStream = function handleAssistantStream(event: any) {
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

(SidePanelUI.prototype as any).startThinkingTimer = function startThinkingTimer() {
  if (this.thinkingTimerId) {
    window.clearInterval(this.thinkingTimerId);
  }
  this.thinkingStartedAt = Date.now();
  const updateTimer = () => {
    const elapsed = formatElapsed(Date.now() - (this.thinkingStartedAt || Date.now()));
    this.updateStatus(`Thinking ${elapsed}`, 'active');
  };
  updateTimer();
  this.thinkingTimerId = window.setInterval(updateTimer, 1000);
};

(SidePanelUI.prototype as any).stopThinkingTimer = function stopThinkingTimer() {
  if (this.thinkingTimerId) {
    window.clearInterval(this.thinkingTimerId);
    this.thinkingTimerId = null;
  }
  this.thinkingStartedAt = null;
};

(SidePanelUI.prototype as any).startStreamingMessage = function startStreamingMessage() {
  if (this.streamingState) return;

  const container = document.createElement('div');
  container.className = 'message assistant streaming';
  container.innerHTML = `
      <div class="message-content streaming-content markdown-body">
        <div class="run-hud" role="status" aria-live="polite">
          <button class="run-hud-toggle" type="button" aria-expanded="true" title="Collapse timeline">
            <span class="run-hud-pill" data-state="idle">RUN</span>
            <span class="run-hud-title">Timeline</span>
            <span class="run-hud-count">0</span>
            <span class="run-hud-last"></span>
          </button>
          <div class="run-hud-right">
            <span class="run-hud-time"></span>
          </div>
        </div>
        <div class="stream-events"></div>
      </div>
    `;

  // Prefer grouping assistant output under the last user "turn" when available.
  if (this.lastChatTurn) {
    this.lastChatTurn.appendChild(container);
  } else {
    this.elements.chatMessages.appendChild(container);
  }

  const eventsEl = container.querySelector('.stream-events') as HTMLElement | null;
  const toggleBtn = container.querySelector('.run-hud-toggle') as HTMLButtonElement | null;
  if (toggleBtn) {
    const collapsedByDefault = (this as any).timelineCollapsed !== false;
    container.classList.toggle('timeline-collapsed', collapsedByDefault);
    toggleBtn.setAttribute('aria-expanded', collapsedByDefault ? 'false' : 'true');
    toggleBtn.title = collapsedByDefault ? 'Expand timeline' : 'Collapse timeline';
    toggleBtn.addEventListener('click', () => {
      const collapsed = container.classList.toggle('timeline-collapsed');
      toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      toggleBtn.title = collapsed ? 'Expand timeline' : 'Collapse timeline';
      (this as any).timelineCollapsed = collapsed;
      chrome.storage.local.set({ timelineCollapsed: collapsed }).catch(() => {});
    });
  }
  // Reset per-run timeline counters.
  (this as any)._timelineStats = { total: 0, running: 0, last: '', lastStatus: 'RUN' };
  this.refreshTimelineHud?.();

  if (eventsEl) {
    const defaultStep = this.createStepContainer(0, 'Run');
    eventsEl.appendChild(defaultStep.el);
    this.stepTimeline.steps.set(0, defaultStep);
    this.stepTimeline.activeStepIndex = 0;
    this.stepTimeline.activeStepBody = defaultStep.bodyEl;
  }

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

  // Show thinking state on mascot
  const mascot = document.getElementById('mascotCorner');
  if (mascot) mascot.classList.add('thinking');

  this.updateThinkingPanel(null, true);
  this.scrollToBottom();
};

(SidePanelUI.prototype as any).updateStreamingMessage = function updateStreamingMessage(content: string) {
  if (!this.streamingState) {
    this.startStreamingMessage();
  }
  if (!this.streamingState?.eventsEl) return;

  const targetBody = this.stepTimeline.activeStepBody || this.streamingState.eventsEl;

  if (this.streamingState.lastEventType !== 'text') {
    const textEvent = document.createElement('div');
    textEvent.className = 'stream-event stream-event-text';
    targetBody.appendChild(textEvent);
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

(SidePanelUI.prototype as any).completeStreamingMessage = function completeStreamingMessage() {
  if (!this.streamingState?.container) return;
  const indicator = this.streamingState.container.querySelector('.typing-indicator');
  if (indicator) indicator.remove();
  this.streamingState.container.classList.remove('streaming');

  // Remove thinking state from mascot
  const mascot = document.getElementById('mascotCorner');
  if (mascot) mascot.classList.remove('thinking');

  // Don't call updateThinkingPanel here — streamingState is still set, so it
  // would create a duplicate .inline-thinking-block alongside the existing
  // .stream-event-reasoning.  Just track the value; displayAssistantMessage
  // handles the final render after streamingState is cleared.
  if (this.streamingReasoning) {
    this.latestThinking = this.streamingReasoning;
  } else {
    this.latestThinking = null;
  }
};

(SidePanelUI.prototype as any).updateStreamReasoning = function updateStreamReasoning(
  delta: string | null,
  replace = false,
) {
  if (!this.streamingState?.eventsEl) return;
  if (delta === null || delta === undefined) return;
  if (!delta.trim() && !this.streamingState.reasoningBuffer) return;

  // Determine the container where reasoning should live.
  // For steps, use .step-content so reasoning appears BEFORE tools.
  // Fall back to .stream-events when outside any step.
  const activeStepIndex = this.stepTimeline.activeStepIndex;
  const activeStep = activeStepIndex !== null ? this.stepTimeline.steps.get(activeStepIndex) : null;
  const stepContentEl = activeStep?.el?.querySelector('.step-content') as HTMLElement | null;
  const targetContainer = stepContentEl || this.streamingState.eventsEl;

  // Reuse existing reasoning block in this container instead of creating new
  // ones every time lastEventType changes (which caused orphan fragments).
  let reasoningContentEl = targetContainer.querySelector(
    ':scope > .stream-event-reasoning .stream-reasoning-content',
  ) as HTMLElement | null;

  if (!reasoningContentEl) {
    const reasoningEvent = document.createElement('div');
    reasoningEvent.className = 'stream-event stream-event-reasoning';
    reasoningEvent.innerHTML = `
        <div class="stream-reasoning-header">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a10 10 0 1 0 10 10H12V2z"/>
            <path d="M12 2a10 10 0 0 1 10 10"/>
          </svg>
          <span>Thinking</span>
        </div>
        <div class="stream-reasoning-content"></div>
      `;

    // Insert BEFORE .step-tools so reasoning appears above tool calls.
    const toolsEl = stepContentEl?.querySelector('.step-tools') as HTMLElement | null;
    if (toolsEl) {
      stepContentEl!.insertBefore(reasoningEvent, toolsEl);
    } else {
      // Outside steps or no tools container — prepend to target.
      targetContainer.prepend(reasoningEvent);
    }

    reasoningContentEl = reasoningEvent.querySelector('.stream-reasoning-content') as HTMLElement | null;
    this.streamingState.reasoningEventEl = reasoningContentEl;
    this.streamingState.reasoningBuffer = '';

    // Update mascot to show active thinking
    const mascot = document.getElementById('mascotCorner');
    if (mascot) mascot.classList.add('thinking');
  }

  const nextBuffer = replace ? delta : `${this.streamingState.reasoningBuffer || ''}${delta}`;
  this.streamingState.reasoningBuffer = nextBuffer;
  const cleaned = dedupeThinking(nextBuffer);
  if (reasoningContentEl) {
    reasoningContentEl.textContent = cleaned;
  }
  // (debug log removed)
  this.scrollToBottom();
};

(SidePanelUI.prototype as any).applyPlanUpdate = function applyPlanUpdate(plan: RunPlan) {
  if (!plan) return;
  this.currentPlan = plan;
  this.renderPlanDrawer(plan);
};

(SidePanelUI.prototype as any).applyManualPlanUpdate = function applyManualPlanUpdate(
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

(SidePanelUI.prototype as any).ensurePlanBlock = function ensurePlanBlock() {
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

(SidePanelUI.prototype as any).finishStreamingMessage = function finishStreamingMessage() {
  if (!this.streamingState) return null;
  const streamingThinking = this.streamingReasoning;
  const container = this.streamingState.container;

  this.completeStreamingMessage();
  this.streamingState = null;
  this.isStreaming = false;
  this.updateActivityState();

  return { thinking: streamingThinking, container };
};
