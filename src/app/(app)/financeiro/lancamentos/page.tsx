import {
  getAccounts,
  getCategories,
  getCreditCards,
  getDailyBalances,
  getPeopleForSelect,
  getSubcategories,
  getTransactions,
  type TransactionFilters,
} from "@/lib/finance/queries";
import { sugereTerceiros } from "@/lib/finance/marcacao-da-categoria";
import { AvisoDeTeto } from "@/components/shared/aviso-de-teto";
import { TransactionsClient } from "./transactions-client";

export const dynamic = "force-dynamic";

function str(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}

export default async function LancamentosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  // 03-C2 · A6 (P5): só o valor exato "1" liga o filtro de categoria marcada.
  const filtroDeTerceirosLigado = sp.marcadas === "1";
  const filters: TransactionFilters = {
    type: str(sp.type),
    status: str(sp.status),
    accountId: str(sp.account),
    categoryId: str(sp.category),
    cardId: str(sp.card),
    month: str(sp.month),
    categoriasMarcadas: filtroDeTerceirosLigado,
  };

  const [leituraTx, accounts, categories, subcategories, cards, people] =
    await Promise.all([
      getTransactions(filters),
      getAccounts(),
      getCategories(),
      getSubcategories(),
      getCreditCards(),
      getPeopleForSelect(),
    ]);
  const transactions = leituraTx.linhas;

  const categoriasMarcadas = categories.filter((c) => sugereTerceiros(c.classificacao_padrao)).length;

  // Saldo de cada dia visível (extrato). Depende dos dias que a lista trouxe, então vem
  // depois dela. Devolve null quando não há saldo a mostrar (filtro de cartão, lista vazia).
  const dailyBalances = await getDailyBalances({
    accountId: filters.accountId,
    cardId: filters.cardId,
    dias: transactions.map((t) => t.competence_date),
  });

  // Lista pura: o teto de 500 vira aviso, não erro (K2, D-G5).
  return (
    <div className="space-y-4">
      <AvisoDeTeto leitura={leituraTx} oQue="lançamentos" />
      <TransactionsClient
        transactions={transactions}
        filtroDeTerceiros={{ ligado: filtroDeTerceirosLigado, categoriasMarcadas }}
        dailyBalances={dailyBalances}
        balanceScope={filters.accountId ? "conta" : "todas"}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          classificacao_padrao: c.classificacao_padrao,
        }))}
        subcategories={subcategories.map((s) => ({
          id: s.id,
          name: s.name,
          category_id: s.category_id,
        }))}
        cards={cards.map((c) => ({
          id: c.id,
          nome: c.nome,
          dia_fechamento: c.dia_fechamento,
          dia_vencimento: c.dia_vencimento,
        }))}
        people={people}
      />
    </div>
  );
}
