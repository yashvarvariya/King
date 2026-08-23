export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-base-800 ${className}`} />;
}

/** Grid of skeleton server cards for the dashboard while data loads. */
export function ServerCardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-base-700 bg-base-900/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-4 w-14 rounded-full" />
          </div>
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-7 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Skeleton for a single-server header (name, status, action buttons). */
export function ServerHeaderSkeleton() {
  return (
    <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3 w-56" />
      </div>
      <div className="flex items-center gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20" />
        ))}
      </div>
    </div>
  );
}

/** Skeleton rows for tabular / list content (file manager, backups, etc). */
export function RowSkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="divide-y divide-base-800 border border-base-800 rounded-md overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center justify-between px-3 py-3">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
