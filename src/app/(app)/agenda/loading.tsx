import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

/** Skeleton de carregamento da Agenda (Fase 08). */
export default function AgendaLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 w-44" />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-56" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Skeleton className="h-[520px] w-full rounded-xl" />
        <Skeleton className="hidden h-[320px] w-full rounded-xl xl:block" />
      </div>
    </div>
  );
}
