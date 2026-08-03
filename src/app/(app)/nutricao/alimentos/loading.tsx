import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton do catálogo: espelha cabeçalho, filtros e a lista. */
export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 w-[190px] rounded-lg" />
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>

      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-28 rounded-full" />
        ))}
      </div>

      <div className="divide-y rounded-xl border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="size-4 rounded" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3 w-72" />
            </div>
            <Skeleton className="size-8 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
