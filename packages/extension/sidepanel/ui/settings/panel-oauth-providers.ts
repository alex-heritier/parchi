import {
  type DeviceCodeResponse,
  OAUTH_PROVIDERS,
  type OAuthProviderKey,
  cancelConnection,
  connectProvider,
  disconnect,
  fetchProviderModels,
  getAllProviderStates,
} from '../../../oauth/manager.js';
import type { OAuthProviderConfig } from '../../../oauth/types.js';
import { SidePanelUI } from '../core/panel-ui.js';

const sidePanelProto = SidePanelUI.prototype as SidePanelUI & Record<string, unknown>;

const setHidden = (el: Element | null, hidden: boolean) => el?.classList.toggle('hidden', hidden);

const OAUTH_PROFILE_PREFIX = 'oauth:';

function oauthProfileName(key: OAuthProviderKey): string {
  return `${OAUTH_PROFILE_PREFIX}${key}`;
}

function isOAuthProfile(name: string): boolean {
  return name.startsWith(OAUTH_PROFILE_PREFIX);
}

function oauthKeyFromProfile(name: string): OAuthProviderKey | null {
  if (!isOAuthProfile(name)) return null;
  return name.slice(OAUTH_PROFILE_PREFIX.length) as OAuthProviderKey;
}

/**
 * Ensures an auto-managed profile exists for each connected OAuth provider.
 * Removes profiles for disconnected providers. Preserves user model choice.
 */
async function syncOAuthProfiles(ui: any): Promise<void> {
  const states = await getAllProviderStates();
  const configs = ui.configs || {};
  let changed = false;

  for (const config of Object.values(OAUTH_PROVIDERS)) {
    const profileName = oauthProfileName(config.key);
    const state = states[config.key];
    const connected = Boolean(state?.connected && state?.tokens?.accessToken);

    if (connected && !configs[profileName]) {
      const defaultModel = config.models[0]?.id || '';
      configs[profileName] = {
        provider: `${config.key}-oauth`,
        apiKey: '',
        model: defaultModel,
        customEndpoint: '',
        extraHeaders: {},
        systemPrompt: ui.getDefaultSystemPrompt?.() || '',
        temperature: 0.7,
        maxTokens: 4096,
        contextLimit: config.models[0]?.contextWindow || 200000,
        timeout: 30000,
      };
      changed = true;
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

/** Get the OAuth config for a profile, or null if not an OAuth profile. */
export function getOAuthConfigForProfile(profileName: string): OAuthProviderConfig | null {
  const key = oauthKeyFromProfile(profileName);
  if (!key) return null;
  return OAUTH_PROVIDERS[key] || null;
}

/** Get static model list for an OAuth provider key. */
export function getOAuthModelsForProvider(providerKey: string): Array<{ id: string; label: string }> {
  const baseKey = providerKey.replace(/-oauth$/, '');
  const config = OAUTH_PROVIDERS[baseKey as OAuthProviderKey];
  if (!config) return [];
  return config.models.map((m) => ({ id: m.id, label: m.label }));
}

sidePanelProto.renderOAuthProviderGrid = async function renderOAuthProviderGrid() {
  const grid = document.getElementById('oauthProviderGrid');
  if (!grid) return;

  const states = await getAllProviderStates();
  grid.innerHTML = '';

  // Fetch models from APIs in parallel for connected providers
  const connectedKeys = Object.values(OAUTH_PROVIDERS)
    .filter((c) => {
      const s = states[c.key];
      return Boolean(s?.connected && s?.tokens?.accessToken);
    })
    .map((c) => c.key);
  const modelsByProvider: Record<string, string[]> = {};
  if (connectedKeys.length > 0) {
    const results = await Promise.all(
      connectedKeys.map(async (key) => {
        const models = await fetchProviderModels(key);
        return { key, models };
      }),
    );
    for (const { key, models } of results) {
      modelsByProvider[key] = models;
    }
  }

  for (const config of Object.values(OAUTH_PROVIDERS)) {
    const state = states[config.key];
    const connected = Boolean(state?.connected && state?.tokens?.accessToken);
    const email = state?.email || '';
    const error = state?.error || '';
    const profileName = oauthProfileName(config.key);
    const profileConfig = this.configs?.[profileName];
    const currentModel = profileConfig?.model || '';
    const fetchedModels = modelsByProvider[config.key] || [];

    const card = document.createElement('div');
    card.className = `oauth-provider-card${connected ? ' connected' : ''}`;
    card.dataset.provider = config.key;

    let statusHtml = '<span class="oauth-provider-card-status">Not connected</span>';
    if (connected) {
      const emailLine = email ? `<span class="oauth-provider-card-email">${email}</span>` : '';
      const modelList = fetchedModels.length > 0 ? fetchedModels : config.models.map((m) => m.id);
      const modelOptions = modelList
        .map(
          (id: string) =>
            `<option value="${id}"${id === currentModel ? ' selected' : ''}>${id}</option>`,
        )
        .join('');
      statusHtml = `
        ${emailLine}
        <div class="oauth-provider-model-row">
          <select class="oauth-model-select" data-provider="${config.key}">${modelOptions}</select>
        </div>
      `;
    } else if (error) {
      statusHtml = `<span class="oauth-provider-card-status oauth-error">${error}</span>`;
    }

    card.innerHTML = `
      <div class="oauth-provider-card-info">
        <span class="oauth-provider-card-name">${config.name}</span>
        ${statusHtml}
      </div>
      <div class="oauth-provider-card-actions">
        ${
          connected
            ? `<button class="btn btn-disconnect" data-action="disconnect" data-provider="${config.key}">Disconnect</button>`
            : `<button class="btn btn-primary" data-action="connect" data-provider="${config.key}">Connect</button>`
        }
      </div>
    `;
    grid.appendChild(card);
  }

  // Single delegated listener for the grid
  grid.onclick = (e: Event) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('button[data-action]') as HTMLElement | null;
    if (btn) {
      const action = btn.dataset.action;
      const provider = btn.dataset.provider as OAuthProviderKey;
      if (!provider) return;
      if (action === 'connect') void this.startOAuthConnect(provider);
      if (action === 'disconnect') void this.startOAuthDisconnect(provider);
      return;
    }
  };

  // Model select change handler
  grid.onchange = (e: Event) => {
    const select = e.target as HTMLSelectElement;
    if (!select.classList.contains('oauth-model-select')) return;
    const providerKey = select.dataset.provider as OAuthProviderKey;
    if (!providerKey) return;
    void this.updateOAuthProfileModel(providerKey, select.value);
  };
};

sidePanelProto.updateOAuthProfileModel = async function updateOAuthProfileModel(
  key: OAuthProviderKey,
  modelId: string,
) {
  const profileName = oauthProfileName(key);
  if (!this.configs?.[profileName]) return;

  const providerConfig = OAUTH_PROVIDERS[key];
  const modelInfo = providerConfig?.models.find((m: any) => m.id === modelId);

  this.configs[profileName] = {
    ...this.configs[profileName],
    model: modelId,
    contextLimit: modelInfo?.contextWindow || this.configs[profileName].contextLimit || 200000,
  };
  await this.persistAllSettings?.({ silent: true });
  this.populateModelSelect?.();
  this.updateModelDisplay?.();
  this.updateStatus(`${providerConfig?.name || key} model set to ${modelId}`, 'success');
};

sidePanelProto.startOAuthConnect = async function startOAuthConnect(key: OAuthProviderKey) {
  const config = OAUTH_PROVIDERS[key];
  if (!config) return;

  const isDeviceFlow = config.flowType === 'device_code' || config.flowType === 'device_code_pkce';

  // Update button to show loading
  const card = document.querySelector(`.oauth-provider-card[data-provider="${key}"]`);
  const statusEl = card?.querySelector('.oauth-provider-card-status') as HTMLElement | null;
  const actionsEl = card?.querySelector('.oauth-provider-card-actions') as HTMLElement | null;
  if (statusEl) statusEl.textContent = 'Connecting...';
  if (actionsEl)
    actionsEl.innerHTML = `<button class="btn btn-secondary" data-action="cancel" data-provider="${key}">Cancel</button>`;

  // Re-bind cancel
  actionsEl?.querySelector('button')?.addEventListener('click', () => {
    cancelConnection(key);
    this.renderOAuthProviderGrid();
  });

  try {
    await connectProvider(key, {
      onDeviceCode: (response: DeviceCodeResponse) => {
        this.showDeviceCodePrompt(key, response);
      },
    });

    setHidden(document.getElementById('oauthDeviceCodePrompt'), true);
    this.updateStatus(`${config.name} connected`, 'success');
    await syncOAuthProfiles(this);
    this.renderOAuthProviderGrid();
  } catch (error) {
    setHidden(document.getElementById('oauthDeviceCodePrompt'), true);
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('cancelled')) {
      this.updateStatus(`${config.name}: ${message}`, 'error');
    }
    this.renderOAuthProviderGrid();
  }
};

sidePanelProto.startOAuthDisconnect = async function startOAuthDisconnect(key: OAuthProviderKey) {
  const config = OAUTH_PROVIDERS[key];
  await disconnect(key);
  this.updateStatus(`${config?.name || key} disconnected`, 'success');
  await syncOAuthProfiles(this);
  this.renderOAuthProviderGrid();
};

sidePanelProto.showDeviceCodePrompt = function showDeviceCodePrompt(
  key: OAuthProviderKey,
  response: DeviceCodeResponse,
) {
  const config = OAUTH_PROVIDERS[key];
  const prompt = document.getElementById('oauthDeviceCodePrompt');
  const nameEl = document.getElementById('oauthDeviceCodeProviderName');
  const codeEl = document.getElementById('oauthDeviceCodeValue');
  const linkEl = document.getElementById('oauthDeviceCodeLink') as HTMLAnchorElement | null;
  const copyBtn = document.getElementById('oauthDeviceCodeCopyBtn');
  const openBtn = document.getElementById('oauthDeviceCodeOpenBtn');
  const cancelBtn = document.getElementById('oauthDeviceCodeCancelBtn');

  if (!prompt) return;

  if (nameEl) nameEl.textContent = config?.name || key;
  if (codeEl) codeEl.textContent = response.user_code;

  const verificationUrl = response.verification_uri_complete || response.verification_uri;
  if (linkEl) {
    linkEl.href = verificationUrl;
    linkEl.textContent = response.verification_uri.replace(/^https?:\/\//, '');
  }

  setHidden(prompt, false);

  // Replace event handlers (remove old, add new)
  const newCopy = copyBtn?.cloneNode(true) as HTMLElement;
  const newOpen = openBtn?.cloneNode(true) as HTMLElement;
  const newCancel = cancelBtn?.cloneNode(true) as HTMLElement;
  copyBtn?.parentNode?.replaceChild(newCopy, copyBtn);
  openBtn?.parentNode?.replaceChild(newOpen, openBtn);
  cancelBtn?.parentNode?.replaceChild(newCancel, cancelBtn);

  newCopy?.addEventListener('click', () => {
    navigator.clipboard.writeText(response.user_code).catch(() => {});
    newCopy.textContent = 'Copied';
    setTimeout(() => {
      newCopy.textContent = 'Copy Code';
    }, 1500);
  });

  newOpen?.addEventListener('click', () => {
    chrome.tabs.create({ url: verificationUrl, active: true }).catch(() => {});
  });

  newCancel?.addEventListener('click', () => {
    cancelConnection(key);
    setHidden(prompt, true);
    this.renderOAuthProviderGrid();
  });
};
