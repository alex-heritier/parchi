import type { RunPlan } from '@parchi/shared';

export type RunMeta = {
  runId: string;
  turnId: string;
  sessionId: string;
};

export type ReportImage = {
  id: string;
  dataUrl: string;
  byteSize: number;
  capturedAt: number;
  toolCallId?: string;
  tabId?: number;
  url?: string;
  title?: string;
  visionDescription?: string;
};

export type SessionState = {
  sessionId: string;
  currentPlan: RunPlan | null;
  subAgentCount: number;
  subAgentProfileCursor: number;
  lastBrowserAction: string | null;
  awaitingVerification: boolean;
  currentStepVerified: boolean;
  kimiWarningSent: boolean;
  failureTracker: Map<string, { count: number; lastError: string }>;
  reportImages: ReportImage[];
  reportImageBytes: number;
  selectedReportImageIds: Set<string>;
};
