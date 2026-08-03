import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton das metas nutricionais. */
export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-28 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
