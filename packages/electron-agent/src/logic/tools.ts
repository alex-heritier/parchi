import type { ToolDefinition } from '@parchi/shared';
import { runAgentBrowserCommand } from '../helpers/agent-browser.js';
import { launchElectronApp } from '../helpers/launch.js';
import type { ElectronToolContext, JsonRecord } from '../types.js';

const DEFAULT_PORT = 9222;
const DEFAULT_WAIT_MS = 3000;

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'electron.launch',
    description: 'Launch an Electron app with a remote-debugging port enabled.',
    input_schema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'App name on macOS (`open -a`) or executable on Linux.' },
        port: { type: 'number', description: 'CDP port to expose (default 9222).' },
        waitMs: { type: 'number', description: 'Optional wait after launch before returning.' },
        extraArgs: { type: 'array', items: { type: 'string' }, description: 'Additional app launch args.' },
      },
      required: ['app'],
    },
  },
  {
    name: 'electron.connect',
    description: 'Connect agent-browser to a running Electron app via CDP endpoint or port.',
    input_schema: {
      type: 'object',
      properties: {
        cdpEndpoint: { type: 'string', description: 'Port number or ws/http CDP endpoint.' },
        sessionId: { type: 'string', description: 'Logical session name (isolates agent-browser daemon state).' },
      },
      required: ['cdpEndpoint'],
    },
  },
  {
    name: 'electron.snapshot',
    description: 'Capture the current accessibility snapshot of the connected Electron app.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        cdpEndpoint: { type: 'string' },
        interactive: { type: 'boolean', description: 'Include interactive refs (default true).' },
        includeCursorInteractive: { type: 'boolean', description: 'Include cursor interactive nodes (`-C`).' },
      },
    },
  },
  {
    name: 'electron.click',
    description: 'Click an element ref/selector in the Electron app.',
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Element ref (e.g. @e4) or selector.' },
        sessionId: { type: 'string' },
        cdpEndpoint: { type: 'string' },
      },
      required: ['target'],
    },
  },
  {
    name: 'electron.type',
    description: 'Type or fill text into an element.',
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Element ref/selector.' },
        text: { type: 'string', description: 'Text to type.' },
        fill: { type: 'boolean', description: 'Use fill instead of type.' },
        sessionId: { type: 'string' },
        cdpEndpoint: { type: 'string' },
      },
      required: ['target', 'text'],
    },
  },
  {
    name: 'electron.press',
    description: 'Press a key in the current Electron app context.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Keyboard key (Enter, Tab, Control+a, etc).' },
        sessionId: { type: 'string' },
        cdpEndpoint: { type: 'string' },
      },
      required: ['key'],
    },
  },
  {
    name: 'electron.tab',
    description: 'List/switch tabs or webviews in the Electron app.',
    input_schema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'Switch to a tab index.' },
        urlPattern: { type: 'string', description: 'Switch using --url pattern.' },
        sessionId: { type: 'string' },
        cdpEndpoint: { type: 'string' },
      },
    },
  },
  {
    name: 'electron.screenshot',
    description: 'Capture screenshot from Electron app context.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Optional output path.' },
        full: { type: 'boolean', description: 'Capture full page.' },
        annotate: { type: 'boolean', description: 'Annotated screenshot with refs.' },
        sessionId: { type: 'string' },
        cdpEndpoint: { type: 'string' },
      },
    },
  },
  {
    name: 'electron.command',
    description: 'Run a raw agent-browser command for advanced control.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'array', items: { type: 'string' }, description: 'Raw agent-browser command tokens.' },
        sessionId: { type: 'string' },
        cdpEndpoint: { type: 'string' },
        json: { type: 'boolean', description: 'Include --json global flag (default true).' },
      },
      required: ['command'],
    },
  },
];

const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const asBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  return null;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
};

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
};

const toSessionName = (raw: unknown) => {
  const base = asString(raw) || 'default';
  const safe = base.replace(/[^a-zA-Z0-9_.:-]/g, '-').slice(0, 80);
  return `electron-${safe || 'default'}`;
};

const buildGlobalArgs = (args: JsonRecord, json = true): string[] => {
  const out: string[] = [];
  out.push('--session', toSessionName(args.sessionId));

  const cdpEndpoint = asString(args.cdpEndpoint);
  if (cdpEndpoint) {
    out.push('--cdp', cdpEndpoint);
  }

  if (json) out.push('--json');
  return out;
};

const normalizeCommandResult = (result: Awaited<ReturnType<typeof runAgentBrowserCommand>>) => ({
  ok: result.exitCode === 0 && !result.timedOut,
  command: result.command,
  exitCode: result.exitCode,
  signal: result.signal,
  timedOut: result.timedOut,
  stdout: result.stdout,
  stderr: result.stderr,
  data: result.parsedJson,
});

const run = async (context: ElectronToolContext, args: string[]) => {
  const result = await runAgentBrowserCommand({
    commandPrefix: context.agentBrowser.commandPrefix,
    args,
    timeoutMs: context.agentBrowser.defaultTimeoutMs,
  });
  return normalizeCommandResult(result);
};

const withRequiredString = (record: JsonRecord, key: string) => {
  const value = asString(record[key]);
  if (!value) throw new Error(`Missing required string field: ${key}`);
  return value;
};

const toolHandlers: Record<string, (args: JsonRecord, context: ElectronToolContext) => Promise<unknown>> = {
  'electron.launch': async (args) => {
    const app = withRequiredString(args, 'app');
    const port = Math.max(1, Math.floor(asNumber(args.port) || DEFAULT_PORT));
    const waitMs = Math.max(0, Math.floor(asNumber(args.waitMs) || DEFAULT_WAIT_MS));
    const extraArgs = asStringArray(args.extraArgs);
    const launch = await launchElectronApp({ app, port, waitMs, extraArgs });
    return { ok: true, launch };
  },

  'electron.connect': async (args, context) => {
    const cdpEndpoint = withRequiredString(args, 'cdpEndpoint');
    return await run(context, [...buildGlobalArgs(args), 'connect', cdpEndpoint]);
  },

  'electron.snapshot': async (args, context) => {
    const command = [...buildGlobalArgs(args), 'snapshot'];
    if (asBoolean(args.interactive) !== false) command.push('-i');
    if (asBoolean(args.includeCursorInteractive) === true) command.push('-C');
    return await run(context, command);
  },

  'electron.click': async (args, context) => {
    const target = withRequiredString(args, 'target');
    return await run(context, [...buildGlobalArgs(args), 'click', target]);
  },

  'electron.type': async (args, context) => {
    const target = withRequiredString(args, 'target');
    const text = withRequiredString(args, 'text');
    const verb = asBoolean(args.fill) === true ? 'fill' : 'type';
    return await run(context, [...buildGlobalArgs(args), verb, target, text]);
  },

  'electron.press': async (args, context) => {
    const key = withRequiredString(args, 'key');
    return await run(context, [...buildGlobalArgs(args), 'press', key]);
  },

  'electron.tab': async (args, context) => {
    const index = asNumber(args.index);
    const urlPattern = asString(args.urlPattern);
    if (urlPattern) return await run(context, [...buildGlobalArgs(args), 'tab', '--url', urlPattern]);
    if (index != null) return await run(context, [...buildGlobalArgs(args), 'tab', String(Math.floor(index))]);
    return await run(context, [...buildGlobalArgs(args), 'tab']);
  },

  'electron.screenshot': async (args, context) => {
    const command = [...buildGlobalArgs(args), 'screenshot'];
    if (asBoolean(args.full) === true) command.push('--full');
    if (asBoolean(args.annotate) === true) command.push('--annotate');
    const path = asString(args.path);
    if (path) command.push(path);
    return await run(context, command);
  },

  'electron.command': async (args, context) => {
    const command = asStringArray(args.command);
    if (command.length === 0) throw new Error('electron.command requires non-empty command array');
    const includeJson = asBoolean(args.json) !== false;
    return await run(context, [...buildGlobalArgs(args, includeJson), ...command]);
  },
};

export const getElectronToolDefinitions = () => TOOL_DEFINITIONS;

export const executeElectronTool = async ({
  tool,
  args,
  context,
}: {
  tool: string;
  args: JsonRecord;
  context: ElectronToolContext;
}) => {
  const handler = toolHandlers[tool];
  if (!handler) throw new Error(`Unknown electron tool: ${tool}`);
  return await handler(args, context);
};
