import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Estado vazio premium: ícone em destaque dourado, título, descrição e ação.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center",
        className,
      )}
    >
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
        <Icon className="size-7" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {children && <div className="mt-5 flex items-center gap-2">{children}</div>}
    </div>
  );
}
