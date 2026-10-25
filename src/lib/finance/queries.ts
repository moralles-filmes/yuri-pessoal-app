/**
 * Camada de leitura do financeiro (Fase 02). Server-only: usada por Server
 * Components. A RLS garante que cada query retorna apenas os dados do usuário.
 *
 * ⚠️ **Fase 18-E / 03-B2 — oito funções aceitam `owner`.** Quando ele vem, quem lê é o
 * Cron com service role, que IGNORA a RLS: a frase acima deixa de valer e o escopo do
 * usuário passa a ser o `.eq("user_id", …)` explícito. Sem `owner`, o caminho é byte por
 * byte o de antes. Ver `src/lib/supabase/owner.ts`.
 *
 * 03-G — toda leitura passa por `exigir` / `listaComTeto` / `listaCompleta` (`src/lib/supabase/
 * leitura.ts`) e LANÇA `ErroDeLeitura` no erro. Zero volta a significar "medido zero", nunca
 * "não li": a lista que falhou não vira `[]`. Quem decide o teto é o chamador (`LeituraComTeto`)
 * ou o próprio helper (`listaCompleta`, quando a lista alimenta número).
 */
import { createClient } from "@/lib/supabase/server";
import type { LeituraDoDono } from "@/lib/supabase/owner";
import {
  exigir,
  exigirCompleta,
  leituraComTeto,
  listaCompleta,
  listaComTeto,
  type LeituraComTeto,
  type RespostaDoBanco,
} from "@/lib/supabase/leitura";
import { ROTULOS_DE_LEITURA } from "@/lib/finance/rotulos-de-leitura";
import { toDateInputValue } from "@/lib/format";
import { SETTLED_STATUSES } from "@/lib/finance/constants";
import { idsDasCategoriasMarcadas } from "@/lib/finance/categorias-marcadas";
import { anexarRecebimentos } from "@/lib/finance/recebimentos";
import { lerRecebimentos } from "@/lib/finance/recebimentos-leitura";
import {
  filtroDoExtrato,
  saldosPorDia,
  type MovimentoDeSaldo,
} from "@/lib/finance/daily-balance";
import { dataDeCaixa } from "@/lib/finance/caixa";
import {
  completudeDe,
  lancamentosForaDoDominio,
  montarEntradas,
  type CompletudeFinanceira,
  type EntradasDoEscopo,
  type EscopoFinanceiro,
  type JanelaFinanceira,
  type LinhasFinanceiras,
} from "@/lib/finance/pipeline";
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

/** Alias local do rótulo: as linhas abaixo ficam legíveis (`R.lancamentos`). */
const R = ROTULOS_DE_LEITURA;

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
  const base = supabase.from("accounts_with_balance").select("*", { count: "exact" });
  const res = await (owner ? base.eq("user_id", owner.userId) : base)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });
  return listaCompleta(res as RespostaDoBanco<AccountWithBalance[] | null>, R.contas);
}

export async function getCategories(): Promise<CategoryRow[]> {
  const supabase = await createClient();
  const res = await supabase
    .from("categories")
    .select("*", { count: "exact" })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return listaCompleta(res as RespostaDoBanco<CategoryRow[] | null>, R.categorias);
}

/**
 * Igual a getCategories, mas semeia as 16 categorias padrão se o usuário ainda
 * não tiver nenhuma. Seguro no render (não chama revalidatePath).
 *
 * 03-G: erro de leitura LANÇA (não vira "sem categorias, semear"). O `rpc` de seed fica
 * exatamente como estava (D-G24).
 */
export async function getCategoriesEnsureSeed(): Promise<CategoryRow[]> {
  const supabase = await createClient();
  const first = listaCompleta(
    (await supabase
      .from("categories")
      .select("*", { count: "exact" })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })) as RespostaDoBanco<CategoryRow[] | null>,
    R.categorias,
  );

  if (first.length > 0) return first;

  await supabase.rpc("seed_default_categories");
  return listaCompleta(
    (await supabase
      .from("categories")
      .select("*", { count: "exact" })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })) as RespostaDoBanco<CategoryRow[] | null>,
    R.categorias,
  );
}

export async function getSubcategories(): Promise<SubcategoryRow[]> {
  const supabase = await createClient();
  const res = await supabase
    .from("subcategories")
    .select("*", { count: "exact" })
    .order("name", { ascending: true });
  return listaCompleta(res as RespostaDoBanco<SubcategoryRow[] | null>, R.subcategorias);
}

export type TransactionFilters = {
  type?: string;
  status?: string;
  accountId?: string;
  categoryId?: string;
  cardId?: string;
  statementId?: string;
  month?: string; // 'yyyy-MM'
  /** 03-C2 · A6 (K1): só lançamentos em categoria marcada como de terceiros. Peneira; não decide. */
  categoriasMarcadas?: boolean;
};

/**
 * Lançamentos do mês/filtro, até o teto de 500 (`LeituraComTeto`, D-G7).
 *
 * A mesma leitura serve três telas com respostas DIFERENTES ao teto, e a decisão é do chamador:
 * `/financeiro` (soma Entradas/Saídas) exige a lista completa; `/financeiro/lancamentos` e
 * `/faturas` mostram o aviso de teto. Por isso esta função NÃO decide nada sobre o corte.
 * Erro de leitura LANÇA (03-G).
 */
export async function getTransactions(
  filters: TransactionFilters = {},
): Promise<LeituraComTeto<TransactionWithRelations>> {
  const supabase = await createClient();
  let query = supabase
    .from("transactions")
    .select(TX_SELECT + TX_SHARED_EMBED, { count: "exact" })
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
  if (filters.categoriasMarcadas) {
    const ids = await idsDasCategoriasMarcadas(supabase);
    if (ids.length === 0) return leituraComTeto<TransactionWithRelations>([], 0);
    query = query.in("category_id", ids);
  }

  const res = await query;
  return listaComTeto(
    res as unknown as RespostaDoBanco<TransactionWithRelations[] | null>,
    R.lancamentos,
  );
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
 *
 * K1: desde a M2b o saldo corta pela DATA DE CAIXA (`liquidado_em` ?? `competence_date`), o
 * mesmo corte de `account_balance_before`. `dias` segue vindo das competências da lista (o
 * cabeçalho do grupo é o dia da competência); o saldo dele é o do FIM daquele dia pela data
 * de caixa.
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

  // P11: o `.or(...)` só AFUNILA (escopo + janela por data de caixa); a decisão final é a
  // refiltragem em memória logo abaixo. K1: a janela é por data de caixa, não por competência.
  let movimentosQuery = supabase
    .from("transactions")
    .select(
      "competence_date,liquidado_em,type,status,amount,account_id,transfer_account_id",
    )
    .in("status", SETTLED_STATUSES)
    .limit(5000);

  movimentosQuery = movimentosQuery.or(
    filtroDoExtrato(escopo, { de: from, ate: to }),
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

  const lidas = (movimentosRes.data ?? []) as unknown as MovimentoDeSaldo[];
  // P11: refiltra pela data de caixa, em memória — o PostgREST afunila, não decide.
  const movimentos = lidas.filter((m) => {
    const { data } = dataDeCaixa({
      liquidado_em: m.liquidado_em ?? null,
      competence_date: m.competence_date,
    });
    return data >= from && data <= to;
  });

  const saldos = saldosPorDia({
    abertura: Number(aberturaRes.data),
    escopo,
    dias,
    movimentos,
  });

  return Object.fromEntries(saldos);
}

export type TransactionRangeFilters = {
  /** 'yyyy-MM-dd' inclusivo (filtra por competence_date). */
  from: string;
  /** 'yyyy-MM-dd' inclusivo (filtra por competence_date). */
  to: string;
};

export const TETO_DE_LANCAMENTOS = 2000;
export const TETO_DE_RECEBIVEIS = 1000;

export type { LeituraComTeto };

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
): Promise<LeituraComTeto<TransactionWithRelations>> {
  const supabase = owner?.client ?? (await createClient());
  const base = supabase
    .from("transactions")
    .select(TX_SELECT, { count: "exact" })
    .gte("competence_date", filters.from)
    .lte("competence_date", filters.to);
  const res = await (owner ? base.eq("user_id", owner.userId) : base)
    .order("competence_date", { ascending: true })
    .limit(TETO_DE_LANCAMENTOS);
  return listaComTeto(
    res as unknown as RespostaDoBanco<TransactionWithRelations[] | null>,
    R.lancamentos,
  );
}

/* ───────────────────────── Fase 03 — Cartões & Faturas ───────────────────────── */

export async function getCreditCards(
  owner?: LeituraDoDono,
): Promise<CreditCardRow[]> {
  const supabase = owner?.client ?? (await createClient());
  const base = supabase.from("credit_cards").select("*", { count: "exact" });
  const res = await (owner ? base.eq("user_id", owner.userId) : base)
    .order("ativo", { ascending: false })
    .order("nome", { ascending: true });
  return listaCompleta(res as RespostaDoBanco<CreditCardRow[] | null>, R.cartoes);
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
  const res = await supabase
    .from("card_statements")
    .select("data_fechamento, data_vencimento, pago_em")
    .eq("card_id", cardId)
    .eq("competencia", competencia)
    .maybeSingle();
  return (
    exigir(
      res as RespostaDoBanco<{
        data_fechamento: string;
        data_vencimento: string;
        pago_em: string | null;
      } | null>,
      R.fatura,
    ) ?? null
  );
}

/** Os dias de fechamento e vencimento de um cartão — o que `resolverFatura` precisa. */
export async function getCardBillingDays(
  cardId: string,
): Promise<{ dia_fechamento: number; dia_vencimento: number } | null> {
  const supabase = await createClient();
  const res = await supabase
    .from("credit_cards")
    .select("dia_fechamento, dia_vencimento")
    .eq("id", cardId)
    .maybeSingle();
  return (
    exigir(
      res as RespostaDoBanco<{ dia_fechamento: number; dia_vencimento: number } | null>,
      R.cartao,
    ) ?? null
  );
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
  const res = await supabase
    .from("transactions")
    .select("id, description, amount, type, transfer_group_id")
    .eq("id", id)
    .maybeSingle();
  return (
    exigir(
      res as RespostaDoBanco<{
        id: string;
        description: string | null;
        amount: number;
        type: string;
        transfer_group_id: string | null;
      } | null>,
      R.lancamento,
    ) ?? null
  );
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
  const res = await supabase
    .from("transactions")
    .select("id, description, purchase_date, amount")
    .eq("purchase_date", input.dataISO)
    .eq("amount", input.valorCentavos / 100)
    .limit(TETO_DE_CANDIDATAS_DO_COMPROVANTE);
  // SEM `count`, de propósito: o corte em 10 é REGRA, não corte silencioso (D-G28). Com
  // `listaCompleta`, 11 candidatas derrubariam `/ia/comprovantes`.
  return (
    exigir(
      res as RespostaDoBanco<
        { id: string; description: string | null; purchase_date: string; amount: number }[] | null
      >,
      R.candidatasDoComprovante,
    ) ?? []
  );
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
      { count: "exact" },
    )
    .gt("itens", 0)
    .order("competencia", { ascending: false });

  // VIEW, mesma nota de `getAccounts`.
  if (owner) query = query.eq("user_id", owner.userId);
  if (filters.cardId) query = query.eq("card_id", filters.cardId);
  if (filters.month && /^\d{4}-\d{2}$/.test(filters.month)) {
    query = query.eq("competencia", `${filters.month}-01`);
  }

  const res = await query;
  return listaCompleta(
    res as unknown as RespostaDoBanco<CardStatementWithTotal[] | null>,
    R.faturas,
  );
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
  "*, card:credit_cards(id,nome,cor,bandeira,dia_fechamento,dia_vencimento), category:categories(id,name,color,icon), installments:transaction_installments(*, statement:card_statements(id,competencia,data_fechamento,data_vencimento,pago_em)), shared:shared_expenses!shared_expenses_transaction_id_fkey(person_id,valor,person:people(id,nome)), receivables!receivables_transaction_id_fkey(id,installment_id,person_id,valor,status,pago_em)";

export type InstallmentPurchaseFilters = {
  cardId?: string;
  categoryId?: string;
};

/**
 * Compras parceladas (transações "pai" com `parcelado = true`) já com cartão, categoria e
 * todas as parcelas (cada uma com a sua fatura embutida, para derivar status na leitura).
 * O filtro de status do parcelamento é DERIVADO — aplicado na UI, não na query.
 *
 * `LeituraComTeto` (teto de 500): a tela SOMA (StatCards), então o chamador exige a lista
 * completa (D-G5). Recebimentos saturados já são erro aqui (D-G29), porque o saldo de cada
 * parcela sairia afirmado sobre um conjunto cortado.
 */
export async function getInstallmentPurchases(
  filters: InstallmentPurchaseFilters = {},
): Promise<LeituraComTeto<InstallmentPurchaseWithRelations>> {
  const supabase = await createClient();
  let query = supabase
    .from("transactions")
    .select(INSTALLMENT_PURCHASE_SELECT, { count: "exact" })
    .eq("parcelado", true)
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (filters.cardId) query = query.eq("card_id", filters.cardId);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);

  const [res, recebimentos] = await Promise.all([query, lerRecebimentos()]);
  const leitura = listaComTeto(
    res as unknown as RespostaDoBanco<InstallmentPurchaseWithRelations[] | null>,
    R.comprasParceladas,
  );
  const lidos = exigirCompleta(recebimentos, R.recebimentos);
  // A embedding não garante ordem; ordena as parcelas por número.
  for (const r of leitura.linhas) {
    r.installments?.sort((a, b) => a.numero - b.numero);
    r.receivables = anexarRecebimentos(r.receivables ?? [], lidos);
  }
  return leitura;
}

/**
 * Parcelas (não canceladas) que caem nas faturas informadas, já com a compra "pai" embutida
 * (descrição + categoria) e o "i/N". Usado pela tela /faturas para listar os itens de parcela
 * junto com os lançamentos à vista de cada fatura.
 */
export async function getStatementInstallmentItems(
  statementIds: string[],
  owner?: LeituraDoDono,
): Promise<StatementInstallmentItem[]> {
  if (statementIds.length === 0) return [];
  const supabase = owner?.client ?? (await createClient());
  const base = supabase
    .from("transaction_installments")
    .select(
      // `classificacao` vem do PAI porque é dele que a divisão é: a parcela herda o rateio,
      // não o declara. É o que deixa a fatura dizer "Compartilhada"/"De terceiro" item a item
      // sem deduzir do valor (minha parte zero não prova que a compra é toda de terceiro).
      "*, parent:transactions!transaction_installments_parent_transaction_id_fkey(id,description,classificacao,category:categories(id,name,color))",
      { count: "exact" },
    )
    .in("statement_id", statementIds)
    .neq("status", "cancelada");
  // Invariante 84: ids de faturas já filtrados não substituem o escopo explícito do dono.
  const res = await (owner ? base.eq("user_id", owner.userId) : base)
    .order("numero", { ascending: true });
  return listaCompleta(
    res as unknown as RespostaDoBanco<StatementInstallmentItem[] | null>,
    R.parcelas,
  );
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
    .select("*, category:categories(id,name,color), account:accounts(id,name)", { count: "exact" });
  const res = await (owner ? base.eq("user_id", owner.userId) : base)
    .order("is_active", { ascending: false })
    .order("due_day", { ascending: true });
  return listaCompleta(
    res as unknown as RespostaDoBanco<(BillRow & {
      category: Pick<CategoryRow, "id" | "name" | "color"> | null;
      account: { id: string; name: string } | null;
    })[] | null>,
    R.contasFixas,
  );
}

export async function getRecurrences(owner?: LeituraDoDono): Promise<
  (RecurringTransactionRow & {
    account: { id: string; name: string } | null;
    card: { id: string; nome: string } | null;
    category: Pick<CategoryRow, "id" | "name" | "color"> | null;
  })[]
> {
  const supabase = owner?.client ?? (await createClient());
  const base = supabase
    .from("recurring_transactions")
    .select(
      "*, account:accounts(id,name), card:credit_cards(id,nome), category:categories(id,name,color)",
      { count: "exact" },
    );
  const res = await (owner ? base.eq("user_id", owner.userId) : base)
    .order("is_active", { ascending: false })
    .order("next_due_date", { ascending: true });
  return listaCompleta(
    res as unknown as RespostaDoBanco<(RecurringTransactionRow & {
      account: { id: string; name: string } | null;
      card: { id: string; nome: string } | null;
      category: Pick<CategoryRow, "id" | "name" | "color"> | null;
    })[] | null>,
    R.recorrencias,
  );
}

/* ───────────────────── Fase 05 — Gastos de Terceiros & Divisão ───────────────────── */

const RECEIVABLE_SELECT =
  "*, person:people(id,nome,email), card:credit_cards(id,nome,cor,bandeira), statement:card_statements(id,competencia,data_vencimento), transaction:transactions!receivables_transaction_id_fkey(id,description,purchase_date)";

/** Pessoas (terceiros) com a contagem de recebíveis vinculados (para excluir vs inativar). */
export async function getPeople(): Promise<PersonWithCounts[]> {
  const supabase = await createClient();
  const res = await supabase
    .from("people")
    .select("*, receivables(count)", { count: "exact" })
    .order("ativo", { ascending: false })
    .order("nome", { ascending: true });
  const data = listaCompleta(
    res as unknown as RespostaDoBanco<(PersonWithCounts & {
      receivables: { count: number }[];
    })[] | null>,
    R.pessoas,
  );
  return data.map((p) => ({
    ...p,
    receivables_count: p.receivables?.[0]?.count ?? 0,
  }));
}

/** Pessoas ativas (id + nome) para o seletor de divisão no form de lançamento. */
export async function getPeopleForSelect(): Promise<
  { id: string; nome: string }[]
> {
  const supabase = await createClient();
  const res = await supabase
    .from("people")
    .select("id, nome", { count: "exact" })
    .eq("ativo", true)
    .order("nome", { ascending: true });
  return listaCompleta(
    res as RespostaDoBanco<{ id: string; nome: string }[] | null>,
    R.pessoas,
  );
}

/**
 * Leitura de recebíveis com os recebimentos anexados e a situação das duas listas — usada por
 * `/terceiros`, pelo caixa e pelo motor. Pessoa, cartão, fatura e transação de origem embutidos.
 * Single-user: traz tudo até o teto de 1000 e a aba "A Receber" filtra/agrupa no client.
 *
 * 03-G (D-G29): erro de leitura LANÇA. Saturação NÃO é erro aqui — é `situacao`, e quem decide
 * é o chamador (`exigirCompleta` nas telas que somam; `parcial` no caixa e no motor).
 */
export async function lerRecebiveis(
  owner?: LeituraDoDono,
): Promise<
  LeituraComTeto<ReceivableWithRelations> & {
    situacaoDosRecebimentos: LeituraComTeto<unknown>["situacao"];
    /** Quantos recebimentos VIERAM — o motivo cita o que veio, não o teto (o max_rows corta antes). */
    recebimentosLidos: number;
  }
> {
  const supabase = owner?.client ?? (await createClient());
  const base = supabase.from("receivables").select(RECEIVABLE_SELECT, { count: "exact" });
  const [res, recebimentos] = await Promise.all([
    (owner ? base.eq("user_id", owner.userId) : base)
      .order("created_at", { ascending: false })
      .limit(TETO_DE_RECEBIVEIS),
    lerRecebimentos(owner),
  ]);
  const leitura = listaComTeto(
    res as unknown as RespostaDoBanco<Omit<ReceivableWithRelations, "recebimentos">[] | null>,
    R.recebiveis,
  );
  const linhas = anexarRecebimentos(leitura.linhas, recebimentos.linhas);
  return {
    linhas,
    situacao: leitura.situacao,
    total: leitura.total,
    situacaoDosRecebimentos: recebimentos.situacao,
    recebimentosLidos: recebimentos.linhas.length,
  };
}

/**
 * Recebíveis das faturas informadas, com a pessoa embutida. Usado na tela /faturas para
 * mostrar "valor de terceiros" e "quem paga e quanto" por fatura.
 *
 * Lista que alimenta número (o total de terceiros da fatura): `listaCompleta`. Os recebimentos
 * saturados são erro (D-G29) — o saldo de cada recebível sairia afirmado sobre um corte.
 */
export async function getReceivablesByStatements(
  statementIds: string[],
): Promise<ReceivableWithPerson[]> {
  if (statementIds.length === 0) return [];
  const supabase = await createClient();
  const [res, recebimentos] = await Promise.all([
    supabase
      .from("receivables")
      .select("*, person:people(id,nome)", { count: "exact" })
      .in("statement_id", statementIds),
    lerRecebimentos(),
  ]);
  const linhas = listaCompleta(
    res as unknown as RespostaDoBanco<Omit<ReceivableWithPerson, "recebimentos">[] | null>,
    R.recebiveis,
  );
  return anexarRecebimentos(linhas, exigirCompleta(recebimentos, R.recebimentos));
}

/* ───────────────────── REDESIGN-03-B — a leitura do motor financeiro ───────────────────── */

type RecorrenciaCrua = Awaited<ReturnType<typeof getRecurrences>>[number];

export type ParametrosDaLeitura<E extends EscopoFinanceiro> = {
  escopo: E;
  owner?: LeituraDoDono;
} & (E["transacoes"] extends false ? { janela?: undefined } : { janela: JanelaFinanceira });

export type LeituraFinanceira<E extends EscopoFinanceiro> = {
  entradas: EntradasDoEscopo<E>;
  completude: CompletudeFinanceira;
} & (E["contas"] extends true ? { contas: AccountWithBalance[] } : unknown) &
  (E["recorrencias"] extends true ? { recorrencias: RecorrenciaCrua[] } : unknown);

/**
 * As leituras que o motor financeiro consome, já montadas por `montarEntradas` — a camada de
 * I/O do pipeline (a pura é `pipeline.ts`). Usada pelos dois cards do dashboard, pelo
 * relatório e pela página do dashboard financeiro. O Cron NÃO entra por aqui: ele mantém o
 * `Promise.all` de 13 leituras e usa só a camada pura (desenho, §3.1).
 *
 * - UM `Promise.all` com exatamente as leituras que o `escopo` pede — nem uma a mais, para o
 *   card do dashboard não passar a pagar pelas que só o relatório usa. Leitura fora do escopo
 *   fica ausente do retorno, sem tocar o banco.
 * - `getStatementInstallmentItems` fica DEPOIS do `Promise.all`, porque depende dos ids das
 *   faturas. Preservar a forma das chamadas é parte de preservar o comportamento: uma ida e
 *   volta em série a mais ou a menos é mudança de tempo de resposta.
 * - `contas` voltam CRUAS (quem quer o número chama `saldoDasContas`), e `recorrencias`
 *   também — além de entrarem em `entradas.recorrencias`. Decisão do dono, fechando uma lacuna
 *   do desenho: o relatório monta "assinaturas" com `description` e `category.name`, que não
 *   são entrada do motor. As duas ficam ausentes quando o escopo não as lê.
 *
 * Com `owner`, todas as leituras usam o client do dono e filtram `user_id` explicitamente,
 * inclusive as parcelas cujos ids de fatura já vieram filtrados (invariante 84).
 */
export async function lerFinanceiro<E extends EscopoFinanceiro>(
  params: ParametrosDaLeitura<E>,
): Promise<LeituraFinanceira<E>> {
  const { janela, escopo, owner } = params;

  if (escopo.transacoes && janela === undefined) {
    throw new Error("A leitura de transações exige uma janela financeira.");
  }

  const [contas, cartoes, faturas, recebiveis, contasFixas, recorrencias, transacoes] =
    await Promise.all([
      escopo.contas ? getAccounts(owner) : undefined,
      escopo.cartoes ? getCreditCards(owner) : undefined,
      escopo.faturas ? getStatements({}, owner) : undefined,
      escopo.recebiveis ? lerRecebiveis(owner) : undefined,
      escopo.contasFixas ? getBills(owner) : undefined,
      escopo.recorrencias ? getRecurrences(owner) : undefined,
      escopo.transacoes && janela !== undefined
        ? getTransactionsRange({ from: janela.from, to: janela.to }, owner)
        : undefined,
    ]);

  const linhas: LinhasFinanceiras = {};
  const motivos: string[] = [];
  if (transacoes !== undefined) {
    linhas.transacoes = transacoes.linhas;
    if (transacoes.situacao === "saturou") {
      motivos.push(
        `A leitura de lançamentos trouxe ${transacoes.linhas.length} registros desta janela e havia mais: os totais podem estar incompletos.`,
      );
    } else if (transacoes.situacao === "sem_contagem") {
      motivos.push("Não foi possível confirmar que a leitura de lançamentos veio completa.");
    }
    const foraDoDominio = lancamentosForaDoDominio(transacoes.linhas);
    if (foraDoDominio > 0) {
      motivos.push(
        `${foraDoDominio} lançamento(s) com tipo, status ou forma de pagamento fora do que o sistema conhece ficaram fora da conta.`,
      );
    }
  }
  if (faturas !== undefined) linhas.faturas = faturas;
  if (recebiveis !== undefined) {
    linhas.recebiveis = recebiveis.linhas;
    if (recebiveis.situacao === "saturou") {
      motivos.push(
        `A leitura de recebíveis trouxe ${recebiveis.linhas.length} registros e havia mais: os totais podem estar incompletos.`,
      );
    } else if (recebiveis.situacao === "sem_contagem") {
      motivos.push("Não foi possível confirmar que a leitura de recebíveis veio completa.");
    }
    if (recebiveis.situacaoDosRecebimentos === "saturou") {
      motivos.push(
        `A leitura de recebimentos trouxe ${recebiveis.recebimentosLidos} registros e havia mais: os saldos podem estar incompletos.`,
      );
    } else if (recebiveis.situacaoDosRecebimentos === "sem_contagem") {
      motivos.push("Não foi possível confirmar que a leitura de recebimentos veio completa.");
    }
  }
  if (cartoes !== undefined) linhas.cartoes = cartoes;
  if (recorrencias !== undefined) linhas.recorrencias = recorrencias;
  if (contasFixas !== undefined) linhas.contasFixas = contasFixas;
  if (escopo.parcelas) {
    linhas.parcelas = await getStatementInstallmentItems(
      (faturas ?? []).map((s) => s.id).filter((id): id is string => Boolean(id)),
      owner,
    );
  }

  // O TS não relaciona as leituras condicionais acima ao tipo de E. Cada chave nasce
  // somente de uma leitura pedida; ler-financeiro.test.ts confere Object.keys nos três escopos.
  return {
    entradas: montarEntradas(linhas),
    completude: completudeDe(motivos),
    ...(contas !== undefined ? { contas } : {}),
    ...(recorrencias !== undefined ? { recorrencias } : {}),
  } as LeituraFinanceira<E>;
}

/* ───────────────────── Fase 06 — Importação (Excel/CSV/OFX) ───────────────────── */

// `dia_fechamento`/`dia_vencimento` entram porque a revisão compara a última data do arquivo
// com o fechamento da fatura de destino (ver `coberturaDaFatura`) — arquivo que termina antes
// do fechamento importa fatura incompleta, e isso não aparece em nenhum outro lugar.
const IMPORT_BATCH_SELECT =
  "*, card:credit_cards(id,nome,cor,bandeira,dia_fechamento,dia_vencimento), account:accounts(id,name)";

/** Lotes de importação (histórico), do mais recente ao mais antigo, com o alvo resolvido. */
export async function getImportBatches(): Promise<LeituraComTeto<ImportBatchWithTarget>> {
  const supabase = await createClient();
  const res = await supabase
    .from("import_batches")
    .select(IMPORT_BATCH_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(100);
  // Só lista: a tela mostra o aviso "N de M" (o chamador decide o teto).
  return listaComTeto(
    res as unknown as RespostaDoBanco<ImportBatchWithTarget[] | null>,
    R.lotesDaImportacao,
  );
}

/** Um lote específico (para a tela de revisão/resultado). */
export async function getImportBatch(
  id: string,
): Promise<ImportBatchWithTarget | null> {
  const supabase = await createClient();
  const res = await supabase
    .from("import_batches")
    .select(IMPORT_BATCH_SELECT)
    .eq("id", id)
    .maybeSingle();
  return (
    exigir(
      res as unknown as RespostaDoBanco<ImportBatchWithTarget | null>,
      R.loteDaImportacao,
    ) ?? null
  );
}

/** Linhas de um lote (ordenadas pela linha original) com categoria e transação embutidas. */
export async function getImportRows(
  batchId: string,
): Promise<ImportRowWithRelations[]> {
  const supabase = await createClient();
  const res = await supabase
    .from("import_rows")
    .select(
      "*, categoria:categories(id,name,color), transaction:transactions!import_rows_transaction_id_fkey(id,description)",
      { count: "exact" },
    )
    .eq("import_batch_id", batchId)
    .order("linha_index", { ascending: true });
  return listaCompleta(
    res as unknown as RespostaDoBanco<ImportRowWithRelations[] | null>,
    R.linhasDaImportacao,
  );
}
