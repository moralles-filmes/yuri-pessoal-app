import "server-only";

/**
 * Fase 18-C · Bloco 4 — IA · A METADE QUE SÓ LÊ dos commands de Dieta.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ESTA PREVISÃO CARREGA UM PESO QUE AS OUTRAS NÃO CARREGAM.                             ║
 * ║                                                                                       ║
 * ║ O que ela mostra são NUTRIENTES, e o histórico do consumo é IMUTÁVEL (invariante 9 do  ║
 * ║ módulo): confirmado, o snapshot congela e o total do dia passa a somá-lo para sempre.  ║
 * ║ Duas consequências que valem para todo este arquivo:                                   ║
 * ║                                                                                       ║
 * ║   • NUTRIENTE AUSENTE NÃO É ZERO (invariante 1). `energyKcal` e companhia são          ║
 * ║     `number | null`, e `null` vira "não informado" na tela — nunca "0 kcal", que o     ║
 * ║     dono leria como "não tem caloria".                                                 ║
 * ║   • SEM PRESCRIÇÃO (invariante 12). A previsão diz o que vai ser registrado e quanto   ║
 * ║     falta para a meta do dia, se houver meta. Não diz se é muito, se é pouco, nem se   ║
 * ║     ele deveria comer aquilo.                                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { z } from "zod";
import {
  getMealTypes,
  getMeasuresForFoods,
  montarSnapshotDoConsumo,
  searchFoodsByTerm,
  type FoodSearchHit,
  type MeasureBasics,
} from "@/lib/nutrition/diary-queries";
import { roundForDisplay } from "@/lib/nutrition/calc";
import { NUTRITION_BASE_PATH } from "@/lib/nutrition/constants";
import { hojeISO } from "@/lib/format";
import type { DiaryEntrySnapshot } from "@/lib/nutrition/types";
import { EfeitoImpossivel, type EfeitoProposto } from "../contracts";

const ROTA_DO_DIARIO = `${NUTRITION_BASE_PATH}/diario`;

/* ══════════════════════════════════════════════════════════════════════════════════════
   Entrada
   ══════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ `alimento`, `medida` e `refeicao` são NOMES, não ids — a mesma disciplina do TO-DO e dos
 * Hábitos. Um uuid vindo do modelo é adivinhação com cara de precisão, e aqui ela custaria
 * caro: o id errado registraria outro alimento, com outro valor nutricional, no histórico que
 * não se corrige.
 *
 * `medida` ausente significa a UNIDADE BASE do alimento (g ou ml) — não uma medida caseira
 * escolhida pelo sistema. "200 de arroz" é 200 g; "2 colheres" exige a medida cadastrada.
 */
export const registrarConsumoEntrada = z
  .object({
    alimento: z.string().trim().min(2).max(120),
    quantidade: z.number().positive().max(100_000),
    medida: z.string().trim().max(80).nullable().optional(),
    refeicao: z.string().trim().min(2).max(80),
    data: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
      .nullable()
      .optional(),
  })
  .strict();
export type RegistrarConsumoEntrada = z.infer<typeof registrarConsumoEntrada>;

export const desfazerConsumoEntrada = z.object({ entrada_id: z.uuid() }).strict();
export type DesfazerConsumoEntrada = z.infer<typeof desfazerConsumoEntrada>;

/** O `parse` na forma que o contrato pede. Reusado pelas duas metades. */
export function parseComConsumo<T extends z.ZodType>(schema: T) {
  return (payload: unknown): { ok: true; valor: unknown } | { ok: false } => {
    const r = schema.safeParse(payload);
    return r.success ? { ok: true, valor: r.data } : { ok: false };
  };
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   Resolução — alimento, medida e refeição
   ══════════════════════════════════════════════════════════════════════════════════════ */

export type ConsumoResolvido = {
  readonly alimento: FoodSearchHit;
  readonly medida: MeasureBasics | null;
  readonly refeicao: { id: string; name: string };
  readonly data: string;
};

/**
 * Escolhe UM entre os candidatos, ou lança.
 *
 * A regra é a mesma dos Hábitos: casamento exato ganha de casamento parcial; nenhum candidato
 * e mais de um candidato viram `EfeitoImpossivel`, com os nomes na mensagem. O sistema nunca
 * desempata sozinho — "arroz" casando com "Arroz branco cozido" e "Arroz integral cru" são
 * dois alimentos com valores nutricionais diferentes, e escolher o primeiro seria registrar
 * no histórico uma comida que o dono não disse que comeu.
 *
 * ⚠️ EXPORTADA PARA TESTE, e não por acaso: uma mutação que trocava a recusa por "pega o
 * primeiro" passou VERDE enquanto ela era privada — a regra mais importante da resolução não
 * tinha um único caso que a exercitasse. Testar através de `resolverConsumo` exigiria banco.
 */
export function umSo<T>(
  candidatos: readonly T[],
  nomeDe: (c: T) => string,
  termo: string,
  oQue: string,
  ondeProcurar: string,
): T {
  const alvo = termo.toLowerCase();
  const exatos = candidatos.filter((c) => nomeDe(c).toLowerCase() === alvo);
  const lista = exatos.length > 0 ? exatos : candidatos;

  if (lista.length === 0) {
    throw new EfeitoImpossivel(
      `Não encontrei ${oQue} "${termo}". Nada foi registrado — confira o nome em ${ondeProcurar}.`,
    );
  }
  if (lista.length > 1) {
    const nomes = lista.slice(0, 6).map(nomeDe).join(", ");
    throw new EfeitoImpossivel(
      `"${termo}" casa com ${lista.length} ${oQue}s (${nomes}${lista.length > 6 ? ", ..." : ""}). Diga qual deles — os valores nutricionais são diferentes.`,
    );
  }
  return lista[0];
}

export async function resolverConsumo(d: RegistrarConsumoEntrada): Promise<ConsumoResolvido> {
  const hoje = hojeISO();
  const data = d.data ?? hoje;

  if (data > hoje) {
    throw new EfeitoImpossivel(
      "Não dá para registrar consumo numa data futura. O diário é do que já foi comido; o que ainda vai ser comido é planejamento.",
    );
  }

  const alimento = umSo(
    await searchFoodsByTerm(d.alimento, 30),
    (f) => (f.brand ? `${f.name} (${f.brand})` : f.name),
    d.alimento,
    "alimento",
    "Dieta › Alimentos",
  );

  const tipos = (await getMealTypes()).filter((t) => t.isActive);
  const alvo = d.refeicao.toLowerCase();
  const refeicao = umSo(
    tipos.filter(
      (t) => t.name.toLowerCase() === alvo || t.name.toLowerCase().includes(alvo),
    ),
    (t) => t.name,
    d.refeicao,
    "refeição",
    "Dieta › Diário",
  );

  let medida: MeasureBasics | null = null;
  if (d.medida) {
    const medidas = (await getMeasuresForFoods([alimento.id])).get(alimento.id) ?? [];
    medida = umSo(
      medidas.filter(
        (m) =>
          m.label.toLowerCase() === d.medida!.toLowerCase() ||
          m.label.toLowerCase().includes(d.medida!.toLowerCase()),
      ),
      (m) => m.label,
      d.medida,
      "medida",
      `as medidas cadastradas de ${alimento.name}`,
    );
  }

  return { alimento, medida, refeicao: { id: refeicao.id, name: refeicao.name }, data };
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   A previsão
   ══════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⛔ O FORMATADOR QUE RECUSA INVENTAR ZERO.
 *
 * `null` é ausência de dado na fonte (TACO não mede aquele nutriente para aquele alimento), e
 * é diferente de zero medido. Escrever "0 g" aqui faria o dono confirmar um registro achando
 * que a informação existe — e ela entraria congelada no histórico do mesmo jeito, porque o
 * snapshot já guarda `null`. A tela e o congelado passariam a discordar.
 */
export function valorOuAusente(
  valor: number | null,
  unidade: string,
  casas = 1,
): string {
  if (valor === null || !Number.isFinite(valor)) return "não informado na fonte";
  return `${roundForDisplay(valor, casas).toLocaleString("pt-BR")} ${unidade}`;
}

/**
 * As quatro linhas nutricionais que a tela do módulo já mostra em todo item do diário —
 * energia com zero casas e macros com uma, como em `diary-client.tsx`.
 */
function linhasDeNutrientes(s: DiaryEntrySnapshot) {
  return [
    { rotulo: "Energia", valor: valorOuAusente(s.energyKcal, "kcal", 0) },
    { rotulo: "Proteína", valor: valorOuAusente(s.proteinG, "g") },
    { rotulo: "Carboidrato", valor: valorOuAusente(s.carbG, "g") },
    { rotulo: "Gordura", valor: valorOuAusente(s.fatG, "g") },
  ];
}

export async function preverRegistrarConsumo(payload: unknown): Promise<EfeitoProposto> {
  const d = payload as RegistrarConsumoEntrada;
  const r = await resolverConsumo(d);

  /**
   * ⚠️ O SNAPSHOT É MONTADO AQUI, na previsão, pelo MESMO caminho que vai gravá-lo. Não é
   * uma estimativa do que vai acontecer: é o cálculo real, mostrado antes.
   *
   * E é o que faz a revalidação por hash proteger o histórico: se o valor nutricional do
   * alimento mudar no catálogo entre propor e confirmar, o snapshot recalculado difere, o
   * hash diverge e a execução é recusada — em vez de congelar no diário um número que o dono
   * nunca leu.
   */
  const montado = await montarSnapshotDoConsumo(r.alimento.id, d.quantidade, r.medida?.id ?? null);
  if (!montado.ok) {
    // Conversão impossível (g→ml sem densidade) chega aqui como erro tipado do módulo. A
    // mensagem é a do próprio módulo — não uma paráfrase, e nunca uma estimativa.
    throw new EfeitoImpossivel(`${montado.erro} Nada foi registrado.`);
  }
  const s = montado.snapshot;

  const unidadeDita = r.medida
    ? `${d.quantidade} × ${r.medida.label}`
    : `${d.quantidade} ${r.alimento.baseUnit}`;

  const linhas = [
    { rotulo: "Alimento", valor: r.alimento.brand ? `${r.alimento.name} (${r.alimento.brand})` : r.alimento.name },
    { rotulo: "Quantidade", valor: unidadeDita },
    { rotulo: "Refeição", valor: r.refeicao.name },
    { rotulo: "Data", valor: r.data },
    ...linhasDeNutrientes(s),
  ];

  if (r.medida && s.gramsEquivalent !== null) {
    linhas.splice(2, 0, {
      rotulo: "Equivale a",
      valor: `${roundForDisplay(s.gramsEquivalent, 1).toLocaleString("pt-BR")} ${r.alimento.baseUnit}`,
    });
  }

  const ressalvas: string[] = [
    "O registro CONGELA estes valores no diário: o total do dia passa a somar o que está aqui, e ele não muda se o alimento for editado no catálogo depois.",
  ];

  if (s.energyKcal === null) {
    ressalvas.push(
      "A fonte não informa a energia deste alimento. O registro acontece do mesmo jeito, e o total do dia fica marcado como PARCIAL — nenhum valor é estimado no lugar.",
    );
  }
  if (s.sourceNameSnapshot) {
    ressalvas.push(`Procedência do valor nutricional: ${s.sourceNameSnapshot}.`);
  }
  if (r.data !== hojeISO()) {
    ressalvas.push("A data não é hoje — o registro entra no diário daquele dia.");
  }

  return {
    command: "registrarConsumo",
    payload: { ...d },
    entidades: [
      { tipo: "alimento", id: r.alimento.id, rota: ROTA_DO_DIARIO },
      { tipo: "refeicao", id: r.refeicao.id, rota: ROTA_DO_DIARIO },
    ],
    previsao: {
      resumo: `Registrar ${unidadeDita} de "${r.alimento.name}" em ${r.refeicao.name}, no dia ${r.data}.`,
      linhas,
      ressalvas,
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   desfazerConsumo — o `undo` declarado
   ══════════════════════════════════════════════════════════════════════════════════════ */

export async function preverDesfazerConsumo(payload: unknown): Promise<EfeitoProposto> {
  const d = payload as DesfazerConsumoEntrada;

  return {
    command: "desfazerConsumo",
    payload: { ...d },
    entidades: [{ tipo: "entrada_do_diario", id: d.entrada_id, rota: ROTA_DO_DIARIO }],
    previsao: {
      resumo: "Apagar do diário o item que a IA acabou de registrar.",
      linhas: [{ rotulo: "Item", valor: d.entrada_id }],
      /**
       * A invariante 1 do módulo, dita ao dono: apagar ≠ zerar. Um item zerado afirmaria que
       * ele comeu nada daquele alimento; apagado, o dia volta a não ter aquele registro.
       */
      ressalvas: [
        "O item some do diário e o total do dia volta ao que era. Isso é diferente de registrar quantidade zero: não fica medição nenhuma no lugar.",
      ],
    },
  };
}

/** A rota que a tela usa para levar ao dia do registro. */
export function rotaDoDiario(data: string): string {
  return `${ROTA_DO_DIARIO}?date=${data}`;
}
