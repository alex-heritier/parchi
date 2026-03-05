import type { Usage } from '@parchi/shared';
import { PARCHI_STORAGE_KEYS } from '@parchi/shared';
import { generateText } from 'ai';
import {
  DEFAULT_COMPACTION_SETTINGS,
  SUMMARIZATION_PROMPT,
  SUMMARIZATION_SYSTEM_PROMPT,
  UPDATE_SUMMARIZATION_PROMPT,
  buildCompactionSummaryMessage,
  estimateContextTokens,
  findCutPoint,
  serializeConversation,
  shouldCompact,
} from '../../ai/compaction.js';
import { normalizeConversationHistory } from '../../ai/message-schema.js';
import type { Message } from '../../ai/message-schema.js';
import { extractThinking } from '../../ai/message-utils.js';
import {
  buildCodexOAuthProviderOptions,
  isCodexOAuthProvider,
  resolveLanguageModel,
} from '../../ai/sdk-client.js';
import {
  hasOwnApiKey,
  injectOAuthTokens,
  refreshConvexProxyAuthSession,
  resolveProfile,
  resolveRuntimeModelProfile,
} from '../model-profiles.js';
import type { RunMeta } from '../service-types.js';
import type { ServiceContext } from '../service-context.js';
import { captureCompaction, captureException, captureMessage } from '../telemetry.js';

const profileUsesCodexOAuth = (profile: Record<string, any> | null | undefined) =>
  isCodexOAuthProvider(String(profile?.provider || ''));

function toContentPreview(content: Message['content'], max = 180): string {
  if (typeof content === 'string') return content.replace(/\s+/g, ' ').trim().slice(0, max);
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (!part || typeof part !== 'object') return '';
        if (typeof (part as any).text === 'string') return (part as any).text;
        if ((part as any).output !== undefined) {
          try {
            return JSON.stringify((part as any).output);
          } catch {
            return String((part as any).output ?? '');
          }
        }
        if ((part as any).content !== undefined) {
          try {
            return JSON.stringify((part as any).content);
          } catch {
            return String((part as any).content ?? '');
          }
        }
        return '';
      })
      .filter(Boolean)
      .join(' ');
    return joined.replace(/\s+/g, ' ').trim().slice(0, max);
  }
  try {
    return JSON.stringify(content ?? '').slice(0, max);
  } catch {
    return String(content ?? '').slice(0, max);
  }
}

function messageSignature(msg: Message) {
  let contentSig = '';
  try {
    contentSig = JSON.stringify(msg.content ?? '').slice(0, 320);
  } catch {
    contentSig = String(msg.content ?? '').slice(0, 320);
  }
  return [
    msg.role,
    (msg as any).toolCallId || '',
    (msg as any).toolName || '',
    contentSig,
    (msg as any).meta?.kind || '',
  ].join('|');
}

function buildToolTraceMessage(messages: Message[]): Message | null {
  const resultByToolCallId = new Map<string, string>();
  const traces: string[] = [];
  const seen = new Set<string>();

  for (const msg of messages) {
    if (msg.role !== 'tool') continue;
    const id = String((msg as any).toolCallId || '').trim();
    if (!id) continue;
    const resultPreview = toContentPreview(msg.content, 140);
    if (resultPreview) {
      resultByToolCallId.set(id, resultPreview);
    }
  }

  for (const msg of messages) {
    if (msg.role !== 'assistant' || !Array.isArray(msg.toolCalls)) continue;
    for (const call of msg.toolCalls) {
      const id = String(call?.id || '').trim();
      const toolName = String(call?.name || 'tool').trim() || 'tool';
      const argsPreview = (() => {
        try {
          return JSON.stringify(call?.args ?? {}).slice(0, 120);
        } catch {
          return String(call?.args ?? '').slice(0, 120);
        }
      })();
      const key = id || `${toolName}:${argsPreview}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const resultPreview = id ? resultByToolCallId.get(id) : '';
      traces.push(
        `- ${toolName}(${argsPreview})${resultPreview ? ` -> ${resultPreview}` : ''}${id ? ` [${id}]` : ''}`,
      );
      if (traces.length >= 32) break;
    }
    if (traces.length >= 32) break;
  }

  if (traces.length === 0) return null;
  return {
    role: 'system' as const,
    content: `## Tool Trace Mini Map\n${traces.join('\n')}`,
    meta: {
      kind: 'summary',
      summaryOfCount: traces.length,
      source: 'auto',
    },
  } satisfies Message;
}

export async function runContextCompaction(
  ctx: ServiceContext,
  options: {
    runMeta: RunMeta;
    history: Message[];
    contextLimit: number;
    orchestratorProfile: Record<string, any>;
    model: any;
    abortSignal?: AbortSignal;
    force?: boolean;
    source?: string;
    statusPrefix?: string;
  },
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

  const compactionMetrics: Record<string, any> = {
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
    reason: forceCompaction
      ? 'manual_force'
      : compactionCheck.shouldCompact
        ? 'threshold_exceeded'
        : 'below_threshold',
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
      details: {
        stage: 'skipped',
        shouldCompact: false,
        forced: false,
      },
    });
    void captureCompaction(
      'skipped',
      {
        reason: 'below_threshold',
        percent: currentPercent,
        approxTokens: compactionCheck.approxTokens,
      },
      { sessionId: options.runMeta.sessionId, runId: options.runMeta.runId, turnId: options.runMeta.turnId },
    );
    return {
      compacted: false,
      reason: skipReason,
    };
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
    details: {
      stage: 'start',
      forced: forceCompaction,
    },
  });

  void captureCompaction(
    'start',
    {
      forced: forceCompaction,
      percent: currentPercent,
      approxTokens: compactionCheck.approxTokens,
    },
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

  let summaryIndex = -1;
  for (let i = nextHistory.length - 1; i >= 0; i -= 1) {
    const msg = nextHistory[i];
    if (msg.role === 'system' && msg.meta?.kind === 'summary') {
      summaryIndex = i;
      break;
    }
  }

  const previousSummary =
    summaryIndex >= 0
      ? typeof nextHistory[summaryIndex].content === 'string'
        ? nextHistory[summaryIndex].content
        : JSON.stringify(nextHistory[summaryIndex].content)
      : undefined;

  const compactionStart = summaryIndex >= 0 ? summaryIndex + 1 : 0;
  const cutIndex = findCutPoint(nextHistory, compactionStart, keepRecentTokens);
  let messagesToSummarize = nextHistory.slice(compactionStart, cutIndex);
  let preserved = nextHistory.slice(cutIndex);

  if (messagesToSummarize.length === 0 && !forceCompaction) {
    const fallbackKeepMessages = Math.min(12, Math.max(4, Math.floor(nextHistory.length * 0.25)));
    const fallbackCutIndex = Math.max(compactionStart + 1, nextHistory.length - fallbackKeepMessages);
    messagesToSummarize = nextHistory.slice(compactionStart, fallbackCutIndex);
    preserved = nextHistory.slice(fallbackCutIndex);
  }

  if (messagesToSummarize.length === 0 && forceCompaction) {
    const forcedWindow = nextHistory.filter((msg) => !(msg.role === 'system' && msg.meta?.kind === 'summary'));
    messagesToSummarize = forcedWindow.length > 0 ? forcedWindow : nextHistory;
    preserved = [];
  }

  if (messagesToSummarize.length === 0) {
    const skipReason = 'Compaction skipped: nothing to summarize yet.';
    ctx.sendRuntime(options.runMeta, {
      type: 'compaction_event',
      stage: 'skipped',
      source: options.source || 'auto',
      note: skipReason,
      details: {
        reason: 'no_messages_to_summarize',
        forced: forceCompaction,
      },
    });
    ctx.emitTokenTrace(options.runMeta, sessionState, {
      action: 'compaction_skipped',
      reason: 'no_messages_to_summarize',
      note: skipReason,
      details: {
        stage: 'skipped',
        forced: forceCompaction,
      },
    });
    return { compacted: false, reason: skipReason };
  }

  const conversationText = serializeConversation(messagesToSummarize);
  let promptText = `<conversation>\n${conversationText}\n</conversation>\n\n`;
  if (previousSummary) {
    promptText += `<previous-summary>\n${previousSummary}\n</previous-summary>\n\n`;
  }
  promptText += previousSummary ? UPDATE_SUMMARIZATION_PROMPT : SUMMARIZATION_PROMPT;

  const summaryUsesCodexOAuth = profileUsesCodexOAuth(options.orchestratorProfile as any);

  ctx.sendRuntime(options.runMeta, {
    type: 'compaction_event',
    stage: 'summary_request',
    source: options.source || 'auto',
    note: 'Requesting compaction summary from model.',
    details: {
      messagesToSummarizeCount: messagesToSummarize.length,
      preservedCandidateCount: preserved.length,
      hasPreviousSummary: Boolean(previousSummary),
      promptLength: promptText.length,
      maxOutputTokens: summaryUsesCodexOAuth ? undefined : Math.floor(0.8 * compactionSettings.reserveTokens),
    },
  });

  const summaryStartedAt = Date.now();
  const summaryResult = await generateText({
    model: options.model,
    system: SUMMARIZATION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: promptText,
      },
    ],
    abortSignal: options.abortSignal,
    temperature: 0.2,
    maxOutputTokens: summaryUsesCodexOAuth ? undefined : Math.floor(0.8 * compactionSettings.reserveTokens),
    providerOptions: summaryUsesCodexOAuth ? buildCodexOAuthProviderOptions(SUMMARIZATION_SYSTEM_PROMPT) : undefined,
  });
  const summaryGenerationMs = Date.now() - summaryStartedAt;

  const parsedSummary = extractThinking(summaryResult.text || '', null);
  const summaryText = parsedSummary.content || String(summaryResult.text || '').trim();
  const summaryUsageRaw = (summaryResult as any)?.usage || {};
  const summaryUsage: Usage = {
    inputTokens: Number(summaryUsageRaw?.inputTokens || 0),
    outputTokens: Number(summaryUsageRaw?.outputTokens || 0),
    totalTokens: Number(summaryUsageRaw?.totalTokens || 0),
  };

  compactionMetrics.summary = {
    ...(compactionMetrics.summary || {}),
    usage: summaryUsage,
    textLength: summaryText.length,
    generationMs: summaryGenerationMs,
  };

  ctx.sendRuntime(options.runMeta, {
    type: 'compaction_event',
    stage: 'summary_result',
    source: options.source || 'auto',
    note: 'Summary generated.',
    details: {
      usage: summaryUsage,
      textLength: summaryText.length,
      generationMs: summaryGenerationMs,
      hasThinking: Boolean(parsedSummary.thinking),
    },
  });
  ctx.emitTokenTrace(options.runMeta, sessionState, {
    action: 'compaction_summary_result',
    reason: 'summary_generated',
    note: 'Summary generated for compaction.',
    afterPatch: {
      sessionInputTokens:
        (sessionState.tokenVisibility?.sessionInputTokens || 0) + Number(summaryUsage.inputTokens || 0),
      sessionOutputTokens:
        (sessionState.tokenVisibility?.sessionOutputTokens || 0) + Number(summaryUsage.outputTokens || 0),
      sessionTotalTokens:
        (sessionState.tokenVisibility?.sessionTotalTokens || 0) +
        Number(summaryUsage.totalTokens || summaryUsage.inputTokens + summaryUsage.outputTokens || 0),
    },
    details: {
      summaryInputTokens: Number(summaryUsage.inputTokens || 0),
      summaryOutputTokens: Number(summaryUsage.outputTokens || 0),
      summaryTotalTokens: Number(
        summaryUsage.totalTokens || summaryUsage.inputTokens + summaryUsage.outputTokens || 0,
      ),
      generationMs: summaryGenerationMs,
    },
  });

  const compactedInfo = `Compaction result: summarized ${messagesToSummarize.length} messages, kept ${preserved.length} recent messages.`;
  const compactedSummary = `${compactedInfo}\n\n${summaryText}`;

  const summaryMessage = buildCompactionSummaryMessage(compactedSummary, messagesToSummarize.length);
  summaryMessage.meta = {
    ...(summaryMessage.meta || {}),
    source: options.source || 'auto',
  };

  const firstAnchor =
    nextHistory.find((msg) => msg.role !== 'system') ||
    nextHistory.find((msg) => msg.role === 'system' && msg.meta?.kind !== 'summary') ||
    null;
  const lastAnchor =
    [...nextHistory].reverse().find((msg) => msg.role !== 'system') ||
    [...nextHistory].reverse().find((msg) => msg.role === 'system' && msg.meta?.kind !== 'summary') ||
    null;
  const toolTraceMessage = buildToolTraceMessage(nextHistory);
  const latestUserMessage = [...nextHistory].reverse().find((msg) => msg.role === 'user');
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
  const preservedCount = compacted.filter((msg) => msg.role !== 'system').length;

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
    ...(compactionMetrics.compaction || {}),
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

  return { compacted: true };
}

export async function processContextCompaction(
  ctx: ServiceContext,
  conversationHistory: Message[],
  sessionId: string,
  options?: { source?: string; force?: boolean },
) {
  const runMeta: RunMeta = {
    runId: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    turnId: `turn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sessionId,
  };
  const source = typeof options?.source === 'string' ? options.source : 'manual';
  const statusPrefix = source === 'manual' ? 'Manual context' : 'Context';

  if (ctx.activeRunIdBySessionId.has(sessionId)) {
    ctx.sendRuntime(runMeta, {
      type: 'compaction_event',
      stage: 'skipped',
      source,
      note: 'Compaction skipped because a run is still active.',
      details: { reason: 'run_active' },
    });
    ctx.sendRuntime(runMeta, {
      type: 'run_warning',
      message: 'Compaction skipped because a run is still active.',
      stage: 'compaction',
      source,
    });
    ctx.sendRuntime(runMeta, {
      type: 'run_status',
      phase: 'stopped',
      attempts: { api: 0, tool: 0, finalize: 0 },
      maxRetries: { api: 0, tool: 0, finalize: 0 },
      note: 'Stop the active run before compacting.',
      stage: 'compaction',
      source,
    });
    return;
  }

  try {
    const settings = await chrome.storage.local.get(PARCHI_STORAGE_KEYS as unknown as string[]);
    const activeProfileName = settings.activeConfig || 'default';
    const orchestratorProfileName = settings.orchestratorProfile || activeProfileName;
    const orchestratorEnabled = settings.useOrchestrator === true;

    const activeProfile = resolveProfile(settings, activeProfileName);
    let orchestratorProfile = orchestratorEnabled ? resolveProfile(settings, orchestratorProfileName) : activeProfile;

    if (!hasOwnApiKey(orchestratorProfile)) {
      await refreshConvexProxyAuthSession(settings);
    }

    const runtimeProfileResolution = resolveRuntimeModelProfile(orchestratorProfile, settings);
    if (!runtimeProfileResolution.allowed) {
      ctx.sendRuntime(runMeta, {
        type: 'run_error',
        message: runtimeProfileResolution.errorMessage || 'Please configure your API key in settings',
        stage: 'compaction',
        source,
      });
      return;
    }
    if (runtimeProfileResolution.route === 'oauth') {
      orchestratorProfile = await injectOAuthTokens(runtimeProfileResolution.profile);
    } else {
      orchestratorProfile = runtimeProfileResolution.profile;
    }

    const model = resolveLanguageModel(orchestratorProfile);
    const history = normalizeConversationHistory(Array.isArray(conversationHistory) ? conversationHistory : []);
    if (history.length < 1) {
      ctx.sendRuntime(runMeta, {
        type: 'run_warning',
        message: 'Compaction skipped: no conversation history yet.',
        stage: 'compaction',
        source,
      });
      ctx.sendRuntime(runMeta, {
        type: 'run_status',
        phase: 'completed',
        attempts: { api: 0, tool: 0, finalize: 0 },
        maxRetries: { api: 0, tool: 0, finalize: 0 },
        note: 'Compaction skipped (no conversation history yet).',
        stage: 'compaction',
        source,
      });
      return;
    }

    const contextLimit = orchestratorProfile.contextLimit || settings.contextLimit || 200000;
    const result = await runContextCompaction(ctx, {
      runMeta,
      history,
      contextLimit,
      orchestratorProfile,
      model,
      force: options?.force === true,
      source,
      statusPrefix,
    });
    if (!result.compacted) {
      ctx.sendRuntime(runMeta, {
        type: 'run_warning',
        message: result.reason || 'Compaction skipped.',
        stage: 'compaction',
        source,
      });
    }
    ctx.sendRuntime(runMeta, {
      type: 'run_status',
      phase: 'completed',
      attempts: { api: 0, tool: 0, finalize: 0 },
      maxRetries: { api: 0, tool: 0, finalize: 0 },
      note: result.compacted ? 'Context compaction completed.' : result.reason || 'Compaction skipped.',
      stage: 'compaction',
      source,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'Compaction failed');
    ctx.sendRuntime(runMeta, {
      type: 'compaction_event',
      stage: 'failed',
      source,
      note: `Compaction failed: ${message}`,
      details: { error: message },
    });
    void captureCompaction(
      'failed',
      { error: message },
      { sessionId: runMeta.sessionId, runId: runMeta.runId, turnId: runMeta.turnId },
    );
    void captureException(
      error instanceof Error ? error : new Error(message),
      { stage: 'compaction' },
      { sessionId: runMeta.sessionId, runId: runMeta.runId },
    );
    ctx.sendRuntime(runMeta, {
      type: 'run_error',
      message,
      stage: 'compaction',
      source,
    });
    ctx.sendRuntime(runMeta, {
      type: 'run_status',
      phase: 'failed',
      attempts: { api: 0, tool: 0, finalize: 0 },
      maxRetries: { api: 0, tool: 0, finalize: 0 },
      note: `Compaction failed: ${message}`,
      stage: 'compaction',
      source,
    });
  }
}
