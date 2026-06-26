import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-4 w-28" />
      <div className="flex items-start gap-3">
        <Skeleton className="size-12 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="grid gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
