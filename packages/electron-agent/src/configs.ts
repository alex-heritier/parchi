import os from 'node:os';
import { resolveAgentBrowserCommandPrefix } from './helpers/agent-browser.js';
import type { ElectronAgentConfig } from './types.js';

const DEFAULT_RELAY_HOST = '127.0.0.1';
const DEFAULT_RELAY_PORT = '17373';
const DEFAULT_BROWSER_TIMEOUT_MS = 120_000;

const parseFlags = (argv: string[]) => {
  const flags: Record<string, string> = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, value] = arg.slice(2).split('=');
    flags[key] = value ?? 'true';
  }
  return flags;
};

const parseIntSafe = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const normalizeRelayUrl = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `http://${trimmed}`;
};

const buildDefaultAgentId = () => {
  const host =
    os
      .hostname()
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .slice(0, 32) || 'host';
  return `electron-${host}-${process.pid}`;
};

export const loadElectronAgentConfig = (argv = process.argv.slice(2)): ElectronAgentConfig => {
  const flags = parseFlags(argv);
  const relayToken = (flags.token || process.env.PARCHI_RELAY_TOKEN || '').trim();
  if (!relayToken) {
    throw new Error('Missing relay token. Set PARCHI_RELAY_TOKEN or pass --token=<value>.');
  }

  const relayUrl = normalizeRelayUrl(
    flags.relayUrl || process.env.PARCHI_RELAY_URL || `${DEFAULT_RELAY_HOST}:${DEFAULT_RELAY_PORT}`,
  );
  if (!relayUrl) {
    throw new Error('Missing relay URL. Set PARCHI_RELAY_URL or pass --relayUrl=<url>.');
  }

  return {
    relayUrl,
    relayToken,
    agentId: (flags.agentId || process.env.PARCHI_ELECTRON_AGENT_ID || buildDefaultAgentId()).trim(),
    agentName: (flags.agentName || process.env.PARCHI_ELECTRON_AGENT_NAME || 'parchi-electron-agent').trim(),
    agentVersion: (flags.agentVersion || process.env.PARCHI_ELECTRON_AGENT_VERSION || '0.1.0').trim(),
    reconnectDelayBaseMs: parseIntSafe(flags.reconnectBaseMs || process.env.PARCHI_ELECTRON_RECONNECT_BASE_MS, 400),
    reconnectDelayMaxMs: parseIntSafe(flags.reconnectMaxMs || process.env.PARCHI_ELECTRON_RECONNECT_MAX_MS, 15_000),
    agentBrowser: {
      commandPrefix: resolveAgentBrowserCommandPrefix(
        flags.browserCommand || process.env.PARCHI_ELECTRON_AGENT_BROWSER_COMMAND,
      ),
      defaultTimeoutMs: parseIntSafe(
        flags.browserTimeoutMs || process.env.PARCHI_ELECTRON_AGENT_BROWSER_TIMEOUT_MS,
        DEFAULT_BROWSER_TIMEOUT_MS,
      ),
    },
  };
};
