import type { Usage } from '@parchi/shared';
import { buildCompactionSummaryMessage, estimateContextTokens } from '../../ai/compaction.js';
import type { Message } from '../../ai/message-schema.js';
import type { ServiceContext } from '../service-context.js';
import type { SessionState } from '../service-types.js';
import { captureCompaction, captureMessage } from '../telemetry.js';
import type { CompactionCheckSnapshot, RunContextCompactionOptions } from './compaction-shared.js';
import { buildToolTraceMessage, messageSignature, toContentPreview } from './compaction-trace.js';

function isSafeAnchorMessage(message: Message | null | undefined): message is Message {
  if (!message) return false;
  if (message.role === 'tool') return false;
  if (message.role === 'assistant' && Array.isArray(message.toolCalls) && message.toolCalls.length > 0) {
    return false;
  }
  return true;
}

export async function applyCompactionResult(
  ctx: ServiceContext,
  sessionState: SessionState,
  options: RunContextCompactionOptions,
  nextHistory: Message[],
  messagesToSummarize: Message[],
  preserved: Message[],
  compactionCheck: CompactionCheckSnapshot,
  summaryText: string,
  summaryUsage: Usage,
  compactionMetrics: Record<string, unknown>,
) {
  const currentPercent = Math.max(0, Math.min(100, Math.round(compactionCheck.percent * 100)));
  const compactedInfo = `Compaction result: summarized ${messagesToSummarize.length} messages, kept ${preserved.length} recent messages.`;
  const compactedSummary = `${compactedInfo}\n\n${summaryText}`;

  const summaryMessage = buildCompactionSummaryMessage(compactedSummary, messagesToSummarize.length);
  summaryMessage.meta = {
    ...(summaryMessage.meta || {}),
    source: options.source || 'auto',
  };

  const firstAnchor = nextHistory.find((message) => isSafeAnchorMessage(message)) || null;
  const lastAnchor = [...nextHistory].reverse().find((message) => isSafeAnchorMessage(message)) || null;
  const toolTraceMessage = buildToolTraceMessage(nextHistory);
  const latestUserMessage = [...nextHistory].reverse().find((message) => message.role === 'user');
  const continuationMessage: Message = {
    role: 'system',
    content: [
      'Compaction checkpoint:',
      '- Continue from the latest user objective.',
      '- Use this summary + preserved anchors + mini tool traces as source of truth.',
      '- Do not resend full old history unless explicitly requested.',
      latestUserMessage ? `Latest user request: ${toContentPreview(latestUserMessage.content, 280)}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    meta: {
      kind: 'summary',
      summaryOfCount: 1,
      source: options.source || 'auto',
    },
  };

  const compactedCandidates: Array<Message | null> = [
    summaryMessage,
    continuationMessage,
    toolTraceMessage,
    firstAnchor,
    ...preserved,
    lastAnchor,
  ];
  const compacted: Message[] = [];
  const compactedSeen = new Set<string>();
  for (const candidate of compactedCandidates) {
    if (!candidate) continue;
    const signature = messageSignature(candidate);
    if (compactedSeen.has(signature)) continue;
    compactedSeen.add(signature);
    compacted.push(candidate);
  }
  const preservedCount = compacted.filter((message) => message.role !== 'system').length;

  const newSessionId = `session-${Date.now()}`;
  const beforeUsage = {
    approxTokens: compactionCheck.approxTokens,
    contextLimit: options.contextLimit,
    percent: currentPercent,
  };
  const afterEstimate = estimateContextTokens(compacted);
  const afterPercent = Math.max(
    0,
    Math.min(100, Math.round((afterEstimate.tokens / Math.max(1, options.contextLimit)) * 100)),
  );
  const removedApproxTokensLowerBound = Math.max(
    0,
    Number(compactionCheck.approxTokens || 0) - Number(afterEstimate.tokens || 0),
  );

  compactionMetrics.reason = 'compacted';
  compactionMetrics.compaction = {
    ...(compactionMetrics.compaction as Record<string, unknown> | undefined),
    trimmedCount: messagesToSummarize.length,
    preservedCount,
    removedApproxTokensLowerBound,
    afterApproxTokens: afterEstimate.tokens,
    afterPercent,
  };

  ctx.sendRuntime(options.runMeta, {
    type: 'compaction_event',
    stage: 'applied',
    source: options.source || 'auto',
    note: 'Compaction applied to context.',
    details: {
      trimmedCount: messagesToSummarize.length,
      preservedCount,
      removedApproxTokensLowerBound,
      beforeContextUsage: beforeUsage,
      contextUsage: {
        approxTokens: afterEstimate.tokens,
        contextLimit: options.contextLimit,
        percent: afterPercent,
      },
      summaryUsage,
    },
  });
  ctx.emitTokenTrace(options.runMeta, sessionState, {
    action: 'compaction_applied',
    reason: 'compaction_applied',
    note: 'Compaction applied to context.',
    afterPatch: {
      contextApproxTokens: afterEstimate.tokens,
      contextLimit: options.contextLimit,
      contextPercent: afterPercent,
    },
    details: {
      trimmedCount: messagesToSummarize.length,
      preservedCount,
      removedApproxTokensLowerBound,
      beforeContextUsage: beforeUsage,
      contextUsage: {
        approxTokens: afterEstimate.tokens,
        contextLimit: options.contextLimit,
        percent: afterPercent,
      },
    },
  });

  ctx.sendRuntime(options.runMeta, {
    type: 'context_compacted',
    source: options.source || 'auto',
    startFreshSession: true,
    summary: compactedSummary,
    trimmedCount: messagesToSummarize.length,
    preservedCount,
    newSessionId,
    contextMessages: compacted,
    beforeContextUsage: beforeUsage,
    contextUsage: {
      approxTokens: afterEstimate.tokens,
      contextLimit: options.contextLimit,
      percent: afterPercent,
    },
    compactionMetrics,
  });

  void captureCompaction(
    'applied',
    {
      trimmedCount: messagesToSummarize.length,
      preservedCount,
      removedApproxTokensLowerBound,
      beforePercent: currentPercent,
      afterPercent,
      summaryUsage,
    },
    { sessionId: options.runMeta.sessionId, runId: options.runMeta.runId, turnId: options.runMeta.turnId },
  );

  void captureMessage(
    'Context compaction completed',
    'info',
    {
      percentBefore: currentPercent,
      percentAfter: afterPercent,
      tokensRemoved: removedApproxTokensLowerBound,
    },
    { sessionId: options.runMeta.sessionId, runId: options.runMeta.runId },
  );

  ctx.sendRuntime(options.runMeta, {
    type: 'run_status',
    phase: 'finalizing',
    attempts: { api: 0, tool: 0, finalize: 0 },
    maxRetries: { api: 0, tool: 0, finalize: 0 },
    note: `${options.statusPrefix || 'Context'} compacted. ${compactedInfo}`,
    stage: 'compaction',
    source: options.source || 'auto',
  });

  return { compacted: true as const };
}
