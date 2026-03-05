import type { HighlightEntry } from './content-types.js';

export function highlightElement(highlightedElements: Set<HighlightEntry>, selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return;

  const originalOutline = element.style.outline;
  const originalOutlineOffset = element.style.outlineOffset;
  element.style.outline = '3px solid #4f46e5';
  element.style.outlineOffset = '2px';

  highlightedElements.add({
    element,
    originalOutline,
    originalOutlineOffset,
  });

  setTimeout(() => {
    element.style.outline = originalOutline;
    element.style.outlineOffset = originalOutlineOffset;
  }, 3000);
}

export function unhighlightAll(highlightedElements: Set<HighlightEntry>) {
  highlightedElements.forEach(({ element, originalOutline, originalOutlineOffset }) => {
    element.style.outline = originalOutline;
    element.style.outlineOffset = originalOutlineOffset;
  });
  highlightedElements.clear();
}
