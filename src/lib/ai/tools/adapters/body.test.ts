/**
 * Fase 18-C — IA · Medidas corporais: ausência nunca vira número.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ É AQUI QUE "AUSÊNCIA NÃO É ZERO" TEM A CONSEQUÊNCIA MAIS FEIA.                        ║
 * ║                                                                                       ║
 * ║ Um "peso: 0" relatado ao modelo vira "você pesa 0 kg" — ou, pior, entra numa média.   ║
 * ║ Uma "variação: 0" com uma medição só afirma estabilidade que ninguém mediu. Os dois   ║
 * ║ casos têm teste próprio, e os dois devolvem `null` COM O MOTIVO.                       ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeasurementType, MeasurementWithType } from "@/lib/body/types";

const HOJE = "2026-08-07";

let tiposFalsos: MeasurementType[] = [];
let medicoesFalsas: MeasurementWithType[] = [];
let ultimoFiltro: { from?: string; to?: string; typeIds?: string[] } | null = null;

vi.mock("@/lib/format", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/format")>()),
  hojeISO: () => HOJE,
}));

vi.mock("@/lib/body/queries", () => ({
  getMeasurementTypes: async () => tiposFalsos,
  getMeasurements: async (options: { from?: string; to?: string; typeIds?: string[] } = {}) => {
    ultimoFiltro = options;
    const porTipo = options.typeIds
      ? medicoesFalsas.filter((m) => options.typeIds!.includes(m.typeId))
      : medicoesFalsas;
    return porTipo.filter(
      (m) =>
        (!options.from || m.measuredOn >= options.from) &&
        (!options.to || m.measuredOn <= options.to),
    );
  },
}));

const { getLatest, getSeries } = await import("./body");

/* ═══════════════════════════ Fixtures mínimas ═══════════════════════════ */

function tipo(over: Partial<MeasurementType> & { id: string; name: string }): MeasurementType {
  return {
    slug: over.name.toLowerCase(),
    unit: "kg",
    category: "peso",
    side: null,
    decimals: 1,
    position: 0,
    isActive: true,
    isDefault: true,
    note: null,
    ...over,
  } as MeasurementType;
}

function medicao(
  over: Partial<MeasurementWithType> & {
    id: string;
    typeId: string;
    measuredOn: string;
    value: number;
  },
): MeasurementWithType {
  return {
    measuredAt: null,
    unit: "kg",
    condition: null,
    note: null,
    source: "manual",
    createdAt: "2026-01-01T00:00:00.000Z",
    typeName: "Peso",
    typeSlug: "peso",
    typeCategory: "peso",
    typeDecimals: 1,
    ...over,
  } as MeasurementWithType;
}

const TIPO_PESO = tipo({ id: "tp", name: "Peso", slug: "peso" });
const TIPO_CINTURA = tipo({
  id: "tc",
  name: "Cintura",
  slug: "cintura",
  unit: "cm",
  category: "circunferencia",
});
/** Configurado e NUNCA medido — o caso que não pode sumir da resposta. */
const TIPO_BRACO = tipo({ id: "tb", name: "Braço", slug: "braco", unit: "cm" });

beforeEach(() => {
  tiposFalsos = [TIPO_PESO, TIPO_CINTURA, TIPO_BRACO];
  // Ordem DECRESCENTE por data, como a query devolve.
  medicoesFalsas = [
    medicao({ id: "m3", typeId: "tp", measuredOn: "2026-08-05", value: 79.2 }),
    medicao({ id: "m2", typeId: "tp", measuredOn: "2026-07-20", value: 80.4 }),
    medicao({
      id: "mc",
      typeId: "tc",
      measuredOn: "2026-08-01",
      value: 84,
      unit: "cm",
      typeName: "Cintura",
      typeSlug: "cintura",
    }),
    medicao({ id: "m1", typeId: "tp", measuredOn: "2026-05-01", value: 83 }),
  ];
});

/* ═══════════════════════════════ Testes ═══════════════════════════════ */

describe("body.get_latest", () => {
  it("devolve a medição mais recente de cada tipo medido", async () => {
    const saida = await getLatest();
    const porNome = (n: string) =>
      saida.itens.find((i) => (i as { medida: string }).medida === n) as {
        valor: number;
        medida_em: string;
        unidade: string;
      };

    expect(saida.contagem).toBe(2);
    // 05/08 é mais recente que 20/07 e 01/05.
    expect(porNome("Peso")).toMatchObject({ valor: 79.2, medida_em: "2026-08-05" });
    expect(porNome("Cintura")).toMatchObject({ valor: 84, unidade: "cm" });
  });

  /**
   * ⚠️ Tipo configurado e nunca medido aparece NOMINALMENTE. Omiti-lo faria a resposta tratar
   * "não sei" como "não existe" — e nunca, jamais, como zero.
   */
  it("tipo sem nenhuma medição é listado à parte, nunca como zero", async () => {
    const saida = await getLatest();
    expect(saida.agregados).toMatchObject({
      tipos_ativos: 3,
      tipos_com_medicao: 2,
      tipos_sem_nenhuma_medicao: ["Braço"],
    });
    // E não aparece na lista de valores, com valor nenhum.
    const nomes = saida.itens.map((i) => (i as { medida: string }).medida);
    expect(nomes).not.toContain("Braço");
  });

  it("sem nenhuma medição, diz que é ausência de registro", async () => {
    medicoesFalsas = [];
    const saida = await getLatest();
    expect(saida.contagem).toBe(0);
    expect(saida.observacao).toContain("ausência de registro");
    expect(saida.observacao).toContain("3 tipo(s)");
  });

  it("não emite juízo sobre o valor", async () => {
    const saida = await getLatest();
    const texto = JSON.stringify(saida).toLowerCase();
    for (const proibido of ["ideal", "saudavel", "saudável", "imc", "sobrepeso", "obesidade"]) {
      expect(texto, proibido).not.toContain(proibido);
    }
  });
});

describe("body.get_series", () => {
  it("filtra o tipo pelo nome, sem depender de acento", async () => {
    tiposFalsos = [tipo({ id: "tb2", name: "Bíceps", slug: "biceps", unit: "cm" })];
    medicoesFalsas = [
      medicao({ id: "b1", typeId: "tb2", measuredOn: "2026-08-01", value: 38 }),
      medicao({ id: "b2", typeId: "tb2", measuredOn: "2026-08-05", value: 38.5 }),
    ];

    const saida = await getSeries({ medida: "biceps" });
    expect(saida.contagem).toBe(2);
  });

  it("ordena a série em ordem cronológica", async () => {
    // `dias: 365` de propósito: a janela PADRÃO é de 90 dias e deixaria 01/05 de fora — o que
    // está correto, e é justamente o que o caso seguinte cobre.
    const saida = await getSeries({ medida: "peso", dias: 365 });
    const datas = saida.itens.map((i) => (i as { data: string }).data);
    // A query devolve decrescente; a série sai crescente para ser lida da esquerda à direita.
    expect(datas).toEqual(["2026-05-01", "2026-07-20", "2026-08-05"]);
  });

  it("a janela padrão de 90 dias recorta o que está fora dela", async () => {
    // De 2026-05-10 a 2026-08-07: a medição de 01/05 fica fora, as outras duas entram.
    const saida = await getSeries({ medida: "peso" });
    const datas = saida.itens.map((i) => (i as { data: string }).data);
    expect(datas).toEqual(["2026-07-20", "2026-08-05"]);
  });

  it("calcula a variação entre a primeira e a última medição REGISTRADAS", async () => {
    const saida = await getSeries({ medida: "peso", dias: 365 });
    // 79.2 − 83 = −3.8
    expect(saida.agregados).toMatchObject({
      variacao: -3.8,
      de_valor: 83,
      de_data: "2026-05-01",
      ate_valor: 79.2,
      ate_data: "2026-08-05",
    });
  });

  /**
   * ⚠️ O CASO CENTRAL. Com uma medição só não existe base de comparação. Devolver 0 afirmaria
   * estabilidade que ninguém mediu — é a invariante 21 da 17-E ("sem base"), aplicada aqui.
   */
  it("com uma medição só, a variação é NULA com o motivo — nunca zero", async () => {
    medicoesFalsas = [medicao({ id: "u", typeId: "tp", measuredOn: "2026-08-05", value: 79.2 })];

    const saida = await getSeries({ medida: "peso" });
    expect(saida.contagem).toBe(1);
    expect(saida.agregados).toMatchObject({ variacao: null });
    expect(
      (saida.agregados as { variacao_indisponivel_porque: string }).variacao_indisponivel_porque,
    ).toContain("não é variação zero");
  });

  /**
   * Filtro que casa mais de um tipo não tem variação única: somar kg com cm seria a mesma
   * classe de erro que somar quilos com segundos no módulo de Treinos.
   */
  it("filtro que casa vários tipos não inventa uma variação", async () => {
    tiposFalsos = [
      tipo({ id: "t1", name: "Coxa direita", unit: "cm" }),
      tipo({ id: "t2", name: "Coxa esquerda", unit: "cm" }),
    ];
    medicoesFalsas = [
      medicao({ id: "a", typeId: "t1", measuredOn: "2026-08-01", value: 55, unit: "cm" }),
      medicao({ id: "b", typeId: "t2", measuredOn: "2026-08-05", value: 56, unit: "cm" }),
    ];

    const saida = await getSeries({ medida: "coxa" });
    expect(saida.agregados).toMatchObject({ variacao: null });
    expect(
      (saida.agregados as { variacao_indisponivel_porque: string }).variacao_indisponivel_porque,
    ).toContain("2 tipos");
  });

  it("período sem medição diz que é ausência de registro, e não que nada mudou", async () => {
    // `dias: 2` = de 06/08 a 07/08. A medição mais recente é de 05/08, então a janela é vazia.
    const saida = await getSeries({ medida: "peso", dias: 2 });
    expect(saida.contagem).toBe(0);
    expect(saida.observacao).toContain("ausência de registro");
    expect(saida.observacao).toContain("não é zero");
  });

  it("tipo inexistente lista os tipos que existem, em vez de negar o dado", async () => {
    const saida = await getSeries({ medida: "panturrilha" });
    expect(saida.contagem).toBe(0);
    expect(saida.observacao).toContain("Peso, Cintura, Braço");
  });

  it("a janela é inclusiva nos dois extremos e vai para a query", async () => {
    await getSeries({ medida: "peso", dias: 7 });
    // 7 dias terminando hoje = de 01/08 até 07/08.
    expect(ultimoFiltro).toMatchObject({ from: "2026-08-01", to: HOJE });
  });

  it("não calcula média móvel nem tendência", async () => {
    const saida = await getSeries({ medida: "peso", dias: 365 });
    const chaves = Object.keys(saida.agregados);
    for (const proibida of ["media", "media_movel", "tendencia", "projecao"]) {
      expect(chaves, proibida).not.toContain(proibida);
    }
  });
});
