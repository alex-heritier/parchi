import { getAuthUserId } from '@convex-dev/auth/server';
import { anyApi, httpActionGeneric } from 'convex/server';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type,x-api-key,anthropic-version',
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
  return suffix || defaultPath;
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

  let payload: Record<string, any>;
  try {
    payload = (await request.json()) as Record<string, any>;
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON payload' });
  }

  // Estimate cost: ~$0.03/1K tokens → 0.003 cents/token, minimum 1 cent
  const maxTokens = Number(payload?.max_tokens || payload?.maxTokens || 4096);
  const estimatedCostCents = Math.max(1, Math.ceil(maxTokens * 0.003));

  // Deduct credits upfront (best-effort for streaming responses)
  if (creditBalance > 0) {
    await ctx.runMutation(anyApi.subscriptions.deductCredits, {
      userId,
      amountCents: Math.min(estimatedCostCents, creditBalance),
    });
  }

  await ctx.runMutation(anyApi.subscriptions.recordUsage, {
    userId,
    requestCountIncrement: 1,
    tokenEstimate: maxTokens,
  });

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
  const upstream = await fetch(upstreamUrl, {
    method: 'POST',
    headers: upstreamHeaders,
    body: JSON.stringify(body),
  });

  const responseHeaders = new Headers(corsHeaders);
  const contentType = upstream.headers.get('content-type');
  if (contentType) responseHeaders.set('content-type', contentType);
  const cacheControl = upstream.headers.get('cache-control');
  if (cacheControl) responseHeaders.set('cache-control', cacheControl);

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
});
