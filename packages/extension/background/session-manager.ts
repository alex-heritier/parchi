import { RUNTIME_MESSAGE_SCHEMA_VERSION } from '@parchi/shared';
import { BrowserTools } from '../tools/browser-tools.js';
import { estimateDataUrlBytes, trimReportImages } from './report-images.js';
import type { RunMeta, SessionState, SessionTokenVisibility } from './service-types.js';
import type { ServiceContext, TokenTracePayload } from './service-context.js';

export const MAX_SESSIONS = 10;
export const MAX_FAILURE_TRACKER_ENTRIES = 250;

export function defaultTokenVisibility(): SessionTokenVisibility {
  return {
    providerInputTokens: null,
    providerOutputTokens: null,
    contextApproxTokens: null,
    contextLimit: null,
    contextPercent: null,
    sessionInputTokens: 0,
    sessionOutputTokens: 0,
    sessionTotalTokens: 0,
  };
}

export function normalizeContextPercent(tokens: number | null, limit: number | null): number | null {
  if (typeof tokens !== 'number' || tokens < 0) return null;
  if (typeof limit !== 'number' || limit <= 0) return null;
  const raw = (tokens / Math.max(1, limit)) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function getTokenVisibilitySnapshot(sessionState: SessionState): SessionTokenVisibility {
  return {
    ...(sessionState.tokenVisibility || defaultTokenVisibility()),
  };
}

export function updateSessionTokenVisibility(
  sessionState: SessionState,
  patch: Partial<SessionTokenVisibility>,
): SessionTokenVisibility {
  const current = sessionState.tokenVisibility || defaultTokenVisibility();
  const merged: SessionTokenVisibility = {
    ...current,
    ...patch,
  };
  merged.sessionInputTokens = Math.max(0, Number(merged.sessionInputTokens || 0));
  merged.sessionOutputTokens = Math.max(0, Number(merged.sessionOutputTokens || 0));
  merged.sessionTotalTokens = Math.max(0, Number(merged.sessionTotalTokens || 0));
  if (typeof merged.contextPercent !== 'number') {
    merged.contextPercent = normalizeContextPercent(merged.contextApproxTokens, merged.contextLimit);
  } else {
    merged.contextPercent = Math.max(0, Math.min(100, Math.round(merged.contextPercent)));
  }
  sessionState.tokenVisibility = merged;
  return getTokenVisibilitySnapshot(sessionState);
}

export function emitTokenTrace(
  ctx: ServiceContext,
  runMeta: RunMeta,
  sessionState: SessionState,
  payload: TokenTracePayload,
) {
  const before = payload.before || getTokenVisibilitySnapshot(sessionState);
  const after = payload.afterPatch
    ? updateSessionTokenVisibility(sessionState, payload.afterPatch)
    : getTokenVisibilitySnapshot(sessionState);
  ctx.sendRuntime(runMeta, {
    type: 'token_trace',
    action: payload.action,
    reason: payload.reason,
    note: payload.note,
    before,
    after,
    details: payload.details,
  });
}

export function getSessionState(
  sessionStateById: Map<string, SessionState>,
  sessionId: string,
): SessionState {
  const id = typeof sessionId === 'string' && sessionId.trim() ? sessionId : 'default';
  const existing = sessionStateById.get(id);
  if (existing) {
    if (!Array.isArray(existing.reportImages)) existing.reportImages = [];
    if (!(existing.selectedReportImageIds instanceof Set)) {
      existing.selectedReportImageIds = new Set<string>();
    }
    if (!Number.isFinite(existing.reportImageBytes)) {
      existing.reportImageBytes = existing.reportImages.reduce(
        (sum, image) => sum + estimateDataUrlBytes(String(image?.dataUrl || '')),
        0,
      );
    }
    if (!existing.tokenVisibility || typeof existing.tokenVisibility !== 'object') {
      existing.tokenVisibility = defaultTokenVisibility();
    } else {
      updateSessionTokenVisibility(existing, {});
    }
    trimReportImages(existing);
    return existing;
  }
  // Evict oldest sessions when at capacity
  if (sessionStateById.size >= MAX_SESSIONS) {
    const oldestKey = sessionStateById.keys().next().value;
    if (oldestKey !== undefined) sessionStateById.delete(oldestKey);
  }
  const created: SessionState = {
    sessionId: id,
    currentPlan: null,
    subAgentCount: 0,
    subAgentProfileCursor: 0,
    lastBrowserAction: null,
    awaitingVerification: false,
    currentStepVerified: false,
    kimiWarningSent: false,
    failureTracker: new Map(),
    reportImages: [],
    reportImageBytes: 0,
    selectedReportImageIds: new Set(),
    tokenVisibility: defaultTokenVisibility(),
  };
  sessionStateById.set(id, created);
  return created;
}

export function getBrowserTools(
  browserToolsBySessionId: Map<string, BrowserTools>,
  currentSettings: Record<string, any> | null,
  sessionId: string,
): BrowserTools {
  const id = typeof sessionId === 'string' && sessionId.trim() ? sessionId : 'default';
  const existing = browserToolsBySessionId.get(id);
  if (existing) return existing;
  // Evict oldest entries when at capacity
  if (browserToolsBySessionId.size >= MAX_SESSIONS) {
    const oldestKey = browserToolsBySessionId.keys().next().value;
    if (oldestKey !== undefined) browserToolsBySessionId.delete(oldestKey);
  }
  const created = new BrowserTools();
  const quality = currentSettings?.screenshotQuality;
  if (quality === 'high' || quality === 'medium' || quality === 'low') {
    created.screenshotQuality = quality;
  }
  browserToolsBySessionId.set(id, created);
  return created;
}

export function isRunCancelled(cancelledRunIds: Set<string>, runId: string) {
  return cancelledRunIds.has(runId);
}

export function stopRun(ctx: ServiceContext, runId: string, note = 'Stopped') {
  const active = ctx.activeRuns.get(runId);
  if (!active) return;

  ctx.sendRuntime(active.runMeta, {
    type: 'run_status',
    phase: 'stopped',
    attempts: { api: 0, tool: 0, finalize: 0 },
    maxRetries: { api: 0, tool: 0, finalize: 0 },
    note,
  });

  ctx.cancelledRunIds.add(runId);

  try {
    active.controller.abort(note);
  } catch {}

  if (active.origin === 'relay') {
    ctx.relayActiveRunIds.delete(runId);
    if (ctx.relay.isConnected()) {
      ctx.relay.notify('run.done', { runId, status: 'stopped', note });
    }
  }
}

export function stopRunBySession(ctx: ServiceContext, sessionId: string, note = 'Stopped') {
  const runId = ctx.activeRunIdBySessionId.get(sessionId);
  if (runId) {
    stopRun(ctx, runId, note);
    return true;
  }
  return false;
}

export function stopAllSidepanelRuns(ctx: ServiceContext, note = 'Stopped') {
  for (const [runId, active] of ctx.activeRuns.entries()) {
    if (active.origin !== 'sidepanel') continue;
    stopRun(ctx, runId, note);
  }
}

export function registerActiveRun(
  ctx: ServiceContext,
  runMeta: RunMeta,
  origin: 'sidepanel' | 'relay',
): AbortController {
  stopRunBySession(ctx, runMeta.sessionId, 'Superseded by a new message');
  const controller = new AbortController();
  ctx.activeRuns.set(runMeta.runId, { runMeta, origin, controller });
  ctx.activeRunIdBySessionId.set(runMeta.sessionId, runMeta.runId);
  return controller;
}

export function cleanupRun(ctx: ServiceContext, runMeta: RunMeta, origin: 'sidepanel' | 'relay') {
  const active = ctx.activeRuns.get(runMeta.runId);
  if (active && active.origin === origin) {
    ctx.activeRuns.delete(runMeta.runId);
  }
  const mapped = ctx.activeRunIdBySessionId.get(runMeta.sessionId);
  if (mapped === runMeta.runId) {
    ctx.activeRunIdBySessionId.delete(runMeta.sessionId);
  }
  ctx.cancelledRunIds.delete(runMeta.runId);
}

export function sendRuntime(
  ctx: ServiceContext,
  runMeta: RunMeta,
  payload: Record<string, unknown>,
) {
  if (isRunCancelled(ctx.cancelledRunIds, runMeta.runId)) return;
  const message = {
    schemaVersion: RUNTIME_MESSAGE_SCHEMA_VERSION,
    runId: runMeta.runId,
    turnId: runMeta.turnId,
    sessionId: runMeta.sessionId,
    timestamp: Date.now(),
    ...payload,
  };
  ctx.sendToSidePanel(message);

  if (ctx.relayActiveRunIds.has(runMeta.runId) && ctx.relay.isConnected()) {
    ctx.relay.notify('run.event', { runId: runMeta.runId, event: message });
    const type = typeof payload.type === 'string' ? payload.type : '';
    if (type === 'assistant_final') {
      ctx.relay.notify('run.done', { runId: runMeta.runId, status: 'completed', final: message });
    } else if (type === 'run_error') {
      ctx.relay.notify('run.done', { runId: runMeta.runId, status: 'failed', error: message });
    }
  }
}
