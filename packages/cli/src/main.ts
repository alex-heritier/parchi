import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readAuth,
  writeAuth,
  generateToken,
  isDaemonRunning,
  readPid,
  removePid,
  DEFAULT_PORT,
} from './auth.js';
import { handleNativeMessaging } from './native-host.js';
import { startDaemon } from './daemon.js';
import { fetchRpc } from './rpc-client.js';

// ── Mode detection ──────────────────────────────────────────────────────────
// Chrome native messaging hosts receive messages via stdin pipe. Detect this
// by checking if stdin is a pipe (not a TTY) AND there are no CLI arguments
// beyond the chrome-extension:// origin that Chrome passes.
function isNativeMessagingMode(): boolean {
  if (process.stdin.isTTY) return false;
  // Chrome passes `chrome-extension://<id>/` as the only arg
  const args = process.argv.slice(2);
  return args.length === 1 && args[0].startsWith('chrome-extension://');
}

// ── Arg parser ──────────────────────────────────────────────────────────────
function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [k, v] = arg.slice(2).split('=');
    flags[k] = v ?? 'true';
  }
  return { positional, flags };
}

// ── Native host manifest installation ───────────────────────────────────────
function getNativeHostManifestPaths(): string[] {
  const platform = os.platform();
  const dirs: string[] = [];
  if (platform === 'darwin') {
    dirs.push(path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts'));
    dirs.push(path.join(os.homedir(), 'Library', 'Application Support', 'Chromium', 'NativeMessagingHosts'));
  } else if (platform === 'linux') {
    dirs.push(path.join(os.homedir(), '.config', 'google-chrome', 'NativeMessagingHosts'));
    dirs.push(path.join(os.homedir(), '.config', 'chromium', 'NativeMessagingHosts'));
  }
  return dirs.map((d) => path.join(d, 'com.parchi.bridge.json'));
}

function detectExtensionId(): string | null {
  const platform = os.platform();
  const profileDirs: string[] = [];
  if (platform === 'darwin') {
    profileDirs.push(path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome'));
    profileDirs.push(path.join(os.homedir(), 'Library', 'Application Support', 'Chromium'));
  } else if (platform === 'linux') {
    profileDirs.push(path.join(os.homedir(), '.config', 'google-chrome'));
    profileDirs.push(path.join(os.homedir(), '.config', 'chromium'));
  }

  for (const profileDir of profileDirs) {
    // Scan all Chrome profiles (Default, Profile 1, etc.)
    const profileNames = ['Default'];
    try {
      const entries = fs.readdirSync(profileDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory() && e.name.startsWith('Profile ')) profileNames.push(e.name);
      }
    } catch {
      continue;
    }

    for (const profile of profileNames) {
      const extDir = path.join(profileDir, profile, 'Extensions');
      try {
        const extIds = fs.readdirSync(extDir);
        for (const extId of extIds) {
          // Look inside version subdirectories for a manifest with name "Parchi"
          const versionDir = path.join(extDir, extId);
          try {
            const versions = fs.readdirSync(versionDir);
            for (const ver of versions) {
              const manifestPath = path.join(versionDir, ver, 'manifest.json');
              try {
                const raw = fs.readFileSync(manifestPath, 'utf8');
                const manifest = JSON.parse(raw);
                if (manifest.name === 'Parchi') return extId;
              } catch {}
            }
          } catch {}
        }
      } catch {}
    }
  }
  return null;
}

function installNativeHostManifest(extensionId: string): string[] {
  const binaryPath = process.argv[1];
  // Resolve to absolute path
  const absPath = path.resolve(binaryPath);

  const manifest = {
    name: 'com.parchi.bridge',
    description: 'Parchi CLI — zero-config browser control',
    path: absPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };

  const paths = getNativeHostManifestPaths();
  const installed: string[] = [];
  for (const p of paths) {
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(manifest, null, 2));
      installed.push(p);
    } catch {}
  }
  return installed;
}

// ── Daemon lifecycle helpers ────────────────────────────────────────────────
function spawnDaemonBackground(): void {
  const { spawn } = require('node:child_process') as typeof import('node:child_process');
  const binPath = process.argv[1];
  const child = spawn(process.execPath, [binPath, 'daemon'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

// ── Printing ────────────────────────────────────────────────────────────────
const print = (value: unknown) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

// ── Commands ────────────────────────────────────────────────────────────────

async function cmdInit(flags: Record<string, string>) {
  // 1. Generate or reuse token
  let auth = readAuth();
  if (auth) {
    console.log('[init] Existing auth config found, reusing token.');
  } else {
    auth = {
      token: generateToken(),
      port: DEFAULT_PORT,
      createdAt: new Date().toISOString(),
    };
    writeAuth(auth);
    console.log(`[init] Generated new auth token.`);
  }

  // 2. Detect extension ID
  let extensionId = flags.extensionId || auth.extensionId || null;
  if (!extensionId) {
    console.log('[init] Scanning for Parchi extension...');
    extensionId = detectExtensionId();
  }
  if (!extensionId) {
    console.error(
      '[init] Could not detect Parchi extension ID.\n' +
        '       Install the extension, then re-run with --extensionId=<id>\n' +
        '       (Find the ID at chrome://extensions)',
    );
    process.exit(1);
  }
  console.log(`[init] Extension ID: ${extensionId}`);

  // Persist extension ID
  if (auth.extensionId !== extensionId) {
    auth.extensionId = extensionId;
    writeAuth(auth);
  }

  // 3. Install native messaging host manifest
  const installed = installNativeHostManifest(extensionId);
  if (installed.length === 0) {
    console.error('[init] Failed to install native messaging host manifest.');
    process.exit(1);
  }
  for (const p of installed) console.log(`[init] Installed native host manifest: ${p}`);

  // 4. Start daemon if not running
  if (isDaemonRunning()) {
    console.log('[init] Daemon already running.');
  } else {
    console.log('[init] Starting daemon...');
    spawnDaemonBackground();
    // Wait briefly for it to come up
    await new Promise((r) => setTimeout(r, 500));
    if (isDaemonRunning()) {
      console.log(`[init] Daemon started on port ${auth.port}.`);
    } else {
      console.log(`[init] Daemon spawned (port ${auth.port}). It may take a moment to initialize.`);
    }
  }

  console.log('\n[init] Done! Reload the extension in Chrome to auto-pair.');
  console.log('       Then run: parchi status');
}

async function cmdStatus() {
  const auth = readAuth();
  if (!auth) {
    print({ configured: false, hint: 'Run `parchi init` first.' });
    return;
  }

  const daemonRunning = isDaemonRunning();
  const result: Record<string, unknown> = {
    configured: true,
    port: auth.port,
    daemon: daemonRunning ? 'running' : 'stopped',
    pid: readPid(),
  };

  if (daemonRunning) {
    try {
      const ping = await fetchRpc({ method: 'relay.ping' });
      result.relay = ping;
    } catch (err) {
      result.relay = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  print(result);
}

async function cmdStop() {
  const pid = readPid();
  if (!pid) {
    console.log('Daemon is not running.');
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
    removePid();
    console.log(`Daemon (PID ${pid}) stopped.`);
  } catch {
    removePid();
    console.log('Daemon was not running (stale PID removed).');
  }
}

async function cmdTools(flags: Record<string, string>) {
  const agentId = flags.agentId;
  const params = agentId ? { agentId } : undefined;
  const result = await fetchRpc({ method: 'tools.list', params });
  print(result);
}

async function cmdTool(positional: string[], flags: Record<string, string>) {
  const toolName = positional[1];
  if (!toolName) {
    console.error('Usage: parchi tool <name> [--args=\'{...}\']');
    process.exit(1);
  }
  let args: unknown = {};
  if (flags.args) {
    try {
      args = JSON.parse(flags.args);
    } catch {
      console.error('Invalid JSON for --args');
      process.exit(1);
    }
  }
  const agentId = flags.agentId;
  const params = agentId ? { agentId, tool: toolName, args } : { tool: toolName, args };
  const result = await fetchRpc({ method: 'tool.call', params });
  print(result);
}

async function cmdRun(positional: string[], flags: Record<string, string>) {
  const prompt = positional.slice(1).join(' ').trim();
  if (!prompt) {
    console.error('Usage: parchi run <prompt>');
    process.exit(1);
  }

  const agentId = flags.agentId;
  const timeoutMs = Number(flags.timeoutMs || 600_000);
  const tabsRaw = flags.tabs || 'active';
  const selectedTabIds =
    tabsRaw === 'active'
      ? null
      : tabsRaw
          .split(',')
          .map((p) => Number(p.trim()))
          .filter((n) => Number.isFinite(n) && n > 0);

  const startParams: Record<string, unknown> = { prompt };
  if (selectedTabIds?.length) startParams.selectedTabIds = selectedTabIds;
  if (agentId) startParams.agentId = agentId;

  const started = (await fetchRpc({ method: 'agent.run', params: startParams })) as any;
  const runId = typeof started?.runId === 'string' ? started.runId : '';
  if (!runId) {
    print(started);
    return;
  }
  const waited = await fetchRpc({ method: 'run.wait', params: { runId, timeoutMs } });
  print(waited);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Native messaging mode — Chrome launches us with a pipe
  if (isNativeMessagingMode()) {
    await handleNativeMessaging();
    return;
  }

  const { positional, flags } = parseArgs(process.argv.slice(2));
  const cmd = positional[0] || '';

  if (!cmd || cmd === 'help' || cmd === '--help') {
    console.log(`parchi — zero-config browser control

Commands:
  parchi init                       Generate token, install native host, start daemon
  parchi run <prompt>               Start agent run, wait for result
  parchi tool <name> [--args='{}'   Call a browser tool
  parchi tools                      List available tools
  parchi status                     Show daemon + extension connection status
  parchi stop                       Stop the daemon
  parchi daemon                     Run daemon in foreground (for debugging)`);
    return;
  }

  if (cmd === 'init') return cmdInit(flags);
  if (cmd === 'daemon') return startDaemon({ foreground: true });
  if (cmd === 'status') return cmdStatus();
  if (cmd === 'stop') return cmdStop();
  if (cmd === 'tools') return cmdTools(flags);
  if (cmd === 'tool') return cmdTool(positional, flags);
  if (cmd === 'run') return cmdRun(positional, flags);

  // Pass-through RPC for advanced usage
  if (cmd === 'rpc') {
    const method = positional[1];
    if (!method) {
      console.error('Usage: parchi rpc <method> [--params=\'{...}\']');
      process.exit(1);
    }
    let params: unknown;
    if (flags.params) {
      try {
        params = JSON.parse(flags.params);
      } catch {
        console.error('Invalid JSON for --params');
        process.exit(1);
      }
    }
    const result = await fetchRpc({ method, params });
    print(result);
    return;
  }

  console.error(`Unknown command: ${cmd}. Run 'parchi help' for usage.`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
