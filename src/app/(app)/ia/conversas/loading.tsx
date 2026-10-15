import { Skeleton } from "@/components/ui/skeleton";

/**
 * REDESIGN-07-D · D4 — o desenho da lista de Conversas. A conversa aberta (`[id]`) tem o próprio
 * esqueleto de bolhas, em `[id]/loading.tsx`.
 */
export default function ConversasLoading() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
