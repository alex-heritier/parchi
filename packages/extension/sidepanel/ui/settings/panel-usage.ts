import { SidePanelUI } from '../core/panel-ui.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const USAGE_FETCH_TIMEOUT_MS = 12000;

type UsageModelEntry = {
  model: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timerId: number | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timerId = window.setTimeout(() => reject(new Error('Timed out')), timeoutMs);
      }),
    ]);
  } finally {
    if (timerId !== null) window.clearTimeout(timerId);
  }
};

const formatCost = (cents: number) => {
  if (cents === 0) return '$0.00';
  if (cents < 1) return `$${cents.toFixed(4)}`;
  return `$${cents.toFixed(2)}`;
};

const formatTokens = (count: number) => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
};

const setUsageStatus = (text: string) => {
  const el = document.getElementById('usageStatusText');
  if (el) el.textContent = text;
};

(SidePanelUI.prototype as any).refreshUsageTab = async function refreshUsageTab() {
  setUsageStatus('Loading usage data...');

  // Find an OpenRouter/Parchi API key from configs
  let apiKey = '';
  const configs = this.configs && typeof this.configs === 'object' ? this.configs : {};
  for (const profile of Object.values(configs)) {
    if (!profile || typeof profile !== 'object') continue;
    const provider = String((profile as any).provider || '').trim().toLowerCase();
    if (provider === 'openrouter' || provider === 'parchi') {
      const key = String((profile as any).apiKey || '').trim();
      if (key) {
        apiKey = key;
        break;
      }
    }
  }

  // Managed keys don't have direct OpenRouter API access for usage
  // Only BYOK OpenRouter keys can query /auth/key

  if (!apiKey) {
    // Try to show local session stats instead
    this.renderLocalUsageStats();
    setUsageStatus('No OpenRouter API key found. Showing local session stats only.');
    return;
  }

  try {
    // Fetch from OpenRouter /auth/key endpoint (returns usage and rate limit info)
    const keyInfoResponse = await withTimeout(
      fetch(`${OPENROUTER_BASE_URL}/auth/key`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://parchi.ai',
          'X-Title': 'Parchi',
        },
      }),
      USAGE_FETCH_TIMEOUT_MS,
    );

    if (!keyInfoResponse.ok) {
      throw new Error(`OpenRouter returned ${keyInfoResponse.status}`);
    }

    const keyInfo = await keyInfoResponse.json();
    const data = keyInfo?.data || keyInfo;

    // Update summary
    const totalCost = Number(data?.usage || 0);
    const limit = Number(data?.limit || 0);
    const rateLimitRequests = Number(data?.rate_limit?.requests || 0);

    const totalCostEl = document.getElementById('usageTotalCost');
    const totalReqEl = document.getElementById('usageTotalRequests');
    const periodEl = document.getElementById('usagePeriodText');

    if (totalCostEl) totalCostEl.textContent = formatCost(totalCost);
    if (totalReqEl) totalReqEl.textContent = String(rateLimitRequests || '--');
    if (periodEl) {
      if (limit > 0) {
        periodEl.textContent = `Limit: ${formatCost(limit)}`;
      } else {
        periodEl.textContent = 'Current period';
      }
    }

    // Now try to fetch activity/generation stats
    await this.fetchOpenRouterActivity(apiKey);

    setUsageStatus(`Last refreshed: ${new Date().toLocaleTimeString()}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setUsageStatus(`Failed to fetch usage: ${message}`);
    this.renderLocalUsageStats();
  }
};

(SidePanelUI.prototype as any).fetchOpenRouterActivity = async function fetchOpenRouterActivity(apiKey: string) {
  try {
    const response = await withTimeout(
      fetch(`${OPENROUTER_BASE_URL}/activity`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://parchi.ai',
          'X-Title': 'Parchi',
        },
      }),
      USAGE_FETCH_TIMEOUT_MS,
    );

    if (!response.ok) {
      // Activity endpoint may not be available, show local stats
      this.renderLocalUsageStats();
      return;
    }

    const result = await response.json();
    const activities = Array.isArray(result?.data) ? result.data : [];

    // Aggregate by model
    const modelMap = new Map<string, UsageModelEntry>();
    let totalTokens = 0;
    let totalCost = 0;
    let totalRequests = 0;

    for (const activity of activities) {
      const model = String(activity?.model || activity?.model_id || 'unknown');
      const promptTokens = Number(activity?.native_tokens_prompt || activity?.tokens_prompt || 0);
      const completionTokens = Number(activity?.native_tokens_completion || activity?.tokens_completion || 0);
      const cost = Number(activity?.total_cost || 0);

      const existing = modelMap.get(model);
      if (existing) {
        existing.requests += 1;
        existing.promptTokens += promptTokens;
        existing.completionTokens += completionTokens;
        existing.totalTokens += promptTokens + completionTokens;
        existing.cost += cost;
      } else {
        modelMap.set(model, {
          model,
          requests: 1,
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          cost,
        });
      }

      totalTokens += promptTokens + completionTokens;
      totalCost += cost;
      totalRequests += 1;
    }

    // Update summary grid
    const totalCostEl = document.getElementById('usageTotalCost');
    const totalReqEl = document.getElementById('usageTotalRequests');
    const totalTokensEl = document.getElementById('usageTotalTokens');

    if (totalCostEl && totalCost > 0) totalCostEl.textContent = formatCost(totalCost);
    if (totalReqEl) totalReqEl.textContent = String(totalRequests);
    if (totalTokensEl) totalTokensEl.textContent = formatTokens(totalTokens);

    // Render table
    this.renderUsageTable(Array.from(modelMap.values()));
  } catch {
    this.renderLocalUsageStats();
  }
};

(SidePanelUI.prototype as any).renderUsageTable = function renderUsageTable(entries: UsageModelEntry[]) {
  const container = document.getElementById('usageTableContainer');
  if (!container) return;

  if (!entries.length) {
    container.innerHTML = '<div class="usage-table-empty">No model usage data available.</div>';
    return;
  }

  // Sort by cost descending
  const sorted = [...entries].sort((a, b) => b.cost - a.cost);

  const table = document.createElement('table');
  table.className = 'usage-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Model</th>
        <th>Requests</th>
        <th>Prompt</th>
        <th>Completion</th>
        <th>Cost</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement('tbody');
  for (const entry of sorted) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <span class="usage-model-name">
          <span class="usage-model-dot"></span>
          ${escapeHtml(entry.model)}
        </span>
      </td>
      <td>${entry.requests}</td>
      <td>${formatTokens(entry.promptTokens)}</td>
      <td>${formatTokens(entry.completionTokens)}</td>
      <td class="usage-cost-cell">${formatCost(entry.cost)}</td>
    `;
    tbody.appendChild(row);
  }
  table.appendChild(tbody);

  container.innerHTML = '';
  container.appendChild(table);
};

(SidePanelUI.prototype as any).renderLocalUsageStats = function renderLocalUsageStats() {
  // Show session-level usage from in-memory stats
  const sessionIn = this.sessionTokenTotals?.inputTokens || 0;
  const sessionOut = this.sessionTokenTotals?.outputTokens || 0;
  const sessionTotal = sessionIn + sessionOut;

  const totalTokensEl = document.getElementById('usageTotalTokens');
  if (totalTokensEl) totalTokensEl.textContent = formatTokens(sessionTotal);

  const container = document.getElementById('usageTableContainer');
  if (!container) return;

  if (sessionTotal === 0) {
    container.innerHTML = '<div class="usage-table-empty">No usage data yet. Send a message to start tracking.</div>';
    return;
  }

  container.innerHTML = `
    <div style="padding: 12px 16px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="font-size: 11px; color: var(--muted);">Session input tokens</span>
        <span style="font-size: 11px; font-family: var(--font-mono); color: var(--foreground);">${formatTokens(sessionIn)}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="font-size: 11px; color: var(--muted);">Session output tokens</span>
        <span style="font-size: 11px; font-family: var(--font-mono); color: var(--foreground);">${formatTokens(sessionOut)}</span>
      </div>
    </div>
  `;
};

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
