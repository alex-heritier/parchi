import { SidePanelUI } from '../core/panel-ui.js';

const sidePanelProto = SidePanelUI.prototype as SidePanelUI & Record<string, unknown>;

/**
 * Add a new subagent to the tracking map and render its UI.
 */
sidePanelProto.addSubagent = function addSubagent(id: string, name: string, tasks: unknown) {
  this.subagents.set(id, {
    name: name || `Sub-${this.subagents.size + 1}`,
    tasks: Array.isArray(tasks) ? tasks : [tasks || 'Task'],
    status: 'running',
    messages: [],
    startedAt: Date.now(),
    completedAt: undefined,
    summary: undefined,
  });
  this.renderAgentNav();
  this.renderSubagentActivity(id, 'start', { name, tasks });
};

/**
 * Update the status of a subagent and render completion.
 */
sidePanelProto.updateSubagentStatus = function updateSubagentStatus(id: string, status: string, summary?: string) {
  const agent = this.subagents.get(id);
  if (agent) {
    agent.status = status;
    if (status === 'completed' || status === 'error') {
      agent.completedAt = Date.now();
      agent.summary = summary || undefined;
    }
    this.renderAgentNav();
    this.renderSubagentActivity(id, status === 'completed' ? 'complete' : status, { summary });
  }
};

/**
 * Render the agent navigation bar at the top of chat.
 */
sidePanelProto.renderAgentNav = function renderAgentNav() {
  if (!this.elements.agentNav) return;

  if (this.subagents.size === 0) {
    this.hideAgentNav();
    return;
  }

  this.elements.agentNav.classList.remove('hidden');

  let html = `
      <div class="agent-nav-item main-agent ${this.activeAgent === 'main' ? 'active' : ''}" data-agent="main">
        <span class="agent-status"></span>
        <span>Main</span>
      </div>
    `;

  this.subagents.forEach((agent, id: string) => {
    const statusClass = agent.status === 'running' ? 'running' : agent.status === 'completed' ? 'completed' : 'error';
    const statusIcon = agent.status === 'running' ? '⏳' : agent.status === 'completed' ? '✓' : '✗';
    html += `
        <div class="agent-nav-item sub-agent ${statusClass} ${this.activeAgent === id ? 'active' : ''}" data-agent="${id}" title="${agent.name}: ${agent.status}">
          <span class="agent-status">${statusIcon}</span>
          <span>${agent.name}</span>
        </div>
      `;
  });

  this.elements.agentNav.innerHTML = html;

  this.elements.agentNav.querySelectorAll('.agent-nav-item').forEach((item: Element) => {
    item.addEventListener('click', () => {
      const agentId = (item as HTMLElement).dataset.agent;
      this.switchAgent(agentId);
    });
  });
};

/**
 * Switch the active agent view.
 */
sidePanelProto.switchAgent = function switchAgent(agentId: string) {
  this.activeAgent = agentId;
  this.renderAgentNav();

  // If switching to a subagent, highlight its activity in the chat
  if (agentId !== 'main') {
    const agent = this.subagents.get(agentId);
    if (agent) {
      this.highlightSubagentMessages(agentId);
    }
  }
};

/**
 * Hide the agent navigation bar.
 */
sidePanelProto.hideAgentNav = function hideAgentNav() {
  if (this.elements.agentNav) {
    this.elements.agentNav.classList.add('hidden');
  }
};

/**
 * Render subagent activity inline in the chat.
 * Creates a visual block showing subagent start/progress/completion.
 */
sidePanelProto.renderSubagentActivity = function renderSubagentActivity(
  subagentId: string,
  event: 'start' | 'progress' | 'complete' | 'error',
  data?: { name?: string; tasks?: string[]; summary?: string; error?: string },
) {
  const agent = this.subagents.get(subagentId);
  if (!agent) return;

  // Find or create the subagent activity container in the streaming message
  if (!this.streamingState?.eventsEl) return;

  // Look for existing subagent block
  let container = this.streamingState.eventsEl.querySelector(
    `.subagent-block[data-subagent-id="${subagentId}"]`,
  ) as HTMLElement | null;

  if (!container) {
    container = document.createElement('div');
    container.className = 'subagent-block';
    container.dataset.subagentId = subagentId;
    this.streamingState.eventsEl.appendChild(container);
  }

  const icon =
    event === 'start'
      ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
      : event === 'complete'
        ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
        : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';

  const statusClass = event === 'start' ? 'running' : event === 'complete' ? 'completed' : 'error';

  container.className = `subagent-block ${statusClass}`;

  let html = `
    <div class="subagent-header">
      <span class="subagent-icon">${icon}</span>
      <span class="subagent-name">${this.escapeHtml(agent.name)}</span>
      <span class="subagent-status">${event === 'start' ? 'Running...' : event === 'complete' ? 'Completed' : 'Failed'}</span>
    </div>
  `;

  if (agent.tasks && agent.tasks.length > 0) {
    html += `<div class="subagent-tasks">`;
    for (const task of agent.tasks) {
      html += `<div class="subagent-task">• ${this.escapeHtml(task)}</div>`;
    }
    html += '</div>';
  }

  if (data?.summary || agent.summary) {
    const summaryText = data?.summary || agent.summary || '';
    html += `
      <div class="subagent-summary">
        <div class="subagent-summary-label">Summary</div>
        <div class="subagent-summary-content">${this.renderMarkdown(summaryText)}</div>
      </div>
    `;
  }

  if (data?.error) {
    html += `<div class="subagent-error">${this.escapeHtml(data.error)}</div>`;
  }

  container.innerHTML = html;
  this.scrollToBottom();
};

/**
 * Highlight messages from a specific subagent in the chat.
 */
sidePanelProto.highlightSubagentMessages = function highlightSubagentMessages(subagentId: string) {
  // Remove existing highlights
  this.elements.chatMessages?.querySelectorAll('.subagent-highlight').forEach((el) => {
    el.classList.remove('subagent-highlight');
  });

  // Add highlight to this subagent's blocks
  this.elements.chatMessages?.querySelectorAll(`.subagent-block[data-subagent-id="${subagentId}"]`).forEach((el) => {
    el.classList.add('subagent-highlight');
  });

  // Scroll to the first one
  const first = this.elements.chatMessages?.querySelector(`.subagent-block[data-subagent-id="${subagentId}"]`);
  if (first) {
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
};

/**
 * Get a summary of all subagent activity for display.
 */
sidePanelProto.getSubagentSummary = function getSubagentSummary(): string {
  if (!this.subagents || this.subagents.size === 0) return '';

  const parts: string[] = [];
  this.subagents.forEach((agent) => {
    const status = agent.status === 'running' ? 'running' : agent.status;
    parts.push(`${agent.name} (${status})`);
  });

  return parts.join(', ');
};
