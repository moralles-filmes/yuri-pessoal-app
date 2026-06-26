import { cn } from "@/lib/utils";

/**
 * Marca do sistema — monograma dourado "Y" + wordmark.
 * `collapsed` esconde o wordmark (sidebar recolhida).
 */
export function Logo({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary font-bold text-primary-foreground shadow-sm ring-1 ring-black/5"
      >
        Y
      </span>
      {!collapsed && (
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">
            Sistema Pessoal
          </span>
          <span className="text-[11px] text-muted-foreground">por Yuri</span>
        </span>
      )}
    </div>
  );
}
