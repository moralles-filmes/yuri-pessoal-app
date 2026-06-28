import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import {
  getCreditCards,
  getPeople,
  getReceivables,
} from "@/lib/finance/queries";
import { hojeISO } from "@/lib/format";
import { TerceirosClient } from "./terceiros-client";

export const metadata: Metadata = { title: "A Receber" };
export const dynamic = "force-dynamic";

export default async function TerceirosPage() {
  const [receivables, people, cards] = await Promise.all([
    getReceivables(),
    getPeople(),
    getCreditCards(),
  ]);

  const currentMonth = hojeISO().slice(0, 7);

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
      />
    </div>
  );
}
