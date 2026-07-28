"use server";

import { authContext } from "@/lib/actions/helpers";

export type QuickAddOptions = {
  accounts: { id: string; name: string }[];
  cards: { id: string; nome: string }[];
  categories: { id: string; name: string; kind: string }[];
  projects: { id: string; name: string }[];
  courses: { id: string; title: string }[];
  habits: { id: string; name: string; unit: string; target: number; category: string }[];
  people: { id: string; nome: string }[];
  /** Projetos do módulo TO-DO (Fase 15) — distintos dos `projects` da Fase 09. */
  todoProjects: { id: string; name: string }[];
};

const EMPTY: QuickAddOptions = {
  accounts: [],
  cards: [],
  categories: [],
  projects: [],
  courses: [],
  habits: [],
  people: [],
  todoProjects: [],
};

/**
 * Opções para os selects do lançamento rápido (carregadas sob demanda ao abrir o modal).
 * Tudo via cliente com sessão (RLS). Apenas leituras enxutas.
 */
export async function loadQuickAddOptions(): Promise<QuickAddOptions> {
  const ctx = await authContext();
  if (!ctx) return EMPTY;
  const { supabase } = ctx;

  const [accounts, cards, categories, projects, courses, habits, people, todoProjects] =
    await Promise.all([
    supabase.from("accounts").select("id, name").eq("is_active", true).order("name"),
    supabase.from("credit_cards").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("categories").select("id, name, kind").order("sort_order").order("name"),
    supabase.from("projects").select("id, name").eq("is_archived", false).order("name"),
    supabase
      .from("study_courses")
      .select("id, title, status")
      .neq("status", "concluido")
      .order("position"),
    supabase
      .from("habits")
      .select("id, name, unit, target_value, category")
      .eq("is_active", true)
      .order("position"),
      supabase.from("people").select("id, nome").eq("ativo", true).order("nome"),
      supabase
        .from("todo_projects")
        .select("id, name")
        .eq("status", "ativo")
        .order("position"),
    ]);

  return {
    accounts: (accounts.data ?? []) as QuickAddOptions["accounts"],
    cards: (cards.data ?? []) as QuickAddOptions["cards"],
    categories: (categories.data ?? []) as QuickAddOptions["categories"],
    projects: (projects.data ?? []) as QuickAddOptions["projects"],
    courses: ((courses.data ?? []) as { id: string; title: string }[]).map((c) => ({
      id: c.id,
      title: c.title,
    })),
    habits: ((habits.data ?? []) as Array<{
      id: string;
      name: string;
      unit: string;
      target_value: number;
      category: string;
    }>).map((h) => ({
      id: h.id,
      name: h.name,
      unit: h.unit,
      target: Number(h.target_value),
      category: h.category,
    })),
    people: (people.data ?? []) as QuickAddOptions["people"],
    todoProjects: (todoProjects.data ?? []) as QuickAddOptions["todoProjects"],
  };
}
