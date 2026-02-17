import { SidePanelUI } from '../core/panel-ui.js';

(SidePanelUI.prototype as any).updateStatus = function updateStatus(text: string, type = 'default') {
  if (this.elements.statusText) {
    this.elements.statusText.textContent = text;
  }
  const statusDot = document.getElementById('statusDot');
  if (statusDot) {
    statusDot.className = 'status-dot';
    if (type === 'error') statusDot.classList.add('error');
    else if (type === 'warning') statusDot.classList.add('warning');
    else if (type === 'active') statusDot.classList.add('active');
  }
  this.updateActivityState();
};

(SidePanelUI.prototype as any).startRunTimer = function startRunTimer() {
  if (this.runTimerId) {
    window.clearInterval(this.runTimerId);
  }
  this.runStartedAt = Date.now();
  const tick = () => {
    this.updateActivityState?.();
  };
  tick();
  this.runTimerId = window.setInterval(tick, 1000);
};

(SidePanelUI.prototype as any).stopRunTimer = function stopRunTimer() {
  if (this.runTimerId) {
    window.clearInterval(this.runTimerId);
    this.runTimerId = null;
  }
  this.runStartedAt = null;
  this.updateActivityState?.();
};

(SidePanelUI.prototype as any).updateModelDisplay = function updateModelDisplay() {
  // Now the model select shows profiles, so we update it to the current config
  if (this.elements.modelSelect) {
    this.elements.modelSelect.value = this.currentConfig;
  }
};

(SidePanelUI.prototype as any).fetchAvailableModels = async function fetchAvailableModels() {
  // The composer dropdown shows saved profiles (not provider model IDs).
  this.populateModelSelect();
  this.updateModelDisplay();
};

(SidePanelUI.prototype as any).populateModelSelect = function populateModelSelect() {
  // Try to get the select element - it might not be in this.elements if loaded dynamically
  let select = this.elements.modelSelect;
  if (!select) {
    select = document.getElementById('modelSelect') as HTMLSelectElement;
    if (select) {
      this.elements.modelSelect = select;
    }
  }

  if (!select) {
    console.error('[Parchi] modelSelect element not found!');
    return;
  }

  // Populate with profiles
  select.innerHTML = '';

  const configNames = Object.keys(this.configs);
  if (configNames.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No profiles';
    select.appendChild(option);
    return;
  }

  for (const name of configNames) {
    const config = this.configs[name];
    const option = document.createElement('option');
    option.value = name; // Use profile name as value

    // Format: icon provider/model (e.g., "🅒 anthropic/claude-sonnet")
    const providerIcon = this.getProviderIcon(config.provider);
    const modelShort = this.shortenModelName(config.model || 'no-model');
    option.textContent = `${providerIcon} ${config.provider}/${modelShort}`;

    if (name === this.currentConfig) {
      option.selected = true;
    }
    select.appendChild(option);
  }

  // (debug log removed)
};

(SidePanelUI.prototype as any).shortenModelName = function shortenModelName(model: string): string {
  if (!model) return 'unknown';
  // Remove common prefixes
  const clean = model
    .replace(/^claude-/, '')
    .replace(/^gpt-/, '')
    .replace(/^kimi-/, '');
  // Truncate if still long
  if (clean.length <= 20) return clean;
  return clean.slice(0, 19) + '…';
};

(SidePanelUI.prototype as any).handleModelSelectChange = async function handleModelSelectChange() {
  const select = this.elements.modelSelect;
  if (!select) return;

  const selectedProfile = select.value;
  if (!selectedProfile || !this.configs[selectedProfile]) return;
  if (selectedProfile === this.currentConfig) return;

  // Switch to the selected profile
  try {
    // setActiveConfig updates in-memory UI state; persistAllSettings ensures the background
    // script (which reads from chrome.storage) uses the same active profile.
    this.setActiveConfig(selectedProfile, true);
    await this.persistAllSettings({ silent: true });
    this.updateStatus(
      `Switched to ${this.configs[selectedProfile].provider}/${this.configs[selectedProfile].model}`,
      'success',
    );
  } catch (error) {
    console.error('[Parchi] Failed to persist selected profile:', error);
    this.updateStatus('Failed to switch profile', 'error');
  }
};

(SidePanelUI.prototype as any).getProviderIcon = function getProviderIcon(provider: string): string {
  const icons: Record<string, string> = {
    anthropic: '🅒',
    openai: '🅞',
    kimi: '🅚',
    custom: '⚙️',
  };
  return icons[provider] || '⚙️';
};
