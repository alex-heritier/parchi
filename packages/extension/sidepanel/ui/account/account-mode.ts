export const ACCOUNT_MODE_KEY = 'accountModeChoice';
export const ACCOUNT_MODE_BYOK = 'byok';
export const ACCOUNT_MODE_PAID = 'paid';

const hasByokCredentialsInProfile = (profile: any) => {
  const apiKey = String(profile?.apiKey || '').trim();
  return apiKey.length > 0;
};

export const hasConfiguredByokProvider = (stored: Record<string, any>) => {
  const configs = stored?.configs && typeof stored.configs === 'object' ? stored.configs : {};
  const activeConfigName = String(stored?.activeConfig || 'default');
  const activeProfile =
    configs && typeof configs[activeConfigName] === 'object'
      ? configs[activeConfigName]
      : typeof configs.default === 'object'
        ? configs.default
        : null;
  const topLevelProfile = {
    provider: stored?.provider,
    apiKey: stored?.apiKey,
    model: stored?.model,
    customEndpoint: stored?.customEndpoint,
  };

  if (hasByokCredentialsInProfile(activeProfile)) return true;
  if (hasByokCredentialsInProfile(topLevelProfile)) return true;
  return Object.values(configs).some((profile) => hasByokCredentialsInProfile(profile));
};
