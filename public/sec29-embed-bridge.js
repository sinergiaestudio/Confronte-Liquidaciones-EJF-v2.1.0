(() => {
  "use strict";

  if (window.top === window) return;

  const params = new URLSearchParams(window.location.search);
  if (params.get("sec29_embed") !== "1") return;

  const tool = params.get("sec29_tool") || "external";
  let parentOrigin = "*";
  try {
    if (document.referrer) parentOrigin = new URL(document.referrer).origin;
  } catch {
    parentOrigin = "*";
  }

  const post = (type, payload = {}) => {
    window.parent.postMessage({ type, tool, ...payload }, parentOrigin);
  };

  document.documentElement.classList.add("sec29-embed-mode");

  const style = document.createElement("style");
  style.id = "sec29-embed-style";
  style.textContent = `
    html.sec29-embed-mode,
    html.sec29-embed-mode body {
      width: 100% !important;
      min-width: 0 !important;
      height: auto !important;
      min-height: 0 !important;
      margin: 0 !important;
      overflow: hidden !important;
      overscroll-behavior: none !important;
      scroll-behavior: auto !important;
      background: transparent !important;
    }

    html.sec29-embed-mode #root,
    html.sec29-embed-mode #__next,
    html.sec29-embed-mode .app-shell {
      min-height: 0 !important;
      height: auto !important;
      background: transparent !important;
    }

    html.sec29-embed-mode .topbar,
    html.sec29-embed-mode footer,
    html.sec29-embed-mode .footer {
      display: none !important;
    }

    html.sec29-embed-mode * {
      scroll-margin-top: 16px;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  const ignoredTags = new Set(["SCRIPT", "STYLE", "LINK", "META", "TITLE"]);
  let lastHeight = 0;
  let resizeFrame = 0;

  const rootElement = () =>
    document.getElementById("root") ||
    document.getElementById("__next") ||
    document.body;

  const measureHeight = () => {
    resizeFrame = 0;
    const body = document.body;
    const html = document.documentElement;
    const root = rootElement();
    if (!body || !html || !root) return;

    let bottom = 0;
    const bodyRect = body.getBoundingClientRect();

    for (const element of Array.from(body.children)) {
      if (ignoredTags.has(element.tagName)) continue;
      const computed = getComputedStyle(element);
      if (computed.display === "none" || computed.visibility === "hidden") continue;
      const rect = element.getBoundingClientRect();
      bottom = Math.max(bottom, rect.bottom - bodyRect.top);
    }

    const rootRect = root.getBoundingClientRect();
    bottom = Math.max(
      bottom,
      rootRect.bottom - bodyRect.top,
      root.scrollHeight,
      root.offsetHeight,
      body.scrollHeight,
      body.offsetHeight,
      html.scrollHeight,
      html.offsetHeight
    );

    const height = Math.max(620, Math.ceil(bottom + 4));
    if (Math.abs(height - lastHeight) < 2) return;
    lastHeight = height;
    post("sec29-embed-height", { height });
  };

  const scheduleMeasure = () => {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(measureHeight);
  };

  const canScrollVertically = (start, deltaY) => {
    let element = start instanceof Element ? start : null;
    while (element && element !== document.body && element !== document.documentElement) {
      const style = getComputedStyle(element);
      const scrollable = /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 2;
      if (scrollable) {
        const atTop = element.scrollTop <= 0;
        const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1;
        if ((deltaY < 0 && !atTop) || (deltaY > 0 && !atBottom)) return true;
      }
      element = element.parentElement;
    }
    return false;
  };

  const pixelDelta = (event) => {
    const factor = event.deltaMode === 1
      ? 18
      : event.deltaMode === 2
        ? Math.max(window.innerHeight, 600)
        : 1;
    return {
      x: event.deltaX * factor,
      y: event.deltaY * factor
    };
  };

  window.addEventListener("wheel", (event) => {
    if (event.ctrlKey) return;
    const delta = pixelDelta(event);
    if (Math.abs(delta.y) < Math.abs(delta.x)) return;
    if (canScrollVertically(event.target, delta.y)) return;

    post("sec29-embed-scroll", { x: delta.x, y: delta.y });
    event.preventDefault();
    event.stopPropagation();
  }, { passive: false, capture: true });

  let touchPoint = null;
  window.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) {
      touchPoint = null;
      return;
    }
    touchPoint = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
      target: event.target
    };
  }, { passive: true, capture: true });

  window.addEventListener("touchmove", (event) => {
    if (!touchPoint || event.touches.length !== 1) return;
    const current = event.touches[0];
    const deltaX = touchPoint.x - current.clientX;
    const deltaY = touchPoint.y - current.clientY;
    if (Math.abs(deltaY) <= Math.abs(deltaX) || Math.abs(deltaY) < 1) return;
    if (canScrollVertically(touchPoint.target, deltaY)) return;

    post("sec29-embed-scroll", { x: 0, y: deltaY });
    touchPoint = { x: current.clientX, y: current.clientY, target: touchPoint.target };
    event.preventDefault();
  }, { passive: false, capture: true });

  const clearTouch = () => { touchPoint = null; };
  window.addEventListener("touchend", clearTouch, { passive: true, capture: true });
  window.addEventListener("touchcancel", clearTouch, { passive: true, capture: true });

  window.addEventListener("keydown", (event) => {
    const tag = event.target?.tagName?.toLowerCase();
    if (["input", "textarea", "select"].includes(tag) || event.target?.isContentEditable) return;

    const pageStep = Math.round(Math.max(window.innerHeight, 600) * 0.86);
    const movements = {
      PageDown: pageStep,
      PageUp: -pageStep,
      ArrowDown: 48,
      ArrowUp: -48,
      " ": event.shiftKey ? -pageStep : pageStep
    };

    if (Object.prototype.hasOwnProperty.call(movements, event.key)) {
      post("sec29-embed-scroll", { x: 0, y: movements[event.key] });
      event.preventDefault();
    } else if (event.key === "Home") {
      post("sec29-embed-scroll-to", { position: "start" });
      event.preventDefault();
    } else if (event.key === "End") {
      post("sec29-embed-scroll-to", { position: "end" });
      event.preventDefault();
    }
  }, { capture: true });

  const resizeObserver = new ResizeObserver(scheduleMeasure);
  const observeCurrentRoots = () => {
    resizeObserver.disconnect();
    resizeObserver.observe(document.documentElement);
    if (document.body) resizeObserver.observe(document.body);
    const root = rootElement();
    if (root && root !== document.body) resizeObserver.observe(root);
  };

  const mutationObserver = new MutationObserver(() => {
    observeCurrentRoots();
    scheduleMeasure();
  });

  const start = () => {
    observeCurrentRoots();
    if (document.body) {
      mutationObserver.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true
      });
    }

    document.addEventListener("click", scheduleMeasure, true);
    document.addEventListener("change", scheduleMeasure, true);
    document.addEventListener("input", scheduleMeasure, true);
    document.addEventListener("transitionend", scheduleMeasure, true);
    window.addEventListener("resize", scheduleMeasure);

    post("sec29-embed-ready");
    scheduleMeasure();
    [80, 250, 700, 1500, 3000].forEach((delay) => setTimeout(scheduleMeasure, delay));
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
