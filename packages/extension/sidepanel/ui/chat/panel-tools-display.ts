import { MAX_TOOL_CALL_VIEWS, sidePanelProto } from './panel-tools-shared.js';

sidePanelProto.displayToolExecution = function displayToolExecution(
  toolName: string,
  args: any,
  result: any,
  toolCallId: string | null = null,
) {
  const entryId = toolCallId || `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let entry = this.toolCallViews.get(entryId);
  const displayName = toolName;

  if (!entry) {
    if (this.toolCallViews.size >= MAX_TOOL_CALL_VIEWS) {
      const iter = this.toolCallViews.entries();
      const excess = this.toolCallViews.size - MAX_TOOL_CALL_VIEWS + 1;
      for (let i = 0; i < excess; i++) {
        const next = iter.next().value;
        if (next) {
          const [key, old] = next;
          old.abortController?.abort();
          old.element?.remove();
          this.toolCallViews.delete(key);
        }
      }
    }

    entry = {
      id: entryId,
      toolName: displayName,
      fullToolName: toolName,
      args,
      startTime: Date.now(),
      element: null,
      statusEl: null,
      durationEl: null,
      abortController: new AbortController(),
    };
    this.toolCallViews.set(entryId, entry);

    if (this.streamingState?.eventsEl) {
      const toolEl = this.createToolElement(entry);
      entry.element = toolEl;
      this.streamingState.eventsEl.appendChild(toolEl);
      this.streamingState.lastEventType = 'tool';
    }
    this.scrollToBottom();
  }

  if (result !== null && result !== undefined) {
    this.updateToolResult(entry, result);
    const isError = result && (result.error || result.success === false);
    if (isError) {
      const detail = result?.details
        ? ` (${this.truncateText?.(String(result.details), 140) || String(result.details)})`
        : '';
      this.showErrorBanner(`${displayName}: ${result.error || 'Tool execution failed'}${detail}`);
    }
  }
  this.updateActivityToggle();
};

sidePanelProto.createToolElement = function createToolElement(entry: any) {
  const container = document.createElement('div');
  container.className = 'tool-row running';
  container.dataset.toolId = entry.id;

  const icon = this.getToolIcon(entry.fullToolName);
  const argsTokens = this.getArgsTokens(entry.args);
  const argsLabel = argsTokens.join(' · ');
  if (argsLabel) container.title = argsLabel;

  container.innerHTML = `
    <span class="tool-icon">${icon}</span>
    <span class="tool-name">${this.escapeHtml(entry.toolName)}</span>
    ${argsLabel ? `<span class="tool-args">${this.escapeHtml(argsLabel)}</span>` : ''}
    <span class="tool-status">RUN</span>
    <span class="tool-duration">...</span>
  `;

  entry.statusEl = container.querySelector('.tool-status');
  entry.durationEl = container.querySelector('.tool-duration');
  this.animateToolDuration(entry);

  const signal = entry.abortController?.signal;
  container.addEventListener(
    'click',
    () => {
      if (!entry.result) return;
      const resultText =
        typeof entry.result === 'object' ? JSON.stringify(entry.result, null, 2) : String(entry.result);
      if (typeof this.openFileViewer === 'function') {
        this.openFileViewer(resultText, entry.fullToolName || entry.toolName, entry.id);
      }
    },
    signal ? { signal } : undefined,
  );
  container.style.cursor = 'pointer';
  return container;
};

sidePanelProto.animateToolDuration = function animateToolDuration(entry: any) {
  if (!entry.durationEl || entry.endTime) return;
  const update = () => {
    if (!entry.durationEl || entry.endTime) return;
    const elapsed = Date.now() - entry.startTime;
    entry.durationEl.textContent = elapsed < 1000 ? `${elapsed}ms` : `${(elapsed / 1000).toFixed(1)}s`;
    requestAnimationFrame(() => setTimeout(update, 100));
  };
  update();
};

sidePanelProto.updateToolResult = function updateToolResult(entry: any, result: any) {
  if (!entry || !entry.element) return;

  entry.endTime = Date.now();
  const isError = result && (result.error || result.success === false);
  const duration = entry.endTime - entry.startTime;
  const isNoopScroll = entry.fullToolName === 'scroll' && result && result.success === true && result.moved === false;

  entry.element.classList.remove('running');
  entry.element.classList.add(isError ? 'error' : 'done');
  entry.element.classList.toggle('noop', isNoopScroll);

  if (entry.durationEl) {
    entry.durationEl.textContent = duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`;
  }
  if (entry.statusEl) {
    entry.statusEl.textContent = isError ? 'ERR' : 'OK';
  }

  if (isNoopScroll) {
    entry.element.title = 'Scroll did not move. The page may use an inner scroll container; pass scroll.selector.';
    let noteEl = entry.element.querySelector('.tool-note') as HTMLElement | null;
    if (!noteEl) {
      noteEl = document.createElement('span');
      noteEl.className = 'tool-note';
      noteEl.textContent = 'no-op';
      const argsEl = entry.element.querySelector('.tool-args');
      if (argsEl && argsEl.parentElement) {
        argsEl.insertAdjacentElement('afterend', noteEl);
      } else {
        const statusEl = entry.element.querySelector('.tool-status');
        if (statusEl && statusEl.parentElement) {
          statusEl.insertAdjacentElement('beforebegin', noteEl);
        } else {
          entry.element.appendChild(noteEl);
        }
      }
    }
  }

  entry.result = result;
  this.attachScreenshotPreview(entry, result);
  if (entry.result && typeof entry.result === 'object' && entry.result.dataUrl) {
    entry.result = { ...entry.result, dataUrl: '[stored in reportImages]' };
  }
};
