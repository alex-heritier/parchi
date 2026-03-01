import { getAuthUserId } from '@convex-dev/auth/server';
import { anyApi, httpActionGeneric } from 'convex/server';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type,x-api-key,anthropic-version',
  'access-control-expose-headers': 'x-parchi-request-id,x-parchi-estimated-cost-cents,x-parchi-final-cost-cents',
  vary: 'origin',
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...corsHeaders,
    },
  });

type ProviderTarget = {
  provider: 'openai' | 'anthropic' | 'kimi' | 'openrouter';
  upstreamBaseUrl: string;
  defaultPath: string;
  upstreamApiKey: string;
};

const COST_CENTS_PER_TOKEN = Number(process.env.CREDIT_COST_CENTS_PER_TOKEN || 0.003);
const MIN_REQUEST_COST_CENTS = 1;
const CHARS_PER_TOKEN_ESTIMATE = 4;
const OPENROUTER_SAFE_FALLBACK_MODEL =
  String(process.env.OPENROUTER_FALLBACK_MODEL || 'openrouter/auto').trim() || 'openrouter/auto';

const createRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const toSafeInt = (value: unknown) => {
  const next = Math.floor(Number(value));
  if (!Number.isFinite(next) || next < 0) return 0;
  return next;
};

const costFromTokens = (tokens: number) => {
  const tokenCount = Math.max(0, toSafeInt(tokens));
  if (tokenCount === 0) return MIN_REQUEST_COST_CENTS;
  return Math.max(MIN_REQUEST_COST_CENTS, Math.ceil(tokenCount * COST_CENTS_PER_TOKEN));
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const estimatePromptTokens = (payload: Record<string, unknown>) => {
  const source = payload.messages ?? payload.input ?? payload.prompt ?? payload;
  try {
    const serialized = typeof source === 'string' ? source : JSON.stringify(source);
    return Math.ceil(String(serialized || '').length / CHARS_PER_TOKEN_ESTIMATE);
  } catch {
    return 0;
  }
};

const usageObjectToTokenCount = (usage: unknown): number | null => {
  const row = asRecord(usage);
  if (!row) return null;

  const totalTokens = toSafeInt(row.total_tokens ?? row.totalTokens);
  if (totalTokens > 0) return totalTokens;

  const promptTokens = toSafeInt(row.prompt_tokens ?? row.promptTokens ?? row.input_tokens ?? row.inputTokens ?? 0);
  const completionTokens = toSafeInt(
    row.completion_tokens ?? row.completionTokens ?? row.output_tokens ?? row.outputTokens ?? 0,
  );
  const cacheTokens = toSafeInt(row.cache_creation_input_tokens ?? row.cache_read_input_tokens ?? 0);
  const sum = promptTokens + completionTokens + cacheTokens;
  return sum > 0 ? sum : null;
};

const extractUsageTokens = (payload: unknown): number | null => {
  if (!payload || typeof payload !== 'object') return null;
  const queue: unknown[] = [payload];
  const seen = new Set<object>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (seen.has(current)) continue;
    seen.add(current);

    const currentRecord = asRecord(current);
    const directUsage = usageObjectToTokenCount(currentRecord?.usage);
    if (directUsage !== null) return directUsage;

    const selfUsage = usageObjectToTokenCount(current);
    if (selfUsage !== null) return selfUsage;

    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }

    for (const value of Object.values(currentRecord || {})) {
      if (value && typeof value === 'object') queue.push(value);
    }
  }

  return null;
};

const parseSseUsageTokens = (rawSseText: string) => {
  let usageTokens: number | null = null;
  const lines = rawSseText.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try {
      const parsed = JSON.parse(data);
      const parsedUsage = extractUsageTokens(parsed);
      if (parsedUsage !== null) usageTokens = parsedUsage;
    } catch {
      // Ignore non-JSON data lines.
    }
  }
  return usageTokens;
};

const isModelUnavailableError = (status: number, bodyText: string) => {
  if (status !== 400 && status !== 404) return false;
  const combined = String(bodyText || '').toLowerCase();
  return (
    combined.includes('model not found') ||
    combined.includes('not available') ||
    combined.includes('does not exist') ||
    combined.includes('invalid model') ||
    combined.includes('model is unavailable')
  );
};

const resolveProviderTarget = (request: Request): ProviderTarget | null => {
  const requestPath = new URL(request.url).pathname;
  if (requestPath.startsWith('/ai-proxy/anthropic')) {
    return {
      provider: 'anthropic',
      upstreamBaseUrl: 'https://api.anthropic.com',
      defaultPath: '/v1/messages',
      upstreamApiKey: String(process.env.ANTHROPIC_API_KEY || '').trim(),
    };
  }
  if (requestPath.startsWith('/ai-proxy/kimi')) {
    return {
      provider: 'kimi',
      upstreamBaseUrl: String(process.env.KIMI_BASE_URL || 'https://api.kimi.com/coding').replace(/\/+$/, ''),
      defaultPath: '/v1/messages',
      upstreamApiKey: String(process.env.KIMI_API_KEY || '').trim(),
    };
  }
  if (requestPath.startsWith('/ai-proxy/openrouter')) {
    return {
      provider: 'openrouter',
      upstreamBaseUrl: 'https://openrouter.ai/api',
      defaultPath: '/v1/chat/completions',
      upstreamApiKey: String(process.env.OPENROUTER_API_KEY || '').trim(),
    };
  }
  if (requestPath.startsWith('/ai-proxy/openai') || requestPath === '/ai-proxy') {
    return {
      provider: 'openai',
      upstreamBaseUrl: 'https://api.openai.com/v1',
      defaultPath: '/chat/completions',
      upstreamApiKey: String(process.env.OPENAI_API_KEY || '').trim(),
    };
  }
  return null;
};

const providerPrefixMap: Record<string, string> = {
  anthropic: '/ai-proxy/anthropic',
  kimi: '/ai-proxy/kimi',
  openrouter: '/ai-proxy/openrouter',
  openai: '/ai-proxy/openai',
};

const resolveForwardPath = (request: Request, provider: string, defaultPath: string) => {
  const requestPath = new URL(request.url).pathname;
  const prefix = providerPrefixMap[provider] || '/ai-proxy/openai';
  const suffix = requestPath.startsWith(prefix) ? requestPath.slice(prefix.length) : '';
  const forwardPath = suffix || defaultPath;
  if (provider === 'openrouter' && !forwardPath.startsWith('/v1/')) {
    return `/v1${forwardPath.startsWith('/') ? '' : '/'}${forwardPath}`;
  }
  return forwardPath;
};

export const aiProxy = httpActionGeneric(async (ctx, request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const providerTarget = resolveProviderTarget(request);
  if (!providerTarget) {
    return jsonResponse(404, { error: 'Unknown AI proxy route' });
  }
  if (!providerTarget.upstreamApiKey) {
    return jsonResponse(500, { error: `Missing ${providerTarget.provider.toUpperCase()}_API_KEY` });
  }

  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  const subscription = await ctx.runQuery(anyApi.subscriptions.getByUserId, { userId });
  const creditBalance = subscription?.creditBalanceCents ?? 0;
  const hasLegacySub = Boolean(subscription && subscription.plan === 'pro' && subscription.status === 'active');
  if (creditBalance <= 0 && !hasLegacySub) {
    return jsonResponse(402, { error: 'Insufficient credits. Purchase credits to continue.' });
  }

  let payload: Record<string, unknown>;
  try {
    const parsedPayload = await request.json();
    const payloadRecord = asRecord(parsedPayload);
    if (!payloadRecord) {
      return jsonResponse(400, { error: 'Invalid JSON payload' });
    }
    payload = payloadRecord;
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON payload' });
  }

  const requestId = createRequestId();
  let settledModel = String(payload?.model || '').trim();
  const promptTokens = estimatePromptTokens(payload);
  const maxTokens = toSafeInt(payload?.max_tokens || payload?.maxTokens || 4096) || 4096;
  const estimatedTokens = Math.max(1, promptTokens + maxTokens);
  const estimatedCostCents = costFromTokens(estimatedTokens);
  const shouldTrackCredits = !hasLegacySub;

  if (payload?.stream === true && (providerTarget.provider === 'openai' || providerTarget.provider === 'openrouter')) {
    payload.stream_options = {
      ...(payload.stream_options && typeof payload.stream_options === 'object' ? payload.stream_options : {}),
      include_usage: true,
    };
  }

  if (shouldTrackCredits) {
    const reservation = await ctx.runMutation(anyApi.subscriptions.reserveCredits, {
      userId,
      amountCents: estimatedCostCents,
      requestId,
      provider: providerTarget.provider,
      model: settledModel,
      tokenEstimate: estimatedTokens,
      note: 'Reserved before forwarding to upstream provider',
    });
    if (!reservation?.success) {
      return jsonResponse(402, {
        error: 'Insufficient credits for this request. Purchase more credits to continue.',
        remainingCents: Number(reservation?.remainingCents ?? 0),
      });
    }
  }

  await ctx.runMutation(anyApi.subscriptions.recordUsage, {
    userId,
    requestCountIncrement: 1,
    tokenEstimate: estimatedTokens,
  });

  let settledOrReleased = false;
  const settleReservedCharge = async (actualTokens: number, note: string) => {
    if (!shouldTrackCredits || settledOrReleased) return null;
    settledOrReleased = true;
    const finalTokens = Math.max(0, toSafeInt(actualTokens));
    const finalCostCents = costFromTokens(finalTokens);
    try {
      await ctx.runMutation(anyApi.subscriptions.settleReservedCredits, {
        userId,
        requestId,
        reservedAmountCents: estimatedCostCents,
        finalAmountCents: finalCostCents,
        provider: providerTarget.provider,
        model: settledModel,
        tokenEstimate: estimatedTokens,
        tokenActual: finalTokens,
        note,
      });
      const tokenDelta = finalTokens - estimatedTokens;
      if (tokenDelta !== 0) {
        await ctx.runMutation(anyApi.subscriptions.adjustUsageTokens, {
          userId,
          tokenDelta,
        });
      }
    } catch (error) {
      console.error('[aiProxy] Failed to settle reserved credits', {
        requestId,
        note,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return finalCostCents;
  };

  const releaseReservedCharge = async (note: string) => {
    if (!shouldTrackCredits || settledOrReleased) return;
    settledOrReleased = true;
    try {
      await ctx.runMutation(anyApi.subscriptions.releaseReservedCredits, {
        userId,
        requestId,
        amountCents: estimatedCostCents,
        provider: providerTarget.provider,
        model: settledModel,
        tokenEstimate: estimatedTokens,
        note,
      });
      await ctx.runMutation(anyApi.subscriptions.adjustUsageTokens, {
        userId,
        tokenDelta: -estimatedTokens,
      });
    } catch (error) {
      console.error('[aiProxy] Failed to release reserved credits', {
        requestId,
        note,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const forwardPath = resolveForwardPath(request, providerTarget.provider, providerTarget.defaultPath);
  const upstreamUrl = `${providerTarget.upstreamBaseUrl}${forwardPath}`;
  const upstreamHeaders = new Headers({
    'content-type': 'application/json',
  });

  if (providerTarget.provider === 'openai') {
    upstreamHeaders.set('authorization', `Bearer ${providerTarget.upstreamApiKey}`);
  } else if (providerTarget.provider === 'openrouter') {
    upstreamHeaders.set('authorization', `Bearer ${providerTarget.upstreamApiKey}`);
    upstreamHeaders.set('http-referer', 'https://parchi.app');
    upstreamHeaders.set('x-title', 'Parchi');
  } else if (providerTarget.provider === 'anthropic') {
    upstreamHeaders.set('x-api-key', providerTarget.upstreamApiKey);
    upstreamHeaders.set('anthropic-version', request.headers.get('anthropic-version') || '2023-06-01');
  } else {
    upstreamHeaders.set('x-api-key', providerTarget.upstreamApiKey);
    upstreamHeaders.set('anthropic-version', request.headers.get('anthropic-version') || '2023-06-01');
    upstreamHeaders.set('user-agent', 'coding-agent');
  }

  const { provider: _provider, ...body } = payload;
  const makeUpstreamRequest = async (requestBody: Record<string, unknown>) =>
    fetch(upstreamUrl, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(requestBody),
    });

  let upstream: Response;
  let upstreamErrorBodyText: string | null = null;
  try {
    upstream = await makeUpstreamRequest(body);
  } catch {
    await releaseReservedCharge('Upstream network error before response');
    return jsonResponse(502, {
      error: 'Upstream provider request failed before a response was received.',
      requestId,
    });
  }

  if (!upstream.ok) {
    try {
      upstreamErrorBodyText = await upstream.text();
    } catch {
      upstreamErrorBodyText = '';
    }

    const requestedModel = String(body?.model || '').trim();
    const canRetryWithFallback =
      providerTarget.provider === 'openrouter' &&
      requestedModel.length > 0 &&
      OPENROUTER_SAFE_FALLBACK_MODEL.length > 0 &&
      requestedModel !== OPENROUTER_SAFE_FALLBACK_MODEL &&
      isModelUnavailableError(upstream.status, upstreamErrorBodyText || '');

    if (canRetryWithFallback) {
      try {
        const fallbackBody = {
          ...body,
          model: OPENROUTER_SAFE_FALLBACK_MODEL,
        };
        const fallbackResponse = await makeUpstreamRequest(fallbackBody);
        if (fallbackResponse.ok) {
          upstream = fallbackResponse;
          settledModel = OPENROUTER_SAFE_FALLBACK_MODEL;
          upstreamErrorBodyText = null;
        } else {
          upstream = fallbackResponse;
          try {
            upstreamErrorBodyText = await fallbackResponse.text();
          } catch {
            upstreamErrorBodyText = '';
          }
        }
      } catch {
        // Keep the original upstream error body when fallback request fails at network level.
      }
    }
  }

  const responseHeaders = new Headers(corsHeaders);
  const contentType = upstream.headers.get('content-type');
  if (contentType) responseHeaders.set('content-type', contentType);
  const cacheControl = upstream.headers.get('cache-control');
  if (cacheControl) responseHeaders.set('cache-control', cacheControl);
  responseHeaders.set('x-parchi-request-id', requestId);
  responseHeaders.set('x-parchi-estimated-cost-cents', String(estimatedCostCents));

  if (!upstream.ok) {
    await releaseReservedCharge(`Upstream responded with HTTP ${upstream.status}`);
    return new Response(upstreamErrorBodyText ?? upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  if (!shouldTrackCredits) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  const isStreaming = String(contentType || '').includes('text/event-stream');
  if (!isStreaming) {
    let usageTokens: number | null = null;
    try {
      const parsed = await upstream.clone().json();
      usageTokens = extractUsageTokens(parsed);
    } catch {
      usageTokens = null;
    }
    const finalCostCents = await settleReservedCharge(
      usageTokens !== null ? usageTokens : estimatedTokens,
      usageTokens !== null ? 'Settled from JSON response usage' : 'Settled using token estimate (usage missing)',
    );
    if (finalCostCents !== null && finalCostCents !== undefined) {
      responseHeaders.set('x-parchi-final-cost-cents', String(finalCostCents));
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  const upstreamBody = upstream.body;
  if (!upstreamBody) {
    const finalCostCents = await settleReservedCharge(estimatedTokens, 'Settled using estimate (empty streaming body)');
    if (finalCostCents !== null && finalCostCents !== undefined) {
      responseHeaders.set('x-parchi-final-cost-cents', String(finalCostCents));
    }
    return new Response(null, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  const decoder = new TextDecoder();
  let streamBuffer = '';
  let detectedUsageTokens: number | null = null;

  const settledStream = upstreamBody.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        const text = decoder.decode(chunk, { stream: true });
        streamBuffer += text;
        let newlineIndex = streamBuffer.indexOf('\n');
        while (newlineIndex !== -1) {
          const line = streamBuffer.slice(0, newlineIndex).trim();
          streamBuffer = streamBuffer.slice(newlineIndex + 1);
          if (line.startsWith('data:')) {
            const data = line.slice(5).trim();
            if (data && data !== '[DONE]') {
              try {
                const parsed = JSON.parse(data);
                const usageTokens = extractUsageTokens(parsed);
                if (usageTokens !== null) detectedUsageTokens = usageTokens;
              } catch {
                // Ignore non-JSON SSE payloads.
              }
            }
          }
          newlineIndex = streamBuffer.indexOf('\n');
        }
      },
      async flush() {
        const tail = decoder.decode();
        if (tail) {
          streamBuffer += tail;
        }
        if (streamBuffer.trim().length > 0) {
          const usageFromTail = parseSseUsageTokens(streamBuffer);
          if (usageFromTail !== null) detectedUsageTokens = usageFromTail;
        }
        await settleReservedCharge(
          detectedUsageTokens !== null ? detectedUsageTokens : estimatedTokens,
          detectedUsageTokens !== null
            ? 'Settled from SSE stream usage'
            : 'Settled using token estimate (SSE usage missing)',
        );
      },
    }),
  );

  return new Response(settledStream, {
    status: upstream.status,
    headers: responseHeaders,
  });
});
