import { APICallError } from '@ai-sdk/provider';
import { classifyApiError } from '../../ai/error-classifier.js';
import { normalizeConversationHistory } from '../../ai/message-schema.js';
import type { Message } from '../../ai/message-schema.js';
import type { ServiceContext } from '../service-context.js';
import type { RunMeta } from '../service-types.js';
import { getTokenVisibilitySnapshot, normalizeContextPercent } from '../session-manager.js';
import { captureCompaction } from '../telemetry.js';
import { prepareAgentLoopRun } from './agent-loop-prepare.js';
import { resolveAgentResponse } from './agent-loop-response.js';
import type { AgentLoopDiagnostics, RecordedContext } from './agent-loop-shared.js';
import { runContextCompaction } from './compaction-runner.js';

export async function processUserMessage(
  ctx: ServiceContext,
  userMessage: string,
  conversationHistory: Message[],
  selectedTabs: chrome.tabs.Tab[],
  sessionId: string,
  meta?: Partial<RunMeta> & { origin?: 'sidepanel' | 'relay' },
  recordedContext?: RecordedContext,
) {
  const runMeta: RunMeta = {
    runId:
      typeof meta?.runId === 'string' && meta.runId
        ? meta.runId
        : `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    turnId:
      typeof meta?.turnId === 'string' && meta.turnId
        ? meta.turnId
        : `turn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sessionId,
  };
  const origin = meta?.origin || 'sidepanel';
  if (origin === 'relay') ctx.relayActiveRunIds.add(runMeta.runId);
  const controller = ctx.registerActiveRun(runMeta, origin);
  const abortSignal = controller.signal;
  const sessionState = ctx.getSessionState(sessionId);
  const diagnostics: AgentLoopDiagnostics = {
    runStartedAt: Date.now(),
    streamResponsesEnabled: false,
    firstChunkAt: null,
    firstTextTokenAt: null,
    modelAttempts: 0,
    benchmarkRoute: 'none',
    benchmarkProvider: '',
    benchmarkModel: '',
    latestErrorContext: {},
  };
  const buildLatencyMetrics = () => {
    const completedAt = Date.now();
    const metrics: Record<string, unknown> = {
      runStartAt: diagnostics.runStartedAt,
      completedAt,
      totalMs: Math.max(0, completedAt - diagnostics.runStartedAt),
      stream: diagnostics.streamResponsesEnabled,
    };
    if (diagnostics.firstChunkAt != null)
      metrics.ttfbMs = Math.max(0, diagnostics.firstChunkAt - diagnostics.runStartedAt);
    if (diagnostics.firstTextTokenAt != null)
      metrics.firstTokenMs = Math.max(0, diagnostics.firstTextTokenAt - diagnostics.runStartedAt);
    if (diagnostics.modelAttempts > 0) metrics.modelAttempts = diagnostics.modelAttempts;
    return metrics;
  };
  const buildBenchmarkContext = (success: boolean, errorCategory?: string) => {
    const payload: Record<string, unknown> = { success };
    const provider = diagnostics.benchmarkProvider || diagnostics.latestErrorContext.provider;
    const model = diagnostics.benchmarkModel || diagnostics.latestErrorContext.model;
    const route = diagnostics.benchmarkRoute || diagnostics.latestErrorContext.route;
    if (provider) payload.provider = provider;
    if (model) payload.model = model;
    if (route) payload.route = route;
    if (errorCategory) payload.errorCategory = errorCategory;
    return payload;
  };

  sessionState.lastBrowserAction = null;
  sessionState.awaitingVerification = false;
  sessionState.currentStepVerified = false;
  ctx.emitTokenTrace(runMeta, sessionState, {
    action: 'user_run_start',
    reason: 'turn_started',
    note: 'Turn started. Baseline token snapshot captured.',
    details: {
      messageLength: String(userMessage || '').length,
      historyMessageCount: Array.isArray(conversationHistory) ? conversationHistory.length : 0,
    },
  });
  ctx.sendRuntime(runMeta, { type: 'user_run_start', message: userMessage });

  try {
    const preparedOrBlocked = await prepareAgentLoopRun(
      ctx,
      runMeta,
      abortSignal,
      sessionId,
      userMessage,
      conversationHistory,
      selectedTabs,
      recordedContext,
      diagnostics,
    );
    if ('blocked' in preparedOrBlocked) {
      ctx.sendRuntime(runMeta, {
        type: 'run_error',
        message: preparedOrBlocked.message,
        latency: buildLatencyMetrics(),
        benchmark: buildBenchmarkContext(false, 'config'),
      });
      return;
    }

    const prepared = preparedOrBlocked;
    const response = await resolveAgentResponse(prepared, diagnostics, buildLatencyMetrics, buildBenchmarkContext);
    if (!response) return;

    ctx.sendRuntime(runMeta, {
      type: 'assistant_final',
      content: response.finalText,
      thinking: response.reasoningText || null,
      model: prepared.orchestratorProfile.model || prepared.settings.model || '',
      usage: {
        inputTokens: response.totalUsage.inputTokens || 0,
        outputTokens: response.totalUsage.outputTokens || 0,
        totalTokens: response.totalUsage.totalTokens || 0,
      },
      responseMessages: response.responseMessages,
      latency: buildLatencyMetrics(),
      benchmark: buildBenchmarkContext(true),
    });

    const inputTokens = Number(response.totalUsage.inputTokens || 0);
    const outputTokens = Number(response.totalUsage.outputTokens || 0);
    const totalTokens = Number(response.totalUsage.totalTokens || inputTokens + outputTokens);
    const currentTokenSnapshot = getTokenVisibilitySnapshot(sessionState);
    const totalDelta = totalTokens > 0 ? totalTokens : inputTokens + outputTokens;
    const previousInputTokens = Number(currentTokenSnapshot.providerInputTokens ?? Number.NaN);
    const previousOutputTokens = Number(currentTokenSnapshot.providerOutputTokens ?? Number.NaN);

    if (inputTokens > 0 && Number.isFinite(previousInputTokens) && Number.isFinite(previousOutputTokens)) {
      const expectedMinInputTokens = previousInputTokens + previousOutputTokens;
      if (expectedMinInputTokens > 0 && inputTokens < expectedMinInputTokens) {
        const tokensRemoved = expectedMinInputTokens - inputTokens;
        const detectionNote = `Provider compaction inferred: ${tokensRemoved} input tokens removed.`;
        ctx.sendRuntime(runMeta, {
          type: 'compaction_event',
          stage: 'provider_detected',
          source: 'provider',
          note: detectionNote,
          details: {
            previousInputTokens,
            previousOutputTokens,
            expectedMinInputTokens,
            actualInputTokens: inputTokens,
            tokensRemoved,
            model: prepared.orchestratorProfile.model || prepared.settings.model || '',
            provider: prepared.orchestratorProfile.provider || prepared.settings.provider || '',
          },
        });
        ctx.emitTokenTrace(runMeta, sessionState, {
          action: 'provider_compaction_detected',
          reason: 'input_tokens_drop',
          note: detectionNote,
          details: {
            previousInputTokens,
            previousOutputTokens,
            expectedMinInputTokens,
            actualInputTokens: inputTokens,
            tokensRemoved,
          },
        });
        void captureCompaction(
          'provider_detected',
          {
            previousInputTokens,
            previousOutputTokens,
            expectedMinInputTokens,
            actualInputTokens: inputTokens,
            tokensRemoved,
          },
          { sessionId: runMeta.sessionId, runId: runMeta.runId, turnId: runMeta.turnId },
        );
      }
    }

    ctx.emitTokenTrace(runMeta, sessionState, {
      action: 'assistant_final',
      reason: inputTokens > 0 ? 'new_assistant_usage' : 'estimate_fallback',
      note:
        inputTokens > 0
          ? 'Assistant usage recorded from provider response.'
          : 'Assistant usage missing; using fallback totals.',
      afterPatch: {
        providerInputTokens: inputTokens > 0 ? inputTokens : currentTokenSnapshot.providerInputTokens,
        providerOutputTokens: outputTokens > 0 ? outputTokens : currentTokenSnapshot.providerOutputTokens,
        contextApproxTokens: totalTokens > 0 ? totalTokens : currentTokenSnapshot.contextApproxTokens,
        contextLimit:
          prepared.orchestratorProfile.contextLimit ||
          prepared.settings.contextLimit ||
          currentTokenSnapshot.contextLimit,
        contextPercent: normalizeContextPercent(
          totalTokens > 0 ? totalTokens : currentTokenSnapshot.contextApproxTokens,
          prepared.orchestratorProfile.contextLimit ||
            prepared.settings.contextLimit ||
            currentTokenSnapshot.contextLimit,
        ),
        sessionInputTokens: currentTokenSnapshot.sessionInputTokens + inputTokens,
        sessionOutputTokens: currentTokenSnapshot.sessionOutputTokens + outputTokens,
        sessionTotalTokens: currentTokenSnapshot.sessionTotalTokens + totalDelta,
      },
      details: { inputTokens, outputTokens, totalTokens, responseMessageCount: response.responseMessages.length },
    });

    const nextHistory = normalizeConversationHistory([...response.currentHistory, ...response.responseMessages]);
    const contextLimit = prepared.orchestratorProfile.contextLimit || prepared.settings.contextLimit || 200000;
    await runContextCompaction(ctx, {
      runMeta,
      history: nextHistory,
      contextLimit,
      orchestratorProfile: prepared.orchestratorProfile,
      model: prepared.model,
      abortSignal,
      source: 'auto',
    });
  } catch (error) {
    if (abortSignal.aborted || ctx.isRunCancelled(runMeta.runId)) return;
    console.error('Error processing user message:', error);
    const classified = classifyApiError(error, { ...diagnostics.latestErrorContext });
    let message = classified.message;
    if (classified.category === 'unknown' && APICallError.isInstance(error)) {
      const status = error.statusCode ? ` Status ${error.statusCode}.` : '';
      const body = error.responseBody ? ` Response: ${error.responseBody.slice(0, 500)}` : '';
      message = `${error.message || 'Unknown error'}${status}${body}`;
    }
    ctx.sendRuntime(runMeta, {
      type: 'run_error',
      message,
      errorCategory: classified.category,
      action: classified.action,
      recoverable: classified.recoverable,
      latency: buildLatencyMetrics(),
      benchmark: buildBenchmarkContext(false, classified.category),
    });
  } finally {
    ctx.cleanupRun(runMeta, origin);
    if (origin === 'relay') ctx.relayActiveRunIds.delete(runMeta.runId);
  }
}
