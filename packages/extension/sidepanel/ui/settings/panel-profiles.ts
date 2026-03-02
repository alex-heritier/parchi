import { SidePanelUI } from '../core/panel-ui.js';
import { normalizeOAuthModelIdForProvider } from '../../../oauth/model-normalization.js';
const sidePanelProto = SidePanelUI.prototype as SidePanelUI & Record<string, unknown>;

const parseHeadersJson = (raw: string): Record<string, string> => {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Headers must be a JSON object');
  }
  return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, value == null ? '' : String(value)]));
};

const formatHeadersJson = (headers: Record<string, any> | undefined) => {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return '';
  const entries = Object.entries(headers).filter(([_, value]) => value != null && String(value).length > 0);
  if (!entries.length) return '';
  const normalized = Object.fromEntries(entries.map(([key, value]) => [key, String(value)]));
  return JSON.stringify(normalized, null, 2);
};

const resizeProfilePromptInput = (textarea: HTMLTextAreaElement | null) => {
  if (!textarea) return;
  textarea.style.height = 'auto';
  const nextHeight = Math.min(textarea.scrollHeight, 500);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > 500 ? 'auto' : 'hidden';
};

sidePanelProto.createNewConfig = async function createNewConfig(name?: string) {
  // Read from whichever input has a value
  const inputA = this.elements.newProfileInput;
  const inputB = this.elements.newProfileNameInput;
  const trimmedName = (name || inputA?.value || inputB?.value || '').trim();
  if (!trimmedName) {
    this.updateStatus('Enter a profile name', 'warning');
    return;
  }
  if (this.configs[trimmedName]) {
    this.updateStatus('Profile already exists', 'warning');
    return;
  }

  // Clear both inputs
  if (inputA) inputA.value = '';
  if (inputB) inputB.value = '';

  // Clone the current active config so the new profile starts with sane defaults
  const current = this.configs[this.currentConfig] || {};
  this.configs[trimmedName] = {
    provider: current.provider ?? '',
    apiKey: current.apiKey ?? '',
    model: current.model ?? '',
    customEndpoint: current.customEndpoint ?? '',
    extraHeaders: current.extraHeaders || {},
    systemPrompt: current.systemPrompt || '',
    temperature: current.temperature ?? 0.7,
    maxTokens: current.maxTokens || 4096,
    contextLimit: current.contextLimit || 200000,
    timeout: current.timeout || 30000,
    sendScreenshotsAsImages: current.sendScreenshotsAsImages || false,
    screenshotQuality: current.screenshotQuality || 'high',
    streamResponses: current.streamResponses !== false,
    enableScreenshots: current.enableScreenshots || false,
    saveHistory: current.saveHistory !== false,
    showThinking: current.showThinking !== false,
    autoScroll: current.autoScroll !== false,
    confirmActions: current.confirmActions !== false,
  };

  this.refreshConfigDropdown();
  this.setActiveConfig(trimmedName, true);
  await this.persistAllSettings({ silent: true });
  this.updateStatus(`Profile "${trimmedName}" created`, 'success');
};

sidePanelProto.deleteConfig = async function deleteConfig() {
  if (this.currentConfig === 'default') {
    this.updateStatus('Cannot delete default profile', 'warning');
    return;
  }
  await this.deleteProfileByName(this.currentConfig);
};

sidePanelProto.deleteProfileByName = async function deleteProfileByName(name: string) {
  if (!name || name === 'default') {
    this.updateStatus('Cannot delete default profile', 'warning');
    return;
  }
  if (!this.configs[name]) return;

  delete this.configs[name];
  if (this.currentConfig === name) {
    this.currentConfig = 'default';
  }
  if (this.profileEditorTarget === name) {
    this.profileEditorTarget = this.currentConfig;
    this.editProfile(this.currentConfig, true);
  }
  this.refreshConfigDropdown();
  this.updateModelDisplay();
  this.setActiveConfig(this.currentConfig, true);
  await this.persistAllSettings({ silent: true });
  this.updateStatus(`Profile "${name}" deleted`, 'success');
};

sidePanelProto.switchConfig = async function switchConfig() {
  const newConfig = this.elements.activeConfig.value;
  if (!this.configs[newConfig]) {
    this.updateStatus('Profile not found', 'warning');
    return;
  }
  this.configs[this.currentConfig] = this.collectCurrentFormProfile();
  this.setActiveConfig(newConfig);
  await this.persistAllSettings({ silent: true });
};

sidePanelProto.refreshConfigDropdown = function refreshConfigDropdown() {
  if (this.elements.activeConfig) {
    this.elements.activeConfig.innerHTML = '';
    Object.keys(this.configs).forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      if (name === this.currentConfig) {
        option.selected = true;
      }
      this.elements.activeConfig.appendChild(option);
    });
  }
  this.refreshProfileSelectors();
  this.updateModelDisplay();
  this.renderProfileGrid();
  this.updateContextUsage();
};

sidePanelProto.refreshProfileSelectors = function refreshProfileSelectors() {
  const names = Object.keys(this.configs);
  const selects = [this.elements.orchestratorProfile, this.elements.visionProfile];
  selects.forEach((select) => {
    if (!select) return;
    select.innerHTML = '<option value="">Use active config</option>';
    names.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });

    const currentValue = select.value;
    if (!currentValue) return;
    if (!names.includes(currentValue)) {
      select.value = '';
    }
  });
};

sidePanelProto.renderProfileGrid = function renderProfileGrid() {
  if (!this.elements.agentGrid) return;
  this.elements.agentGrid.innerHTML = '';
  const currentVision = this.elements.visionProfile?.value;
  const currentOrchestrator = this.elements.orchestratorProfile?.value;
  const configs = Object.keys(this.configs);
  if (!configs.length) {
    this.elements.agentGrid.innerHTML = '<div class="history-empty">No profiles yet.</div>';
    return;
  }
  configs.forEach((name) => {
    const card = document.createElement('div');
    card.className = 'agent-card';
    if (name === this.profileEditorTarget) {
      card.classList.add('editing');
    }
    card.dataset.profile = name;
    const config = this.configs[name] || {};
    const isOAuth = String(config.provider || '').endsWith('-oauth');
    if (isOAuth) card.classList.add('oauth-profile');
    const rolePills = ['main', 'vision', 'orchestrator', 'aux']
      .map((role) => {
        const isActive = this.isProfileActiveForRole(name, role, currentVision, currentOrchestrator);
        const label = this.getRoleLabel(role);
        return `<span class="role-pill ${isActive ? 'active' : ''} ${role}-pill" data-role="${role}" data-profile="${name}">${label}</span>`;
      })
      .join('');
    const deleteBtn =
      name !== 'default' && !isOAuth
        ? `<button class="agent-card-delete" data-delete-profile="${this.escapeHtml(name)}" title="Delete profile">&times;</button>`
        : '';
    const providerLabel = isOAuth ? config.provider.replace(/-oauth$/, '') : config.provider || 'Provider';
    const oauthTag = isOAuth ? '<span class="oauth-badge">OAuth</span>' : '';
    card.innerHTML = `
        <div class="agent-card-header">
          <div>
            <h4>${this.escapeHtml(name)}${oauthTag}</h4>
            <span>${this.escapeHtml(providerLabel)} · ${this.escapeHtml(config.model || 'Model')}</span>
          </div>
          ${deleteBtn}
        </div>
        <div class="role-pills">${rolePills}</div>
      `;
    this.elements.agentGrid.appendChild(card);
  });
};

sidePanelProto.getRoleLabel = function getRoleLabel(role: string) {
  switch (role) {
    case 'main':
      return 'Main';
    case 'vision':
      return 'Vision';
    case 'orchestrator':
      return 'Orchestrator';
    default:
      return 'Team';
  }
};

sidePanelProto.isProfileActiveForRole = function isProfileActiveForRole(
  name: string,
  role: string,
  visionName?: string,
  orchestratorName?: string,
) {
  if (role === 'main') return name === this.currentConfig;
  if (role === 'vision') return name && visionName === name;
  if (role === 'orchestrator') return name && orchestratorName === name;
  if (role === 'aux') return this.auxAgentProfiles.includes(name);
  return false;
};

sidePanelProto.assignProfileRole = function assignProfileRole(profileName: string, role: string) {
  if (!profileName) return;
  if (role === 'main') {
    this.setActiveConfig(profileName);
    return;
  }
  if (role === 'vision') {
    this.toggleProfileRole('visionProfile', profileName);
  } else if (role === 'orchestrator') {
    this.toggleProfileRole('orchestratorProfile', profileName);
  } else if (role === 'aux') {
    this.toggleAuxProfile(profileName);
  }
};

sidePanelProto.toggleProfileRole = function toggleProfileRole(elementId: string, profileName: string) {
  const element = this.elements[elementId];
  if (!element) return;
  element.value = element.value === profileName ? '' : profileName;
  this.renderProfileGrid();
};

sidePanelProto.toggleAuxProfile = function toggleAuxProfile(profileName: string) {
  const idx = this.auxAgentProfiles.indexOf(profileName);
  if (idx === -1) {
    this.auxAgentProfiles.push(profileName);
  } else {
    this.auxAgentProfiles.splice(idx, 1);
  }
  this.auxAgentProfiles = Array.from(new Set(this.auxAgentProfiles));
  this.renderProfileGrid();
};

sidePanelProto.editProfile = function editProfile(name: string, silent = false) {
  if (!name || !this.configs[name]) return;
  this.profileEditorTarget = name;
  const config = this.configs[name];
  const isOAuth = String(config.provider || '').endsWith('-oauth');

  // Only update profile editor elements if they exist
  if (this.elements.profileEditorTitle) {
    const oauthBadge = isOAuth ? ' <span class="oauth-badge">OAuth</span>' : '';
    this.elements.profileEditorTitle.innerHTML = `Editing: ${this.escapeHtml(name)}${oauthBadge}`;
  }
  if (this.elements.profileEditorName) {
    this.elements.profileEditorName.value = name;
    this.elements.profileEditorName.readOnly = isOAuth;
    this.elements.profileEditorName.classList.toggle('oauth-readonly', isOAuth);
  }
  if (this.elements.profileEditorProvider) {
    // Ensure OAuth provider options exist in the select
    if (isOAuth) {
      const providerVal = config.provider || '';
      const select = this.elements.profileEditorProvider as HTMLSelectElement;
      if (!Array.from(select.options).some((o: HTMLOptionElement) => o.value === providerVal)) {
        const opt = document.createElement('option');
        opt.value = providerVal;
        const baseKey = providerVal.replace(/-oauth$/, '');
        opt.textContent = `${baseKey.charAt(0).toUpperCase() + baseKey.slice(1)} (OAuth)`;
        select.appendChild(opt);
      }
      select.value = providerVal;
      select.disabled = true;
    } else {
      this.elements.profileEditorProvider.value = config.provider || '';
      (this.elements.profileEditorProvider as HTMLSelectElement).disabled = false;
    }
  }
  // Hide API key for OAuth profiles
  const apiKeyGroup = this.elements.profileEditorApiKey?.closest('.form-group') as HTMLElement | null;
  if (apiKeyGroup) {
    apiKeyGroup.style.display = isOAuth ? 'none' : '';
  }
  if (this.elements.profileEditorApiKey && !isOAuth) {
    this.elements.profileEditorApiKey.value = config.apiKey || '';
  }
  if (this.elements.profileEditorModelInput) {
    this.elements.profileEditorModelInput.value = config.model || '';
  }
  if (this.elements.profileEditorModel) {
    const modelVal = config.model || '';
    const modelSelect = this.elements.profileEditorModel as HTMLSelectElement;
    if (modelVal && !Array.from(modelSelect.options).some((o: HTMLOptionElement) => o.value === modelVal)) {
      const opt = document.createElement('option');
      opt.value = modelVal;
      opt.textContent = modelVal;
      modelSelect.insertBefore(opt, modelSelect.options[1] || null);
    }
    modelSelect.value = modelVal;
  }
  if (this.elements.profileEditorEndpoint) this.elements.profileEditorEndpoint.value = config.customEndpoint || '';
  if (this.elements.profileEditorHeaders)
    this.elements.profileEditorHeaders.value = formatHeadersJson(config.extraHeaders) || '';
  if (this.elements.profileEditorTemperature) {
    this.elements.profileEditorTemperature.value = config.temperature ?? 0.7;
    if (this.elements.profileEditorTemperatureValue) {
      this.elements.profileEditorTemperatureValue.textContent = this.elements.profileEditorTemperature.value;
    }
  }
  if (this.elements.profileEditorMaxTokens) this.elements.profileEditorMaxTokens.value = config.maxTokens || 2048;
  if (this.elements.profileEditorContextLimit)
    this.elements.profileEditorContextLimit.value = config.contextLimit || 200000;
  if (this.elements.profileEditorTimeout) this.elements.profileEditorTimeout.value = config.timeout || 30000;
  if (this.elements.profileEditorEnableScreenshots)
    this.elements.profileEditorEnableScreenshots.value = config.enableScreenshots ? 'true' : 'false';
  if (this.elements.profileEditorSendScreenshots)
    this.elements.profileEditorSendScreenshots.value = config.sendScreenshotsAsImages ? 'true' : 'false';
  if (this.elements.profileEditorScreenshotQuality)
    this.elements.profileEditorScreenshotQuality.value = config.screenshotQuality || 'high';
  if (this.elements.profileEditorShowThinking)
    this.elements.profileEditorShowThinking.value = config.showThinking !== false ? 'true' : 'false';
  if (this.elements.profileEditorStreamResponses)
    this.elements.profileEditorStreamResponses.value = config.streamResponses !== false ? 'true' : 'false';
  if (this.elements.profileEditorAutoScroll)
    this.elements.profileEditorAutoScroll.value = config.autoScroll !== false ? 'true' : 'false';
  if (this.elements.profileEditorConfirmActions)
    this.elements.profileEditorConfirmActions.value = config.confirmActions !== false ? 'true' : 'false';
  if (this.elements.profileEditorSaveHistory)
    this.elements.profileEditorSaveHistory.value = config.saveHistory !== false ? 'true' : 'false';
  if (this.elements.profileEditorPrompt)
    this.elements.profileEditorPrompt.value = config.systemPrompt || this.getDefaultSystemPrompt();
  resizeProfilePromptInput(this.elements.profileEditorPrompt);

  this.toggleProfileEditorEndpoint();
  this.refreshProfileJsonEditor?.();
  this.refreshModelCatalogForProfileEditor?.();
  this.renderProfileGrid();
  if (!silent) {
    this.switchSettingsTab('profiles');
  }
};

sidePanelProto.collectProfileEditorData = function collectProfileEditorData() {
  const provider = String(this.elements.profileEditorProvider.value || '').trim();
  const rawModel = (this.elements.profileEditorModelInput?.value || this.elements.profileEditorModel.value || '').trim();
  const model = provider.endsWith('-oauth') ? normalizeOAuthModelIdForProvider(provider, rawModel) : rawModel;
  return {
    provider,
    apiKey: this.elements.profileEditorApiKey.value,
    model,
    customEndpoint: this.elements.profileEditorEndpoint.value,
    extraHeaders: (() => {
      const raw = this.elements.profileEditorHeaders?.value || '';
      if (!raw.trim()) return {};
      try {
        return parseHeadersJson(raw);
      } catch {
        return {};
      }
    })(),
    temperature: Number.parseFloat(this.elements.profileEditorTemperature.value) || 0.7,
    maxTokens: Number.parseInt(this.elements.profileEditorMaxTokens.value) || 2048,
    contextLimit: Number.parseInt(this.elements.profileEditorContextLimit?.value || '') || 200000,
    timeout: Number.parseInt(this.elements.profileEditorTimeout.value) || 30000,
    enableScreenshots: this.elements.profileEditorEnableScreenshots.value === 'true',
    sendScreenshotsAsImages: this.elements.profileEditorSendScreenshots.value === 'true',
    screenshotQuality: this.elements.profileEditorScreenshotQuality.value || 'high',
    showThinking: this.elements.profileEditorShowThinking?.value !== 'false',
    streamResponses: this.elements.profileEditorStreamResponses?.value !== 'false',
    autoScroll: this.elements.profileEditorAutoScroll?.value !== 'false',
    confirmActions: this.elements.profileEditorConfirmActions?.value !== 'false',
    saveHistory: this.elements.profileEditorSaveHistory?.value !== 'false',
    systemPrompt: this.elements.profileEditorPrompt.value || this.getDefaultSystemPrompt(),
  };
};

sidePanelProto.saveProfileEdits = async function saveProfileEdits() {
  const target = this.profileEditorTarget;
  if (!target || !this.configs[target]) {
    this.updateStatus('Select a profile to edit', 'warning');
    return;
  }
  if (!this.validateProfileEditorHeaders?.()) {
    this.updateStatus('Invalid headers JSON', 'error');
    return;
  }

  const newName = (this.elements.profileEditorName?.value || '').trim();
  const isRename = newName && newName !== target;

  if (isRename) {
    if (!newName) {
      this.updateStatus('Profile name cannot be empty', 'warning');
      return;
    }
    if (this.configs[newName]) {
      this.updateStatus(`Profile "${newName}" already exists`, 'warning');
      return;
    }
    if (target === 'default') {
      this.updateStatus('Cannot rename the default profile', 'warning');
      return;
    }
  }

  const existing = this.configs[target] || {};
  const updated = { ...existing, ...this.collectProfileEditorData() };

  if (isRename) {
    // Move config to new key
    this.configs[newName] = updated;
    delete this.configs[target];

    // Update references
    if (this.currentConfig === target) this.currentConfig = newName;
    this.profileEditorTarget = newName;

    // Update role selectors if they referenced the old name
    if (this.elements.visionProfile?.value === target) this.elements.visionProfile.value = newName;
    if (this.elements.orchestratorProfile?.value === target) this.elements.orchestratorProfile.value = newName;
    const auxIdx = this.auxAgentProfiles.indexOf(target);
    if (auxIdx !== -1) this.auxAgentProfiles[auxIdx] = newName;

    if (this.elements.profileEditorTitle) this.elements.profileEditorTitle.textContent = `Editing: ${newName}`;
    this.refreshConfigDropdown();
    await this.persistAllSettings({ silent: true });
    this.updateStatus(`Profile renamed to "${newName}"`, 'success');
  } else {
    this.configs[target] = updated;
    await this.persistAllSettings({ silent: true });
    if (target === this.currentConfig) {
      this.populateFormFromConfig(this.configs[target]);
      this.toggleCustomEndpoint();
    }
    this.renderProfileGrid();
    this.populateModelSelect();
    this.updateStatus(`Profile "${target}" saved`, 'success');
  }
};

sidePanelProto.populateFormFromConfig = function populateFormFromConfig(config: Record<string, any> = {}) {
  // Use optional chaining for all element accesses since settings UI may be simplified
  if (this.elements.provider) this.elements.provider.value = config.provider || '';
  if (this.elements.apiKey) this.elements.apiKey.value = config.apiKey || '';
  // Setup model field is freeform input + suggestions list.
  if (this.elements.model) {
    const modelVal = config.model || '';
    this.elements.model.value = modelVal;
  }
  if (this.elements.customEndpoint) this.elements.customEndpoint.value = config.customEndpoint || '';
  if (this.elements.customHeaders) this.elements.customHeaders.value = formatHeadersJson(config.extraHeaders) || '';
  if (this.elements.systemPrompt)
    this.elements.systemPrompt.value = config.systemPrompt || this.getDefaultSystemPrompt();
  if (this.elements.temperature) {
    this.elements.temperature.value = config.temperature !== undefined ? config.temperature : 0.7;
    if (this.elements.temperatureValue) {
      this.elements.temperatureValue.textContent = this.elements.temperature.value;
    }
  }
  if (this.elements.maxTokens) this.elements.maxTokens.value = config.maxTokens || 4096;
  if (this.elements.contextLimit) this.elements.contextLimit.value = config.contextLimit || 200000;
  if (this.elements.timeout) this.elements.timeout.value = config.timeout || 30000;
  if (this.elements.enableScreenshots)
    this.elements.enableScreenshots.value = config.enableScreenshots ? 'true' : 'false';
  if (this.elements.sendScreenshotsAsImages)
    this.elements.sendScreenshotsAsImages.value = config.sendScreenshotsAsImages ? 'true' : 'false';
  if (this.elements.screenshotQuality) this.elements.screenshotQuality.value = config.screenshotQuality || 'high';
  if (this.elements.streamResponses)
    this.elements.streamResponses.value = config.streamResponses !== false ? 'true' : 'false';
  if (this.elements.showThinking) this.elements.showThinking.value = config.showThinking !== false ? 'true' : 'false';
  if (this.elements.autoScroll) this.elements.autoScroll.value = config.autoScroll !== false ? 'true' : 'false';
  if (this.elements.confirmActions)
    this.elements.confirmActions.value = config.confirmActions !== false ? 'true' : 'false';
  if (this.elements.saveHistory) this.elements.saveHistory.value = config.saveHistory !== false ? 'true' : 'false';
};

sidePanelProto.setActiveConfig = function setActiveConfig(name: string, quiet = false) {
  if (!this.configs[name]) return;
  this.currentConfig = name;
  if (this.elements.activeConfig) this.elements.activeConfig.value = name;
  this.populateFormFromConfig(this.configs[name]);
  this.toggleCustomEndpoint();
  this.renderProfileGrid?.();
  this.updateScreenshotToggleState?.();
  this.editProfile?.(name, true);
  this.fetchAvailableModels(); // This now repopulates the composer dropdown with all profiles
  if (!quiet) {
    this.updateStatus(`Switched to "${name}"`, 'success');
  }
};

sidePanelProto.refreshProfileJsonEditor = function refreshProfileJsonEditor() {
  if (!this.elements.profileJsonEditor) return;
  const target = this.profileEditorTarget || this.currentConfig;
  const config = this.configs[target] || {};
  this.elements.profileJsonEditor.value = JSON.stringify(config, null, 2);
};

sidePanelProto.copyProfileJsonEditor = async function copyProfileJsonEditor() {
  if (!this.elements.profileJsonEditor) return;
  const text = this.elements.profileJsonEditor.value || '';
  if (!text.trim()) {
    this.updateStatus('Profile JSON is empty', 'warning');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    this.updateStatus('Profile JSON copied', 'success');
  } catch {
    this.updateStatus('Unable to copy profile JSON', 'error');
  }
};

sidePanelProto.applyProfileJsonEditor = async function applyProfileJsonEditor() {
  if (!this.elements.profileJsonEditor) return;
  const target = this.profileEditorTarget || this.currentConfig;
  if (!target || !this.configs[target]) {
    this.updateStatus('Select a profile to edit', 'warning');
    return;
  }
  const raw = this.elements.profileJsonEditor.value || '';
  if (!raw.trim()) {
    this.updateStatus('Paste profile JSON first', 'warning');
    return;
  }
  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    this.updateStatus('Invalid JSON format', 'error');
    return;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    this.updateStatus('Profile JSON must be an object', 'error');
    return;
  }
  const existing = this.configs[target] || {};
  if (parsed.extraHeaders && typeof parsed.extraHeaders === 'string') {
    try {
      parsed.extraHeaders = parseHeadersJson(parsed.extraHeaders);
    } catch {
      parsed.extraHeaders = existing.extraHeaders || {};
    }
  }
  this.configs[target] = { ...existing, ...parsed };
  await this.persistAllSettings({ silent: true });
  this.editProfile(target, true);
  if (target === this.currentConfig) {
    this.populateFormFromConfig(this.configs[target]);
  }
  this.updateStatus(`Profile "${target}" updated`, 'success');
};
