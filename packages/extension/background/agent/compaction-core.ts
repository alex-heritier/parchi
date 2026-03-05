import { DEFAULT_COMPACTION_SETTINGS, estimateContextTokens, shouldCompact } from '../../ai/compaction.js';
import { normalizeConversationHistory } from '../../ai/message-schema.js';
import type { Message } from '../../ai/message-schema.js';
import { captureCompaction } from '../telemetry.js';
import { applyCompactionResult } from './compaction-apply.js';
import { type RunContextCompactionOptions, profileUsesCodexOAuth } from './compaction-shared.js';
import { prepareCompactionSlice } from './compaction-slicing.js';
import { generateCompactionSummary } from './compaction-summary.js';

export async function runContextCompaction(
  ctx: import('../service-context.js').ServiceContext,
  options: RunContextCompactionOptions,
): Promise<{ compacted: boolean; reason?: string }> {
  const compactionSettings = DEFAULT_COMPACTION_SETTINGS;
  const sessionState = ctx.getSessionState(options.runMeta.sessionId);
  const nextHistory = normalizeConversationHistory(Array.isArray(options.history) ? options.history : []);
  const contextUsage = estimateContextTokens(nextHistory);
  const compactionCheck = shouldCompact({
    contextTokens: contextUsage.tokens,
    contextLimit: options.contextLimit,
    settings: compactionSettings,
  });
  const currentPercent = Math.max(0, Math.min(100, Math.round(compactionCheck.percent * 100)));
  const forceCompaction = options.force === true;
  const keepRecentTokens = forceCompaction
    ? Math.max(320, Math.floor(options.contextLimit * 0.02))
    : compactionSettings.keepRecentTokens;

  const compactionMetrics: Record<string, unknown> = {
    runId: options.runMeta.runId,
    turnId: options.runMeta.turnId,
    sessionId: options.runMeta.sessionId,
    source: options.source || 'auto',
    forced: forceCompaction,
    contextLimit: options.contextLimit,
    decision: {
      shouldCompact: compactionCheck.shouldCompact,
      percent: currentPercent,
      approxTokens: compactionCheck.approxTokens,
      reserveTokens: compactionSettings.reserveTokens,
      keepRecentTokens,
    },
    summary: {
      provider: String(options.orchestratorProfile?.provider || ''),
      model: String(options.orchestratorProfile?.model || ''),
    },
    compaction: {
      beforeApproxTokens: compactionCheck.approxTokens,
      beforePercent: currentPercent,
    },
  };

  ctx.sendRuntime(options.runMeta, {
    type: 'compaction_event',
    stage: 'decision',
    source: options.source || 'auto',
    note: forceCompaction
      ? 'Compaction forced by user request.'
      : `Compaction decision evaluated at ${currentPercent}% context usage.`,
    details: {
      shouldCompact: compactionCheck.shouldCompact,
      forced: forceCompaction,
      contextLimit: options.contextLimit,
      approxTokens: compactionCheck.approxTokens,
      reserveTokens: compactionSettings.reserveTokens,
      keepRecentTokens,
    },
  });
  ctx.emitTokenTrace(options.runMeta, sessionState, {
    action: 'compaction_decision',
    reason: forceCompaction ? 'manual_force' : compactionCheck.shouldCompact ? 'threshold_exceeded' : 'below_threshold',
    note: forceCompaction
      ? 'Compaction forced by user request.'
      : `Compaction decision evaluated at ${currentPercent}% context usage.`,
    afterPatch: {
      contextApproxTokens: compactionCheck.approxTokens,
      contextLimit: options.contextLimit,
      contextPercent: currentPercent,
    },
    details: {
      shouldCompact: compactionCheck.shouldCompact,
      forced: forceCompaction,
      reserveTokens: compactionSettings.reserveTokens,
      keepRecentTokens,
    },
  });
  void captureCompaction(
    'decision',
    {
      shouldCompact: compactionCheck.shouldCompact,
      forced: forceCompaction,
      percent: currentPercent,
      approxTokens: compactionCheck.approxTokens,
    },
    { sessionId: options.runMeta.sessionId, runId: options.runMeta.runId, turnId: options.runMeta.turnId },
  );

  if (!forceCompaction && !compactionCheck.shouldCompact) {
    const skipReason = `${options.statusPrefix || 'Context'} is at ${currentPercent}% (${compactionCheck.approxTokens}/${options.contextLimit} tokens).`;
    ctx.sendRuntime(options.runMeta, {
      type: 'compaction_event',
      stage: 'skipped',
      source: options.source || 'auto',
      note: skipReason,
      details: {
        reason: 'below_threshold',
        shouldCompact: false,
        forced: false,
        contextLimit: options.contextLimit,
        approxTokens: compactionCheck.approxTokens,
        percent: currentPercent,
      },
    });
    ctx.emitTokenTrace(options.runMeta, sessionState, {
      action: 'compaction_skipped',
      reason: 'below_threshold',
      note: skipReason,
      afterPatch: {
        contextApproxTokens: compactionCheck.approxTokens,
        contextLimit: options.contextLimit,
        contextPercent: currentPercent,
      },
      details: { stage: 'skipped', shouldCompact: false, forced: false },
    });
    void captureCompaction(
      'skipped',
      { reason: 'below_threshold', percent: currentPercent, approxTokens: compactionCheck.approxTokens },
      { sessionId: options.runMeta.sessionId, runId: options.runMeta.runId, turnId: options.runMeta.turnId },
    );
    return { compacted: false, reason: skipReason };
  }

  ctx.sendRuntime(options.runMeta, {
    type: 'compaction_event',
    stage: 'start',
    source: options.source || 'auto',
    note: 'Compaction started.',
    details: {
      forced: forceCompaction,
      contextLimit: options.contextLimit,
      approxTokens: compactionCheck.approxTokens,
      percent: currentPercent,
    },
  });
  ctx.emitTokenTrace(options.runMeta, sessionState, {
    action: 'compaction_start',
    reason: forceCompaction ? 'manual_force' : 'threshold_exceeded',
    note: 'Compaction started.',
    afterPatch: {
      contextApproxTokens: compactionCheck.approxTokens,
      contextLimit: options.contextLimit,
      contextPercent: currentPercent,
    },
    details: { stage: 'start', forced: forceCompaction },
  });
  void captureCompaction(
    'start',
    { forced: forceCompaction, percent: currentPercent, approxTokens: compactionCheck.approxTokens },
    { sessionId: options.runMeta.sessionId, runId: options.runMeta.runId, turnId: options.runMeta.turnId },
  );
  ctx.sendRuntime(options.runMeta, {
    type: 'run_status',
    phase: 'finalizing',
    attempts: { api: 0, tool: 0, finalize: 0 },
    maxRetries: { api: 0, tool: 0, finalize: 0 },
    note: forceCompaction
      ? `${options.statusPrefix || 'Context'} compaction started (${currentPercent}%, ${compactionCheck.approxTokens}/${options.contextLimit} tokens).`
      : `${options.statusPrefix || 'Context'} near limit (${currentPercent}%, ${compactionCheck.approxTokens}/${options.contextLimit} tokens). Compaction started.`,
    stage: 'compaction',
    source: options.source || 'auto',
  });

  const slice = prepareCompactionSlice(nextHistory as Message[], keepRecentTokens, forceCompaction);
  if ('skipReason' in slice) {
    ctx.sendRuntime(options.runMeta, {
      type: 'compaction_event',
      stage: 'skipped',
      source: options.source || 'auto',
      note: slice.skipReason,
      details: { reason: 'no_messages_to_summarize', forced: forceCompaction },
    });
    ctx.emitTokenTrace(options.runMeta, sessionState, {
      action: 'compaction_skipped',
      reason: 'no_messages_to_summarize',
      note: slice.skipReason,
      details: { stage: 'skipped', forced: forceCompaction },
    });
    return { compacted: false, reason: slice.skipReason };
  }

  const summaryResult = await generateCompactionSummary(ctx, sessionState, options, slice.promptText, {
    messagesToSummarizeCount: slice.messagesToSummarize.length,
    preservedCandidateCount: slice.preserved.length,
    hasPreviousSummary: Boolean(slice.previousSummary),
    reserveTokens: compactionSettings.reserveTokens,
  });

  compactionMetrics.summary = {
    ...(compactionMetrics.summary as Record<string, unknown>),
    usage: summaryResult.summaryUsage,
    textLength: summaryResult.summaryText.length,
    generationMs: summaryResult.summaryGenerationMs,
    hasThinking: summaryResult.hasThinking,
    usesCodexOAuth: profileUsesCodexOAuth(options.orchestratorProfile),
  };

  return applyCompactionResult(
    ctx,
    sessionState,
    options,
    nextHistory,
    slice.messagesToSummarize,
    slice.preserved,
    {
      shouldCompact: compactionCheck.shouldCompact,
      percent: compactionCheck.percent,
      approxTokens: compactionCheck.approxTokens,
    },
    summaryResult.summaryText,
    summaryResult.summaryUsage,
    compactionMetrics,
  );
}
