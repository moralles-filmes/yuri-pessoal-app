import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton de carregamento para listas/tabelas do financeiro. */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 rounded-xl border p-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-4 w-24 sm:block" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
