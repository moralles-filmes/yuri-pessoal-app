import "server-only";

/**
 * Fase 18-C — IA · As duas ferramentas de Medidas Corporais. CASCAS FINAS.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ `body_*` É MÓDULO CENTRAL — a 16-E criou, a 17-E consome, e agora a IA lê.            ║
 * ║                                                                                       ║
 * ║ Não existe rota `/medidas`: o mesmo dado aparece dentro de Dieta e de Treinos. Por     ║
 * ║ isso estas duas ferramentas não têm agente próprio — ficam na allowlist dos agentes   ║
 * ║ de Dieta E de Treinos, exigindo `allow_body`. O guard confere a permissão da           ║
 * ║ FERRAMENTA, não a do agente, então isso funciona sem código novo.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⚠️ ESTE É O MÓDULO ONDE "AUSÊNCIA NÃO É ZERO" TEM CONSEQUÊNCIA CLÍNICA.                ║
 * ║                                                                                       ║
 * ║ Sem medição, o valor é INDISPONÍVEL — nunca zero (invariante 3 dos Treinos, 20 da     ║
 * ║ Dieta). Um "peso: 0" relatado ao modelo vira "você pesa 0 kg" ou, pior, entra numa    ║
 * ║ média. Dia sem registro devolve `null`, e a série INTERROMPE — ela não interpola.      ║
 * ║                                                                                       ║
 * ║ E SEM PRESCRIÇÃO: nada aqui sugere peso ideal, classifica IMC ou propõe alvo.         ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ **As fotos de evolução NÃO são lidas por ferramenta nenhuma**, e isso é deliberado: são
 * o dado mais sensível do sistema (bucket privado, URL assinada de 5 min, `storage_path` que
 * não sai do servidor). Nada disso passa por um modelo de terceiro.
 *
 * `user_id` não aparece em lugar nenhum: as queries rodam sob RLS, com a sessão do usuário.
 */

import { z } from "zod";
import { getMeasurements, getMeasurementTypes } from "@/lib/body/queries";
import type { MeasurementWithType } from "@/lib/body/types";
import { normalizarTexto } from "@/lib/ai/core/text";
import { hojeISO } from "@/lib/format";
import { emptyToolOutput, type ToolOutput, type ToolRef } from "../contracts";

/** ⚠️ `.strict()` nos dois: campo a mais é erro, e é por aqui que `user_id` seria barrado. */
export const getLatestInput = z.object({}).strict();

export const getSeriesInput = z
  .object({
    medida: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .describe("Parte do nome da medida (ex.: peso, cintura)."),
    dias: z.number().int().min(2).max(730).optional(),
  })
  .strict();

const JANELA_PADRAO_DIAS = 90;

/**
 * Não há rota própria de medidas: a tela vive dentro de Dieta. Uma ref por medição
 * apontaria N links idênticos — mesmo caso dos Hábitos.
 */
const REF_DO_PAINEL: ToolRef = {
  tipo: "painel_de_medidas",
  id: "medidas",
  rota: "/nutricao/medidas",
};

/** Subtrai dias de uma data pura, em `Date.UTC` — nunca `new Date()` no fuso local. */
function subtrairDias(iso: string, dias: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const base = Date.UTC(y, m - 1, d) - dias * 86_400_000;
  return new Date(base).toISOString().slice(0, 10);
}

export async function getLatest(): Promise<ToolOutput> {
  const [tipos, medicoes] = await Promise.all([
    getMeasurementTypes(),
    // Sem intervalo: o histórico inteiro, já ordenado por data decrescente pela query.
    getMeasurements(),
  ]);

  const ativos = tipos.filter((t) => t.isActive);

  if (medicoes.length === 0) {
    return emptyToolOutput(
      ativos.length === 0
        ? "Não há tipo de medida configurado nem medição registrada."
        : `Nenhuma medição registrada ainda, em ${ativos.length} tipo(s) de medida configurado(s). Isso é ausência de registro — não há valor a informar.`,
    );
  }

  /**
   * A primeira ocorrência de cada tipo É a mais recente: `getMeasurements` ordena por
   * `measured_on` desc e depois `measured_at` desc. Depender dessa ordem é reusar a decisão
   * da query em vez de reordenar aqui com outro critério de desempate.
   */
  const ultimaPorTipo = new Map<string, MeasurementWithType>();
  for (const m of medicoes) {
    if (!ultimaPorTipo.has(m.typeId)) ultimaPorTipo.set(m.typeId, m);
  }

  const comMedicao = ativos
    .map((t) => ({ tipo: t, ultima: ultimaPorTipo.get(t.id) ?? null }))
    .filter((x) => x.ultima !== null);

  const semMedicao = ativos.filter((t) => !ultimaPorTipo.has(t.id));

  return {
    periodo: null,
    contagem: comMedicao.length,
    completude: "exato",
    agregados: {
      tipos_ativos: ativos.length,
      tipos_com_medicao: comMedicao.length,
      /**
       * Tipos configurados e NUNCA medidos aparecem nominalmente. Omiti-los faria a resposta
       * tratar "não sei" como "não existe" — e o usuário perguntaria por que a IA ignorou uma
       * medida que ele cadastrou.
       */
      tipos_sem_nenhuma_medicao: semMedicao.map((t) => t.name),
      medicao_mais_recente:
        comMedicao.length > 0
          ? comMedicao
              .map((x) => x.ultima!.measuredOn)
              .reduce((a, b) => (a > b ? a : b))
          : null,
    },
    itens: comMedicao.map(({ tipo, ultima }) => ({
      medida: tipo.name,
      valor: ultima!.value,
      // A unidade é CONGELADA na gravação: trocar a unidade do tipo não reescreve o histórico.
      unidade: ultima!.unit,
      medida_em: ultima!.measuredOn,
      condicao: ultima!.condition,
      // Sem "peso ideal", sem faixa, sem classificação. O número e a data, e nada além.
    })),
    refs: [REF_DO_PAINEL],
  };
}

export async function getSeries(input: {
  medida: string;
  dias?: number;
}): Promise<ToolOutput> {
  const dias = input.dias ?? JANELA_PADRAO_DIAS;
  const ate = hojeISO();
  const de = subtrairDias(ate, dias - 1);

  const tipos = await getMeasurementTypes();
  // A MESMA normalização do roteador: sem tirar acento, "biceps" não casa "Bíceps" e a
  // resposta afirmaria que não há medida onde há.
  const filtro = normalizarTexto(input.medida);
  const escolhidos = tipos.filter((t) => normalizarTexto(t.name).includes(filtro));

  if (escolhidos.length === 0) {
    return {
      ...emptyToolOutput(
        `Nenhum tipo de medida cadastrado com "${input.medida}" no nome. Os tipos configurados são: ${tipos.map((t) => t.name).join(", ") || "(nenhum)"}.`,
      ),
      periodo: { de, ate },
    };
  }

  const medicoes = await getMeasurements({
    from: de,
    to: ate,
    typeIds: escolhidos.map((t) => t.id),
  });

  if (medicoes.length === 0) {
    return {
      ...emptyToolOutput(
        `Nenhuma medição de ${escolhidos.map((t) => t.name).join(", ")} entre ${de} e ${ate}. Isso é ausência de registro no período — não significa que a medida não mudou, e não é zero.`,
      ),
      periodo: { de, ate },
    };
  }

  // Ordem cronológica para a série ser lida da esquerda para a direita.
  const serie = [...medicoes].sort((a, b) =>
    a.measuredOn < b.measuredOn ? -1 : a.measuredOn > b.measuredOn ? 1 : 0,
  );
  const primeira = serie[0];
  const ultima = serie[serie.length - 1];

  /**
   * ⚠️ A VARIAÇÃO SÓ EXISTE COM DOIS PONTOS DO MESMO TIPO — e a comparação é entre a primeira
   * e a última medição REGISTRADAS, não entre as bordas da janela. Com um ponto só, ela é
   * `null` com o motivo: "sem base" é a resposta correta, nunca 0 (invariante 21 da 17-E).
   *
   * Com mais de um tipo casando o filtro, não há variação única a calcular — e inventar uma
   * misturaria grandezas diferentes (kg com cm).
   */
  const umTipoSo = escolhidos.length === 1;
  const variacao =
    umTipoSo && serie.length >= 2
      ? {
          variacao: Number((ultima.value - primeira.value).toFixed(4)),
          unidade: ultima.unit,
          de_valor: primeira.value,
          de_data: primeira.measuredOn,
          ate_valor: ultima.value,
          ate_data: ultima.measuredOn,
        }
      : {
          variacao: null,
          variacao_indisponivel_porque: !umTipoSo
            ? `O filtro casou ${escolhidos.length} tipos de medida (${escolhidos.map((t) => t.name).join(", ")}), que têm grandezas diferentes. Peça uma medida específica para ter a variação.`
            : "Há apenas uma medição no período: sem uma segunda, não existe base de comparação. Isso não é variação zero.",
        };

  return {
    periodo: { de, ate },
    contagem: serie.length,
    completude: "exato",
    agregados: {
      medidas_encontradas: escolhidos.map((t) => t.name),
      medicoes: serie.length,
      janela_dias: dias,
      ...variacao,
      // Sem média móvel: ela só valeria com a janela cheia (invariante 21 da 16-E), e esta
      // ferramenta não tem como garantir isso. Não calcular é melhor que suavizar dois pontos.
    },
    itens: serie.map((m) => ({
      medida: m.typeName,
      data: m.measuredOn,
      hora: m.measuredAt,
      valor: m.value,
      unidade: m.unit,
      condicao: m.condition,
    })),
    refs: [REF_DO_PAINEL],
  };
}
