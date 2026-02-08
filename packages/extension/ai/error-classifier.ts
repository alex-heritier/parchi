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

export function classifyApiError(error: unknown): ClassifiedError {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  const statusCode = (error as any)?.statusCode ?? (error as any)?.status ?? 0;
  const responseBody = String((error as any)?.responseBody ?? '');
  const combined = `${msg} ${responseBody}`.toLowerCase();

  // Auth errors
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    combined.includes('invalid api key') ||
    combined.includes('invalid x-api-key') ||
    combined.includes('incorrect api key') ||
    combined.includes('authentication') ||
    combined.includes('unauthorized') ||
    combined.includes('forbidden') ||
    combined.includes('permission denied')
  ) {
    return {
      category: 'auth',
      message: 'Authentication failed. Your API key may be invalid or expired.',
      action: 'Check your API key in Settings.',
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

  // Model errors
  if (
    statusCode === 404 ||
    combined.includes('model not found') ||
    combined.includes('does not exist') ||
    combined.includes('invalid model') ||
    combined.includes('not available')
  ) {
    return {
      category: 'model',
      message: 'Model not found or unavailable.',
      action: 'Check the model name in your profile settings.',
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

  // Unknown
  return {
    category: 'unknown',
    message: msg || 'An unexpected error occurred.',
    action: undefined,
    recoverable: false,
  };
}
