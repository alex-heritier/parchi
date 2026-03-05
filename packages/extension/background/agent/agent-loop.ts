import { APICallError } from '@ai-sdk/provider';
import { PARCHI_STORAGE_KEYS } from '@parchi/shared';
import { generateText, stepCountIs, streamText } from 'ai';
import { classifyApiError } from '../../ai/error-classifier.js';
import { normalizeConversationHistory } from '../../ai/message-schema.js';
import type { Message, ToolCall } from '../../ai/message-schema.js';
import { extractTextFromResponseMessages, extractThinking } from '../../ai/message-utils.js';
import { toModelMessages } from '../../ai/model-convert.js';
import { isValidFinalResponse } from '../../ai/retry-engine.js';
import {
  buildCodexOAuthProviderOptions,
  buildToolSet,
  isCodexOAuthProvider,
  resolveLanguageModel,
} from '../../ai/sdk-client.js';
import { fetchProviderModels } from '../../oauth/manager.js';
import type { OAuthProviderKey } from '../../oauth/types.js';
import {
  applyConvexProxyProfile,
  hasOwnApiKey,
  injectOAuthTokens,
  isVisionModelProfile,
  refreshConvexProxyAuthSession,
  resolveProfile,
  resolveRuntimeModelProfile,
  resolveTeamProfiles,
} from '../model-profiles.js';
import type { RunMeta } from '../service-types.js';
import type { ServiceContext } from '../service-context.js';
import { enhanceSystemPrompt } from '../system-prompt.js';
import { captureCompaction } from '../telemetry.js';
import { extractXmlToolCalls, stripXmlToolCalls } from '../tools/xml-tool-parser.js';
import { runContextCompaction } from './compaction-runner.js';
import { getTokenVisibilitySnapshot, normalizeContextPercent } from '../session-manager.js';

const profileUsesCodexOAuth = (profile: Record<string, any> | null | undefined) =>
  isCodexOAuthProvider(String(profile?.provider || ''));

export async function processUserMessage(
  ctx: ServiceContext,
  userMessage: string,
  conversationHistory: Message[],
  selectedTabs: chrome.tabs.Tab[],
  sessionId: string,
  meta?: Partial<RunMeta> & { origin?: 'sidepanel' | 'relay' },
  recordedContext?: any,
) {
  const runStartedAt = Date.now();
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
  const browserTools = ctx.getBrowserTools(sessionId);
  let streamResponsesEnabled = false;
  let firstChunkAt: number | null = null;
  let firstTextTokenAt: number | null = null;
  let modelAttempts = 0;
  let benchmarkRoute = 'none';
  let benchmarkProvider = '';
  let benchmarkModel = '';
  let latestErrorContext: {
    route?: string;
    provider?: string;
    proxyProvider?: string;
    model?: string;
    useProxy?: boolean;
  } = {};

  const markFirstChunk = () => {
    if (firstChunkAt == null) firstChunkAt = Date.now();
  };
  const markFirstTextToken = () => {
    if (firstTextTokenAt == null) firstTextTokenAt = Date.now();
  };
  const buildLatencyMetrics = () => {
    const completedAt = Date.now();
    const metrics: Record<string, unknown> = {
      runStartAt: runStartedAt,
      completedAt,
      totalMs: Math.max(0, completedAt - runStartedAt),
      stream: streamResponsesEnabled,
    };
    if (firstChunkAt != null) metrics.ttfbMs = Math.max(0, firstChunkAt - runStartedAt);
    if (firstTextTokenAt != null) metrics.firstTokenMs = Math.max(0, firstTextTokenAt - runStartedAt);
    if (modelAttempts > 0) metrics.modelAttempts = modelAttempts;
    return metrics;
  };
  const buildBenchmarkContext = (success: boolean, errorCategory?: string) => {
    const payload: Record<string, unknown> = { success };
    const provider = benchmarkProvider || latestErrorContext.provider;
    const model = benchmarkModel || latestErrorContext.model;
    const route = benchmarkRoute || latestErrorContext.route;
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
  ctx.sendRuntime(runMeta, {
    type: 'user_run_start',
    message: userMessage,
  });

  try {
    const settings = await chrome.storage.local.get(PARCHI_STORAGE_KEYS as unknown as string[]);

    if (settings.enableScreenshots === undefined) settings.enableScreenshots = true;
    if (settings.sendScreenshotsAsImages === undefined) settings.sendScreenshotsAsImages = false;
    if (settings.visionBridge === undefined) settings.visionBridge = true;
    if (!settings.toolPermissions) {
      settings.toolPermissions = {
        read: true,
        interact: true,
        navigate: true,
        tabs: true,
        screenshots: true,
      };
    }
    if (settings.allowedDomains === undefined) settings.allowedDomains = '';
    if (!Array.isArray(settings.auxAgentProfiles)) settings.auxAgentProfiles = [];

    ctx.currentSettings = settings;
    ctx.currentSessionId = sessionId;

    try {
      await browserTools.configureSessionTabs(selectedTabs || [], {
        title: 'Parchi',
        color: 'blue',
      });
      const tabState = browserTools.getSessionState();
      ctx.sendRuntime(runMeta, {
        type: 'session_tabs_update',
        tabs: tabState.tabs,
        activeTabId: tabState.activeTabId,
        maxTabs: tabState.maxTabs,
        groupTitle: tabState.groupTitle,
      });
    } catch (error) {
      console.warn('Failed to configure session tabs:', error);
    }

    const activeProfileName = settings.activeConfig || 'default';
    const orchestratorProfileName = settings.orchestratorProfile || activeProfileName;
    const visionProfileName = settings.visionProfile || null;
    const orchestratorEnabled = settings.useOrchestrator === true;
    const teamProfiles = resolveTeamProfiles(settings);

    const activeProfile = resolveProfile(settings, activeProfileName);
    let orchestratorProfile = orchestratorEnabled ? resolveProfile(settings, orchestratorProfileName) : activeProfile;
    let visionProfile =
      settings.visionBridge !== false ? resolveProfile(settings, visionProfileName || activeProfileName) : null;

    if (!hasOwnApiKey(orchestratorProfile)) {
      await refreshConvexProxyAuthSession(settings);
    }

    let runtimeProfileResolution = resolveRuntimeModelProfile(orchestratorProfile, settings);
    benchmarkRoute = runtimeProfileResolution.route;
    benchmarkProvider = String(orchestratorProfile?.provider || '');
    benchmarkModel = String(orchestratorProfile?.model || settings.model || '');
    if (!runtimeProfileResolution.allowed) {
      ctx.sendRuntime(runMeta, {
        type: 'run_error',
        message: runtimeProfileResolution.errorMessage || 'Please configure your API key in settings',
        latency: buildLatencyMetrics(),
        benchmark: buildBenchmarkContext(false, 'config'),
      });
      return;
    }
    if (runtimeProfileResolution.route === 'oauth') {
      try {
        orchestratorProfile = await injectOAuthTokens(runtimeProfileResolution.profile);
      } catch (oauthError) {
        const canFallbackToActiveProfile = orchestratorEnabled && orchestratorProfileName !== activeProfileName;
        if (!canFallbackToActiveProfile) {
          throw oauthError;
        }
        const activeRuntimeProfile = resolveRuntimeModelProfile(activeProfile, settings);
        if (!activeRuntimeProfile.allowed) {
          throw oauthError;
        }
        ctx.sendRuntime(runMeta, {
          type: 'run_warning',
          message: `Orchestrator profile OAuth session is unavailable. Falling back to active profile "${activeProfileName}".`,
        });
        ctx.emitTokenTrace(runMeta, sessionState, {
          action: 'profile_fallback',
          reason: 'history_sanitized',
          note: `Orchestrator OAuth unavailable. Falling back to active profile "${activeProfileName}".`,
          details: {
            fromProfile: orchestratorProfileName,
            toProfile: activeProfileName,
            route: runtimeProfileResolution.route,
          },
        });
        runtimeProfileResolution = activeRuntimeProfile;
        orchestratorProfile =
          activeRuntimeProfile.route === 'oauth'
            ? await injectOAuthTokens(activeRuntimeProfile.profile)
            : activeRuntimeProfile.profile;
        benchmarkRoute = runtimeProfileResolution.route;
        benchmarkProvider = String(orchestratorProfile?.provider || benchmarkProvider);
        benchmarkModel = String(orchestratorProfile?.model || benchmarkModel);
      }
    } else {
      orchestratorProfile = runtimeProfileResolution.profile;
    }
    latestErrorContext = {
      route: runtimeProfileResolution.route,
      provider: String(orchestratorProfile?.provider || ''),
      proxyProvider: String((orchestratorProfile as any)?.proxyProvider || ''),
      model: String(orchestratorProfile?.model || settings.model || ''),
      useProxy: Boolean((orchestratorProfile as any)?.useProxy),
    };
    if (visionProfile && !hasOwnApiKey(visionProfile) && runtimeProfileResolution.route === 'proxy') {
      visionProfile = applyConvexProxyProfile(visionProfile, settings);
    }

    const kimiInUse =
      activeProfile?.provider === 'kimi' ||
      orchestratorProfile?.provider === 'kimi' ||
      visionProfile?.provider === 'kimi';
    if (kimiInUse && !ctx.kimiHeaderRuleOk && !sessionState.kimiWarningSent) {
      sessionState.kimiWarningSent = true;
      ctx.sendRuntime(runMeta, {
        type: 'run_warning',
        message:
          'Kimi requires User-Agent "coding-agent". This browser runtime could not configure a compatible header rewrite path (DNR/webRequest), so requests may fail. Use a build with header rewrite support or route through a proxy that sets this header.',
      });
    }

    const visionToolsEnabled = isVisionModelProfile(orchestratorProfile);
    const tools = ctx.getToolsForSession(settings, orchestratorEnabled, teamProfiles, visionToolsEnabled);
    const streamEnabled = settings.streamResponses !== false && settings.streamResponses !== 'false';
    streamResponsesEnabled = streamEnabled;
    const showThinking = settings.showThinking !== false && settings.showThinking !== 'false';
    const enableAnthropicThinking =
      showThinking &&
      (orchestratorProfile.provider === 'anthropic' ||
        orchestratorProfile.provider === 'kimi' ||
        ((orchestratorProfile.provider === 'openrouter' || orchestratorProfile.provider === 'parchi') &&
          /claude/i.test(orchestratorProfile.model || '')));

    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const sessionTabs = browserTools.getSessionTabSummaries();
    const sessionTabContext = sessionTabs
      .filter((tab) => typeof tab.id === 'number')
      .map((tab) => ({
        id: tab.id as number,
        title: tab.title,
        url: tab.url,
      }));
    const workingTabId: number | null = browserTools.getCurrentSessionTabId() ?? activeTab?.id ?? null;
    const workingTab = sessionTabs.find((tab) => tab.id === workingTabId);
    const context = {
      currentUrl: workingTab?.url || activeTab?.url || 'unknown',
      currentTitle: workingTab?.title || activeTab?.title || 'unknown',
      tabId: workingTabId,
      availableTabs: sessionTabContext,
      orchestratorEnabled,
      teamProfiles,
      provider: orchestratorProfile.provider || '',
      model: orchestratorProfile.model || settings.model || '',
      toolCatalog: tools.map((tool) => ({ name: tool.name, description: tool.description || '' })),
      showThinking,
    };

    const matchedSkillsResult = await getMatchedSkills(context.currentUrl);

    const historyInput = Array.isArray(conversationHistory) ? conversationHistory : [];
    const trimmedUserMessage = typeof userMessage === 'string' ? userMessage.trim() : '';

    let enrichedUserMessage = userMessage;
    let recordedImages: Array<{ dataUrl: string }> = [];
    if (recordedContext && typeof recordedContext === 'object' && recordedContext.summary) {
      enrichedUserMessage = `${userMessage}\n\n${recordedContext.summary}`;
      if (Array.isArray(recordedContext.selectedImages)) {
        recordedImages = recordedContext.selectedImages;
      }
    }

    const lastMessage = historyInput[historyInput.length - 1];
    const lastContentText = typeof lastMessage?.content === 'string' ? lastMessage.content : '';
    const shouldReplaceLastUserMessage =
      !!trimmedUserMessage &&
      !!lastMessage &&
      lastMessage.role === 'user' &&
      lastContentText === userMessage &&
      lastContentText !== enrichedUserMessage;
    const shouldAppendUserMessage =
      !!trimmedUserMessage &&
      (!lastMessage ||
        lastMessage.role !== 'user' ||
        (lastContentText !== enrichedUserMessage && !shouldReplaceLastUserMessage));
    const historyWithUserMessage = shouldReplaceLastUserMessage
      ? [...historyInput.slice(0, -1), { role: 'user' as const, content: enrichedUserMessage }]
      : shouldAppendUserMessage
        ? [...historyInput, { role: 'user' as const, content: enrichedUserMessage }]
        : historyInput;
    const normalizedHistory = normalizeConversationHistory(historyWithUserMessage);
    ctx.emitTokenTrace(runMeta, sessionState, {
      action: 'history_prepared',
      reason: 'history_sanitized',
      note: `Prepared ${normalizedHistory.length} messages for model call.`,
      details: {
        inputHistoryCount: historyInput.length,
        withUserMessageCount: historyWithUserMessage.length,
        normalizedCount: normalizedHistory.length,
        appendedUserMessage: shouldAppendUserMessage,
        replacedLastUserMessage: shouldReplaceLastUserMessage,
      },
    });
    let activeModelId = String(orchestratorProfile.model || settings.model || '').trim();
    let model = resolveLanguageModel(orchestratorProfile);
    const modelRetryOrder = [activeModelId];
    const oauthProviderMap: Record<string, OAuthProviderKey> = {
      'claude-oauth': 'claude',
      'codex-oauth': 'codex',
      'copilot-oauth': 'copilot',
      'qwen-oauth': 'qwen',
    };
    const openRouterLikeProvider =
      String(orchestratorProfile.provider || '').toLowerCase() === 'openrouter' ||
      String(orchestratorProfile.provider || '').toLowerCase() === 'parchi';
    const oauthProviderKey =
      oauthProviderMap[
        String(orchestratorProfile.provider || '')
          .trim()
          .toLowerCase()
      ] || null;
    let oauthFallbackCandidatesLoaded = false;
    const inferModelFamily = (modelId: string) => {
      const lower = String(modelId || '')
        .trim()
        .toLowerCase();
      if (!lower) return '';
      if (lower.startsWith('claude')) return 'claude';
      if (lower.startsWith('gpt') || /^o\d/.test(lower)) return 'openai';
      if (lower.startsWith('gemini')) return 'gemini';
      if (lower.startsWith('qwen')) return 'qwen';
      if (lower.startsWith('deepseek')) return 'deepseek';
      if (lower.startsWith('grok')) return 'grok';
      return lower.split(/[-_/]/)[0] || '';
    };
    const requestedModelFamily = inferModelFamily(activeModelId);
    const enforceSameFamilyOAuthFallback = oauthProviderKey === 'copilot' && requestedModelFamily.length > 0;
    if (openRouterLikeProvider) {
      if (!modelRetryOrder.includes('openrouter/auto')) modelRetryOrder.push('openrouter/auto');
      if (!modelRetryOrder.includes('openai/gpt-4o-mini')) modelRetryOrder.push('openai/gpt-4o-mini');
    }

    const switchActiveModel = (nextModelId: string) => {
      const trimmed = String(nextModelId || '').trim();
      if (!trimmed) return false;
      if (trimmed === activeModelId) return true;
      orchestratorProfile = {
        ...orchestratorProfile,
        model: trimmed,
      };
      activeModelId = trimmed;
      model = resolveLanguageModel(orchestratorProfile);
      benchmarkModel = trimmed;
      return true;
    };

    const getErrorClassificationContext = () => ({
      route: runtimeProfileResolution.route,
      provider: String(orchestratorProfile?.provider || ''),
      proxyProvider: String((orchestratorProfile as any)?.proxyProvider || ''),
      model: activeModelId,
      useProxy: Boolean((orchestratorProfile as any)?.useProxy),
    });
    const captureErrorClassificationContext = () => {
      latestErrorContext = getErrorClassificationContext();
      return latestErrorContext;
    };

    const persistRecoveredModelSelection = async (nextModelId: string) => {
      if (!openRouterLikeProvider) return;
      const trimmed = String(nextModelId || '').trim();
      if (!trimmed) return;
      try {
        const stored = await chrome.storage.local.get(['activeConfig', 'configs', 'model']);
        const activeConfig = String(stored.activeConfig || settings.activeConfig || 'default');
        const configs =
          stored.configs && typeof stored.configs === 'object' && !Array.isArray(stored.configs)
            ? { ...stored.configs }
            : {};
        const ap =
          configs[activeConfig] && typeof configs[activeConfig] === 'object' && !Array.isArray(configs[activeConfig])
            ? { ...configs[activeConfig] }
            : {};
        ap.model = trimmed;
        configs[activeConfig] = ap;
        await chrome.storage.local.set({
          model: trimmed,
          configs,
        });
      } catch {
        // Ignore persistence failures
      }
    };

    const toolSet = buildToolSet(tools, async (toolName, args, options) =>
      ctx.executeToolByName(
        toolName,
        args,
        {
          runMeta,
          settings,
          visionProfile,
        },
        options.toolCallId,
      ),
    );

    const extractThinkingFromResponseMessages = (messages: unknown): string | null => {
      if (!Array.isArray(messages)) return null;
      const thinkRegex = /<\s*(think|analysis|thinking)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi;
      const collected: string[] = [];

      const collectFromText = (text: string) => {
        let match;
        while ((match = thinkRegex.exec(text)) !== null) {
          if (match[2]) collected.push(match[2].trim());
        }
        thinkRegex.lastIndex = 0;
      };

      const collectFromContent = (content: unknown) => {
        if (!content) return;
        if (typeof content === 'string') {
          collectFromText(content);
          return;
        }
        if (Array.isArray(content)) {
          content.forEach((part) => collectFromContent(part));
          return;
        }
        if (content && typeof content === 'object') {
          const type = typeof (content as any).type === 'string' ? String((content as any).type) : '';
          if (type && (type.includes('thinking') || type.includes('reasoning') || type.includes('analysis'))) {
            const raw = (content as any).text ?? (content as any).content ?? (content as any).value;
            if (typeof raw === 'string' && raw.trim()) collected.push(raw.trim());
            return;
          }
          if (typeof (content as any).text === 'string') {
            collectFromText((content as any).text);
            return;
          }
          if (typeof (content as any).content === 'string') {
            collectFromText((content as any).content);
          }
        }
      };

      messages.forEach((msg) => collectFromContent((msg as any)?.content));
      const merged = collected.filter(Boolean).join('\n\n').trim();
      return merged || null;
    };

    const maxRecoveryAttempts = 2;
    let recoveryAttempt = 0;
    let currentHistory = normalizedHistory;
    let finalText = '';
    let reasoningText: string | null = null;
    let totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let toolResults: Array<Record<string, any>> = [];
    let responseMessages: Message[] = [];

    const runModelPass = async (messages: Message[]) => {
      const modelMessages = toModelMessages(messages);

      if (recordedImages.length > 0 && isVisionModelProfile(orchestratorProfile)) {
        for (let i = modelMessages.length - 1; i >= 0; i--) {
          const msg = modelMessages[i];
          if (msg.role === 'user') {
            const existingContent = typeof msg.content === 'string' ? msg.content : '';
            const parts: any[] = [];
            if (existingContent) {
              parts.push({ type: 'text', text: existingContent });
            }
            for (const img of recordedImages) {
              if (img.dataUrl && typeof img.dataUrl === 'string') {
                parts.push({ type: 'image', image: img.dataUrl });
              }
            }
            if (parts.length > 0) {
              (msg as any).content = parts;
            }
            break;
          }
        }
      }

      let streamStopSent = false;
      let textDeltaCount = 0;
      let reasoningDeltaCount = 0;
      let textStreamError: string | null = null;

      const isNoOutputError = (error: unknown) => {
        const message = (error as any)?.message || String(error ?? '');
        return typeof message === 'string' && message.includes('No output generated');
      };

      const safeAwait = async <T>(promise: PromiseLike<T>, fallback: T): Promise<T> => {
        try {
          return await Promise.resolve(promise);
        } catch (error) {
          if (!isNoOutputError(error)) {
            console.warn('[safeAwait] Error (using fallback):', error);
          }
          return fallback;
        }
      };

      const sendStreamStop = () => {
        if (!streamEnabled || streamStopSent) return;
        ctx.sendRuntime(runMeta, { type: 'assistant_stream_stop' });
        streamStopSent = true;
      };

      const sendTextDelta = (textPart: string) => {
        if (!textPart) return;
        markFirstTextToken();
        textDeltaCount += 1;
        ctx.sendRuntime(runMeta, {
          type: 'assistant_stream_delta',
          content: textPart,
          channel: 'text',
        });
      };

      const sendReasoningDelta = (delta: string) => {
        if (!delta) return;
        reasoningDeltaCount += 1;
        ctx.sendRuntime(runMeta, {
          type: 'assistant_stream_delta',
          content: delta,
          channel: 'reasoning',
        });
      };

      const emitSyntheticStream = async (fullText: string) => {
        const text = String(fullText || '');
        if (!text) return;
        const maxChunks = 120;
        const chunkSize = Math.max(24, Math.ceil(text.length / maxChunks));
        for (let i = 0; i < text.length; i += chunkSize) {
          if (abortSignal.aborted) return;
          sendTextDelta(text.slice(i, i + chunkSize));
          await new Promise((resolve) => setTimeout(resolve, 8));
        }
      };

      if (streamEnabled) {
        ctx.sendRuntime(runMeta, { type: 'assistant_stream_start' });
      }

      const orchestratorSystemPrompt = enhanceSystemPrompt(
        orchestratorProfile.systemPrompt || '',
        context,
        sessionState,
        matchedSkillsResult,
      );
      const codexOAuthProfile = profileUsesCodexOAuth(orchestratorProfile as any);
      const providerOptions: any = {};
      if (enableAnthropicThinking) {
        providerOptions.anthropic = {
          thinking: {
            type: 'enabled',
            budgetTokens: Math.min(Math.max(1024, Math.floor((orchestratorProfile.maxTokens ?? 4096) * 0.5)), 16384),
          },
        };
      }
      if (codexOAuthProfile) {
        providerOptions.openai = buildCodexOAuthProviderOptions(orchestratorSystemPrompt).openai;
      }

      const result = streamText({
        model,
        system: orchestratorSystemPrompt,
        messages: modelMessages,
        tools: toolSet,
        abortSignal,
        temperature: orchestratorProfile.temperature ?? 0.7,
        maxOutputTokens: codexOAuthProfile ? undefined : (orchestratorProfile.maxTokens ?? 4096),
        stopWhen: stepCountIs(48),
        providerOptions: Object.keys(providerOptions).length > 0 ? providerOptions : undefined,
        onChunk: ({ chunk }) => {
          markFirstChunk();
          const chunkType = typeof (chunk as any).type === 'string' ? String((chunk as any).type) : '';
          if (chunkType.includes('reasoning') || chunkType.includes('thinking')) {
            sendReasoningDelta((chunk as any).text || (chunk as any).delta || '');
          }
        },
      });

      const resolveText = async () => {
        try {
          return await result.text;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error ?? '');
          if (message.includes('No output generated')) {
            return '';
          }
          throw error;
        }
      };

      try {
        if (streamEnabled) {
          try {
            for await (const textPart of result.textStream) {
              markFirstChunk();
              sendTextDelta(textPart || '');
            }
          } catch (error) {
            textStreamError = (error as any)?.message || String(error ?? '');
            console.warn('Streaming text error:', error);
          }
        }

        const text = await resolveText();
        const [reasoning, usage, steps, respMsgs] = await Promise.all([
          safeAwait(result.reasoningText, null),
          safeAwait(result.totalUsage as any, { inputTokens: 0, outputTokens: 0, totalTokens: 0 } as any),
          safeAwait(result.steps as any, [] as any),
          safeAwait((result as any).responseMessages as Promise<any>, [] as any),
        ]);
        const resolvedText = text || extractTextFromResponseMessages(respMsgs);

        const resolvedReasoning = showThinking
          ? reasoning || extractThinkingFromResponseMessages(respMsgs)
          : reasoning || null;

        if (streamEnabled && showThinking && resolvedReasoning && reasoningDeltaCount === 0) {
          sendReasoningDelta(resolvedReasoning);
        }

        if (streamEnabled && resolvedText && textDeltaCount === 0) {
          await emitSyntheticStream(resolvedText);
        }

        if (!resolvedText && textStreamError) {
          const streamClassified = classifyApiError(new Error(textStreamError), captureErrorClassificationContext());
          const detail = streamClassified.action ? ` ${streamClassified.action}` : '';
          ctx.sendRuntime(runMeta, {
            type: 'run_warning',
            message: `Model produced no output. ${streamClassified.message}${detail}`,
          });
        }

        sendStreamStop();

        return {
          text: resolvedText || '',
          reasoningText: resolvedReasoning || null,
          totalUsage: {
            inputTokens: Number(usage?.inputTokens || 0),
            outputTokens: Number(usage?.outputTokens || 0),
            totalTokens: Number(usage?.totalTokens || 0),
          },
          toolResults: steps.flatMap((step: any) => step.toolResults || []),
        };
      } catch (error) {
        sendStreamStop();
        if (abortSignal.aborted) {
          throw error;
        }
        const classified = classifyApiError(error, captureErrorClassificationContext());
        const statusCode = Number((error as any)?.statusCode ?? (error as any)?.status ?? 0);
        if (classified.category === 'model' || APICallError.isInstance(error) || statusCode >= 400) {
          throw error;
        }
        console.error('[runModelPass] Error:', error);
        return {
          text: '',
          reasoningText: null,
          totalUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          toolResults: [],
        };
      }
    };

    const runModelPassWithFallback = async (messages: Message[]) => {
      let lastModelError: unknown = null;
      let refreshedProxyAuthOnce = false;
      const maxEmptyBodyRetriesPerModel = 2;
      const loadOAuthFallbackCandidates = async (failedModelId: string) => {
        if (!oauthProviderKey || oauthFallbackCandidatesLoaded) return 0;
        oauthFallbackCandidatesLoaded = true;
        try {
          const providerModelIds = await fetchProviderModels(oauthProviderKey);
          const currentRetrySet = new Set(
            modelRetryOrder.map((id) =>
              String(id || '')
                .trim()
                .toLowerCase(),
            ),
          );
          let nextCandidates = providerModelIds
            .map((id) => String(id || '').trim())
            .filter((id) => id.length > 0 && !currentRetrySet.has(id.toLowerCase()));

          if (enforceSameFamilyOAuthFallback) {
            const sameFamilyCandidates = nextCandidates.filter((id) => inferModelFamily(id) === requestedModelFamily);
            if (sameFamilyCandidates.length > 0) {
              nextCandidates = sameFamilyCandidates;
            } else {
              ctx.sendRuntime(runMeta, {
                type: 'run_warning',
                message: `Copilot OAuth rejected "${failedModelId}". No additional ${requestedModelFamily} fallback models are available for this account.`,
              });
              return 0;
            }
          }

          nextCandidates = nextCandidates.slice(0, 16);
          if (nextCandidates.length > 0) {
            modelRetryOrder.push(...nextCandidates);
            ctx.sendRuntime(runMeta, {
              type: 'run_warning',
              message: `Model "${failedModelId}" unavailable. Loaded ${nextCandidates.length} fallback model candidate(s) from ${oauthProviderKey} OAuth.`,
            });
          }
          return nextCandidates.length;
        } catch (oauthModelError) {
          console.warn('[oauth-fallback] Failed to load OAuth fallback model candidates:', oauthModelError);
          return 0;
        }
      };

      for (let idx = 0; idx < modelRetryOrder.length; idx += 1) {
        modelAttempts += 1;
        const candidateModelId = modelRetryOrder[idx];
        if (!switchActiveModel(candidateModelId)) {
          continue;
        }
        if (idx > 0) {
          ctx.sendRuntime(runMeta, {
            type: 'run_warning',
            message: `Model "${modelRetryOrder[0]}" unavailable. Retrying with "${candidateModelId}".`,
          });
        }

        let emptyBodyRetries = 0;
        while (true) {
          try {
            const pass = await runModelPass(messages);
            const hasTextOutput = String(pass.text || '').trim().length > 0;
            const hasToolOutput = Array.isArray(pass.toolResults) && pass.toolResults.length > 0;
            const usageInputTokens = Number(pass.totalUsage?.inputTokens || 0);
            const usageOutputTokens = Number(pass.totalUsage?.outputTokens || 0);
            const looksLikeSilentModelFailure =
              !hasTextOutput && !hasToolOutput && usageInputTokens === 0 && usageOutputTokens === 0;

            if (looksLikeSilentModelFailure && oauthProviderKey) {
              const loadedFallbackCount = await loadOAuthFallbackCandidates(activeModelId);
              if (idx < modelRetryOrder.length - 1) {
                ctx.sendRuntime(runMeta, {
                  type: 'run_warning',
                  message: `Model "${activeModelId}" produced no output. Retrying with another ${oauthProviderKey} model.`,
                });
                lastModelError = new Error(`Model "${activeModelId}" produced no output.`);
                break;
              }
              if (loadedFallbackCount === 0) {
                throw new Error(`Model "${activeModelId}" is unavailable for this OAuth account.`);
              }
            }

            if (idx > 0) {
              await persistRecoveredModelSelection(candidateModelId);
            }
            return pass;
          } catch (error) {
            const classified = classifyApiError(error, captureErrorClassificationContext());
            const statusCode = Number((error as any)?.statusCode ?? (error as any)?.status ?? 0);
            const isProxyAuthFailure =
              runtimeProfileResolution.route === 'proxy' &&
              (classified.category === 'auth' || statusCode === 401 || statusCode === 403);
            if (isProxyAuthFailure && !refreshedProxyAuthOnce) {
              const refreshed = await refreshConvexProxyAuthSession(settings, { force: true });
              if (refreshed) {
                refreshedProxyAuthOnce = true;
                if ((orchestratorProfile as any)?.useProxy) {
                  (orchestratorProfile as any).proxyAuthToken = String(settings.convexAccessToken || '').trim();
                }
                if ((visionProfile as any)?.useProxy) {
                  (visionProfile as any).proxyAuthToken = String(settings.convexAccessToken || '').trim();
                }
                ctx.sendRuntime(runMeta, {
                  type: 'run_warning',
                  message: 'Refreshing paid runtime session and retrying request.',
                });
                continue;
              }
            }

            const isEmptyBody = classified.recoverable && classified.message.includes('empty response body');
            if (isEmptyBody && emptyBodyRetries < maxEmptyBodyRetriesPerModel) {
              emptyBodyRetries += 1;
              const waitMs = Math.min(1200, 300 * 2 ** (emptyBodyRetries - 1));
              ctx.sendRuntime(runMeta, {
                type: 'run_warning',
                message: `Provider returned an empty response body. Retrying ${emptyBodyRetries}/${maxEmptyBodyRetriesPerModel}...`,
              });
              ctx.emitTokenTrace(runMeta, sessionState, {
                action: 'provider_retry',
                reason: 'provider_retry_empty_body',
                note: `Provider returned an empty response body. Retrying ${emptyBodyRetries}/${maxEmptyBodyRetriesPerModel}.`,
                details: {
                  retry: emptyBodyRetries,
                  retryMax: maxEmptyBodyRetriesPerModel,
                  waitMs,
                },
              });
              await new Promise((resolve) => setTimeout(resolve, waitMs));
              continue;
            }

            if (classified.category === 'model' && oauthProviderKey) {
              await loadOAuthFallbackCandidates(activeModelId);
            }

            if (classified.category !== 'model') {
              throw error;
            }
            lastModelError = error;
            break;
          }
        }
      }
      throw lastModelError || new Error('Model unavailable after fallback attempts.');
    };

    while (true) {
      if (abortSignal.aborted) return;
      const passResult = await runModelPassWithFallback(currentHistory);
      const xmlToolCalls = extractXmlToolCalls(passResult.text);
      toolResults = passResult.toolResults || [];

      if (xmlToolCalls.length > 0 && toolResults.length === 0 && recoveryAttempt < maxRecoveryAttempts) {
        ctx.sendRuntime(runMeta, {
          type: 'run_warning',
          message: 'Detected XML tool call output. Executing tools and retrying.',
        });

        const cleanedText = stripXmlToolCalls(passResult.text);
        const parsedXmlAssistant = extractThinking(cleanedText, passResult.reasoningText || null);
        const toolMessages: Message[] = [];
        const xmlToolCallEntries: ToolCall[] = [];
        for (const call of xmlToolCalls) {
          if (abortSignal.aborted) return;
          const toolCallId = `xml_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          xmlToolCallEntries.push({ id: toolCallId, name: call.name, args: call.args });
          const output = await ctx.executeToolByName(
            call.name,
            call.args,
            { runMeta, settings, visionProfile },
            toolCallId,
          );
          toolMessages.push({
            role: 'tool',
            toolCallId,
            toolName: call.name,
            content: [
              {
                type: 'tool-result',
                toolCallId,
                toolName: call.name,
                output:
                  output && typeof output === 'object'
                    ? { type: 'json', value: output }
                    : { type: 'text', value: String(output ?? '') },
              },
            ],
          });
        }
        const xmlAssistantMsg: Message = {
          role: 'assistant',
          content: parsedXmlAssistant.content || '',
          thinking: parsedXmlAssistant.thinking || null,
          toolCalls: xmlToolCallEntries,
        };
        currentHistory = normalizeConversationHistory([...currentHistory, xmlAssistantMsg]);
        currentHistory = normalizeConversationHistory([
          ...currentHistory,
          ...toolMessages,
          {
            role: 'system',
            content:
              'Previous response included XML tool call markup. Tools were executed. Continue without XML tool tags.',
          },
        ]);

        recoveryAttempt += 1;
        continue;
      }

      const cleanedText = stripXmlToolCalls(passResult.text);
      const parsedFinal = extractThinking(cleanedText, passResult.reasoningText || null);
      reasoningText = parsedFinal.thinking || passResult.reasoningText || null;
      totalUsage = passResult.totalUsage || totalUsage;
      const isValid = isValidFinalResponse(parsedFinal.content, { allowEmpty: false });
      finalText = isValid ? parsedFinal.content.trim() : '';

      if (!finalText) {
        const maxFinalizeAttempts = 2;

        const toolDigest = (() => {
          if (!toolResults.length) return '';
          const items = toolResults.slice(-10).map((r: any) => ({
            tool: r.toolName || 'tool',
            args: r.input || r.args || {},
            output: r.output ?? null,
          }));
          let raw = JSON.stringify(items);
          const limit = 12_000;
          if (raw.length > limit) raw = `${raw.slice(0, limit)}...`;
          return raw;
        })();

        for (let attempt = 1; attempt <= maxFinalizeAttempts; attempt += 1) {
          ctx.sendRuntime(runMeta, {
            type: 'run_warning',
            message: `Model did not produce a valid final response. Retrying finalization (${attempt}/${maxFinalizeAttempts}).`,
          });

          const finalizePromptParts = [
            'Your previous response did not include a valid final answer.',
            'Write the final answer now.',
            'Do NOT call tools.',
            'Do NOT mention retrying, failures, or internal errors unless the user explicitly asked.',
          ];
          if (toolDigest) {
            finalizePromptParts.push('Use the tool results below as ground truth.');
            finalizePromptParts.push(`TOOL_RESULTS_JSON=${toolDigest}`);
          }

          const finalizeSystemPrompt = enhanceSystemPrompt(
            orchestratorProfile.systemPrompt || '',
            context,
            sessionState,
            matchedSkillsResult,
          );
          const finalizeUsesCodexOAuth = profileUsesCodexOAuth(orchestratorProfile as any);
          const finalizeResult = await generateText({
            model,
            system: finalizeSystemPrompt,
            messages: [...toModelMessages(currentHistory), { role: 'user', content: finalizePromptParts.join('\n') }],
            abortSignal,
            temperature: 0.2,
            maxOutputTokens: finalizeUsesCodexOAuth ? undefined : Math.min(2048, orchestratorProfile.maxTokens ?? 4096),
            providerOptions: finalizeUsesCodexOAuth ? buildCodexOAuthProviderOptions(finalizeSystemPrompt) : undefined,
          });

          const candidateRaw = String(finalizeResult.text || '');
          const parsedFinalize = extractThinking(candidateRaw, reasoningText || null);
          if (parsedFinalize.thinking) {
            reasoningText = parsedFinalize.thinking;
          }
          const candidate = parsedFinalize.content.trim();
          if (isValidFinalResponse(candidate, { allowEmpty: false })) {
            finalText = candidate;
            totalUsage = {
              inputTokens: (totalUsage.inputTokens || 0) + Number((finalizeResult as any)?.usage?.inputTokens || 0),
              outputTokens: (totalUsage.outputTokens || 0) + Number((finalizeResult as any)?.usage?.outputTokens || 0),
              totalTokens: (totalUsage.totalTokens || 0) + Number((finalizeResult as any)?.usage?.totalTokens || 0),
            };
            break;
          }
        }

        if (!finalText) {
          ctx.sendRuntime(runMeta, {
            type: 'run_error',
            message: 'Model failed to produce a valid final response after retries.',
            errorCategory: 'finalize',
            action: 'Try a different model, increase maxTokens, or disable streaming if enabled.',
            recoverable: true,
            latency: buildLatencyMetrics(),
            benchmark: buildBenchmarkContext(false, 'finalize'),
          });
          return;
        }
      }

      const assistantMsg: Message = {
        role: 'assistant',
        content: finalText,
        thinking: reasoningText || null,
      };
      const normalizedToolResults: Array<Record<string, any> & { toolCallId: string; toolName: string }> =
        toolResults.length > 0
          ? toolResults.map((resultItem, index) => ({
              ...resultItem,
              toolCallId:
                typeof resultItem?.toolCallId === 'string' && resultItem.toolCallId.trim()
                  ? resultItem.toolCallId
                  : `tc_${Date.now()}_${index}`,
              toolName:
                typeof resultItem?.toolName === 'string' && resultItem.toolName.trim() ? resultItem.toolName : 'tool',
            }))
          : [];
      if (normalizedToolResults.length > 0) {
        assistantMsg.toolCalls = normalizedToolResults.map((r) => ({
          id: r.toolCallId,
          name: r.toolName,
          args: r.input || r.args || {},
        }));
      }
      responseMessages = [assistantMsg];
      if (normalizedToolResults.length > 0) {
        responseMessages.push(
          ...normalizedToolResults.map((resultItem) => ({
            role: 'tool' as const,
            toolCallId: resultItem.toolCallId,
            toolName: resultItem.toolName,
            content: [
              {
                type: 'tool-result',
                toolCallId: resultItem.toolCallId,
                toolName: resultItem.toolName,
                output:
                  resultItem.output && typeof resultItem.output === 'object'
                    ? { type: 'json', value: resultItem.output }
                    : { type: 'text', value: String(resultItem.output ?? '') },
              },
            ],
          })),
        );
      }

      break;
    }

    ctx.sendRuntime(runMeta, {
      type: 'assistant_final',
      content: finalText,
      thinking: reasoningText || null,
      model: orchestratorProfile.model || settings.model || '',
      usage: {
        inputTokens: totalUsage.inputTokens || 0,
        outputTokens: totalUsage.outputTokens || 0,
        totalTokens: totalUsage.totalTokens || 0,
      },
      responseMessages,
      latency: buildLatencyMetrics(),
      benchmark: buildBenchmarkContext(true),
    });
    const inputTokens = Number(totalUsage.inputTokens || 0);
    const outputTokens = Number(totalUsage.outputTokens || 0);
    const totalTokens = Number(totalUsage.totalTokens || inputTokens + outputTokens);
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
            model: orchestratorProfile.model || settings.model || '',
            provider: orchestratorProfile.provider || settings.provider || '',
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
        contextLimit: orchestratorProfile.contextLimit || settings.contextLimit || currentTokenSnapshot.contextLimit,
        contextPercent: normalizeContextPercent(
          totalTokens > 0 ? totalTokens : currentTokenSnapshot.contextApproxTokens,
          orchestratorProfile.contextLimit || settings.contextLimit || currentTokenSnapshot.contextLimit,
        ),
        sessionInputTokens: currentTokenSnapshot.sessionInputTokens + inputTokens,
        sessionOutputTokens: currentTokenSnapshot.sessionOutputTokens + outputTokens,
        sessionTotalTokens: currentTokenSnapshot.sessionTotalTokens + totalDelta,
      },
      details: {
        inputTokens,
        outputTokens,
        totalTokens,
        responseMessageCount: responseMessages.length,
      },
    });

    const nextHistory = normalizeConversationHistory([...currentHistory, ...responseMessages]);
    const contextLimit = orchestratorProfile.contextLimit || settings.contextLimit || 200000;
    await runContextCompaction(ctx, {
      runMeta,
      history: nextHistory,
      contextLimit,
      orchestratorProfile,
      model,
      abortSignal,
      source: 'auto',
    });
  } catch (error) {
    if (abortSignal.aborted || ctx.isRunCancelled(runMeta.runId)) {
      return;
    }
    console.error('Error processing user message:', error);
    const classified = classifyApiError(error, {
      ...latestErrorContext,
    });
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

async function getMatchedSkills(url: string): Promise<Array<{ name: string; description: string; steps: string }>> {
  try {
    const data = await chrome.storage.local.get('skills');
    const skills: any[] = Array.isArray(data.skills) ? data.skills : [];
    return skills
      .filter((skill) => {
        if (!skill.sitePattern) return false;
        try {
          return new RegExp(skill.sitePattern.replace(/\*/g, '.*')).test(url);
        } catch {
          return false;
        }
      })
      .slice(0, 5)
      .map((skill) => ({
        name: skill.name,
        description: skill.description,
        steps: skill.steps.map((s: any, i: number) => `${i + 1}. ${s.tool}(${JSON.stringify(s.args)})`).join('\n'),
      }));
  } catch {
    return [];
  }
}
