import type { RunPlan } from './plan.js';
export const RUNTIME_MESSAGE_SCHEMA_VERSION = 2 as const;

export type RuntimeMessageBase = {
  schemaVersion: typeof RUNTIME_MESSAGE_SCHEMA_VERSION;
  runId: string;
  sessionId: string;
  turnId?: string;
  timestamp: number;
};

export const runStatusPhases = ['planning', 'executing', 'finalizing', 'completed', 'stopped', 'failed'] as const;

export type RunPhase = (typeof runStatusPhases)[number];

export type RetryCounts = {
  api: number;
  tool: number;
  finalize: number;
};

export type RuntimeLatencyMetrics = {
  runStartAt: number;
  completedAt: number;
  totalMs: number;
  ttfbMs?: number;
  firstTokenMs?: number;
  stream: boolean;
  modelAttempts?: number;
};

export type RuntimeBenchmarkContext = {
  success: boolean;
  provider?: string;
  model?: string;
  route?: string;
  errorCategory?: string;
};

export type UserRunStart = RuntimeMessageBase & {
  type: 'user_run_start';
  message: string;
};

export type AssistantStreamStart = RuntimeMessageBase & {
  type: 'assistant_stream_start';
};

export type AssistantStreamDelta = RuntimeMessageBase & {
  type: 'assistant_stream_delta';
  content: string;
  channel?: 'text' | 'reasoning';
};

export type AssistantStreamStop = RuntimeMessageBase & {
  type: 'assistant_stream_stop';
};

export type ToolExecutionStart = RuntimeMessageBase & {
  type: 'tool_execution_start';
  tool: string;
  id?: string;
  args: Record<string, unknown>;
  stepIndex?: number;
  stepTitle?: string;
};

export type ToolExecutionResult = RuntimeMessageBase & {
  type: 'tool_execution_result';
  tool: string;
  id?: string;
  args?: Record<string, unknown>;
  result: unknown;
  stepIndex?: number;
  stepTitle?: string;
};

export type PlanUpdate = RuntimeMessageBase & {
  type: 'plan_update';
  plan: RunPlan;
};

export type ManualPlanUpdate = RuntimeMessageBase & {
  type: 'manual_plan_update';
  steps: Array<{
    title: string;
    status?: 'pending' | 'running' | 'done' | 'blocked';
    notes?: string;
  }>;
};

export type RunStatus = RuntimeMessageBase & {
  type: 'run_status';
  phase: RunPhase;
  attempts: RetryCounts;
  maxRetries: RetryCounts;
  lastError?: string;
  note?: string;
  stage?: string;
  source?: string;
};

export type AssistantResponse = RuntimeMessageBase & {
  type: 'assistant_response';
  content: string;
  thinking?: string | null;
  model?: string;
};

export type AssistantFinal = RuntimeMessageBase & {
  type: 'assistant_final';
  content: string;
  thinking?: string | null;
  model?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  contextUsage?: {
    approxTokens?: number;
    contextLimit?: number;
    percent?: number;
  };
  responseMessages?: Array<Record<string, unknown>>;
  latency?: RuntimeLatencyMetrics;
  benchmark?: RuntimeBenchmarkContext;
};

export type RunError = RuntimeMessageBase & {
  type: 'run_error';
  message: string;
  stage?: string;
  errorCategory?: string;
  action?: string;
  recoverable?: boolean;
  latency?: RuntimeLatencyMetrics;
  benchmark?: RuntimeBenchmarkContext;
};

export type RunWarning = RuntimeMessageBase & {
  type: 'run_warning';
  message: string;
  stage?: string;
};

type ContextUsageSnapshot = {
  approxTokens?: number;
  contextLimit?: number;
  percent?: number;
};

export type TokenTraceSnapshot = {
  providerInputTokens?: number | null;
  providerOutputTokens?: number | null;
  contextApproxTokens?: number | null;
  contextLimit?: number | null;
  contextPercent?: number | null;
  sessionInputTokens?: number;
  sessionOutputTokens?: number;
  sessionTotalTokens?: number;
};

export type TokenTraceEvent = RuntimeMessageBase & {
  type: 'token_trace';
  action: string;
  reason: string;
  note?: string;
  before?: TokenTraceSnapshot;
  after?: TokenTraceSnapshot;
  details?: Record<string, unknown>;
};

export type CompactionEvent = RuntimeMessageBase & {
  type: 'compaction_event';
  stage: 'decision' | 'start' | 'summary_request' | 'summary_result' | 'applied' | 'skipped' | 'failed' | string;
  source?: string;
  note?: string;
  details?: Record<string, unknown>;
};

export type ContextCompacted = RuntimeMessageBase & {
  type: 'context_compacted';
  source?: string;
  startFreshSession?: boolean;
  summary: string;
  trimmedCount: number;
  preservedCount: number;
  newSessionId: string;
  contextMessages: Array<Record<string, unknown>>;
  beforeContextUsage?: ContextUsageSnapshot;
  contextUsage?: ContextUsageSnapshot;
  compactionMetrics?: Record<string, unknown>;
};

export type SubagentStart = RuntimeMessageBase & {
  type: 'subagent_start';
  id: string;
  name: string;
  tasks?: string[];
  parentRunId?: string;
};

export type SessionTabsUpdate = RuntimeMessageBase & {
  type: 'session_tabs_update';
  tabs: Array<{
    id: number;
    title?: string;
    url?: string;
  }>;
  activeTabId: number | null;
  maxTabs: number;
  groupTitle?: string;
};

export type ReportImageSummary = {
  id: string;
  capturedAt: number;
  url?: string;
  title?: string;
  tabId?: number;
  visionDescription?: string;
  selected: boolean;
};

export type ReportImageCaptured = RuntimeMessageBase & {
  type: 'report_image_captured';
  image: {
    id: string;
    dataUrl: string;
    capturedAt: number;
    toolCallId?: string;
    tabId?: number;
    url?: string;
    title?: string;
    visionDescription?: string;
    selected: boolean;
  };
  images: ReportImageSummary[];
  selectedImageIds: string[];
};

export type ReportImagesSelection = RuntimeMessageBase & {
  type: 'report_images_selection';
  images: ReportImageSummary[];
  selectedImageIds: string[];
};

export type SubagentComplete = RuntimeMessageBase & {
  type: 'subagent_complete';
  id: string;
  success: boolean;
  summary?: string;
  parentRunId?: string;
};

export type RuntimeMessage =
  | UserRunStart
  | AssistantStreamStart
  | AssistantStreamDelta
  | AssistantStreamStop
  | ToolExecutionStart
  | ToolExecutionResult
  | PlanUpdate
  | ManualPlanUpdate
  | RunStatus
  | AssistantResponse
  | AssistantFinal
  | RunError
  | RunWarning
  | TokenTraceEvent
  | CompactionEvent
  | ContextCompacted
  | SubagentStart
  | ReportImageCaptured
  | ReportImagesSelection
  | SubagentComplete
  | SessionTabsUpdate;

export const runtimeMessageTypes = [
  'user_run_start',
  'assistant_stream_start',
  'assistant_stream_delta',
  'assistant_stream_stop',
  'tool_execution_start',
  'tool_execution_result',
  'plan_update',
  'manual_plan_update',
  'run_status',
  'assistant_response',
  'assistant_final',
  'run_error',
  'run_warning',
  'token_trace',
  'compaction_event',
  'context_compacted',
  'subagent_start',
  'report_image_captured',
  'report_images_selection',
  'subagent_complete',
  'session_tabs_update',
] as const;

export type RuntimeMessageType = (typeof runtimeMessageTypes)[number];

export function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as {
    type?: string;
    schemaVersion?: number;
    runId?: string;
    sessionId?: string;
    timestamp?: number;
  };
  if (message.schemaVersion !== RUNTIME_MESSAGE_SCHEMA_VERSION) return false;
  if (typeof message.type !== 'string') return false;
  if (!runtimeMessageTypes.includes(message.type as RuntimeMessageType)) return false;
  if (typeof message.runId !== 'string' || !message.runId) return false;
  if (typeof message.sessionId !== 'string' || !message.sessionId) return false;
  if (typeof message.timestamp !== 'number') return false;
  return true;
}
