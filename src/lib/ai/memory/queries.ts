import "server-only";

/**
 * Fase 18-F · Bloco 3 — IA · A leitura da memória.
 *
 * DUAS consultas amplas e a derivação em memória, nunca N+1: a mesma disciplina de
 * `approval/queries.ts`. O estado sai de `memory/state.ts`, com `agora` injetado por quem
 * chama — esta camada não decide nada, ela busca.
 *
 * ⚠️ **ELA MORA AQUI, E NÃO EM `ai/server/`, POR UMA RAZÃO DE FRONTEIRA.** `approval/` é
 * camada pura no `boundaries.test.ts` e não pode alcançar `ai/server/`; um
 * `memory-preview.ts` que importasse `@/lib/ai/server/memory-queries` deixaria a suíte
 * vermelha. `approval/queries.ts` já faz I/O dentro de `approval/` pelo mesmo motivo: o que
 * "camada pura" proíbe ali é alcançar `ai/server/` e o pacote do fornecedor, não falar com o
 * banco.
 */

import { createClient } from "@/lib/supabase/server";
import {
  ehModuloDeMemoria,
  type EventoDeMemoria,
  type MemoriaParaPrompt,
  type ModuloDeMemoria,
  type OrigemDeMemoria,
} from "./contracts";
import {
  entraNoPrompt,
  estadoDaMemoria,
  type EstadoDaMemoria,
  type LinhaDeEventoDeMemoria,
} from "./state";

export type MemoriaNaTela = {
  readonly id: string;
  readonly conteudo: string;
  readonly modulo: ModuloDeMemoria | null;
  readonly expiresAt: string | null;
  readonly origem: OrigemDeMemoria;
  readonly criadaEm: string;
  readonly estado: EstadoDaMemoria;
  readonly expirouEm?: string;
};

type LinhaDeMemoria = {
  id: string;
  content: string;
  modulo: string | null;
  expires_at: string | null;
  origem: string;
  created_at: string;
};

/**
 * ⚠️ **AS DUAS CONSULTAS FILTRAM `user_id` EXPLICITAMENTE, e isso é uma divergência
 * DELIBERADA do rascunho do plano** (que deixava o parâmetro sem uso, confiando só na RLS).
 *
 * A RLS de fato faz o escopo aqui — o client é o de SESSÃO, e a invariante 84 diz que isso
 * basta. O filtro não está aqui por desconfiança dela, e sim porque um parâmetro que não faz
 * nada é uma promessa falsa: `getMemorias("", agora)` devolveria a lista inteira e
 * funcionaria, e ninguém descobriria que o argumento era mentira. Com o filtro, um chamador
 * que passe o dono errado recebe lista vazia — o defeito aparece alto, na primeira execução,
 * em vez de ficar latente até o dia em que alguém trocar este client por um de service role.
 */
async function carregar(userId: string, agora: Date): Promise<MemoriaNaTela[]> {
  const supabase = await createClient();

  const [{ data: memorias }, { data: eventos }] = await Promise.all([
    supabase
      .from("ai_memories")
      .select("id, content, modulo, expires_at, origem, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("ai_memory_events")
      .select("memory_id, evento, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  const porMemoria = new Map<string, LinhaDeEventoDeMemoria[]>();
  for (const e of (eventos ?? []) as Array<{
    memory_id: string;
    evento: string;
    created_at: string;
  }>) {
    const lista = porMemoria.get(e.memory_id) ?? [];
    lista.push({ evento: e.evento as EventoDeMemoria, created_at: e.created_at });
    porMemoria.set(e.memory_id, lista);
  }

  return ((memorias ?? []) as LinhaDeMemoria[]).map((m) => {
    const resolvido = estadoDaMemoria(m.expires_at, porMemoria.get(m.id) ?? [], agora);
    return {
      id: m.id,
      conteudo: m.content,
      // Módulo fora do vocabulário vira `null` (vale para todos) em vez de quebrar a tela.
      // O CHECK do banco impede que isso aconteça; a coerção existe para o caso de ele mudar.
      modulo: ehModuloDeMemoria(m.modulo) ? m.modulo : null,
      expiresAt: m.expires_at,
      origem: (m.origem === "ia" ? "ia" : "dono") as OrigemDeMemoria,
      criadaEm: m.created_at,
      ...resolvido,
    } satisfies MemoriaNaTela;
  });
}

/** Tudo, para a tela — inclusive expirada, desativada e esquecida. Nada some da lista. */
export async function getMemorias(userId: string, agora: Date): Promise<MemoriaNaTela[]> {
  return carregar(userId, agora);
}

/** Só o que entra no prompt. O recorte por módulo e por chave é do `memory/prompt.ts`. */
export async function getMemoriasVigentes(
  userId: string,
  agora: Date,
): Promise<MemoriaParaPrompt[]> {
  const todas = await carregar(userId, agora);
  return todas
    .filter((m) => entraNoPrompt(m.estado))
    .map(({ id, conteudo, modulo }) => ({ id, conteudo, modulo }));
}
