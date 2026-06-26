/**
 * Fase 12 — Skeleton do CORPO de um card (fallback de Suspense por card).
 * O frame/cabeçalho do card é instantâneo; só o corpo "carrega".
 */
import { Skeleton } from "@/components/ui/skeleton";

export function CardBodySkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}
