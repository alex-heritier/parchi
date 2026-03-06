export type StoreListener<T> = (state: T, previousState: T) => void;
export type StoreUpdater<T> = T | ((state: T) => T);

export type Store<T> = {
  getState(): T;
  setState(next: StoreUpdater<T>): T;
  subscribe(listener: StoreListener<T>): () => void;
};

export function createStore<T>(initialState: T): Store<T> {
  let state = initialState;
  const listeners = new Set<StoreListener<T>>();

  return {
    getState() {
      return state;
    },

    setState(next) {
      const previousState = state;
      const resolvedState = typeof next === 'function' ? (next as (state: T) => T)(state) : next;
      state = resolvedState;
      if (Object.is(previousState, resolvedState)) {
        return state;
      }
      for (const listener of listeners) {
        listener(state, previousState);
      }
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
