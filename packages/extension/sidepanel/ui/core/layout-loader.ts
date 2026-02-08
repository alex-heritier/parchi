const loadTemplate = async (path: string) => {
  const url = chrome.runtime.getURL(`sidepanel/templates/${path}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load template: ${path}`);
  }
  return response.text();
};

// Inject full template HTML into an existing container, preserving the container node (and its id).
// IMPORTANT: some UI code grabs these containers by id; replacing them breaks tab switching.
const injectInnerHtml = (root: HTMLElement, selector: string, html: string) => {
  const target = root.querySelector(selector) as HTMLElement | null;
  if (!target) return;
  target.innerHTML = html.trim();
};

export const loadPanelLayout = async () => {
  const appRoot = document.getElementById('appRoot');
  if (!appRoot) return;

  const [
    sidebarShell,
    mainContent,
    historyPanel,
    settingsPanel,
    settingsGeneral,
    settingsProfiles,
    tabSelector,
  ] = await Promise.all([
    loadTemplate('sidebar-shell.html'),
    loadTemplate('main.html'),
    loadTemplate('panels/history.html'),
    loadTemplate('panels/settings.html'),
    loadTemplate('panels/settings-general.html'),
    loadTemplate('panels/settings-profiles.html'),
    loadTemplate('tab-selector.html'),
  ]);

  appRoot.className = 'app-container';
  appRoot.innerHTML = '';
  const appContainer = appRoot as HTMLElement;

  appContainer.insertAdjacentHTML('beforeend', sidebarShell.trim());
  appContainer.insertAdjacentHTML('beforeend', mainContent.trim());

  const rightPanels = appContainer.querySelector('#rightPanelPanels') as HTMLElement | null;
  rightPanels?.insertAdjacentHTML('beforeend', (historyPanel + settingsPanel).trim());

  injectInnerHtml(appContainer, '#settingsTabGeneral', settingsGeneral);
  injectInnerHtml(appContainer, '#settingsTabProfiles', settingsProfiles);

  const modalRoot = document.getElementById('modalRoot');
  if (modalRoot) {
    modalRoot.innerHTML = tabSelector;
  }
};
