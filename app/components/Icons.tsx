import type { SVGProps } from "react";

type IconName =
  | "archive" | "arrow" | "check" | "chevron" | "document" | "download"
  | "info" | "lock" | "print" | "refresh" | "search" | "shield" | "spark"
  | "upload" | "warning";

const paths: Record<IconName, React.ReactNode> = {
  archive: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3h8l2 2H6l2-2Zm1 8h6m-3 0v6"/></>,
  arrow: <><path d="M5 12h14m-5-5 5 5-5 5"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  document: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 13h6m-6 4h6"/></>,
  download: <><path d="M12 3v12m-4-4 4 4 4-4"/><path d="M4 19h16"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  print: <><path d="M7 9V3h10v6M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7z"/></>,
  refresh: <><path d="M20 7v5h-5"/><path d="M4 17v-5h5M18.5 10A7 7 0 0 0 6 7l-2 5m2 2a7 7 0 0 0 12 3l2-5"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  shield: <><path d="M12 2 4 5v6c0 5 3.4 9 8 11 4.6-2 8-6 8-11V5z"/><path d="m8 12 2.5 2.5L16 9"/></>,
  spark: <><path d="m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8z"/><path d="m18 15 .7 2.3L21 18l-2.3.7L18 21l-.7-2.3L15 18l2.3-.7z"/></>,
  upload: <><path d="M12 16V4m-4 4 4-4 4 4"/><path d="M4 16v4h16v-4"/></>,
  warning: <><path d="M12 3 2.8 20h18.4z"/><path d="M12 9v4m0 3h.01"/></>,
};

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20"
      stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" {...props}>
      {paths[name]}
    </svg>
  );
}

