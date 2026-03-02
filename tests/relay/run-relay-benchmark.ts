#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  type RunDonePayload,
  type RunOutcome,
  extractLatency,
  parseArgs,
  summarize,
  toMarkdown,
  validateRunEvents,
} from './relay-benchmark-utils.js';
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
    if (fromFlag.trim())
      return fromFlag
        .split('|')
        .map((p) => p.trim())
        .filter(Boolean);
    const fromEnv = process.env.RELAY_BENCH_PROMPTS || '';
    if (fromEnv.trim())
      return fromEnv
        .split('|')
        .map((p) => p.trim())
        .filter(Boolean);
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
      const started = (await fetchRpc({ host, port, token, method: 'agent.run', params: startParams })) as {
        runId?: unknown;
      };
      const runId = String(started?.runId || '');
      if (!runId) throw new Error('agent.run did not return runId');
      const waited = (await fetchRpc({
        host,
        port,
        token,
        method: 'run.wait',
        params: { runId, timeoutMs },
      })) as { done?: unknown };
      const eventsResult = (await fetchRpc({ host, port, token, method: 'run.events', params: { runId } })) as {
        events?: unknown;
        done?: unknown;
      };
      const events = Array.isArray(eventsResult?.events) ? (eventsResult.events as unknown[]) : [];
      const done = (waited?.done || eventsResult?.done || {}) as RunDonePayload;
      const finishedAt = Date.now();
      const validation = validateRunEvents(events, done);
      const latency = extractLatency(events, done, startedAt, finishedAt);
      const terminal = done.status === 'completed' ? done.final : done.error;
      const benchmark =
        terminal &&
        typeof terminal === 'object' &&
        (terminal as any).benchmark &&
        typeof (terminal as any).benchmark === 'object'
          ? (terminal as any).benchmark
          : {};
      outcomes.push({
        runId,
        prompt,
        status: (typeof done.status === 'string' ? (done.status as any) : 'failed') as any,
        success: done.status === 'completed',
        validation,
        latency,
        model: typeof benchmark?.model === 'string' ? benchmark.model : undefined,
        provider: typeof benchmark?.provider === 'string' ? benchmark.provider : undefined,
        route: typeof benchmark?.route === 'string' ? benchmark.route : undefined,
        errorCategory:
          terminal && typeof terminal === 'object' && typeof (terminal as any).errorCategory === 'string'
            ? String((terminal as any).errorCategory)
            : undefined,
        startedAt,
        finishedAt,
      });
      console.log(
        `[${i + 1}/${rounds}] ${runId} status=${(done.status as any) || 'failed'} totalMs=${latency.totalMs ?? 'n/a'} ttfbMs=${latency.ttfbMs ?? 'n/a'}`,
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
