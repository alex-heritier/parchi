import { buildToolSet, resolveLanguageModel } from '../../ai/sdk-client.js';
import { patchSettingsSnapshot, readSettingsSnapshot } from '../../state/persistence/settings-repository.js';
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
import { OAUTH_PROVIDER_MAP, inferModelFamily } from './agent-loop-model-selection.js';
import type {
  AgentLoopContext,
  AgentLoopDiagnostics,
  AgentProfile,
  AgentSettings,
  PreparedAgentLoopBlocked,
  PreparedAgentLoopRun,
  RecordedContext,
} from './agent-loop-shared.js';
import { prepareConversationHistory } from './history-prep.js';
import { getMatchedSkills } from './skill-matcher.js';

export async function prepareAgentLoopRun(
  ctx: PreparedAgentLoopRun['ctx'],
  runMeta: PreparedAgentLoopRun['runMeta'],
  abortSignal: AbortSignal,
  sessionId: string,
  userMessage: string,
  conversationHistory: PreparedAgentLoopRun['currentHistory'],
  selectedTabs: chrome.tabs.Tab[],
  recordedContext: RecordedContext,
  diagnostics: AgentLoopDiagnostics,
): Promise<PreparedAgentLoopRun | PreparedAgentLoopBlocked> {
  const sessionState = ctx.getSessionState(sessionId);
  const browserTools = ctx.getBrowserTools(sessionId);
  const settings = (await readSettingsSnapshot()) as AgentSettings;

  settings.enableScreenshots ??= true;
  settings.sendScreenshotsAsImages ??= false;
  settings.visionBridge ??= true;
  settings.toolPermissions ??= { read: true, interact: true, navigate: true, tabs: true, screenshots: true };
  settings.allowedDomains ??= '';
  if (!Array.isArray(settings.auxAgentProfiles)) settings.auxAgentProfiles = [];

  ctx.currentSettings = settings;
  ctx.currentSessionId = sessionId;

  try {
    await browserTools.configureSessionTabs(selectedTabs || [], { title: 'Parchi', color: 'blue' });
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

  const activeProfileName = String(settings.activeConfig || 'default');
  const orchestratorProfileName = String(settings.orchestratorProfile || activeProfileName);
  const visionProfileName = settings.visionProfile ? String(settings.visionProfile) : null;
  const orchestratorEnabled = settings.useOrchestrator === true;
  const teamProfiles = resolveTeamProfiles(settings);
  const activeProfile = resolveProfile(settings, activeProfileName) as AgentProfile;
  let orchestratorProfile = (
    orchestratorEnabled ? resolveProfile(settings, orchestratorProfileName) : activeProfile
  ) as AgentProfile;
  let visionProfile = (
    settings.visionBridge !== false ? resolveProfile(settings, visionProfileName || activeProfileName) : null
  ) as AgentProfile | null;

  if (!hasOwnApiKey(orchestratorProfile)) await refreshConvexProxyAuthSession(settings);

  let runtimeProfileResolution = resolveRuntimeModelProfile(
    orchestratorProfile,
    settings,
  ) as PreparedAgentLoopRun['runtimeProfileResolution'];
  diagnostics.benchmarkRoute = runtimeProfileResolution.route;
  diagnostics.benchmarkProvider = String(orchestratorProfile?.provider || '');
  diagnostics.benchmarkModel = String(orchestratorProfile?.model || settings.model || '');
  if (!runtimeProfileResolution.allowed) {
    return {
      blocked: true,
      message: runtimeProfileResolution.errorMessage || 'Please configure your API key in settings',
    };
  }
  if (runtimeProfileResolution.route === 'oauth') {
    try {
      orchestratorProfile = (await injectOAuthTokens(runtimeProfileResolution.profile)) as AgentProfile;
    } catch (error) {
      const canFallbackToActiveProfile = orchestratorEnabled && orchestratorProfileName !== activeProfileName;
      if (!canFallbackToActiveProfile) throw error;
      const activeRuntimeProfile = resolveRuntimeModelProfile(
        activeProfile,
        settings,
      ) as PreparedAgentLoopRun['runtimeProfileResolution'];
      if (!activeRuntimeProfile.allowed) throw error;
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
          ? ((await injectOAuthTokens(activeRuntimeProfile.profile)) as AgentProfile)
          : activeRuntimeProfile.profile;
      diagnostics.benchmarkRoute = runtimeProfileResolution.route;
      diagnostics.benchmarkProvider = String(orchestratorProfile?.provider || diagnostics.benchmarkProvider);
      diagnostics.benchmarkModel = String(orchestratorProfile?.model || diagnostics.benchmarkModel);
    }
  } else {
    orchestratorProfile = runtimeProfileResolution.profile;
  }

  diagnostics.latestErrorContext = {
    route: runtimeProfileResolution.route,
    provider: String(orchestratorProfile?.provider || ''),
    proxyProvider: String(orchestratorProfile.proxyProvider || ''),
    model: String(orchestratorProfile?.model || settings.model || ''),
    useProxy: Boolean(orchestratorProfile.useProxy),
  };
  if (visionProfile && !hasOwnApiKey(visionProfile) && runtimeProfileResolution.route === 'proxy') {
    visionProfile = applyConvexProxyProfile(visionProfile, settings) as AgentProfile;
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
  diagnostics.streamResponsesEnabled = streamEnabled;
  const showThinking = settings.showThinking !== false && settings.showThinking !== 'false';
  const enableAnthropicThinking =
    showThinking &&
    (orchestratorProfile.provider === 'anthropic' ||
      orchestratorProfile.provider === 'kimi' ||
      ((orchestratorProfile.provider === 'openrouter' || orchestratorProfile.provider === 'parchi') &&
        /claude/i.test(orchestratorProfile.model || '')));

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const sessionTabs = browserTools.getSessionTabSummaries();
  const workingTabId: number | null = browserTools.getCurrentSessionTabId() ?? activeTab?.id ?? null;
  const workingTab = sessionTabs.find((tab) => tab.id === workingTabId);
  const context: AgentLoopContext = {
    currentUrl: workingTab?.url || activeTab?.url || 'unknown',
    currentTitle: workingTab?.title || activeTab?.title || 'unknown',
    tabId: workingTabId,
    availableTabs: sessionTabs
      .filter((tab) => typeof tab.id === 'number')
      .map((tab) => ({ id: tab.id as number, title: tab.title, url: tab.url })),
    orchestratorEnabled,
    teamProfiles,
    provider: orchestratorProfile.provider || '',
    model: orchestratorProfile.model || settings.model || '',
    toolCatalog: tools.map((tool) => ({ name: tool.name, description: tool.description || '' })),
    showThinking,
  };
  const matchedSkillsResult = await getMatchedSkills(String(context.currentUrl || ''));
  const preparedHistory = prepareConversationHistory(userMessage, conversationHistory, recordedContext);

  ctx.emitTokenTrace(runMeta, sessionState, {
    action: 'history_prepared',
    reason: 'history_sanitized',
    note: `Prepared ${preparedHistory.normalizedHistory.length} messages for model call.`,
    details: {
      inputHistoryCount: preparedHistory.historyInput.length,
      withUserMessageCount: preparedHistory.historyWithUserMessage.length,
      normalizedCount: preparedHistory.normalizedHistory.length,
      appendedUserMessage: preparedHistory.shouldAppendUserMessage,
      replacedLastUserMessage: preparedHistory.shouldReplaceLastUserMessage,
    },
  });

  const activeModelId = String(orchestratorProfile.model || settings.model || '').trim();
  const model = resolveLanguageModel(orchestratorProfile);
  const modelRetryOrder = [activeModelId];
  const oauthProviderKey =
    OAUTH_PROVIDER_MAP[
      String(orchestratorProfile.provider || '')
        .trim()
        .toLowerCase()
    ] || null;
  const requestedModelFamily = inferModelFamily(activeModelId);
  const openRouterLikeProvider = ['openrouter', 'parchi'].includes(
    String(orchestratorProfile.provider || '').toLowerCase(),
  );
  if (openRouterLikeProvider) {
    if (!modelRetryOrder.includes('openrouter/auto')) modelRetryOrder.push('openrouter/auto');
    if (!modelRetryOrder.includes('openai/gpt-4o-mini')) modelRetryOrder.push('openai/gpt-4o-mini');
  }

  const prepared = {} as PreparedAgentLoopRun;
  const executeTool = (toolName: string, args: Record<string, unknown>, options: { toolCallId?: string }) =>
    ctx.executeToolByName(
      toolName,
      args,
      { runMeta, settings, visionProfile: prepared.visionProfile },
      options.toolCallId,
    );

  Object.assign(prepared, {
    ctx,
    runMeta,
    abortSignal,
    settings,
    sessionState,
    browserTools,
    activeProfile,
    orchestratorProfile,
    visionProfile,
    runtimeProfileResolution,
    streamEnabled,
    showThinking,
    enableAnthropicThinking,
    context,
    matchedSkillsResult,
    currentHistory: preparedHistory.normalizedHistory,
    recordedImages: preparedHistory.recordedImages,
    activeModelId,
    model,
    modelRetryOrder,
    oauthProviderKey,
    oauthFallbackCandidatesLoaded: false,
    requestedModelFamily,
    enforceSameFamilyOAuthFallback: oauthProviderKey === 'copilot' && requestedModelFamily.length > 0,
    openRouterLikeProvider,
    toolSet: buildToolSet(tools, (toolName, args, options) => executeTool(toolName, args, options)),
    switchActiveModel(nextModelId: string) {
      const trimmed = String(nextModelId || '').trim();
      if (!trimmed) return false;
      if (trimmed === prepared.activeModelId) return true;
      prepared.orchestratorProfile = { ...prepared.orchestratorProfile, model: trimmed };
      prepared.activeModelId = trimmed;
      prepared.model = resolveLanguageModel(prepared.orchestratorProfile);
      diagnostics.benchmarkModel = trimmed;
      return true;
    },
    async persistRecoveredModelSelection(nextModelId: string) {
      if (!prepared.openRouterLikeProvider) return;
      const trimmed = String(nextModelId || '').trim();
      if (!trimmed) return;
      try {
        const stored = await readSettingsSnapshot();
        const configName = String(stored.activeConfig || settings.activeConfig || 'default');
        const configs =
          stored.configs && typeof stored.configs === 'object' && !Array.isArray(stored.configs)
            ? { ...stored.configs }
            : {};
        const activeConfig =
          configs[configName] && typeof configs[configName] === 'object' && !Array.isArray(configs[configName])
            ? { ...configs[configName] }
            : {};
        activeConfig.model = trimmed;
        configs[configName] = activeConfig;
        await patchSettingsSnapshot({ model: trimmed, configs });
      } catch {}
    },
    captureErrorClassificationContext() {
      diagnostics.latestErrorContext = {
        route: prepared.runtimeProfileResolution.route,
        provider: String(prepared.orchestratorProfile?.provider || ''),
        proxyProvider: String(prepared.orchestratorProfile.proxyProvider || ''),
        model: prepared.activeModelId,
        useProxy: Boolean(prepared.orchestratorProfile.useProxy),
      };
      return diagnostics.latestErrorContext;
    },
  });

  return prepared;
}
