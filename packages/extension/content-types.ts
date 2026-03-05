export type HighlightEntry = {
  element: HTMLElement;
  originalOutline: string;
  originalOutlineOffset: string;
};

export type OverlayState = {
  root: HTMLElement | null;
  toast: HTMLElement | null;
  target: HTMLElement | null;
  label: HTMLElement | null;
  styleEl: HTMLStyleElement | null;
  cleanupTimer: number | null;
  trackTimer: number | null;
  trackedElement: HTMLElement | null;
  trackingStartedAt: number | null;
};

export function createOverlayState(): OverlayState {
  return {
    root: null,
    toast: null,
    target: null,
    label: null,
    styleEl: null,
    cleanupTimer: null,
    trackTimer: null,
    trackedElement: null,
    trackingStartedAt: null,
  };
}
