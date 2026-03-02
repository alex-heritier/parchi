import type { JsonRpcRequest } from '../../shared/src/json-rpc.js';

export interface RelayTransport {
  send(payload: unknown): void;
}

export interface RelayRpcHandler {
  onRequest(request: JsonRpcRequest): Promise<unknown>;
}
