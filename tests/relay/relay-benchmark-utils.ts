export type RunOutcome = {
  runId: string;
  prompt: string;
  status: 'completed' | 'failed' | 'stopped' | 'rpc_error';
  success: boolean;
  validation: {
    ok: boolean;
    issues: string[];
  };
  latency: {
    totalMs: number | null;
    ttfbMs: number | null;
    firstTokenMs: number | null;
  };
  model?: string;
  provider?: string;
  route?: string;
  errorCategory?: string;
  startedAt: number;
  finishedAt: number;
};

export type RunEvent = { type?: unknown; timestamp?: unknown; channel?: unknown };

export type RunDonePayload = {
  status?: unknown;
  final?: unknown;
  error?: unknown;
  timestamp?: unknown;
  latency?: unknown;
};

export type BenchmarkPayload = {
  summary: {
    successRatePct: number;
    successCount: number;
    totalRuns: number;
    validationPassRatePct: number;
    validationPassCount: number;
    metrics: Record<string, unknown>;
    errorCategories: Record<string, unknown>;
  };
  meta: {
    label: string;
    generatedAt: string;
    host: string;
    port: number;
    rounds: number;
    timeoutMs: number;
  };
};

export const parseArgs = (argv: string[]) => {
  const flags: Record<string, string> = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [k, v] = arg.slice(2).split('=');
    flags[k] = v ?? 'true';
  }
  return flags;
};

const quantile = (values: number[], p: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx];
};

export const summarize = (values: Array<number | null>) => {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0);
  if (!nums.length) return null;
  const sum = nums.reduce((acc, v) => acc + v, 0);
  return {
    count: nums.length,
    min: Math.min(...nums),
    p50: quantile(nums, 0.5),
    p95: quantile(nums, 0.95),
    max: Math.max(...nums),
    mean: Number((sum / nums.length).toFixed(2)),
  };
};

export const extractLatency = (events: unknown[], donePayload: unknown, startedAt: number, finishedAt: number) => {
  const done = donePayload as RunDonePayload;
  const terminal = done.status === 'completed' ? done.final : done.error;
  const explicit = (terminal as RunDonePayload | null | undefined)?.latency as
    | { totalMs?: unknown; ttfbMs?: unknown; firstTokenMs?: unknown }
    | null
    | undefined;

  if (explicit && typeof explicit === 'object') {
    return {
      totalMs: Number.isFinite(Number(explicit.totalMs)) ? Number(explicit.totalMs) : null,
      ttfbMs: Number.isFinite(Number(explicit.ttfbMs)) ? Number(explicit.ttfbMs) : null,
      firstTokenMs: Number.isFinite(Number(explicit.firstTokenMs)) ? Number(explicit.firstTokenMs) : null,
    };
  }

  const firstEventTs = (events as RunEvent[]).find((evt) => typeof evt?.timestamp === 'number')?.timestamp as
    | number
    | undefined;
  const firstDeltaTs = (events as RunEvent[]).find(
    (evt) => evt?.type === 'assistant_stream_delta' && evt?.channel === 'text' && typeof evt?.timestamp === 'number',
  )?.timestamp as number | undefined;
  const firstChunkTs = (events as RunEvent[]).find(
    (evt) =>
      (evt?.type === 'assistant_stream_delta' || evt?.type === 'assistant_stream_start') &&
      typeof evt?.timestamp === 'number',
  )?.timestamp as number | undefined;
  const terminalTs =
    (typeof (terminal as any)?.timestamp === 'number' ? Number((terminal as any).timestamp) : null) ||
    (events as RunEvent[]).filter((evt) => typeof evt?.timestamp === 'number').at(-1)?.timestamp ||
    finishedAt;

  const anchor = typeof firstEventTs === 'number' ? firstEventTs : startedAt;
  const resolvedTerminalTs = typeof terminalTs === 'number' ? terminalTs : finishedAt;
  return {
    totalMs: Math.max(0, resolvedTerminalTs - anchor),
    ttfbMs: typeof firstChunkTs === 'number' ? Math.max(0, firstChunkTs - anchor) : null,
    firstTokenMs: typeof firstDeltaTs === 'number' ? Math.max(0, firstDeltaTs - anchor) : null,
  };
};

export const validateRunEvents = (events: unknown[], donePayload: unknown) => {
  const issues: string[] = [];
  const done = donePayload as RunDonePayload;
  const evts = events as RunEvent[];

  const hasStart = evts.some((evt) => evt?.type === 'user_run_start');
  if (!hasStart) issues.push('Missing user_run_start event');
  const hasFinal = evts.some((evt) => evt?.type === 'assistant_final');
  const hasError = evts.some((evt) => evt?.type === 'run_error');

  if (done.status === 'completed' && !hasFinal) issues.push('run.done=completed without assistant_final event');
  if (done.status === 'failed' && !hasError) issues.push('run.done=failed without run_error event');

  const starts = evts.filter((evt) => evt?.type === 'assistant_stream_start').length;
  const stops = evts.filter((evt) => evt?.type === 'assistant_stream_stop').length;
  if (starts > stops) issues.push(`Stream not balanced (start=${starts}, stop=${stops})`);

  return { ok: issues.length === 0, issues };
};

export const toMarkdown = (payload: unknown) => {
  const p = payload as BenchmarkPayload;
  const s = p.summary;
  const m = s.metrics;
  return [
    '# Relay Benchmark Report',
    '',
    `- label: ${p.meta.label}`,
    `- generatedAt: ${p.meta.generatedAt}`,
    `- host: ${p.meta.host}:${p.meta.port}`,
    `- rounds: ${p.meta.rounds}`,
    `- timeoutMs: ${p.meta.timeoutMs}`,
    '',
    '## Results',
    '',
    `- successRate: ${s.successRatePct}% (${s.successCount}/${s.totalRuns})`,
    `- validationPassRate: ${s.validationPassRatePct}% (${s.validationPassCount}/${s.totalRuns})`,
    '',
    '## Latency (ms)',
    '',
    `- total: ${JSON.stringify(m.totalMs)}`,
    `- ttfb: ${JSON.stringify(m.ttfbMs)}`,
    `- firstToken: ${JSON.stringify(m.firstTokenMs)}`,
    '',
    '## Error categories',
    '',
    '```json',
    JSON.stringify(s.errorCategories, null, 2),
    '```',
    '',
  ].join('\n');
};
