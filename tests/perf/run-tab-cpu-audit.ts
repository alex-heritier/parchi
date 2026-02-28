#!/usr/bin/env node
/**
 * Browser tab CPU/RAM audit runner for local extension debugging.
 *
 * Optional env:
 *   TAB_AUDIT_TOP_N=25
 *   TAB_AUDIT_SAMPLES=6
 *   TAB_AUDIT_INTERVAL_MS=10000
 *   TAB_AUDIT_CPU_ALERT=80
 *   TAB_AUDIT_RSS_ALERT_MB=1024
 */

import { runTabCpuAudit } from './tab-cpu-audit-lib.js';
import type { TabAuditOptions } from './tab-cpu-audit-types.js';

const colors = {
  info: '\x1b[36m',
  success: '\x1b[32m',
  warning: '\x1b[33m',
  error: '\x1b[31m',
  reset: '\x1b[0m',
} as const;

const DEFAULTS = {
  topN: 25,
  sampleCount: 6,
  sampleIntervalMs: 10_000,
  cpuAlertPercent: 80,
  rssAlertMb: 1024,
};

function log(message: string, color: keyof typeof colors = 'info') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function parseIntEnv(name: string, fallback: number, min: number): number {
  const raw = Number(process.env[name] || fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.floor(raw));
}

function parseFloatEnv(name: string, fallback: number, min: number): number {
  const raw = Number(process.env[name] || fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, raw);
}

function resolveOptions(): TabAuditOptions {
  return {
    topN: parseIntEnv('TAB_AUDIT_TOP_N', DEFAULTS.topN, 1),
    sampleCount: parseIntEnv('TAB_AUDIT_SAMPLES', DEFAULTS.sampleCount, 1),
    sampleIntervalMs: parseIntEnv('TAB_AUDIT_INTERVAL_MS', DEFAULTS.sampleIntervalMs, 1000),
    cpuAlertPercent: parseFloatEnv('TAB_AUDIT_CPU_ALERT', DEFAULTS.cpuAlertPercent, 1),
    rssAlertMb: parseFloatEnv('TAB_AUDIT_RSS_ALERT_MB', DEFAULTS.rssAlertMb, 128),
  };
}

async function main() {
  const options = resolveOptions();
  log(
    `Sampling browser processes ${options.sampleCount}x every ${(options.sampleIntervalMs / 1000).toFixed(1)}s (top ${options.topN})...`,
    'info',
  );

  const { jsonPath, markdownPath, sustainedAlertPids } = await runTabCpuAudit(options);

  log(`Wrote audit JSON: ${jsonPath}`, 'success');
  log(`Wrote audit Markdown: ${markdownPath}`, 'success');
  if (sustainedAlertPids.length > 0) {
    log(`Sustained alerts detected: ${sustainedAlertPids.join(', ')}`, 'warning');
  }
}

main().catch((error) => {
  const err = error instanceof Error ? error.message : String(error);
  log(`Tab audit failed: ${err}`, 'error');
  process.exit(1);
});
