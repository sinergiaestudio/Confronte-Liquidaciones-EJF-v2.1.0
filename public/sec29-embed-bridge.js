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

  const html = document.documentElement;
  html.classList.add("sec29-embed-mode");

  const commonCss = `
    html.sec29-embed-mode,
    html.sec29-embed-mode body {
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
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
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      height: auto !important;
      min-height: 0 !important;
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

    html.sec29-embed-mode[data-sec29-theme="dark"] {
      color-scheme: dark;
    }
  `;

  const cedulasDarkCss = `
    html[data-sec29-theme="dark"] {
      --paper: #11161c !important;
      --surface: #192029 !important;
      --surface-strong: #202833 !important;
      --ink: #edf2f7 !important;
      --muted: #aab4c0 !important;
      --line: #35404c !important;
      --wine-soft: #351720 !important;
      --green-soft: #17372c !important;
      --amber-soft: #3a2b13 !important;
      --slate-soft: #242d37 !important;
    }

    html[data-sec29-theme="dark"] body,
    html[data-sec29-theme="dark"] .app-shell {
      color: #edf2f7 !important;
      background: #11161c !important;
    }

    html[data-sec29-theme="dark"] .surface,
    html[data-sec29-theme="dark"] .workflow-map,
    html[data-sec29-theme="dark"] .dropzone,
    html[data-sec29-theme="dark"] .file-summary,
    html[data-sec29-theme="dark"] .results-table-wrap,
    html[data-sec29-theme="dark"] .manual-row,
    html[data-sec29-theme="dark"] .action-card,
    html[data-sec29-theme="dark"] .metric,
    html[data-sec29-theme="dark"] .filters,
    html[data-sec29-theme="dark"] .page-audit,
    html[data-sec29-theme="dark"] .selected-list,
    html[data-sec29-theme="dark"] .installer-box {
      color: #edf2f7 !important;
      border-color: #35404c !important;
      background: #192029 !important;
      box-shadow: 0 18px 48px rgba(0, 0, 0, .24) !important;
    }

    html[data-sec29-theme="dark"] input,
    html[data-sec29-theme="dark"] textarea,
    html[data-sec29-theme="dark"] select,
    html[data-sec29-theme="dark"] code,
    html[data-sec29-theme="dark"] blockquote {
      color: #edf2f7 !important;
      border-color: #3d4957 !important;
      background: #10151b !important;
    }

    html[data-sec29-theme="dark"] .results-table th,
    html[data-sec29-theme="dark"] .results-table td {
      border-color: #35404c !important;
    }

    html[data-sec29-theme="dark"] .results-table tbody tr,
    html[data-sec29-theme="dark"] .filters button,
    html[data-sec29-theme="dark"] .outline-button,
    html[data-sec29-theme="dark"] .text-button {
      color: #dce3ea !important;
      border-color: #35404c !important;
      background: #1d252f !important;
    }

    html[data-sec29-theme="dark"] .hero-description,
    html[data-sec29-theme="dark"] .section-heading p,
    html[data-sec29-theme="dark"] small,
    html[data-sec29-theme="dark"] .brand-copy span {
      color: #aab4c0 !important;
    }
  `;

  const confronteDarkCss = `
    html[data-sec29-theme="dark"] {
      --paper: #151a21 !important;
      --canvas: #10151b !important;
      --surface: #192029 !important;
      --surface-strong: #202833 !important;
      --ink-950: #edf2f7 !important;
      --ink-800: #d8e0e8 !important;
      --ink-600: #aab4c0 !important;
      --ink-500: #8995a3 !important;
      --line: #35404c !important;
      --line-strong: #465260 !important;
      --green-bg: #17372c !important;
      --amber-bg: #3a2b13 !important;
      --red-bg: #3b181f !important;
      --wine-soft: #351720 !important;
    }

    html[data-sec29-theme="dark"] body,
    html[data-sec29-theme="dark"] main {
      color: #edf2f7 !important;
      background: #10151b !important;
    }

    html[data-sec29-theme="dark"] .workspace,
    html[data-sec29-theme="dark"] .review-section,
    html[data-sec29-theme="dark"] .results-section {
      background: #10151b !important;
    }

    html[data-sec29-theme="dark"] .upload-card,
    html[data-sec29-theme="dark"] .result-card,
    html[data-sec29-theme="dark"] .trace-panel,
    html[data-sec29-theme="dark"] .empty-guidance,
    html[data-sec29-theme="dark"] .scenario-ribbon,
    html[data-sec29-theme="dark"] .export-bar,
    html[data-sec29-theme="dark"] .kpi-grid article,
    html[data-sec29-theme="dark"] .review-card,
    html[data-sec29-theme="dark"] .document-review,
    html[data-sec29-theme="dark"] .table-shell,
    html[data-sec29-theme="dark"] .position-audit,
    html[data-sec29-theme="dark"] .comparison-grid > div,
    html[data-sec29-theme="dark"] .report-facts > div {
      color: #edf2f7 !important;
      border-color: #35404c !important;
      background: #192029 !important;
      box-shadow: 0 16px 44px rgba(0, 0, 0, .22) !important;
    }

    html[data-sec29-theme="dark"] input,
    html[data-sec29-theme="dark"] textarea,
    html[data-sec29-theme="dark"] select,
    html[data-sec29-theme="dark"] code {
      color: #edf2f7 !important;
      border-color: #3d4957 !important;
      background: #10151b !important;
    }

    html[data-sec29-theme="dark"] table,
    html[data-sec29-theme="dark"] th,
    html[data-sec29-theme="dark"] td {
      color: #dce3ea !important;
      border-color: #35404c !important;
    }

    html[data-sec29-theme="dark"] .drop-zone,
    html[data-sec29-theme="dark"] .processing-box,
    html[data-sec29-theme="dark"] .file-summary {
      color: #dce3ea !important;
      border-color: #3d4957 !important;
      background: #151b22 !important;
    }
  `;

  const style = document.createElement("style");
  style.id = "sec29-embed-style";
  style.textContent = commonCss + (tool === "confronte" ? confronteDarkCss : cedulasDarkCss);
  (document.head || document.documentElement).appendChild(style);

  let currentTheme = "light";
  let lastHeight = 0;
  let measureTimer = 0;
  let observedContent = null;

  const normalizeTheme = (value) => value === "dark" ? "dark" : "light";

  const applyTheme = (value) => {
    currentTheme = normalizeTheme(value);
    html.dataset.sec29Theme = currentTheme;
    html.style.colorScheme = currentTheme;
    scheduleMeasure();
  };

  const contentElement = () => {
    if (tool === "cedulas") {
      return document.querySelector(".app-shell")
        || document.querySelector("#root > *")
        || document.getElementById("root");
    }

    if (tool === "confronte") {
      return document.querySelector("main#inicio")
        || document.querySelector("main");
    }

    return document.querySelector(".app-shell")
      || document.querySelector("main")
      || document.querySelector("#root > *")
      || document.getElementById("root")
      || document.body;
  };

  const numericStyle = (style, property) => {
    const value = Number.parseFloat(style[property]);
    return Number.isFinite(value) ? value : 0;
  };

  const intrinsicHeight = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    let height = rect.height
      + numericStyle(style, "marginTop")
      + numericStyle(style, "marginBottom");

    for (const child of Array.from(element.children)) {
      const childStyle = getComputedStyle(child);
      if (childStyle.display === "none" || childStyle.visibility === "hidden") continue;
      if (childStyle.position === "fixed") continue;

      const childRect = child.getBoundingClientRect();
      const bottom = childRect.bottom - rect.top + numericStyle(childStyle, "marginBottom");
      height = Math.max(height, bottom);
    }

    return Math.ceil(height + 2);
  };

  const measureHeight = () => {
    measureTimer = 0;
    const content = contentElement();
    if (!content) return;

    bindResizeObserver(content);

    const measured = Math.max(620, intrinsicHeight(content));
    if (!Number.isFinite(measured)) return;
    if (Math.abs(measured - lastHeight) < 6) return;

    lastHeight = measured;
    post("sec29-embed-height", { height: measured });
  };

  function scheduleMeasure() {
    window.clearTimeout(measureTimer);
    measureTimer = window.setTimeout(() => {
      requestAnimationFrame(measureHeight);
    }, 36);
  }

  const resizeObserver = new ResizeObserver(scheduleMeasure);

  function bindResizeObserver(content = contentElement()) {
    if (!content || content === observedContent) return;
    resizeObserver.disconnect();
    resizeObserver.observe(content);
    observedContent = content;
  }

  const canScrollVertically = (start, deltaY) => {
    let element = start instanceof Element ? start : null;

    while (element && element !== document.body && element !== document.documentElement) {
      const style = getComputedStyle(element);
      const overflow = style.overflowY;
      const hasRange = element.scrollHeight - element.clientHeight > 10;
      const scrollable = /(auto|scroll)/.test(overflow) && hasRange;

      if (scrollable) {
        const atTop = element.scrollTop <= 1;
        const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 2;
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
        ? 760
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

    const pageStep = 720;
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

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    if (parentOrigin !== "*" && event.origin !== parentOrigin) return;
    if (!event.data || typeof event.data !== "object") return;

    if (event.data.type === "sec29-theme") {
      applyTheme(event.data.theme);
    } else if (event.data.type === "sec29-measure") {
      scheduleMeasure();
    }
  });

  const mutationObserver = new MutationObserver(() => {
    bindResizeObserver();
    scheduleMeasure();
  });

  const start = () => {
    const content = contentElement();
    bindResizeObserver(content);

    if (document.body) {
      mutationObserver.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: false,
        attributeFilter: ["class", "style", "hidden", "open", "aria-expanded"]
      });
    }

    document.addEventListener("click", scheduleMeasure, true);
    document.addEventListener("change", scheduleMeasure, true);
    document.addEventListener("input", scheduleMeasure, true);
    window.addEventListener("resize", scheduleMeasure);

    applyTheme(params.get("sec29_theme") || "light");
    post("sec29-embed-ready");
    post("sec29-theme-request");
    scheduleMeasure();

    [120, 350, 900, 1800, 3200].forEach((delay) => {
      window.setTimeout(scheduleMeasure, delay);
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
