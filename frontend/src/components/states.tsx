interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div
      role="alert"
      className="flex h-full min-h-40 flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <p className="text-sm font-medium text-ink">Could not load this view</p>
      <p className="max-w-sm text-sm text-ink-2">{message}</p>
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
