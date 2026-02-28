import { getActiveTab } from '../../../utils/active-tab.js';
import { SidePanelUI } from '../core/panel-ui.js';

(SidePanelUI.prototype as any).ingestFilesIntoComposer = async function ingestFilesIntoComposer(
  files: File[],
  source: 'picker' | 'paste' = 'picker',
) {
  if (!Array.isArray(files) || files.length === 0) return;

  const maxPerFile = 4000;
  const maxInlineMediaBytes = 4 * 1024 * 1024;
  const mediaAttachments = Array.isArray(this.pendingComposerAttachments) ? [...this.pendingComposerAttachments] : [];

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

  for (const file of files) {
    const mime = String(file.type || '').toLowerCase();
    const name = file.name || `${source}-attachment`;
    const isImage = mime.startsWith('image/');
    const isVideo = mime.startsWith('video/');
    const isAudio = mime.startsWith('audio/');
    const isMedia = isImage || isVideo || isAudio;

    if (isMedia) {
      if (file.size > maxInlineMediaBytes) {
        this.elements.userInput.value += `\n\n[Attachment skipped: ${name} (${mime || 'media'}) is larger than 4MB]`;
        continue;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        mediaAttachments.push({
          kind: isImage ? 'image' : isVideo ? 'video' : 'audio',
          name,
          mimeType: mime || 'application/octet-stream',
          size: file.size || 0,
          dataUrl,
        });
        this.elements.userInput.value += `\n\n[Attached ${isImage ? 'image' : isVideo ? 'video' : 'audio'}: ${name}]`;
      } catch (e) {
        console.warn('Failed to read media attachment', name, e);
      }
      continue;
    }

    try {
      const text = await file.text();
      const trimmed = text.length > maxPerFile ? `${text.slice(0, maxPerFile)}\n… (truncated)` : text;
      this.elements.userInput.value += `\n\n[File: ${name}]\n${trimmed}`;
    } catch (e) {
      console.warn('Failed to read file', name, e);
    }
  }

  this.pendingComposerAttachments = mediaAttachments.slice(-8);
  if (mediaAttachments.length > 0) {
    this.updateStatus(`${mediaAttachments.length} media attachment${mediaAttachments.length === 1 ? '' : 's'} ready`, 'active');
  }
  this.elements.userInput.focus();
};

(SidePanelUI.prototype as any).handleFileSelection = async function handleFileSelection(event: Event) {
  const input = event.target as HTMLInputElement | null;
  if (!input) return;
  const files = Array.from(input.files || []) as File[];
  if (!files.length) return;

  await this.ingestFilesIntoComposer(files, 'picker');
  input.value = '';
};

(SidePanelUI.prototype as any).toggleTabSelector = async function toggleTabSelector() {
  const isHidden = this.elements.tabSelector.classList.contains('hidden');
  if (isHidden) {
    await this.loadTabs();
    this.updateTabSelectorButton();
    this.elements.tabSelector.classList.remove('hidden');
  } else {
    this.closeTabSelector();
  }
};

(SidePanelUI.prototype as any).closeTabSelector = function closeTabSelector() {
  this.elements.tabSelector.classList.add('hidden');
};

(SidePanelUI.prototype as any).addActiveTabToSelection = async function addActiveTabToSelection() {
  const activeTab = await getActiveTab();
  if (!activeTab || typeof activeTab.id !== 'number') return;
  this.selectedTabs.set(activeTab.id, this.buildSelectedTab(activeTab));
  this.updateSelectedTabsBar();
  this.updateTabSelectorButton();
  this.loadTabs();
};

(SidePanelUI.prototype as any).clearSelectedTabs = function clearSelectedTabs() {
  if (this.selectedTabs.size === 0) return;
  this.selectedTabs.clear();
  this.updateSelectedTabsBar();
  this.updateTabSelectorButton();
  this.loadTabs();
};

(SidePanelUI.prototype as any).loadTabs = async function loadTabs() {
  const tabGroupsApi = chrome.tabGroups;
  const [tabs, groups] = await Promise.all([
    chrome.tabs.query({}),
    tabGroupsApi?.query ? tabGroupsApi.query({}) : Promise.resolve([]),
  ]);
  this.tabGroupInfo = new Map(groups.map((group) => [group.id, group]));
  this.elements.tabList.innerHTML = '';

  const groupedTabs = new Map<number, chrome.tabs.Tab[]>();
  const ungroupedTabs: chrome.tabs.Tab[] = [];

  tabs
    .filter((tab) => typeof tab.id === 'number')
    .forEach((tab) => {
      const groupId = typeof tab.groupId === 'number' ? tab.groupId : -1;
      if (groupId >= 0) {
        if (!groupedTabs.has(groupId)) groupedTabs.set(groupId, []);
        const bucket = groupedTabs.get(groupId);
        if (bucket) bucket.push(tab);
      } else {
        ungroupedTabs.push(tab);
      }
    });

  const renderGroup = (label: string, color: string, groupTabs: chrome.tabs.Tab[]) => {
    if (!groupTabs.length) return;
    const section = document.createElement('div');
    section.className = 'tab-group';
    const allSelected = groupTabs.every((tab) => typeof tab.id === 'number' && this.selectedTabs.has(tab.id));
    section.innerHTML = `
        <div class="tab-group-header" style="--group-color: ${color}">
          <div class="tab-group-label">
            <span>${this.escapeHtml(label)}</span>
            <span class="tab-group-count">${groupTabs.length}</span>
          </div>
          <button class="tab-group-toggle" type="button">${allSelected ? 'Clear' : 'Add all'}</button>
        </div>
      `;

    const toggleBtn = section.querySelector('.tab-group-toggle');
    toggleBtn?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleGroupSelection(groupTabs, !allSelected);
    });

    groupTabs.forEach((tab) => {
      const tabId = tab.id;
      const isSelected = typeof tabId === 'number' && this.selectedTabs.has(tabId);
      const item = document.createElement('div');
      item.className = `tab-item${isSelected ? ' selected' : ''}`;
      const urlLabel = this.formatTabLabel(tab.url || '');
      item.innerHTML = `
          <div class="tab-item-checkbox"></div>
          <img class="tab-item-favicon" src="${tab.favIconUrl || 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27%23666%27%3E%3Crect width=%2724%27 height=%2724%27 rx=%274%27/%3E%3C/svg%3E'}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27%23666%27%3E%3Crect width=%2724%27 height=%2724%27 rx=%274%27/%3E%3C/svg%3E'">
          <div class="tab-item-text">
            <span class="tab-item-title">${this.escapeHtml(tab.title || 'Untitled')}</span>
            ${urlLabel ? `<span class=\"tab-item-url\">${this.escapeHtml(urlLabel)}</span>` : ''}
          </div>
        `;
      item.addEventListener('click', () => this.toggleTabSelection(tab, item));
      section.appendChild(item);
    });

    this.elements.tabList.appendChild(section);
  };

  groupedTabs.forEach((groupTabs, groupId) => {
    const group = this.tabGroupInfo.get(groupId);
    const label = group?.title || `Group ${groupId}`;
    const color = this.mapGroupColor(group?.color);
    renderGroup(label, color, groupTabs);
  });

  renderGroup('Ungrouped', 'var(--text-tertiary)', ungroupedTabs);
};

(SidePanelUI.prototype as any).toggleGroupSelection = function toggleGroupSelection(
  groupTabs: chrome.tabs.Tab[],
  shouldSelect: boolean,
) {
  groupTabs.forEach((tab) => {
    if (typeof tab.id !== 'number') return;
    if (shouldSelect) {
      this.selectedTabs.set(tab.id, this.buildSelectedTab(tab));
    } else {
      this.selectedTabs.delete(tab.id);
    }
  });
  this.updateSelectedTabsBar();
  this.updateTabSelectorButton();
  this.loadTabs();
};

(SidePanelUI.prototype as any).toggleTabSelection = function toggleTabSelection(
  tab: chrome.tabs.Tab,
  itemElement: HTMLElement,
) {
  if (typeof tab.id !== 'number') return;
  if (this.selectedTabs.has(tab.id)) {
    this.selectedTabs.delete(tab.id);
    itemElement.classList.remove('selected');
  } else {
    this.selectedTabs.set(tab.id, this.buildSelectedTab(tab));
    itemElement.classList.add('selected');
  }
  this.updateSelectedTabsBar();
  this.updateTabSelectorButton();
  this.loadTabs();
};

(SidePanelUI.prototype as any).buildSelectedTab = function buildSelectedTab(tab: chrome.tabs.Tab) {
  const groupId = typeof tab.groupId === 'number' ? tab.groupId : -1;
  const group = groupId >= 0 ? this.tabGroupInfo.get(groupId) : undefined;
  const hasGroup = groupId >= 0;
  return {
    id: tab.id,
    title: tab.title,
    url: tab.url,
    windowId: tab.windowId,
    groupId: hasGroup ? groupId : -1,
    groupTitle: hasGroup ? group?.title || `Group ${groupId}` : 'Ungrouped',
    groupColor: hasGroup ? this.mapGroupColor(group?.color) : 'var(--text-tertiary)',
  };
};

(SidePanelUI.prototype as any).updateSelectedTabsBar = function updateSelectedTabsBar() {
  // Keep selected tabs context logic, but avoid duplicating this info in the
  // main chat layout. The tab selector button/count remains the primary UI.
  if (this.elements.selectedTabsBar) {
    this.elements.selectedTabsBar.classList.add('hidden');
    this.elements.selectedTabsBar.innerHTML = '';
  }
};

(SidePanelUI.prototype as any).updateTabSelectorButton = function updateTabSelectorButton() {
  const count = this.selectedTabs.size;
  if (count > 0) {
    this.elements.tabSelectorBtn.classList.add('has-selection');
    this.elements.tabSelectorBtn.dataset.count = String(count);
  } else {
    this.elements.tabSelectorBtn.classList.remove('has-selection');
    delete this.elements.tabSelectorBtn.dataset.count;
  }
  if (this.elements.tabSelectorSummary) {
    this.elements.tabSelectorSummary.textContent = count > 0 ? `${count} selected` : 'No tabs selected';
  }
};

(SidePanelUI.prototype as any).mapGroupColor = function mapGroupColor(colorName: string) {
  const palette: Record<string, string> = {
    grey: '#9aa0a6',
    blue: '#4c8bf5',
    red: '#ea4335',
    yellow: '#fbbc04',
    green: '#34a853',
    pink: '#f06292',
    purple: '#a142f4',
    cyan: '#24c1e0',
    orange: '#f29900',
  };
  return palette[colorName] || 'var(--text-tertiary)';
};

(SidePanelUI.prototype as any).formatTabLabel = function formatTabLabel(url?: string) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

(SidePanelUI.prototype as any).getSelectedTabsContext = function getSelectedTabsContext(
  tabs?: Array<any>,
  source: 'selected' | 'active' = 'selected',
) {
  const tabList = tabs ?? Array.from(this.selectedTabs.values());
  if (!tabList.length) return '';

  const label = source === 'active' ? 'active tab' : 'selected tabs';
  let context = `\n\n[Context from ${label}:]\n`;
  tabList.forEach((tab: any) => {
    const tabTitle = tab.title || 'Untitled';
    const groupLabel = tab.groupTitle ? `${tab.groupTitle} · ` : '';
    const urlLabel = tab.url || '';
    context += `- ${groupLabel}"${tabTitle}": ${urlLabel}\n`;
  });
  return context;
};
