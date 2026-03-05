export function getElementInfo(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return null;

  const rect = element.getBoundingClientRect();
  const typedElement = element as HTMLElement & { value?: string; type?: string };
  return {
    tagName: element.tagName,
    id: element.id,
    className: element.className,
    textContent: element.textContent?.substring(0, 200),
    value: typedElement.value,
    type: typedElement.type,
    position: {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    },
    visible: isElementVisible(element),
    attributes: Array.from(element.attributes).reduce<Record<string, string>>((acc, attr) => {
      acc[attr.name] = attr.value;
      return acc;
    }, {}),
  };
}

export function isElementVisible(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  return (
    style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && element.offsetParent !== null
  );
}
