/**
 * Fase 18-E — Card de Insights no Dashboard Geral (Server Component).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ ELE SÓ LÊ. NÃO HÁ BOTÃO DE GERAR AQUI, E NÃO PODE HAVER.                           ║
 * ║                                                                                       ║
 * ║ O dashboard carrega a cada visita. Um insight gerado no carregamento custaria dinheiro║
 * ║ do dono a cada abertura de página — e o custo não apareceria como decisão de ninguém, ║
 * ║ apareceria como conta no fim do mês.                                                  ║
 * ║                                                                                       ║
 * ║ Por isso este arquivo importa `insight-queries` (a metade LEITURA) e não alcança      ║
 * ║ `insight-runner` nem `actions/ai-insights` — há teste de import em                     ║
 * ║ `boundaries.test.ts` mantendo assim. Gerar é em /ia/insights, por clique.              ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⛔ E ele não mostra número que não venha das fontes: o texto gravado guarda tokens, e
 * `renderizarExplicacao` os resolve aqui.
 */
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getInsightsVigentes } from "@/lib/ai/server/insight-queries";
import { renderizarExplicacao } from "@/lib/ai/insights/render";
import { CardEmpty } from "./primitives";

const NOME_DO_MODULO = {
  financeiro: "Financeiro",
  treinos: "Treinos",
  dieta: "Dieta",
} as const;

/** Teto do card. Três é o que cabe sem o card virar uma segunda tela de insights. */
const TETO_DO_CARD = 3;

export async function InsightsCard() {
  const vigentes = await getInsightsVigentes(new Date(), { limite: 12 });

  if (vigentes.length === 0) {
    return (
      <CardEmpty>
        Nenhuma análise vigente.{" "}
        <Link href="/ia/insights" className="underline underline-offset-2">
          Pedir uma em Insights
        </Link>
        . Elas não são geradas sozinhas.
      </CardEmpty>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {vigentes.slice(0, TETO_DO_CARD).map((insight) => (
          <li key={insight.id} className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {/* `min-w-0` no texto, `shrink-0` no badge: sem isso o título corta o badge. */}
              <p className="min-w-0 flex-1 truncate text-sm font-medium">
                {insight.titulo}
              </p>
              <Badge variant="secondary" className="shrink-0 text-xs">
                {NOME_DO_MODULO[insight.modulo]}
              </Badge>
            </div>
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {renderizarExplicacao(insight.resumo, insight.fontes)}
            </p>
          </li>
        ))}
      </ul>

      <Button asChild variant="outline" size="sm" className="w-full">
        <Link href="/ia/insights">
          {vigentes.length > TETO_DO_CARD
            ? `Ver todas as ${vigentes.length}`
            : "Abrir Insights"}
        </Link>
      </Button>
    </div>
  );
}
