import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton da revisão: resumo, indicadores e o que foi feito. */
export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-20 rounded-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-56 rounded-xl" />
    </div>
  );
}
