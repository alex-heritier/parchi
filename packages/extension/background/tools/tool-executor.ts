import type { Message } from '../../ai/message-schema.js';
import {
  buildCodexOAuthProviderOptions,
  buildToolSet,
  describeImageWithModel,
  isCodexOAuthProvider,
  resolveLanguageModel,
} from '../../ai/sdk-client.js';
import { stepCountIs, streamText } from 'ai';
import { toModelMessages } from '../../ai/model-convert.js';
import { isVisionModelProfile, resolveProfile, injectOAuthTokens } from '../model-profiles.js';
import { checkToolPermission } from '../tool-permissions.js';
import {
  getReportImageSummary,
  captureReportImage,
  applyReportImageSelection,
} from '../report-images.js';
import { buildPlanFromArgs } from './xml-tool-parser.js';
import type { RunMeta, SessionState } from '../service-types.js';
import type { ServiceContext } from '../service-context.js';

const profileUsesCodexOAuth = (profile: Record<string, any> | null | undefined) =>
  isCodexOAuthProvider(String(profile?.provider || ''));

export async function executeToolByName(
  ctx: ServiceContext,
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
  if (ctx.isRunCancelled(options.runMeta.runId)) {
    return { success: false, error: 'Run stopped.' };
  }
  const sessionId = options.runMeta.sessionId;
  const sessionState = ctx.getSessionState(sessionId);
  const browserTools = ctx.getBrowserTools(sessionId);

  const computeCurrentStepMeta = () => {
    const steps = sessionState.currentPlan?.steps || [];
    const currentIndex = steps.findIndex((step) => step.status !== 'done');
    if (currentIndex < 0) return {};
    const step = steps[currentIndex];
    return { stepIndex: currentIndex, stepTitle: step?.title || undefined };
  };

  const sendStart = () =>
    ctx.sendRuntime(options.runMeta, {
      type: 'tool_execution_start',
      tool: toolName,
      id: callId,
      args,
      ...computeCurrentStepMeta(),
    });

  const sendResult = (result: unknown) =>
    ctx.sendRuntime(options.runMeta, {
      type: 'tool_execution_result',
      tool: toolName,
      id: callId,
      args,
      result,
      ...computeCurrentStepMeta(),
    });

  sendStart();

  // Built-in tools
  if (toolName === 'set_plan') {
    const hadPlan = Boolean(sessionState.currentPlan && sessionState.currentPlan.steps.length > 0);
    const plan = buildPlanFromArgs(args, sessionState.currentPlan);
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
    sessionState.currentPlan = plan;
    ctx.sendRuntime(options.runMeta, { type: 'plan_update', plan });
    const result = {
      success: true,
      plan,
      message: hadPlan
        ? `Plan extended with ${plan.steps.length} total steps. Continue with the active step and use update_plan({ step_index: 0, status: "done" }) after completing each step.`
        : `Plan created with ${plan.steps.length} steps. Use update_plan({ step_index: 0, status: "done" }) after completing each step.`,
    };
    sendResult(result);
    return result;
  }

  if (toolName === 'update_plan') {
    if (!sessionState.currentPlan) {
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
    const maxIndex = sessionState.currentPlan.steps.length - 1;
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
        hint: `Plan has ${sessionState.currentPlan.steps.length} steps (indices 0 to ${maxIndex}).`,
        currentPlan: sessionState.currentPlan.steps.map((s, i) => `${i}: ${s.title} [${s.status}]`),
      };
      sendResult(errorResult);
      return errorResult;
    }
    sessionState.currentPlan.steps[stepIndex].status = status;
    sessionState.currentPlan.updatedAt = Date.now();
    ctx.sendRuntime(options.runMeta, { type: 'plan_update', plan: sessionState.currentPlan });
    const result = { success: true, step: stepIndex, status, plan: sessionState.currentPlan };
    sendResult(result);
    return result;
  }

  if (toolName === 'spawn_subagent') {
    const result = await handleSpawnSubagent(ctx, options.runMeta, args, options.settings);
    sendResult(result);
    return result;
  }

  if (toolName === 'subagent_complete') {
    const result = { success: true, ack: true, details: args || {} };
    sendResult(result);
    return result;
  }

  if (toolName === 'list_report_images') {
    const images = getReportImageSummary(sessionState);
    const result = {
      success: true,
      images,
      selectedImageIds: Array.from(sessionState.selectedReportImageIds),
      selectedCount: sessionState.selectedReportImageIds.size,
    };
    sendResult(result);
    return result;
  }

  if (toolName === 'select_report_images') {
    const rawIds = Array.isArray(args?.imageIds) ? args.imageIds : Array.isArray(args?.ids) ? args.ids : [];
    const imageIds = rawIds
      .map((value: unknown) => String(value || '').trim())
      .filter((value: string) => value.length > 0);
    const requestedMode = String(args?.mode || '').toLowerCase();
    const mode: 'replace' | 'add' | 'remove' | 'clear' =
      requestedMode === 'add' || requestedMode === 'remove' || requestedMode === 'clear' ? requestedMode : 'replace';

    const images = applyReportImageSelection(sessionState, imageIds, mode);
    const selectedImageIds = Array.from(sessionState.selectedReportImageIds);
    ctx.sendRuntime(options.runMeta, {
      type: 'report_images_selection',
      images,
      selectedImageIds,
    });
    const result = {
      success: true,
      mode,
      selectedImageIds,
      selectedCount: selectedImageIds.length,
      images,
    };
    sendResult(result);
    return result;
  }

  const available = browserTools?.tools ? Object.keys(browserTools.tools) : [];
  if (!available.includes(toolName)) {
    const errorResult = { success: false, error: `Unknown tool: ${toolName}` };
    sendResult(errorResult);
    return errorResult;
  }

  const permissionCheck = await checkToolPermission(
    toolName,
    args,
    options.settings,
    ctx.currentSettings,
    sessionId,
    ctx.currentSessionId,
    (id) => ctx.getBrowserTools(id),
  );
  if (!permissionCheck.allowed) {
    const blocked = {
      success: false,
      error: permissionCheck.reason || 'Tool blocked by permissions.',
      policy: permissionCheck.policy,
    };
    sendResult(blocked);
    return blocked;
  }

  if (toolName === 'screenshot' && options.settings?.enableScreenshots === false) {
    const blocked = { success: false, error: 'Screenshots are disabled in settings.' };
    sendResult(blocked);
    return blocked;
  }

  let result: any;
  try {
    result = await browserTools.executeTool(toolName, args);
  } catch (error) {
    const errorResult = { success: false, error: (error as any)?.message || String(error) || 'Tool execution failed' };
    sendResult(errorResult);
    return errorResult;
  }

  const finalResult = result || { error: 'No result returned' };

  // Failure dedup
  const failureKey = `${toolName}:${args?.selector || args?.url || ''}`;
  if (finalResult.success === false || finalResult.error) {
    const tracker = sessionState.failureTracker || new Map();
    sessionState.failureTracker = tracker;
    const existing = tracker.get(failureKey) || { count: 0, lastError: '' };
    existing.count++;
    existing.lastError = String(finalResult.error || '');
    tracker.set(failureKey, existing);
    if (tracker.size > 250) {
      const overflow = tracker.size - 250;
      const keys = tracker.keys();
      for (let i = 0; i < overflow; i += 1) {
        const key = keys.next().value;
        if (key === undefined) break;
        tracker.delete(key);
      }
    }
    if (existing.count >= 3) {
      finalResult._failureAdvice = `This tool+target has failed ${existing.count} times. Try a fundamentally different approach (different selector, different strategy, or skip this step).`;
    }
  } else {
    sessionState.failureTracker?.delete(failureKey);
  }

  // Broadcast session tab state after tab-modifying tools
  const tabModifyingTools = ['openTab', 'closeTab', 'navigate', 'switchTab', 'focusTab'];
  if (tabModifyingTools.includes(toolName)) {
    const state = browserTools.getSessionState();
    ctx.sendRuntime(options.runMeta, {
      type: 'session_tabs_update',
      tabs: state.tabs,
      activeTabId: state.activeTabId,
      maxTabs: state.maxTabs,
      groupTitle: state.groupTitle,
    });
  }

  // Track state for enforcement
  const browserActions = ['navigate', 'click', 'type', 'scroll', 'pressKey'];
  if (browserActions.includes(toolName) && finalResult?.success !== false) {
    sessionState.lastBrowserAction = toolName;
    sessionState.awaitingVerification = true;
    sessionState.currentStepVerified = false;
  } else if (toolName === 'getContent') {
    sessionState.awaitingVerification = false;
    sessionState.currentStepVerified = true;
  }

  // Screenshot handling with vision bridge
  if (toolName === 'screenshot' && finalResult?.success && finalResult.dataUrl) {
    if (options.settings?.visionBridge && options.visionProfile?.apiKey) {
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
      } catch (visionError: any) {
        finalResult.visionError = visionError.message;
      }
    }

    const reportImage = captureReportImage(sessionState, finalResult, args, callId);
    if (reportImage) {
      const imagePayload = {
        id: reportImage.id,
        dataUrl: reportImage.dataUrl,
        capturedAt: reportImage.capturedAt,
        toolCallId: reportImage.toolCallId,
        tabId: reportImage.tabId,
        url: reportImage.url,
        title: reportImage.title,
        visionDescription: reportImage.visionDescription,
        selected: sessionState.selectedReportImageIds.has(reportImage.id),
      };
      ctx.sendRuntime(options.runMeta, {
        type: 'report_image_captured',
        image: imagePayload,
        images: getReportImageSummary(sessionState),
        selectedImageIds: Array.from(sessionState.selectedReportImageIds),
      });
      finalResult.reportImageId = reportImage.id;
    }

    if (!options.settings?.sendScreenshotsAsImages) {
      delete finalResult.dataUrl;
    }
  }

  // Video frame analysis
  if (
    toolName === 'watchVideo' &&
    finalResult?.success &&
    finalResult.frames &&
    finalResult.frames.length > 0 &&
    options.settings?.visionBridge &&
    options.visionProfile?.apiKey
  ) {
    try {
      const frames = finalResult.frames as Array<{ time: number; timeFormatted: string; dataUrl: string }>;
      const question =
        finalResult.question || 'What is happening in this video? Describe the content, actions, and any important details.';

      const frameDescriptions: string[] = [];
      const maxFrames = Math.min(frames.length, 8);
      const step = frames.length > maxFrames ? Math.floor(frames.length / maxFrames) : 1;

      for (let i = 0; i < frames.length && frameDescriptions.length < maxFrames; i += step) {
        const frame = frames[i];
        try {
          const description = await describeImageWithModel({
            settings: {
              provider: options.visionProfile.provider,
              apiKey: options.visionProfile.apiKey,
              model: options.visionProfile.model,
              customEndpoint: options.visionProfile.customEndpoint,
            },
            dataUrl: frame.dataUrl,
            prompt: `At timestamp ${frame.timeFormatted}: Describe what you see in this video frame.`,
            maxTokens: 256,
          });
          frameDescriptions.push(`[${frame.timeFormatted}] ${description}`);
        } catch (frameError: any) {
          frameDescriptions.push(`[${frame.timeFormatted}] (Failed to analyze frame: ${frameError.message})`);
        }
      }

      const fullDescription = await describeImageWithModel({
        settings: {
          provider: options.visionProfile.provider,
          apiKey: options.visionProfile.apiKey,
          model: options.visionProfile.model,
          customEndpoint: options.visionProfile.customEndpoint,
        },
        dataUrl: frames[0].dataUrl,
        prompt: `Based on these frame-by-frame descriptions from a video:\n\n${frameDescriptions.join('\n\n')}\n\n${question}\n\nProvide a coherent summary of what happens in the video.`,
        maxTokens: 1024,
      });

      finalResult.analysis = fullDescription;
      finalResult.frameDescriptions = frameDescriptions;
      finalResult.analyzedFrameCount = frameDescriptions.length;
      finalResult.message = `Analyzed ${frameDescriptions.length} frames from video.`;
      delete finalResult.frames;
    } catch (visionError: any) {
      finalResult.visionError = visionError.message;
      finalResult.message = `Video frames captured but analysis failed: ${visionError.message}`;
    }
  } else if (toolName === 'watchVideo' && finalResult?.success && finalResult.frames) {
    finalResult.message = `Captured ${finalResult.frames.length} video frames. Configure a vision profile to enable automatic analysis.`;
  }

  const enrichedResult = attachPlanToResult(finalResult, toolName, sessionState);
  sendResult(enrichedResult);
  return enrichedResult;
}

function attachPlanToResult(result: unknown, toolName: string, sessionState: SessionState) {
  if (!sessionState.currentPlan || toolName === 'set_plan') return result;
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    return { ...(result as Record<string, unknown>), plan: sessionState.currentPlan };
  }
  return { result, plan: sessionState.currentPlan };
}

async function handleSpawnSubagent(
  ctx: ServiceContext,
  runMeta: RunMeta,
  args: any,
  settings: Record<string, any>,
) {
  const sessionState = ctx.getSessionState(runMeta.sessionId);
  if (sessionState.subAgentCount >= 10) {
    return { success: false, error: 'Sub-agent limit reached for this session (max 10).' };
  }
  sessionState.subAgentCount += 1;
  const subagentId = `subagent-${Date.now()}-${sessionState.subAgentCount}`;
  let profileName = args.profile || args.config;
  if (!profileName) {
    const teamProfiles = Array.isArray(settings?.auxAgentProfiles) ? settings.auxAgentProfiles : [];
    if (teamProfiles.length) {
      profileName = teamProfiles[sessionState.subAgentProfileCursor % teamProfiles.length];
      sessionState.subAgentProfileCursor += 1;
    }
  }
  if (!profileName) {
    profileName = settings?.activeConfig || 'default';
  }
  const profileSettings = resolveProfile(settings || {}, profileName);

  const subagentName = args.name || `Sub-Agent ${sessionState.subAgentCount}`;
  ctx.sendRuntime(runMeta, {
    type: 'subagent_start',
    id: subagentId,
    name: subagentName,
    tasks: args.tasks || [args.goal || args.task || 'Task'],
  });

  try {
    const subAgentSystemPrompt = `${args.prompt || 'You are a focused sub-agent working under an orchestrator. Be concise and tool-driven.'}
Always cite evidence from tools. Finish by calling subagent_complete with a short summary and any structured findings.`;

    const tools = ctx.getToolsForSession(profileSettings, false, [], isVisionModelProfile(profileSettings));
    const toolSet = buildToolSet(tools, async (toolName, toolArgs, options) =>
      executeToolByName(
        ctx,
        toolName,
        toolArgs,
        { runMeta, settings: settings || {}, visionProfile: null },
        options.toolCallId,
      ),
    );

    const taskLines = Array.isArray(args.tasks)
      ? args.tasks.map((t: string, idx: number) => `${idx + 1}. ${t}`).join('\n')
      : args.goal || args.task || args.prompt || '';

    const subHistory: Message[] = [
      { role: 'user', content: `Task group:\n${taskLines || 'Follow the provided prompt and complete the goal.'}` },
    ];

    const resolvedSubProfile = String(profileSettings?.provider || '').endsWith('-oauth')
      ? await injectOAuthTokens(profileSettings)
      : profileSettings;
    const subModel = resolveLanguageModel(resolvedSubProfile);
    const abortSignal = ctx.activeRuns.get(runMeta.runId)?.controller.signal;
    const subagentUsesCodexOAuth = profileUsesCodexOAuth(resolvedSubProfile as any);
    const result = streamText({
      model: subModel,
      system: subAgentSystemPrompt,
      messages: toModelMessages(subHistory),
      tools: toolSet,
      abortSignal,
      temperature: profileSettings.temperature ?? 0.4,
      maxOutputTokens: subagentUsesCodexOAuth ? undefined : (profileSettings.maxTokens ?? 1024),
      providerOptions: subagentUsesCodexOAuth ? buildCodexOAuthProviderOptions(subAgentSystemPrompt) : undefined,
      stopWhen: stepCountIs(24),
    });

    let summary: string;
    try {
      summary = (await result.text) || 'Sub-agent finished without a final summary.';
    } catch (textError: any) {
      const message = textError?.message || String(textError ?? '');
      if (typeof message === 'string' && message.includes('No output generated')) {
        summary = 'Sub-agent finished without generating output.';
      } else {
        throw textError;
      }
    }

    ctx.sendRuntime(runMeta, { type: 'subagent_complete', id: subagentId, success: true, summary });
    return { success: true, source: 'subagent', id: subagentId, name: subagentName, summary, tasks: taskLines };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    console.error('[subagent] Error:', error);
    ctx.sendRuntime(runMeta, {
      type: 'subagent_complete',
      id: subagentId,
      success: false,
      summary: `Sub-agent failed: ${errorMessage}`,
    });
    return {
      success: false,
      source: 'subagent',
      id: subagentId,
      name: subagentName,
      error: errorMessage,
      summary: `Sub-agent failed: ${errorMessage}`,
    };
  }
}
