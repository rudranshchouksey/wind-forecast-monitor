import { useEffect, useRef, useState } from "react";

import { ApiError, isUnreachable } from "../api/client";

/** Seconds to wait before each automatic retry while the API is unreachable (last one repeats). */
const RETRY_DELAYS_S = [2, 4, 8, 15, 30];

/**
 * While `active`, counts down and calls `onRetry` with backoff. Each new `error` object (a failed
 * retry) schedules the next attempt. Returns the seconds left, 0 while a retry is in flight.
 */
function useAutoRetry(active: boolean, error: unknown, onRetry?: () => void): number | null {
  const attempt = useRef(0);
  const retry = useRef(onRetry);
  retry.current = onRetry;
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!active || !retry.current) {
      setSecondsLeft(null);
      return;
    }
    let remaining = RETRY_DELAYS_S[Math.min(attempt.current, RETRY_DELAYS_S.length - 1)] ?? 30;
    setSecondsLeft(remaining);
    const id = setInterval(() => {
      remaining -= 1;
      setSecondsLeft(Math.max(remaining, 0));
      if (remaining <= 0) {
        clearInterval(id);
        attempt.current += 1;
        retry.current?.();
      }
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [active, error]);

  return secondsLeft;
}

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const unreachable = isUnreachable(error);
  const secondsLeft = useAutoRetry(unreachable, error, onRetry);
  const message = error instanceof Error ? error.message : "Something went wrong.";
  const apiError = error instanceof ApiError ? error : undefined;
  const title = unreachable ? undefined : apiError?.title;
  return (
    <div
      role="alert"
      className="flex h-full min-h-40 flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <p className="text-sm font-medium text-ink">Could not load this view</p>
      {title && title !== message && (
        <p className="text-sm font-medium text-ink-2">
          {title} ({apiError?.status})
        </p>
      )}
      <p className="max-w-sm text-sm text-ink-2">{message}</p>
      {secondsLeft !== null && (
        <p className="text-xs text-muted" aria-live="polite">
          {secondsLeft > 0 ? `Retrying automatically in ${secondsLeft} s…` : "Retrying…"}
        </p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-2"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message = "No hours to show for this selection." }) {
  return (
    <div className="flex h-full min-h-40 items-center justify-center p-6 text-center text-sm text-ink-2">
      {message}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`animate-pulse rounded-md bg-surface-2 ${className}`} />
  );
}

export function LoadingBlock({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="h-full min-h-40 p-2">
      <span className="sr-only">{label}…</span>
      <Skeleton className="h-full min-h-40 w-full" />
    </div>
  );
}
