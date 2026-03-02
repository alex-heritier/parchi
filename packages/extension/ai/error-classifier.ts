export type ErrorCategory =
  | 'auth'
  | 'rate_limit'
  | 'network'
  | 'model'
  | 'timeout'
  | 'context_length'
  | 'server'
  | 'unknown';

export type ClassifiedError = {
  category: ErrorCategory;
  message: string;
  action?: string;
  recoverable: boolean;
};

export type ErrorClassificationContext = {
  route?: string;
  provider?: string;
  proxyProvider?: string;
  model?: string;
  useProxy?: boolean;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

export function classifyApiError(error: unknown, context: ErrorClassificationContext = {}): ClassifiedError {
  const errorRecord = asRecord(error);
  const msg =
    error instanceof Error
      ? error.message
      : typeof errorRecord?.message === 'string'
        ? String(errorRecord.message)
        : String(error ?? '');
  const statusCode = Number(errorRecord?.statusCode ?? errorRecord?.status ?? 0);
  const responseBody = String(errorRecord?.responseBody ?? '');
  const contextCombined =
    `${context.route || ''} ${context.provider || ''} ${context.proxyProvider || ''} ${context.model || ''}`.toLowerCase();
  const combined = `${msg} ${responseBody} ${contextCombined}`.toLowerCase();
  const contextSignalsManaged =
    context.route === 'proxy' ||
    context.useProxy === true ||
    String(context.provider || '').toLowerCase() === 'parchi' ||
    String(context.model || '')
      .toLowerCase()
      .startsWith('parchi/');
  const hasManagedRouteSignal =
    contextSignalsManaged ||
    combined.includes('/ai-proxy') ||
    combined.includes('convex') ||
    combined.includes('parchi managed') ||
    combined.includes('parchi/') ||
    combined.includes('insufficient credits') ||
    combined.includes('subscription is not active') ||
    combined.includes('recovery token');
  const oauthProvider = String(context.provider || '')
    .trim()
    .toLowerCase();
  const hasOAuthRouteSignal =
    context.route === 'oauth' || oauthProvider.endsWith('-oauth') || combined.includes('oauth session');
  const oauthProviderLabel = oauthProvider.endsWith('-oauth') ? oauthProvider.replace(/-oauth$/, '') : 'oauth';
  const hasAuthKeySignal =
    combined.includes('invalid api key') ||
    combined.includes('invalid x-api-key') ||
    combined.includes('incorrect api key');
  const hasModelSignal =
    combined.includes('model not found') ||
    combined.includes('invalid model') ||
    combined.includes('model is unavailable') ||
    combined.includes('model not available') ||
    combined.includes('model is not available') ||
    /model[^.\n]{0,120}(does not exist|not found|unavailable|invalid)/i.test(combined);

  // Managed billing / entitlement issues
  if (
    statusCode === 402 ||
    combined.includes('insufficient credits') ||
    combined.includes('buy credits') ||
    combined.includes('subscription is not active') ||
    combined.includes('checkout session not paid')
  ) {
    return {
      category: 'auth',
      message: 'Managed access is unavailable for this request.',
      action:
        'Open Account & Billing to buy credits or reactivate your subscription. If a managed key expired, use Recover/Regenerate key.',
      recoverable: true,
    };
  }

  if (
    hasManagedRouteSignal &&
    (combined.includes('missing openrouter_api_key') || combined.includes('missing openrouter api key'))
  ) {
    return {
      category: 'auth',
      message: 'Managed runtime is missing server credentials.',
      action:
        'Set OPENROUTER_API_KEY in backend/Convex env, then deploy. Paid proxy mode uses the server key, not a user BYOK key.',
      recoverable: false,
    };
  }

  // Auth errors
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    hasAuthKeySignal ||
    combined.includes('authentication') ||
    combined.includes('unauthorized') ||
    combined.includes('forbidden') ||
    combined.includes('permission denied')
  ) {
    if (hasOAuthRouteSignal && !hasManagedRouteSignal) {
      return {
        category: 'auth',
        message: `${oauthProviderLabel} OAuth authentication failed.`,
        action: `Reconnect ${oauthProviderLabel} in Settings > OAuth, then retry.`,
        recoverable: true,
      };
    }

    const managedAuthMessage = hasAuthKeySignal
      ? 'Managed runtime key is invalid or expired.'
      : 'Managed runtime authentication failed.';
    const managedAuthAction = hasAuthKeySignal
      ? 'Fix OPENROUTER_API_KEY in backend/Convex env (use an inference key, not OPENROUTER_MANAGEMENT_KEY), then deploy.'
      : 'If you are in Paid mode, this is not your BYOK key. Refresh Account & Billing. If needed, recover/regenerate your managed key.';
    return {
      category: 'auth',
      message: hasManagedRouteSignal
        ? managedAuthMessage
        : 'Authentication failed. Credentials may be invalid or expired.',
      action: hasManagedRouteSignal ? managedAuthAction : 'If using BYOK, check your API key in Settings.',
      recoverable: false,
    };
  }

  // Rate limits
  if (
    statusCode === 429 ||
    combined.includes('rate limit') ||
    combined.includes('too many requests') ||
    combined.includes('quota exceeded') ||
    combined.includes('rate_limit')
  ) {
    return {
      category: 'rate_limit',
      message: 'Rate limit reached. Too many requests in a short time.',
      action: 'Wait a moment and try again.',
      recoverable: true,
    };
  }

  // Context length
  if (
    combined.includes('context length') ||
    combined.includes('maximum context') ||
    combined.includes('token limit') ||
    combined.includes('too many tokens') ||
    combined.includes('max_tokens') ||
    combined.includes('context_length_exceeded')
  ) {
    return {
      category: 'context_length',
      message: 'Context too long. The conversation exceeds the model limit.',
      action: 'Start a new session or reduce context.',
      recoverable: false,
    };
  }

  // Endpoint/route errors (avoid mislabeling generic 404s as model failures)
  if (
    statusCode === 404 &&
    !hasModelSignal &&
    (combined.includes('/ai-proxy') ||
      combined.includes('route not found') ||
      combined.includes('endpoint not found') ||
      combined.includes('path not found') ||
      combined.includes('deployment not found') ||
      combined.includes('convex'))
  ) {
    return {
      category: 'server',
      message: 'Runtime endpoint was not found (404).',
      action: 'Use your Convex HTTP URL (*.convex.site), and ensure ai-proxy routes are deployed.',
      recoverable: false,
    };
  }

  // Model errors
  if (hasModelSignal) {
    const detail = responseBody ? ` Upstream: ${responseBody.slice(0, 300)}` : '';
    return {
      category: 'model',
      message: `Model not found or unavailable.${detail}`,
      action:
        hasOAuthRouteSignal && !hasManagedRouteSignal
          ? 'Use the raw model ID for OAuth providers (no provider/ prefix), then retry.'
          : 'Check the model name in your profile settings.',
      recoverable: false,
    };
  }

  // Timeout
  if (
    combined.includes('timeout') ||
    combined.includes('timed out') ||
    combined.includes('deadline exceeded') ||
    combined.includes('econnaborted')
  ) {
    return {
      category: 'timeout',
      message: 'Request timed out.',
      action: 'Try again or increase the timeout in settings.',
      recoverable: true,
    };
  }

  // Network errors
  if (
    combined.includes('network') ||
    combined.includes('econnrefused') ||
    combined.includes('enotfound') ||
    combined.includes('fetch failed') ||
    combined.includes('failed to fetch') ||
    combined.includes('dns') ||
    combined.includes('socket') ||
    combined.includes('econnreset')
  ) {
    return {
      category: 'network',
      message: 'Network error. Could not reach the API.',
      action: 'Check your internet connection and endpoint URL.',
      recoverable: true,
    };
  }

  // Server errors
  if (statusCode >= 500 || combined.includes('internal server error') || combined.includes('server error')) {
    return {
      category: 'server',
      message: `Server error (${statusCode || 'unknown'}). The API provider may be experiencing issues.`,
      action: 'Try again in a few minutes.',
      recoverable: true,
    };
  }

  // Empty-200 / empty-body provider response (commonly transient overload/rate-limit edge)
  if (
    (statusCode === 200 || statusCode === 204 || statusCode === 0) &&
    (combined.includes('200 ok') ||
      combined.includes('response body was empty') ||
      combined.includes('empty response body') ||
      combined.includes('returned no body') ||
      combined.includes('no output generated'))
  ) {
    return {
      category: 'server',
      message: 'Provider returned an empty response body.',
      action: 'Wait a few seconds and retry, or switch to a fallback model.',
      recoverable: true,
    };
  }

  // Unknown
  return {
    category: 'unknown',
    message: msg || 'An unexpected error occurred.',
    action: undefined,
    recoverable: false,
  };
}
