/**
 * REDESIGN-03-G (L7) — a regra pura do Cron por família. Instantes ABSOLUTOS (com `Z`) e
 * esperados em Brasília: a suíte passa em qualquer `TZ`.
 */
import { describe, expect, it } from "vitest";
import {
  DEPENDE_DE,
  familiasNaoLidas,
  horaDaVerificacao,
  janelaDaVerificacao,
  textoDasFamilias,
  type Familia,
} from "./familias";

describe("03-G L7 · familiasNaoLidas", () => {
  it("sem falha, nenhuma família fica de fora", () => {
    expect(familiasNaoLidas(new Set())).toEqual([]);
  });

  it("Z7 — a leitura que falhou tira só as famílias que dependem dela", () => {
    expect(familiasNaoLidas(new Set(["contasFixas"]))).toEqual(["contasFixas"]);
    expect(familiasNaoLidas(new Set(["agenda", "todo"]))).toEqual(["agenda", "todo"]);
  });

  it("Z17 — o limite do cartão cai com as faturas (dependência dupla)", () => {
    expect(familiasNaoLidas(new Set(["faturas"]))).toEqual(["faturas", "limiteDoCartao", "gastoAlto"]);
    expect(familiasNaoLidas(new Set(["cartoes"]))).toEqual(["faturas", "limiteDoCartao"]);
  });

  it("recebimentos derrubam recebíveis e gasto alto; o módulo inteiro derruba a sua família", () => {
    expect(familiasNaoLidas(new Set(["recebimentos"]))).toEqual(["recebiveis", "gastoAlto"]);
    expect(familiasNaoLidas(new Set(["dieta", "ia"]))).toEqual(["dieta", "ia"]);
  });

  it("toda família depende de ao menos uma leitura", () => {
    for (const [familia, leituras] of Object.entries(DEPENDE_DE)) {
      expect(leituras.length, familia).toBeGreaterThan(0);
    }
  });
});

describe("03-G L7 · textoDasFamilias", () => {
  it("lista em pt-BR, na ordem recebida", () => {
    expect(textoDasFamilias(["faturas", "contasFixas"])).toBe("faturas, contas fixas");
    const todas = Object.keys(DEPENDE_DE) as Familia[];
    expect(textoDasFamilias(todas)).not.toMatch(/undefined/);
  });
});

describe("03-G L7 · janela e hora da verificação (D-G30, Z18)", () => {
  it("Z18 — 21h em Brasília é 00h UTC do dia seguinte, e a janela é a da NOITE", () => {
    const vinteUmaHorasBrt = new Date("2026-09-11T00:00:00.000Z");
    expect(janelaDaVerificacao(vinteUmaHorasBrt)).toBe("noite");
    expect(horaDaVerificacao(vinteUmaHorasBrt)).toBe("21h");
  });

  it("09h em Brasília (12h UTC) é a da manhã", () => {
    const noveHorasBrt = new Date("2026-09-10T12:00:00.000Z");
    expect(janelaDaVerificacao(noveHorasBrt)).toBe("manha");
    expect(horaDaVerificacao(noveHorasBrt)).toBe("09h");
  });

  it("a fronteira é 15h de Brasília", () => {
    expect(janelaDaVerificacao(new Date("2026-09-10T17:59:00.000Z"))).toBe("manha");
    expect(janelaDaVerificacao(new Date("2026-09-10T18:00:00.000Z"))).toBe("noite");
  });

  it("disparo manual: o texto diz a hora real", () => {
    expect(horaDaVerificacao(new Date("2026-09-10T17:37:00.000Z"))).toBe("14h");
  });
});
