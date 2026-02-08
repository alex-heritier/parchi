type NullableElement<T extends Element> = T | null;

const byId = <T extends HTMLElement>(id: string): NullableElement<T> =>
  document.getElementById(id) as NullableElement<T>;
const bySelector = <T extends Element>(selector: string): NullableElement<T> =>
  document.querySelector(selector) as NullableElement<T>;

export type SidePanelElements = Record<string, any>;

export const getSidePanelElements = (): SidePanelElements => ({
  // Sidebar elements
  sidebar: byId<HTMLElement>('sidebar'),
  openSidebarBtn: byId<HTMLButtonElement>('openSidebarBtn'),
  closeSidebarBtn: byId<HTMLButtonElement>('closeSidebarBtn'),
  navChatBtn: byId<HTMLButtonElement>('navChatBtn'),
  navHistoryBtn: byId<HTMLButtonElement>('navHistoryBtn'),
  navSettingsBtn: byId<HTMLButtonElement>('navSettingsBtn'),
  rightPanel: byId<HTMLElement>('rightPanel'),
  rightPanelPanels: byId<HTMLElement>('rightPanelPanels') ?? bySelector<HTMLElement>('.right-panel-panels'),

  // Legacy references (kept for compatibility)
  settingsBtn: byId<HTMLButtonElement>('settingsBtn'),
  settingsPanel: byId<HTMLElement>('settingsPanel'),
  chatInterface: byId<HTMLElement>('chatInterface'),
  statusText: byId<HTMLElement>('statusText'),
  statusMeta: byId<HTMLElement>('statusMeta'),
  statusBar: byId<HTMLElement>('statusBar'),
  agentNav: byId<HTMLElement>('agentNav'),

  tabSelectorBtn: byId<HTMLButtonElement>('tabSelectorBtn'),
  tabSelector: byId<HTMLElement>('tabSelector'),
  tabSelectorSummary: byId<HTMLElement>('tabSelectorSummary'),
  tabSelectorAddActive: byId<HTMLButtonElement>('tabSelectorAddActive'),
  tabSelectorClear: byId<HTMLButtonElement>('tabSelectorClear'),
  tabList: byId<HTMLElement>('tabList'),
  closeTabSelector: byId<HTMLButtonElement>('closeTabSelector'),
  selectedTabsBar: byId<HTMLElement>('selectedTabsBar'),
  scrollToLatestBtn: byId<HTMLButtonElement>('scrollToLatestBtn'),
  newSessionFab: byId<HTMLButtonElement>('newSessionFab'),
  historyPanel: byId<HTMLElement>('historyPanel'),
  historyItems: byId<HTMLElement>('historyItems'),
  clearHistoryBtn: byId<HTMLButtonElement>('clearHistoryBtn'),
  startNewSessionBtn: byId<HTMLButtonElement>('startNewSessionBtn'),
  settingsTabGeneralBtn: byId<HTMLButtonElement>('settingsTabGeneralBtn'),
  settingsTabProfilesBtn: byId<HTMLButtonElement>('settingsTabProfilesBtn'),
  settingsTabGeneral: byId<HTMLElement>('settingsTabGeneral'),
  settingsTabProfiles: byId<HTMLElement>('settingsTabProfiles'),
  newProfileNameInput: byId<HTMLInputElement>('newProfileNameInput'),
  createProfileBtn: byId<HTMLButtonElement>('createProfileBtn'),
  openGeneralBtn: byId<HTMLButtonElement>('openGeneralBtn'),
  profileEditorTitle: byId<HTMLElement>('profileEditorTitle'),
  profileEditorName: byId<HTMLInputElement>('profileEditorName'),
  profileEditorProvider: byId<HTMLSelectElement>('profileEditorProvider'),
  profileEditorApiKey: byId<HTMLInputElement>('profileEditorApiKey'),
  profileEditorModel: byId<HTMLInputElement>('profileEditorModel'),
  profileEditorEndpoint: byId<HTMLInputElement>('profileEditorEndpoint'),
  profileEditorEndpointGroup: byId<HTMLElement>('profileEditorEndpointGroup'),
  profileEditorHeaders: byId<HTMLTextAreaElement>('profileEditorHeaders'),
  profileEditorTemperature: byId<HTMLInputElement>('profileEditorTemperature'),
  profileEditorTemperatureValue: byId<HTMLElement>('profileEditorTemperatureValue'),
  profileEditorMaxTokens: byId<HTMLInputElement>('profileEditorMaxTokens'),
  profileEditorContextLimit: byId<HTMLInputElement>('profileEditorContextLimit'),
  profileEditorTimeout: byId<HTMLInputElement>('profileEditorTimeout'),
  profileEditorEnableScreenshots: byId<HTMLInputElement>('profileEditorEnableScreenshots'),
  profileEditorSendScreenshots: byId<HTMLInputElement>('profileEditorSendScreenshots'),
  profileEditorScreenshotQuality: byId<HTMLSelectElement>('profileEditorScreenshotQuality'),
  profileEditorShowThinking: byId<HTMLSelectElement>('profileEditorShowThinking'),
  profileEditorStreamResponses: byId<HTMLSelectElement>('profileEditorStreamResponses'),
  profileEditorAutoScroll: byId<HTMLSelectElement>('profileEditorAutoScroll'),
  profileEditorConfirmActions: byId<HTMLSelectElement>('profileEditorConfirmActions'),
  profileEditorSaveHistory: byId<HTMLSelectElement>('profileEditorSaveHistory'),
  profileEditorPrompt: byId<HTMLTextAreaElement>('profileEditorPrompt'),
  saveProfileBtn: byId<HTMLButtonElement>('saveProfileBtn'),
  profileJsonEditor: byId<HTMLTextAreaElement>('profileJsonEditor'),
  refreshProfileJsonBtn: byId<HTMLButtonElement>('refreshProfileJsonBtn'),
  copyProfileJsonBtn: byId<HTMLButtonElement>('copyProfileJsonBtn'),
  applyProfileJsonBtn: byId<HTMLButtonElement>('applyProfileJsonBtn'),
  permissionRead: byId<HTMLInputElement>('permissionRead'),
  permissionInteract: byId<HTMLInputElement>('permissionInteract'),
  permissionNavigate: byId<HTMLInputElement>('permissionNavigate'),
  permissionTabs: byId<HTMLInputElement>('permissionTabs'),
  permissionScreenshots: byId<HTMLInputElement>('permissionScreenshots'),
  allowedDomains: byId<HTMLTextAreaElement>('allowedDomains'),
  exportSettingsBtn: byId<HTMLButtonElement>('exportSettingsBtn'),
  importSettingsBtn: byId<HTMLButtonElement>('importSettingsBtn'),
  importSettingsInput: byId<HTMLInputElement>('importSettingsInput'),

  openProfilesTabFromGeneralBtn: byId<HTMLButtonElement>('openProfilesTabFromGeneralBtn'),

  // Relay
  relayEnabled: byId<HTMLSelectElement>('relayEnabled'),
  relayUrl: byId<HTMLInputElement>('relayUrl'),
  relayToken: byId<HTMLInputElement>('relayToken'),
  saveRelayBtn: byId<HTMLButtonElement>('saveRelayBtn'),
  copyRelayEnvBtn: byId<HTMLButtonElement>('copyRelayEnvBtn'),
  relayConnectedBadge: byId<HTMLElement>('relayConnectedBadge'),
  relayLastErrorText: byId<HTMLElement>('relayLastErrorText'),

  // Form elements - Provider & model
  provider: byId<HTMLSelectElement>('provider'),
  apiKey: byId<HTMLInputElement>('apiKey'),
  model: byId<HTMLInputElement>('model'),
  customEndpoint: byId<HTMLInputElement>('customEndpoint'),
  customEndpointGroup: byId<HTMLElement>('customEndpointGroup'),
  customHeaders: byId<HTMLTextAreaElement>('customHeaders'),
  customHeadersGroup: byId<HTMLElement>('customHeadersGroup'),

  // Form elements - Model parameters
  temperature: byId<HTMLInputElement>('temperature'),
  temperatureValue: byId<HTMLElement>('temperatureValue'),
  maxTokens: byId<HTMLInputElement>('maxTokens'),
  contextLimit: byId<HTMLInputElement>('contextLimit'),
  timeout: byId<HTMLInputElement>('timeout'),

  // Form elements - Screenshots & vision
  enableScreenshots: byId<HTMLInputElement>('enableScreenshots'),
  sendScreenshotsAsImages: byId<HTMLInputElement>('sendScreenshotsAsImages'),
  screenshotQuality: byId<HTMLSelectElement>('screenshotQuality'),
  visionBridge: byId<HTMLInputElement>('visionBridge'),
  visionProfile: byId<HTMLSelectElement>('visionProfile'),

  // Form elements - Behavior
  showThinking: byId<HTMLInputElement>('showThinking'),
  streamResponses: byId<HTMLInputElement>('streamResponses'),
  autoScroll: byId<HTMLSelectElement>('autoScroll'),
  confirmActions: byId<HTMLInputElement>('confirmActions'),
  saveHistory: byId<HTMLInputElement>('saveHistory'),

  // Form elements - Orchestrator
  orchestratorToggle: byId<HTMLInputElement>('orchestratorToggle'),
  orchestratorProfile: byId<HTMLSelectElement>('orchestratorProfile'),

  // Form elements - System prompt
  systemPrompt: byId<HTMLTextAreaElement>('systemPrompt'),

  // Form elements - Appearance
  uiZoom: byId<HTMLInputElement>('uiZoom'),
  uiZoomValue: byId<HTMLElement>('uiZoomValue'),

  // Settings actions
  saveSettingsBtn: byId<HTMLButtonElement>('saveSettingsBtn'),
  cancelSettingsBtn: byId<HTMLButtonElement>('cancelSettingsBtn'),

  // Profile management
  activeConfig: byId<HTMLSelectElement>('activeConfig'),
  newConfigBtn: byId<HTMLButtonElement>('newConfigBtn'),
  newProfileInput: byId<HTMLInputElement>('newProfileInput'),
  deleteConfigBtn: byId<HTMLButtonElement>('deleteConfigBtn'),
  refreshProfilesBtn: byId<HTMLButtonElement>('refreshProfilesBtn'),
  agentGrid: byId<HTMLElement>('agentGrid'),

  // Chat interface
  chatMessages: byId<HTMLElement>('chatMessages'),
  chatEmptyState: byId<HTMLElement>('chatEmptyState'),
  userInput: byId<HTMLTextAreaElement>('userInput'),
  sendBtn: byId<HTMLButtonElement>('sendBtn'),
  composer: byId<HTMLElement>('composer'),
  modelSelect: byId<HTMLSelectElement>('modelSelect'),
  fileBtn: byId<HTMLButtonElement>('fileBtn'),
  fileInput: byId<HTMLInputElement>('fileInput'),
  zoomOutBtn: byId<HTMLButtonElement>('zoomOutBtn'),
  zoomInBtn: byId<HTMLButtonElement>('zoomInBtn'),
  zoomResetBtn: byId<HTMLButtonElement>('zoomResetBtn'),
  planDrawer: byId<HTMLElement>('planDrawer'),
  planDrawerToggle: byId<HTMLButtonElement>('planDrawerToggle'),
  planChecklist: byId<HTMLOListElement>('planChecklist'),
  planStepCount: byId<HTMLElement>('planStepCount'),
  planClearBtn: byId<HTMLButtonElement>('planClearBtn'),
  stopRunBtn: byId<HTMLButtonElement>('stopRunBtn'),
});
