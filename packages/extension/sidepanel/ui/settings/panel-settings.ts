import { DEFAULT_AGENT_SYSTEM_PROMPT } from '@parchi/shared';
import { materializeProfileWithProvider } from '../../../state/provider-registry.js';
import {
  hydrateSettingsStore,
  patchSettingsStoreSnapshot,
  replaceSettingsStoreSnapshot,
} from '../../../state/stores/settings-store.js';
import { SidePanelUI } from '../core/panel-ui.js';
const sidePanelProto = SidePanelUI.prototype as SidePanelUI & Record<string, unknown>;

import { syncOAuthProfiles } from './oauth-profiles.js';
import { DEFAULT_THEME_ID, THEMES, applyTheme, getThemeById } from './themes.js';

const parseHeadersJson = (raw: string): Record<string, string> => {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Headers must be a JSON object');
  }
  return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, value == null ? '' : String(value)]));
};

const FONT_PRESET_STACKS: Record<string, string> = {
  default: 'var(--font-sans-default)',
  geist: 'var(--font-sans-geist)',
  soft: 'var(--font-sans-soft)',
  'dm-sans': 'var(--font-sans-dm)',
  plex: 'var(--font-sans-plex)',
  manrope: 'var(--font-sans-manrope)',
};

const FONT_STYLE_WEIGHTS: Record<string, string> = {
  normal: '400',
  medium: '500',
  semibold: '600',
};

sidePanelProto.applyUiZoom = function applyUiZoom(value: number, { persist = true } = {}) {
  const next = Number.isFinite(value) ? value : 1;
  const clamped = Math.min(1.5, Math.max(0.85, next));
  this.uiZoom = clamped;
  document.documentElement.style.setProperty('--ui-zoom', String(clamped));
  if (this.elements.uiZoom) this.elements.uiZoom.value = clamped.toFixed(2);
  if (this.elements.uiZoomValue) this.elements.uiZoomValue.textContent = `${Math.round(clamped * 100)}%`;
  if (this.elements.quickActionTextSizeValue) this.elements.quickActionTextSizeValue.textContent = `${Math.round(clamped * 100)}%`;
  if (persist) {
    void patchSettingsStoreSnapshot({ uiZoom: clamped }).catch(() => {});
  }
};

sidePanelProto.applyTypography = function applyTypography(preset: string, style: string, { persist = true } = {}) {
  const nextPreset = FONT_PRESET_STACKS[preset] ? preset : 'default';
  const nextStyle = FONT_STYLE_WEIGHTS[style] ? style : 'normal';
  this.fontPreset = nextPreset;
  this.fontStylePreset = nextStyle;
  document.documentElement.style.setProperty('--font-sans', FONT_PRESET_STACKS[nextPreset]);
  document.documentElement.style.setProperty('--font-base-weight', FONT_STYLE_WEIGHTS[nextStyle]);
  if (this.elements.fontPreset) this.elements.fontPreset.value = nextPreset;
  if (this.elements.fontStylePreset) this.elements.fontStylePreset.value = nextStyle;
  if (persist) {
    void patchSettingsStoreSnapshot({ fontPreset: nextPreset, fontStylePreset: nextStyle }).catch(() => {});
  }
};

sidePanelProto.adjustUiZoom = function adjustUiZoom(delta: number) {
  const next = (this.uiZoom || 1) + delta;
  this.applyUiZoom(next);
};

sidePanelProto.cancelSettings = async function cancelSettings() {
  await this.loadSettings();
  this.openChatView?.();
};

sidePanelProto.toggleCustomEndpoint = function toggleCustomEndpoint() {
  const provider = this.elements.provider?.value;
  const isCustom = provider === 'custom' || provider === 'kimi' || provider === 'openrouter';

  // Always show the endpoint field, but highlight when required
  if (this.elements.customEndpointGroup) {
    // Add visual emphasis when custom provider selected
    this.elements.customEndpointGroup.classList.toggle('required', isCustom);
  }

  // Update placeholder based on provider
  if (this.elements.customEndpoint) {
    if (provider === 'kimi') {
      if (
        !this.elements.customEndpoint.value ||
        this.elements.customEndpoint.value === 'https://openrouter.ai/api/v1'
      ) {
        this.elements.customEndpoint.value = 'https://api.kimi.com/coding';
      }
      this.elements.customEndpoint.placeholder = 'https://api.kimi.com/coding';
    } else if (provider === 'openrouter') {
      this.elements.customEndpoint.placeholder = 'https://openrouter.ai/api/v1';
      if (!this.elements.customEndpoint.value || this.elements.customEndpoint.value === 'https://api.kimi.com/coding') {
        this.elements.customEndpoint.value = 'https://openrouter.ai/api/v1';
      }
    } else if (isCustom) {
      this.elements.customEndpoint.placeholder = 'https://openrouter.ai/api/v1';
    } else {
      this.elements.customEndpoint.placeholder = 'Leave empty for default API URL';
    }
  }

  // Update model hint based on provider
  const modelHint = document.getElementById('modelHint');
  if (modelHint) {
    switch (provider) {
      case 'parchi':
        modelHint.textContent = 'Managed routing via your credits. Default: moonshotai/kimi-k2.5.';
        break;
      case 'anthropic':
        modelHint.textContent = 'Recommended: claude-sonnet-4-20250514';
        break;
      case 'openai':
        modelHint.textContent = 'Recommended: gpt-4o or gpt-4-turbo';
        break;
      case 'kimi':
        modelHint.textContent = 'Recommended: kimi-for-coding (or your Kimi model ID)';
        break;
      case 'openrouter':
        modelHint.textContent = 'e.g. anthropic/claude-sonnet-4, openai/gpt-4o, google/gemini-2.0-flash';
        break;
      case 'custom':
        modelHint.textContent = 'Enter the model ID from your provider';
        break;
      default:
        modelHint.textContent = '';
    }
  }
};

sidePanelProto.validateCustomEndpoint = function validateCustomEndpoint() {
  if (!this.elements.customEndpoint) return true;
  const url = this.elements.customEndpoint.value.trim();
  if (!url) return true;
  try {
    new URL(url);
    this.elements.customEndpoint.style.borderColor = '';
    return true;
  } catch {
    this.elements.customEndpoint.style.borderColor = 'var(--status-error)';
    return false;
  }
};

sidePanelProto.validateCustomHeaders = function validateCustomHeaders() {
  if (!this.elements.customHeaders) return true;
  const raw = this.elements.customHeaders.value || '';
  if (!raw.trim()) {
    this.elements.customHeaders.style.borderColor = '';
    return true;
  }
  try {
    parseHeadersJson(raw);
    this.elements.customHeaders.style.borderColor = '';
    return true;
  } catch {
    this.elements.customHeaders.style.borderColor = 'var(--status-error)';
    return false;
  }
};

sidePanelProto.validateProfileEditorHeaders = function validateProfileEditorHeaders() {
  if (!this.elements.profileEditorHeaders) return true;
  const raw = this.elements.profileEditorHeaders.value || '';
  if (!raw.trim()) {
    this.elements.profileEditorHeaders.style.borderColor = '';
    return true;
  }
  try {
    parseHeadersJson(raw);
    this.elements.profileEditorHeaders.style.borderColor = '';
    return true;
  } catch {
    this.elements.profileEditorHeaders.style.borderColor = 'var(--status-error)';
    return false;
  }
};

sidePanelProto.toggleProfileEditorEndpoint = function toggleProfileEditorEndpoint() {
  if (!this.elements.profileEditorEndpointGroup) return;
  const provider = this.elements.profileEditorProvider?.value;
  this.elements.profileEditorEndpointGroup.style.display =
    provider === 'custom' || provider === 'kimi' || provider === 'openrouter' ? 'block' : 'none';
};

sidePanelProto.switchSettingsTab = function switchSettingsTab(
  tabName: 'providers' | 'model' | 'generation' | 'advanced' | string = 'providers',
) {
  // Map legacy tab names to v4 tabs
  const tabMap: Record<string, string> = {
    connect: 'providers',
    setup: 'providers',
    oauth: 'providers',
    profiles: 'model',
    look: 'advanced',
    design: 'advanced',
    agents: 'advanced',
    system: 'advanced',
    usage: 'advanced',
  };
  const resolvedTab = (tabMap[tabName] || tabName) as 'providers' | 'model' | 'generation' | 'advanced';
  this.currentSettingsTab = resolvedTab;

  const tabs = ['providers', 'model', 'generation', 'advanced'] as const;
  const tabElements: Record<string, HTMLElement | null> = {
    providers: this.elements.settingsTabProviders || document.getElementById('settingsTabProviders'),
    model: this.elements.settingsTabModel || document.getElementById('settingsTabModel'),
    generation: this.elements.settingsTabGeneration || document.getElementById('settingsTabGeneration'),
    advanced: this.elements.settingsTabAdvanced || document.getElementById('settingsTabAdvanced'),
  };
  const btnElements: Record<string, HTMLElement | null> = {
    providers: this.elements.settingsTabProvidersBtn || document.getElementById('settingsTabProvidersBtn'),
    model: this.elements.settingsTabModelBtn || document.getElementById('settingsTabModelBtn'),
    generation: this.elements.settingsTabGenerationBtn || document.getElementById('settingsTabGenerationBtn'),
    advanced: this.elements.settingsTabAdvancedBtn || document.getElementById('settingsTabAdvancedBtn'),
  };

  for (const tab of tabs) {
    const isActive = tab === resolvedTab;
    tabElements[tab]?.classList.toggle('hidden', !isActive);
    btnElements[tab]?.classList.toggle('active', isActive);
    const pane = tabElements[tab]?.querySelector('.settings-tab-pane') as HTMLElement | null;
    pane?.classList.toggle('active', isActive);
    btnElements[tab]?.setAttribute('aria-selected', isActive ? 'true' : 'false');
  }

  if (resolvedTab === 'providers') {
    this.renderOAuthProviderGrid?.();
    this.renderPaidModeProviderGrid?.();
    this.renderApiProviderGrid?.();
  }
  if (resolvedTab === 'model') {
    this.renderModelSelectorGrid?.();
  }
  if (resolvedTab === 'generation') {
    this.populateGenerationTab?.();
  }
  if (resolvedTab === 'advanced') {
    this.renderTeamProfileList?.();
    this.renderThemeGrid?.();
  }
};

sidePanelProto.syncAccountAvatar = function syncAccountAvatar() {
  const initialsEl = this.elements.settingsAccountAvatar;
  if (!initialsEl) return;
  const label = String(this.elements.accountUserValue?.textContent || '').trim();
  const fallback = label && label !== '-' ? label : 'Account';
  const parts = fallback.split(/[\s@._-]+/).filter(Boolean);
  const initials = (parts[0]?.[0] || 'A') + (parts[1]?.[0] || '');
  initialsEl.textContent = initials.slice(0, 2).toUpperCase();
};

sidePanelProto.renderTeamProfileList = function renderTeamProfileList() {
  const list = this.elements.teamProfileList as HTMLElement | null;
  if (!list) return;
  const names = Object.keys(this.configs || {}).filter((name) => name !== this.currentConfig);
  if (!names.length) {
    list.innerHTML = '<div class="history-empty">Create more profiles to assign team roles.</div>';
    return;
  }
  list.innerHTML = names
    .map((name) => {
      const checked = this.auxAgentProfiles.includes(name) ? 'checked' : '';
      const config = materializeProfileWithProvider(
        { providers: this.providers, configs: this.configs },
        name,
        this.configs[name] || {},
      );
      return `<label class="team-profile-item">
        <input type="checkbox" data-team-profile="${this.escapeHtml(name)}" ${checked} />
        <span class="team-profile-copy">
          <span class="team-profile-name">${this.escapeHtml(name)}</span>
          <span class="team-profile-meta">${this.escapeHtml(config.providerLabel || config.provider || 'Provider')} · ${this.escapeHtml(config.model || 'No model')}</span>
        </span>
      </label>`;
    })
    .join('');
};

sidePanelProto.createProfileFromInput = function createProfileFromInput() {
  const name = (this.elements.newProfileNameInput?.value || '').trim();
  if (!name) {
    this.updateStatus('Enter a profile name first', 'warning');
    return;
  }
  if (this.configs[name]) {
    this.updateStatus('Profile already exists', 'warning');
    return;
  }
  if (this.elements.newProfileNameInput) this.elements.newProfileNameInput.value = '';
  this.createNewConfig(name);
  this.editProfile(name, true);
};

sidePanelProto.loadSettings = async function loadSettings() {
  let settings: Record<string, any> = {};
  try {
    // hydrateSettingsStore() already runs migrateSettingsToProviderRegistry()
    // via readSettingsSnapshot() — no need to double-migrate.
    settings = await hydrateSettingsStore();
  } catch (error) {
    console.error('[Parchi] Failed to load settings from storage:', error);
    this.updateStatus('Failed to load settings', 'error');
  }

  const storedConfigs = settings.configs || {};
  const baseConfig = {
    provider: '',
    apiKey: '',
    model: '',
    customEndpoint: '',
    extraHeaders: {},
    systemPrompt: this.getDefaultSystemPrompt(),
    temperature: 0.7,
    maxTokens: 4096,
    contextLimit: 200000,
    timeout: 30000,
    sendScreenshotsAsImages: false,
    screenshotQuality: 'high',
    showThinking: true,
    streamResponses: true,
    autoScroll: true,
    confirmActions: true,
    saveHistory: true,
    enableScreenshots: true,
  };

  this.configs = {
    default: { ...baseConfig, ...(storedConfigs.default || {}) },
    ...storedConfigs,
  };
  this.providers = settings.providers || {};
  const storedActiveConfig = typeof settings.activeConfig === 'string' ? settings.activeConfig : '';
  const storedActiveProvider = String(settings.provider || '')
    .trim()
    .toLowerCase();
  const storedActiveModel = String(settings.model || '').trim();
  const legacyActiveConfig = (() => {
    if (!storedActiveModel) return '';
    const profileNames = Object.keys(this.configs);
    const exactProviderModelMatch = profileNames.find((name) => {
      const config = this.configs[name] || {};
      const provider = String(config.provider || '')
        .trim()
        .toLowerCase();
      const model = String(config.model || '').trim();
      return provider === storedActiveProvider && model === storedActiveModel;
    });
    if (exactProviderModelMatch) return exactProviderModelMatch;

    return profileNames.find((name) => {
      const config = this.configs[name] || {};
      const model = String(config.model || '').trim();
      return model === storedActiveModel;
    });
  })();
  this.currentConfig = this.configs[storedActiveConfig] ? storedActiveConfig : legacyActiveConfig || 'default';
  this.auxAgentProfiles = settings.auxAgentProfiles || [];
  this.applyUiZoom(settings.uiZoom ?? 1, { persist: false });
  this.applyTypography(settings.fontPreset ?? 'default', settings.fontStylePreset ?? 'normal', { persist: false });
  this.currentTheme = settings.theme || DEFAULT_THEME_ID;
  applyTheme(this.currentTheme);
  this.renderThemeGrid?.();

  if (this.elements.visionBridge) this.elements.visionBridge.checked = settings.visionBridge !== false;
  if (this.elements.visionProfile) this.elements.visionProfile.value = settings.visionProfile || '';
  if (this.elements.orchestratorToggle) this.elements.orchestratorToggle.checked = settings.useOrchestrator === true;
  if (this.elements.orchestratorProfile) this.elements.orchestratorProfile.value = settings.orchestratorProfile || '';
  const orchEnabled = this.elements.orchestratorToggle?.checked === true;
  if (this.elements.orchestratorProfileSelectGroup)
    this.elements.orchestratorProfileSelectGroup.style.display = orchEnabled ? '' : 'none';
  if (this.elements.showThinking) this.elements.showThinking.checked = settings.showThinking !== false;
  if (this.elements.streamResponses) this.elements.streamResponses.checked = settings.streamResponses !== false;
  if (this.elements.autoScroll) this.elements.autoScroll.checked = settings.autoScroll !== false;
  if (this.elements.confirmActions) this.elements.confirmActions.checked = settings.confirmActions !== false;
  if (this.elements.saveHistory) this.elements.saveHistory.checked = settings.saveHistory !== false;
  if (this.elements.autoSaveSession)
    this.elements.autoSaveSession.value =
      settings.autoSaveSession !== undefined ? String(settings.autoSaveSession) : 'false';
  const autoSaveFolderGroup = document.getElementById('autoSaveFolderGroup');
  if (autoSaveFolderGroup) {
    autoSaveFolderGroup.style.display = this.elements.autoSaveSession?.value === 'true' ? '' : 'none';
  }
  this.timelineCollapsed = settings.timelineCollapsed !== undefined ? settings.timelineCollapsed !== false : true;

  if (this.elements.relayEnabled) this.elements.relayEnabled.checked = settings.relayEnabled === true;
  if (this.elements.relayUrl) this.elements.relayUrl.value = settings.relayUrl || 'http://127.0.0.1:17373';
  if (this.elements.relayToken) this.elements.relayToken.value = settings.relayToken || '';
  this.updateRelayStatusFromSettings?.(settings);

  const defaultPermissions = {
    read: true,
    interact: true,
    navigate: true,
    tabs: true,
    screenshots: true,
  };
  const toolPermissions = {
    ...defaultPermissions,
    ...(settings.toolPermissions || {}),
  };
  this.toolPermissions = toolPermissions;
  if (this.elements.permissionRead) this.elements.permissionRead.checked = toolPermissions.read !== false;
  if (this.elements.permissionInteract) this.elements.permissionInteract.checked = toolPermissions.interact !== false;
  if (this.elements.permissionNavigate) this.elements.permissionNavigate.checked = toolPermissions.navigate !== false;
  if (this.elements.permissionTabs) this.elements.permissionTabs.checked = toolPermissions.tabs !== false;
  if (this.elements.permissionScreenshots)
    this.elements.permissionScreenshots.checked = toolPermissions.screenshots !== false;
  if (this.elements.allowedDomains) this.elements.allowedDomains.value = settings.allowedDomains || '';

  // Ensure OAuth providers (copilot, codex, claude, qwen) are in this.providers
  // so they appear in the Model grid and profile dropdowns on startup.
  await syncOAuthProfiles(this).catch(() => {});

  this.refreshConfigDropdown();
  this.setActiveConfig(this.currentConfig, true);
  this.updateScreenshotToggleState();
  this.populateGenerationTab?.();
  this.updatePromptSections?.();
  this.renderTeamProfileList?.();
  await this.refreshAccountPanel?.({ silent: true });
  this.syncAccountAvatar?.();
};

sidePanelProto.updateRelayStatusFromSettings = function updateRelayStatusFromSettings(
  settings: Record<string, any> = {},
) {
  const connected = settings.relayConnected === true;
  if (this.elements.relayConnectedBadge) {
    this.elements.relayConnectedBadge.textContent = connected ? 'Connected' : 'Disconnected';
    this.elements.relayConnectedBadge.classList.toggle('connected', connected);
  }
  if (this.elements.relayLastErrorText) {
    const raw = settings.relayLastError;
    this.elements.relayLastErrorText.textContent = raw ? String(raw) : '';
  }
};

sidePanelProto.saveSettings = async function saveSettings() {
  this.savePromptSections?.();
  await this.persistAllSettings();
  this.populateModelSelect?.();
  this.updateModelDisplay?.();
  this.updateStatus('Settings saved successfully', 'success');
  this.openChatView?.();
};

sidePanelProto.collectCurrentFormProfile = function collectCurrentFormProfile() {
  return this.configs[this.currentConfig] || {};
};

sidePanelProto.collectToolPermissions = function collectToolPermissions() {
  const fallback = this.toolPermissions || {
    read: true,
    interact: true,
    navigate: true,
    tabs: true,
    screenshots: true,
  };
  return {
    read: this.elements.permissionRead ? this.elements.permissionRead.checked !== false : fallback.read !== false,
    interact: this.elements.permissionInteract
      ? this.elements.permissionInteract.checked !== false
      : fallback.interact !== false,
    navigate: this.elements.permissionNavigate
      ? this.elements.permissionNavigate.checked !== false
      : fallback.navigate !== false,
    tabs: this.elements.permissionTabs ? this.elements.permissionTabs.checked !== false : fallback.tabs !== false,
    screenshots: this.elements.permissionScreenshots
      ? this.elements.permissionScreenshots.checked !== false
      : fallback.screenshots !== false,
  };
};

sidePanelProto.persistAllSettings = async function persistAllSettings({ silent = false } = {}) {
  try {
    const activeProfile = materializeProfileWithProvider(
      { providers: this.providers, configs: this.configs },
      this.currentConfig,
      this.configs[this.currentConfig] || {},
    );
    const rawRelayUrl = (this.elements.relayUrl?.value || '').trim();
    const normalizedRelayUrl = rawRelayUrl && !rawRelayUrl.includes('://') ? `http://${rawRelayUrl}` : rawRelayUrl;
    // Write flat top-level keys for backward compatibility with BackgroundService.resolveProfile
    const payload: Record<string, any> = {
      providers: this.providers || {},
      providerId: activeProfile.providerId ?? '',
      provider: activeProfile.provider ?? '',
      apiKey: activeProfile.apiKey ?? '',
      modelId: activeProfile.modelId ?? activeProfile.model ?? '',
      model: activeProfile.model ?? '',
      customEndpoint: activeProfile.customEndpoint ?? '',
      extraHeaders: activeProfile.extraHeaders || {},
      systemPrompt: activeProfile.systemPrompt || this.getDefaultSystemPrompt(),
      temperature: activeProfile.temperature ?? 0.7,
      maxTokens: activeProfile.maxTokens ?? 4096,
      contextLimit: activeProfile.contextLimit ?? 200000,
      timeout: activeProfile.timeout ?? 30000,
      enableScreenshots: activeProfile.enableScreenshots ?? true,
      sendScreenshotsAsImages: activeProfile.sendScreenshotsAsImages ?? false,
      screenshotQuality: activeProfile.screenshotQuality || 'high',
      showThinking: activeProfile.showThinking !== false,
      streamResponses: activeProfile.streamResponses !== false,
      autoScroll: activeProfile.autoScroll !== false,
      confirmActions: activeProfile.confirmActions !== false,
      saveHistory: activeProfile.saveHistory !== false,
      autoSaveSession: this.elements.autoSaveSession?.value === 'true',
      visionBridge: this.elements.visionBridge?.checked !== false,
      visionProfile: this.elements.visionProfile?.value || '',
      useOrchestrator: this.elements.orchestratorToggle?.checked === true,
      orchestratorProfile: this.elements.orchestratorProfile?.value || '',
      toolPermissions: this.collectToolPermissions(),
      allowedDomains: this.elements.allowedDomains?.value || '',
      auxAgentProfiles: this.auxAgentProfiles,
      uiZoom: this.uiZoom ?? 1,
      fontPreset: this.fontPreset || 'default',
      fontStylePreset: this.fontStylePreset || 'normal',
      theme: this.currentTheme || DEFAULT_THEME_ID,
      relayEnabled: this.elements.relayEnabled?.checked === true,
      relayUrl: normalizedRelayUrl,
      relayToken: this.elements.relayToken?.value || '',
      activeConfig: this.currentConfig,
      configs: this.configs,
      controllers: [],
    };
    await replaceSettingsStoreSnapshot(payload);
    this.updateContextUsage?.();
    if (!silent) {
      this.updateStatus('Settings saved successfully', 'success');
    }
  } catch (error) {
    console.error('[Parchi] persistAllSettings error:', error);
    if (!silent) {
      this.updateStatus('Failed to save settings', 'error');
    }
    throw error;
  }
};

sidePanelProto.getDefaultSystemPrompt = function getDefaultSystemPrompt() {
  return DEFAULT_AGENT_SYSTEM_PROMPT;
};

sidePanelProto.renderThemeGrid = function renderThemeGrid() {
  const select = this.elements.themeSelect as HTMLSelectElement | null;
  const preview = this.elements.themePreview as HTMLElement | null;
  if (!select) return;

  select.innerHTML = THEMES.map(
    (theme) => `<option value="${this.escapeHtml(theme.id)}">${this.escapeHtml(theme.name)}</option>`,
  ).join('');

  const activeThemeId = getThemeById(this.currentTheme || '') ? this.currentTheme : THEMES[0]?.id || DEFAULT_THEME_ID;
  this.currentTheme = activeThemeId;
  select.value = activeThemeId;

  if (preview) {
    const activeTheme = getThemeById(activeThemeId) || THEMES[0];
    if (activeTheme) {
      preview.innerHTML = `
        <div class="theme-preview-pill">
          <span class="theme-preview-dot" style="background:${activeTheme.preview.bg}; border-color:${activeTheme.preview.accent};"></span>
          <span class="theme-preview-name">${this.escapeHtml(activeTheme.name)}</span>
          <span class="theme-preview-count">${THEMES.length} themes</span>
        </div>
        <div class="theme-preview-swatches">
          <span class="theme-preview-swatch" style="background:${activeTheme.preview.bg}" title="Background"></span>
          <span class="theme-preview-swatch" style="background:${activeTheme.preview.card}" title="Surface"></span>
          <span class="theme-preview-swatch" style="background:${activeTheme.preview.accent}" title="Accent"></span>
          <span class="theme-preview-swatch theme-preview-foreground" style="background:${activeTheme.vars['--foreground'] || '#ffffff'}" title="Text"></span>
        </div>
      `;
    }
  }

  if (select.dataset.bound !== 'true') {
    select.addEventListener('change', () => this.setTheme(select.value));
    select.dataset.bound = 'true';
  }
};

sidePanelProto.setTheme = function setTheme(id: string) {
  this.currentTheme = id;
  applyTheme(id);
  this.renderThemeGrid();
  void patchSettingsStoreSnapshot({ theme: id }).catch(() => {});
};

sidePanelProto.updateScreenshotToggleState = function updateScreenshotToggleState() {
  const activeProfile = this.configs?.[this.currentConfig] || {};
  const wantsScreens = activeProfile.enableScreenshots !== false;
  const visionProfile = this.elements.visionProfile?.value;
  const provider = activeProfile.provider;
  const hasVision = (provider && provider !== 'custom') || visionProfile;
  const controls: Array<any> = [];
  controls.forEach((ctrl) => {
    if (!ctrl) return;
    ctrl.disabled = !wantsScreens;
    ctrl.parentElement?.classList.toggle('disabled', !wantsScreens);
  });
  if (wantsScreens && !hasVision) {
    this.updateStatus('Enable a vision-capable profile before sending screenshots.', 'warning');
  }
};

/* ============================================================================
   Orchestrator / Vision prompt sections in Prompt tab
   ============================================================================ */

sidePanelProto.updatePromptSections = function updatePromptSections() {
  // Re-query elements in case they weren't available at constructor time (loaded via template)
  const orchSection = this.elements.orchestratorPromptSection || document.getElementById('orchestratorPromptSection');
  const orchTextarea =
    this.elements.orchestratorPromptTextarea ||
    (document.getElementById('orchestratorPromptTextarea') as HTMLTextAreaElement | null);
  const visSection = this.elements.visionPromptSection || document.getElementById('visionPromptSection');
  const visTextarea =
    this.elements.visionPromptTextarea ||
    (document.getElementById('visionPromptTextarea') as HTMLTextAreaElement | null);

  // Cache
  if (orchSection) this.elements.orchestratorPromptSection = orchSection;
  if (orchTextarea) this.elements.orchestratorPromptTextarea = orchTextarea;
  if (visSection) this.elements.visionPromptSection = visSection;
  if (visTextarea) this.elements.visionPromptTextarea = visTextarea;

  // Orchestrator
  const orchEnabled = this.elements.orchestratorToggle?.checked === true;
  const orchProfileName = this.elements.orchestratorProfile?.value || this.currentConfig;
  if (orchSection) {
    orchSection.classList.toggle('hidden', !orchEnabled);
  }
  if (orchEnabled && orchTextarea) {
    const orchProfile = this.configs[orchProfileName] || {};
    orchTextarea.value = orchProfile.systemPrompt || '';
  }

  // Vision
  const visProfileName = this.elements.visionProfile?.value;
  const visEnabled = !!visProfileName && visProfileName !== '' && visProfileName !== this.currentConfig;
  if (visSection) {
    visSection.classList.toggle('hidden', !visEnabled);
  }
  if (visEnabled && visTextarea) {
    const visProfile = this.configs[visProfileName] || {};
    visTextarea.value = visProfile.systemPrompt || '';
  }
};

sidePanelProto.savePromptSections = function savePromptSections() {
  // Save orchestrator prompt back to its profile
  const orchEnabled = this.elements.orchestratorToggle?.checked === true;
  if (orchEnabled && this.elements.orchestratorPromptTextarea) {
    const orchProfileName = this.elements.orchestratorProfile?.value || this.currentConfig;
    if (this.configs[orchProfileName]) {
      this.configs[orchProfileName].systemPrompt = this.elements.orchestratorPromptTextarea.value || '';
    }
  }

  // Save vision prompt back to its profile
  const visProfileName = this.elements.visionProfile?.value;
  if (visProfileName && visProfileName !== this.currentConfig && this.elements.visionPromptTextarea) {
    if (this.configs[visProfileName]) {
      this.configs[visProfileName].systemPrompt = this.elements.visionPromptTextarea.value || '';
    }
  }
};
