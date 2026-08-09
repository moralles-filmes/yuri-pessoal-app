/**
 * Camada de leitura do financeiro (Fase 02). Server-only: usada por Server
 * Components. A RLS garante que cada query retorna apenas os dados do usuário.
 *
 * ⚠️ **Fase 18-E (Bloco 4) — cinco funções aceitam `owner`.** Quando ele vem, quem lê é o
 * Cron com service role, que IGNORA a RLS: a frase acima deixa de valer e o escopo do
 * usuário passa a ser o `.eq("user_id", …)` explícito. Sem `owner`, o caminho é byte por
 * byte o de antes. Ver `src/lib/supabase/owner.ts`.
 */
import { createClient } from "@/lib/supabase/server";
import type { LeituraDoDono } from "@/lib/supabase/owner";
import { toDateInputValue } from "@/lib/format";
import { SETTLED_STATUSES } from "@/lib/finance/constants";
import {
  saldosPorDia,
  type MovimentoDeSaldo,
} from "@/lib/finance/daily-balance";
import type {
  AccountWithBalance,
  BillRow,
  CardStatementWithTotal,
  CategoryRow,
  CreditCardRow,
  ImportBatchWithTarget,
  ImportRowWithRelations,
  InstallmentPurchaseWithRelations,
  PersonWithCounts,
  ReceivableWithPerson,
  ReceivableWithRelations,
  RecurringTransactionRow,
  StatementInstallmentItem,
  SubcategoryRow,
  TransactionWithRelations,
} from "@/types/database";

const TX_SELECT =
  "*, account:accounts!transactions_account_id_fkey(id,name,color), transfer_account:accounts!transactions_transfer_account_id_fkey(id,name), category:categories(id,name,color,icon), subcategory:subcategories(id,name), card:credit_cards(id,nome,cor,bandeira), statement:card_statements!transactions_statement_id_fkey(id,pago_em)";

/**
 * Partes da divisão com o nome de cada pessoa — o que faz a lista dizer DE QUEM é o gasto, e
 * não só "meu R$ X". Fica fora do `TX_SELECT` base de propósito: `getTransactionsRange` varre
 * até 2000 linhas para relatórios/dashboard, que agregam por valor e não precisam de nome.
 */
const TX_SHARED_EMBED =
  ", shared:shared_expenses!shared_expenses_transaction_id_fkey(person_id,valor,person:people(id,nome))";

export async function getAccounts(
  owner?: LeituraDoDono,
): Promise<AccountWithBalance[]> {
  const supabase = owner?.client ?? (await createClient());
  // `accounts_with_balance` é VIEW: sob service role a RLS dela não filtra nada, e o
  // `user_id` que ela expõe é o único escopo que sobra.
  const base = supabase.from("accounts_with_balance").select("*");
  const { data } = await (owner ? base.eq("user_id", owner.userId) : base)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });
  return (data ?? []) as AccountWithBalance[];
}

export async function getCategories(): Promise<CategoryRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return (data ?? []) as CategoryRow[];
}

/**
 * Igual a getCategories, mas semeia as 16 categorias padrão se o usuário ainda
 * não tiver nenhuma. Seguro no render (não chama revalidatePath).
 */
export async function getCategoriesEnsureSeed(): Promise<CategoryRow[]> {
  const supabase = await createClient();
  const first = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (first.data && first.data.length > 0) {
    return first.data as CategoryRow[];
  }

  await supabase.rpc("seed_default_categories");
  const { data } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return (data ?? []) as CategoryRow[];
}

export async function getSubcategories(): Promise<SubcategoryRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subcategories")
    .select("*")
    .order("name", { ascending: true });
  return (data ?? []) as SubcategoryRow[];
}

export type TransactionFilters = {
  type?: string;
  status?: string;
  accountId?: string;
  categoryId?: string;
  cardId?: string;
  statementId?: string;
  month?: string; // 'yyyy-MM'
};

export async function getTransactions(
  filters: TransactionFilters = {},
): Promise<TransactionWithRelations[]> {
  const supabase = await createClient();
  let query = supabase
    .from("transactions")
    .select(TX_SELECT + TX_SHARED_EMBED)
    .order("competence_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (filters.type) query = query.eq("type", filters.type);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.accountId) query = query.eq("account_id", filters.accountId);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.cardId) query = query.eq("card_id", filters.cardId);
  if (filters.statementId) query = query.eq("statement_id", filters.statementId);
  if (filters.month && /^\d{4}-\d{2}$/.test(filters.month)) {
    const [y, m] = filters.month.split("-").map(Number);
    const start = `${filters.month}-01`;
    const end = toDateInputValue(new Date(y, m, 0));
    query = query.gte("competence_date", start).lte("competence_date", end);
  }

  const { data } = await query;
  return (data ?? []) as unknown as TransactionWithRelations[];
}

export type DailyBalanceFilters = {
  /** Conta filtrada. Ausente = todas as contas somadas. */
  accountId?: string;
  /** Cartão filtrado. Presente = não há saldo a mostrar (cartão não move conta). */
  cardId?: string;
  /** Dias visíveis na lista ('yyyy-MM-dd'), em qualquer ordem. */
  dias: string[];
};

/**
 * Saldo de conta no fim de cada dia visível da lista de lançamentos (extrato).
 *
 * Devolve `null` quando não existe saldo a exibir: filtro de cartão ligado (compra de cartão
 * não move conta — quem move é o pagamento da fatura) ou lista vazia.
 *
 * **O saldo ignora os demais filtros de propósito.** Com um filtro de categoria ou tipo a
 * lista encolhe, mas o saldo continua sendo o saldo VERDADEIRO da(s) conta(s) naquele dia —
 * por isso a janela é buscada aqui, e não derivada das linhas que a tela recebeu.
 *
 * Duas idas ao banco: o saldo de abertura (um escalar, via `account_balance_before`) e os
 * movimentos da janela. A acumulação dia a dia é pura (`saldosPorDia`).
 */
export async function getDailyBalances(
  filters: DailyBalanceFilters,
): Promise<Record<string, number> | null> {
  if (filters.cardId) return null;

  const dias = [...new Set(filters.dias)].sort();
  if (dias.length === 0) return null;

  const from = dias[0];
  const to = dias[dias.length - 1];
  const escopo = filters.accountId ?? null;

  const supabase = await createClient();

  let movimentosQuery = supabase
    .from("transactions")
    .select(
      "competence_date,type,status,amount,account_id,transfer_account_id",
    )
    .gte("competence_date", from)
    .lte("competence_date", to)
    .in("status", SETTLED_STATUSES)
    .limit(5000);

  // Espelha o join de `account_balance_before`: só entra o que toca alguma conta.
  movimentosQuery = escopo
    ? movimentosQuery.or(
        `account_id.eq.${escopo},transfer_account_id.eq.${escopo}`,
      )
    : movimentosQuery.or(
        "account_id.not.is.null,transfer_account_id.not.is.null",
      );

  const [aberturaRes, movimentosRes] = await Promise.all([
    supabase.rpc("account_balance_before", {
      // Os tipos gerados não expressam argumento nulável: `null` aqui é o escopo válido
      // "todas as contas somadas", que a própria função SQL trata (`p_account_id is null`).
      p_account_id: escopo as unknown as string,
      p_date: from,
    }),
    movimentosQuery,
  ]);

  // Sem saldo de abertura não há extrato: um saldo que começa do zero seria mentira.
  if (aberturaRes.error || aberturaRes.data == null) return null;
  if (movimentosRes.error) return null;

  const saldos = saldosPorDia({
    abertura: Number(aberturaRes.data),
    escopo,
    dias,
    movimentos: (movimentosRes.data ?? []) as unknown as MovimentoDeSaldo[],
  });

  return Object.fromEntries(saldos);
}

export type TransactionRangeFilters = {
  /** 'yyyy-MM-dd' inclusivo (filtra por competence_date). */
  from: string;
  /** 'yyyy-MM-dd' inclusivo (filtra por competence_date). */
  to: string;
};

/**
 * Lançamentos por intervalo de competência (Fase 07 — dashboard). Diferente de
 * `getTransactions` (single-month, limite 500), busca uma JANELA de meses (ex.: últimos 6
 * + próximos 6) numa única consulta para alimentar as agregações do dashboard sem N+1.
 * Sem filtro de type/status — o dashboard separa entradas/saídas e exclui `cancelado` em TS.
 * RLS garante que só vêm os dados do usuário.
 */
export async function getTransactionsRange(
  filters: TransactionRangeFilters,
  owner?: LeituraDoDono,
): Promise<TransactionWithRelations[]> {
  const supabase = owner?.client ?? (await createClient());
  const base = supabase
    .from("transactions")
    .select(TX_SELECT)
    .gte("competence_date", filters.from)
    .lte("competence_date", filters.to);
  const { data } = await (owner ? base.eq("user_id", owner.userId) : base)
    .order("competence_date", { ascending: true })
    .limit(2000);
  return (data ?? []) as unknown as TransactionWithRelations[];
}

/* ───────────────────────── Fase 03 — Cartões & Faturas ───────────────────────── */

export async function getCreditCards(): Promise<CreditCardRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("credit_cards")
    .select("*")
    .order("ativo", { ascending: false })
    .order("nome", { ascending: true });
  return (data ?? []) as CreditCardRow[];
}

/**
 * A fatura de um cartão numa competência — ou `null` quando ela ainda não existe.
 *
 * ⚠️ 18-C · Bloco 4 — "ainda não existe" é uma resposta legítima e importante: a fatura só é
 * criada quando o primeiro lançamento cai nela. Quem pergunta (a previsão do command) precisa
 * distinguir "não existe, logo está aberta" de "existe e está paga".
 */
export async function getStatementByCompetencia(
  cardId: string,
  competencia: string,
): Promise<{ data_fechamento: string; data_vencimento: string; pago_em: string | null } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("card_statements")
    .select("data_fechamento, data_vencimento, pago_em")
    .eq("card_id", cardId)
    .eq("competencia", competencia)
    .maybeSingle();
  return data ?? null;
}

/** Os dias de fechamento e vencimento de um cartão — o que `resolverFatura` precisa. */
export async function getCardBillingDays(
  cardId: string,
): Promise<{ dia_fechamento: number; dia_vencimento: number } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("credit_cards")
    .select("dia_fechamento, dia_vencimento")
    .eq("id", cardId)
    .maybeSingle();
  return data ?? null;
}

/** Uma transação pelo id, com o mínimo para identificá-la numa tela de confirmação. */
export async function getTransactionById(id: string): Promise<{
  id: string;
  description: string | null;
  amount: number;
  type: string;
  transfer_group_id: string | null;
} | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select("id, description, amount, type, transfer_group_id")
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

/**
 * 18-D — as CANDIDATAS a "já lancei isso": mesmo dia e mesmo valor.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ ELA NÃO DECIDE NADA. Quem decide se há duplicidade é `vision/duplicates.ts`, que    ║
 * ║ exige o TRIO (valor + data + estabelecimento) e ainda assim só SINALIZA.               ║
 * ║                                                                                       ║
 * ║ A consulta mora aqui, e não dentro do módulo de IA, pela mesma razão que               ║
 * ║ `getCardBillingDays` nasceu na 18-C: consulta a `transactions` montada dentro de       ║
 * ║ `src/lib/ai/` é a porta pela qual a regra do domínio começa a ser reescrita —          ║
 * ║ primeiro o `select`, depois o filtro, depois a decisão.                                ║
 * ║                                                                                       ║
 * ║ ⚠️ **Parcela lançada NÃO está em `transactions`** (bug real de 2026-08-06): a compra   ║
 * ║ parcelada guarda só a compra-pai aqui, e quem ocupa a fatura de cada mês é             ║
 * ║ `transaction_installments`. Um comprovante de UMA parcela não vai casar com nada por   ║
 * ║ este caminho — e é melhor não sinalizar do que sinalizar errado, porque o alerta que   ║
 * ║ mente ensina o dono a ignorar todos.                                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ **`transactions.amount` É `numeric(14,2)` EM REAIS — NÃO É INTEIRO EM CENTAVOS.**
 *
 * A extração trabalha em centavos (é o que `vision/schema.ts` pede ao modelo, para não
 * depender de o modelo acertar vírgula ou ponto). A conversão acontece AQUI, na fronteira, e
 * num ponto só: comparar 4790 com 47.90 não casaria com nada, e o alerta de duplicidade
 * simplesmente nunca apareceria — uma falha silenciosa, que é a pior espécie.
 *
 * O teto existe porque um dia com muitos lançamentos do mesmo valor não deve virar uma tela
 * de alertas.
 */
export const TETO_DE_CANDIDATAS_DO_COMPROVANTE = 10;

export async function getTransactionsForReceiptMatch(input: {
  dataISO: string;
  valorCentavos: number;
}): Promise<
  { id: string; description: string | null; purchase_date: string; amount: number }[]
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select("id, description, purchase_date, amount")
    .eq("purchase_date", input.dataISO)
    .eq("amount", input.valorCentavos / 100)
    .limit(TETO_DE_CANDIDATAS_DO_COMPROVANTE);
  return data ?? [];
}

export type StatementFilters = {
  cardId?: string;
  month?: string; // 'yyyy-MM' (filtra pela competência)
};

/**
 * Faturas com total calculado na leitura (view card_statements_with_total) e o cartão
 * embutido. O status efetivo (aberta/fechada/atrasada) é resolvido na UI com a data de
 * hoje via `statusEfetivo`; aqui só trazemos os dados crus.
 *
 * Só retorna faturas com pelo menos UM lançamento (`itens > 0`). Faturas vazias surgem do
 * get-or-create (ex.: parcela cancelada/movida deixa a competência sem itens) e não são
 * faturas reais — não devem listar nem contar como "atrasada".
 */
export async function getStatements(
  filters: StatementFilters = {},
  owner?: LeituraDoDono,
): Promise<CardStatementWithTotal[]> {
  const supabase = owner?.client ?? (await createClient());
  let query = supabase
    .from("card_statements_with_total")
    .select(
      "*, card:credit_cards(id,nome,cor,bandeira,dia_fechamento,dia_vencimento)",
    )
    .gt("itens", 0)
    .order("competencia", { ascending: false });

  // VIEW, mesma nota de `getAccounts`.
  if (owner) query = query.eq("user_id", owner.userId);
  if (filters.cardId) query = query.eq("card_id", filters.cardId);
  if (filters.month && /^\d{4}-\d{2}$/.test(filters.month)) {
    query = query.eq("competencia", `${filters.month}-01`);
  }

  const { data } = await query;
  return (data ?? []) as unknown as CardStatementWithTotal[];
}

/* ───────────────────────────── Fase 04 — Parcelamentos ───────────────────────────── */

// `shared` = a parte TOTAL de cada pessoa na compra (com o nome); `receivables` = a parte
// dela em CADA parcela. Os dois são precisos: o card mostra o total por pessoa e a lista
// expandida mostra quanto daquela parcela é de quem.
//
// ⚠️ Os dois embeds levam a FK EXPLÍCITA. `receivables` alcança `transactions` por dois
// caminhos (direto por `transaction_id` e via `shared_expenses`/`transaction_installments`),
// e ambiguidade de embedding do PostgREST só estoura em RUNTIME — como o `42P10` do
// `ON CONFLICT` que a Fase 16 documentou.
const INSTALLMENT_PURCHASE_SELECT =
  "*, card:credit_cards(id,nome,cor,bandeira,dia_fechamento,dia_vencimento), category:categories(id,name,color,icon), installments:transaction_installments(*, statement:card_statements(id,competencia,data_fechamento,data_vencimento,pago_em)), shared:shared_expenses!shared_expenses_transaction_id_fkey(person_id,valor,person:people(id,nome)), receivables!receivables_transaction_id_fkey(id,installment_id,person_id,valor,status)";

export type InstallmentPurchaseFilters = {
  cardId?: string;
  categoryId?: string;
};

/**
 * Compras parceladas (transações "pai" com `parcelado = true`) já com cartão, categoria e
 * todas as parcelas (cada uma com a sua fatura embutida, para derivar status na leitura).
 * O filtro de status do parcelamento é DERIVADO — aplicado na UI, não na query.
 */
export async function getInstallmentPurchases(
  filters: InstallmentPurchaseFilters = {},
): Promise<InstallmentPurchaseWithRelations[]> {
  const supabase = await createClient();
  let query = supabase
    .from("transactions")
    .select(INSTALLMENT_PURCHASE_SELECT)
    .eq("parcelado", true)
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (filters.cardId) query = query.eq("card_id", filters.cardId);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);

  const { data } = await query;
  const rows = (data ?? []) as unknown as InstallmentPurchaseWithRelations[];
  // A embedding não garante ordem; ordena as parcelas por número.
  for (const r of rows) {
    r.installments?.sort((a, b) => a.numero - b.numero);
  }
  return rows;
}

/**
 * Parcelas (não canceladas) que caem nas faturas informadas, já com a compra "pai" embutida
 * (descrição + categoria) e o "i/N". Usado pela tela /faturas para listar os itens de parcela
 * junto com os lançamentos à vista de cada fatura.
 */
export async function getStatementInstallmentItems(
  statementIds: string[],
): Promise<StatementInstallmentItem[]> {
  if (statementIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("transaction_installments")
    .select(
      // `classificacao` vem do PAI porque é dele que a divisão é: a parcela herda o rateio,
      // não o declara. É o que deixa a fatura dizer "Compartilhada"/"De terceiro" item a item
      // sem deduzir do valor (minha parte zero não prova que a compra é toda de terceiro).
      "*, parent:transactions!transaction_installments_parent_transaction_id_fkey(id,description,classificacao,category:categories(id,name,color))",
    )
    .in("statement_id", statementIds)
    .neq("status", "cancelada")
    .order("numero", { ascending: true });
  return (data ?? []) as unknown as StatementInstallmentItem[];
}

export async function getBills(owner?: LeituraDoDono): Promise<
  (BillRow & {
    category: Pick<CategoryRow, "id" | "name" | "color"> | null;
    account: { id: string; name: string } | null;
  })[]
> {
  const supabase = owner?.client ?? (await createClient());
  const base = supabase
    .from("bills")
    .select("*, category:categories(id,name,color), account:accounts(id,name)");
  const { data } = await (owner ? base.eq("user_id", owner.userId) : base)
    .order("is_active", { ascending: false })
    .order("due_day", { ascending: true });
  return (data ?? []) as unknown as (BillRow & {
    category: Pick<CategoryRow, "id" | "name" | "color"> | null;
    account: { id: string; name: string } | null;
  })[];
}

export async function getRecurrences(): Promise<
  (RecurringTransactionRow & {
    account: { id: string; name: string } | null;
    card: { id: string; nome: string } | null;
    category: Pick<CategoryRow, "id" | "name" | "color"> | null;
  })[]
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recurring_transactions")
    .select(
      "*, account:accounts(id,name), card:credit_cards(id,nome), category:categories(id,name,color)",
    )
    .order("is_active", { ascending: false })
    .order("next_due_date", { ascending: true });
  return (data ?? []) as unknown as (RecurringTransactionRow & {
    account: { id: string; name: string } | null;
    card: { id: string; nome: string } | null;
    category: Pick<CategoryRow, "id" | "name" | "color"> | null;
  })[];
}

/* ───────────────────── Fase 05 — Gastos de Terceiros & Divisão ───────────────────── */

const RECEIVABLE_SELECT =
  "*, person:people(id,nome,email), card:credit_cards(id,nome,cor,bandeira), statement:card_statements(id,competencia,data_vencimento), transaction:transactions!receivables_transaction_id_fkey(id,description,purchase_date)";

/** Pessoas (terceiros) com a contagem de recebíveis vinculados (para excluir vs inativar). */
export async function getPeople(): Promise<PersonWithCounts[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("people")
    .select("*, receivables(count)")
    .order("ativo", { ascending: false })
    .order("nome", { ascending: true });
  return ((data ?? []) as unknown as (PersonWithCounts & {
    receivables: { count: number }[];
  })[]).map((p) => ({
    ...p,
    receivables_count: p.receivables?.[0]?.count ?? 0,
  }));
}

/** Pessoas ativas (id + nome) para o seletor de divisão no form de lançamento. */
export async function getPeopleForSelect(): Promise<
  { id: string; nome: string }[]
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("people")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome", { ascending: true });
  return (data ?? []) as { id: string; nome: string }[];
}

/**
 * Recebíveis com pessoa, cartão, fatura e transação de origem embutidos. Single-user:
 * traz tudo (limite alto) e a aba "A Receber" filtra/agrupa no client (pessoa/mês/cartão/status).
 */
export async function getReceivables(
  owner?: LeituraDoDono,
): Promise<ReceivableWithRelations[]> {
  const supabase = owner?.client ?? (await createClient());
  const base = supabase.from("receivables").select(RECEIVABLE_SELECT);
  const { data } = await (owner ? base.eq("user_id", owner.userId) : base)
    .order("created_at", { ascending: false })
    .limit(1000);
  return (data ?? []) as unknown as ReceivableWithRelations[];
}

/**
 * Recebíveis das faturas informadas, com a pessoa embutida. Usado na tela /faturas para
 * mostrar "valor de terceiros" e "quem paga e quanto" por fatura.
 */
export async function getReceivablesByStatements(
  statementIds: string[],
): Promise<ReceivableWithPerson[]> {
  if (statementIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("receivables")
    .select("*, person:people(id,nome)")
    .in("statement_id", statementIds);
  return (data ?? []) as unknown as ReceivableWithPerson[];
}

/* ───────────────────── Fase 06 — Importação (Excel/CSV/OFX) ───────────────────── */

// `dia_fechamento`/`dia_vencimento` entram porque a revisão compara a última data do arquivo
// com o fechamento da fatura de destino (ver `coberturaDaFatura`) — arquivo que termina antes
// do fechamento importa fatura incompleta, e isso não aparece em nenhum outro lugar.
const IMPORT_BATCH_SELECT =
  "*, card:credit_cards(id,nome,cor,bandeira,dia_fechamento,dia_vencimento), account:accounts(id,name)";

/** Lotes de importação (histórico), do mais recente ao mais antigo, com o alvo resolvido. */
export async function getImportBatches(): Promise<ImportBatchWithTarget[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("import_batches")
    .select(IMPORT_BATCH_SELECT)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []) as unknown as ImportBatchWithTarget[];
}

/** Um lote específico (para a tela de revisão/resultado). */
export async function getImportBatch(
  id: string,
): Promise<ImportBatchWithTarget | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("import_batches")
    .select(IMPORT_BATCH_SELECT)
    .eq("id", id)
    .maybeSingle();
  return (data ?? null) as unknown as ImportBatchWithTarget | null;
}

/** Linhas de um lote (ordenadas pela linha original) com categoria e transação embutidas. */
export async function getImportRows(
  batchId: string,
): Promise<ImportRowWithRelations[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("import_rows")
    .select(
      "*, categoria:categories(id,name,color), transaction:transactions!import_rows_transaction_id_fkey(id,description)",
    )
    .eq("import_batch_id", batchId)
    .order("linha_index", { ascending: true });
  return (data ?? []) as unknown as ImportRowWithRelations[];
}
