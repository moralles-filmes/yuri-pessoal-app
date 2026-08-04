/**
 * Fase 17-F — o hábito "Treinar" reflete a sessão, sem segundo registro.
 *
 * O que estes testes travam:
 *  • hábito por VEZES conta sessões; hábito por MINUTOS/HORAS usa o tempo ATIVO;
 *  • o valor é DERIVADO do dia, não somado ao que já estava lá — é isso que faz
 *    concluir → reabrir → concluir convergir para um registro só;
 *  • sem meta declarada, "fez alguma coisa" já conta como feito;
 *  • zero sessões devolve zero (fato medido: nenhuma sessão concluída naquele dia).
 */
import { describe, expect, it } from "vitest";
import { habitCheckInFromSessions } from "./habit-reflection";

const sessao = (activeSeconds: number | null, totalSeconds: number | null = null) => ({
  activeSeconds,
  totalSeconds,
});

describe("habitCheckInFromSessions", () => {
  it("hábito por vezes conta SESSÕES", () => {
    expect(
      habitCheckInFromSessions({
        unit: "vezes",
        target: 1,
        sessions: [sessao(3600), sessao(1800)],
      }),
    ).toEqual({ value: 2, isDone: true });
  });

  it("hábito por minutos usa o tempo ATIVO (não o de relógio)", () => {
    // 45 min ativos dentro de uma sessão de 70 min de relógio: o tempo parado não é treino.
    expect(
      habitCheckInFromSessions({
        unit: "minutos",
        target: 40,
        sessions: [sessao(45 * 60, 70 * 60)],
      }),
    ).toEqual({ value: 45, isDone: true });
  });

  it("sem tempo ativo apurado, cai para o tempo de relógio", () => {
    expect(
      habitCheckInFromSessions({ unit: "minutos", target: 30, sessions: [sessao(null, 1800)] }),
    ).toEqual({ value: 30, isDone: true });
  });

  it("hábito por horas converte com duas casas", () => {
    expect(
      habitCheckInFromSessions({ unit: "horas", target: 1, sessions: [sessao(5400)] }),
    ).toEqual({ value: 1.5, isDone: true });
  });

  it("não atingir a meta registra o parcial sem marcar como feito", () => {
    expect(
      habitCheckInFromSessions({ unit: "vezes", target: 2, sessions: [sessao(3600)] }),
    ).toEqual({ value: 1, isDone: false });
  });

  it("sem meta declarada, ter treinado já conta como feito", () => {
    expect(
      habitCheckInFromSessions({ unit: "vezes", target: 0, sessions: [sessao(3600)] }),
    ).toEqual({ value: 1, isDone: true });
  });

  it("nenhuma sessão no dia devolve zero — e zero aqui é fato, não suposição", () => {
    expect(habitCheckInFromSessions({ unit: "vezes", target: 1, sessions: [] })).toEqual({
      value: 0,
      isDone: false,
    });
  });

  it("é DERIVADO do dia: reprocessar as mesmas sessões dá o mesmo valor", () => {
    const entrada = { unit: "vezes", target: 1, sessions: [sessao(3600)] };
    const primeira = habitCheckInFromSessions(entrada);
    const segunda = habitCheckInFromSessions(entrada);
    expect(segunda).toEqual(primeira);
    // Nada de acumular: duas execuções não viram "2 vezes".
    expect(segunda.value).toBe(1);
  });

  it("sessão sem tempo nenhum ainda conta como ocorrência", () => {
    expect(
      habitCheckInFromSessions({ unit: "vezes", target: 1, sessions: [sessao(null, null)] }),
    ).toEqual({ value: 1, isDone: true });
    // Mas em minutos, sem tempo apurado, o valor é 0 — não se inventa duração.
    expect(
      habitCheckInFromSessions({ unit: "minutos", target: 30, sessions: [sessao(null, null)] }),
    ).toEqual({ value: 0, isDone: false });
  });
});