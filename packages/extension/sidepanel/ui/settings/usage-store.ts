/**
 * Lightweight local usage tracking store.
 *
 * Storage schema (chrome.storage.local):
 *
 *   usageDaily: { [date: YYYY-MM-DD]: { [model]: { provider, requests, inputTokens, outputTokens } } }
 *   usageTotals: { [model]: { provider, requests, inputTokens, outputTokens, firstSeen, lastUsed } }
 *
 * Daily entries are pruned to the most recent 30 days to stay well within
 * chrome.storage.local limits (~10 MB).
 */

const STORAGE_KEY_DAILY = 'usageDaily';
const STORAGE_KEY_TOTALS = 'usageTotals';
const MAX_DAILY_DAYS = 30;

export interface UsageDailyEntry {
  provider: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export interface UsageTotalEntry {
  provider: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  firstSeen: string;
  lastUsed: string;
}

export interface UsageData {
  daily: Record<string, Record<string, UsageDailyEntry>>;
  totals: Record<string, UsageTotalEntry>;
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Record a single API call's usage.
 */
export async function recordUsage(
  model: string,
  provider: string,
  usage: { inputTokens: number; outputTokens: number },
): Promise<void> {
  if (!model || (!usage.inputTokens && !usage.outputTokens)) return;

  const dateKey = today();
  const stored = await chrome.storage.local.get([STORAGE_KEY_DAILY, STORAGE_KEY_TOTALS]);

  // --- Daily ---
  const daily: Record<string, Record<string, UsageDailyEntry>> = stored[STORAGE_KEY_DAILY] || {};
  if (!daily[dateKey]) daily[dateKey] = {};
  const dayModel = daily[dateKey][model] || { provider, requests: 0, inputTokens: 0, outputTokens: 0 };
  dayModel.provider = provider;
  dayModel.requests += 1;
  dayModel.inputTokens += usage.inputTokens;
  dayModel.outputTokens += usage.outputTokens;
  daily[dateKey][model] = dayModel;

  // Prune old days
  const sortedDays = Object.keys(daily).sort();
  while (sortedDays.length > MAX_DAILY_DAYS) {
    const oldest = sortedDays.shift()!;
    delete daily[oldest];
  }

  // --- Totals ---
  const totals: Record<string, UsageTotalEntry> = stored[STORAGE_KEY_TOTALS] || {};
  const total = totals[model] || {
    provider,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    firstSeen: dateKey,
    lastUsed: dateKey,
  };
  total.provider = provider;
  total.requests += 1;
  total.inputTokens += usage.inputTokens;
  total.outputTokens += usage.outputTokens;
  total.lastUsed = dateKey;
  totals[model] = total;

  await chrome.storage.local.set({
    [STORAGE_KEY_DAILY]: daily,
    [STORAGE_KEY_TOTALS]: totals,
  });
}

/**
 * Get all stored usage data.
 */
export async function getUsageData(): Promise<UsageData> {
  const stored = await chrome.storage.local.get([STORAGE_KEY_DAILY, STORAGE_KEY_TOTALS]);
  return {
    daily: stored[STORAGE_KEY_DAILY] || {},
    totals: stored[STORAGE_KEY_TOTALS] || {},
  };
}

/**
 * Clear all usage data.
 */
export async function clearUsageData(): Promise<void> {
  await chrome.storage.local.remove([STORAGE_KEY_DAILY, STORAGE_KEY_TOTALS]);
}
