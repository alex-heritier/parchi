import type { ModelEntry } from './types.js';

const MODEL_FETCH_TIMEOUT = 8000;

export async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_FETCH_TIMEOUT);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function extractModelEntries(payload: unknown): ModelEntry[] {
  if (!payload) return [];
  const p = payload as { data?: unknown; models?: unknown };
  const source = Array.isArray(p.data)
    ? p.data
    : Array.isArray(p.models)
      ? p.models
      : Array.isArray(payload)
        ? payload
        : [];

  const out: ModelEntry[] = [];
  for (const entry of source) {
    if (typeof entry === 'string') {
      const id = entry.trim();
      if (id) out.push({ id });
      continue;
    }

    if (entry && typeof entry === 'object') {
      const e = entry as {
        id?: unknown;
        name?: unknown;
        context_length?: unknown;
        contextWindow?: unknown;
      };
      if (typeof e.id === 'string') {
        const id = e.id.trim();
        if (!id) continue;
        out.push({
          id,
          label: typeof e.name === 'string' ? e.name : id,
          contextWindow:
            typeof e.context_length === 'number'
              ? e.context_length
              : typeof e.contextWindow === 'number'
                ? e.contextWindow
                : undefined,
        });
      }
    }
  }
  return out;
}
