import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import {
  getAccounts,
  getCreditCards,
  getReceivablesByStatements,
  getStatementInstallmentItems,
  getStatements,
  getTransactions,
} from "@/lib/finance/queries";
import { hojeISO } from "@/lib/format";
import { StatementsClient } from "./statements-client";

export const metadata: Metadata = { title: "Faturas" };
export const dynamic = "force-dynamic";

function str(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}

export default async function FaturasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const cards = await getCreditCards();
  const accounts = await getAccounts();

  // Cartão selecionado: o da URL, senão o primeiro ativo, senão o primeiro.
  const selectedCardId =
    str(sp.card) ??
    cards.find((c) => c.ativo)?.id ??
    cards[0]?.id ??
    null;

  const [statements, transactions] = selectedCardId
    ? await Promise.all([
        getStatements({ cardId: selectedCardId }),
        getTransactions({ cardId: selectedCardId }),
      ])
    : [[], []];

  const statementIds = statements.map((s) => s.id).filter(Boolean) as string[];
  const [installmentItems, receivables] = selectedCardId
    ? await Promise.all([
        getStatementInstallmentItems(statementIds),
        getReceivablesByStatements(statementIds),
      ])
    : [[], []];

  const today = hojeISO();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Faturas"
        description="Faturas por cartão e mês: aberta, fechada, paga e atrasada."
      />
      <StatementsClient
        cards={cards.map((c) => ({
          id: c.id,
          nome: c.nome,
          cor: c.cor,
          dia_fechamento: c.dia_fechamento,
          dia_vencimento: c.dia_vencimento,
        }))}
        statements={statements}
        transactions={transactions}
        installmentItems={installmentItems}
        receivables={receivables}
        accounts={accounts
          .filter((a) => a.is_active)
          .map((a) => ({ id: a.id, name: a.name }))}
        today={today}
        selectedCardId={selectedCardId}
        month={str(sp.month) ?? null}
        status={str(sp.status) ?? null}
      />
    </div>
  );
}
