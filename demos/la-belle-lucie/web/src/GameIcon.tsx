import type { ReactNode } from "react";

type IconName =
  | "cards"
  | "example"
  | "shuffle"
  | "share"
  | "hint"
  | "target"
  | "back"
  | "next"
  | "check";

export function GameIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    cards: (
      <>
        <rect x="7" y="3" width="13" height="18" rx="2" />
        <path d="M4 5 2.5 5.4a2 2 0 0 0-1.3 2.4l3.1 11.6a2 2 0 0 0 2.4 1.4M13.5 8l2.5 4-2.5 4-2.5-4z" />
      </>
    ),
    example: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m10 8 6 4-6 4z" />
      </>
    ),
    shuffle: (
      <>
        <path d="M3 6h3c4 0 8 12 12 12h3m-4-4 4 4-4 4M3 18h3c1.5 0 3-2 4.5-4M14 9c1.5-2 2.5-3 4-3h3m-4-4 4 4-4 4" />
      </>
    ),
    share: (
      <>
        <path d="M12 15V3m-4 4 4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
      </>
    ),
    hint: (
      <>
        <path d="M9 18h6m-5 3h4M9 15c0-2-3-3-3-6a6 6 0 0 1 12 0c0 3-3 4-3 6z" />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="2" />
        <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
      </>
    ),
    back: <path d="M19 12H5m6-6-6 6 6 6" />,
    next: <path d="m9 5 7 7-7 7" />,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return (
    <svg
      className={`control-icon icon-${name}`}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
