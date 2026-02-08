import crypto from 'node:crypto';

type RpcRequest = {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
};

const parseArgs = (argv: string[]) => {
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
};

const die = (msg: string) => {
  console.error(msg);
  process.exit(1);
};

const readJsonFlag = (raw: string | undefined, fallback: unknown) => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (err) {
    die(`Invalid JSON: ${err instanceof Error ? err.message : String(err ?? '')}`);
  }
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
  const body: RpcRequest = { jsonrpc: '2.0', id, method, params };
  const res = await fetch(`http://${host}:${port}/v1/rpc`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json || typeof json !== 'object') die('Invalid RPC response');
  if ('error' in json && (json as any).error) {
    const msg = (json as any).error?.message || 'RPC error';
    die(msg);
  }
  return (json as any).result;
};

const main = async () => {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const cmd = positional[0] || '';

  const host = flags.host || process.env.PARCHI_RELAY_HOST || '127.0.0.1';
  const port = Number(flags.port || process.env.PARCHI_RELAY_PORT || 17373);
  const token = flags.token || process.env.PARCHI_RELAY_TOKEN || '';
  if (!token) die('Missing relay token. Provide `--token=...` or set PARCHI_RELAY_TOKEN.');

  const print = (value: unknown) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

  if (!cmd || cmd === 'help' || cmd === '--help') {
    print({
      usage: [
        'parchi-relay rpc <method> [--params=\'{...}\'] [--agentId=...]',
        'parchi-relay doctor [--agentId=...] [--skipTool=true]',
        'parchi-relay agents',
        'parchi-relay default-agent get|set <agentId>',
        'parchi-relay tools [--agentId=...]',
        'parchi-relay tool <toolName> [--args=\'{...}\'] [--agentId=...]',
        'parchi-relay run <prompt> [--tabs=active|1,2,3] [--timeoutMs=600000] [--agentId=...]',
      ],
      env: ['PARCHI_RELAY_TOKEN (required)', 'PARCHI_RELAY_HOST (default 127.0.0.1)', 'PARCHI_RELAY_PORT (default 17373)'],
    });
    return;
  }

  if (cmd === 'rpc') {
    const method = positional[1];
    if (!method) die('rpc: missing method');
    const params = readJsonFlag(flags.params, undefined);
    const result = await fetchRpc({ host, port, token, method, params });
    print(result);
    return;
  }

  if (cmd === 'doctor') {
    const agentId = flags.agentId;
    const skipTool = flags.skipTool === 'true';

    const report: Record<string, any> = {
      ok: true,
      target: { host, port },
      checks: {},
    };

    const fail = (name: string, err: unknown) => {
      report.ok = false;
      report.checks[name] = {
        ok: false,
        error: err instanceof Error ? err.message : String(err ?? 'error'),
      };
    };

    try {
      const ping = await fetchRpc({ host, port, token, method: 'relay.ping' });
      report.checks.ping = { ok: true, result: ping };
    } catch (err) {
      fail('ping', err);
      print(report);
      process.exit(2);
    }

    let agents: any[] = [];
    try {
      agents = (await fetchRpc({ host, port, token, method: 'agents.list' })) as any[];
      report.checks.agents = { ok: true, count: Array.isArray(agents) ? agents.length : 0, agents };
    } catch (err) {
      fail('agents', err);
    }

    let resolvedAgentId: string | null = agentId || null;
    if (!resolvedAgentId) {
      try {
        const def = (await fetchRpc({ host, port, token, method: 'agents.default.get' })) as any;
        resolvedAgentId = typeof def?.agentId === 'string' ? def.agentId : null;
        report.checks.defaultAgent = { ok: true, agentId: resolvedAgentId };
      } catch (err) {
        fail('defaultAgent', err);
      }
    } else {
      report.checks.defaultAgent = { ok: true, agentId: resolvedAgentId, source: 'flag' };
    }

    const connected = Array.isArray(agents) ? agents.some((a) => a?.agentId === resolvedAgentId) : false;
    if (resolvedAgentId && !connected) {
      report.ok = false;
      report.checks.agentConnected = {
        ok: false,
        agentId: resolvedAgentId,
        hint: 'AgentId not in agents.list. Ensure the extension is loaded from dist/ and Relay is enabled/applied.',
      };
    } else {
      report.checks.agentConnected = { ok: true, agentId: resolvedAgentId };
    }

    try {
      const params = resolvedAgentId ? { agentId: resolvedAgentId } : undefined;
      const tools = await fetchRpc({ host, port, token, method: 'tools.list', params });
      report.checks.tools = { ok: true, toolCount: Array.isArray(tools) ? tools.length : null, tools };
    } catch (err) {
      fail('tools', err);
    }

    if (!skipTool) {
      try {
        const params = resolvedAgentId
          ? { agentId: resolvedAgentId, tool: 'getTabs', args: {} }
          : { tool: 'getTabs', args: {} };
        const result = await fetchRpc({ host, port, token, method: 'tool.call', params });
        report.checks.forwarding = { ok: true, tool: 'getTabs', result };
      } catch (err) {
        fail('forwarding', err);
      }
    } else {
      report.checks.forwarding = { ok: true, skipped: true };
    }

    print(report);
    if (!report.ok) process.exit(2);
    return;
  }

  if (cmd === 'agents') {
    const result = await fetchRpc({ host, port, token, method: 'agents.list' });
    print(result);
    return;
  }

  if (cmd === 'default-agent') {
    const action = positional[1] || '';
    if (action === 'get') {
      print(await fetchRpc({ host, port, token, method: 'agents.default.get' }));
      return;
    }
    if (action === 'set') {
      const agentId = positional[2];
      if (!agentId) die('default-agent set: missing agentId');
      print(await fetchRpc({ host, port, token, method: 'agents.default.set', params: { agentId } }));
      return;
    }
    die('default-agent: expected get|set');
  }

  if (cmd === 'tools') {
    const agentId = flags.agentId;
    const params = agentId ? { agentId } : undefined;
    const result = await fetchRpc({ host, port, token, method: 'tools.list', params });
    print(result);
    return;
  }

  if (cmd === 'tool') {
    const tool = positional[1];
    if (!tool) die('tool: missing toolName');
    const args = readJsonFlag(flags.args, {});
    const agentId = flags.agentId;
    const params = agentId ? { agentId, tool, args } : { tool, args };
    const result = await fetchRpc({ host, port, token, method: 'tool.call', params });
    print(result);
    return;
  }

  if (cmd === 'run') {
    const prompt = positional.slice(1).join(' ').trim();
    if (!prompt) die('run: missing prompt');

    const agentId = flags.agentId;
    const tabsRaw = flags.tabs || 'active';
    const timeoutMs = Number(flags.timeoutMs || 600_000);
    const selectedTabIds =
      tabsRaw === 'active'
        ? null
        : tabsRaw
            .split(',')
            .map((p) => Number(p.trim()))
            .filter((n) => Number.isFinite(n) && n > 0);

    const startParams: Record<string, unknown> = { prompt };
    if (selectedTabIds && selectedTabIds.length) startParams.selectedTabIds = selectedTabIds;
    if (agentId) startParams.agentId = agentId;

    const started = (await fetchRpc({ host, port, token, method: 'agent.run', params: startParams })) as any;
    const runId = typeof started?.runId === 'string' ? started.runId : '';
    if (!runId) {
      print(started);
      return;
    }
    const waited = await fetchRpc({ host, port, token, method: 'run.wait', params: { runId, timeoutMs } });
    print(waited);
    return;
  }

  die(`Unknown command: ${cmd}`);
};

await main();
