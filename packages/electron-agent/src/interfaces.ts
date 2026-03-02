import type { JsonRpcRequest } from '@parchi/shared';

export interface RelayTransport {
  send(payload: unknown): void;
}

export interface RelayRpcHandler {
  onRequest(request: JsonRpcRequest): Promise<unknown>;
}
