import type { AtomicSkill, ComposedSkill, RecordingEvent } from '../../../../shared/src/recording.js';

/**
 * Map a single RecordingEvent to an AtomicSkill (or null if not actionable).
 */
export function eventToAtomicSkill(event: RecordingEvent): AtomicSkill | null {
  switch (event.type) {
    case 'click':
      if (!event.selector) return null;
      return {
        tool: 'click',
        args: {
          selector: event.selector,
          ...(event.textContent ? { textHint: event.textContent.slice(0, 40) } : {}),
        },
      };

    case 'input':
      if (!event.selector) return null;
      return {
        tool: 'type',
        args: {
          selector: event.selector,
          text: event.placeholder ? `[${event.placeholder}]` : '[user input]',
        },
      };

    case 'navigation':
      if (!event.toUrl) return null;
      return {
        tool: 'navigate',
        args: { url: event.toUrl },
      };

    case 'scroll':
      return {
        tool: 'scroll',
        args: {
          direction: event.direction || 'down',
          amount: 3,
        },
      };

    case 'dom_mutation':
      // Informational only — not actionable
      return null;

    default:
      return null;
  }
}

/**
 * Map an array of RecordingEvents to AtomicSkill steps, filtering out non-actionable events.
 */
export function eventsToSkillSteps(events: RecordingEvent[]): AtomicSkill[] {
  const steps: AtomicSkill[] = [];
  for (const event of events) {
    const skill = eventToAtomicSkill(event);
    if (skill) steps.push(skill);
  }
  return steps;
}

/**
 * Derive skill metadata (name, description, sitePattern) from a set of events.
 */
export function deriveSkillMetadata(events: RecordingEvent[]): {
  name: string;
  description: string;
  sitePattern: string;
} {
  // Count hostnames to find the dominant one
  const hostCounts = new Map<string, number>();
  for (const ev of events) {
    const url = ev.url || ev.toUrl || '';
    try {
      const hostname = new URL(url).hostname;
      hostCounts.set(hostname, (hostCounts.get(hostname) || 0) + 1);
    } catch { /* ignore */ }
  }

  let dominantHost = '';
  let maxCount = 0;
  for (const [host, count] of hostCounts) {
    if (count > maxCount) {
      dominantHost = host;
      maxCount = count;
    }
  }

  // Derive name from first click's textContent or hostname
  const firstClick = events.find(e => e.type === 'click' && e.textContent?.trim());
  const name = firstClick?.textContent
    ? firstClick.textContent.trim().slice(0, 30).toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')
    : dominantHost.replace(/\./g, '-') || 'recorded-skill';

  const actionCount = events.filter(e => e.type !== 'dom_mutation').length;
  const description = `Recorded ${actionCount} action${actionCount !== 1 ? 's' : ''} on ${dominantHost || 'unknown site'}`;
  const sitePattern = dominantHost ? `${dominantHost}*` : '';

  return { name, description, sitePattern };
}

/**
 * Build a complete ComposedSkill from events + metadata.
 */
export function buildSkillFromEvents(
  events: RecordingEvent[],
  sessionId?: string,
): ComposedSkill {
  const steps = eventsToSkillSteps(events);
  const meta = deriveSkillMetadata(events);

  return {
    id: crypto.randomUUID(),
    name: meta.name,
    description: meta.description,
    sitePattern: meta.sitePattern,
    steps,
    positiveExamples: [],
    negativeExamples: [],
    createdAt: Date.now(),
    sourceSessionId: sessionId,
    successCount: 0,
    failureCount: 0,
  };
}
