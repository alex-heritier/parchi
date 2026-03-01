import { SidePanelUI } from '../core/panel-ui.js';
const sidePanelProto = SidePanelUI.prototype as SidePanelUI & Record<string, unknown>;


// ============================================================================
// Session Tabs Orb — Circle button that expands to show active browser tabs
// ============================================================================

sidePanelProto.handleSessionTabsUpdate = function handleSessionTabsUpdate(message: any) {
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

sidePanelProto.setInteractingTab = function setInteractingTab(tabId: number | null) {
  const prev = this.sessionTabsState.interactingTabId;
  if (prev === tabId) return;
  this.sessionTabsState.interactingTabId = tabId;
  this.updateSessionTabInteractionState();
};

sidePanelProto.initSessionTabsOrb = function initSessionTabsOrb() {
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
    if (
      !hud.classList.contains('expanded') &&
      e.target !== toggle &&
      !(toggle as HTMLElement).contains(e.target as Node)
    ) {
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

sidePanelProto.renderSessionTabsHud = function renderSessionTabsHud() {
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
    const fallbackGlyph = (domain || title || 'T').trim().charAt(0).toUpperCase() || 'T';
    const faviconFallback = document.createElement('span');
    faviconFallback.className = 'session-tab-favicon-fallback';
    faviconFallback.textContent = fallbackGlyph;
    pill.appendChild(faviconFallback);

    const faviconCandidates: string[] = [];
    if (tab.favIconUrl) faviconCandidates.push(String(tab.favIconUrl));
    if (tab.url) {
      try {
        const parsed = new URL(tab.url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          faviconCandidates.push(`${parsed.origin}/favicon.ico`);
          faviconCandidates.push(`https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=32`);
        }
      } catch {
        // Ignore malformed tab URLs.
      }
    }

    const uniqueCandidates = Array.from(new Set(faviconCandidates.filter(Boolean)));
    if (uniqueCandidates.length > 0) {
      const favicon = document.createElement('img');
      favicon.className = 'session-tab-favicon';
      favicon.alt = '';
      favicon.referrerPolicy = 'no-referrer';
      favicon.decoding = 'async';
      favicon.loading = 'eager';
      favicon.style.display = 'none';
      pill.appendChild(favicon);

      const tryCandidate = (index: number) => {
        if (index >= uniqueCandidates.length) return;
        favicon.onload = () => {
          favicon.style.display = '';
          faviconFallback.style.display = 'none';
        };
        favicon.onerror = () => {
          tryCandidate(index + 1);
        };
        favicon.src = uniqueCandidates[index];
      };
      tryCandidate(0);
    }

    const titleEl = document.createElement('span');
    titleEl.className = 'session-tab-title';
    titleEl.textContent = truncatedTitle;
    pill.appendChild(titleEl);

    const activityEl = document.createElement('span');
    activityEl.className = 'session-tab-activity';
    pill.appendChild(activityEl);

    pill.title = `${title}\n${tab.url || ''}`;

    list.appendChild(pill);
  });
};

sidePanelProto.updateSessionTabInteractionState = function updateSessionTabInteractionState() {
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

sidePanelProto.updateOrbFavicon = function updateOrbFavicon(
  tabs: Array<{ id: number; url?: string; favIconUrl?: string }>,
  activeTabId: number | null,
) {
  const faviconEl = this.elements.sessionTabsFavicon as HTMLImageElement | null;
  const btn = this.elements.sessionTabsToggle as HTMLElement | null;
  if (!faviconEl || !btn) return;

  // Find the active tab, or fall back to first tab
  const activeTab = tabs.find((t: any) => t.id === activeTabId) || tabs[0];
  const fallbackSvg = btn.querySelector('.session-tabs-orb-fallback') as HTMLElement | null;

  const showFallback = () => {
    faviconEl.style.display = 'none';
    faviconEl.removeAttribute('src');
    if (fallbackSvg) fallbackSvg.style.display = '';
  };

  const candidates: string[] = [];
  if (activeTab?.favIconUrl) {
    candidates.push(activeTab.favIconUrl);
  }
  if (activeTab?.url) {
    try {
      const parsed = new URL(activeTab.url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        candidates.push(`${parsed.origin}/favicon.ico`);
        candidates.push(`https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=32`);
      }
    } catch {
      // Ignore malformed tab URLs.
    }
  }

  if (candidates.length === 0) {
    showFallback();
    return;
  }

  faviconEl.referrerPolicy = 'no-referrer';
  faviconEl.decoding = 'async';
  faviconEl.loading = 'eager';
  faviconEl.style.display = 'none';
  if (fallbackSvg) fallbackSvg.style.display = '';

  const tried = new Set<string>();
  const uniqueCandidates = candidates.filter((src) => {
    if (!src || tried.has(src)) return false;
    tried.add(src);
    return true;
  });

  const tryCandidate = (index: number) => {
    if (index >= uniqueCandidates.length) {
      showFallback();
      return;
    }
    const src = uniqueCandidates[index];
    faviconEl.onload = () => {
      faviconEl.style.display = '';
      if (fallbackSvg) fallbackSvg.style.display = 'none';
    };
    faviconEl.onerror = () => {
      tryCandidate(index + 1);
    };
    faviconEl.src = src;
  };

  tryCandidate(0);
};
