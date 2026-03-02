import type { OAuthProviderKey } from './types.js';

const OAUTH_PROVIDER_MODEL_PREFIX_ALIASES: Record<OAuthProviderKey, string[]> = {
  claude: ['claude', 'anthropic'],
  codex: ['codex', 'openai'],
  copilot: ['copilot', 'github-copilot', 'githubcopilot', 'github'],
  qwen: ['qwen'],
};

const toBaseProviderKey = (providerKey: string) => providerKey.trim().toLowerCase().replace(/-oauth$/i, '');

export function normalizeOAuthModelIdForProvider(providerKey: string, modelId: string): string {
  let model = String(modelId || '').trim();
  if (!model) return '';

  const baseProviderKey = toBaseProviderKey(String(providerKey || ''));
  if (!baseProviderKey || !model.includes('/')) return model;

  const aliases = OAUTH_PROVIDER_MODEL_PREFIX_ALIASES[baseProviderKey as OAuthProviderKey] || [baseProviderKey];
  const stripPrefixes = new Set([baseProviderKey, ...aliases].map((alias) => alias.toLowerCase()));

  for (let i = 0; i < 2; i += 1) {
    const slashIndex = model.indexOf('/');
    if (slashIndex <= 0) break;
    const prefix = model.slice(0, slashIndex).trim().toLowerCase();
    if (!stripPrefixes.has(prefix)) break;
    model = model.slice(slashIndex + 1).trim();
    if (!model) return '';
  }

  return model;
}

export function normalizeOAuthModelIdsForProvider(providerKey: string, modelIds: string[]): string[] {
  const normalized = modelIds
    .map((modelId) => normalizeOAuthModelIdForProvider(providerKey, modelId))
    .filter((modelId) => modelId.length > 0);
  return Array.from(new Set(normalized));
}
