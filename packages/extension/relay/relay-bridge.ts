type JsonRpcId = string | number;

export type JsonRpcRequest = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: unknown;
};

export type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: JsonRpcId; result: unknown }
  | { jsonrpc: '2.0'; id: JsonRpcId; error: { code: number; message: string; data?: unknown } };

export type JsonRpcNotification = {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isRequest = (value: unknown): value is JsonRpcRequest => {
  if (!isObject(value)) return false;
  return value.jsonrpc === '2.0' && (typeof value.id === 'string' || typeof value.id === 'number') && typeof value.method === 'string';
};

export class RelayBridge {
  private ws: WebSocket | null;
  private enabled: boolean;
  private url: string;
  private token: string;
  private reconnectTimerId: number | null;
  private reconnectAttempt: number;
  private getHelloPayload: () => Promise<Record<string, unknown>>;
  private onRequest: (req: JsonRpcRequest) => Promise<unknown>;

  constructor({
    getHelloPayload,
    onRequest,
  }: {
    getHelloPayload: () => Promise<Record<string, unknown>>;
    onRequest: (req: JsonRpcRequest) => Promise<unknown>;
  }) {
    this.ws = null;
    this.enabled = false;
    this.url = '';
    this.token = '';
    this.reconnectTimerId = null;
    this.reconnectAttempt = 0;
    this.getHelloPayload = getHelloPayload;
    this.onRequest = onRequest;
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  configure({ enabled, url, token }: { enabled: boolean; url: string; token: string }) {
    this.enabled = enabled;
    this.url = url;
    this.token = token;
    if (!enabled) {
      this.disconnect();
      return;
    }
    if (!url || !token) {
      this.disconnect();
      return;
    }
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.connect();
  }

  disconnect() {
    if (this.reconnectTimerId) {
      clearTimeout(this.reconnectTimerId);
      this.reconnectTimerId = null;
    }
    this.reconnectAttempt = 0;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
    }
    this.ws = null;
  }

  private toWsUrl(baseUrl: string, token: string) {
    try {
      const url = new URL(baseUrl);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.pathname = '/v1/extension';
      url.searchParams.set('token', token);
      return url.toString();
    } catch {
      return null;
    }
  }

  private scheduleReconnect() {
    if (!this.enabled) return;
    if (this.reconnectTimerId) return;
    const attempt = Math.min(10, this.reconnectAttempt + 1);
    this.reconnectAttempt = attempt;
    const delay = Math.min(15_000, 250 * 2 ** (attempt - 1));
    this.reconnectTimerId = setTimeout(() => {
      this.reconnectTimerId = null;
      this.connect();
    }, delay) as any;
  }

  private connect() {
    if (!this.enabled || !this.url || !this.token) return;
    const wsUrl = this.toWsUrl(this.url, this.token);
    if (!wsUrl) {
      console.warn('[relay] invalid relayUrl:', this.url);
      return;
    }
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      console.warn('[relay] failed to create WebSocket:', err);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = async () => {
      this.reconnectAttempt = 0;
      try {
        const helloParams = await this.getHelloPayload();
        const hello: JsonRpcNotification = { jsonrpc: '2.0', method: 'agent.hello', params: helloParams };
        ws.send(JSON.stringify(hello));
      } catch (err) {
        console.warn('[relay] failed to send hello:', err);
      }
    };

    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will schedule reconnect.
    };

    ws.onmessage = (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String((event as any).data ?? ''));
      } catch {
        return;
      }
      if (!isRequest(parsed)) return;
      void this.handleRequest(ws, parsed);
    };
  }

  private async handleRequest(ws: WebSocket, req: JsonRpcRequest) {
    try {
      const result = await this.onRequest(req);
      const resp: JsonRpcResponse = { jsonrpc: '2.0', id: req.id, result };
      ws.send(JSON.stringify(resp));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err ?? 'error');
      const resp: JsonRpcResponse = { jsonrpc: '2.0', id: req.id, error: { code: -32000, message } };
      try {
        ws.send(JSON.stringify(resp));
      } catch {}
    }
  }

  notify(method: string, params: unknown) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: JsonRpcNotification = { jsonrpc: '2.0', method, params };
    try {
      this.ws.send(JSON.stringify(msg));
    } catch {}
  }
}
