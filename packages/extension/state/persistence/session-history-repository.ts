export type ChatSessionEntry = {
  id: string;
  startedAt: number;
  updatedAt: number;
  title: string;
  messageCount: number;
  transcript: unknown[];
  contextTranscript?: unknown[];
  turns?: unknown[];
};

const CHAT_SESSIONS_KEY = 'chatSessions';
const MAX_CHAT_SESSIONS = 50;

export function normalizeStoredSessions(raw: unknown): ChatSessionEntry[] {
  if (Array.isArray(raw)) return raw.filter(Boolean) as ChatSessionEntry[];
  if (raw && typeof raw === 'object') return Object.values(raw).filter(Boolean) as ChatSessionEntry[];
  return [];
}

export function trimChatSessions(entries: ChatSessionEntry[], maxEntries = MAX_CHAT_SESSIONS): ChatSessionEntry[] {
  return normalizeStoredSessions(entries).slice(0, maxEntries);
}

export async function readChatSessions(): Promise<ChatSessionEntry[]> {
  const stored = await chrome.storage.local.get([CHAT_SESSIONS_KEY]);
  return normalizeStoredSessions(stored[CHAT_SESSIONS_KEY]);
}

export async function writeChatSessions(entries: ChatSessionEntry[]): Promise<ChatSessionEntry[]> {
  const trimmed = trimChatSessions(entries);
  await chrome.storage.local.set({ [CHAT_SESSIONS_KEY]: trimmed });
  return trimmed;
}

export async function upsertChatSession(entry: ChatSessionEntry): Promise<ChatSessionEntry[]> {
  const sessions = await readChatSessions();
  const filtered = sessions.filter((session) => session?.id !== entry.id);
  filtered.unshift(entry);
  return writeChatSessions(filtered);
}

export async function removeChatSession(sessionId: string): Promise<ChatSessionEntry[]> {
  const sessions = await readChatSessions();
  return writeChatSessions(sessions.filter((session) => session?.id !== sessionId));
}

export async function clearChatSessions(): Promise<ChatSessionEntry[]> {
  await chrome.storage.local.set({ [CHAT_SESSIONS_KEY]: [] });
  return [];
}

export function subscribeToChatSessionChanges(listener: (entries: ChatSessionEntry[]) => void): () => void {
  const handleChanges = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName !== 'local' || !changes[CHAT_SESSIONS_KEY]) return;
    listener(normalizeStoredSessions(changes[CHAT_SESSIONS_KEY].newValue));
  };

  chrome.storage.onChanged.addListener(handleChanges);
  return () => chrome.storage.onChanged.removeListener(handleChanges);
}
