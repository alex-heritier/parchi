import { sidePanelProto } from './panel-export-shared.js';
import { getSessionTraces } from './trace-store.js';

sidePanelProto.buildActionsMarkdown = async function buildActionsMarkdown(scope: 'all' | 'last'): Promise<string> {
  let md = '---\n\n## Tool Actions\n\n';
  let traces: unknown[] = [];
  try {
    traces = await getSessionTraces(this.sessionId);
  } catch {
    // Fall back to in-memory historyTurnMap
  }

  if (traces.length > 0) {
    const events = scope === 'last' ? this.getLastTurnTraces(traces) : traces;
    md += this.formatTraceEvents(events);
  } else if (this.historyTurnMap?.size > 0) {
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

sidePanelProto.getLastTurnTraces = function getLastTurnTraces(traces: unknown[]): unknown[] {
  const events = traces as Array<{ kind?: unknown }>;
  let lastUserIdx = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i]?.kind === 'user_message') {
      lastUserIdx = i;
      break;
    }
  }
  return lastUserIdx >= 0 ? traces.slice(lastUserIdx) : traces;
};

sidePanelProto.getLastTurnFromMap = function getLastTurnFromMap(): unknown | null {
  if (!this.historyTurnMap?.size) return null;
  let last: unknown = null;
  this.historyTurnMap.forEach((turn: unknown) => {
    last = turn;
  });
  return last;
};

sidePanelProto.formatTraceEvents = function formatTraceEvents(events: unknown[]): string {
  let md = '';
  for (const raw of events) {
    const ev = raw as any;
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
          const usage = ev.usage as Record<string, unknown>;
          if (usage.inputTokens || usage.outputTokens) {
            md += `_Tokens: ${usage.inputTokens ?? 0} in / ${usage.outputTokens ?? 0} out_\n`;
          }
        }
        md += '\n';
        break;
      case 'plan_update': {
        md += `**Plan updated** \`${time}\`\n\n`;
        const planSteps = (ev.plan as { steps?: unknown } | null | undefined)?.steps;
        if (Array.isArray(planSteps)) {
          for (const step of planSteps as Array<{ status?: unknown; title?: unknown }>) {
            md += `${step.status === 'done' ? '[x]' : '[ ]'} ${step.title}\n`;
          }
        }
        md += '\n';
        break;
      }
      case 'compaction_event':
        md += `### Compaction event${ev.stage ? `: ${ev.stage}` : ''} \`${time}\`\n\n`;
        if (ev.note) md += `${ev.note}\n\n`;
        if (ev.details != null) {
          const detailsStr = typeof ev.details === 'string' ? ev.details : JSON.stringify(ev.details, null, 2);
          md += `<details>\n<summary>Details</summary>\n\n\`\`\`json\n${detailsStr}\n\`\`\`\n\n</details>\n\n`;
        }
        break;
    }
  }
  return md;
};

sidePanelProto.formatTurnEvents = function formatTurnEvents(turn: unknown): string {
  let md = '';
  const t = turn as any;

  if (t.userMessage) {
    md += `### ${t.userMessage}\n\n`;
  }
  if (t.plan?.steps) {
    md += '**Plan:**\n';
    for (const step of t.plan.steps) {
      md += `${step.status === 'done' ? '[x]' : '[ ]'} ${step.title}\n`;
    }
    md += '\n';
  }
  if (t.toolEvents?.length) {
    for (const ev of t.toolEvents) {
      if (ev.type === 'tool_execution_start') {
        md += `**\`${ev.tool}\`**`;
        if (ev.stepTitle) md += ` (${ev.stepTitle})`;
        md += '\n\n';
        if (ev.args != null) {
          const argsStr = typeof ev.args === 'string' ? ev.args : JSON.stringify(ev.args, null, 2);
          md += `<details>\n<summary>Arguments</summary>\n\n\`\`\`json\n${argsStr}\n\`\`\`\n\n</details>\n\n`;
        }
      } else if (ev.type === 'tool_execution_result' && ev.result != null) {
        const resultStr = typeof ev.result === 'string' ? ev.result : JSON.stringify(ev.result, null, 2);
        md += `<details>\n<summary>${ev.tool} result</summary>\n\n\`\`\`json\n${resultStr}\n\`\`\`\n\n</details>\n\n`;
      }
    }
  }
  if (t.assistantFinal) {
    if (t.assistantFinal.thinking) {
      md += `<details>\n<summary>Thinking</summary>\n\n${t.assistantFinal.thinking}\n\n</details>\n\n`;
    }
    md += `${t.assistantFinal.content || ''}\n\n`;
  }
  md += '---\n\n';
  return md;
};
