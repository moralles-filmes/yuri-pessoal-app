import { describe, expect, it } from "vitest";
import {
  ANCORA_DE_DIA_INTEIRO,
  DURACAO_PADRAO_MINUTOS,
  instanteDoEvento,
  somarMinutosNaHora,
} from "./instants";

/**
 * ⚠️ Nenhum valor esperado aqui depende do `TZ` da máquina — todos são instantes absolutos
 * com `Z`. A suíte tem de passar igual com `TZ=UTC` e com `TZ=America/Sao_Paulo`; um teste
 * que dependesse do fuso local ficaria verde no laptop e vermelho na Vercel.
 */
describe("instanteDoEvento", () => {
  it("hora informada é hora de BRASÍLIA (BRT = UTC−3)", () => {
    expect(instanteDoEvento("2026-08-10", "19:00", false)).toBe("2026-08-10T22:00:00.000Z");
  });

  it("a hora da noite ainda cai no dia seguinte em UTC — e isso é correto", () => {
    // 22:00 BRT do dia 10 é 01:00 UTC do dia 11. Quem lê a coluna com `.slice(0, 10)` erra o
    // dia; quem lê com `dateInSaoPaulo` acerta. A conversão aqui é a que grava.
    expect(instanteDoEvento("2026-08-10", "22:00", false)).toBe("2026-08-11T01:00:00.000Z");
  });

  it("dia inteiro ancora ao MEIO-DIA UTC, e a data não escorrega", () => {
    expect(instanteDoEvento("2026-08-10", "19:00", true)).toBe(`2026-08-10${ANCORA_DE_DIA_INTEIRO}`);
    expect(instanteDoEvento("2026-08-10", "", true)).toBe("2026-08-10T12:00:00.000Z");
  });

  it("dia inteiro IGNORA a hora — quem marcou dia inteiro não tem horário", () => {
    expect(instanteDoEvento("2026-08-10", "23:59", true)).toBe(
      instanteDoEvento("2026-08-10", "00:00", true),
    );
  });

  it("hora ausente sem dia inteiro vira meia-noite de Brasília", () => {
    expect(instanteDoEvento("2026-08-10", "", false)).toBe("2026-08-10T03:00:00.000Z");
  });
});

describe("somarMinutosNaHora", () => {
  it("soma no relógio", () => {
    expect(somarMinutosNaHora("09:00", DURACAO_PADRAO_MINUTOS)).toBe("10:00");
    expect(somarMinutosNaHora("09:45", 30)).toBe("10:15");
    expect(somarMinutosNaHora("00:00", 90)).toBe("01:30");
  });

  it("SATURA em 23:59 em vez de virar o dia", () => {
    // Virar o dia exigiria mudar também a DATA de fim, e uma mudança de data que ninguém
    // pediu é pior que um fim encostado no fim do dia.
    expect(somarMinutosNaHora("23:30", 60)).toBe("23:59");
    expect(somarMinutosNaHora("23:59", 1)).toBe("23:59");
  });

  it("hora inválida volta como veio, sem inventar número", () => {
    expect(somarMinutosNaHora("abc", 60)).toBe("abc");
  });
});
