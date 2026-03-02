const MAX_CONTENT_PERF_EVENTS = 100;
const MAX_CONTENT_PERF_STRING_LENGTH = 240;
const MAX_CONTENT_PERF_ARRAY_ITEMS = 8;
const MAX_CONTENT_PERF_OBJECT_KEYS = 12;
const MAX_CONTENT_PERF_DEPTH = 3;

export function clampContentPerfString(input: string, maxLength: number = MAX_CONTENT_PERF_STRING_LENGTH) {
  if (input.length <= maxLength) return input;
  return `${input.slice(0, maxLength)}…`;
}

export function sanitizeContentPerfValue(value: unknown, depth: number, visited: WeakSet<object>): unknown {
  if (value == null) return value;
  if (depth >= MAX_CONTENT_PERF_DEPTH) {
    return '[truncated-depth]';
  }

  if (typeof value === 'string') return clampContentPerfString(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'object') return String(value);

  if (visited.has(value as object)) return '[circular]';
  visited.add(value as object);

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_CONTENT_PERF_ARRAY_ITEMS)
      .map((entry) => sanitizeContentPerfValue(entry, depth + 1, visited));
  }

  const output: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_CONTENT_PERF_OBJECT_KEYS);
  for (const [key, entry] of entries) {
    if (key.toLowerCase().includes('dataurl')) {
      output[key] = '[omitted-dataurl]';
      continue;
    }
    output[key] = sanitizeContentPerfValue(entry, depth + 1, visited);
  }
  return output;
}

export function sanitizeContentPerfDetails(event: unknown): Record<string, unknown> {
  if (!event || typeof event !== 'object') return {};
  const details: Record<string, unknown> = {};
  const raw = event as Record<string, unknown>;
  const visited = new WeakSet<object>();
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'source' || key === 'reason' || key === 'ts' || key === 'url') continue;
    details[key] = sanitizeContentPerfValue(value, 0, visited);
  }
  return details;
}

export async function recordContentPerfEvent(event: any, sender?: chrome.runtime.MessageSender) {
  const source = typeof event?.source === 'string' ? event.source : 'unknown';
  const reason = typeof event?.reason === 'string' ? event.reason : 'unspecified';
  const normalized = {
    source,
    reason,
    ts: Number.isFinite(Number(event?.ts)) ? Number(event.ts) : Date.now(),
    url: typeof event?.url === 'string' ? clampContentPerfString(event.url, 400) : '',
    tabId: typeof sender?.tab?.id === 'number' ? sender.tab.id : null,
    frameId: typeof sender?.frameId === 'number' ? sender.frameId : null,
    details: sanitizeContentPerfDetails(event),
  };

  console.warn('[content-perf]', normalized);

  try {
    const stored = await chrome.storage.local.get(['contentPerfEvents']);
    const history = Array.isArray(stored.contentPerfEvents) ? stored.contentPerfEvents : [];
    history.push(normalized);
    if (history.length > MAX_CONTENT_PERF_EVENTS) {
      history.splice(0, history.length - MAX_CONTENT_PERF_EVENTS);
    }
    await chrome.storage.local.set({
      contentPerfEvents: history,
      contentPerfLastEventAt: Date.now(),
    });
  } catch {
    // Ignore storage write failures for telemetry-only path.
  }
}
