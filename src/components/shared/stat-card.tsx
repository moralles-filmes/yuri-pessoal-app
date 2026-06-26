import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

type Trend = { value: string; direction: "up" | "down" | "neutral" };

/**
 * Card de resumo (KPI). Usado nos dashboards. Reutilizável em todos os módulos.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  trend,
  className,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  hint?: string;
  trend?: Trend;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {value}
          </p>
          {(hint || trend) && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {trend && (
                <span
                  className={cn(
                    "font-medium",
                    trend.direction === "up" && "text-emerald-500",
                    trend.direction === "down" && "text-destructive",
                    trend.direction === "neutral" && "text-muted-foreground",
                  )}
                >
                  {trend.value}
                </span>
              )}
              {hint}
            </p>
          )}
        </div>
        {Icon && (
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <Icon className="size-5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
