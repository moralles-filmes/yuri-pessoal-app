import { Skeleton } from "@/components/ui/skeleton";

export default function MemoriaLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="flex gap-2">
        <Skeleton className="h-10 w-full rounded-xl sm:w-72" />
        <Skeleton className="h-10 w-32 shrink-0 rounded-xl" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
