/**
 * Fase 18-C · Bloco 3 — IA · O estado da proposta e a admissão da execução.
 *
 * `agora` é sempre injetado. A suíte roda em qualquer fuso — os instantes são absolutos
 * (`Z`), e é assim que `TZ=UTC npx vitest run` continua verde.
 */

import { describe, expect, it } from "vitest";
import {
  admitirExecucao,
  derivarEstadoDaProposta,
  estadoEhFinal,
  MENSAGEM_DE_RECUSA,
  revalidarEfeito,
  type AdmissaoInput,
} from "./state";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

const VENCE_AS_10 = "2026-08-07T13:00:00.000Z"; // 10h em Brasília
const NOVE_E_MEIA = new Date("2026-08-07T12:30:00.000Z");
const DEZ_E_UM = new Date("2026-08-07T13:01:00.000Z");

describe("derivarEstadoDaProposta", () => {
  it("sem decisão e dentro do prazo: pendente", () => {
    expect(
      derivarEstadoDaProposta(
        { expiresAt: VENCE_AS_10, decisao: null, execucao: null },
        NOVE_E_MEIA,
      ),
    ).toBe("pendente");
  });

  it("sem decisão e fora do prazo: expirada", () => {
    expect(
      derivarEstadoDaProposta(
        { expiresAt: VENCE_AS_10, decisao: null, execucao: null },
        DEZ_E_UM,
      ),
    ).toBe("expirada");
  });

  /**
   * ⛔ O CASO QUE JUSTIFICA A PRECEDÊNCIA. Uma proposta confirmada às 9h59 continua
   * confirmada às 10h01. Deixar o prazo decidir por cima diria "expirada" sobre uma escrita
   * que já foi autorizada — e, com execução, sobre uma que já ACONTECEU.
   */
  it("decisão vence o prazo: confirmada antes de vencer continua confirmada depois", () => {
    expect(
      derivarEstadoDaProposta(
        { expiresAt: VENCE_AS_10, decisao: "confirmada", execucao: null },
        DEZ_E_UM,
      ),
    ).toBe("confirmada");
  });

  it("execução vence tudo — inclusive o prazo vencido", () => {
    expect(
      derivarEstadoDaProposta(
        { expiresAt: VENCE_AS_10, decisao: "confirmada", execucao: "sucesso" },
        DEZ_E_UM,
      ),
    ).toBe("executada");
  });

  it.each([
    ["executando", "executando"],
    ["sucesso", "executada"],
    ["falhou", "falhou"],
    ["parcial", "parcial"],
  ] as const)("execução %s vira estado %s", (execucao, esperado) => {
    expect(
      derivarEstadoDaProposta(
        { expiresAt: VENCE_AS_10, decisao: "confirmada", execucao },
        NOVE_E_MEIA,
      ),
    ).toBe(esperado);
  });

  it("recusada continua recusada depois do prazo", () => {
    expect(
      derivarEstadoDaProposta(
        { expiresAt: VENCE_AS_10, decisao: "recusada", execucao: null },
        DEZ_E_UM,
      ),
    ).toBe("recusada");
  });

  /**
   * Uma data ilegível não pode virar "ainda vale": isso transformaria uma coluna corrompida
   * numa janela de confirmação eterna. Errar para "vencida" custa uma proposta refeita.
   */
  it("data ilegível é tratada como VENCIDA", () => {
    expect(
      derivarEstadoDaProposta({ expiresAt: "sem-data", decisao: null, execucao: null }, NOVE_E_MEIA),
    ).toBe("expirada");
  });

  // O instante exato do vencimento já venceu — a janela é fechada no fim.
  it("o instante exato do prazo já está vencido", () => {
    expect(
      derivarEstadoDaProposta(
        { expiresAt: VENCE_AS_10, decisao: null, execucao: null },
        new Date(VENCE_AS_10),
      ),
    ).toBe("expirada");
  });

  it("só pendente e confirmada não são finais", () => {
    expect(estadoEhFinal("pendente")).toBe(false);
    expect(estadoEhFinal("confirmada")).toBe(false);
    for (const e of ["expirada", "recusada", "executando", "executada", "falhou", "parcial"] as const) {
      expect(estadoEhFinal(e), e).toBe(true);
    }
  });
});

describe("admitirExecucao", () => {
  const OK: AdmissaoInput = {
    proposta: { expiresAt: VENCE_AS_10, effectHash: HASH_A, command: "criarTarefaTodo" },
    hashDaTela: HASH_A,
    decisao: "confirmada",
    jaExecutou: false,
    commandsConhecidos: ["criarTarefaTodo"],
  };

  it("admite o caso íntegro", () => {
    expect(admitirExecucao(OK, NOVE_E_MEIA)).toEqual({ ok: true });
  });

  it("proposta inexistente", () => {
    expect(admitirExecucao({ ...OK, proposta: null }, NOVE_E_MEIA)).toMatchObject({
      ok: false,
      motivo: "PROPOSTA_NAO_ENCONTRADA",
    });
  });

  it("prazo vencido", () => {
    expect(admitirExecucao(OK, DEZ_E_UM)).toMatchObject({
      ok: false,
      motivo: "PROPOSTA_EXPIRADA",
    });
  });

  it("hash da tela diferente do da proposta", () => {
    expect(admitirExecucao({ ...OK, hashDaTela: HASH_B }, NOVE_E_MEIA)).toMatchObject({
      ok: false,
      motivo: "HASH_DIVERGENTE",
    });
  });

  it("recusa anterior é final", () => {
    expect(admitirExecucao({ ...OK, decisao: "recusada" }, NOVE_E_MEIA)).toMatchObject({
      ok: false,
      motivo: "PROPOSTA_JA_DECIDIDA",
    });
  });

  /**
   * ⛔ ESTE É O TESTE DE ORDEM, e ele existe porque a ordem inversa mentiria para o dono.
   *
   * Uma ação executada às 9h59, conferida às 10h01: se o prazo fosse checado primeiro, a
   * tela diria "o prazo terminou e nada foi alterado" sobre uma alteração que ACONTECEU.
   * "Já executou" vem antes de "expirou" por isso — e a mensagem manda conferir o registro.
   */
  it("já executada vence o prazo vencido — e a mensagem NÃO diz que nada mudou", () => {
    const r = admitirExecucao({ ...OK, jaExecutou: true }, DEZ_E_UM);
    expect(r).toMatchObject({ ok: false, motivo: "JA_EXECUTADA" });
    expect(MENSAGEM_DE_RECUSA.JA_EXECUTADA).toMatch(/já foi executada/i);
    expect(MENSAGEM_DE_RECUSA.JA_EXECUTADA).not.toMatch(/nada foi alterado/i);
  });

  it("já executada vence também a recusa registrada", () => {
    expect(
      admitirExecucao({ ...OK, jaExecutou: true, decisao: "recusada" }, NOVE_E_MEIA),
    ).toMatchObject({ ok: false, motivo: "JA_EXECUTADA" });
  });

  /**
   * ⛔ COM O REGISTRY DE COMMANDS VAZIO (18-C · Bloco 3), NENHUMA PROPOSTA É ADMITIDA.
   * É a mesma trava do Tool Registry vazio da 18-A, do outro lado do fluxo.
   */
  it("registry de commands vazio recusa tudo", () => {
    expect(admitirExecucao({ ...OK, commandsConhecidos: [] }, NOVE_E_MEIA)).toMatchObject({
      ok: false,
      motivo: "COMMAND_DESCONHECIDO",
    });
  });

  it("toda mensagem é pt-BR, sem jargão e sem nome de coluna", () => {
    for (const [motivo, texto] of Object.entries(MENSAGEM_DE_RECUSA)) {
      expect(texto.length, motivo).toBeGreaterThan(20);
      expect(texto, motivo).not.toMatch(/user_id|sqlstate|constraint|null|undefined|error/i);
    }
  });

  /**
   * As mensagens que descrevem uma recusa ANTES da execução têm de dizer que nada mudou —
   * é a informação que o dono precisa e a única que o impede de refazer o lançamento por
   * medo. As duas que falam de algo já acontecido são a exceção declarada.
   */
  it("recusa antes da execução afirma que nada foi alterado", () => {
    const antesDaEscrita = [
      "PROPOSTA_NAO_ENCONTRADA",
      "PROPOSTA_EXPIRADA",
      "PROPOSTA_JA_DECIDIDA",
      "HASH_DIVERGENTE",
      "EFEITO_MUDOU",
      "COMMAND_DESCONHECIDO",
      "SEM_CONFIRMACAO",
    ] as const;
    for (const motivo of antesDaEscrita) {
      expect(MENSAGEM_DE_RECUSA[motivo], motivo).toMatch(/[Nn]ada foi (alterado|feito)/);
    }
  });
});

describe("revalidarEfeito", () => {
  it("hashes iguais passam", () => {
    expect(revalidarEfeito(HASH_A, HASH_A)).toEqual({ ok: true });
  });

  /**
   * O mundo mudou entre propor e confirmar: o dia virou e a compra caiu em outra fatura, a
   * tarefa recorrente avançou, o saldo mudou. A recusa é o que PROTEGE, e a mensagem tem de
   * dizer isso — senão ela lê como erro do sistema e o dono refaz o mesmo pedido sem saber.
   */
  it("hashes diferentes recusam com EFEITO_MUDOU, e a mensagem explica o porquê", () => {
    const r = revalidarEfeito(HASH_A, HASH_B);
    expect(r).toMatchObject({ ok: false, motivo: "EFEITO_MUDOU" });
    expect(MENSAGEM_DE_RECUSA.EFEITO_MUDOU).toMatch(/dados mudaram/i);
    expect(MENSAGEM_DE_RECUSA.EFEITO_MUDOU).toMatch(/previsão atualizada/i);
  });
});
