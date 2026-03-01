/**
 * Performance Monitor — dev-only profiling for long-running sessions.
 *
 * Activated by:
 *   1. Build flag:  PERF_DEBUG=true npm run build
 *   2. Runtime:     window.__PERF_DEBUG__ = true  (then call window.perfMonitor.start())
 *   3. Console:     window.perfMonitor.start() / .stop() / .snapshot() / .report()
 *
 * Zero overhead when inactive. Does NOT touch functionality.
 */

/* ── Types ────────────────────────────────────────────────────────── */

interface Snapshot {
  ts: number;
  elapsed: string;
  memory: {
    jsHeapUsedMB: number;
    jsHeapTotalMB: number;
    jsHeapLimitMB: number;
  } | null;
  dom: {
    totalNodes: number;
    chatMessageNodes: number;
    chatChildCount: number;
  };
  dataStructures: {
    displayHistory: number;
    contextHistory: number;
    reportImages: number;
    reportImagesEstKB: number;
    toolCallViews: number;
    historyTurnMap: number;
    scrollPositions: number;
    subagents: number;
    stepTimelineSteps: number;
    selectedTabs: number;
    modelCatalogEntries: number;
    workflows: number;
  } | null;
  timers: {
    thinkingTimerActive: boolean;
    runTimerActive: boolean;
    watchdogActive: boolean;
    typingCheckActive: boolean;
    recordingTimerActive: boolean;
  } | null;
  css: {
    runningAnimations: number;
  };
}

interface PerfReport {
  sessionDuration: string;
  snapshotCount: number;
  current: Snapshot;
  deltas: {
    memoryDeltaMB: number | null;
    domNodesDelta: number;
    chatNodesDelta: number;
  } | null;
  warnings: string[];
}

/* ── Helpers ──────────────────────────────────────────────────────── */

const MB = 1024 * 1024;

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function getMemory(): Snapshot['memory'] {
  const perf = performance as any;
  if (!perf.memory) return null;
  return {
    jsHeapUsedMB: +(perf.memory.usedJSHeapSize / MB).toFixed(2),
    jsHeapTotalMB: +(perf.memory.totalJSHeapSize / MB).toFixed(2),
    jsHeapLimitMB: +(perf.memory.jsHeapSizeLimit / MB).toFixed(2),
  };
}

function getDomStats(): Snapshot['dom'] {
  const chatMessages = document.querySelector('#chat-messages, .chat-messages');
  return {
    totalNodes: document.querySelectorAll('*').length,
    chatMessageNodes: chatMessages ? chatMessages.querySelectorAll('*').length : 0,
    chatChildCount: chatMessages ? chatMessages.childElementCount : 0,
  };
}

function getCssAnimations(): number {
  try {
    return document.getAnimations?.().length ?? 0;
  } catch {
    return 0;
  }
}

function getUI(): any {
  return (window as any).sidePanelUI ?? null;
}

function getDataStructures(): Snapshot['dataStructures'] {
  const ui = getUI();
  if (!ui) return null;

  // Estimate reportImages size from dataUrl lengths
  let reportImagesEstBytes = 0;
  if (ui.reportImages instanceof Map) {
    for (const [, img] of ui.reportImages) {
      reportImagesEstBytes += img?.dataUrl?.length ?? 0;
    }
  }

  return {
    displayHistory: ui.displayHistory?.length ?? 0,
    contextHistory: ui.contextHistory?.length ?? 0,
    reportImages: ui.reportImages?.size ?? 0,
    reportImagesEstKB: +(reportImagesEstBytes / 1024).toFixed(1),
    toolCallViews: ui.toolCallViews?.size ?? 0,
    historyTurnMap: ui.historyTurnMap?.size ?? 0,
    scrollPositions: ui.scrollPositions?.size ?? 0,
    subagents: ui.subagents?.size ?? 0,
    stepTimelineSteps: ui.stepTimeline?.steps?.size ?? 0,
    selectedTabs: ui.selectedTabs?.size ?? 0,
    modelCatalogEntries: ui.modelCatalogEntries?.length ?? 0,
    workflows: ui.workflows?.length ?? 0,
  };
}

function getTimerState(): Snapshot['timers'] {
  const ui = getUI();
  if (!ui) return null;
  return {
    thinkingTimerActive: ui.thinkingTimerId != null,
    runTimerActive: ui.runTimerId != null,
    watchdogActive: ui._watchdogTimerId != null,
    typingCheckActive: ui._typingCheckTimerId != null,
    recordingTimerActive: ui.recordingState?.timerId != null,
  };
}

/* ── Monitor ─────────────────────────────────────────────────────── */

class PerfMonitor {
  private _intervalId: number | null = null;
  private _intervalMs = 30_000; // default: snapshot every 30s
  private _startedAt = 0;
  private _snapshots: Snapshot[] = [];
  private _maxSnapshots = 2880; // ~24h at 30s intervals

  /** Take a single snapshot and store it. */
  snapshot(): Snapshot {
    const snap: Snapshot = {
      ts: Date.now(),
      elapsed: formatDuration(Date.now() - this._startedAt),
      memory: getMemory(),
      dom: getDomStats(),
      dataStructures: getDataStructures(),
      timers: getTimerState(),
      css: { runningAnimations: getCssAnimations() },
    };
    this._snapshots.push(snap);
    if (this._snapshots.length > this._maxSnapshots) {
      this._snapshots.splice(0, this._snapshots.length - this._maxSnapshots);
    }
    return snap;
  }

  /** Start periodic snapshotting. */
  start(intervalMs?: number): void {
    if (this._intervalId) {
      console.warn('[perf] Already running. Call stop() first.');
      return;
    }
    this._intervalMs = intervalMs ?? this._intervalMs;
    this._startedAt = Date.now();
    this._snapshots = [];
    console.log(`[perf] Started — snapshotting every ${this._intervalMs / 1000}s`);
    this.snapshot(); // initial
    this._intervalId = window.setInterval(() => {
      const s = this.snapshot();
      // Auto-warn on concerning thresholds
      const warnings = this._checkThresholds(s);
      if (warnings.length > 0) {
        console.warn(`[perf] ⚠ ${warnings.join(' | ')}`);
      }
    }, this._intervalMs);
  }

  /** Stop periodic snapshotting. */
  stop(): void {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
      console.log(
        `[perf] Stopped — ${this._snapshots.length} snapshots collected over ${formatDuration(Date.now() - this._startedAt)}`,
      );
    }
  }

  /** Get all snapshots (for external analysis). */
  get snapshots(): readonly Snapshot[] {
    return this._snapshots;
  }

  /** Generate a human-readable report. */
  report(): PerfReport {
    const current = this.snapshot();
    const first = this._snapshots[0];

    let deltas: PerfReport['deltas'] = null;
    if (first && first !== current) {
      deltas = {
        memoryDeltaMB:
          current.memory && first.memory ? +(current.memory.jsHeapUsedMB - first.memory.jsHeapUsedMB).toFixed(2) : null,
        domNodesDelta: current.dom.totalNodes - first.dom.totalNodes,
        chatNodesDelta: current.dom.chatMessageNodes - first.dom.chatMessageNodes,
      };
    }

    const warnings = this._checkThresholds(current);
    const report: PerfReport = {
      sessionDuration: formatDuration(Date.now() - this._startedAt),
      snapshotCount: this._snapshots.length,
      current,
      deltas,
      warnings,
    };

    console.log('[perf] Report:', report);
    return report;
  }

  /** Print a compact timeline of key metrics to console. */
  timeline(): void {
    if (this._snapshots.length === 0) {
      console.log('[perf] No snapshots yet.');
      return;
    }
    const rows = this._snapshots.map((s) => ({
      elapsed: s.elapsed,
      heapMB: s.memory?.jsHeapUsedMB ?? '?',
      domNodes: s.dom.totalNodes,
      chatNodes: s.dom.chatChildCount,
      messages: s.dataStructures?.displayHistory ?? '?',
      images: s.dataStructures?.reportImages ?? '?',
      imagesKB: s.dataStructures?.reportImagesEstKB ?? '?',
      toolViews: s.dataStructures?.toolCallViews ?? '?',
      animations: s.css.runningAnimations,
    }));
    console.table(rows);
  }

  /** Export snapshots as JSON (copy-pasteable). */
  exportJSON(): string {
    const json = JSON.stringify(this._snapshots, null, 2);
    console.log(`[perf] ${this._snapshots.length} snapshots exported (${(json.length / 1024).toFixed(1)} KB)`);
    return json;
  }

  /** Download snapshots as a JSON file. */
  download(): void {
    const json = this.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `perf-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Internal ────────────────────────────────────────────────── */

  private _checkThresholds(s: Snapshot): string[] {
    const w: string[] = [];

    if (s.memory && s.memory.jsHeapUsedMB > 150) {
      w.push(`Heap ${s.memory.jsHeapUsedMB}MB (>150MB)`);
    }
    if (s.dom.totalNodes > 5000) {
      w.push(`DOM ${s.dom.totalNodes} nodes (>5000)`);
    }
    if (s.dom.chatChildCount > 200) {
      w.push(`Chat ${s.dom.chatChildCount} children (>200)`);
    }
    if (s.dataStructures) {
      if (s.dataStructures.displayHistory > 300) {
        w.push(`displayHistory ${s.dataStructures.displayHistory} msgs (>300)`);
      }
      if (s.dataStructures.reportImagesEstKB > 2048) {
        w.push(`reportImages ${s.dataStructures.reportImagesEstKB}KB (>2MB)`);
      }
      if (s.dataStructures.scrollPositions > 50) {
        w.push(`scrollPositions ${s.dataStructures.scrollPositions} entries (>50)`);
      }
    }
    if (s.timers) {
      const activeTimers = Object.entries(s.timers).filter(([, v]) => v);
      if (activeTimers.length > 0 && !getUI()?.isStreaming) {
        w.push(`Timers active while idle: ${activeTimers.map(([k]) => k).join(', ')}`);
      }
    }
    if (s.css.runningAnimations > 10) {
      w.push(`${s.css.runningAnimations} CSS animations running (>10)`);
    }

    return w;
  }
}

/* ── Singleton + global exposure ─────────────────────────────────── */

export const perfMonitor = new PerfMonitor();

// Expose on window for console access
(window as any).perfMonitor = perfMonitor;
