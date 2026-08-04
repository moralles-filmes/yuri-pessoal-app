import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton da sessão ao vivo: cabeçalho fixo, exercício em foco e campos de registro. */
export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-14 rounded-xl" />
    </div>
  );
}
