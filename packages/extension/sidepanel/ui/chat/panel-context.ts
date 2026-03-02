import { SidePanelUI } from '../core/panel-ui.js';
const sidePanelProto = SidePanelUI.prototype as SidePanelUI & Record<string, unknown>;

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
  const configured = active.contextLimit || Number.parseInt(this.elements.contextLimit?.value) || 200000;
  return configured;
};

sidePanelProto.estimateBaseContextTokens = function estimateBaseContextTokens() {
  const active = this.configs[this.currentConfig] || {};
  const prompt = active.systemPrompt || this.getDefaultSystemPrompt();
  const promptTokens = Math.ceil((prompt?.length || 0) / 4);
  const toolBudget = 1200;
  return promptTokens + toolBudget;
};
