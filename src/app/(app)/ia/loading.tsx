import { Skeleton } from "@/components/ui/skeleton";

export default function IaLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="space-y-3">
        <Skeleton className="h-20 w-3/4 rounded-2xl" />
        <Skeleton className="ml-auto h-14 w-1/2 rounded-2xl" />
        <Skeleton className="h-24 w-4/5 rounded-2xl" />
      </div>
      <Skeleton className="h-28 w-full rounded-xl" />
    </div>
  );
}
