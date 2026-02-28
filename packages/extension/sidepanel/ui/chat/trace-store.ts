/**
 * IndexedDB-backed trace store for session events.
 * Each tool execution, message, and plan update is stored as an individual
 * record keyed by auto-incrementing ID with a sessionId index for fast
 * per-session retrieval. This keeps writes O(1) and reads O(n) where n is
 * the number of events in a single session.
 */

const DB_NAME = 'parchi-traces';
const DB_VERSION = 1;
const STORE = 'events';

let _db: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return _db;
  _db = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { autoIncrement: true });
        store.createIndex('sessionId', 'sessionId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      _db = null;
      reject(req.error);
    };
  });
  return _db;
}

export interface TraceEvent {
  sessionId: string;
  ts: number;
  kind: 'tool_start' | 'tool_result' | 'user_message' | 'assistant_final' | 'plan_update';
  tool?: string;
  toolId?: string;
  args?: unknown;
  result?: unknown;
  content?: string;
  thinking?: string | null;
  model?: string | null;
  usage?: Record<string, unknown> | null;
  plan?: unknown;
  stepIndex?: number;
  stepTitle?: string;
}

/** Append a single event — fast write, no read-modify-write. */
export async function appendTrace(event: TraceEvent): Promise<void> {
  try {
    const db = await openDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).add(event);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Silently ignore storage failures — export still works from memory
  }
}

/** Read all events for a session, ordered by insertion. */
export async function getSessionTraces(sessionId: string): Promise<TraceEvent[]> {
  try {
    const db = await openDb();
    return new Promise<TraceEvent[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const idx = tx.objectStore(STORE).index('sessionId');
      const req = idx.getAll(sessionId);
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/** Delete all events for a session. */
export async function clearSessionTraces(sessionId: string): Promise<void> {
  try {
    const db = await openDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const idx = tx.objectStore(STORE).index('sessionId');
      const req = idx.openCursor(sessionId);
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore
  }
}

/** Delete all events older than `maxAgeMs` (default 7 days). */
export async function pruneOldTraces(maxAgeMs = 7 * 24 * 60 * 60 * 1000): Promise<void> {
  try {
    const cutoff = Date.now() - maxAgeMs;
    const db = await openDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          const event = cursor.value as TraceEvent;
          if (event.ts < cutoff) {
            cursor.delete();
          }
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore
  }
}
