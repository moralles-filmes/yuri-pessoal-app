import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import {
  getCreditCards,
  getPeople,
  lerRecebiveis,
} from "@/lib/finance/queries";
import { hojeISO } from "@/lib/format";
import { exigirCompleta, LeituraIncompleta } from "@/lib/supabase/leitura";
import { ROTULOS_DE_LEITURA } from "@/lib/finance/rotulos-de-leitura";
import { TerceirosClient } from "./terceiros-client";

export const metadata: Metadata = { title: "A Receber" };
export const dynamic = "force-dynamic";

export default async function TerceirosPage() {
  const [receivables, people, cards] = await Promise.all([
    // A tela SOMA "a receber" por pessoa e por mês: recebíveis OU recebimentos cortados são
    // erro aqui, nunca um saldo afirmado sobre parte deles (D-G9, D-G29).
    lerRecebiveis().then((l) => {
      if (l.situacaoDosRecebimentos !== "completa") {
        throw new LeituraIncompleta(ROTULOS_DE_LEITURA.recebimentos, l.recebimentosLidos, null);
      }
      return exigirCompleta(l, ROTULOS_DE_LEITURA.recebiveis);
    }),
    getPeople(),
    getCreditCards(),
  ]);

  const hoje = hojeISO();
  const currentMonth = hoje.slice(0, 7);

  return (
    <div className="space-y-6">
      <PageHeader
        title="A Receber de Terceiros"
        description="Divisão de gastos, recebíveis por pessoa e cadastro de terceiros."
      />
      <TerceirosClient
        receivables={receivables}
        people={people}
        cards={cards.map((c) => ({ id: c.id, nome: c.nome }))}
        currentMonth={currentMonth}
        hoje={hoje}
      />
    </div>
  );
}
