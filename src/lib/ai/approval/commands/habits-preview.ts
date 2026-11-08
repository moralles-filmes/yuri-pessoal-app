import "server-only";

/**
 * Fase 18-C · Bloco 4 — IA · A METADE QUE SÓ LÊ dos commands de Hábitos.
 *
 * Mesma partição de `todo-preview.ts`, e pelo mesmo motivo: a partir de `tools/` não pode
 * existir caminho de import até uma função que escreve. Ver o cabeçalho de lá.
 */

import { z } from "zod";
import { getHabitLogForDate, getHabitsDashboard } from "@/lib/habits/queries";
/**
 * ⚠️ `formatHabitValue` E NÃO `HABIT_UNIT_LABELS`. O rótulo é para CABEÇALHO de tela
 * ("Vezes", "Mililitros (ml)"); a forma curta é a que compõe frase ("8 vezes", "250 ml"), e é
 * ela que o módulo já usa nos cards. Formatar por conta própria aqui daria à IA um jeito de
 * escrever quantidade que a tela não usa em lugar nenhum.
 */
import { formatHabitValue } from "@/lib/habits/constants";
import type { HabitUnit } from "@/lib/habits/constants";
import { hojeISO } from "@/lib/format";
import { MOTIVO_REGISTRO_ANTERIOR } from "../desfazer-habito";
import { EfeitoImpossivel, type EfeitoProposto } from "../contracts";

/* ══════════════════════════════════════════════════════════════════════════════════════
   Entrada
   ══════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ `habito` É NOME, NÃO ID — pela mesma razão de `projeto` no TO-DO: um uuid vindo do
 * modelo é adivinhação com cara de precisão. Quem resolve nome → id é o servidor, e o hábito
 * resolvido entra no hash.
 *
 * `valor` é OPCIONAL, e a ausência tem significado: "marcar como feito", que grava a meta e
 * `is_done = true`. Um padrão numérico aqui (1, por exemplo) faria "bebi água" virar "1 copo"
 * num hábito cuja meta é 8 — e a tela mostraria 1/8 como se o usuário tivesse dito isso.
 */
export const registrarHabitoEntrada = z
  .object({
    habito: z.string().trim().min(1).max(120),
    valor: z.number().min(0).max(100_000).nullable().optional(),
    data: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
      .nullable()
      .optional(),
  })
  .strict();
export type RegistrarHabitoEntrada = z.infer<typeof registrarHabitoEntrada>;

export const desfazerHabitoEntrada = z
  .object({
    habito_id: z.uuid(),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();
export type DesfazerHabitoEntrada = z.infer<typeof desfazerHabitoEntrada>;

/* ══════════════════════════════════════════════════════════════════════════════════════
   Resolução
   ══════════════════════════════════════════════════════════════════════════════════════ */

const ROTA_DO_PAINEL = "/habitos";

/**
 * Resolve o hábito pelo NOME, entre os ATIVOS.
 *
 * ⚠️ Hábito arquivado não é candidato: registrar num hábito que o dono desligou ressuscitaria
 * um dado que ele decidiu parar de acompanhar. E, como no TO-DO, nome que não casa e nome
 * ambíguo viram `EfeitoImpossivel` — nunca uma escolha do sistema.
 */
async function resolverHabito(nome: string, hoje: string) {
  const { habits } = await getHabitsDashboard(hoje);
  const ativos = habits.filter((h) => h.is_active);
  const alvo = nome.toLowerCase();

  const exatos = ativos.filter((h) => h.name.toLowerCase() === alvo);
  const candidatos =
    exatos.length > 0 ? exatos : ativos.filter((h) => h.name.toLowerCase().includes(alvo));

  if (candidatos.length === 0) {
    throw new EfeitoImpossivel(
      `Não há hábito ativo chamado "${nome}". Nada foi registrado — confira o nome em Hábitos.`,
    );
  }
  if (candidatos.length > 1) {
    throw new EfeitoImpossivel(
      `"${nome}" casa com ${candidatos.length} hábitos (${candidatos.map((h) => h.name).join(", ")}). Diga qual deles.`,
    );
  }
  return candidatos[0];
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   registrarHabito
   ══════════════════════════════════════════════════════════════════════════════════════ */

export async function preverRegistrarHabito(payload: unknown): Promise<EfeitoProposto> {
  const d = payload as RegistrarHabitoEntrada;
  const hoje = hojeISO();
  const data = d.data ?? hoje;

  if (data > hoje) {
    throw new EfeitoImpossivel(
      "Não dá para registrar um hábito numa data futura. Registre no dia em que acontecer.",
    );
  }

  const habito = await resolverHabito(d.habito, hoje);
  const meta = Number(habito.target_value);
  const unidade = (v: number) => formatHabitValue(v, habito.unit as HabitUnit);

  // Existência é diferente de valor > 0. A leitura exata também alcança datas passadas.
  const registroAnterior = await getHabitLogForDate(habito.id, data);
  const ehHoje = data === hoje;
  const valorAtual = registroAnterior === null ? null : Number(registroAnterior.value);
  const comoDesfazer = registroAnterior === null
    ? { kind: "command" as const, command: "desfazerHabito" }
    : { kind: "nao-ha" as const, porque: MOTIVO_REGISTRO_ANTERIOR };
  const novoValor = d.valor ?? meta;

  const linhas = [
    { rotulo: "Hábito", valor: habito.name },
    { rotulo: "Data", valor: data },
    {
      rotulo: "Valor registrado",
      valor: `${unidade(novoValor)} (meta do dia: ${unidade(meta)})`,
    },
  ];

  const ressalvas: string[] = [];
  if (valorAtual !== null) {
    linhas.splice(2, 0, {
      rotulo: ehHoje ? "Já registrado hoje" : "Já registrado nesse dia",
      valor: unidade(valorAtual),
    });
    ressalvas.push(
      `O registro SUBSTITUI o valor do dia: ${unidade(valorAtual)} passa a ser ${unidade(novoValor)}. Ele não soma ao que já estava lá.`,
    );
  }
  if (d.valor === undefined || d.valor === null) {
    ressalvas.push(
      `Nenhum valor foi informado, então o dia é marcado como concluído com a meta cheia (${unidade(meta)}).`,
    );
  }
  if (!habito.scheduledToday && ehHoje) {
    // Registrar num dia não agendado é permitido pelo módulo — mas o dono merece saber.
    ressalvas.push("Este hábito não estava agendado para hoje. O registro é aceito mesmo assim.");
  }

  linhas.push({
    rotulo: "Desfazer",
    valor: comoDesfazer.kind === "nao-ha" ? "Não há desfazer para esta substituição." : "Apaga o registro criado pela IA neste dia.",
  });
  if (comoDesfazer.kind === "nao-ha") ressalvas.push(comoDesfazer.porque);

  return {
    comoDesfazer,
    command: "registrarHabito",
    payload: { ...d },
    entidades: [{ tipo: "habito", id: habito.id, rota: ROTA_DO_PAINEL }],
    previsao: {
      resumo: `Registrar ${unidade(novoValor)} em "${habito.name}" no dia ${data}.`,
      linhas,
      ressalvas,
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   desfazerHabito — o `undo` declarado
   ══════════════════════════════════════════════════════════════════════════════════════ */

export async function preverDesfazerHabito(payload: unknown): Promise<EfeitoProposto> {
  const d = payload as DesfazerHabitoEntrada;
  const { habits } = await getHabitsDashboard(hojeISO());
  const habito = habits.find((h) => h.id === d.habito_id);

  if (!habito) {
    throw new EfeitoImpossivel("O hábito não existe mais (ou não é seu). Nada foi alterado.");
  }

  return {
    command: "desfazerHabito",
    payload: { ...d },
    entidades: [{ tipo: "habito", id: habito.id, rota: ROTA_DO_PAINEL }],
    previsao: {
      resumo: `Apagar o registro de "${habito.name}" no dia ${d.data}.`,
      linhas: [
        { rotulo: "Hábito", valor: habito.name },
        { rotulo: "Data", valor: d.data },
      ],
      // A distinção que a invariante 20 da Dieta fixou, aplicada aqui: apagar ≠ zerar.
      ressalvas: [
        "O dia volta a ficar SEM REGISTRO — que é diferente de registrar zero. A sequência do hábito é recalculada a partir disso.",
      ],
    },
  };
}

/** O `parse` na forma que o contrato pede. Reusado dos dois lados. */
export function parseComHabito<T extends z.ZodType>(schema: T) {
  return (payload: unknown): { ok: true; valor: unknown } | { ok: false } => {
    const r = schema.safeParse(payload);
    return r.success ? { ok: true, valor: r.data } : { ok: false };
  };
}
