import { OAUTH_PROVIDERS, fetchProviderModels } from '../../../oauth/manager.js';
import { normalizeOAuthModelIdForProvider } from '../../../oauth/model-normalization.js';
import type { OAuthProviderKey } from '../../../oauth/types.js';
import type { OAuthProviderConfig } from '../../../oauth/types.js';
import type { SidePanelUI } from '../core/panel-ui.js';

const OAUTH_PROFILE_PREFIX = 'oauth:';

function oauthProfileName(key: string): string {
  return `${OAUTH_PROFILE_PREFIX}${key}`;
}

function isOAuthProfile(name: string): boolean {
  return name.startsWith(OAUTH_PROFILE_PREFIX);
}

function oauthKeyFromProfile(name: string): string | null {
  if (!isOAuthProfile(name)) return null;
  return name.slice(OAUTH_PROFILE_PREFIX.length);
}

/**
 * Ensures an auto-managed profile exists for each connected OAuth provider.
 * Removes profiles for disconnected providers. Preserves user model choice.
 */
export async function syncOAuthProfiles(ui: SidePanelUI): Promise<void> {
  const states = await ui.getAllOAuthProviderStates?.();
  const configs = ui.configs || {};
  let changed = false;

  for (const config of Object.values(OAUTH_PROVIDERS)) {
    const profileName = oauthProfileName(config.key);
    const state = states?.[config.key];
    const connected = Boolean(state?.connected && state?.tokens?.accessToken);
    let discoveredModels: string[] = [];

    if (connected) {
      try {
        discoveredModels = await fetchProviderModels(config.key as OAuthProviderKey);
      } catch {
        discoveredModels = [];
      }
    }

    const defaultModel = normalizeOAuthModelIdForProvider(
      config.key,
      discoveredModels[0] || config.models[0]?.id || '',
    );

    if (connected && !configs[profileName]) {
      configs[profileName] = {
        provider: `${config.key}-oauth`,
        apiKey: '',
        model: defaultModel,
        customEndpoint: '',
        extraHeaders: {},
        systemPrompt: ui.getDefaultSystemPrompt?.() || '',
        temperature: 0.7,
        maxTokens: 4096,
        contextLimit:
          config.models.find((model) => model.id === defaultModel)?.contextWindow ||
          config.models[0]?.contextWindow ||
          200000,
        timeout: 30000,
      };
      changed = true;
    } else if (connected && configs[profileName]) {
      const existing = configs[profileName] as Record<string, any>;
      const currentModel = String(existing?.model || '').trim();
      const normalizedModel = normalizeOAuthModelIdForProvider(config.key, currentModel);
      const nextModel = normalizedModel || defaultModel;
      if (String(existing?.apiKey || '').trim()) {
        existing.apiKey = '';
        changed = true;
      }
      if (nextModel && nextModel !== currentModel) {
        existing.model = nextModel;
        const matchedContextWindow = config.models.find((model) => model.id === nextModel)?.contextWindow;
        if (matchedContextWindow) {
          existing.contextLimit = matchedContextWindow;
        }
        changed = true;
      }
    } else if (!connected && configs[profileName]) {
      delete configs[profileName];
      if (ui.currentConfig === profileName) {
        ui.currentConfig = 'default';
      }
      changed = true;
    }
  }

  if (changed) {
    ui.configs = configs;
    await ui.persistAllSettings?.({ silent: true });
    ui.refreshConfigDropdown?.();
    ui.populateModelSelect?.();
  }
}

export function getOAuthConfigForProfile(profileName: string): OAuthProviderConfig | null {
  const key = oauthKeyFromProfile(profileName);
  if (!key) return null;
  return (OAUTH_PROVIDERS as any)[key] || null;
}

export function getOAuthModelsForProvider(providerKey: string): Array<{ id: string; label: string }> {
  const baseKey = providerKey.replace(/-oauth$/, '');
  const config = (OAUTH_PROVIDERS as any)[baseKey];
  if (!config) return [];
  return config.models.map((m: any) => ({ id: m.id, label: m.label }));
}

export function getOAuthProfileNameForProvider(key: string): string {
  return oauthProfileName(key);
}
