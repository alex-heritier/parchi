import type http from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import type { JsonRpcId } from '../../shared/src/json-rpc.js';

export type AgentHello = {
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

export type AgentConnection = {
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

export type RunRecord = {
  runId: string;
  agentId: string;
  createdAt: number;
  updatedAt: number;
  events: unknown[];
  done: null | {
    status: 'completed' | 'failed' | 'stopped';
    final?: unknown;
    error?: unknown;
  };
  waiters: Array<(value: RunRecord) => void>;
};

export const json = (res: http.ServerResponse, status: number, payload: unknown) => {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
};

export const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return null;
  return JSON.parse(raw);
};

export const now = () => Date.now();

export const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};
