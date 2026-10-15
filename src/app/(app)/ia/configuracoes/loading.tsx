import { Skeleton } from "@/components/ui/skeleton";

/** REDESIGN-07-D · D4 — o desenho de Configurações da IA: aviso, preferências e um card por provedor. */
export default function IaConfiguracoesLoading() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-96 w-full rounded-xl" />
      <Skeleton className="h-4 w-24" />
      {[0, 1].map((i) => (
        <Skeleton key={i} className="h-72 w-full rounded-xl" />
      ))}
    </div>
  );
}
