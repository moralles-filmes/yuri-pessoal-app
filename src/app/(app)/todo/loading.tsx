import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton do TO-DO: espelha o layout real (navegação + cabeçalho + lista). */
export default function Loading() {
  return (
    <div className="flex gap-6">
      <div className="hidden w-60 shrink-0 space-y-2 lg:block">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full rounded-lg" />
        ))}
        <Skeleton className="h-4 w-24 rounded" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={`p${i}`} className="h-8 w-full rounded-lg" />
        ))}
      </div>

      <div className="min-w-0 flex-1 space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-28 rounded-lg" />
          ))}
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-56 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-32 rounded-lg" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
