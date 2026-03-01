import { SidePanelUI } from '../core/panel-ui.js';
const sidePanelProto = SidePanelUI.prototype as SidePanelUI & Record<string, unknown>;

import { clearUsageData, getUsageData } from './usage-store.js';
import type { UsageTotalEntry } from './usage-store.js';

const formatTokens = (count: number) => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
};

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const setUsageStatus = (text: string) => {
  const el = document.getElementById('usageStatusText');
  if (el) el.textContent = text;
};

sidePanelProto.refreshUsageTab = async function refreshUsageTab() {
  setUsageStatus('Loading...');

  try {
    const data = await getUsageData();
    const totals = data.totals;
    const models = Object.keys(totals);

    // Compute aggregates
    let totalRequests = 0;
    let totalInput = 0;
    let totalOutput = 0;

    for (const entry of Object.values(totals)) {
      totalRequests += entry.requests;
      totalInput += entry.inputTokens;
      totalOutput += entry.outputTokens;
    }

    // Update summary grid
    const reqEl = document.getElementById('usageTotalRequests');
    const inEl = document.getElementById('usageTotalInputTokens');
    const outEl = document.getElementById('usageTotalOutputTokens');
    if (reqEl) reqEl.textContent = String(totalRequests);
    if (inEl) inEl.textContent = formatTokens(totalInput);
    if (outEl) outEl.textContent = formatTokens(totalOutput);

    // Period label
    const periodEl = document.getElementById('usagePeriodText');
    if (periodEl) {
      if (models.length > 0) {
        const earliest = Object.values(totals).reduce(
          (min, e) => (e.firstSeen < min ? e.firstSeen : min),
          '9999-99-99',
        );
        periodEl.textContent = `Since ${earliest}`;
      } else {
        periodEl.textContent = 'All-time usage';
      }
    }

    // Render per-model table
    this.renderUsageTable(totals);

    // Render session section
    this.renderSessionUsage();

    setUsageStatus(`Updated ${new Date().toLocaleTimeString()}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setUsageStatus(`Error: ${message}`);
  }
};

sidePanelProto.renderUsageTable = function renderUsageTable(totals: Record<string, UsageTotalEntry>) {
  const container = document.getElementById('usageTableContainer');
  if (!container) return;

  const entries = Object.entries(totals);
  if (!entries.length) {
    container.innerHTML = '<div class="usage-table-empty">No usage data yet. Send a message to start tracking.</div>';
    return;
  }

  // Sort by total tokens descending
  const sorted = entries.sort(([, a], [, b]) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens));

  // Find max total for bar widths
  const maxTotal = sorted.reduce((max, [, e]) => Math.max(max, e.inputTokens + e.outputTokens), 1);

  const table = document.createElement('table');
  table.className = 'usage-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Model</th>
        <th>Reqs</th>
        <th>Input</th>
        <th>Output</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement('tbody');
  for (const [model, entry] of sorted) {
    const total = entry.inputTokens + entry.outputTokens;
    const pct = Math.round((total / maxTotal) * 100);
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <span class="usage-model-name">
          <span class="usage-model-dot"></span>
          ${escapeHtml(model)}
        </span>
        <div class="usage-model-bar" style="width: ${pct}%"></div>
      </td>
      <td>${entry.requests}</td>
      <td>${formatTokens(entry.inputTokens)}</td>
      <td>${formatTokens(entry.outputTokens)}</td>
    `;
    tbody.appendChild(row);
  }
  table.appendChild(tbody);

  container.innerHTML = '';
  container.appendChild(table);
};

sidePanelProto.renderSessionUsage = function renderSessionUsage() {
  const container = document.getElementById('usageSessionContainer');
  if (!container) return;

  const sessionIn = this.sessionTokenTotals?.inputTokens || 0;
  const sessionOut = this.sessionTokenTotals?.outputTokens || 0;
  const sessionTotal = sessionIn + sessionOut;

  if (sessionTotal === 0) {
    container.innerHTML = '<div class="usage-table-empty">No session data yet.</div>';
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

sidePanelProto.clearUsageData = async function clearUsageDataMethod() {
  try {
    await clearUsageData();
    this.refreshUsageTab?.();
    this.updateStatus('Usage data cleared', 'success');
  } catch {
    this.updateStatus('Failed to clear usage data', 'error');
  }
};
