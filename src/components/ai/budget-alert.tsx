"use client";

/**
 * Fase 18-A — IA · Aviso visual de orçamento (70% · 80% · 90% · 100%).
 *
 * ⚠️ AVISO VISUAL, NÃO NOTIFICAÇÃO. Nenhuma notificação no sino nesta subfase — o sino da
 * IA é 18-F, e ele passará por `filterByPrefs`, o único ponto do sistema onde preferência
 * de notificação decide (invariante 24 da 16-F).
 *
 * O nível já mostrado é registrado no servidor para o mesmo aviso não reaparecer a cada
 * render: aviso repetido vira ruído que se ignora, e aí o próximo — o que importa — passa
 * despercebido.
 */

import * as React from "react";
import { AlertTriangle, Ban } from "lucide-react";
import { registerBudgetAlertLevel } from "@/lib/actions/ai-preferences";
import { formatUsd } from "@/lib/ai/constants";
import { cn } from "@/lib/utils";
import type { UsagePeriodSummary } from "@/lib/ai/types";

export function BudgetAlert({
  dia,
  mes,
  nivelJaRegistrado,
}: {
  dia: UsagePeriodSummary;
  mes: UsagePeriodSummary;
  nivelJaRegistrado: number;
}) {
  // O período mais crítico manda. Mostrar os dois avisos ao mesmo tempo transformaria a
  // tela num painel de alarmes.
  const critico =
    (mes.nivelDeAlerta ?? 0) >= (dia.nivelDeAlerta ?? 0) && mes.limiteUsd !== null
      ? mes
      : dia;

  const nivel = critico.nivelDeAlerta;

  React.useEffect(() => {
    if (nivel !== null && nivel > nivelJaRegistrado) {
      void registerBudgetAlertLevel(nivel);
    }
  }, [nivel, nivelJaRegistrado]);

  if (nivel === null || critico.limiteUsd === null) return null;

  const bloqueado = nivel >= 100;
  const rotuloPeriodo = critico.periodo === "dia" ? "diário" : "mensal";

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl border p-3 text-sm",
        bloqueado
          ? "border-destructive/40 bg-destructive/5 text-destructive"
          : "border-amber-500/30 bg-amber-500/5",
      )}
    >
      {bloqueado ? (
        <Ban className="mt-0.5 size-4 shrink-0" />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
      )}
      <div className="min-w-0 space-y-1">
        <p className="font-medium">
          {bloqueado
            ? `Orçamento ${rotuloPeriodo} atingido.`
            : `Você já usou ${nivel}% do orçamento ${rotuloPeriodo}.`}
        </p>
        <p className={cn("text-xs", bloqueado ? "" : "text-muted-foreground")}>
          {formatUsd(critico.totalUsd)} de {formatUsd(critico.limiteUsd)} — inclui{" "}
          {formatUsd(critico.reservadoUsd)} reservados por{" "}
          {critico.runsComReservaAtiva === 1
            ? "1 execução em andamento"
            : `${critico.runsComReservaAtiva} execuções em andamento`}
          .
          {critico.execucoesSemCusto > 0 && (
            <>
              {" "}
              {critico.execucoesSemCusto === 1
                ? "1 execução ficou"
                : `${critico.execucoesSemCusto} execuções ficaram`}{" "}
              sem custo informado pelo provedor e não entra nesta soma.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
