type ClassifiedError = {
  category: 'auth' | 'rate_limit' | 'network' | 'model' | 'timeout' | 'context_length' | 'server' | 'unknown';
  message: string;
  action?: string;
  recoverable: boolean;
};

type ManagedSignalInput = {
  route?: string;
  provider?: string;
  model?: string;
  useProxy?: boolean;
};

export function detectManagedRouteSignal(context: ManagedSignalInput, combined: string) {
  const contextSignalsManaged =
    context.route === 'proxy' ||
    context.useProxy === true ||
    String(context.provider || '').toLowerCase() === 'parchi' ||
    String(context.model || '')
      .toLowerCase()
      .startsWith('parchi/');
  return (
    contextSignalsManaged ||
    combined.includes('/ai-proxy') ||
    combined.includes('convex') ||
    combined.includes('parchi managed') ||
    combined.includes('parchi/') ||
    combined.includes('insufficient credits') ||
    combined.includes('subscription is not active') ||
    combined.includes('recovery token')
  );
}

export function classifyManagedRuntimeSpecialCase(
  statusCode: number,
  combined: string,
  hasManagedRouteSignal: boolean,
) {
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
    } satisfies ClassifiedError;
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
    } satisfies ClassifiedError;
  }

  if (
    hasManagedRouteSignal &&
    (combined.includes('could not parse jwt payload') ||
      combined.includes('valid jwt format') ||
      combined.includes('base64-encoded parts separated by dots') ||
      combined.includes('refreshing paid runtime session'))
  ) {
    return {
      category: 'auth',
      message: 'Managed runtime session is invalid or expired.',
      action: 'Sign in again in Account & Billing to refresh your paid session.',
      recoverable: false,
    } satisfies ClassifiedError;
  }

  return null;
}
