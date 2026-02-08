import { APICallError } from '@ai-sdk/provider';
import { classifyApiError } from './ai/error-classifier.js';
import { generateText, stepCountIs, streamText } from 'ai';
import {
  DEFAULT_COMPACTION_SETTINGS,
  SUMMARIZATION_PROMPT,
  SUMMARIZATION_SYSTEM_PROMPT,
  UPDATE_SUMMARIZATION_PROMPT,
  applyCompaction,
  buildCompactionSummaryMessage,
  estimateContextTokens,
  findCutPoint,
  serializeConversation,
  shouldCompact,
} from './ai/compaction.js';
import { normalizeConversationHistory } from './ai/message-schema.js';
import type { Message, ToolCall } from './ai/message-schema.js';
import { extractTextFromResponseMessages } from './ai/message-utils.js';
import { toModelMessages } from './ai/model-convert.js';
import { isValidFinalResponse } from './ai/retry-engine.js';
import { buildToolSet, describeImageWithModel, resolveLanguageModel } from './ai/sdk-client.js';
import { BrowserTools } from './tools/browser-tools.js';
import { RelayBridge } from './relay/relay-bridge.js';
import { buildRunPlan } from '../shared/src/plan.js';
import type { RunPlan } from '../shared/src/plan.js';
import { RUNTIME_MESSAGE_SCHEMA_VERSION } from '../shared/src/runtime-messages.js';

type RunMeta = {
  runId: string;
  turnId: string;
  sessionId: string;
};

class BackgroundService {
  browserTools: BrowserTools;
  currentSettings: Record<string, any> | null;
  currentSessionId: string | null;
  currentPlan: RunPlan | null;
  subAgentCount: number;
  subAgentProfileCursor: number;
  relay: RelayBridge;
  relayActiveRunIds: Set<string>;
  // State tracking for enforcement
  lastBrowserAction: string | null;
  awaitingVerification: boolean;
  currentStepVerified: boolean;
  kimiHeaderRuleOk: boolean;
  kimiWarningSent: boolean;

  constructor() {
    this.browserTools = new BrowserTools();
    this.currentSettings = null;
    this.currentSessionId = null;
    this.currentPlan = null;
    this.subAgentCount = 0;
    this.subAgentProfileCursor = 0;
    this.relayActiveRunIds = new Set();
    // State tracking for enforcement
    this.lastBrowserAction = null;
    this.awaitingVerification = false;
    this.currentStepVerified = false;
    this.kimiHeaderRuleOk = false;
    this.kimiWarningSent = false;

    this.relay = new RelayBridge({
      getHelloPayload: async () => {
        const manifest = chrome.runtime.getManifest();
        const stored = await chrome.storage.local.get(['relayAgentId']);
        let agentId = typeof stored.relayAgentId === 'string' ? stored.relayAgentId : '';
        if (!agentId) {
          agentId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          await chrome.storage.local.set({ relayAgentId: agentId });
        }
        return {
          agentId,
          name: 'parchi-extension',
          version: String(manifest.version || ''),
          browser: typeof (globalThis as any).browser !== 'undefined' ? 'firefox' : 'chrome',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          capabilities: { tools: true, agentRun: true },
        };
      },
      onRequest: async (req) => this.handleRelayRpc(req.method, req.params),
      onStatus: (status) => {
        const payload: Record<string, any> = { relayConnected: !!status.connected };
        if (status.connected) payload.relayLastConnectedAt = Date.now();
        if (status.lastError !== undefined) payload.relayLastError = status.lastError;
        chrome.storage.local.set(payload).catch(() => {});
      },
    });

    this.init();
  }

  init() {
    if (chrome.sidePanel?.setPanelBehavior) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));
    } else if (chrome.sidebarAction?.open && chrome.action?.onClicked) {
      chrome.action.onClicked.addListener((tab) => {
        const options = typeof tab?.windowId === 'number' ? { windowId: tab.windowId } : undefined;
        chrome.sidebarAction.open(options).catch((error) => console.error('Failed to open sidebar:', error));
      });
    }

    // Kimi API requires a coding-agent User-Agent header.
    // Chrome MV3 service workers cannot set User-Agent via fetch(),
    // so we use declarativeNetRequest to inject it at the network level.
    if (chrome.declarativeNetRequest?.updateDynamicRules) {
      chrome.declarativeNetRequest
        .updateDynamicRules({
          removeRuleIds: [9000],
          addRules: [
            {
              id: 9000,
              priority: 1,
              action: {
                type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
                requestHeaders: [
                  {
                    header: 'User-Agent',
                    operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                    value: 'coding-agent',
                  },
                ],
              },
              condition: {
                urlFilter: '||api.kimi.com',
                resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST],
              },
            },
          ],
        })
        .then(() => {
          this.kimiHeaderRuleOk = true;
        })
        .catch((e) => {
          this.kimiHeaderRuleOk = false;
          console.warn('Failed to set Kimi UA rule:', e);
        });
    } else {
      this.kimiHeaderRuleOk = false;
      console.warn('declarativeNetRequest not available; skipping Kimi UA header rule.');
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      void this.handleMessage(message, sender, sendResponse);
      return true;
    });

    void this.initRelay();
  }

  async initRelay() {
    const applyConfig = async () => {
      const stored = await chrome.storage.local.get(['relayEnabled', 'relayUrl', 'relayToken']);
      const enabled = stored.relayEnabled === true || stored.relayEnabled === 'true';
      const url = typeof stored.relayUrl === 'string' ? stored.relayUrl.trim() : '';
      const token = typeof stored.relayToken === 'string' ? stored.relayToken.trim() : '';
      this.relay.configure({ enabled, url, token });
    };

    try {
      await applyConfig();
    } catch (err) {
      console.warn('[relay] init failed:', err);
    }

    chrome.storage.onChanged.addListener((_changes, areaName) => {
      if (areaName !== 'local') return;
      void applyConfig();
    });
  }

  async handleRelayRpc(method: string, params: unknown) {
    switch (method) {
      case 'tools.list':
        return this.browserTools.getToolDefinitions();

      case 'tool.call': {
        const tool = typeof (params as any)?.tool === 'string' ? (params as any).tool : '';
        const args = (params as any)?.args;
        if (!tool) throw new Error('tool.call: missing tool');
        const safeArgs = args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, any>) : {};
        const settings = await chrome.storage.local.get(['toolPermissions', 'allowedDomains']);
        const perm = await this.checkToolPermission(tool, safeArgs, settings);
        if (!perm.allowed) {
          throw new Error(perm.reason || 'Tool blocked by policy');
        }
        return await this.browserTools.executeTool(tool, safeArgs);
      }

      case 'session.setTabs': {
        const ids = Array.isArray((params as any)?.tabIds) ? (params as any).tabIds : [];
        const tabIds = ids.map((n: any) => Number(n)).filter((n: any) => Number.isFinite(n) && n > 0);
        const tabs: chrome.tabs.Tab[] = [];
        for (const tabId of tabIds) {
          try {
            const tab = await chrome.tabs.get(tabId);
            if (tab) tabs.push(tab);
          } catch {}
        }
        await this.browserTools.configureSessionTabs(tabs, { title: 'Session', color: 'blue' });
        return { ok: true, tabIds: tabs.map((t) => t.id).filter((id): id is number => typeof id === 'number') };
      }

      case 'settings.get': {
        const keys = (params as any)?.keys;
        if (!Array.isArray(keys)) throw new Error('settings.get: keys must be an array');
        return await chrome.storage.local.get(keys);
      }

      case 'settings.set': {
        const data = (params as any)?.data;
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('settings.set: data must be an object');
        await chrome.storage.local.set(data);
        return { ok: true };
      }

      case 'agent.run': {
        const prompt = typeof (params as any)?.prompt === 'string' ? String((params as any).prompt) : '';
        if (!prompt.trim()) throw new Error('agent.run: missing prompt');
        const selectedTabIds = Array.isArray((params as any)?.selectedTabIds) ? (params as any).selectedTabIds : null;
        const sessionId = typeof (params as any)?.sessionId === 'string' ? (params as any).sessionId : `session-${Date.now()}`;
        const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const turnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        const selectedTabs: chrome.tabs.Tab[] = [];
        if (Array.isArray(selectedTabIds) && selectedTabIds.length) {
          for (const rawId of selectedTabIds) {
            const tabId = Number(rawId);
            if (!Number.isFinite(tabId) || tabId <= 0) continue;
            try {
              const tab = await chrome.tabs.get(tabId);
              if (tab) selectedTabs.push(tab);
            } catch {}
          }
        }
        if (selectedTabs.length === 0) {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (activeTab) selectedTabs.push(activeTab);
        }

        // Fire-and-forget; relay will receive runtime events and run.done.
        void this.processUserMessage(prompt, [], selectedTabs, sessionId, { runId, turnId, origin: 'relay' });

        return { runId, sessionId };
      }

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  async handleMessage(message, _sender, sendResponse) {
    try {
      switch (message.type) {
        case 'user_message': {
          const sessionId = message.sessionId || `session-${Date.now()}`;
          const userMessage = typeof message.message === 'string' ? message.message : '';
          sendResponse({ success: true, accepted: true, sessionId });
          void this.processUserMessage(userMessage, message.conversationHistory, message.selectedTabs || [], sessionId);
          break;
        }

        case 'execute_tool': {
          const result = await this.browserTools.executeTool(message.tool, message.args);
          sendResponse({ success: true, result });
          break;
        }

        case 'api_smoke_test': {
          const settings = message.settings || {};
          const prompt = typeof message.prompt === 'string' ? message.prompt : 'Reply with the word "pong" only.';
          const result = await this.runApiSmokeTest(settings, prompt);
          sendResponse({ success: true, result });
          break;
        }

        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      this.sendToSidePanel({
        type: 'error',
        message: error.message,
      });
      sendResponse({ success: false, error: error.message });
    }
  }

  async processUserMessage(
    userMessage: string,
    conversationHistory: Message[],
    selectedTabs: chrome.tabs.Tab[],
    sessionId: string,
    meta?: Partial<RunMeta> & { origin?: 'sidepanel' | 'relay' },
  ) {
    const runMeta: RunMeta = {
      runId: typeof meta?.runId === 'string' && meta.runId ? meta.runId : `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      turnId: typeof meta?.turnId === 'string' && meta.turnId ? meta.turnId : `turn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sessionId,
    };
    const origin = meta?.origin || 'sidepanel';
    if (origin === 'relay') this.relayActiveRunIds.add(runMeta.runId);

    // Reset enforcement state at the start of every turn so stale verification
    // requirements from the previous turn don't pollute the system prompt.
    this.lastBrowserAction = null;
    this.awaitingVerification = false;
    this.currentStepVerified = false;

    try {
      const settings = await chrome.storage.local.get([
        'provider',
        'apiKey',
        'model',
        'customEndpoint',
        'extraHeaders',
        'systemPrompt',
        'sendScreenshotsAsImages',
        'screenshotQuality',
        'showThinking',
        'streamResponses',
        'configs',
        'activeConfig',
        'useOrchestrator',
        'orchestratorProfile',
        'visionProfile',
        'visionBridge',
        'enableScreenshots',
        'temperature',
        'maxTokens',
        'timeout',
        'toolPermissions',
        'allowedDomains',
        'auxAgentProfiles',
      ]);

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

      if (!settings.apiKey) {
        this.sendRuntime(runMeta, {
          type: 'run_error',
          message: 'Please configure your API key in settings',
        });
        return;
      }

      this.currentSettings = settings;
      const isNewSession = this.currentSessionId !== sessionId;
      if (isNewSession) {
        this.currentSessionId = sessionId;
        this.currentPlan = null;
        this.subAgentCount = 0;
        this.subAgentProfileCursor = 0;
        this.kimiWarningSent = false;
        // Reset enforcement state
        this.lastBrowserAction = null;
        this.awaitingVerification = false;
        this.currentStepVerified = false;
      }

      try {
        await this.browserTools.configureSessionTabs(selectedTabs || [], {
          title: 'Session',
          color: 'blue',
        });
      } catch (error) {
        console.warn('Failed to configure session tabs:', error);
      }

      const activeProfileName = settings.activeConfig || 'default';
      const orchestratorProfileName = settings.orchestratorProfile || activeProfileName;
      const visionProfileName = settings.visionProfile || null;
      const orchestratorEnabled = settings.useOrchestrator === true;
      const teamProfiles = this.resolveTeamProfiles(settings);

      const activeProfile = this.resolveProfile(settings, activeProfileName);
      const orchestratorProfile = orchestratorEnabled
        ? this.resolveProfile(settings, orchestratorProfileName)
        : activeProfile;
      const visionProfile =
        settings.visionBridge !== false ? this.resolveProfile(settings, visionProfileName || activeProfileName) : null;

      const kimiInUse =
        activeProfile?.provider === 'kimi' ||
        orchestratorProfile?.provider === 'kimi' ||
        visionProfile?.provider === 'kimi';
      if (kimiInUse && !this.kimiHeaderRuleOk && !this.kimiWarningSent) {
        this.kimiWarningSent = true;
        this.sendRuntime(runMeta, {
          type: 'run_warning',
          message:
            'Kimi requires a User-Agent header. Some Chromium forks (e.g., Brave) block UA overrides, which can break requests. Try Chrome, or use a proxy that adds the header.',
        });
      }

      const tools = this.getToolsForSession(settings, orchestratorEnabled, teamProfiles);
      const streamEnabled = settings.streamResponses !== false && settings.streamResponses !== 'false';
      const showThinking = settings.showThinking !== false && settings.showThinking !== 'false';
      const enableAnthropicThinking =
        showThinking && (orchestratorProfile.provider === 'anthropic' || orchestratorProfile.provider === 'kimi');

      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const sessionTabs = this.browserTools.getSessionTabSummaries();
      const sessionTabContext = sessionTabs
        .filter((tab) => typeof tab.id === 'number')
        .map((tab) => ({
          id: tab.id as number,
          title: tab.title,
          url: tab.url,
        }));
      const workingTabId: number | null = this.browserTools.getCurrentSessionTabId() ?? activeTab?.id ?? null;
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
        showThinking,
      };

      const historyInput = Array.isArray(conversationHistory) ? conversationHistory : [];
      const trimmedUserMessage = typeof userMessage === 'string' ? userMessage.trim() : '';
      const lastMessage = historyInput[historyInput.length - 1];
      const lastContentText = typeof lastMessage?.content === 'string' ? lastMessage.content : '';
      const shouldAppendUserMessage =
        trimmedUserMessage && (!lastMessage || lastMessage.role !== 'user' || lastContentText !== userMessage);
      const normalizedHistory = normalizeConversationHistory(
        shouldAppendUserMessage ? [...historyInput, { role: 'user', content: userMessage }] : historyInput,
      );
      const model = resolveLanguageModel(orchestratorProfile);

      const toolSet = buildToolSet(tools, async (toolName, args, options) =>
        this.executeToolByName(
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
            if (isNoOutputError(error)) return fallback;
            throw error;
          }
        };

        const sendStreamStop = () => {
          if (!streamEnabled || streamStopSent) return;
          this.sendRuntime(runMeta, { type: 'assistant_stream_stop' });
          streamStopSent = true;
        };

        const sendTextDelta = (textPart: string) => {
          if (!textPart) return;
          textDeltaCount += 1;
          this.sendRuntime(runMeta, {
            type: 'assistant_stream_delta',
            content: textPart,
            channel: 'text',
          });
        };

        const sendReasoningDelta = (delta: string) => {
          if (!delta) return;
          reasoningDeltaCount += 1;
          console.debug('[Parchi] reasoning delta', delta);
          this.sendRuntime(runMeta, {
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
            sendTextDelta(text.slice(i, i + chunkSize));
            await new Promise((resolve) => setTimeout(resolve, 8));
          }
        };

        if (streamEnabled) {
          this.sendRuntime(runMeta, { type: 'assistant_stream_start' });
        }

        const result = streamText({
          model,
          system: this.enhanceSystemPrompt(orchestratorProfile.systemPrompt || '', context),
          messages: modelMessages,
          tools: toolSet,
          temperature: orchestratorProfile.temperature ?? 0.7,
          maxOutputTokens: orchestratorProfile.maxTokens ?? 4096,
          stopWhen: stepCountIs(48),
          providerOptions: enableAnthropicThinking
            ? {
                anthropic: {
                  thinking: {
                    type: 'enabled',
                    budgetTokens: Math.min(Math.max(1024, Math.floor((orchestratorProfile.maxTokens ?? 4096) * 0.5)), 16384),
                  },
                },
              }
            : undefined,
          onChunk: ({ chunk }) => {
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
                sendTextDelta(textPart || '');
              }
            } catch (error) {
              textStreamError = (error as any)?.message || String(error ?? '');
              console.warn('Streaming text error:', error);
            }
          }

          const text = await resolveText();
          const [reasoning, usage, steps, responseMessages] = await Promise.all([
            safeAwait(result.reasoningText, null),
            safeAwait(result.totalUsage as any, { inputTokens: 0, outputTokens: 0, totalTokens: 0 } as any),
            safeAwait(result.steps as any, [] as any),
            safeAwait((result as any).responseMessages as Promise<any>, [] as any),
          ]);
          const resolvedText = text || extractTextFromResponseMessages(responseMessages);

          const resolvedReasoning = showThinking
            ? reasoning || extractThinkingFromResponseMessages(responseMessages)
            : reasoning || null;

          if (resolvedReasoning) {
            console.debug('[Parchi] resolved reasoning', resolvedReasoning);
          } else {
            console.debug('[Parchi] no reasoning found for this response');
          }

          if (streamEnabled && showThinking && resolvedReasoning && reasoningDeltaCount === 0) {
            sendReasoningDelta(resolvedReasoning);
          }

          if (streamEnabled && resolvedText && textDeltaCount === 0) {
            await emitSyntheticStream(resolvedText);
          }

          if (!resolvedText && textStreamError) {
            const streamClassified = classifyApiError(new Error(textStreamError));
            const detail = streamClassified.action ? ` ${streamClassified.action}` : '';
            this.sendRuntime(runMeta, {
              type: 'run_warning',
              message: `Model produced no output. ${streamClassified.message}${detail}`,
            });
          }

          sendStreamStop();

          const normalizedUsage = {
            inputTokens: Number(usage?.inputTokens || 0),
            outputTokens: Number(usage?.outputTokens || 0),
            totalTokens: Number(usage?.totalTokens || 0),
          };

          return {
            text: resolvedText || '',
            reasoningText: resolvedReasoning || null,
            totalUsage: normalizedUsage,
            toolResults: steps.flatMap((step) => step.toolResults || []),
          };
        } catch (error) {
          sendStreamStop();
          throw error;
        }
      };

      while (true) {
        const passResult = await runModelPass(currentHistory);
        const xmlToolCalls = this.extractXmlToolCalls(passResult.text);
        toolResults = passResult.toolResults || [];

        if (xmlToolCalls.length > 0 && toolResults.length === 0 && recoveryAttempt < maxRecoveryAttempts) {
          this.sendRuntime(runMeta, {
            type: 'run_warning',
            message: 'Detected XML tool call output. Executing tools and retrying.',
          });

          const cleanedText = this.stripXmlToolCalls(passResult.text);
          const toolMessages: Message[] = [];
          const xmlToolCallEntries: ToolCall[] = [];
          for (const call of xmlToolCalls) {
            const toolCallId = `xml_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            xmlToolCallEntries.push({ id: toolCallId, name: call.name, args: call.args });
            const output = await this.executeToolByName(
              call.name,
              call.args,
              {
                runMeta,
                settings,
                visionProfile,
              },
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
            content: cleanedText || '',
            thinking: passResult.reasoningText || null,
            toolCalls: xmlToolCallEntries,
          };
          currentHistory = normalizeConversationHistory([
            ...currentHistory,
            xmlAssistantMsg,
          ]);

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

        reasoningText = passResult.reasoningText || null;
        totalUsage = passResult.totalUsage || totalUsage;
        const cleanedText = this.stripXmlToolCalls(passResult.text);
        const isValid = isValidFinalResponse(cleanedText, { allowEmpty: false });
        finalText = isValid ? cleanedText.trim() : '';

        if (!finalText) {
          const maxFinalizeAttempts = 2;

          const toolDigest = (() => {
            if (!toolResults.length) return '';
            const items = toolResults.slice(-10).map((r) => ({
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
            this.sendRuntime(runMeta, {
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

            const finalizeResult = await generateText({
              model,
              system: this.enhanceSystemPrompt(orchestratorProfile.systemPrompt || '', context),
              messages: [
                ...toModelMessages(currentHistory),
                {
                  role: 'user',
                  content: finalizePromptParts.join('\n'),
                },
              ],
              temperature: 0.2,
              maxOutputTokens: Math.min(2048, orchestratorProfile.maxTokens ?? 4096),
            });

            const candidate = String(finalizeResult.text || '').trim();
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
            this.sendRuntime(runMeta, {
              type: 'run_error',
              message: 'Model failed to produce a valid final response after retries.',
              errorCategory: 'finalize',
              action: 'Try a different model, increase maxTokens, or disable streaming if enabled.',
              recoverable: true,
            });
            return;
          }
        }

        const assistantMsg: Message = {
          role: 'assistant',
          content: finalText,
          thinking: reasoningText || null,
        };
        if (toolResults.length > 0) {
          assistantMsg.toolCalls = toolResults.map((r) => ({
            id: r.toolCallId || `tc_${Date.now()}`,
            name: r.toolName || 'tool',
            args: r.input || r.args || {},
          }));
        }
        responseMessages = [assistantMsg];
        if (toolResults.length > 0) {
          responseMessages.push({
            role: 'tool',
            content: toolResults.map((resultItem) => ({
              type: 'tool-result',
              toolCallId: resultItem.toolCallId,
              toolName: resultItem.toolName,
              output:
                resultItem.output && typeof resultItem.output === 'object'
                  ? { type: 'json', value: resultItem.output }
                  : { type: 'text', value: String(resultItem.output ?? '') },
            })),
          });
        }

        break;
      }

      this.sendRuntime(runMeta, {
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
      });

      const nextHistory = normalizeConversationHistory([...currentHistory, ...responseMessages]);
      const contextLimit = orchestratorProfile.contextLimit || settings.contextLimit || 200000;
      const compactionSettings = DEFAULT_COMPACTION_SETTINGS;
      const contextUsage = estimateContextTokens(nextHistory);
      const compactionCheck = shouldCompact({
        contextTokens: contextUsage.tokens,
        contextLimit,
        settings: compactionSettings,
      });

      if (compactionCheck.shouldCompact) {
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
        const cutIndex = findCutPoint(nextHistory, compactionStart, compactionSettings.keepRecentTokens);
        const messagesToSummarize = nextHistory.slice(compactionStart, cutIndex);
        const preserved = nextHistory.slice(cutIndex);

        if (messagesToSummarize.length > 0) {
          const conversationText = serializeConversation(messagesToSummarize);
          let promptText = `<conversation>\n${conversationText}\n</conversation>\n\n`;
          if (previousSummary) {
            promptText += `<previous-summary>\n${previousSummary}\n</previous-summary>\n\n`;
          }
          promptText += previousSummary ? UPDATE_SUMMARIZATION_PROMPT : SUMMARIZATION_PROMPT;

          const summaryResult = await generateText({
            model,
            system: SUMMARIZATION_SYSTEM_PROMPT,
            messages: [
              {
                role: 'user',
                content: promptText,
              },
            ],
            temperature: 0.2,
            maxOutputTokens: Math.floor(0.8 * compactionSettings.reserveTokens),
          });

          const summaryMessage = buildCompactionSummaryMessage(summaryResult.text, messagesToSummarize.length);
          const compaction = applyCompaction({
            summaryMessage,
            preserved,
            trimmedCount: messagesToSummarize.length,
          });
          const newSessionId = `session-${Date.now()}`;

          this.sendRuntime(runMeta, {
            type: 'context_compacted',
            summary: summaryResult.text,
            trimmedCount: messagesToSummarize.length,
            preservedCount: compaction.preservedCount,
            newSessionId,
            contextMessages: compaction.compacted,
            contextUsage: {
              approxTokens: compactionCheck.approxTokens,
              contextLimit,
              percent: Math.round(compactionCheck.percent * 100),
            },
          });
        }
      }
    } catch (error) {
      console.error('Error processing user message:', error);
      const classified = classifyApiError(error);
      let message = classified.message;
      if (classified.category === 'unknown' && APICallError.isInstance(error)) {
        const status = error.statusCode ? ` Status ${error.statusCode}.` : '';
        const body = error.responseBody ? ` Response: ${error.responseBody.slice(0, 500)}` : '';
        message = `${error.message || 'Unknown error'}${status}${body}`;
      }
      this.sendRuntime(runMeta, {
        type: 'run_error',
        message,
        errorCategory: classified.category,
        action: classified.action,
        recoverable: classified.recoverable,
      });
    } finally {
      if (origin === 'relay') this.relayActiveRunIds.delete(runMeta.runId);
    }
  }

  async runApiSmokeTest(
    settings: { provider?: string; apiKey?: string; model?: string; customEndpoint?: string; extraHeaders?: any },
    prompt: string,
  ) {
    const model = resolveLanguageModel({
      provider: settings.provider || 'openai',
      apiKey: settings.apiKey || '',
      model: settings.model || '',
      customEndpoint: settings.customEndpoint,
      extraHeaders: settings.extraHeaders,
    });

    const result = streamText({
      model,
      messages: [{ role: 'user', content: prompt }],
      maxOutputTokens: 64,
      temperature: 0,
    });

    const [text, responseMessages, usage] = await Promise.all([
      result.text,
      (result as any).responseMessages,
      result.totalUsage,
    ]);

    const fallbackText = extractTextFromResponseMessages(responseMessages);
    const resolvedText = (text || fallbackText || '').trim();

    return {
      rawText: text || '',
      fallbackText,
      resolvedText,
      usage: {
        inputTokens: Number(usage?.inputTokens || 0),
        outputTokens: Number(usage?.outputTokens || 0),
        totalTokens: Number(usage?.totalTokens || 0),
      },
    };
  }

  async executeToolByName(
    toolName: string,
    args: Record<string, any>,
    options: {
      runMeta: RunMeta;
      settings: Record<string, any>;
      visionProfile?: Record<string, any> | null;
    },
    toolCallId?: string,
  ) {
    const callId = toolCallId || `tool_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const computeCurrentStepMeta = () => {
      const steps = this.currentPlan?.steps || [];
      const currentIndex = steps.findIndex((step) => step.status !== 'done');
      if (currentIndex < 0) return {};
      const step = steps[currentIndex];
      return {
        stepIndex: currentIndex,
        stepTitle: step?.title || undefined,
      };
    };

    const sendStart = () =>
      this.sendRuntime(options.runMeta, {
        type: 'tool_execution_start',
        tool: toolName,
        id: callId,
        args,
        ...computeCurrentStepMeta(),
      });
    const sendResult = (result: unknown) =>
      this.sendRuntime(options.runMeta, {
        type: 'tool_execution_result',
        tool: toolName,
        id: callId,
        args,
        result,
        ...computeCurrentStepMeta(),
      });

    sendStart();

    if (toolName === 'set_plan') {
      const plan = this.buildPlanFromArgs(args);
      if (!plan) {
        const errorResult = {
          success: false,
          error: 'Plan must include steps array with title for each step.',
          hint: 'Example: set_plan({ steps: [{ title: "Navigate to site" }, { title: "Click login" }] })',
          received: JSON.stringify(args).slice(0, 200),
        };
        sendResult(errorResult);
        return errorResult;
      }
      this.currentPlan = plan;
      this.sendRuntime(options.runMeta, { type: 'plan_update', plan });
      const result = {
        success: true,
        plan,
        message: `Plan created with ${plan.steps.length} steps. Use update_plan({ step_index: 0, status: "done" }) after completing each step.`,
      };
      sendResult(result);
      return result;
    }

    if (toolName === 'update_plan') {
      if (!this.currentPlan) {
        const errorResult = {
          success: false,
          error: 'No active plan to update. Call set_plan first.',
          hint: 'Create a plan with set_plan({ steps: [{ title: "..." }, ...] }) before updating.',
        };
        sendResult(errorResult);
        return errorResult;
      }
      const rawIndex = args.step_index ?? args.stepIndex ?? args.step ?? args.index;
      const parsedIndex = typeof rawIndex === 'number' ? rawIndex : Number(rawIndex);
      let stepIndex = Number.isFinite(parsedIndex) ? parsedIndex : -1;
      const rawStatus = typeof args.status === 'string' ? args.status : 'done';
      const normalizedStatus = rawStatus === 'completed' || rawStatus === 'complete' ? 'done' : rawStatus;
      const status =
        normalizedStatus === 'pending' || normalizedStatus === 'done' || normalizedStatus === 'blocked'
          ? normalizedStatus
          : 'done';
      const maxIndex = this.currentPlan.steps.length - 1;
      if (stepIndex < 0 || stepIndex > maxIndex) {
        const oneBasedIndex = stepIndex - 1;
        if (oneBasedIndex >= 0 && oneBasedIndex <= maxIndex) {
          stepIndex = oneBasedIndex;
        }
      }
      if (stepIndex < 0 || stepIndex > maxIndex) {
        const errorResult = {
          success: false,
          error: `Invalid step_index: ${stepIndex}. Valid range is 0-${maxIndex}.`,
          hint: `Plan has ${this.currentPlan.steps.length} steps (indices 0 to ${maxIndex}).`,
          currentPlan: this.currentPlan.steps.map((s, i) => `${i}: ${s.title} [${s.status}]`),
        };
        sendResult(errorResult);
        return errorResult;
      }
      this.currentPlan.steps[stepIndex].status = status;
      this.currentPlan.updatedAt = Date.now();
      this.sendRuntime(options.runMeta, { type: 'plan_update', plan: this.currentPlan });
      const result = { success: true, step: stepIndex, status, plan: this.currentPlan };
      sendResult(result);
      return result;
    }

    if (toolName === 'spawn_subagent') {
      const result = await this.handleSpawnSubagent(options.runMeta, args);
      sendResult(result);
      return result;
    }

    if (toolName === 'subagent_complete') {
      const result = { success: true, ack: true, details: args || {} };
      sendResult(result);
      return result;
    }

    const available = this.browserTools?.tools ? Object.keys(this.browserTools.tools) : [];
    if (!available.includes(toolName)) {
      const errorResult = {
        success: false,
        error: `Unknown tool: ${toolName}`,
      };
      sendResult(errorResult);
      return errorResult;
    }

    const permissionCheck = await this.checkToolPermission(toolName, args);
    if (!permissionCheck.allowed) {
      const blocked = {
        success: false,
        error: permissionCheck.reason || 'Tool blocked by permissions.',
        policy: permissionCheck.policy,
      };
      sendResult(blocked);
      return blocked;
    }

    if (toolName === 'screenshot' && this.currentSettings?.enableScreenshots === false) {
      const blocked = {
        success: false,
        error: 'Screenshots are disabled in settings.',
      };
      sendResult(blocked);
      return blocked;
    }

    let result: any;
    try {
      result = await this.browserTools.executeTool(toolName, args);
    } catch (error) {
      const errorResult = {
        success: false,
        error: error?.message || String(error) || 'Tool execution failed',
      };
      sendResult(errorResult);
      return errorResult;
    }

    // Track state for enforcement
    const browserActions = ['navigate', 'click', 'type', 'scroll', 'pressKey'];
    if (browserActions.includes(toolName)) {
      this.lastBrowserAction = toolName;
      this.awaitingVerification = true;
      this.currentStepVerified = false;
    } else if (toolName === 'getContent') {
      this.awaitingVerification = false;
    }

    const finalResult = result || { error: 'No result returned' };

    if (
      toolName === 'screenshot' &&
      finalResult?.success &&
      finalResult.dataUrl &&
      this.currentSettings?.visionBridge &&
      options.visionProfile?.apiKey
    ) {
      try {
        const description = await describeImageWithModel({
          settings: {
            provider: options.visionProfile.provider,
            apiKey: options.visionProfile.apiKey,
            model: options.visionProfile.model,
            customEndpoint: options.visionProfile.customEndpoint,
          },
          dataUrl: finalResult.dataUrl,
          prompt: 'Provide a concise description of this screenshot for a non-vision model.',
        });
        finalResult.visionDescription = description;
        finalResult.message = 'Screenshot captured and described by vision model.';
        if (!this.currentSettings?.sendScreenshotsAsImages) {
          delete finalResult.dataUrl;
        }
      } catch (visionError) {
        finalResult.visionError = visionError.message;
      }
    }

    const enrichedResult = this.attachPlanToResult(finalResult, toolName);
    sendResult(enrichedResult);
    return enrichedResult;
  }

  attachPlanToResult(result: unknown, toolName: string) {
    if (!this.currentPlan || toolName === 'set_plan') return result;
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return { ...(result as Record<string, unknown>), plan: this.currentPlan };
    }
    return { result, plan: this.currentPlan };
  }

  extractXmlToolCalls(text: string): Array<{ name: string; args: Record<string, unknown>; raw: string }> {
    if (!text || typeof text !== 'string') return [];
    const results: Array<{ name: string; args: Record<string, unknown>; raw: string }> = [];
    const blocks: string[] = [];

    const blockRegex = /<\s*(?:tool|function)_call[^>]*>[\s\S]*?<\s*\/\s*(?:tool|function)_call\s*>/gi;
    let match: RegExpExecArray | null;
    while ((match = blockRegex.exec(text))) {
      blocks.push(match[0]);
    }

    const inlineRegex = /([A-Za-z0-9_]+)\s*<\s*argkey\s*>[\s\S]*?<\s*\/\s*tool_call\s*>/gi;
    while ((match = inlineRegex.exec(text))) {
      blocks.push(match[0]);
    }

    if (!blocks.length && /<\s*argkey\s*>/i.test(text)) {
      blocks.push(text);
    }

    for (const block of blocks) {
      const name = this.extractXmlToolName(block);
      if (!name) continue;
      const args = this.extractXmlArgs(block);
      results.push({ name, args, raw: block });
    }

    return results;
  }

  extractXmlToolName(block: string): string {
    const nameMatch =
      block.match(/<\s*(?:tool|function)_name\s*>([^<]+)<\s*\/\s*(?:tool|function)_name\s*>/i) ||
      block.match(/<\s*name\s*>([^<]+)<\s*\/\s*name\s*>/i) ||
      block.match(/<\s*tool\s*>([^<]+)<\s*\/\s*tool\s*>/i) ||
      block.match(/<\s*function\s*>([^<]+)<\s*\/\s*function\s*>/i) ||
      block.match(/([A-Za-z0-9_]+)\s*<\s*argkey\s*>/i);

    if (!nameMatch) return '';
    const name = nameMatch[1] ? String(nameMatch[1]) : '';
    return name.trim();
  }

  extractXmlArgs(block: string): Record<string, unknown> {
    const args: Record<string, unknown> = {};
    const pairRegex = /<\s*argkey\s*>([\s\S]*?)<\s*\/\s*argkey\s*>\s*<\s*argvalue\s*>([\s\S]*?)<\s*\/\s*argvalue\s*>/gi;
    let match: RegExpExecArray | null;
    while ((match = pairRegex.exec(block))) {
      const key = String(match[1] || '').trim();
      const value = this.coerceXmlArgValue(String(match[2] || '').trim());
      if (key) args[key] = value;
    }

    const namedRegex = /<\s*arg\s+name\s*=\s*['\"]?([^'\">]+)['\"]?\s*>([\s\S]*?)<\s*\/\s*arg\s*>/gi;
    while ((match = namedRegex.exec(block))) {
      const key = String(match[1] || '').trim();
      const value = this.coerceXmlArgValue(String(match[2] || '').trim());
      if (key) args[key] = value;
    }

    return args;
  }

  coerceXmlArgValue(value: string): unknown {
    if (!value) return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (!Number.isNaN(Number(trimmed)) && trimmed.length < 18) return Number(trimmed);
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  stripXmlToolCalls(text: string): string {
    if (!text || typeof text !== 'string') return text;
    let cleaned = text;
    cleaned = cleaned.replace(/<\s*(?:tool|function)_call[^>]*>[\s\S]*?<\s*\/\s*(?:tool|function)_call\s*>/gi, '');
    cleaned = cleaned.replace(/[A-Za-z0-9_]+\s*<\s*argkey\s*>[\s\S]*?<\s*\/\s*tool_call\s*>/gi, '');
    cleaned = cleaned.replace(/<\s*argkey\s*>[\s\S]*?<\s*\/\s*argvalue\s*>/gi, '');
    return cleaned.trim();
  }

  parsePlanSteps(text: string) {
    if (!text) return [];
    return text
      .split('\n')
      .map((line) =>
        line
          .replace(/^\s*[-*]\s*/, '')
          .replace(/^\s*\d+[.)]\s*/, '')
          .trim(),
      )
      .filter(Boolean);
  }

  buildPlanFromArgs(args: Record<string, any>) {
    const stepInput = Array.isArray(args?.steps) ? args.steps : null;
    const planText = typeof args?.plan === 'string' ? args.plan : '';
    const parsedSteps = planText ? this.parsePlanSteps(planText) : [];
    const combined = stepInput && stepInput.length ? stepInput : parsedSteps;
    if (!combined || combined.length === 0) return null;
    return buildRunPlan(combined, {
      existingPlan: this.currentPlan,
      maxSteps: 12,
    });
  }

  getToolPermissionCategory(toolName) {
    const mapping = {
      navigate: 'navigate',
      openTab: 'navigate',
      click: 'interact',
      type: 'interact',
      pressKey: 'interact',
      scroll: 'interact',
      getContent: 'read',
      screenshot: 'screenshots',
      getTabs: 'tabs',
      closeTab: 'tabs',
      switchTab: 'tabs',
      groupTabs: 'tabs',
      focusTab: 'tabs',
      describeSessionTabs: 'tabs',
    };
    return mapping[toolName] || null;
  }

  parseAllowedDomains(value = '') {
    return String(value)
      .split(/[\n,]/)
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
  }

  isUrlAllowed(url, allowlist) {
    if (!allowlist.length) return true;
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return allowlist.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    } catch (error) {
      return false;
    }
  }

  async resolveToolUrl(_toolName, args) {
    if (args?.url) return args.url;
    const tabId = args?.tabId || this.browserTools.getCurrentSessionTabId();
    try {
      if (tabId) {
        const tab = await chrome.tabs.get(tabId);
        return tab?.url || '';
      }
    } catch (error) {
      console.warn('Failed to resolve tab URL for permissions:', error);
    }
    const [active] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return active?.url || '';
  }

  async checkToolPermission(toolName, args, settingsOverride?: Record<string, any> | null) {
    const settings = settingsOverride || this.currentSettings;
    if (!settings) return { allowed: true };
    const permissions = settings.toolPermissions || {};
    const category = this.getToolPermissionCategory(toolName);
    if (category && permissions[category] === false) {
      return {
        allowed: false,
        reason: `Permission blocked: ${category}`,
        policy: {
          type: 'permission',
          category,
          reason: `Permission blocked: ${category}`,
        },
      };
    }

    if (category === 'tabs') return { allowed: true };

    const allowlist = this.parseAllowedDomains(settings.allowedDomains || '');
    if (!allowlist.length) return { allowed: true };

    const targetUrl = await this.resolveToolUrl(toolName, args);
    if (!this.isUrlAllowed(targetUrl, allowlist)) {
      return {
        allowed: false,
        reason: 'Blocked by allowed domains list.',
        policy: {
          type: 'allowlist',
          domain: targetUrl,
          reason: 'Blocked by allowed domains list.',
        },
      };
    }

    return { allowed: true };
  }

  sendRuntime(runMeta: RunMeta, payload: Record<string, unknown>) {
    const message = {
      schemaVersion: RUNTIME_MESSAGE_SCHEMA_VERSION,
      runId: runMeta.runId,
      turnId: runMeta.turnId,
      sessionId: runMeta.sessionId,
      timestamp: Date.now(),
      ...payload,
    };
    this.sendToSidePanel(message);

    if (this.relayActiveRunIds.has(runMeta.runId) && this.relay.isConnected()) {
      this.relay.notify('run.event', { runId: runMeta.runId, event: message });
      const type = typeof payload.type === 'string' ? payload.type : '';
      if (type === 'assistant_final') {
        this.relay.notify('run.done', { runId: runMeta.runId, status: 'completed', final: message });
      } else if (type === 'run_error') {
        this.relay.notify('run.done', { runId: runMeta.runId, status: 'failed', error: message });
      }
    }
  }

  sendToSidePanel(message) {
    chrome.runtime.sendMessage(message).catch((err) => {
      console.log('Side panel not open:', err);
    });
  }

  enhanceSystemPrompt(basePrompt: string, context) {
    const tabsSection =
      Array.isArray(context.availableTabs) && context.availableTabs.length
        ? `Tabs selected (${context.availableTabs.length}). You MUST only act on these tabs (session tabs). Always pass tabId from this list to navigate/click/type/pressKey/scroll/getContent/screenshot.\n${context.availableTabs
            .map((tab) => `  - [${tab.id}] ${tab.title || 'Untitled'} - ${tab.url}`)
            .join('\n')}`
        : 'No tabs selected; tools will fail until the user selects at least one tab in the UI.';
    const teamProfiles = Array.isArray(context.teamProfiles) ? context.teamProfiles : [];
    const teamSection = teamProfiles.length
      ? `Team profiles available for sub-agents:\n${teamProfiles
          .map((profile) => `  - ${profile.name}: ${profile.provider || 'provider'} · ${profile.model || 'model'}`)
          .join('\n')}\nUse spawn_subagent with a profile name to delegate parallel browser work.`
      : '';
    const orchestratorSection = context.orchestratorEnabled ? 'Orchestrator mode is enabled.' : '';
    const modelLabel = String(context.model || '').toLowerCase();
    const isKimi = context.provider === 'kimi' || modelLabel.includes('kimi');
    const thinkingSection =
      context.showThinking && isKimi
        ? '\n<thinking>\nIf you produce internal reasoning, wrap it in <analysis>...</analysis> tags. Keep it concise. Do not include the analysis in your final answer text.\n</thinking>'
        : '';

    // Build state section with enforcement - tracks exactly what model needs to do next
    let stateSection = '';
    let requiredNextCall = '';

    if (!this.currentPlan || this.currentPlan.steps.length === 0) {
      // No plan - MUST create one first
      requiredNextCall = 'set_plan({ steps: [{ title: "..." }, ...] })';
      stateSection = `
<execution_state>
⛔ NO ACTIVE PLAN

REQUIRED NEXT CALL: ${requiredNextCall}

You CANNOT call navigate, click, type, scroll, or pressKey until you call set_plan.
Create 3-6 specific action steps, then proceed.
</execution_state>`;
    } else {
      const steps = this.currentPlan.steps;
      const doneCount = steps.filter((s) => s.status === 'done').length;
      const currentIndex = steps.findIndex((s) => s.status !== 'done');
      const planLines = steps.map((step, i) => {
        const marker = step.status === 'done' ? '[✓]' : i === currentIndex ? '[→]' : '[ ]';
        return `${marker} step_index=${i}: ${step.title}`;
      });

      if (currentIndex === -1) {
        // All steps complete
        requiredNextCall = 'Provide final summary with findings';
        stateSection = `
<execution_state>
✅ ALL STEPS COMPLETE (${doneCount}/${steps.length})
${planLines.join('\n')}

REQUIRED: Provide your final summary now with evidence from getContent.
</execution_state>`;
      } else if (this.awaitingVerification) {
        // Browser action taken but getContent not called yet
        requiredNextCall = 'getContent({ mode: "text" })';
        stateSection = `
<execution_state>
PROGRESS: ${doneCount}/${steps.length} steps complete
${planLines.join('\n')}

CURRENT STEP: "${steps[currentIndex].title}"
LAST ACTION: ${this.lastBrowserAction || 'unknown'}
VERIFICATION: ⚠️ PENDING - getContent NOT called

⛔ REQUIRED NEXT CALL: ${requiredNextCall}

You MUST call getContent to verify your action before proceeding.
Do NOT call update_plan or any other tool until you call getContent.
</execution_state>`;
      } else {
        // Ready to mark step done or execute next action
        requiredNextCall = `update_plan({ step_index: ${currentIndex}, status: "done" })`;
        stateSection = `
<execution_state>
PROGRESS: ${doneCount}/${steps.length} steps complete
${planLines.join('\n')}

CURRENT STEP: "${steps[currentIndex].title}"
VERIFICATION: ✓ getContent was called

⚠️ REQUIRED NEXT CALL: ${requiredNextCall}

After marking step ${currentIndex} done, proceed to step ${currentIndex + 1}.
</execution_state>`;
      }
    }

    return `${basePrompt}
 ${stateSection}${thinkingSection}

 <browser_context>
URL: ${context.currentUrl}
Title: ${context.currentTitle}
Tab: ${context.tabId}
${tabsSection}
</browser_context>
${orchestratorSection ? `\n${orchestratorSection}` : ''}
${teamSection ? `\n${teamSection}` : ''}

<checkpoint>
Before your next tool call, verify:
□ Required next call shown above: ${requiredNextCall}
□ If awaiting verification, call getContent first
□ If step complete, call update_plan before next step
</checkpoint>`;
  }

  resolveProfile(settings: Record<string, any>, name = 'default') {
    const base = {
      provider: settings.provider,
      apiKey: settings.apiKey,
      model: settings.model,
      customEndpoint: settings.customEndpoint,
      extraHeaders: settings.extraHeaders,
      systemPrompt: settings.systemPrompt,
      sendScreenshotsAsImages: settings.sendScreenshotsAsImages,
      screenshotQuality: settings.screenshotQuality,
      showThinking: settings.showThinking,
      streamResponses: settings.streamResponses,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      timeout: settings.timeout,
      contextLimit: settings.contextLimit,
      enableScreenshots: settings.enableScreenshots,
    };
    const profile = settings.configs && settings.configs[name] ? settings.configs[name] : {};
    return { ...base, ...profile };
  }

  resolveTeamProfiles(settings: Record<string, any>) {
    const names = Array.isArray(settings.auxAgentProfiles) ? settings.auxAgentProfiles : [];
    const unique = Array.from(new Set(names)).filter(
      (name): name is string => typeof name === 'string' && name.trim().length > 0,
    );
    return unique.map((name) => {
      const profile = this.resolveProfile(settings, name);
      return {
        name,
        provider: profile.provider || '',
        model: profile.model || '',
      };
    });
  }

  getToolsForSession(
    settings: Record<string, any>,
    includeOrchestrator = false,
    teamProfiles: Array<{ name: string }> = [],
  ) {
    let tools = this.browserTools.getToolDefinitions();
    if (settings && settings.enableScreenshots === false) {
      tools = tools.filter((tool) => tool.name !== 'screenshot');
    }
    tools = tools.concat([
      {
        name: 'set_plan',
        description:
          'Set a checklist of concrete action steps to complete the task. Each step should be a single specific action (e.g., "Navigate to example.com", "Click the login button", "Extract product prices"). Avoid headers, phases, or abstract descriptions. Keep to 3-6 actionable steps. Mark steps done via update_plan as you complete them.',
        input_schema: {
          type: 'object',
          properties: {
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: {
                    type: 'string',
                    description: 'Short action description (e.g., "Search for user profile", "Extract contact info")',
                  },
                  status: {
                    type: 'string',
                    enum: ['pending', 'done'],
                    description: 'Step status - pending or done',
                  },
                },
                required: ['title'],
              },
              description: 'Ordered list of 3-6 concrete action steps. Each step = one tool call or logical action.',
            },
          },
          required: ['steps'],
        },
      },
      {
        name: 'update_plan',
        description: 'Mark a plan step as done after completing it. Call this after each step you finish.',
        input_schema: {
          type: 'object',
          properties: {
            step_index: {
              type: 'number',
              description: 'Zero-based index of the step to mark done (0 = first step)',
            },
            status: {
              type: 'string',
              enum: ['done', 'pending', 'blocked'],
              description: 'New status for the step (defaults to "done")',
            },
          },
          required: ['step_index'],
        },
      },
    ]);

    if (includeOrchestrator) {
      const teamNames = Array.isArray(teamProfiles) ? teamProfiles.map((profile) => profile.name).filter(Boolean) : [];
      const profileSchema: {
        type: string;
        description: string;
        enum?: string[];
      } = {
        type: 'string',
        description: teamNames.length
          ? `Name of saved profile to use. Available: ${teamNames.join(', ')}`
          : 'Name of saved profile to use.',
      };
      if (teamNames.length) {
        profileSchema.enum = teamNames;
      }
      tools = tools.concat([
        {
          name: 'spawn_subagent',
          description: 'Start a focused sub-agent with its own goal, prompt, and optional profile override.',
          input_schema: {
            type: 'object',
            properties: {
              profile: profileSchema,
              prompt: {
                type: 'string',
                description: 'System prompt for the sub-agent',
              },
              tasks: {
                type: 'array',
                items: { type: 'string' },
                description: 'Task list for the sub-agent',
              },
              goal: {
                type: 'string',
                description: 'Single goal string if tasks not provided',
              },
            },
          },
        },
        {
          name: 'subagent_complete',
          description: 'Sub-agent calls this when finished to return a summary payload.',
          input_schema: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              data: { type: 'object' },
            },
            required: ['summary'],
          },
        },
      ]);
    }
    return tools;
  }

  async handleSpawnSubagent(runMeta: RunMeta, args) {
    if (this.subAgentCount >= 10) {
      return {
        success: false,
        error: 'Sub-agent limit reached for this session (max 10).',
      };
    }
    this.subAgentCount += 1;
    const subagentId = `subagent-${Date.now()}-${this.subAgentCount}`;
    let profileName = args.profile || args.config;
    if (!profileName) {
      const teamProfiles = Array.isArray(this.currentSettings?.auxAgentProfiles)
        ? this.currentSettings.auxAgentProfiles
        : [];
      if (teamProfiles.length) {
        profileName = teamProfiles[this.subAgentProfileCursor % teamProfiles.length];
        this.subAgentProfileCursor += 1;
      }
    }
    if (!profileName) {
      profileName = this.currentSettings?.activeConfig || 'default';
    }
    const profileSettings = this.resolveProfile(this.currentSettings || {}, profileName);

    const subagentName = args.name || `Sub-Agent ${this.subAgentCount}`;
    this.sendRuntime(runMeta, {
      type: 'subagent_start',
      id: subagentId,
      name: subagentName,
      tasks: args.tasks || [args.goal || args.task || 'Task'],
    });

    const subAgentSystemPrompt = `${args.prompt || 'You are a focused sub-agent working under an orchestrator. Be concise and tool-driven.'}
Always cite evidence from tools. Finish by calling subagent_complete with a short summary and any structured findings.`;

    const tools = this.getToolsForSession(this.currentSettings || {}, false);
    const toolSet = buildToolSet(tools, async (toolName, toolArgs, options) =>
      this.executeToolByName(
        toolName,
        toolArgs,
        {
          runMeta,
          settings: this.currentSettings || {},
          visionProfile: null,
        },
        options.toolCallId,
      ),
    );

    const taskLines = Array.isArray(args.tasks)
      ? args.tasks.map((t, idx) => `${idx + 1}. ${t}`).join('\n')
      : args.goal || args.task || args.prompt || '';

    const subHistory: Message[] = [
      {
        role: 'user',
        content: `Task group:\n${taskLines || 'Follow the provided prompt and complete the goal.'}`,
      },
    ];

    const subModel = resolveLanguageModel(profileSettings);
    const result = streamText({
      model: subModel,
      system: subAgentSystemPrompt,
      messages: toModelMessages(subHistory),
      tools: toolSet,
      temperature: profileSettings.temperature ?? 0.4,
      maxOutputTokens: profileSettings.maxTokens ?? 1024,
      stopWhen: stepCountIs(24),
    });

    const summary = (await result.text) || 'Sub-agent finished without a final summary.';

    this.sendRuntime(runMeta, {
      type: 'subagent_complete',
      id: subagentId,
      success: true,
      summary,
    });

    return {
      success: true,
      source: 'subagent',
      id: subagentId,
      name: subagentName,
      summary,
      tasks: taskLines,
    };
  }
}

new BackgroundService();
