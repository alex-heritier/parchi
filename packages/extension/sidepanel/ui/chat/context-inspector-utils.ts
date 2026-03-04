export const formatClockTime = (timestamp: number) => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '--:--';
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
};

export const toFiniteNumber = (value: unknown): number | null => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

export const toPlainObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

export const compactionStageLabel = (stage: string) => {
  switch (stage) {
    case 'provider_detected':
      return 'Provider detected';
    case 'decision':
      return 'Decision';
    case 'start':
      return 'Started';
    case 'summary_request':
      return 'Summary request';
    case 'summary_result':
      return 'Summary ready';
    case 'applied':
      return 'Applied';
    case 'skipped':
      return 'Skipped';
    case 'failed':
      return 'Failed';
    default:
      return stage ? stage.replace(/_/g, ' ') : 'Event';
  }
};
