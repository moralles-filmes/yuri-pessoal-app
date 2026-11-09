import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { VisaoGeral } from "@/components/cartoes/visao-geral";
import { montarVisaoGeral } from "@/lib/finance/central-cartoes";
import {
  getCreditCards,
  getReceivablesByStatements,
  getStatements,
} from "@/lib/finance/queries";
import { hojeISO } from "@/lib/format";

export const metadata: Metadata = { title: "Cartões e faturas" };
export const dynamic = "force-dynamic";

/**
 * REDESIGN-05-A — Visão geral da central de cartões. Nenhuma regra aqui: as três leituras
 * (que lançam se vierem cortadas, e o `error.tsx` do segmento responde) alimentam a função pura
 * `montarVisaoGeral`, e a tela só formata.
 */
export default async function CartoesPage() {
  const hoje = hojeISO();
  const [cards, statements] = await Promise.all([getCreditCards(), getStatements()]);
  // Só os recebíveis das faturas que a tela PODE mostrar — um superconjunto das linhas de
  // `montarVisaoGeral` (toda linha real é não paga ou vence de hoje em diante). Mandar o
  // histórico inteiro faria o `in(...)` crescer sem teto com os anos de faturas.
  const relevantes = statements.filter((s) => !s.pago_em || s.data_vencimento >= hoje);
  const receivables = await getReceivablesByStatements(relevantes.map((s) => s.id));
  const visao = montarVisaoGeral({ hoje, cards, statements, receivables });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <PageHeader
          title="Cartões e faturas"
          description="O que está fechado para pagar e o que ainda está acumulando, por cartão."
        />
        <p className="border-l-2 border-primary pl-2 text-xs text-muted-on-fog">
          Valores por fatura do cartão. Minha parte = total − parte dos terceiros.
        </p>
      </div>

      <VisaoGeral visao={visao} />
    </div>
  );
}
