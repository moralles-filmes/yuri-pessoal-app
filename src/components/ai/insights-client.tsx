"use client";

/**
 * Fase 18-E · Bloco 3 — IA · A tela de insights.
 *
 * ═══════════════════════ O QUE ESTA TELA SE RECUSA A FAZER ═══════════════════════
 *
 *  • NÃO mostra um número que não venha de uma linha de `ai_insight_sources`. O texto
 *    gravado guarda tokens `{{ind:…}}`; `renderizarExplicacao` os resolve aqui, e um token
 *    sem fonte vira marcador explícito — nunca some, nunca vira "0".
 *  • NÃO escreve "—" para um indicador não medido. Escreve "não medido" COM o motivo.
 *  • NÃO esconde o insight expirado: ele sai da lista de vigentes e continua legível.
 *  • NÃO oferece módulo cuja chave `allow_*` está desligada.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  EyeOff,
  Loader2,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  ListPlus,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProposalCard, type PropostaNaTela } from "@/components/ai/proposal-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ROTULO_DA_CONFIANCA,
  ROTULO_DO_ESTADO_DE_INSIGHT,
} from "@/lib/ai/constants";
import type { ModuloDeInsight } from "@/lib/ai/insights/contracts";
import {
  renderizarExplicacao,
  ressalvaDaFonte,
  textoDaFonte,
} from "@/lib/ai/insights/render";
import type { InsightNaTela } from "@/lib/ai/server/insight-queries";
import {
  gerarInsight,
  prepararTarefaDoInsight,
  registrarDecisaoDeInsight,
} from "@/lib/actions/ai-insights";
import { formatDate } from "@/lib/format";

const NOME_DO_MODULO: Record<ModuloDeInsight, string> = {
  financeiro: "Financeiro",
  treinos: "Treinos",
  dieta: "Dieta e Alimentação",
};

/** Adiar por uma semana. Data pura, aritmética em `Date.UTC`, sem passar por fuso local. */
function daquiUmaSemana(): string {
  const hoje = new Date();
  const t = new Date(
    Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()) +
      7 * 86_400_000,
  );
  const dd = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${dd(t.getUTCMonth() + 1)}-${dd(t.getUTCDate())}`;
}

export function InsightsClient({
  insights,
  disponiveis,
}: {
  insights: readonly InsightNaTela[];
  disponiveis: readonly ModuloDeInsight[];
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [modulo, setModulo] = useState<ModuloDeInsight | "">(disponiveis[0] ?? "");
  const [mostrarTodos, setMostrarTodos] = useState(false);

  const visiveis = useMemo(
    () =>
      mostrarTodos
        ? insights
        : insights.filter((i) => i.estado.estado === "vigente"),
    [insights, mostrarTodos],
  );

  const ocultos = insights.length - insights.filter((i) => i.estado.estado === "vigente").length;

  function gerar() {
    if (!modulo) return;
    startTransition(async () => {
      const r = await gerarInsight({ modulo });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        r.data.reaproveitado
          ? "Os números não mudaram desde a última análise — nada foi gerado nem cobrado."
          : "Análise gerada.",
      );
      router.refresh();
    });
  }

  function decidir(
    insightId: string,
    decisao: "util" | "inutil" | "dispensado" | "adiado" | "nao_mostrar",
  ) {
    startTransition(async () => {
      const r = await registrarDecisaoDeInsight({
        insightId,
        decisao,
        ...(decisao === "adiado" ? { adiadoAte: daquiUmaSemana() } : {}),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* ⚠️ `min-w-0` no lado do texto: sem ele o select empurra o botão para fora do card. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
        {disponiveis.length === 0 ? (
          <p className="min-w-0 text-sm text-muted-foreground">
            Nenhum módulo está liberado para a IA ler.{" "}
            <Link href="/ia/configuracoes" className="underline">
              Ligue uma chave em Configurações
            </Link>{" "}
            para poder pedir uma análise.
          </p>
        ) : (
          <>
            <Select
              value={modulo}
              onValueChange={(v) => setModulo(v as ModuloDeInsight)}
              disabled={pendente}
            >
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue placeholder="Escolha o módulo" />
              </SelectTrigger>
              <SelectContent>
                {disponiveis.map((m) => (
                  <SelectItem key={m} value={m}>
                    {NOME_DO_MODULO[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={gerar} disabled={pendente || !modulo}>
              {pendente ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Gerar análise
            </Button>
          </>
        )}
        {ocultos > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setMostrarTodos((v) => !v)}
          >
            {mostrarTodos
              ? "Mostrar só as vigentes"
              : `Mostrar as ${ocultos} fora da lista`}
          </Button>
        ) : null}
      </div>

      {visiveis.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Nenhuma análise aqui"
          description="As análises não são geradas sozinhas. Escolha um módulo e peça uma — os números vêm dos seus registros, e nada é enviado antes disso."
        />
      ) : (
        <div className="space-y-3">
          {visiveis.map((insight) => (
            <CartaoDeInsight
              key={insight.id}
              insight={insight}
              pendente={pendente}
              onDecidir={decidir}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CartaoDeInsight({
  insight,
  pendente,
  onDecidir,
}: {
  insight: InsightNaTela;
  pendente: boolean;
  onDecidir: (
    id: string,
    d: "util" | "inutil" | "dispensado" | "adiado" | "nao_mostrar",
  ) => void;
}) {
  const explicacao = renderizarExplicacao(insight.explicacao, insight.fontes);
  const resumo = renderizarExplicacao(insight.resumo, insight.fontes);
  const vigente = insight.estado.estado === "vigente";
  const [titulo, setTitulo] = useState("");
  const [proposta, setProposta] = useState<PropostaNaTela | null>(null);
  const [preparando, startPreparo] = useTransition();

  /**
   * ⛔ ELE PROPÕE, NÃO CRIA. A action grava uma proposta com `origem = 'insight'` e devolve a
   * previsão; quem executa é `ProposalCard` → `confirmarAcaoDaIa`, a MESMA porta de qualquer
   * outra escrita da IA — com o mesmo hash, o mesmo prazo de 10 min, o mesmo uso único e a
   * mesma revalidação. Um caminho de um clique só seria a única escrita do sistema sem o dono
   * ler o que vai acontecer.
   *
   * ⚠️ E o TÍTULO É DIGITADO POR ELE. O texto do insight não vira título automaticamente: ele
   * pode conter token `{{ind:…}}`, e no TO-DO não há quem o resolva.
   */
  function prepararTarefa() {
    if (!titulo.trim()) return;
    startPreparo(async () => {
      const r = await prepararTarefaDoInsight({ insightId: insight.id, titulo });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setProposta({
        id: r.data.id,
        effectHash: r.data.effectHash,
        expiresAt: r.data.expiresAt,
        toolName: "tela.insight",
        rotulo: r.data.rotulo,
        risco: 2,
        resumo: r.data.previsao.resumo,
        linhas: r.data.previsao.linhas,
        ressalvas: r.data.previsao.ressalvas,
      });
    });
  }

  return (
    <Card className={vigente ? undefined : "opacity-70"}>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start gap-2">
          {/* `min-w-0` obrigatório: o título é longo e os badges são `shrink-0`. */}
          <CardTitle className="min-w-0 flex-1 text-base">{insight.titulo}</CardTitle>
          <Badge variant="secondary" className="shrink-0">
            {NOME_DO_MODULO[insight.modulo]}
          </Badge>
          {!vigente ? (
            <Badge variant="outline" className="shrink-0">
              {ROTULO_DO_ESTADO_DE_INSIGHT[insight.estado.estado]}
              {insight.estado.voltaEm
                ? ` até ${formatDate(insight.estado.voltaEm)}`
                : ""}
            </Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">{resumo}</p>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        <p className="whitespace-pre-wrap">{explicacao}</p>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Os números desta análise
          </p>
          <ul className="space-y-2">
            {insight.fontes.map((fonte) => (
              <li key={fonte.indicador_id} className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="min-w-0 text-muted-foreground">{fonte.rotulo}:</span>
                  {/* ⛔ Não medido escreve "não medido" com o motivo — nunca "—", nunca 0. */}
                  <span className="font-medium">{textoDaFonte(fonte)}</span>
                  <Link
                    href={fonte.rota}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground underline"
                  >
                    ver <ExternalLink className="size-3" />
                  </Link>
                </div>
                {ressalvaDaFonte(fonte).length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {ressalvaDaFonte(fonte).join(" · ")}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {formatDate(fonte.periodo_de)} a {formatDate(fonte.periodo_ate)}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted-foreground">
          Confiança <strong>{insight.confianca}</strong> —{" "}
          {ROTULO_DA_CONFIANCA[insight.confianca]}. Gerada em{" "}
          {formatDate(insight.criadoEm)} por {insight.provider} · {insight.model} ·{" "}
          {insight.promptVersion}.
        </p>

        {/* ⛔ Transformar em tarefa PROPÕE — quem executa é o cartão de proposta abaixo. */}
        {vigente ? (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Transformar em tarefa
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="O que você quer fazer?"
                maxLength={300}
                className="min-w-0 flex-1"
                disabled={preparando}
              />
              <Button
                variant="outline"
                onClick={prepararTarefa}
                disabled={preparando || titulo.trim() === ""}
              >
                {preparando ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ListPlus className="size-4" />
                )}
                Preparar
              </Button>
            </div>
            {proposta ? <ProposalCard proposta={proposta} /> : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pendente}
            onClick={() => onDecidir(insight.id, "util")}
          >
            <ThumbsUp className="size-4" />
            Útil
            {insight.estado.avaliacao === "util" ? (
              <CheckCircle2 className="size-3.5" />
            ) : null}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pendente}
            onClick={() => onDecidir(insight.id, "inutil")}
          >
            <ThumbsDown className="size-4" />
            Não útil
            {insight.estado.avaliacao === "inutil" ? (
              <CheckCircle2 className="size-3.5" />
            ) : null}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pendente}
            onClick={() => onDecidir(insight.id, "dispensado")}
          >
            <X className="size-4" />
            Dispensar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pendente}
            onClick={() => onDecidir(insight.id, "adiado")}
          >
            <CalendarClock className="size-4" />
            Adiar 7 dias
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pendente}
            onClick={() => onDecidir(insight.id, "nao_mostrar")}
          >
            <EyeOff className="size-4" />
            Não mostrar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
