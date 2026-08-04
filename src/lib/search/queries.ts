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
  foodLink,
  mealTemplateLink,
  planLink,
  recipeLink,
  shoppingListLink,
} from "@/lib/search/nutrition-links";
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
    todo_tarefa: [],
    todo_projeto: [],
    todo_etiqueta: [],
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
    nutricao_alimento: [],
    nutricao_receita: [],
    nutricao_modelo: [],
    nutricao_plano: [],
    nutricao_lista: [],
    notificacao: [],
  };

  await Promise.all([
    // TO-DO — tarefas (título e descrição). O link abre a tarefa já na visão geral.
    safe(
      supabase
        .from("todo_tasks")
        .select(
          "id, title, status, priority, scheduled_date, deadline_at, project_id, project:todo_projects(name)",
        )
        .or(`title.ilike.${like},description.ilike.${like}`)
        .order("scheduled_date", { ascending: true, nullsFirst: false })
        .limit(limitPerType)
        .then((r) => r.data ?? []),
    ).then((rows) => {
      byType.todo_tarefa = (rows as Array<{
        id: string;
        title: string;
        status: string;
        priority: number;
        scheduled_date: string | null;
        deadline_at: string | null;
        project_id: string | null;
        project: { name: string } | { name: string }[] | null;
      }>).map((t) => {
        const projeto =
          (Array.isArray(t.project) ? t.project[0]?.name : t.project?.name) ??
          "Caixa de entrada";
        const data = t.scheduled_date ?? t.deadline_at;
        const partes = [
          projeto,
          `P${t.priority}`,
          data ? formatDate(data) : null,
          pretty(t.status),
        ].filter(Boolean);
        return {
          type: "todo_tarefa",
          id: t.id,
          title: t.title,
          subtitle: partes.join(" · "),
          // `task` abre o painel de detalhes direto na tarefa.
          link: t.project_id
            ? `/todo?v=projeto&id=${t.project_id}&task=${t.id}`
            : `/todo?v=todas&task=${t.id}`,
        };
      });
    }),

    // TO-DO — projetos
    safe(
      supabase
        .from("todo_projects")
        .select("id, name, status")
        .ilike("name", like)
        .limit(limitPerType)
        .then((r) => r.data ?? []),
    ).then((rows) => {
      byType.todo_projeto = (rows as Array<{ id: string; name: string; status: string }>).map(
        (p) => ({
          type: "todo_projeto",
          id: p.id,
          title: p.name,
          subtitle: p.status === "arquivado" ? "Projeto arquivado" : "Projeto",
          link: `/todo?v=projeto&id=${p.id}`,
        }),
      );
    }),

    // TO-DO — etiquetas
    safe(
      supabase
        .from("todo_labels")
        .select("id, name")
        .ilike("name", like)
        .limit(limitPerType)
        .then((r) => r.data ?? []),
    ).then((rows) => {
      byType.todo_etiqueta = (rows as Array<{ id: string; name: string }>).map((l) => ({
        type: "todo_etiqueta",
        id: l.id,
        title: `@${l.name}`,
        subtitle: "Etiqueta",
        link: `/todo?v=etiqueta&id=${l.id}`,
      }));
    }),

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

    /* ═══════════ Fase 16-F — módulo Dieta e Alimentação ═══════════
     * Cada consulta roda sob a sessão, então a RLS decide o escopo. Nas tabelas que aceitam
     * `user_id` nulo (alimentos), a policy de SELECT alcança também a BASE DO SISTEMA — o que
     * é desejado: procurar "arroz" tem de achar o arroz da TACO. O que ela nunca alcança é o
     * alimento de OUTRO usuário. */

    // Alimentos (nome, nome alternativo, marca e código de barras)
    safe(
      supabase
        .from("nutrition_foods")
        .select("id, name, alternative_name, brand, barcode, is_system_food, archived_at")
        .or(
          `name.ilike.${like},alternative_name.ilike.${like},brand.ilike.${like},barcode.ilike.${like}`,
        )
        .is("archived_at", null)
        .order("name", { ascending: true })
        .limit(limitPerType)
        .then((r) => r.data ?? []),
    ).then((rows) => {
      byType.nutricao_alimento = (rows as Array<{
        id: string;
        name: string;
        alternative_name: string | null;
        brand: string | null;
        barcode: string | null;
        is_system_food: boolean;
      }>).map((f) => ({
        type: "nutricao_alimento",
        id: f.id,
        title: f.name,
        subtitle: [f.brand, f.is_system_food ? "Base do sistema" : "Alimento próprio"]
          .filter(Boolean)
          .join(" · "),
        link: foodLink(f.id),
      }));
    }),

    // Receitas
    safe(
      supabase
        .from("nutrition_recipes")
        .select("id, name, servings, serving_label, is_favorite, archived_at")
        .ilike("name", like)
        .is("archived_at", null)
        .order("name", { ascending: true })
        .limit(limitPerType)
        .then((r) => r.data ?? []),
    ).then((rows) => {
      byType.nutricao_receita = (rows as Array<{
        id: string;
        name: string;
        servings: number | null;
        serving_label: string | null;
        is_favorite: boolean;
      }>).map((r) => ({
        type: "nutricao_receita",
        id: r.id,
        title: r.name,
        subtitle: r.servings
          ? `${r.servings} ${r.serving_label ?? "porção(ões)"}`
          : "Receita",
        link: recipeLink(r.id),
      }));
    }),

    // Refeições-modelo
    safe(
      supabase
        .from("nutrition_meal_templates")
        .select("id, name, description, archived_at")
        .or(`name.ilike.${like},description.ilike.${like}`)
        .is("archived_at", null)
        .order("name", { ascending: true })
        .limit(limitPerType)
        .then((r) => r.data ?? []),
    ).then((rows) => {
      byType.nutricao_modelo = (rows as Array<{
        id: string;
        name: string;
        description: string | null;
      }>).map((t) => ({
        type: "nutricao_modelo",
        id: t.id,
        title: t.name,
        subtitle: t.description ?? "Refeição-modelo",
        link: mealTemplateLink(t.id),
      }));
    }),

    // Modelos de semana (planejamento)
    safe(
      supabase
        .from("nutrition_plans")
        .select("id, name, description, cycle_weeks, is_active")
        .or(`name.ilike.${like},description.ilike.${like}`)
        .order("name", { ascending: true })
        .limit(limitPerType)
        .then((r) => r.data ?? []),
    ).then((rows) => {
      byType.nutricao_plano = (rows as Array<{
        id: string;
        name: string;
        description: string | null;
        cycle_weeks: number;
        is_active: boolean;
      }>).map((p) => ({
        type: "nutricao_plano",
        id: p.id,
        title: p.name,
        subtitle: [
          `${p.cycle_weeks} semana(s)`,
          p.is_active ? "Em uso" : null,
          p.description,
        ]
          .filter(Boolean)
          .join(" · "),
        link: planLink(p.id),
      }));
    }),

    // Listas de compras
    safe(
      supabase
        .from("nutrition_shopping_lists")
        .select("id, name, status, store, source_from, source_to")
        .or(`name.ilike.${like},store.ilike.${like}`)
        .order("created_at", { ascending: false })
        .limit(limitPerType)
        .then((r) => r.data ?? []),
    ).then((rows) => {
      byType.nutricao_lista = (rows as Array<{
        id: string;
        name: string;
        status: string;
        store: string | null;
        source_from: string | null;
        source_to: string | null;
      }>).map((l) => ({
        type: "nutricao_lista",
        id: l.id,
        title: l.name,
        subtitle: [
          pretty(l.status),
          l.store,
          l.source_from ? `${formatDate(l.source_from)}${l.source_to ? ` a ${formatDate(l.source_to)}` : ""}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        link: shoppingListLink(l.id),
      }));
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
