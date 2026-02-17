import { SidePanelUI } from '../core/panel-ui.js';

type Workflow = { id: string; name: string; prompt: string; createdAt: number };

// Rough chars-per-token ratio (conservative; real tokenizers vary).
const CHARS_PER_TOKEN = 3.5;
const MAX_CONTEXT_TOKENS = 100_000;
const MAX_CONTEXT_CHARS = MAX_CONTEXT_TOKENS * CHARS_PER_TOKEN;

// ──────────────────────────────────────────────────────────────────────
// CRUD
// ──────────────────────────────────────────────────────────────────────

(SidePanelUI.prototype as any).loadWorkflows = async function loadWorkflows(): Promise<void> {
  try {
    const data = await chrome.storage.local.get('workflows');
    this.workflows = Array.isArray(data.workflows) ? data.workflows : [];
  } catch {
    this.workflows = [];
  }
};

(SidePanelUI.prototype as any).saveWorkflow = async function saveWorkflow(
  name: string,
  prompt: string,
): Promise<void> {
  const workflow: Workflow = {
    id: crypto.randomUUID(),
    name: name.trim(),
    prompt,
    createdAt: Date.now(),
  };
  this.workflows.push(workflow);
  await chrome.storage.local.set({ workflows: this.workflows });
};

(SidePanelUI.prototype as any).deleteWorkflow = async function deleteWorkflow(id: string): Promise<void> {
  this.workflows = this.workflows.filter((w: Workflow) => w.id !== id);
  await chrome.storage.local.set({ workflows: this.workflows });
};

// ──────────────────────────────────────────────────────────────────────
// Menu rendering
// ──────────────────────────────────────────────────────────────────────

(SidePanelUI.prototype as any).showWorkflowMenu = function showWorkflowMenu(filter: string): void {
  let menu = document.getElementById('workflowMenu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'workflowMenu';
    menu.className = 'workflow-menu';
    document.body.appendChild(menu);
  }

  const composerEl = this.elements.composer as HTMLElement | null;
  if (composerEl) {
    const rect = composerEl.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.bottom = `${window.innerHeight - rect.top + 6}px`;
    menu.style.left = `${rect.left}px`;
    menu.style.width = `${rect.width}px`;
  }

  const query = filter.toLowerCase();
  const filtered: Workflow[] = query
    ? this.workflows.filter((w: Workflow) => w.name.toLowerCase().includes(query))
    : this.workflows;

  if (this.workflowMenuIndex >= filtered.length) this.workflowMenuIndex = filtered.length - 1;
  if (this.workflowMenuIndex < 0 && filtered.length > 0) this.workflowMenuIndex = 0;

  let listHtml = '';
  if (filtered.length === 0 && this.workflows.length === 0) {
    listHtml = '<div class="workflow-empty">No workflows yet. Type a prompt, then use <strong>/</strong> to save it.</div>';
  } else if (filtered.length === 0) {
    listHtml = '<div class="workflow-empty">No matching workflows</div>';
  } else {
    filtered.forEach((w: Workflow, i: number) => {
      const active = i === this.workflowMenuIndex ? ' active' : '';
      const preview = w.prompt.length > 50 ? w.prompt.slice(0, 50) + '\u2026' : w.prompt;
      listHtml += `<div class="workflow-item${active}" data-workflow-id="${w.id}">
        <div class="workflow-item-text">
          <span class="workflow-item-name">/${w.name}</span>
          <span class="workflow-item-preview">${escapeHtml(preview)}</span>
        </div>
        <button class="workflow-item-delete" data-delete-id="${w.id}" title="Delete">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>`;
    });
  }

  menu.innerHTML = `
    <div class="workflow-menu-list">${listHtml}</div>
    <div class="workflow-save-row" id="workflowSaveRow">
      <button class="workflow-save-btn" id="workflowSaveBtn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14"></path>
        </svg>
        Save as workflow\u2026
      </button>
    </div>
  `;
  this.workflowMenuOpen = true;

  // Bind list items
  menu.querySelectorAll('.workflow-item').forEach((item: Element) => {
    item.addEventListener('click', (e: Event) => {
      const deleteBtn = (e.target as HTMLElement).closest('.workflow-item-delete');
      if (deleteBtn) {
        e.stopPropagation();
        const deleteId = (deleteBtn as HTMLElement).dataset.deleteId;
        if (deleteId) {
          this.deleteWorkflow(deleteId).then(() => {
            const input = this.elements.userInput?.value || '';
            this.showWorkflowMenu(input.startsWith('/') ? input.slice(1) : '');
          });
        }
        return;
      }
      const id = (item as HTMLElement).dataset.workflowId;
      const wf = this.workflows.find((w: Workflow) => w.id === id);
      if (wf) this.selectWorkflow(wf);
    });
  });

  menu.querySelector('#workflowSaveBtn')?.addEventListener('click', () => this.showWorkflowSaveInput());

  // Outside-click dismissal
  this._workflowOutsideHandler = this._workflowOutsideHandler || ((e: MouseEvent) => {
    const menuEl = document.getElementById('workflowMenu');
    const inputEl = this.elements.userInput;
    if (menuEl && !menuEl.contains(e.target as Node) && e.target !== inputEl) {
      this.hideWorkflowMenu();
    }
  });
  document.removeEventListener('mousedown', this._workflowOutsideHandler);
  document.addEventListener('mousedown', this._workflowOutsideHandler);
};

// ──────────────────────────────────────────────────────────────────────
// Session context builder — collect the richest possible transcript
// ──────────────────────────────────────────────────────────────────────

(SidePanelUI.prototype as any).buildSessionContext = function buildSessionContext(): string {
  const sections: string[] = [];

  // --- 1. Display history (user + assistant messages) -----------------
  if (this.displayHistory?.length) {
    for (const entry of this.displayHistory) {
      const text = this.extractTextContent?.(entry.content) || String(entry.content || '');
      if (!text.trim()) continue;
      if (entry.role === 'user') {
        sections.push(`[User]: ${text}`);
      } else if (entry.role === 'assistant') {
        if (entry.thinking) sections.push(`[Assistant thinking]: ${entry.thinking}`);
        sections.push(`[Assistant]: ${text}`);
      } else if (entry.role === 'system' && entry.meta?.kind === 'summary') {
        sections.push(`[Context summary]: ${text}`);
      }
    }
  }

  // --- 2. Turn-level detail (tool events, plans) ----------------------
  if (this.historyTurnMap?.size) {
    sections.push('\n=== DETAILED TURN LOG ===');
    this.historyTurnMap.forEach((turn: any, turnId: string) => {
      sections.push(`\n--- Turn ${turnId} ---`);
      if (turn.userMessage) sections.push(`[User]: ${turn.userMessage}`);

      if (turn.plan?.steps?.length) {
        const planLines = turn.plan.steps.map(
          (s: any) => `  ${s.status === 'done' ? '[x]' : '[ ]'} ${s.title}`,
        );
        sections.push(`[Plan]:\n${planLines.join('\n')}`);
      }

      if (turn.toolEvents?.length) {
        for (const ev of turn.toolEvents) {
          if (ev.type === 'tool_execution_start') {
            const argsStr = ev.args ? JSON.stringify(ev.args) : '';
            sections.push(`[Tool call] ${ev.tool}(${argsStr})`);
          } else if (ev.type === 'tool_execution_result') {
            const resultStr = ev.result != null ? JSON.stringify(ev.result) : '';
            // Truncate very large results to save context budget
            const truncated = resultStr.length > 2000
              ? resultStr.slice(0, 2000) + '...(truncated)'
              : resultStr;
            sections.push(`[Tool result] ${ev.tool}: ${truncated}`);
          }
        }
      }

      if (turn.assistantFinal) {
        if (turn.assistantFinal.thinking) {
          sections.push(`[Assistant thinking]: ${turn.assistantFinal.thinking}`);
        }
        if (turn.assistantFinal.content) {
          sections.push(`[Assistant]: ${turn.assistantFinal.content}`);
        }
      }
    });
  }

  // --- 3. Current plan ------------------------------------------------
  if (this.currentPlan?.steps?.length) {
    const planLines = this.currentPlan.steps.map(
      (s: any) => `  ${s.status === 'done' ? '[x]' : '[ ]'} ${s.title}`,
    );
    sections.push(`\n=== CURRENT PLAN ===\n${planLines.join('\n')}`);
  }

  // --- 4. Context history (the raw message array sent to the model) ---
  // This often contains richer detail than displayHistory (tool results, etc.)
  if (this.contextHistory?.length) {
    sections.push('\n=== RAW CONTEXT MESSAGES ===');
    for (const msg of this.contextHistory) {
      const text = this.extractTextContent?.(msg.content) || String(msg.content || '');
      if (!text.trim()) continue;
      sections.push(`[${msg.role}]: ${text}`);
      if (msg.thinking) sections.push(`[thinking]: ${msg.thinking}`);
      if (Array.isArray(msg.toolCalls) && msg.toolCalls.length) {
        for (const tc of msg.toolCalls) {
          sections.push(`[tool_call] ${tc.name}(${JSON.stringify(tc.args || {})})`);
        }
      }
    }
  }

  let full = sections.join('\n\n');

  // Trim to fit within the token budget. Priority: keep the beginning
  // (initial request) and the end (most recent context). If we need to
  // trim, cut from the middle.
  if (full.length > MAX_CONTEXT_CHARS) {
    const headBudget = Math.floor(MAX_CONTEXT_CHARS * 0.35);
    const tailBudget = Math.floor(MAX_CONTEXT_CHARS * 0.60);
    const head = full.slice(0, headBudget);
    const tail = full.slice(full.length - tailBudget);
    full = head + '\n\n[...middle of session omitted for brevity...]\n\n' + tail;
  }

  return full;
};

// ──────────────────────────────────────────────────────────────────────
// AI-powered workflow generation
// ──────────────────────────────────────────────────────────────────────

(SidePanelUI.prototype as any).generateWorkflowFromSession = async function generateWorkflowFromSession(): Promise<{
  name: string;
  prompt: string;
} | null> {
  const context = this.buildSessionContext();
  if (!context.trim()) return null;

  const response = await chrome.runtime.sendMessage({
    type: 'generate_workflow',
    sessionContext: context,
    maxOutputTokens: 4096,
  });

  if (!response?.success || !response.result?.prompt) {
    const err = response?.result?.error || response?.error || 'Generation failed';
    throw new Error(err);
  }

  // Derive a suggested name from the first user message
  const firstUser = (this.displayHistory || []).find((m: any) => m.role === 'user');
  const firstText = firstUser
    ? (this.extractTextContent?.(firstUser.content) || '').toLowerCase().replace(/[^a-z0-9\s]/g, '')
    : '';
  const words = firstText.split(/\s+/).filter(Boolean).slice(0, 3);
  const suggestedName = words.join('-') || 'workflow';

  return { name: suggestedName, prompt: response.result.prompt };
};

// ──────────────────────────────────────────────────────────────────────
// Save form UI
// ──────────────────────────────────────────────────────────────────────

(SidePanelUI.prototype as any).showWorkflowSaveInput = function showWorkflowSaveInput(): void {
  const saveRow = document.getElementById('workflowSaveRow');
  if (!saveRow) return;

  const hasSession = (this.displayHistory?.length > 0) || (this.historyTurnMap?.size > 0);

  saveRow.innerHTML = `
    <div class="workflow-save-form">
      <input type="text" class="workflow-save-input" id="workflowNameInput"
        placeholder="Name (e.g. summarize)" autocomplete="off" spellcheck="false" />
      <textarea class="workflow-save-prompt" id="workflowPromptInput" rows="3"
        placeholder="Prompt text to insert\u2026"></textarea>
      <div class="workflow-save-actions">
        ${hasSession ? `<button class="workflow-generate-btn" id="workflowGenerateBtn" title="Use AI to generate a workflow from this session">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
          </svg>
          Generate from session
        </button>` : ''}
        <div class="workflow-save-actions-right">
          <button class="workflow-save-cancel" id="workflowSaveCancel">Cancel</button>
          <button class="workflow-save-confirm" id="workflowSaveConfirm">Save</button>
        </div>
      </div>
    </div>
  `;

  const nameInput = document.getElementById('workflowNameInput') as HTMLInputElement;
  const promptInput = document.getElementById('workflowPromptInput') as HTMLTextAreaElement;
  const resizePromptInput = () => {
    if (!promptInput) return;
    const maxHeight = 500;
    promptInput.style.height = 'auto';
    const nextHeight = Math.min(promptInput.scrollHeight, maxHeight);
    promptInput.style.height = `${nextHeight}px`;
    promptInput.style.overflowY = promptInput.scrollHeight > maxHeight ? 'auto' : 'hidden';
  };

  const composerValue = this.elements.userInput?.value || '';
  if (composerValue && !composerValue.startsWith('/')) {
    promptInput.value = composerValue;
  }
  resizePromptInput();
  promptInput?.addEventListener('input', resizePromptInput);

  nameInput?.focus();

  const repositionMenu = () => {
    requestAnimationFrame(() => {
      const composerEl = this.elements.composer as HTMLElement | null;
      const menu = document.getElementById('workflowMenu');
      if (composerEl && menu) {
        const rect = composerEl.getBoundingClientRect();
        menu.style.bottom = `${window.innerHeight - rect.top + 6}px`;
      }
    });
  };

  const doSave = () => {
    const name = nameInput?.value?.trim();
    const prompt = promptInput?.value?.trim();
    if (!name) { nameInput?.focus(); return; }
    if (!prompt) { promptInput?.focus(); return; }
    this.saveWorkflow(name, prompt).then(() => {
      this.hideWorkflowMenu();
      const userInput = this.elements.userInput;
      if (userInput && userInput.value.startsWith('/')) {
        userInput.value = '';
        userInput.style.height = 'auto';
      }
      this.updateStatus(`Workflow "/${name}" saved`, 'success');
    });
  };

  // --- Generate from session (AI call) --------------------------------
  const generateBtn = document.getElementById('workflowGenerateBtn');
  generateBtn?.addEventListener('click', async () => {
    // Show loading state
    generateBtn.classList.add('loading');
    generateBtn.setAttribute('disabled', 'true');
    const origText = generateBtn.innerHTML;
    generateBtn.innerHTML = `<svg class="workflow-spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>Generating\u2026`;
    this.updateStatus('Generating workflow from session\u2026', 'active');

    try {
      const generated = await this.generateWorkflowFromSession();
      if (generated) {
        if (!nameInput.value.trim()) nameInput.value = generated.name;
        promptInput.value = generated.prompt;
        promptInput.style.height = 'auto';
        promptInput.style.height = `${Math.min(promptInput.scrollHeight, 300)}px`;
        this.updateStatus('Workflow generated', 'success');
      } else {
        this.updateStatus('No session data to generate from', 'warning');
      }
    } catch (err: any) {
      this.updateStatus(`Generation failed: ${err?.message || err}`, 'error');
    } finally {
      generateBtn.innerHTML = origText;
      generateBtn.classList.remove('loading');
      generateBtn.removeAttribute('disabled');
      repositionMenu();
    }
  });

  // --- Key handlers ---------------------------------------------------
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); this.hideWorkflowMenu(); }
  };
  nameInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    handleKey(e);
    if (e.key === 'Enter') { e.preventDefault(); promptInput?.focus(); }
  });
  promptInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    handleKey(e);
    if (e.key === 'Enter' && e.metaKey) { e.preventDefault(); doSave(); }
  });

  document.getElementById('workflowSaveCancel')?.addEventListener('click', () => this.hideWorkflowMenu());
  document.getElementById('workflowSaveConfirm')?.addEventListener('click', doSave);

  repositionMenu();
};

// ──────────────────────────────────────────────────────────────────────
// Hide / navigation / helpers
// ──────────────────────────────────────────────────────────────────────

(SidePanelUI.prototype as any).hideWorkflowMenu = function hideWorkflowMenu(): void {
  const menu = document.getElementById('workflowMenu');
  menu?.remove();
  this.workflowMenuOpen = false;
  this.workflowMenuIndex = -1;
  if (this._workflowOutsideHandler) {
    document.removeEventListener('mousedown', this._workflowOutsideHandler);
  }
};

(SidePanelUI.prototype as any).handleWorkflowInput = function handleWorkflowInput(): void {
  const userInput = this.elements.userInput;
  if (!userInput) return;
  const value = userInput.value;
  if (value.startsWith('/')) {
    this.showWorkflowMenu(value.slice(1));
  } else if (this.workflowMenuOpen) {
    this.hideWorkflowMenu();
  }
};

(SidePanelUI.prototype as any).selectWorkflow = function selectWorkflow(workflow: Workflow): void {
  const userInput = this.elements.userInput;
  if (!userInput) return;
  const computedMaxHeight = Number.parseFloat(getComputedStyle(userInput).maxHeight);
  const maxHeight = Number.isFinite(computedMaxHeight) && computedMaxHeight > 0 ? computedMaxHeight : 280;
  userInput.value = workflow.prompt;
  userInput.style.height = 'auto';
  const nextHeight = Math.min(userInput.scrollHeight, maxHeight);
  userInput.style.height = `${nextHeight}px`;
  userInput.style.overflowY = userInput.scrollHeight > maxHeight ? 'auto' : 'hidden';
  userInput.focus();
  this.hideWorkflowMenu();
};

(SidePanelUI.prototype as any).handleWorkflowKeydown = function handleWorkflowKeydown(
  event: KeyboardEvent,
): boolean {
  if (!this.workflowMenuOpen) return false;

  const active = document.activeElement;
  if (active && (active.id === 'workflowNameInput' || active.id === 'workflowPromptInput')) {
    return false;
  }

  const menu = document.getElementById('workflowMenu');
  if (!menu) return false;
  const items = menu.querySelectorAll('.workflow-item');
  const count = items.length;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    this.workflowMenuIndex = count > 0 ? (this.workflowMenuIndex + 1) % count : -1;
    this.updateWorkflowMenuHighlight(items);
    return true;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    this.workflowMenuIndex = count > 0 ? (this.workflowMenuIndex - 1 + count) % count : -1;
    this.updateWorkflowMenuHighlight(items);
    return true;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    if (this.workflowMenuIndex >= 0 && this.workflowMenuIndex < count) {
      const id = (items[this.workflowMenuIndex] as HTMLElement).dataset.workflowId;
      const wf = this.workflows.find((w: Workflow) => w.id === id);
      if (wf) this.selectWorkflow(wf);
    }
    return true;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    this.hideWorkflowMenu();
    return true;
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    if (this.workflowMenuIndex >= 0 && this.workflowMenuIndex < count) {
      const id = (items[this.workflowMenuIndex] as HTMLElement).dataset.workflowId;
      const wf = this.workflows.find((w: Workflow) => w.id === id);
      if (wf) this.selectWorkflow(wf);
    }
    return true;
  }
  return false;
};

(SidePanelUI.prototype as any).updateWorkflowMenuHighlight = function updateWorkflowMenuHighlight(
  items: NodeListOf<Element>,
): void {
  items.forEach((item, i) => {
    if (i === this.workflowMenuIndex) {
      item.classList.add('active');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('active');
    }
  });
};

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
