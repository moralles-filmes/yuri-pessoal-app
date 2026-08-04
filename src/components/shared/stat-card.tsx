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
    // `@container`: a decisão de mostrar o ícone é do CARD, não da viewport. Numa grade de
    // 4 colunas o card pode ficar com ~115px mesmo num monitor grande — media query não
    // enxerga isso.
    <Card className={cn("@container overflow-hidden", className)}>
      <CardContent className="flex items-start justify-between gap-3 p-4 sm:gap-4 sm:p-5">
        {/* `min-w-0` é obrigatório: item de flex não encolhe abaixo do conteúdo
            (`min-width: auto`). Sem ele o rótulo empurrava o ícone para fora e o
            `overflow-hidden` do Card o cortava pela metade. */}
        <div className="min-w-0 space-y-1.5">
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
        {/* Abaixo de 13rem de CARD o ícone sai de cena: sobra espaço para o rótulo respirar
            em vez de o texto ser espremido a ponto de quebrar no meio da palavra. O ícone é
            decorativo — o rótulo ao lado já diz o que o número é —, então some sem perda. */}
        {Icon && (
          <div className="hidden size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15 @[13rem]:grid">
            <Icon className="size-5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
