/**
 * Fase 18-C · Bloco 4 — IA · Os commands de Hábitos.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE ESTE ARQUIVO GUARDA, E É O QUE MAIS PODE MACHUCAR AQUI: **o registro SUBSTITUI   ║
 * ║ o valor do dia, e a previsão precisa dizer isso.**                                     ║
 * ║                                                                                       ║
 * ║ `habit_logs` tem unique `(user_id, habit_id, log_date)` e o serviço faz `upsert`. Quem ║
 * ║ bebeu 6 copos, pede "registra 2 copos de água" e confirma, fica com 2 — não com 8. Se  ║
 * ║ o cartão não mostrar o valor que já existe, o dono confirma uma coisa achando que está ║
 * ║ confirmando outra, e o Approval Engine inteiro vira teatro.                            ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Habito = Record<string, unknown>;
let habitos: Habito[] = [];

vi.mock("@/lib/habits/queries", () => ({
  getHabitsDashboard: async () => ({ habits: habitos, consistency: {} }),
}));

vi.mock("@/lib/format", async (original) => {
  const real = await original<typeof import("@/lib/format")>();
  return { ...real, hojeISO: () => "2026-08-07" };
});

const { preverRegistrarHabito, registrarHabitoEntrada } = await import("./habits-preview");
const { EfeitoImpossivel } = await import("../contracts");

const ID = "11111111-2222-4333-8444-555555555555";

const agua = (extra: Partial<Record<string, unknown>> = {}) => ({
  id: ID,
  name: "Beber água",
  is_active: true,
  target_value: 8,
  unit: "vezes",
  todayValue: 0,
  todayDone: false,
  scheduledToday: true,
  ...extra,
});

beforeEach(() => {
  habitos = [agua()];
});

describe("a entrada é fechada", () => {
  it("aceita nome + valor + data, e recusa campo a mais", () => {
    expect(registrarHabitoEntrada.safeParse({ habito: "água", valor: 3 }).success).toBe(true);
    for (const campo of ["user_id", "habito_id", "habit_id", "is_done"]) {
      expect(
        registrarHabitoEntrada.safeParse({ habito: "água", [campo]: ID }).success,
        campo,
      ).toBe(false);
    }
  });

  it("recusa valor negativo e data mal formada", () => {
    expect(registrarHabitoEntrada.safeParse({ habito: "x", valor: -1 }).success).toBe(false);
    expect(registrarHabitoEntrada.safeParse({ habito: "x", data: "07/08/2026" }).success).toBe(
      false,
    );
  });
});

describe("preverRegistrarHabito", () => {
  it("resolve o hábito pelo nome e registra como entidade", async () => {
    const efeito = await preverRegistrarHabito({ habito: "água", valor: 6 });
    expect(efeito.command).toBe("registrarHabito");
    expect(efeito.entidades).toEqual([{ tipo: "habito", id: ID, rota: "/habitos" }]);
    expect(efeito.previsao.resumo).toContain("Beber água");
  });

  /**
   * ⛔ O CASO QUE DÁ NOME AO ARQUIVO. Com 6 copos já registrados, pedir 2 NÃO dá 8 — dá 2. A
   * previsão tem de mostrar os dois números e dizer que um substitui o outro.
   */
  it("mostra o valor JÁ registrado e avisa que o novo o substitui", async () => {
    habitos = [agua({ todayValue: 6 })];
    const efeito = await preverRegistrarHabito({ habito: "água", valor: 2 });

    expect(efeito.previsao.linhas).toContainEqual({
      rotulo: "Já registrado hoje",
      valor: "6 vezes",
    });
    const ressalvas = efeito.previsao.ressalvas.join(" ");
    expect(ressalvas).toContain("SUBSTITUI");
    expect(ressalvas).toContain("6");
    expect(ressalvas).toContain("2");
  });

  it("sem nada registrado, não inventa a linha nem a ressalva de substituição", async () => {
    const efeito = await preverRegistrarHabito({ habito: "água", valor: 2 });
    expect(efeito.previsao.linhas.map((l) => l.rotulo)).not.toContain("Já registrado hoje");
    expect(efeito.previsao.ressalvas.join(" ")).not.toContain("SUBSTITUI");
  });

  /**
   * ⛔ SEM VALOR = META CHEIA, e a previsão DIZ isso. Um padrão silencioso de 1 faria "bebi
   * água" virar 1 de 8 — e a tela mostraria 12% de um dia que o dono deu por concluído.
   */
  it("sem valor informado, usa a meta cheia e declara que foi isso", async () => {
    const efeito = await preverRegistrarHabito({ habito: "água" });
    expect(efeito.previsao.resumo).toContain("8 vezes");
    expect(efeito.previsao.ressalvas.join(" ")).toContain("meta cheia");
  });

  /** Data futura não é registro, é previsão do futuro — e o módulo não guarda isso. */
  it("recusa data futura", async () => {
    await expect(
      preverRegistrarHabito({ habito: "água", data: "2026-08-08" }),
    ).rejects.toThrow(EfeitoImpossivel);
  });

  /**
   * Numa data passada, `getHabitsDashboard` só sabe o valor de HOJE. Mostrar esse número como
   * se fosse o daquele dia seria pior que não mostrar — a previsão declara que não sabe.
   */
  it("em data passada, NÃO mostra o valor de hoje como se fosse o do dia", async () => {
    habitos = [agua({ todayValue: 6 })];
    const efeito = await preverRegistrarHabito({ habito: "água", valor: 3, data: "2026-08-05" });

    expect(efeito.previsao.linhas.map((l) => l.rotulo)).not.toContain("Já registrado hoje");
    expect(efeito.previsao.ressalvas.join(" ")).toContain("não é mostrado aqui");
  });

  it("hábito inexistente cancela a proposta", async () => {
    await expect(preverRegistrarHabito({ habito: "meditar" })).rejects.toThrow(
      /Não há hábito ativo/,
    );
  });

  /**
   * ⛔ HÁBITO ARQUIVADO NÃO É CANDIDATO. Registrar num hábito que o dono desligou
   * ressuscitaria um acompanhamento que ele decidiu encerrar.
   */
  it("hábito arquivado não é resolvido", async () => {
    habitos = [agua({ is_active: false })];
    await expect(preverRegistrarHabito({ habito: "água" })).rejects.toThrow(EfeitoImpossivel);
  });

  /**
   * ⚠️ O termo é "beber", e não "beber água": este teste começou errado, com "beber água",
   * e passou — porque o casamento EXATO desempata e resolve para "Beber água". O verde vinha
   * do desempate funcionando, não da ambiguidade sendo detectada. Um termo que não casa
   * exatamente com nenhum dos dois é o único que exercita o caminho da recusa.
   */
  it("nome ambíguo cancela a proposta e nomeia os candidatos", async () => {
    habitos = [
      agua({ id: ID, name: "Beber água" }),
      agua({ id: "22222222-2222-4333-8444-555555555555", name: "Beber água gelada" }),
    ];
    await expect(preverRegistrarHabito({ habito: "beber" })).rejects.toThrow(
      /Beber água gelada/,
    );
  });

  /** Casamento exato desempata — senão "Beber água" seria ambíguo consigo mesmo. */
  it("nome exato vence o parcial", async () => {
    habitos = [
      agua({ id: ID, name: "Beber água" }),
      agua({ id: "22222222-2222-4333-8444-555555555555", name: "Beber água gelada" }),
    ];
    const efeito = await preverRegistrarHabito({ habito: "Beber água" });
    expect(efeito.entidades[0]?.id).toBe(ID);
  });

  it("hábito não agendado para hoje é aceito, mas o dono é avisado", async () => {
    habitos = [agua({ scheduledToday: false })];
    const efeito = await preverRegistrarHabito({ habito: "água", valor: 1 });
    expect(efeito.previsao.ressalvas.join(" ")).toContain("não estava agendado");
  });

  it("o mesmo pedido produz o mesmo efeito, duas vezes", async () => {
    const a = await preverRegistrarHabito({ habito: "água", valor: 4 });
    const b = await preverRegistrarHabito({ habito: "água", valor: 4 });
    expect(a).toEqual(b);
  });
});
