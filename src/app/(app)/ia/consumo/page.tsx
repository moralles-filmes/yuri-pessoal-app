import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarDays, CircleDollarSign, Clock, Info } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/lib/supabase/server";
import { getAiPreferences, getUsageByModel, getUsageSummary } from "@/lib/ai/queries";
import { AI_PROVIDER_LABEL } from "@/lib/ai/core/contracts";
import { AVISO_MOEDA, formatUsd } from "@/lib/ai/constants";
import { reconcileOwnRuns } from "@/lib/ai/server/reconcile";

export const metadata: Metadata = { title: "Consumo · IA" };
export const dynamic = "force-dynamic";

/**
 * Fase 18-A — IA · Consumo.
 *
 * ═══════════════════════ O QUE ESTA TELA SE RECUSA A FAZER ═══════════════════════
 *
 * Ela não soma execução sem custo informado como se fosse zero. O número "sem custo
 * informado" aparece ao lado do total, porque um total que engole ausências parece completo
 * e não é. É a mesma disciplina do "parcial" nos agregados de Treinos (17-D) e da Dieta.
 */
export default async function ConsumoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await reconcileOwnRuns();

  const prefs = await getAiPreferences(user.id);
  const agora = new Date();

  const [dia, mes, porModelo] = await Promise.all([
    getUsageSummary(user.id, "dia", prefs.dailyBudget, agora),
    getUsageSummary(user.id, "mes", prefs.monthlyBudget, agora),
    getUsageByModel(user.id, "mes", agora),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Consumo"
        description="Custo estimado, orçamento e execuções. Valores em dólar."
      />

      <div className="flex items-start gap-2 rounded-xl border bg-muted/30 p-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 text-muted-foreground">{AVISO_MOEDA}</p>
      </div>

      <div className="grid gap-4 @container sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Hoje"
          value={formatUsd(dia.totalUsd)}
          icon={Clock}
          hint={
            dia.limiteUsd === null
              ? "sem limite definido"
              : `de ${formatUsd(dia.limiteUsd)}`
          }
        />
        <StatCard
          label="Este mês"
          value={formatUsd(mes.totalUsd)}
          icon={CalendarDays}
          hint={
            mes.limiteUsd === null
              ? "sem limite definido"
              : `de ${formatUsd(mes.limiteUsd)}`
          }
        />
        <StatCard
          label="Reservado agora"
          value={formatUsd(mes.reservadoUsd)}
          icon={CircleDollarSign}
          hint={
            mes.runsComReservaAtiva === 1
              ? "1 execução em andamento"
              : `${mes.runsComReservaAtiva} execuções em andamento`
          }
        />
        <StatCard
          label="Execuções no mês"
          value={String(mes.execucoes)}
          icon={Info}
          hint={
            mes.execucoesSemCusto > 0
              ? `${mes.execucoesSemCusto} sem custo informado`
              : "todas com custo informado"
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Como o total é calculado</CardTitle>
          <CardDescription>
            O número acima não é só o que já foi gasto — ele inclui o que está reservado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">
              {formatUsd(mes.confirmadoUsd)} confirmados
            </strong>{" "}
            (custo real das execuções já encerradas) +{" "}
            <strong className="text-foreground">
              {formatUsd(mes.reservadoUsd)} reservados
            </strong>{" "}
            (das que ainda estão rodando).
          </p>
          <p>
            Enquanto uma execução vive, ela conta pela reserva; quando termina, passa a
            contar pelo custo real. Nunca pelos dois ao mesmo tempo — é isso que impede duas
            mensagens simultâneas de furarem o limite.
          </p>
          {mes.execucoesSemCusto > 0 && (
            <p>
              {mes.execucoesSemCusto === 1
                ? "1 execução ficou"
                : `${mes.execucoesSemCusto} execuções ficaram`}{" "}
              sem custo informado pelo provedor. Esses valores não entram na soma — não são
              contados como zero, são <strong className="text-foreground">
                desconhecidos
              </strong>.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Por modelo, no mês</CardTitle>
          <CardDescription>
            Cada tentativa é registrada com a tarifa que valia no momento dela.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {porModelo.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma execução registrada neste mês.
            </p>
          ) : (
            // Tabela larga rola dentro do próprio contêiner — a página nunca rola na
            // horizontal.
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Provedor</th>
                    <th className="py-2 pr-3 font-medium">Modelo</th>
                    <th className="py-2 pr-3 text-right font-medium">Tentativas</th>
                    <th className="py-2 pr-3 text-right font-medium">Custo</th>
                    <th className="py-2 text-right font-medium">Sem custo</th>
                  </tr>
                </thead>
                <tbody>
                  {porModelo.map((linha) => (
                    <tr
                      key={`${linha.provider}-${linha.model}`}
                      className="border-b last:border-0"
                    >
                      <td className="py-2 pr-3">{AI_PROVIDER_LABEL[linha.provider]}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{linha.model}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {linha.execucoes}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatUsd(linha.custoUsd)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {linha.semCusto > 0 ? linha.semCusto : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
