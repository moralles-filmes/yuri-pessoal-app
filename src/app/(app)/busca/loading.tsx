import { Skeleton } from "@/components/ui/skeleton";

/** REDESIGN-07-D · D4 — o desenho da Busca: campo e resultados agrupados em duas colunas. */
export default function BuscaLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-9 w-full max-w-xl rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <div className="grid gap-2 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
