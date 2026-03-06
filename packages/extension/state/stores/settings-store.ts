import { createStore } from '../core/store.js';
import {
  type SettingsSnapshot,
  createSettingsExportPayload,
  mergeSettingsSnapshot,
  patchSettingsSnapshot as persistSettingsPatch,
  readSettingsSnapshot,
  sanitizeImportedSettings,
  subscribeToSettingsChanges,
  writeSettingsSnapshot,
} from '../persistence/settings-repository.js';

export type SettingsStoreState = {
  status: 'idle' | 'hydrating' | 'ready';
  snapshot: SettingsSnapshot;
};

const settingsStore = createStore<SettingsStoreState>({
  status: 'idle',
  snapshot: {},
});

let hydrationPromise: Promise<SettingsSnapshot> | null = null;
let stopSync: (() => void) | null = null;

export function getSettingsStoreSnapshot(): SettingsSnapshot {
  return settingsStore.getState().snapshot;
}

export function subscribeToSettingsStore(
  listener: (state: SettingsStoreState, previousState: SettingsStoreState) => void,
) {
  return settingsStore.subscribe(listener);
}

export function startSettingsStoreSync(): () => void {
  if (stopSync) return stopSync;
  stopSync = subscribeToSettingsChanges((patch) => {
    settingsStore.setState((current) => ({
      status: 'ready',
      snapshot: mergeSettingsSnapshot(current.snapshot, patch),
    }));
  });
  return stopSync;
}

export async function hydrateSettingsStore(): Promise<SettingsSnapshot> {
  if (settingsStore.getState().status === 'ready') return settingsStore.getState().snapshot;
  if (hydrationPromise) return hydrationPromise;

  settingsStore.setState((current) => ({ ...current, status: 'hydrating' }));
  hydrationPromise = readSettingsSnapshot()
    .then((snapshot) => {
      settingsStore.setState({ status: 'ready', snapshot });
      return snapshot;
    })
    .finally(() => {
      hydrationPromise = null;
    });

  return hydrationPromise;
}

export async function replaceSettingsStoreSnapshot(snapshot: SettingsSnapshot): Promise<SettingsSnapshot> {
  const next = await writeSettingsSnapshot(snapshot);
  settingsStore.setState({ status: 'ready', snapshot: next });
  return next;
}

export async function patchSettingsStoreSnapshot(patch: SettingsSnapshot): Promise<SettingsSnapshot> {
  const nextPatch = await persistSettingsPatch(patch);
  return settingsStore.setState((current) => ({
    status: 'ready',
    snapshot: mergeSettingsSnapshot(current.snapshot, nextPatch),
  })).snapshot;
}

export function buildSettingsStoreExport(snapshot = getSettingsStoreSnapshot()): SettingsSnapshot {
  return createSettingsExportPayload(snapshot);
}

export async function importSettingsToStore(input: unknown): Promise<SettingsSnapshot> {
  return replaceSettingsStoreSnapshot(sanitizeImportedSettings(input));
}
