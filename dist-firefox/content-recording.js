"use strict";
(() => {
  // packages/extension/content-recording.ts
  (() => {
    if (window.__parchiRecording) return;
    window.__parchiRecording = true;
    const OVERLAY_ROOT_ID = "parchi-overlay-root";
    const SCROLL_THROTTLE_MS = 1e3;
    const SCROLL_DELTA_MIN = 200;
    const MUTATION_DEBOUNCE_MS = 500;
    let lastScrollY = window.scrollY;
    let lastScrollTime = 0;
    let mutationBatchTimer = null;
    let mutationBatch = { added: 0, removed: 0, attributes: 0, target: "" };
    const isInsideOverlay = (el) => {
      if (!el) return false;
      return !!el.closest(`#${OVERLAY_ROOT_ID}`);
    };
    const getSelector = (el) => {
      if (el.id) return `#${el.id}`;
      const tag = el.tagName.toLowerCase();
      const cls = Array.from(el.classList).slice(0, 2).join(".");
      return cls ? `${tag}.${cls}` : tag;
    };
    const sendEvent = (event) => {
      try {
        chrome.runtime.sendMessage({ type: "recording_event", event });
      } catch {
      }
    };
    const buildBase = (type) => ({
      type,
      timestamp: Date.now(),
      url: location.href
    });
    const onClickCapture = (e) => {
      const target = e.target;
      if (!target || isInsideOverlay(target)) return;
      const ev = buildBase("click");
      ev.selector = getSelector(target);
      ev.tagName = target.tagName.toLowerCase();
      ev.textContent = (target.textContent || "").trim().slice(0, 100);
      ev.position = { x: Math.round(e.clientX), y: Math.round(e.clientY) };
      sendEvent(ev);
    };
    const onScroll = () => {
      const now = Date.now();
      if (now - lastScrollTime < SCROLL_THROTTLE_MS) return;
      const currentY = window.scrollY;
      const delta = currentY - lastScrollY;
      if (Math.abs(delta) < SCROLL_DELTA_MIN) return;
      lastScrollTime = now;
      const ev = buildBase("scroll");
      ev.scrollY = Math.round(currentY);
      ev.direction = delta > 0 ? "down" : "up";
      lastScrollY = currentY;
      sendEvent(ev);
    };
    const onInputCapture = (e) => {
      const target = e.target;
      if (!target || isInsideOverlay(target)) return;
      const ev = buildBase("input");
      ev.selector = getSelector(target);
      ev.tagName = target.tagName.toLowerCase();
      ev.inputType = target.type || "text";
      ev.placeholder = (target.placeholder || "").slice(0, 100);
      sendEvent(ev);
    };
    const flushMutations = () => {
      if (mutationBatch.added === 0 && mutationBatch.removed === 0 && mutationBatch.attributes === 0) return;
      const ev = buildBase("dom_mutation");
      ev.summary = `+${mutationBatch.added} nodes, -${mutationBatch.removed} nodes, ${mutationBatch.attributes} attr changes in ${mutationBatch.target}`;
      ev.addedCount = mutationBatch.added;
      ev.removedCount = mutationBatch.removed;
      ev.attributeChanges = mutationBatch.attributes;
      sendEvent(ev);
      mutationBatch = { added: 0, removed: 0, attributes: 0, target: "" };
    };
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (isInsideOverlay(m.target)) continue;
        if (m.type === "childList") {
          mutationBatch.added += m.addedNodes.length;
          mutationBatch.removed += m.removedNodes.length;
        } else if (m.type === "attributes") {
          mutationBatch.attributes += 1;
        }
        if (!mutationBatch.target && m.target instanceof Element) {
          mutationBatch.target = getSelector(m.target);
        }
      }
      if (mutationBatchTimer) clearTimeout(mutationBatchTimer);
      mutationBatchTimer = setTimeout(flushMutations, MUTATION_DEBOUNCE_MS);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    });
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    const onNavigation = (fromUrl, toUrl, trigger) => {
      if (fromUrl === toUrl) return;
      const ev = buildBase("navigation");
      ev.fromUrl = fromUrl;
      ev.toUrl = toUrl;
      ev.trigger = trigger;
      sendEvent(ev);
    };
    history.pushState = function(...args) {
      const from = location.href;
      originalPushState.apply(this, args);
      onNavigation(from, location.href, "pushState");
    };
    history.replaceState = function(...args) {
      const from = location.href;
      originalReplaceState.apply(this, args);
      onNavigation(from, location.href, "replaceState");
    };
    const onPopState = () => {
      onNavigation("", location.href, "popstate");
    };
    document.addEventListener("click", onClickCapture, { capture: true });
    document.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("input", onInputCapture, { capture: true });
    window.addEventListener("popstate", onPopState);
    const onMessage = (message) => {
      if (message?.type === "recording_content_stop") {
        cleanup();
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    const cleanup = () => {
      document.removeEventListener("click", onClickCapture, { capture: true });
      document.removeEventListener("scroll", onScroll);
      document.removeEventListener("input", onInputCapture, { capture: true });
      window.removeEventListener("popstate", onPopState);
      chrome.runtime.onMessage.removeListener(onMessage);
      observer.disconnect();
      if (mutationBatchTimer) {
        clearTimeout(mutationBatchTimer);
        flushMutations();
      }
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      window.__parchiRecording = false;
      window.__parchiRecordingCleanup = void 0;
    };
    window.__parchiRecordingCleanup = cleanup;
  })();
})();
//# sourceMappingURL=content-recording.js.map
