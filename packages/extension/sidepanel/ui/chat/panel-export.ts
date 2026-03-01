import type { Message } from '../../../ai/message-schema.js';
import { SidePanelUI } from '../core/panel-ui.js';
const sidePanelProto = SidePanelUI.prototype as SidePanelUI & Record<string, unknown>;

import { getSessionTraces } from './trace-store.js';

/* ── Export menu ──────────────────────────────────────────────────────── */

sidePanelProto.showExportMenu = function showExportMenu(): void {
  const existing = document.getElementById('exportMenu');
  if (existing) {
    existing.remove();
    return;
  }

  const menu = document.createElement('div');
  menu.id = 'exportMenu';
  menu.className = 'export-menu';

  menu.innerHTML = `
    <div class="export-menu-content">
      <div class="export-menu-header">
        <span>Export</span>
        <button class="export-menu-close" title="Close">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="export-menu-body">
        <div class="export-scope-row">
          <button class="export-scope-btn active" data-scope="all">Full session</button>
          <button class="export-scope-btn" data-scope="last">Last response</button>
        </div>
        <label class="export-actions-row">
          <span class="export-toggle-track"><span class="export-toggle-thumb"></span></span>
          <span class="export-actions-label">Include tool actions</span>
        </label>
        <button class="export-go-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export
        </button>
      </div>
    </div>
  `;

  // Position near export button
  const btn = this.elements.exportBtn;
  if (btn) {
    const rect = btn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
  }

  // State
  let scope: 'all' | 'last' = 'all';
  let includeActions = false;

  // Scope toggle
  const scopeBtns = menu.querySelectorAll('.export-scope-btn');
  scopeBtns.forEach((b) => {
    b.addEventListener('click', () => {
      scopeBtns.forEach((s) => s.classList.remove('active'));
      b.classList.add('active');
      scope = (b as HTMLElement).dataset.scope as 'all' | 'last';
    });
  });

  // Actions toggle
  const actionsRow = menu.querySelector('.export-actions-row') as HTMLElement;
  actionsRow?.addEventListener('click', () => {
    includeActions = !includeActions;
    actionsRow.classList.toggle('active', includeActions);
  });

  // Export button
  menu.querySelector('.export-go-btn')?.addEventListener('click', () => {
    menu.remove();
    this.runExport(scope, includeActions);
  });

  // Close
  menu.querySelector('.export-menu-close')?.addEventListener('click', () => menu.remove());
  const closeOnOutside = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      menu.remove();
      document.removeEventListener('click', closeOnOutside);
    }
  };
  setTimeout(() => document.addEventListener('click', closeOnOutside), 0);

  document.body.appendChild(menu);
};

/* ── Unified export ───────────────────────────────────────────────────── */

sidePanelProto.runExport = async function runExport(
  scope: 'all' | 'last',
  includeActions: boolean,
): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const tag = scope === 'all' ? 'session' : 'response';
  const filename = `${tag}-${timestamp}.md`;

  if (scope === 'last') {
    this.exportLastResponse(filename, includeActions);
  } else {
    await this.exportFullSession(filename, includeActions);
  }
};

/* ── Full session export ──────────────────────────────────────────────── */

sidePanelProto.exportFullSession = async function exportFullSession(
  filename: string,
  includeActions: boolean,
): Promise<void> {
  let md = '';

  // Header
  md += '# Session Export\n\n';
  md += `**Exported:** ${new Date().toLocaleString()}\n`;
  md += `**Session:** ${this.sessionId || 'unknown'}\n`;
  if (this.sessionTokenTotals?.totalTokens) {
    md += `**Tokens:** ${this.sessionTokenTotals.totalTokens.toLocaleString()} total `;
    md += `(${this.sessionTokenTotals.inputTokens.toLocaleString()} in / `;
    md += `${this.sessionTokenTotals.outputTokens.toLocaleString()} out)\n`;
  }
  md += '\n---\n\n';

  // Conversation messages
  if (this.displayHistory?.length) {
    for (const entry of this.displayHistory) {
      if (entry.role === 'user') {
        md += '## User\n\n';
        md += `${this.extractTextContent(entry.content)}\n\n`;
      } else if (entry.role === 'assistant') {
        md += '## Assistant\n\n';
        if (entry.thinking) {
          md += `<details>\n<summary>Thinking</summary>\n\n${entry.thinking}\n\n</details>\n\n`;
        }
        md += `${this.extractTextContent(entry.content)}\n\n`;
      } else if (entry.role === 'system' && entry.meta?.kind === 'summary') {
        md += `> **Context Summary:** ${this.extractTextContent(entry.content)}\n\n`;
      }
    }
  }

  // Tool actions (full traces)
  if (includeActions) {
    md += await this.buildActionsMarkdown('all');
  }

  // Plan
  if (this.currentPlan?.steps) {
    md += '---\n\n## Plan\n\n';
    for (const step of this.currentPlan.steps) {
      md += `${step.status === 'done' ? '[x]' : '[ ]'} ${step.title}\n`;
    }
    md += '\n';
  }

  // Subagents
  if (this.subagents?.size > 0) {
    md += '---\n\n## Subagents\n\n';
    this.subagents.forEach((agent: any) => {
      md += `- **${agent.name}** (${agent.status})\n`;
      if (agent.tasks?.length) {
        for (const task of agent.tasks) md += `  - ${task}\n`;
      }
      md += '\n';
    });
  }

  md = this.appendSelectedReportImagesMarkdown(md);
  this.downloadMarkdown(md, filename);
};

/* ── Last response export ─────────────────────────────────────────────── */

sidePanelProto.exportLastResponse = async function exportLastResponse(
  filename: string,
  includeActions: boolean,
): Promise<void> {
  // Find last assistant message
  let lastAssistant: Message | null = null;
  if (this.displayHistory?.length) {
    for (let i = this.displayHistory.length - 1; i >= 0; i--) {
      if (this.displayHistory[i].role === 'assistant') {
        lastAssistant = this.displayHistory[i];
        break;
      }
    }
  }

  if (!lastAssistant) {
    this.updateStatus('No assistant response to export', 'warning');
    return;
  }

  let md = '';

  if (lastAssistant.thinking) {
    md += `<details>\n<summary>Thinking</summary>\n\n${lastAssistant.thinking}\n\n</details>\n\n`;
  }
  md += `${this.extractTextContent(lastAssistant.content)}\n\n`;

  // Include tool actions from the last turn only
  if (includeActions) {
    md += await this.buildActionsMarkdown('last');
  }

  md = this.appendSelectedReportImagesMarkdown(md);
  this.downloadMarkdown(md, filename);
};

/* ── Build full actions markdown ──────────────────────────────────────── */

sidePanelProto.buildActionsMarkdown = async function buildActionsMarkdown(
  scope: 'all' | 'last',
): Promise<string> {
  let md = '---\n\n## Tool Actions\n\n';

  // Try to get full traces from IndexedDB first
  let traces: any[] = [];
  try {
    traces = await getSessionTraces(this.sessionId);
  } catch {
    // Fall back to in-memory historyTurnMap
  }

  if (traces.length > 0) {
    // Use persisted traces — full fidelity
    const events = scope === 'last' ? this.getLastTurnTraces(traces) : traces;
    md += this.formatTraceEvents(events);
  } else if (this.historyTurnMap?.size > 0) {
    // Fallback to in-memory data
    const turns = scope === 'last' ? [this.getLastTurnFromMap()] : Array.from(this.historyTurnMap.values());
    for (const turn of turns) {
      if (!turn) continue;
      md += this.formatTurnEvents(turn);
    }
  } else {
    md += '_No tool action data available._\n\n';
  }

  return md;
};

/** Get traces belonging to the last turn only. */
sidePanelProto.getLastTurnTraces = function getLastTurnTraces(traces: any[]): any[] {
  // Find the last user_message, then return everything from that point on
  let lastUserIdx = -1;
  for (let i = traces.length - 1; i >= 0; i--) {
    if (traces[i].kind === 'user_message') {
      lastUserIdx = i;
      break;
    }
  }
  return lastUserIdx >= 0 ? traces.slice(lastUserIdx) : traces;
};

/** Get the last turn entry from historyTurnMap. */
sidePanelProto.getLastTurnFromMap = function getLastTurnFromMap(): any | null {
  if (!this.historyTurnMap?.size) return null;
  let last: any = null;
  this.historyTurnMap.forEach((turn: any) => {
    last = turn;
  });
  return last;
};

/** Format persisted trace events into markdown — FULL data, no truncation. */
sidePanelProto.formatTraceEvents = function formatTraceEvents(events: any[]): string {
  let md = '';
  for (const ev of events) {
    const time = new Date(ev.ts).toLocaleTimeString();
    switch (ev.kind) {
      case 'user_message':
        md += `### User \`${time}\`\n\n`;
        md += `${ev.content || ''}\n\n`;
        break;

      case 'tool_start':
        md += `**\`${ev.tool}\`** `;
        if (ev.stepTitle) md += `(${ev.stepTitle}) `;
        md += `\`${time}\`\n\n`;
        if (ev.args != null) {
          const argsStr = typeof ev.args === 'string' ? ev.args : JSON.stringify(ev.args, null, 2);
          md += `<details>\n<summary>Arguments</summary>\n\n\`\`\`json\n${argsStr}\n\`\`\`\n\n</details>\n\n`;
        }
        break;

      case 'tool_result':
        md += `**\`${ev.tool}\` result** \`${time}\`\n\n`;
        if (ev.result != null) {
          const resultStr = typeof ev.result === 'string' ? ev.result : JSON.stringify(ev.result, null, 2);
          md += `<details>\n<summary>Result</summary>\n\n\`\`\`json\n${resultStr}\n\`\`\`\n\n</details>\n\n`;
        }
        break;

      case 'assistant_final':
        md += `### Assistant \`${time}\`\n\n`;
        if (ev.thinking) {
          md += `<details>\n<summary>Thinking</summary>\n\n${ev.thinking}\n\n</details>\n\n`;
        }
        md += `${ev.content || ''}\n\n`;
        if (ev.model) md += `_Model: ${ev.model}_\n`;
        if (ev.usage) {
          const u = ev.usage as any;
          if (u.inputTokens || u.outputTokens) {
            md += `_Tokens: ${u.inputTokens ?? 0} in / ${u.outputTokens ?? 0} out_\n`;
          }
        }
        md += '\n';
        break;

      case 'plan_update':
        md += `**Plan updated** \`${time}\`\n\n`;
        if (ev.plan && (ev.plan as any).steps) {
          for (const step of (ev.plan as any).steps) {
            md += `${step.status === 'done' ? '[x]' : '[ ]'} ${step.title}\n`;
          }
        }
        md += '\n';
        break;
    }
  }
  return md;
};

/** Format a single in-memory turn into markdown — full data, no truncation. */
sidePanelProto.formatTurnEvents = function formatTurnEvents(turn: any): string {
  let md = '';

  if (turn.userMessage) {
    md += `### ${turn.userMessage}\n\n`;
  }

  if (turn.plan?.steps) {
    md += '**Plan:**\n';
    for (const step of turn.plan.steps) {
      md += `${step.status === 'done' ? '[x]' : '[ ]'} ${step.title}\n`;
    }
    md += '\n';
  }

  if (turn.toolEvents?.length) {
    for (const ev of turn.toolEvents) {
      if (ev.type === 'tool_execution_start') {
        md += `**\`${ev.tool}\`**`;
        if (ev.stepTitle) md += ` (${ev.stepTitle})`;
        md += '\n\n';
        if (ev.args != null) {
          const argsStr = typeof ev.args === 'string' ? ev.args : JSON.stringify(ev.args, null, 2);
          md += `<details>\n<summary>Arguments</summary>\n\n\`\`\`json\n${argsStr}\n\`\`\`\n\n</details>\n\n`;
        }
      } else if (ev.type === 'tool_execution_result') {
        if (ev.result != null) {
          const resultStr = typeof ev.result === 'string' ? ev.result : JSON.stringify(ev.result, null, 2);
          md += `<details>\n<summary>${ev.tool} result</summary>\n\n\`\`\`json\n${resultStr}\n\`\`\`\n\n</details>\n\n`;
        }
      }
    }
  }

  if (turn.assistantFinal) {
    if (turn.assistantFinal.thinking) {
      md += `<details>\n<summary>Thinking</summary>\n\n${turn.assistantFinal.thinking}\n\n</details>\n\n`;
    }
    md += `${turn.assistantFinal.content || ''}\n\n`;
  }

  md += '---\n\n';
  return md;
};

/* ── Helpers (unchanged) ──────────────────────────────────────────────── */

sidePanelProto.getSelectedReportImagesForExport = function getSelectedReportImagesForExport() {
  if (!this.reportImages || this.reportImages.size === 0) return [];
  const order =
    Array.isArray(this.reportImageOrder) && this.reportImageOrder.length > 0
      ? this.reportImageOrder
      : Array.from(this.reportImages.keys());
  const selected = this.selectedReportImageIds instanceof Set ? this.selectedReportImageIds : new Set<string>();

  return order
    .map((id: string) => this.reportImages.get(id))
    .filter((image: any) => image && typeof image.dataUrl === 'string' && selected.has(image.id));
};

sidePanelProto.appendSelectedReportImagesMarkdown = function appendSelectedReportImagesMarkdown(
  markdown: string,
) {
  const images = this.getSelectedReportImagesForExport();
  if (!images.length) return markdown;

  let next = markdown;
  next += '\n---\n\n## Selected Report Images\n\n';
  images.forEach((image: any, index: number) => {
    const label = image.title || image.url || image.id;
    next += `### Image ${index + 1}: ${label}\n\n`;
    next += `- **ID:** ${image.id}\n`;
    next += `- **Captured:** ${new Date(Number(image.capturedAt || Date.now())).toLocaleString()}\n`;
    if (image.url) next += `- **Source URL:** ${image.url}\n`;
    if (image.visionDescription) next += `- **Vision Notes:** ${image.visionDescription}\n`;
    next += '\n';
    next += `![Report image ${index + 1}](${image.dataUrl})\n\n`;
  });
  return next;
};

sidePanelProto.extractTextContent = function extractTextContent(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          if (part.type === 'text' && part.text) return part.text;
          if (part.type === 'tool-result') {
            const output = part.output;
            if (output && typeof output === 'object') {
              if (output.type === 'text' && output.value) return output.value;
              if (output.type === 'json') return JSON.stringify(output.value, null, 2);
              return JSON.stringify(output, null, 2);
            }
            return String(output || '');
          }
          return part.text || part.content || '';
        }
        return '';
      })
      .join('\n');
  }
  return String(content);
};

sidePanelProto.downloadFile = function downloadFile(
  content: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();

  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
};

sidePanelProto.downloadMarkdown = function downloadMarkdown(content: string, filename: string): void {
  this.downloadFile(content, filename, 'text/markdown');
  this.updateStatus(`Exported to ${filename}`, 'success');
};

/* ── Auto-save session as JSONL ─────────────────────────────────────── */

sidePanelProto.autoSaveSessionJsonl = async function autoSaveSessionJsonl(): Promise<void> {
  // Guard: check setting and session content
  let autoSaveEnabled = false;
  try {
    const stored = await chrome.storage.local.get('autoSaveSession');
    autoSaveEnabled = stored.autoSaveSession === true || stored.autoSaveSession === 'true';
  } catch {
    /* ignore */
  }
  if (!autoSaveEnabled) return;
  if (!this.displayHistory || this.displayHistory.length === 0) return;

  const lines: string[] = [];

  // Line 1: session metadata
  const meta = {
    kind: 'session_meta',
    sessionId: this.sessionId || '',
    startedAt: this.sessionStartedAt || Date.now(),
    endedAt: Date.now(),
    title: this.firstUserMessage || '',
    tokenTotals: this.sessionTokenTotals || {},
    messageCount: this.displayHistory.length,
  };
  lines.push(JSON.stringify(meta));

  // Lines 2+: traces from IndexedDB, or fallback to displayHistory
  let traces: any[] = [];
  try {
    traces = await getSessionTraces(this.sessionId);
  } catch {
    /* ignore */
  }

  if (traces.length > 0) {
    for (const ev of traces) {
      lines.push(JSON.stringify(ev));
    }
  } else {
    for (const msg of this.displayHistory) {
      const entry: Record<string, any> = {
        kind: 'display_message',
        role: msg.role || '',
        content: typeof msg.content === 'string' ? msg.content : this.extractTextContent(msg.content),
      };
      if (msg.thinking) entry.thinking = msg.thinking;
      if (msg.meta) entry.meta = msg.meta;
      lines.push(JSON.stringify(entry));
    }
  }

  // Append selected report images
  const selectedImages = this.getSelectedReportImagesForExport?.() || [];
  for (const img of selectedImages) {
    lines.push(
      JSON.stringify({
        kind: 'report_image',
        id: img.id,
        capturedAt: img.capturedAt,
        url: img.url || '',
        title: img.title || '',
        dataUrl: img.dataUrl || '',
      }),
    );
  }

  const content = lines.join('\n') + '\n';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `session-${timestamp}.jsonl`;

  // Try File System Access API directory handle first
  if (this._autoSaveDirHandle) {
    try {
      const fileHandle = await this._autoSaveDirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      this.updateStatus?.(`Session auto-saved to ${filename}`, 'success');
      return;
    } catch {
      // Fall through to anchor download
    }
  }

  // Fallback: anchor-click download
  this.downloadFile(content, filename, 'application/x-ndjson');
  this.updateStatus?.(`Session auto-saved to ${filename}`, 'success');
};
