import { stepCountIs, streamText } from 'ai';
import type { Message } from '../../ai/message-schema.js';
import { toModelMessages } from '../../ai/model-convert.js';
import {
  buildCodexOAuthProviderOptions,
  buildToolSet,
  isCodexOAuthProvider,
  resolveLanguageModel,
} from '../../ai/sdk-client.js';
import { injectOAuthTokens, isVisionModelProfile, resolveProfile } from '../model-profiles.js';
import type { ServiceContext } from '../service-context.js';
import type { RunMeta } from '../service-types.js';
import {
  type NestedToolExecutor,
  type ToolExecutionArgs,
  type ToolExecutionSettings,
  formatToolExecutorError,
} from './tool-executor-shared.js';

const profileUsesCodexOAuth = (profile: Record<string, unknown> | null | undefined) =>
  isCodexOAuthProvider(String(profile?.provider || ''));

const getTaskList = (args: ToolExecutionArgs) => {
  if (Array.isArray(args.tasks)) {
    const tasks = args.tasks.map((task) => String(task || '').trim()).filter(Boolean);
    if (tasks.length) return tasks;
  }
  const fallback = [args.goal, args.task, args.prompt]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .find(Boolean);
  return [fallback || 'Task'];
};

export async function handleSpawnSubagent(
  ctx: ServiceContext,
  runMeta: RunMeta,
  args: ToolExecutionArgs,
  settings: ToolExecutionSettings,
  executeTool: NestedToolExecutor,
) {
  const sessionState = ctx.getSessionState(runMeta.sessionId);
  if (sessionState.subAgentCount >= 10) {
    return { success: false, error: 'Sub-agent limit reached for this session (max 10).' };
  }

  sessionState.subAgentCount += 1;
  const subagentId = `subagent-${Date.now()}-${sessionState.subAgentCount}`;

  let profileName =
    typeof args.profile === 'string' ? args.profile : typeof args.config === 'string' ? args.config : '';
  if (!profileName) {
    const teamProfiles = Array.isArray(settings.auxAgentProfiles) ? settings.auxAgentProfiles : [];
    if (teamProfiles.length) {
      const cursor = sessionState.subAgentProfileCursor % teamProfiles.length;
      profileName = String(teamProfiles[cursor] || '');
      sessionState.subAgentProfileCursor += 1;
    }
  }
  if (!profileName) {
    profileName = typeof settings.activeConfig === 'string' ? settings.activeConfig : 'default';
  }

  const profileSettings = resolveProfile(settings, profileName);
  const subagentName =
    typeof args.name === 'string' && args.name.trim() ? args.name.trim() : `Sub-Agent ${sessionState.subAgentCount}`;
  const taskList = getTaskList(args);
  const taskLines = taskList.map((task, index) => `${index + 1}. ${task}`).join('\n');

  ctx.sendRuntime(runMeta, {
    type: 'subagent_start',
    id: subagentId,
    name: subagentName,
    tasks: taskList,
  });

  try {
    const promptText =
      typeof args.prompt === 'string' && args.prompt.trim()
        ? args.prompt.trim()
        : 'You are a focused sub-agent working under an orchestrator. Be concise and tool-driven.';
    const subAgentSystemPrompt = `${promptText}\nAlways cite evidence from tools. Finish by calling subagent_complete with a short summary and any structured findings.`;

    const tools = ctx.getToolsForSession(profileSettings, false, [], isVisionModelProfile(profileSettings));
    const toolSet = buildToolSet(tools, async (toolName, toolArgs, toolOptions) =>
      executeTool(toolName, toolArgs, { runMeta, settings, visionProfile: null }, toolOptions.toolCallId),
    );

    const subHistory: Message[] = [
      { role: 'user', content: `Task group:\n${taskLines || 'Follow the provided prompt and complete the goal.'}` },
    ];

    const resolvedSubProfile = String(profileSettings?.provider || '').endsWith('-oauth')
      ? await injectOAuthTokens(profileSettings)
      : profileSettings;
    const subModel = resolveLanguageModel(resolvedSubProfile);
    const abortSignal = ctx.activeRuns.get(runMeta.runId)?.controller.signal;
    const subagentUsesCodexOAuth = profileUsesCodexOAuth(resolvedSubProfile as Record<string, unknown> | null);
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
    } catch (error) {
      const message = formatToolExecutorError(error);
      if (message.includes('No output generated')) {
        summary = 'Sub-agent finished without generating output.';
      } else {
        throw error;
      }
    }

    ctx.sendRuntime(runMeta, { type: 'subagent_complete', id: subagentId, success: true, summary });
    return { success: true, source: 'subagent', id: subagentId, name: subagentName, summary, tasks: taskLines };
  } catch (error) {
    const errorMessage = formatToolExecutorError(error, 'Unknown error');
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
