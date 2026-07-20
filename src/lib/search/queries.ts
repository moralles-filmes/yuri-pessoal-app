/**
 * Fase 13 — Busca Global (server-only). Cada entidade é consultada em paralelo com
 * `ilike`, sempre via cliente com sessão → a RLS garante que só vêm dados do usuário
 * (nunca varre dados de outro). Devolve um shape unificado agrupado por tipo.
 */
import { createClient } from "@/lib/supabase/server";
import { dateInSaoPaulo, formatCurrency, formatDate } from "@/lib/format";
import {
  ACCOUNT_TYPE_LABELS,
  CARD_BRAND_LABELS,
  TRANSACTION_TYPE_LABELS,
  type AccountType,
  type CardBrand,
  type TransactionType,
} from "@/lib/finance/constants";
import { EVENT_TYPE_LABELS, type EventType } from "@/lib/calendar/constants";
import { notificationTypeLabel } from "@/lib/notifications/constants";
import {
  SEARCH_TYPES,
  SEARCH_TYPE_LABELS,
  type SearchGroup,
  type SearchResult,
  type SearchType,
} from "@/lib/search/types";

/** Remove caracteres que quebram o filtro do PostgREST e o curinga do ilike. */
function sanitize(raw: string): string {
  return raw.replace(/[%_\\,()*:]/g, " ").trim();
}

const pretty = (s: string | null | undefined) =>
  (s ?? "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

async function safe<T>(p: PromiseLike<T[]>): Promise<T[]> {
  try {
    return await p;
  } catch {
    return [];
  }
}

/** Busca global agrupada por tipo. `q` curto/vazio → []. */
export async function searchAll(
  rawQuery: string,
  limitPerType = 6,
): Promise<SearchGroup[]> {
  const q = sanitize(rawQuery);
  if (q.length < 2) return [];
  const supabase = await createClient();
  const like = `%${q}%`;

  const byType: Record<SearchType, SearchResult[]> = {
    transacao: [],
    cartao: [],
    fatura: [],
    pessoa: [],
    conta: [],
    tarefa: [],
    rotina: [],
    habito: [],
    estudo: [],
    evento: [],
    notificacao: [],
  };

  await Promise.all([
    // Transações
    safe(
      supabase
        .from("transactions")
        .select("id, description, amount, competence_date, type")
        .ilike("description", like)
        .order("competence_date", { ascending: false })
        .limit(limitPerType)
        .then((r) => r.data ?? []),
    ).then((rows) => {
      byType.transacao = (rows as Array<{
        id: string;
        description: string | null;
        amount: number;
        competence_date: string;
        type: TransactionType;
      }>).map((t) => ({
        type: "transacao",
        id: t.id,
        title: t.description ?? "(sem descrição)",
        subtitle: `${TRANSACTION_TYPE_LABELS[t.type] ?? pretty(t.type)} · ${formatDate(
          t.competence_date,
        )} · ${formatCurrency(t.amount)}`,
        link: "/financeiro/lancamentos",
      }));
    }),

    // Cartões
    safe(
      supabase
        .from("credit_cards")
        .select("id, nome, bandeira")
        .ilike("nome", like)
        .limit(limitPerType)
        .then((r) => r.data ?? []),
    ).then((rows) => {
      byType.cartao = (rows as Array<{ id: string; nome: string; bandeira: CardBrand }>).map(
        (c) => ({
          type: "cartao",
          id: c.id,
          title: c.nome,
          subtitle: CARD_BRAND_LABELS[c.bandeira] ?? "Cartão de crédito",
          link: "/cartoes",
        }),
      );
    }),

    // Faturas (filtra por nome do cartão / competência em memória — poucos registros)
    safe(
      supabase
        .from("card_statements_with_total")
        .select(
          "id, card_id, competencia, data_vencimento, total_atual, card:credit_cards(nome)",
        )
        .order("competencia", { ascending: false })
        .limit(120)
        .then((r) => r.data ?? []),
    ).then((rows) => {
      const lower = q.toLowerCase();
      byType.fatura = (rows as Array<{
        id: string;
        card_id: string;
        competencia: string;
        data_vencimento: string;
        total_atual: number | null;
        card: { nome: string } | { nome: string }[] | null;
      }>)
        .map((s) => {
          const nome = (Array.isArray(s.card) ? s.card[0]?.nome : s.card?.nome) ?? "Cartão";
          const mes = s.competencia.slice(0, 7);
          return { s, nome, mes };
        })
        .filter(
          ({ nome, mes }) =>
            nome.toLowerCase().includes(lower) ||
            mes.includes(lower) ||
            mes.split("-").reverse().join("/").includes(lower),
        )
        .slice(0, limitPerType)
        .map(({ s, nome, mes }) => ({
          type: "fatura",
          id: s.id,
          title: `Fatura ${nome} · ${mes}`,
          subtitle: `Vence ${formatDate(s.data_vencimento)} · ${formatCurrency(
            Number(s.total_atual ?? 0),
          )}`,
          link: `/faturas?card=${s.card_id}&month=${mes}`,
        }));
    }),

    // Pessoas
    safe(
      supabase
        .from("people")
        .select("id, nome, email")
        .ilike("nome", like)
        .limit(limitPerType)
        .then((r) => r.data ?? []),
    ).then((rows) => {
      byType.pessoa = (rows as Array<{ id: string; nome: string; email: string | null }>).map(
        (p) => ({
          type: "pessoa",
          id: p.id,
          title: p.nome,
          subtitle: p.email,
          link: "/terceiros",
        }),
      );
    }),

    // Contas
    safe(
      supabase
        .from("accounts")
        .select("id, name, type")
        .ilike("name", like)
        .limit(limitPerType)
        .then((r) => r.data ?? []),
    ).then((rows) => {
      byType.conta = (rows as Array<{ id: string; name: string; type: AccountType }>).map(
        (a) => ({
          type: "conta",
          id: a.id,
          title: a.name,
          subtitle: ACCOUNT_TYPE_LABELS[a.type] ?? pretty(a.type),
          link: "/financeiro/contas",
        }),
      );
    }),

    // Tarefas
    safe(
      supabase
        .from("tasks")
        .select("id, title, status, due_date")
        .ilike("title", like)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(limitPerType)
        .then((r) => r.data ?? []),
    ).then((rows) => {
      byType.tarefa = (rows as Array<{
        id: string;
        title: string;
        status: string;
        due_date: string | null;
      }>).map((t) => ({
        type: "tarefa",
        id: t.id,
        title: t.title,
        subtitle: t.due_date ? `Vence ${formatDate(t.due_date)}` : pretty(t.status),
        link: "/tarefas",
      }));
    }),

    // Rotinas
    safe(
      supabase
        .from("routines")
        .select("id, name, frequency")
        .ilike("name", like)
        .limit(limitPerType)
        .then((r) => r.data ?? []),
    ).then((rows) => {
      byType.rotina = (rows as Array<{ id: string; name: string; frequency: string }>).map(
        (r) => ({
          type: "rotina",
          id: r.id,
          title: r.name,
          subtitle: pretty(r.frequency),
          link: "/rotinas",
        }),
      );
    }),

    // Hábitos
    safe(
      supabase
        .from("habits")
        .select("id, name, category")
        .ilike("name", like)
        .limit(limitPerType)
        .then((r) => r.data ?? []),
    ).then((rows) => {
      byType.habito = (rows as Array<{ id: string; name: string; category: string }>).map(
        (h) => ({
          type: "habito",
          id: h.id,
          title: h.name,
          subtitle: pretty(h.category),
          link: "/habitos",
        }),
      );
    }),

    // Estudos (cursos)
    safe(
      supabase
        .from("study_courses")
        .select("id, title, status, platform")
        .ilike("title", like)
        .limit(limitPerType)
        .then((r) => r.data ?? []),
    ).then((rows) => {
      byType.estudo = (rows as Array<{
        id: string;
        title: string;
        status: string;
        platform: string | null;
      }>).map((c) => ({
        type: "estudo",
        id: c.id,
        title: c.title,
        subtitle: c.platform ?? pretty(c.status),
        link: `/estudos/${c.id}`,
      }));
    }),

    // Eventos da agenda
    safe(
      supabase
        .from("calendar_events")
        .select("id, title, start_at, tipo")
        .ilike("title", like)
        .order("start_at", { ascending: false })
        .limit(limitPerType)
        .then((r) => r.data ?? []),
    ).then((rows) => {
      byType.evento = (rows as Array<{
        id: string;
        title: string;
        start_at: string;
        tipo: EventType;
      }>).map((e) => {
        // `start_at` é timestamptz e chega em UTC — fatiar a string daria o dia errado
        // (e um link para um dia vazio) em todo evento entre 21h e 00h de Brasília.
        const dia = dateInSaoPaulo(new Date(e.start_at));
        return {
          type: "evento",
          id: e.id,
          title: e.title,
          subtitle: `${EVENT_TYPE_LABELS[e.tipo] ?? pretty(e.tipo)} · ${formatDate(dia)}`,
          link: `/agenda?view=dia&date=${dia}`,
        };
      });
    }),

    // Notificações
    safe(
      supabase
        .from("notifications")
        .select("id, title, type")
        .ilike("title", like)
        .order("notify_at", { ascending: false })
        .limit(limitPerType)
        .then((r) => r.data ?? []),
    ).then((rows) => {
      byType.notificacao = (rows as Array<{ id: string; title: string; type: string }>).map(
        (n) => ({
          type: "notificacao",
          id: n.id,
          title: n.title,
          subtitle: notificationTypeLabel(n.type),
          link: "/notificacoes",
        }),
      );
    }),
  ]);

  return SEARCH_TYPES.map((type) => ({
    type,
    label: SEARCH_TYPE_LABELS[type],
    results: byType[type],
  })).filter((g) => g.results.length > 0);
}
