#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
type RunOutcome = {
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
const parseArgs = (argv: string[]) => {
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
const summarize = (values: Array<number | null>) => {
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
const fetchRpc = async ({
  host,
  port,
  token,
  method,
  params,
}: {
  host: string;
  port: number;
  token: string;
  method: string;
  params?: unknown;
}) => {
  const id = crypto.randomUUID();
  const res = await fetch(`http://${host}:${port}/v1/rpc`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const data = await res.json();
  if (!data || typeof data !== 'object') throw new Error(`Invalid RPC response for ${method}`);
  if (data.error) throw new Error(String(data.error.message || `RPC error: ${method}`));
  return data.result;
};
const defaultPrompts = [
  'Give a one-line summary of the page.',
  'List 3 quick actions you can do right now.',
  'What is one likely risk and one mitigation?',
];
const extractLatency = (events: any[], donePayload: any, startedAt: number, finishedAt: number) => {
  const terminal = donePayload?.status === 'completed' ? donePayload?.final : donePayload?.error;
  const explicit = terminal?.latency;
  if (explicit && typeof explicit === 'object') {
    return {
      totalMs: Number.isFinite(Number(explicit.totalMs)) ? Number(explicit.totalMs) : null,
      ttfbMs: Number.isFinite(Number(explicit.ttfbMs)) ? Number(explicit.ttfbMs) : null,
      firstTokenMs: Number.isFinite(Number(explicit.firstTokenMs)) ? Number(explicit.firstTokenMs) : null,
    };
  }
  const firstEventTs = events.find((evt) => typeof evt?.timestamp === 'number')?.timestamp;
  const firstDeltaTs = events.find(
    (evt) => evt?.type === 'assistant_stream_delta' && evt?.channel === 'text' && typeof evt?.timestamp === 'number',
  )?.timestamp;
  const firstChunkTs = events.find(
    (evt) =>
      (evt?.type === 'assistant_stream_delta' || evt?.type === 'assistant_stream_start') && typeof evt?.timestamp === 'number',
  )?.timestamp;
  const terminalTs =
    (typeof terminal?.timestamp === 'number' ? terminal.timestamp : null) ||
    events.filter((evt) => typeof evt?.timestamp === 'number').at(-1)?.timestamp ||
    finishedAt;
  const anchor = typeof firstEventTs === 'number' ? firstEventTs : startedAt;
  return {
    totalMs: Math.max(0, terminalTs - anchor),
    ttfbMs: typeof firstChunkTs === 'number' ? Math.max(0, firstChunkTs - anchor) : null,
    firstTokenMs: typeof firstDeltaTs === 'number' ? Math.max(0, firstDeltaTs - anchor) : null,
  };
};
const validateRunEvents = (events: any[], donePayload: any) => {
  const issues: string[] = [];
  const hasStart = events.some((evt) => evt?.type === 'user_run_start');
  if (!hasStart) issues.push('Missing user_run_start event');
  const hasFinal = events.some((evt) => evt?.type === 'assistant_final');
  const hasError = events.some((evt) => evt?.type === 'run_error');
  if (donePayload?.status === 'completed' && !hasFinal) issues.push('run.done=completed without assistant_final event');
  if (donePayload?.status === 'failed' && !hasError) issues.push('run.done=failed without run_error event');
  const starts = events.filter((evt) => evt?.type === 'assistant_stream_start').length;
  const stops = events.filter((evt) => evt?.type === 'assistant_stream_stop').length;
  if (starts > stops) issues.push(`Stream not balanced (start=${starts}, stop=${stops})`);
  return { ok: issues.length === 0, issues };
};
const toMarkdown = (payload: any) => {
  const s = payload.summary;
  const m = s.metrics;
  return [
    '# Relay Benchmark Report',
    '',
    `- label: ${payload.meta.label}`,
    `- generatedAt: ${payload.meta.generatedAt}`,
    `- host: ${payload.meta.host}:${payload.meta.port}`,
    `- rounds: ${payload.meta.rounds}`,
    `- timeoutMs: ${payload.meta.timeoutMs}`,
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
const main = async () => {
  const flags = parseArgs(process.argv.slice(2));
  const host = flags.host || process.env.PARCHI_RELAY_HOST || '127.0.0.1';
  const port = Number(flags.port || process.env.PARCHI_RELAY_PORT || 17373);
  const token = flags.token || process.env.PARCHI_RELAY_TOKEN || '';
  const agentId = flags.agentId || process.env.PARCHI_RELAY_AGENT_ID || '';
  const rounds = Number(flags.rounds || process.env.RELAY_BENCH_ROUNDS || 6);
  const timeoutMs = Number(flags.timeoutMs || process.env.RELAY_BENCH_TIMEOUT_MS || 240_000);
  const label = flags.label || process.env.RELAY_BENCH_LABEL || 'parchi-relay';
  const prompts = (() => {
    const fromFlag = flags.prompts ? String(flags.prompts) : '';
    if (fromFlag.trim()) return fromFlag.split('|').map((p) => p.trim()).filter(Boolean);
    const fromEnv = process.env.RELAY_BENCH_PROMPTS || '';
    if (fromEnv.trim()) return fromEnv.split('|').map((p) => p.trim()).filter(Boolean);
    return defaultPrompts;
  })();
  if (!token) {
    console.error('Missing relay token. Provide --token=... or set PARCHI_RELAY_TOKEN.');
    process.exit(1);
  }
  if (!Number.isFinite(rounds) || rounds <= 0) {
    console.error(`Invalid rounds: ${rounds}`);
    process.exit(1);
  }
  await fetchRpc({ host, port, token, method: 'relay.ping' });
  const outcomes: RunOutcome[] = [];
  for (let i = 0; i < rounds; i += 1) {
    const prompt = prompts[i % prompts.length] || defaultPrompts[0];
    const startedAt = Date.now();
    try {
      const startParams: Record<string, unknown> = { prompt };
      if (agentId) startParams.agentId = agentId;
      const started = (await fetchRpc({ host, port, token, method: 'agent.run', params: startParams })) as any;
      const runId = String(started?.runId || '');
      if (!runId) throw new Error('agent.run did not return runId');
      const waited = (await fetchRpc({
        host,
        port,
        token,
        method: 'run.wait',
        params: { runId, timeoutMs },
      })) as any;
      const eventsResult = (await fetchRpc({ host, port, token, method: 'run.events', params: { runId } })) as any;
      const events = Array.isArray(eventsResult?.events) ? eventsResult.events : [];
      const done = waited?.done || eventsResult?.done || {};
      const finishedAt = Date.now();
      const validation = validateRunEvents(events, done);
      const latency = extractLatency(events, done, startedAt, finishedAt);
      const terminal = done?.status === 'completed' ? done?.final : done?.error;
      const benchmark = terminal?.benchmark && typeof terminal.benchmark === 'object' ? terminal.benchmark : {};
      outcomes.push({
        runId,
        prompt,
        status: done?.status || 'failed',
        success: done?.status === 'completed',
        validation,
        latency,
        model: typeof benchmark?.model === 'string' ? benchmark.model : undefined,
        provider: typeof benchmark?.provider === 'string' ? benchmark.provider : undefined,
        route: typeof benchmark?.route === 'string' ? benchmark.route : undefined,
        errorCategory: typeof terminal?.errorCategory === 'string' ? terminal.errorCategory : undefined,
        startedAt,
        finishedAt,
      });
      console.log(
        `[${i + 1}/${rounds}] ${runId} status=${done?.status || 'failed'} totalMs=${latency.totalMs ?? 'n/a'} ttfbMs=${latency.ttfbMs ?? 'n/a'}`,
      );
    } catch (error) {
      const finishedAt = Date.now();
      const message = error instanceof Error ? error.message : String(error ?? 'RPC error');
      outcomes.push({
        runId: `rpc-error-${i + 1}`,
        prompt,
        status: 'rpc_error',
        success: false,
        validation: { ok: false, issues: [message] },
        latency: { totalMs: Math.max(0, finishedAt - startedAt), ttfbMs: null, firstTokenMs: null },
        errorCategory: 'rpc_error',
        startedAt,
        finishedAt,
      });
      console.error(`[${i + 1}/${rounds}] rpc_error: ${message}`);
    }
  }
  const successCount = outcomes.filter((o) => o.success).length;
  const validationPassCount = outcomes.filter((o) => o.validation.ok).length;
  const errorCategories = outcomes.reduce<Record<string, number>>((acc, outcome) => {
    if (!outcome.errorCategory) return acc;
    acc[outcome.errorCategory] = (acc[outcome.errorCategory] || 0) + 1;
    return acc;
  }, {});
  const payload = {
    meta: {
      label,
      generatedAt: new Date().toISOString(),
      host,
      port,
      rounds,
      timeoutMs,
      prompts,
    },
    runs: outcomes,
    summary: {
      totalRuns: outcomes.length,
      successCount,
      successRatePct: Number(((successCount / Math.max(1, outcomes.length)) * 100).toFixed(2)),
      validationPassCount,
      validationPassRatePct: Number(((validationPassCount / Math.max(1, outcomes.length)) * 100).toFixed(2)),
      errorCategories,
      metrics: {
        totalMs: summarize(outcomes.map((o) => o.latency.totalMs)),
        ttfbMs: summarize(outcomes.map((o) => o.latency.ttfbMs)),
        firstTokenMs: summarize(outcomes.map((o) => o.latency.firstTokenMs)),
      },
    },
  };
  const outDir = path.join(process.cwd(), 'test-output', 'relay');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `relay-benchmark-${stamp}`;
  const jsonPath = path.join(outDir, `${baseName}.json`);
  const mdPath = path.join(outDir, `${baseName}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  fs.writeFileSync(mdPath, toMarkdown(payload));
  console.log(`\nSaved benchmark JSON: ${jsonPath}`);
  console.log(`Saved benchmark MD:   ${mdPath}`);
};
await main();
