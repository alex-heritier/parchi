import type { RecordedContext, RecordingEvent, RecordingScreenshot, RecordingState } from '@parchi/shared';

const MAX_DURATION_MS = 60_000;
const SCREENSHOT_INTERVAL_MS = 3_000;
const MAX_SCREENSHOTS = 20;
const MAX_EVENTS = 100;
const RESTRICTED_URL_PATTERN = /^(chrome|chrome-extension|edge|about|devtools|file):/;

// Event dedup thresholds
const CLICK_DEDUP_MS = 500;
const SCROLL_MERGE_MS = 2000;
const INPUT_MERGE_MS = 1000;
const MUTATION_MERGE_MS = 1000;

// Priority for capping: higher = more important
const EVENT_PRIORITY: Record<string, number> = {
  navigation: 5,
  click: 4,
  input: 3,
  dom_mutation: 2,
  scroll: 1,
};

export class RecordingCoordinator {
  state: RecordingState | null = null;
  screenshotBuffer: RecordingScreenshot[] = [];
  eventBuffer: RecordingEvent[] = [];
  private screenshotTimer: ReturnType<typeof setInterval> | null = null;
  private maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private tabUpdateListener: ((tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => void) | null = null;
  private tabRemovedListener: ((tabId: number) => void) | null = null;

  async startRecording(tabId?: number): Promise<void> {
    if (this.state && this.state.status === 'recording') {
      throw new Error('Already recording');
    }

    // Resolve tab
    let resolvedTabId = tabId;
    if (!resolvedTabId) {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) throw new Error('No active tab found');
      resolvedTabId = activeTab.id;
    }

    // Check URL
    const tab = await chrome.tabs.get(resolvedTabId);
    if (!tab.url || RESTRICTED_URL_PATTERN.test(tab.url)) {
      throw new Error('Cannot record on this page (restricted URL)');
    }

    // Reset buffers
    this.screenshotBuffer = [];
    this.eventBuffer = [];

    // Set state
    this.state = {
      status: 'recording',
      tabId: resolvedTabId,
      startedAt: Date.now(),
      elapsedMs: 0,
      screenshotCount: 0,
      eventCount: 0,
    };

    // Inject content script
    await this.injectContentScript(resolvedTabId);

    // Take first screenshot immediately
    await this.captureScreenshot();

    // Start screenshot interval
    this.screenshotTimer = setInterval(async () => {
      if (this.screenshotBuffer.length >= MAX_SCREENSHOTS) {
        await this.stopRecording();
        return;
      }
      await this.captureScreenshot();
    }, SCREENSHOT_INTERVAL_MS);

    // Start tick updates (every second)
    this.tickTimer = setInterval(() => {
      if (!this.state) return;
      this.state.elapsedMs = Date.now() - this.state.startedAt;
      this.sendToSidePanel({
        type: 'recording_tick',
        elapsedMs: this.state.elapsedMs,
        screenshotCount: this.state.screenshotCount,
        eventCount: this.state.eventCount,
      });
    }, 1000);

    // Auto-stop after max duration
    this.maxDurationTimer = setTimeout(() => this.stopRecording(), MAX_DURATION_MS);

    // Re-inject on navigation
    this.tabUpdateListener = (changedTabId, changeInfo) => {
      if (changedTabId === this.state?.tabId && changeInfo.status === 'complete') {
        this.injectContentScript(changedTabId).catch(() => {});
      }
    };
    chrome.tabs.onUpdated.addListener(this.tabUpdateListener);

    // Auto-stop if tab closed
    this.tabRemovedListener = (removedTabId) => {
      if (removedTabId === this.state?.tabId) {
        this.stopRecording().catch(() => {});
      }
    };
    chrome.tabs.onRemoved.addListener(this.tabRemovedListener);
  }

  async stopRecording(): Promise<void> {
    if (!this.state || this.state.status !== 'recording') return;

    // Set status immediately to prevent async re-entrancy
    this.state.status = 'selecting';
    this.state.elapsedMs = Date.now() - this.state.startedAt;

    this.clearTimers();
    this.removeTabListeners();

    // Tell content script to stop
    if (this.state.tabId) {
      try {
        await chrome.tabs.sendMessage(this.state.tabId, { type: 'recording_content_stop' });
      } catch {
        // Tab may have been closed
      }
      await this.forceCleanupContentScript(this.state.tabId);
    }

    // Deduplicate events
    const dedupedEvents = this.deduplicateEvents();

    this.sendToSidePanel({
      type: 'recording_complete',
      screenshots: this.screenshotBuffer,
      events: dedupedEvents,
    });
  }

  handleContentEvent(event: RecordingEvent): void {
    if (!this.state || this.state.status !== 'recording') return;

    // Inline dedup: skip if identical type+selector to last event within short window
    const last = this.eventBuffer[this.eventBuffer.length - 1];
    if (last && last.type === event.type && last.selector === event.selector) {
      const timeDiff = event.timestamp - last.timestamp;
      if (event.type === 'click' && timeDiff < CLICK_DEDUP_MS) return;
      if (event.type === 'input' && timeDiff < INPUT_MERGE_MS) return;
    }

    this.eventBuffer.push(event);
    this.state.eventCount = this.eventBuffer.length;
  }

  async selectImages(selectedIds: string[]): Promise<RecordedContext> {
    if (!this.state) throw new Error('No active recording session');

    const selected = this.screenshotBuffer
      .filter((s) => selectedIds.includes(s.id))
      .map((s) => ({
        dataUrl: s.dataUrl,
        timestamp: s.timestamp,
        url: s.url,
        index: s.index,
      }));

    const events = this.deduplicateEvents();
    const urlTimeline = this.buildUrlTimeline(events);
    const summary = this.generateSummary(events, urlTimeline, selected.length);

    const context: RecordedContext = {
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
      duration: this.state?.elapsedMs || 0,
      selectedImages: selected,
      events,
      urlTimeline,
      summary,
    };

    this.state = { ...this.state!, status: 'ready' };

    this.sendToSidePanel({
      type: 'recording_context_ready',
      context,
    });

    return context;
  }

  discard(): void {
    const tabId = this.state?.tabId;
    this.clearTimers();
    this.removeTabListeners();
    this.screenshotBuffer = [];
    this.eventBuffer = [];
    this.state = null;
    if (typeof tabId === 'number') {
      void this.forceCleanupContentScript(tabId);
    }
  }

  private async injectContentScript(tabId: number): Promise<void> {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content-recording.js'],
      });
    } catch (err) {
      console.warn('[RecordingCoordinator] Failed to inject content script:', err);
    }
  }

  private async forceCleanupContentScript(tabId: number): Promise<void> {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          try {
            window.__parchiRecordingCleanup?.();
          } catch {}
        },
      });
    } catch {
      // Ignore if the tab is gone or script context is unavailable.
    }
  }

  private async captureScreenshot(): Promise<void> {
    if (!this.state || this.state.status !== 'recording') return;
    if (this.screenshotBuffer.length >= MAX_SCREENSHOTS) return;

    try {
      const tab = await chrome.tabs.get(this.state.tabId);
      if (!tab.windowId) return;

      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: 'jpeg',
        quality: 50,
      });

      const screenshot: RecordingScreenshot = {
        id: `ss-${Date.now()}-${this.screenshotBuffer.length}`,
        timestamp: Date.now(),
        dataUrl,
        url: tab.url || '',
        index: this.screenshotBuffer.length,
      };

      this.screenshotBuffer.push(screenshot);
      this.state.screenshotCount = this.screenshotBuffer.length;
    } catch (err) {
      console.warn('[RecordingCoordinator] Screenshot capture failed:', err);
    }
  }

  private deduplicateEvents(): RecordingEvent[] {
    const events = [...this.eventBuffer];
    const merged: RecordingEvent[] = [];

    for (let i = 0; i < events.length; i++) {
      const curr = events[i];
      const prev = merged[merged.length - 1];

      if (!prev) {
        merged.push(curr);
        continue;
      }

      const timeDiff = curr.timestamp - prev.timestamp;

      // Merge consecutive scrolls
      if (curr.type === 'scroll' && prev.type === 'scroll' && timeDiff < SCROLL_MERGE_MS) {
        prev.scrollY = curr.scrollY;
        prev.direction = curr.direction;
        continue;
      }

      // Merge rapid clicks on same selector
      if (
        curr.type === 'click' &&
        prev.type === 'click' &&
        curr.selector === prev.selector &&
        timeDiff < CLICK_DEDUP_MS
      ) {
        continue;
      }

      // Merge consecutive inputs on same field
      if (
        curr.type === 'input' &&
        prev.type === 'input' &&
        curr.selector === prev.selector &&
        timeDiff < INPUT_MERGE_MS
      ) {
        continue;
      }

      // Merge DOM mutations on same target
      if (curr.type === 'dom_mutation' && prev.type === 'dom_mutation' && timeDiff < MUTATION_MERGE_MS) {
        prev.addedCount = (prev.addedCount || 0) + (curr.addedCount || 0);
        prev.removedCount = (prev.removedCount || 0) + (curr.removedCount || 0);
        prev.attributeChanges = (prev.attributeChanges || 0) + (curr.attributeChanges || 0);
        prev.summary = `+${prev.addedCount} nodes, -${prev.removedCount} nodes, ${prev.attributeChanges} attr changes`;
        continue;
      }

      merged.push(curr);
    }

    // Cap at MAX_EVENTS, prioritizing by type
    if (merged.length > MAX_EVENTS) {
      merged.sort((a, b) => (EVENT_PRIORITY[b.type] || 0) - (EVENT_PRIORITY[a.type] || 0));
      const capped = merged.slice(0, MAX_EVENTS);
      capped.sort((a, b) => a.timestamp - b.timestamp);
      return capped;
    }

    return merged;
  }

  private buildUrlTimeline(events: RecordingEvent[]): Array<{ url: string; timestamp: number }> {
    const timeline: Array<{ url: string; timestamp: number }> = [];
    const seen = new Set<string>();

    for (const ev of events) {
      if (ev.type === 'navigation' && ev.toUrl && !seen.has(ev.toUrl)) {
        seen.add(ev.toUrl);
        timeline.push({ url: ev.toUrl, timestamp: ev.timestamp });
      }
    }

    // Add starting URL if not already in timeline
    if (events.length > 0 && !seen.has(events[0].url)) {
      timeline.unshift({ url: events[0].url, timestamp: events[0].timestamp });
    }

    return timeline;
  }

  private generateSummary(
    events: RecordingEvent[],
    urlTimeline: Array<{ url: string; timestamp: number }>,
    imageCount: number,
  ): string {
    const clicks = events.filter((e) => e.type === 'click');
    const inputs = events.filter((e) => e.type === 'input');
    const scrolls = events.filter((e) => e.type === 'scroll');
    const navigations = events.filter((e) => e.type === 'navigation');
    const mutations = events.filter((e) => e.type === 'dom_mutation');

    const lines: string[] = [];
    lines.push(`[Recorded context: ${imageCount} screenshots, ${events.length} events]`);

    if (urlTimeline.length > 0) {
      lines.push(`Pages visited: ${urlTimeline.map((u) => u.url).join(' -> ')}`);
    }

    if (clicks.length > 0) {
      const targets = clicks.slice(0, 5).map((c) => {
        const label = c.textContent ? `"${c.textContent.slice(0, 30)}"` : c.selector || c.tagName || 'element';
        return label;
      });
      lines.push(`Clicked: ${targets.join(', ')}${clicks.length > 5 ? ` (+${clicks.length - 5} more)` : ''}`);
    }

    if (inputs.length > 0) {
      const fields = inputs.slice(0, 3).map((i) => i.placeholder || i.selector || 'field');
      lines.push(`Typed in: ${fields.join(', ')}${inputs.length > 3 ? ` (+${inputs.length - 3} more)` : ''}`);
    }

    if (navigations.length > 0) {
      lines.push(`Navigated ${navigations.length} time(s)`);
    }

    if (scrolls.length > 0) {
      lines.push(`Scrolled ${scrolls.length} time(s)`);
    }

    if (mutations.length > 0) {
      const totalAdded = mutations.reduce((sum, m) => sum + (m.addedCount || 0), 0);
      const totalRemoved = mutations.reduce((sum, m) => sum + (m.removedCount || 0), 0);
      if (totalAdded > 0 || totalRemoved > 0) {
        lines.push(`DOM changes: +${totalAdded} / -${totalRemoved} nodes`);
      }
    }

    return lines.join('\n');
  }

  private sendToSidePanel(message: Record<string, unknown>): void {
    try {
      chrome.runtime.sendMessage(message);
    } catch {
      // Sidepanel may not be open
    }
  }

  private clearTimers(): void {
    if (this.screenshotTimer) {
      clearInterval(this.screenshotTimer);
      this.screenshotTimer = null;
    }
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private removeTabListeners(): void {
    if (this.tabUpdateListener) {
      chrome.tabs.onUpdated.removeListener(this.tabUpdateListener);
      this.tabUpdateListener = null;
    }
    if (this.tabRemovedListener) {
      chrome.tabs.onRemoved.removeListener(this.tabRemovedListener);
      this.tabRemovedListener = null;
    }
  }
}
