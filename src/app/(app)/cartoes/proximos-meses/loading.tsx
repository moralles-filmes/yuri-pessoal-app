import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton de carregamento de Próximos meses (REDESIGN-05-C). */
export default function ProximosMesesLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-9 w-60 rounded-lg" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>

      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}
