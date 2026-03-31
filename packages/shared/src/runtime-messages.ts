export {
  RUNTIME_MESSAGE_SCHEMA_VERSION,
  runStatusPhases,
  type AssistantFinal,
  type AssistantResponse,
  type AssistantStreamDelta,
  type AssistantStreamStart,
  type AssistantStreamStop,
  type CompactionEvent,
  type ContextCompacted,
  type ReportImageCaptured,
  type ReportImagesSelection,
  type ReportImageSummary,
  type RetryCounts,
  type RunError,
  type RunPhase,
  type RunStatus,
  type RunWarning,
  type RuntimeBenchmarkContext,
  type RuntimeLatencyMetrics,
  type RuntimeMessage,
  type RuntimeMessageBase,
  type SessionTabsUpdate,
  type SubagentComplete,
  type SubagentTabAssigned,
  type SubagentStart,
  type TokenTraceEvent,
  type TokenTraceSnapshot,
  type ToolExecutionResult,
  type ToolExecutionStart,
  type UserRunStart,
  type ManualPlanUpdate,
  type PlanUpdate,
} from './runtime-message-definitions.js';
import { RUNTIME_MESSAGE_SCHEMA_VERSION, type RuntimeMessage } from './runtime-message-definitions.js';

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
  'subagent_tab_assigned',
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
