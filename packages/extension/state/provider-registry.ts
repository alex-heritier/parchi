import type { ProviderInstance, ProviderModelEntry } from '@parchi/shared';
import { OAUTH_PROVIDERS } from '../oauth/providers.js';
import type { OAuthProviderKey } from '../oauth/types.js';
import { getProviderDefinition } from '../ai/providers/registry.js';

type SettingsLike = Record<string, any>;

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};

const asString = (value: unknown) => String(value || '').trim();

export const normalizeProviderType = (value: unknown) => asString(value).toLowerCase();

export const isProviderRegistry = (value: unknown): value is Record<string, ProviderInstance> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return true;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'provider';

const hashBasis = (providerType: string, authType: string, endpoint: string, key: string, name: string) =>
  `${providerType}|${authType}|${endpoint}|${key}|${name}`.toLowerCase();

export const buildProviderInstanceId = (input: {
  providerType: string;
  authType: ProviderInstance['authType'];
  customEndpoint?: string;
  apiKey?: string;
  oauthProviderKey?: string;
  name?: string;
}) => {
  const basis = hashBasis(
    input.providerType,
    input.authType,
    asString(input.customEndpoint),
    input.authType === 'oauth' ? asString(input.oauthProviderKey) : asString(input.apiKey),
    asString(input.name),
  );
  let hash = 2166136261;
  for (let i = 0; i < basis.length; i += 1) {
    hash ^= basis.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${slugify(input.name || input.providerType)}-${Math.abs(hash >>> 0).toString(36)}`;
};

const normalizeModels = (models: unknown, fallbackModelId = ''): ProviderModelEntry[] => {
  const out: ProviderModelEntry[] = [];
  const seen = new Set<string>();
  const pushModel = (entry: ProviderModelEntry | null | undefined) => {
    const id = asString(entry?.id);
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({
      id,
      label: asString(entry?.label) || undefined,
      contextWindow: Number.isFinite(Number(entry?.contextWindow)) ? Number(entry?.contextWindow) : undefined,
      supportsVision: entry?.supportsVision === true,
      addedManually: entry?.addedManually === true,
    });
  };

  if (Array.isArray(models)) {
    for (const model of models) {
      if (typeof model === 'string') {
        pushModel({ id: model });
        continue;
      }
      pushModel(model as ProviderModelEntry);
    }
  }

  if (fallbackModelId) {
    pushModel({ id: fallbackModelId, addedManually: true });
  }

  return out;
};

const buildProviderFromProfile = (
  profileName: string,
  profile: Record<string, any>,
  existingProviders: Record<string, ProviderInstance>,
) => {
  const providerType = normalizeProviderType(profile.provider);
  const authType: ProviderInstance['authType'] = providerType.endsWith('-oauth')
    ? 'oauth'
    : providerType === 'parchi'
      ? 'managed'
      : 'api-key';
  const oauthProviderKey = authType === 'oauth' ? (providerType.replace(/-oauth$/, '') as OAuthProviderKey) : undefined;
  const providerName =
    asString(profile.providerLabel) ||
    (authType === 'oauth'
      ? OAUTH_PROVIDERS[oauthProviderKey || 'claude']?.name
      : getProviderDefinition(providerType)?.name || profileName);
  const customEndpoint = asString(profile.customEndpoint);
  const apiKey = asString(profile.apiKey);
  const id =
    asString(profile.providerId) ||
    buildProviderInstanceId({
      providerType,
      authType,
      customEndpoint,
      apiKey,
      oauthProviderKey,
      name: providerName,
    });
  const now = Date.now();
  const prior = existingProviders[id];
  const def = getProviderDefinition(providerType);
  const models = normalizeModels(prior?.models, asString(profile.model || profile.modelId));
  return {
    id,
    name: providerName,
    providerType,
    authType,
    apiKey: authType === 'api-key' ? apiKey : '',
    customEndpoint,
    extraHeaders: asRecord(profile.extraHeaders),
    oauthProviderKey,
    oauthEmail: prior?.oauthEmail,
    oauthError: prior?.oauthError,
    isConnected: authType === 'oauth' ? prior?.isConnected === true : authType === 'managed' ? true : Boolean(apiKey),
    models: models.length > 0 ? models : normalizeModels(def?.models, asString(profile.model || profile.modelId)),
    supportsImages: prior?.supportsImages ?? profile.supportsImages ?? undefined,
    createdAt: Number(prior?.createdAt || now),
    updatedAt: now,
    source: prior?.source || 'migration',
  } satisfies ProviderInstance;
};

export const getProviderRegistry = (settings: SettingsLike): Record<string, ProviderInstance> => {
  const providers = isProviderRegistry(settings.providers) ? settings.providers : {};
  return { ...providers };
};

export const listProviderInstances = (settings: SettingsLike): ProviderInstance[] =>
  Object.values(getProviderRegistry(settings)).sort((a, b) => a.name.localeCompare(b.name));

export const getProviderInstance = (settings: SettingsLike, providerId: string): ProviderInstance | null => {
  if (!providerId) return null;
  return getProviderRegistry(settings)[providerId] || null;
};

export const ensureProviderModel = (
  provider: ProviderInstance,
  model: Partial<ProviderModelEntry> | string | null | undefined,
): ProviderInstance => {
  if (!model) return provider;
  const entry =
    typeof model === 'string'
      ? ({ id: model, addedManually: true } satisfies ProviderModelEntry)
      : ({
          id: asString(model.id),
          label: asString(model.label) || undefined,
          contextWindow: Number.isFinite(Number(model.contextWindow)) ? Number(model.contextWindow) : undefined,
          supportsVision: model.supportsVision === true,
          addedManually: model.addedManually === true,
        } satisfies ProviderModelEntry);
  if (!entry.id) return provider;
  const existing = normalizeModels(provider.models);
  if (existing.some((item) => item.id === entry.id)) return provider;
  return { ...provider, models: [...existing, entry], updatedAt: Date.now() };
};

export const materializeProfileWithProvider = (
  settings: SettingsLike,
  _name: string,
  profile: Record<string, any>,
): Record<string, any> => {
  const providers = getProviderRegistry(settings);
  const providerId = asString(profile.providerId);
  const provider = providerId ? providers[providerId] : null;
  if (!provider) return profile;
  const modelId = asString(profile.modelId || profile.model);
  return {
    ...profile,
    providerId,
    modelId: modelId || profile.model || '',
    provider: provider.providerType,
    providerLabel: provider.name,
    apiKey: provider.authType === 'api-key' ? asString(provider.apiKey) : '',
    customEndpoint: asString(provider.customEndpoint),
    extraHeaders: asRecord(provider.extraHeaders),
    model: modelId || asString(profile.model),
  };
};

export const migrateSettingsToProviderRegistry = (settings: SettingsLike): SettingsLike => {
  const next: SettingsLike = { ...settings };
  const providers = getProviderRegistry(next);
  const configs = asRecord(next.configs);
  const migratedConfigs: Record<string, any> = {};

  for (const [name, rawProfile] of Object.entries(configs)) {
    const profile = asRecord(rawProfile);
    if (!profile.providerId && profile.provider) {
      const instance = buildProviderFromProfile(name, profile, providers);
      providers[instance.id] = ensureProviderModel(instance, asString(profile.model));
      migratedConfigs[name] = {
        ...profile,
        providerId: instance.id,
        modelId: asString(profile.modelId || profile.model),
        providerLabel: profile.providerLabel || instance.name,
      };
      continue;
    }

    migratedConfigs[name] = materializeProfileWithProvider({ ...next, providers }, name, profile);
  }

  if (!migratedConfigs.default) {
    migratedConfigs.default = {
      providerId: '',
      modelId: '',
      provider: asString(next.provider),
      model: asString(next.model),
      apiKey: asString(next.apiKey),
      customEndpoint: asString(next.customEndpoint),
      extraHeaders: asRecord(next.extraHeaders),
      systemPrompt: asString(next.systemPrompt),
    };
    if (migratedConfigs.default.provider) {
      const instance = buildProviderFromProfile('default', migratedConfigs.default, providers);
      providers[instance.id] = ensureProviderModel(instance, asString(migratedConfigs.default.model));
      migratedConfigs.default.providerId = instance.id;
      migratedConfigs.default.modelId = asString(migratedConfigs.default.model);
      migratedConfigs.default.providerLabel = instance.name;
    }
  }

  next.providers = providers;
  next.configs = migratedConfigs;

  const activeConfigName = asString(next.activeConfig) || 'default';
  const activeProfile = materializeProfileWithProvider(next, activeConfigName, asRecord(migratedConfigs[activeConfigName]));
  next.provider = asString(activeProfile.provider);
  next.apiKey = asString(activeProfile.apiKey);
  next.model = asString(activeProfile.modelId || activeProfile.model);
  next.customEndpoint = asString(activeProfile.customEndpoint);
  next.extraHeaders = asRecord(activeProfile.extraHeaders);
  next.activeConfig = activeConfigName;

  return next;
};
