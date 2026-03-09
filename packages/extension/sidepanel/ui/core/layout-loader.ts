const loadTemplate = async (path: string) => {
  const url = chrome.runtime.getURL(`sidepanel/templates/${path}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load template: ${path}`);
  }
  return response.text();
};

export const loadPanelLayout = async () => {
  const appRoot = document.getElementById('appRoot');
  if (!appRoot) return;

  const [sidebarShell, mainContent, settingsPanel, accountPanel, settingsGeneral, _settingsProfiles, settingsUsage, tabSelector] =
    await Promise.all([
      loadTemplate('sidebar-shell.html'),
      loadTemplate('main.html'),
      loadTemplate('panels/settings.html'),
      loadTemplate('panels/account.html'),
      loadTemplate('panels/settings-general.html'),
      loadTemplate('panels/settings-profiles.html'),
      loadTemplate('panels/settings-usage.html'),
      loadTemplate('tab-selector.html'),
    ]);

  appRoot.className = 'app-container';
  appRoot.innerHTML = '';
  const appContainer = appRoot as HTMLElement;

  appContainer.insertAdjacentHTML('beforeend', sidebarShell.trim());
  appContainer.insertAdjacentHTML('beforeend', mainContent.trim());

  const rightPanels = appContainer.querySelector('#rightPanelPanels') as HTMLElement | null;
  rightPanels?.insertAdjacentHTML('beforeend', settingsPanel.trim());
  rightPanels?.insertAdjacentHTML('beforeend', accountPanel.trim());

  // Parse the combined settings-general template and distribute panes into their tab containers.
  const tmp = document.createElement('div');
  tmp.innerHTML = settingsGeneral.trim();
  const panes = tmp.querySelectorAll('.settings-tab-pane[data-pane]');
  for (const pane of Array.from(panes)) {
    const paneName = (pane as HTMLElement).dataset.pane;
    if (!paneName) continue;
    // Map pane name → tab container id (e.g. "setup" → "#settingsTabSetup")
    const containerId = `#settingsTab${paneName.charAt(0).toUpperCase() + paneName.slice(1)}`;
    const container = appContainer.querySelector(containerId) as HTMLElement | null;
    if (container) {
      container.innerHTML = pane.outerHTML;
    }
  }

  // v4 redesign: profile editor removed; settings-profiles.html is no longer injected.
  // The hidden activeConfig select is now in the providers pane of settings-general.html.

  // Usage tab — uses same pane-distribution approach as settings-general
  const usageTmp = document.createElement('div');
  usageTmp.innerHTML = settingsUsage.trim();
  const usagePanes = usageTmp.querySelectorAll('.settings-tab-pane[data-pane]');
  for (const pane of Array.from(usagePanes)) {
    const paneName = (pane as HTMLElement).dataset.pane;
    if (!paneName) continue;
    const containerId = `#settingsTab${paneName.charAt(0).toUpperCase() + paneName.slice(1)}`;
    const container = appContainer.querySelector(containerId) as HTMLElement | null;
    if (container) {
      container.innerHTML = pane.outerHTML;
    }
  }

  const modalRoot = document.getElementById('modalRoot');
  if (modalRoot) {
    modalRoot.innerHTML = tabSelector;
  }
};
