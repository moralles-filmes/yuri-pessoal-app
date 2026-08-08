import "server-only";

/**
 * Fase 18-C · Bloco 4 — IA · Os commands de Hábitos. A metade que ESCREVE.
 *
 * `executar` chama `habits/services.ts` — exatamente o que `setHabitValue`, `setHabitDone` e
 * `logHabit` chamam. Nenhuma regra reescrita: a derivação de `is_done` a partir da meta
 * (`reachedTarget`) acontece lá dentro, uma vez só.
 */

import { desfazerCheckIn, metaDoHabito, registrarCheckIn } from "@/lib/habits/services";
import { getHabitsDashboard } from "@/lib/habits/queries";
import { hojeISO } from "@/lib/format";
import { EfeitoImpossivel, type Command } from "../contracts";
import {
  desfazerHabitoEntrada,
  parseComHabito,
  preverDesfazerHabito,
  preverRegistrarHabito,
  registrarHabitoEntrada,
  type DesfazerHabitoEntrada,
  type RegistrarHabitoEntrada,
} from "./habits-preview";

const ROTA_DO_PAINEL = "/habitos";

/**
 * Resolve o hábito de novo, na EXECUÇÃO.
 *
 * ⚠️ Parece redundante com `prever`, e não é: o payload gravado guarda o NOME que o usuário
 * disse, não o id. Resolver de novo é o que faz a revalidação por hash ter sentido — se o
 * nome passou a casar com outro hábito (renomeado, arquivado, duplicado) entre propor e
 * confirmar, o hash diverge e a execução é recusada antes de escrever.
 */
async function idDoHabito(nome: string, hoje: string): Promise<{ id: string; nome: string }> {
  const { habits } = await getHabitsDashboard(hoje);
  const ativos = habits.filter((h) => h.is_active);
  const alvo = nome.toLowerCase();
  const exatos = ativos.filter((h) => h.name.toLowerCase() === alvo);
  const candidatos =
    exatos.length > 0 ? exatos : ativos.filter((h) => h.name.toLowerCase().includes(alvo));

  if (candidatos.length !== 1) {
    throw new EfeitoImpossivel(`O hábito "${nome}" não é mais resolvível. Nada foi registrado.`);
  }
  return { id: candidatos[0].id, nome: candidatos[0].name };
}

export const registrarHabito: Command = {
  name: "registrarHabito",
  module: "habits",
  risk: 2,
  revalidar: ["/habitos", "/dashboard"],
  camposAuditaveis: ["value", "is_done", "log_date"],
  undo: "desfazerHabito",

  parse: parseComHabito(registrarHabitoEntrada),
  prever: (_ctx, payload) => preverRegistrarHabito(payload),

  async executar(ctx, payload) {
    const d = payload as RegistrarHabitoEntrada;
    const hoje = hojeISO();
    const data = d.data ?? hoje;
    const habito = await idDoHabito(d.habito, hoje);

    /**
     * Sem valor informado = "marcar como feito", e é a meta que entra. A meta vem do serviço
     * (`metaDoHabito`), não da previsão: um valor carregado da previsão seria o estado de
     * ANTES, e a revalidação já garantiu que ele não mudou — mas ler do serviço mantém uma
     * fonte só para a meta.
     */
    const meta = await metaDoHabito(ctx, habito.id);
    if (meta === null) throw new Error("Hábito não encontrado.");
    const valor = d.valor ?? meta;

    const r = await registrarCheckIn(ctx, habito.id, { logDate: data, value: valor });
    if (!r.ok) throw new Error(r.erro);

    return {
      targetId: habito.id,
      targetRoute: ROTA_DO_PAINEL,
      alterados: { value: r.value, is_done: r.isDone, log_date: data },
      itens: [],
    };
  },
};

/**
 * O desfazer. Como os outros `undo`, não está no Tool Registry: o modelo não pode propor
 * "apague o registro de ontem" — quem o alcança é o botão da tela, sobre um registro que a
 * própria IA acabou de fazer.
 */
export const desfazerHabito: Command = {
  name: "desfazerHabito",
  module: "habits",
  risk: 2,
  revalidar: ["/habitos", "/dashboard"],
  camposAuditaveis: ["log_date"],
  undo: null,

  parse: parseComHabito(desfazerHabitoEntrada),
  prever: (_ctx, payload) => preverDesfazerHabito(payload),

  async executar(ctx, payload) {
    const d = payload as DesfazerHabitoEntrada;
    const r = await desfazerCheckIn(ctx, d.habito_id, d.data);
    if (!r.ok) throw new Error(r.erro);

    return {
      targetId: d.habito_id,
      targetRoute: ROTA_DO_PAINEL,
      alterados: { log_date: d.data },
      itens: [],
    };
  },
};
