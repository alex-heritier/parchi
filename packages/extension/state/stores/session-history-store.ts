import { createStore } from '../core/store.js';
import {
  type ChatSessionEntry,
  clearChatSessions,
  readChatSessions,
  removeChatSession,
  subscribeToChatSessionChanges,
  upsertChatSession,
} from '../persistence/session-history-repository.js';

export type SessionHistoryStoreState = {
  hydrated: boolean;
  sessions: ChatSessionEntry[];
};

const sessionHistoryStore = createStore<SessionHistoryStoreState>({
  hydrated: false,
  sessions: [],
});

let hydrationPromise: Promise<ChatSessionEntry[]> | null = null;
let stopSync: (() => void) | null = null;

export function getSessionHistoryEntries(): ChatSessionEntry[] {
  return sessionHistoryStore.getState().sessions;
}

export function startSessionHistoryStoreSync(): () => void {
  if (stopSync) return stopSync;
  stopSync = subscribeToChatSessionChanges((sessions) => {
    sessionHistoryStore.setState({ hydrated: true, sessions });
  });
  return stopSync;
}

export async function hydrateSessionHistoryStore(): Promise<ChatSessionEntry[]> {
  if (sessionHistoryStore.getState().hydrated) return sessionHistoryStore.getState().sessions;
  if (hydrationPromise) return hydrationPromise;

  hydrationPromise = readChatSessions()
    .then((sessions) => {
      sessionHistoryStore.setState({ hydrated: true, sessions });
      return sessions;
    })
    .finally(() => {
      hydrationPromise = null;
    });

  return hydrationPromise;
}

export async function upsertSessionHistoryEntry(entry: ChatSessionEntry): Promise<ChatSessionEntry[]> {
  const sessions = await upsertChatSession(entry);
  sessionHistoryStore.setState({ hydrated: true, sessions });
  return sessions;
}

export async function deleteSessionHistoryEntry(sessionId: string): Promise<ChatSessionEntry[]> {
  const sessions = await removeChatSession(sessionId);
  sessionHistoryStore.setState({ hydrated: true, sessions });
  return sessions;
}

export async function clearSessionHistoryStore(): Promise<ChatSessionEntry[]> {
  const sessions = await clearChatSessions();
  sessionHistoryStore.setState({ hydrated: true, sessions });
  return sessions;
}
