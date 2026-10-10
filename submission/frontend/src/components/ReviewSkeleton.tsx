import { Skeleton } from "@/components/ui/skeleton";
import { useSettings } from "@/lib/settings";

const LINES = ["w-2/5", "w-1/3", "w-3/5", "w-1/4", "w-4/5", "w-2/3", "w-full", "w-11/12", "w-3/4", "w-1/2", "w-full", "w-5/6", "w-2/3", "w-1/3"];
const GROUPS = [3, 2, 3];

// Placeholder for the review screen while the backend is still analysing.
export function ReviewSkeleton() {
  const { t } = useSettings();
  return (
    <div aria-busy="true" role="status" aria-label={t.analyzing} className="animate-fade-up">
      <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden="true" />{t.analyzing}
      </p>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 rounded-lg border bg-card p-4 sm:p-5 lg:min-h-[75dvh]">
          <div className="mb-5 flex gap-2 border-b pb-4">
            {[24, 28, 20, 24].map((w, i) => <Skeleton key={i} className="h-9 rounded-md" style={{ width: `${w * 4}px` }} />)}
          </div>
          <div className="space-y-4">
            {LINES.map((w, i) => <Skeleton key={i} className={`h-4 ${w}`} style={{ animationDelay: `${i * 80}ms` }} />)}
          </div>
        </div>
        <aside className="hidden space-y-5 lg:block" aria-hidden="true">
          {GROUPS.map((n, g) => (
            <div key={g} className="space-y-3 border-b pb-4">
              <div className="flex items-center gap-2"><Skeleton className="size-4" /><Skeleton className="h-4 w-28" /><Skeleton className="ml-auto h-3 w-8" /></div>
              {Array.from({ length: n }, (_, i) => <Skeleton key={i} className="h-12 w-full" style={{ animationDelay: `${(g * 3 + i) * 100}ms` }} />)}
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
