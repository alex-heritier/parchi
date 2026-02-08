import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import type { IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import {
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcResponse,
  type JsonRpcId,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from './protocol.js';

type AgentHello = {
  agentId: string;
  name?: string;
  version?: string;
  browser?: string;
  userAgent?: string;
  capabilities?: {
    tools?: boolean;
    agentRun?: boolean;
  };
};

type AgentConnection = {
  agentId: string;
  ws: WebSocket;
  hello: AgentHello;
  connectedAt: number;
  lastSeenAt: number;
  pending: Map<
    JsonRpcId,
    {
      resolve: (value: unknown) => void;
      reject: (err: Error) => void;
      timeoutId: ReturnType<typeof setTimeout>;
    }
  >;
};

type RunRecord = {
  runId: string;
  agentId: string;
  createdAt: number;
  updatedAt: number;
  events: unknown[];
  done:
    | null
    | {
        status: 'completed' | 'failed' | 'stopped';
        final?: unknown;
        error?: unknown;
      };
  waiters: Array<(value: RunRecord) => void>;
};

const json = (res: http.ServerResponse, status: number, payload: unknown) => {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
};

const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return null;
  return JSON.parse(raw);
};

const parseArgs = (argv: string[]) => {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [k, v] = arg.slice(2).split('=');
    out[k] = v ?? 'true';
  }
  return out;
};

const now = () => Date.now();

class RelayDaemon {
  private token: string;
  private host: string;
  private port: number;
  private server: http.Server;
  private wss: WebSocketServer;
  private agents: Map<string, AgentConnection>;
  private defaultAgentId: string | null;
  private runs: Map<string, RunRecord>;

  constructor({ token, host, port }: { token: string; host: string; port: number }) {
    this.token = token;
    this.host = host;
    this.port = port;
    this.agents = new Map();
    this.defaultAgentId = null;
    this.runs = new Map();

    this.server = http.createServer((req, res) => void this.handleHttp(req, res));
    this.wss = new WebSocketServer({ noServer: true });

    this.server.on('upgrade', (req, socket, head) => {
      try {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        if (url.pathname !== '/v1/extension') {
          socket.destroy();
          return;
        }
        const token = url.searchParams.get('token') || '';
        if (!this.safeTokenEqual(token, this.token)) {
          socket.destroy();
          return;
        }
        this.wss.handleUpgrade(req, socket, head, (ws) => this.onExtensionWs(ws));
      } catch {
        socket.destroy();
      }
    });
  }

  private safeTokenEqual(a: string, b: string) {
    // Avoid timing leaks for local auth.
    const aa = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (aa.length !== bb.length) return false;
    return crypto.timingSafeEqual(aa, bb);
  }

  private isAuthorized(req: IncomingMessage) {
    const auth = String(req.headers.authorization || '').trim();
    if (!auth.toLowerCase().startsWith('bearer ')) return false;
    const token = auth.slice('bearer '.length).trim();
    return this.safeTokenEqual(token, this.token);
  }

  private getDefaultAgentOrThrow(agentId?: string | null) {
    const resolved = agentId || this.defaultAgentId;
    if (!resolved) throw new Error('No default agent is set (and no agentId was provided).');
    const agent = this.agents.get(resolved);
    if (!agent) throw new Error(`Agent not connected: ${resolved}`);
    return agent;
  }

  private ensureRun(runId: string, agentId: string) {
    const existing = this.runs.get(runId);
    if (existing) return existing;
    const rec: RunRecord = {
      runId,
      agentId,
      createdAt: now(),
      updatedAt: now(),
      events: [],
      done: null,
      waiters: [],
    };
    this.runs.set(runId, rec);
    return rec;
  }

  private resolveRunWait(run: RunRecord) {
    const waiters = run.waiters.slice();
    run.waiters.length = 0;
    waiters.forEach((fn) => fn(run));
  }

  private onExtensionWs(ws: WebSocket) {
    let agentId: string | null = null;

    ws.on('message', (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(data));
      } catch {
        return;
      }

      if (isJsonRpcResponse(parsed)) {
        if (!agentId) return;
        const agent = this.agents.get(agentId);
        if (!agent) return;
        agent.lastSeenAt = now();
        const pending = agent.pending.get(parsed.id);
        if (!pending) return;
        clearTimeout(pending.timeoutId);
        agent.pending.delete(parsed.id);
        if ('error' in parsed) {
          pending.reject(new Error(parsed.error.message));
        } else {
          pending.resolve(parsed.result);
        }
        return;
      }

      if (isJsonRpcNotification(parsed)) {
        if (parsed.method === 'agent.hello') {
          const hello = (parsed.params || {}) as AgentHello;
          if (!hello || typeof hello.agentId !== 'string' || !hello.agentId.trim()) return;
          agentId = hello.agentId;
          const existing = this.agents.get(agentId);
          if (existing) {
            try {
              existing.ws.close();
            } catch {}
          }
          const conn: AgentConnection = {
            agentId,
            ws,
            hello,
            connectedAt: now(),
            lastSeenAt: now(),
            pending: new Map(),
          };
          this.agents.set(agentId, conn);
          if (!this.defaultAgentId) this.defaultAgentId = agentId;
          return;
        }

        if (parsed.method === 'run.event') {
          const params = (parsed.params || {}) as any;
          const runId = typeof params.runId === 'string' ? params.runId : '';
          if (!runId) return;
          const agent = agentId ? this.agents.get(agentId) : null;
          const rec = this.ensureRun(runId, agent?.agentId || 'unknown');
          rec.updatedAt = now();
          rec.events.push(params.event);
          return;
        }

        if (parsed.method === 'run.done') {
          const params = (parsed.params || {}) as any;
          const runId = typeof params.runId === 'string' ? params.runId : '';
          if (!runId) return;
          const agent = agentId ? this.agents.get(agentId) : null;
          const rec = this.ensureRun(runId, agent?.agentId || 'unknown');
          rec.updatedAt = now();
          rec.done = {
            status: params.status === 'completed' || params.status === 'stopped' ? params.status : 'failed',
            final: params.final,
            error: params.error,
          };
          this.resolveRunWait(rec);
          return;
        }
      }
    });

    ws.on('close', () => {
      if (!agentId) return;
      const agent = this.agents.get(agentId);
      if (!agent) return;
      if (agent.ws !== ws) return;
      this.agents.delete(agentId);
      if (this.defaultAgentId === agentId) this.defaultAgentId = null;
      for (const p of agent.pending.values()) {
        clearTimeout(p.timeoutId);
        p.reject(new Error('Agent disconnected'));
      }
      agent.pending.clear();
    });
  }

  private async callAgentRpc(agent: AgentConnection, method: string, params: unknown, timeoutMs = 120_000) {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };

    const result = await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        agent.pending.delete(id);
        reject(new Error(`Timed out waiting for agent response (${method})`));
      }, timeoutMs);

      agent.pending.set(id, {
        resolve,
        reject,
        timeoutId,
      });

      try {
        agent.ws.send(JSON.stringify(req));
      } catch (err) {
        clearTimeout(timeoutId);
        agent.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err ?? 'send failed')));
      }
    });

    return result;
  }

  private async handleRpc(method: string, params: unknown) {
    if (method === 'relay.ping') {
      return {
        ok: true,
        now: new Date().toISOString(),
        agents: this.agents.size,
        defaultAgentId: this.defaultAgentId,
      };
    }

    if (method === 'agents.list') {
      return Array.from(this.agents.values()).map((a) => ({
        agentId: a.agentId,
        name: a.hello.name || '',
        version: a.hello.version || '',
        browser: a.hello.browser || '',
        userAgent: a.hello.userAgent || '',
        connectedAt: a.connectedAt,
        lastSeenAt: a.lastSeenAt,
        capabilities: a.hello.capabilities || {},
      }));
    }

    if (method === 'agents.default.get') {
      return { agentId: this.defaultAgentId };
    }

    if (method === 'agents.default.set') {
      const agentId = (params as any)?.agentId;
      if (typeof agentId !== 'string' || !agentId) throw new Error('agentId must be a non-empty string');
      if (!this.agents.has(agentId)) throw new Error(`Agent not connected: ${agentId}`);
      this.defaultAgentId = agentId;
      return { agentId };
    }

    if (method === 'run.wait') {
      const runId = (params as any)?.runId;
      const timeoutMs = Number((params as any)?.timeoutMs || 600_000);
      if (typeof runId !== 'string' || !runId) throw new Error('runId must be provided');
      const rec = this.runs.get(runId);
      if (!rec) throw new Error(`Unknown runId: ${runId}`);
      if (rec.done) return { runId: rec.runId, done: rec.done };
      return await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error('Timed out waiting for run')), timeoutMs);
        rec.waiters.push((value) => {
          clearTimeout(timeoutId);
          resolve({ runId: value.runId, done: value.done });
        });
      });
    }

    if (method === 'run.events') {
      const runId = (params as any)?.runId;
      if (typeof runId !== 'string' || !runId) throw new Error('runId must be provided');
      const rec = this.runs.get(runId);
      if (!rec) throw new Error(`Unknown runId: ${runId}`);
      return { runId, done: rec.done, events: rec.events };
    }

    // Forward any other methods to an extension agent.
    const agentId = (params as any)?.agentId ?? null;
    const forwardedParams = (() => {
      if (!params || typeof params !== 'object' || Array.isArray(params)) return params;
      // Don’t force all methods to accept agentId on the extension side.
      const { agentId: _ignored, ...rest } = params as any;
      return rest;
    })();
    const agent = this.getDefaultAgentOrThrow(agentId);
    return await this.callAgentRpc(agent, method, forwardedParams);
  }

  private async handleHttp(req: IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/healthz') {
      json(res, 200, { ok: true });
      return;
    }

    if (url.pathname === '/v1/rpc' && req.method === 'POST') {
      if (!this.isAuthorized(req)) {
        json(res, 401, { error: 'unauthorized' });
        return;
      }

      let body: unknown;
      try {
        body = await readBody(req);
      } catch (err) {
        json(res, 400, { error: 'invalid_json', message: err instanceof Error ? err.message : String(err ?? '') });
        return;
      }

      const id = (body as any)?.id;
      const method = (body as any)?.method;
      if (!isJsonRpcRequest(body)) {
        const resp: JsonRpcResponse = {
          jsonrpc: '2.0',
          id: typeof id === 'string' || typeof id === 'number' ? id : 'invalid',
          error: { code: -32600, message: 'Invalid Request' },
        };
        json(res, 400, resp);
        return;
      }

      try {
        const result = await this.handleRpc(method, (body as any).params);
        const resp: JsonRpcResponse = { jsonrpc: '2.0', id: body.id, result };
        json(res, 200, resp);
      } catch (err) {
        const resp: JsonRpcResponse = {
          jsonrpc: '2.0',
          id: body.id,
          error: { code: -32000, message: err instanceof Error ? err.message : String(err ?? 'error') },
        };
        json(res, 200, resp);
      }
      return;
    }

    json(res, 404, { error: 'not_found' });
  }

  async start() {
    await new Promise<void>((resolve) => {
      this.server.listen(this.port, this.host, () => resolve());
    });
    console.log(`[relay] listening on http://${this.host}:${this.port}`);
    console.log(`[relay] ws extension endpoint ws://${this.host}:${this.port}/v1/extension?token=...`);
  }
}

const args = parseArgs(process.argv.slice(2));
const host = args.host || process.env.PARCHI_RELAY_HOST || '127.0.0.1';
const port = Number(args.port || process.env.PARCHI_RELAY_PORT || 17373);
const token = args.token || process.env.PARCHI_RELAY_TOKEN || '';

if (!token) {
  console.error('Missing relay token. Provide `--token=...` or set PARCHI_RELAY_TOKEN.');
  process.exit(1);
}

await new RelayDaemon({ token, host, port }).start();

