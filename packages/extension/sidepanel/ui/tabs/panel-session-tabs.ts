import { SidePanelUI } from '../core/panel-ui.js';

// ============================================================================
// Session Tabs Orb — Circle button that expands to show active browser tabs
// ============================================================================

(SidePanelUI.prototype as any).handleSessionTabsUpdate = function handleSessionTabsUpdate(message: any) {
  const tabs = Array.isArray(message.tabs) ? message.tabs : [];
  const activeTabId = typeof message.activeTabId === 'number' ? message.activeTabId : null;
  const maxTabs = typeof message.maxTabs === 'number' ? message.maxTabs : 5;
  const groupTitle = typeof message.groupTitle === 'string' ? message.groupTitle : undefined;

  this.sessionTabsState = {
    ...this.sessionTabsState,
    tabs,
    activeTabId,
    maxTabs,
    groupTitle,
  };

  this.renderSessionTabsHud();
};

(SidePanelUI.prototype as any).setInteractingTab = function setInteractingTab(tabId: number | null) {
  const prev = this.sessionTabsState.interactingTabId;
  if (prev === tabId) return;
  this.sessionTabsState.interactingTabId = tabId;
  this.updateSessionTabInteractionState();
};

(SidePanelUI.prototype as any).initSessionTabsOrb = function initSessionTabsOrb() {
  const hud = this.elements.sessionTabsHud;
  const toggle = this.elements.sessionTabsToggle;
  if (!hud || !toggle) return;

  // Toggle expand/collapse on button click
  toggle.addEventListener('click', (e: Event) => {
    e.stopPropagation();
    hud.classList.toggle('expanded');
  });

  // Also toggle when clicking the orb container (collapsed state only)
  hud.addEventListener('click', (e: Event) => {
    if (!hud.classList.contains('expanded') && e.target !== toggle && !(toggle as HTMLElement).contains(e.target as Node)) {
      hud.classList.add('expanded');
    }
  });

  // Collapse when clicking outside
  document.addEventListener('click', (e: Event) => {
    if (hud.classList.contains('expanded') && !hud.contains(e.target as Node)) {
      hud.classList.remove('expanded');
    }
  });
};

(SidePanelUI.prototype as any).renderSessionTabsHud = function renderSessionTabsHud() {
  const hud = this.elements.sessionTabsHud;
  const list = this.elements.sessionTabsList;
  if (!hud || !list) return;

  const { tabs, activeTabId, interactingTabId } = this.sessionTabsState;

  if (tabs.length === 0) {
    hud.classList.add('hidden');
    hud.classList.remove('expanded');
    return;
  }

  hud.classList.remove('hidden');

  // Update orb favicon to show the active (or first) tab's site icon
  this.updateOrbFavicon(tabs, activeTabId);

  list.innerHTML = '';

  tabs.forEach((tab: any) => {
    const pill = document.createElement('div');
    pill.className = 'session-tab-pill';
    pill.dataset.tabId = String(tab.id);

    if (tab.id === activeTabId) {
      pill.classList.add('active');
    }
    if (tab.id === interactingTabId) {
      pill.classList.add('interacting');
    }

    const domain = this.formatTabLabel?.(tab.url) || '';
    const title = tab.title || domain || 'Tab';
    const truncatedTitle = title.length > 18 ? title.slice(0, 18) + '\u2026' : title;

    // Build favicon URL from domain
    let faviconHtml = '';
    if (tab.url) {
      try {
        const origin = new URL(tab.url).origin;
        faviconHtml = `<img class="session-tab-favicon" src="${origin}/favicon.ico" onerror="this.style.display='none'" alt="">`;
      } catch {
        // skip favicon for invalid URLs
      }
    }

    pill.innerHTML = `
      ${faviconHtml}
      <span class="session-tab-title">${this.escapeHtml(truncatedTitle)}</span>
      <span class="session-tab-activity"></span>
    `;

    pill.title = `${title}\n${tab.url || ''}`;

    list.appendChild(pill);
  });
};

(SidePanelUI.prototype as any).updateSessionTabInteractionState = function updateSessionTabInteractionState() {
  const list = this.elements.sessionTabsList;
  if (!list) return;

  const { interactingTabId } = this.sessionTabsState;
  const pills = list.querySelectorAll('.session-tab-pill');

  pills.forEach((pill: HTMLElement) => {
    const tabId = Number(pill.dataset.tabId);
    if (tabId === interactingTabId) {
      pill.classList.add('interacting');
    } else {
      pill.classList.remove('interacting');
    }
  });
};

(SidePanelUI.prototype as any).updateOrbFavicon = function updateOrbFavicon(
  tabs: Array<{ id: number; url?: string }>,
  activeTabId: number | null,
) {
  const faviconEl = this.elements.sessionTabsFavicon as HTMLImageElement | null;
  const btn = this.elements.sessionTabsToggle as HTMLElement | null;
  if (!faviconEl || !btn) return;

  // Find the active tab, or fall back to first tab
  const activeTab = tabs.find((t: any) => t.id === activeTabId) || tabs[0];
  const fallbackSvg = btn.querySelector('.session-tabs-orb-fallback') as HTMLElement | null;

  if (activeTab?.url) {
    try {
      const hostname = new URL(activeTab.url).hostname;
      faviconEl.src = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
      faviconEl.style.display = '';
      if (fallbackSvg) fallbackSvg.style.display = 'none';
      faviconEl.onerror = () => {
        faviconEl.style.display = 'none';
        if (fallbackSvg) fallbackSvg.style.display = '';
      };
      return;
    } catch { /* fall through */ }
  }

  // No valid URL — show fallback icon
  faviconEl.style.display = 'none';
  if (fallbackSvg) fallbackSvg.style.display = '';
};
