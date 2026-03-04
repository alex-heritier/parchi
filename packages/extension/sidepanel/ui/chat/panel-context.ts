import { SidePanelUI } from '../core/panel-ui.js';
const sidePanelProto = SidePanelUI.prototype as SidePanelUI & Record<string, unknown>;

const formatContextTokens = (value: number) => {
  const normalized = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  if (normalized >= 1_000_000) return `${(normalized / 1_000_000).toFixed(1)}m`;
  if (normalized >= 10_000) return `${(normalized / 1_000).toFixed(0)}k`;
  if (normalized >= 1_000) return `${(normalized / 1_000).toFixed(1)}k`;
  return `${normalized}`;
};

const formatCompactionTimeAgo = (timestamp: number) => {
  const elapsedMs = Math.max(0, Date.now() - timestamp);
  const elapsedSec = Math.floor(elapsedMs / 1000);
  if (elapsedSec < 3) return 'just now';
  if (elapsedSec < 60) return `${elapsedSec}s ago`;
  const elapsedMin = Math.floor(elapsedSec / 60);
  if (elapsedMin < 60) return `${elapsedMin}m ago`;
  const elapsedHr = Math.floor(elapsedMin / 60);
  return `${elapsedHr}h ago`;
};

const defaultCompactionState = (): SidePanelUI['contextCompactionState'] => ({
  inProgress: false,
  lastResult: null,
  lastMessage: null,
  lastCompactedAt: 0,
  lastCompletedAt: 0,
});

sidePanelProto.setContextCompactionState = function setContextCompactionState(nextState: Record<string, unknown>) {
  const current =
    this.contextCompactionState && typeof this.contextCompactionState === 'object'
      ? this.contextCompactionState
      : defaultCompactionState();
  this.contextCompactionState = { ...current, ...nextState } as SidePanelUI['contextCompactionState'];
  this.updateContextInspector?.();
};

sidePanelProto.updateContextInspector = function updateContextInspector() {
  const button = this.elements.contextInspectorBtn as HTMLButtonElement | null;
  const valueEl = this.elements.contextInspectorValue as HTMLElement | null;
  const metaEl = this.elements.contextInspectorMeta as HTMLElement | null;
  if (!button || !valueEl || !metaEl) return;

  const usage = this.contextUsage || {};
  const used = Math.max(0, Number(usage.approxTokens || 0));
  const max = Math.max(1, Number(usage.maxContextTokens || this.getConfiguredContextLimit() || 1));
  const percent = Math.max(0, Math.min(100, Number(usage.percent || 0)));

  valueEl.textContent = `${formatContextTokens(used)} / ${formatContextTokens(max)}`;

  const compactionState =
    this.contextCompactionState && typeof this.contextCompactionState === 'object'
      ? this.contextCompactionState
      : defaultCompactionState();
  const inProgress = compactionState.inProgress === true;
  const result = String(compactionState.lastResult || '');
  const compactedAt = Number(compactionState.lastCompactedAt || 0);

  let meta = `${percent}%`;
  if (inProgress) {
    meta = 'Compacting';
  } else if (result === 'success' && compactedAt > 0) {
    meta = formatCompactionTimeAgo(compactedAt);
  } else if (result === 'skipped') {
    meta = 'OK';
  } else if (result === 'error') {
    meta = 'Failed';
  }
  metaEl.textContent = meta;

  button.classList.remove(
    'level-low',
    'level-mid',
    'level-high',
    'level-critical',
    'is-compacting',
    'is-confirmed',
    'is-warning',
    'is-error',
  );
  if (percent >= 90) button.classList.add('level-critical');
  else if (percent >= 70) button.classList.add('level-high');
  else if (percent >= 35) button.classList.add('level-mid');
  else if (percent > 0) button.classList.add('level-low');

  if (inProgress) button.classList.add('is-compacting');
  else if (result === 'success') button.classList.add('is-confirmed');
  else if (result === 'skipped') button.classList.add('is-warning');
  else if (result === 'error') button.classList.add('is-error');

  button.disabled = inProgress;
  button.setAttribute('aria-busy', inProgress ? 'true' : 'false');
  button.setAttribute(
    'aria-label',
    `Context ${formatContextTokens(used)} / ${formatContextTokens(max)} (${percent}%). Click to compact.`,
  );
  const tooltip = `${formatContextTokens(used)} / ${formatContextTokens(max)} (${percent}%)`;
  button.title = tooltip;
  button.setAttribute('data-tooltip', tooltip);
};

sidePanelProto.updateContextUsage = function updateContextUsage(actualTokens: number | null = null) {
  let approxTokens;

  if (actualTokens !== null && actualTokens > 0) {
    this.sessionTokensUsed = Math.max(this.sessionTokensUsed || 0, actualTokens);
    approxTokens = this.sessionTokensUsed;
  } else {
    const joined = this.contextHistory
      .map((msg: unknown) => {
        if (!msg || typeof msg !== 'object') return '';
        const m = msg as { content?: unknown };
        if (typeof m.content === 'string') return m.content;
        if (Array.isArray(m.content)) {
          return m.content
            .map((p: unknown) => {
              if (typeof p === 'string') return p;
              if (!p || typeof p !== 'object') return '';
              const part = p as { text?: unknown; content?: unknown; output?: unknown };
              if (typeof part.text === 'string') return part.text;
              if (part.content !== undefined) return JSON.stringify(part.content);
              if (part.output !== undefined) {
                const outObj = part.output as { value?: unknown };
                const output = outObj?.value ?? part.output;
                if (typeof output === 'string') return output;
                try {
                  return JSON.stringify(output);
                } catch {
                  return String(output);
                }
              }
              return '';
            })
            .join('');
        }
        return '';
      })
      .join('\n');
    const chars = joined.length;
    const baseTokens = this.estimateBaseContextTokens();
    const estimated = baseTokens + Math.ceil(chars / 4);
    approxTokens = Math.max(estimated, this.sessionTokensUsed || 0);
  }

  const maxContextTokens = this.getConfiguredContextLimit();
  const percent = Math.min(100, Math.round((approxTokens / maxContextTokens) * 100));
  this.contextUsage = { approxTokens, maxContextTokens, percent };
  this.updateActivityState();
  this.updateContextInspector?.();

  // Drive the context bar visual
  const bar = document.getElementById('contextBar');
  const composer = document.getElementById('composer');
  if (bar && composer) {
    composer.style.setProperty('--context-percent', `${percent}%`);
    bar.classList.remove('level-low', 'level-mid', 'level-high', 'level-critical');
    if (percent >= 90) bar.classList.add('level-critical');
    else if (percent >= 70) bar.classList.add('level-high');
    else if (percent >= 35) bar.classList.add('level-mid');
    else if (percent > 0) bar.classList.add('level-low');
  }
};

sidePanelProto.getConfiguredContextLimit = function getConfiguredContextLimit() {
  const active = this.configs[this.currentConfig] || {};
  const configured = Number(active.contextLimit) || Number.parseInt(this.elements.contextLimit?.value) || 200000;
  return configured;
};

sidePanelProto.estimateBaseContextTokens = function estimateBaseContextTokens() {
  const active = this.configs[this.currentConfig] || {};
  const prompt = active.systemPrompt || this.getDefaultSystemPrompt();
  const promptTokens = Math.ceil((prompt?.length || 0) / 4);
  const toolBudget = 1200;
  return promptTokens + toolBudget;
};
