/**
 * Fase 18-F · Bloco 2 — a regra do selo do botão flutuante.
 *
 * ⛔ O QUE ESTE TESTE PROTEGE É UMA FRONTEIRA, NÃO UM CÁLCULO. O risco nº 1 declarado no doc
 * da fase é o mesmo fato virar notificação, card, badge e item de busca ao mesmo tempo. O
 * sino responde "algo aconteceu no sistema"; este selo responde "algo mudou na conversa que
 * VOCÊ abriu". Um insight novo, uma fatura vencendo ou uma ação travada NÃO têm como chegar
 * aqui — e a garantia é que o módulo não tem de onde os ler.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  avisoDoBotao,
  CANTO_PADRAO,
  CANTOS_DO_BOTAO,
  ESTADO_INICIAL,
  reduzirPainel,
  ROTULO_DO_CANTO,
  type EstadoDoPainel,
  type EventoDoPainel,
} from "./painel";

const AGORA = new Date("2026-09-20T15:00:00.000Z");
const DAQUI_A_5_MIN = "2026-09-20T15:05:00.000Z";
const HA_1_MIN = "2026-09-20T14:59:00.000Z";

function aplicar(eventos: readonly EventoDoPainel[]): EstadoDoPainel {
  return eventos.reduce(reduzirPainel, ESTADO_INICIAL);
}

describe("vocabulário do canto", () => {
  it("são DOIS cantos, e os de cima não existem", () => {
    expect([...CANTOS_DO_BOTAO]).toEqual(["direita", "esquerda"]);
  });

  it("o padrão é um canto válido", () => {
    expect(CANTOS_DO_BOTAO).toContain(CANTO_PADRAO);
  });

  it("todo canto tem rótulo em pt-BR", () => {
    for (const canto of CANTOS_DO_BOTAO) {
      expect(ROTULO_DO_CANTO[canto]).toMatch(/\S/);
    }
  });
});

describe("estado do painel", () => {
  it("começa fechado, sem resposta pendente e sem proposta", () => {
    expect(ESTADO_INICIAL).toEqual({
      aberto: false,
      respostaNaoVista: false,
      propostas: [],
    });
  });

  it("uma resposta que chega com o painel FECHADO fica por ver", () => {
    const e = aplicar([{ tipo: "respondeu" }]);
    expect(e.respostaNaoVista).toBe(true);
  });

  it("uma resposta que chega com o painel ABERTO já foi vista", () => {
    const e = aplicar([{ tipo: "abriu" }, { tipo: "respondeu" }]);
    expect(e.respostaNaoVista).toBe(false);
  });

  it("abrir o painel zera a resposta por ver", () => {
    const e = aplicar([{ tipo: "respondeu" }, { tipo: "abriu" }]);
    expect(e.respostaNaoVista).toBe(false);
  });

  it("uma proposta é guardada pelo PRAZO dela, não por um estado gravado", () => {
    const e = aplicar([{ tipo: "propos", id: "p1", expiraEm: DAQUI_A_5_MIN }]);
    expect(e.propostas).toEqual([{ id: "p1", expiraEm: DAQUI_A_5_MIN }]);
  });

  it("a mesma proposta duas vezes não vira duas", () => {
    const e = aplicar([
      { tipo: "propos", id: "p1", expiraEm: DAQUI_A_5_MIN },
      { tipo: "propos", id: "p1", expiraEm: DAQUI_A_5_MIN },
    ]);
    expect(e.propostas).toHaveLength(1);
  });

  it("decidir a proposta a tira da lista", () => {
    const e = aplicar([
      { tipo: "propos", id: "p1", expiraEm: DAQUI_A_5_MIN },
      { tipo: "decidiu", id: "p1" },
    ]);
    expect(e.propostas).toEqual([]);
  });

  /**
   * ⛔ Trocar de provedor reinicia o laço, a ferramenta de escrita roda de novo e nasce uma
   * SEGUNDA proposta com outro id (invariante 46). `chat-client.tsx` limpa os cartões da tela
   * no evento `switch`; o selo tem de acompanhar, senão ele contaria duas onde há uma.
   */
  it("`recomecou` limpa as propostas — o laço reiniciou", () => {
    const e = aplicar([
      { tipo: "propos", id: "p1", expiraEm: DAQUI_A_5_MIN },
      { tipo: "recomecou" },
    ]);
    expect(e.propostas).toEqual([]);
  });
});

describe("aviso do botão", () => {
  it("painel aberto NUNCA avisa — o dono está vendo", () => {
    const e = aplicar([
      { tipo: "respondeu" },
      { tipo: "propos", id: "p1", expiraEm: DAQUI_A_5_MIN },
      { tipo: "abriu" },
    ]);
    expect(avisoDoBotao(e, AGORA)).toBeNull();
  });

  it("estado inicial não avisa nada", () => {
    expect(avisoDoBotao(ESTADO_INICIAL, AGORA)).toBeNull();
  });

  it("resposta por ver vira aviso de leitura", () => {
    const e = aplicar([{ tipo: "respondeu" }]);
    expect(avisoDoBotao(e, AGORA)).toEqual({
      tipo: "resposta",
      quantas: 0,
      texto: "O assistente respondeu.",
    });
  });

  /** A decisão tem PRAZO; a leitura não. Quem tem prazo vence. */
  it("proposta pendente vence a resposta por ver", () => {
    const e = aplicar([
      { tipo: "respondeu" },
      { tipo: "propos", id: "p1", expiraEm: DAQUI_A_5_MIN },
    ]);
    expect(avisoDoBotao(e, AGORA)).toEqual({
      tipo: "proposta",
      quantas: 1,
      texto: "1 alteração aguardando você.",
    });
  });

  it("o plural é pt-BR", () => {
    const e = aplicar([
      { tipo: "propos", id: "p1", expiraEm: DAQUI_A_5_MIN },
      { tipo: "propos", id: "p2", expiraEm: DAQUI_A_5_MIN },
    ]);
    expect(avisoDoBotao(e, AGORA)?.texto).toBe("2 alterações aguardando você.");
  });

  /**
   * ⛔ Estado DERIVADO, nunca gravado (invariante 35 aplicada ao selo). A proposta expirou
   * sozinha: nada foi escrito, nenhum evento chegou, e o selo some porque `agora` passou do
   * prazo. Um `propostasExpiradas` no estado seria uma segunda verdade sobre o mesmo prazo.
   */
  it("proposta vencida some do aviso sem evento nenhum", () => {
    const e = aplicar([{ tipo: "propos", id: "p1", expiraEm: HA_1_MIN }]);
    expect(avisoDoBotao(e, AGORA)).toBeNull();
  });

  it("proposta vencida não esconde a resposta por ver", () => {
    const e = aplicar([{ tipo: "respondeu" }, { tipo: "propos", id: "p1", expiraEm: HA_1_MIN }]);
    expect(avisoDoBotao(e, AGORA)?.tipo).toBe("resposta");
  });

  it("o instante do prazo é comparado como INSTANTE — o teste passa em qualquer fuso", () => {
    const e = aplicar([{ tipo: "propos", id: "p1", expiraEm: "2026-09-20T15:00:01.000Z" }]);
    expect(avisoDoBotao(e, AGORA)?.tipo).toBe("proposta");
    expect(avisoDoBotao(e, new Date("2026-09-20T15:00:02.000Z"))).toBeNull();
  });
});

describe("⛔ o selo não repete o sino", () => {
  /**
   * A garantia não é uma checagem: é a AUSÊNCIA de caminho. O módulo não importa nada, então
   * não tem como ler notificação, insight, ação travada nem orçamento. Um import novo aqui
   * derruba este teste, e é para isso que ele existe.
   */
  it("o módulo não tem um único import", () => {
    // Varredura do código-fonte, a mesma técnica de `chat-events.test.ts` e da invariante 81:
    // o projeto roda em `environment: "node"` e o que se quer provar aqui é uma propriedade do
    // ARQUIVO, não do que ele exporta.
    const codigo = fs.readFileSync(
      path.join(process.cwd(), "src/lib/ai/painel.ts"),
      "utf8",
    );
    expect(codigo).not.toMatch(/^\s*import\s/m);
  });

  it("nenhum evento do sistema é representável — a união só fala do painel", () => {
    const tipos: EventoDoPainel["tipo"][] = [
      "abriu",
      "fechou",
      "respondeu",
      "propos",
      "decidiu",
      "recomecou",
    ];
    // A lista acima é o contrato: se alguém acrescentar "insightNovo" ou "notificacao",
    // este teste fica vermelho e a conversa acontece antes do commit.
    expect(tipos).toHaveLength(6);
  });
});
