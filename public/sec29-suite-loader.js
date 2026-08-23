(() => {
  "use strict";

  if (window.top !== window) return;

  const style = document.createElement("style");
  style.id = "sec29-confronte-dark-theme";
  style.textContent = `
    html[data-theme="dark"] {
      --ink-950: #edf2f7 !important;
      --ink-800: #d8e0e8 !important;
      --ink-600: #aab4c0 !important;
      --ink-500: #8995a3 !important;
      --line: #35404c !important;
      --line-strong: #465260 !important;
      --paper: #192029 !important;
      --canvas: #10151b !important;
      --green: #79d5b0 !important;
      --green-bg: #17372c !important;
      --amber: #efbf68 !important;
      --amber-bg: #3a2b13 !important;
      --red: #ef8798 !important;
      --red-bg: #3b181f !important;
      --shadow-sm: 0 2px 8px rgba(0,0,0,.25) !important;
      --shadow-md: 0 18px 50px rgba(0,0,0,.36) !important;
    }

    html[data-theme="dark"] body,
    html[data-theme="dark"] main,
    html[data-theme="dark"] .workspace,
    html[data-theme="dark"] .review-section,
    html[data-theme="dark"] .results-section {
      color: #edf2f7 !important;
      background: #10151b !important;
    }

    html[data-theme="dark"] .upload-card,
    html[data-theme="dark"] .result-card,
    html[data-theme="dark"] .trace-panel,
    html[data-theme="dark"] .empty-guidance,
    html[data-theme="dark"] .scenario-ribbon,
    html[data-theme="dark"] .export-bar,
    html[data-theme="dark"] .kpi-grid article,
    html[data-theme="dark"] .review-card,
    html[data-theme="dark"] .document-review,
    html[data-theme="dark"] .table-shell,
    html[data-theme="dark"] .position-audit,
    html[data-theme="dark"] .comparison-grid > div,
    html[data-theme="dark"] .report-facts > div,
    html[data-theme="dark"] .empty-guidance {
      color: #edf2f7 !important;
      border-color: #35404c !important;
      background: #192029 !important;
      box-shadow: 0 16px 44px rgba(0,0,0,.22) !important;
    }

    html[data-theme="dark"] input,
    html[data-theme="dark"] textarea,
    html[data-theme="dark"] select,
    html[data-theme="dark"] code {
      color: #edf2f7 !important;
      border-color: #3d4957 !important;
      background: #10151b !important;
    }

    html[data-theme="dark"] table,
    html[data-theme="dark"] th,
    html[data-theme="dark"] td {
      color: #dce3ea !important;
      border-color: #35404c !important;
    }

    html[data-theme="dark"] .drop-zone,
    html[data-theme="dark"] .processing-box,
    html[data-theme="dark"] .file-summary,
    html[data-theme="dark"] .metadata-grid label,
    html[data-theme="dark"] .money-input {
      color: #dce3ea !important;
      border-color: #3d4957 !important;
      background: #151b22 !important;
    }

    html[data-theme="dark"] .stepper b,
    html[data-theme="dark"] .drop-zone__icon,
    html[data-theme="dark"] .file-summary__icon {
      color: #e4eaf0 !important;
      border-color: #3d4957 !important;
      background: #202833 !important;
    }
  `;
  document.head.appendChild(style);

  const shell = document.createElement("script");
  shell.src = "https://sinergiaestudio.github.io/Cedulas-EJE-v1.0/sec29-suite-shell.js?v=64";
  shell.defer = true;
  document.head.appendChild(shell);
})();
