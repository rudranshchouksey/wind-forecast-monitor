import type { ReactNode } from "react";

import { API_BASE } from "../api/client";
import type { MetaResponse } from "../api/types";
import { snapshotLabel } from "../lib/labels";
import { useTheme } from "../lib/theme";
import { Badge, Button, ButtonLink } from "./ui";

export function ProductMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <g stroke="var(--accent-ink)" strokeWidth="2.6" strokeLinecap="round">
        <path d="M16 16V6.5M16 16l8.2 4.7M16 16l-8.2 4.7" />
      </g>
      <circle cx="16" cy="16" r="2.4" fill="var(--accent-ink)" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-[18px] w-[18px]">
      <circle cx="8" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-[18px] w-[18px]">
      <path
        d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <Button
      variant="ghost"
      size="md"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode (T)`}
      className="w-8 px-0"
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}

/** The slim sticky header: product mark, snapshot badge, API docs and utilities. */
export function AppHeader({ meta, actions }: { meta?: MetaResponse; actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-13 max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2.5">
          <ProductMark />
          <h1 className="truncate text-heading font-semibold tracking-[-0.01em] text-ink">
            GB Wind Forecast Monitor
          </h1>
        </div>
        {meta && (
          <Badge dot className="max-sm:hidden">
            {snapshotLabel(meta)}
          </Badge>
        )}
        <nav className="ml-auto flex items-center gap-1" aria-label="Utilities">
          <ButtonLink variant="ghost" href={`${API_BASE}/docs`} className="max-sm:hidden">
            API docs
          </ButtonLink>
          {actions}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
