import { describe, expect, it } from "vitest";
import { VOCABULARIO_PROIBIDO } from "@/lib/tone/vocabulary";
import { EXPERIENCIAS } from "./catalog";
import {
  BLOCO_DA_CAIXA_DE_ENTRADA,
  VERSAO_DA_CAIXA_DE_ENTRADA,
  versaoComCaixaDeEntrada,
} from "./inbox";

describe("18-F Bloco 4 — os prompts de redação dos panoramas", () => {
  /**
   * ⛔ A MESMA DISCIPLINA DOS OITO PROMPTS DE AGENTE (invariante 30): a proibição é DESCRITA,
   * nunca CITADA. O teste varre o texto inteiro e NÃO distingue uso negado — e está certo,
   * porque a palavra literal no contexto a torna mais provável de sair.
   *
   * ⚠️ Aqui a varredura é sobre `VOCABULARIO_PROIBIDO` (cobrança + prescrição), e não só
   * sobre a metade de cobrança: um panorama diário é exatamente onde "o ideal" e "aumente"
   * apareceriam sem ninguém notar.
   */
  it("nenhum prompt contém vocabulário de cobrança nem de prescrição", () => {
    for (const e of EXPERIENCIAS) {
      for (const palavra of VOCABULARIO_PROIBIDO) {
        expect(e.prompt.toLowerCase(), `${e.id} → ${palavra}`).not.toContain(
          palavra.toLowerCase(),
        );
      }
    }
  });

  it("todo prompt de panorama declara que o dado veio de bloco não confiável", () => {
    for (const e of EXPERIENCIAS) {
      expect(e.prompt, e.id).toContain("não confiáveis");
    }
  });

  /**
   * ⛔ A trava de honestidade da 18-B, aplicada ao panorama: ele responde SOBRE O QUE AS
   * FERRAMENTAS DEVOLVERAM. Um panorama que "completa" o dia com o que ele supõe é pior que
   * um panorama curto.
   */
  it("todo prompt proíbe inventar, estimar e inferir número", () => {
    for (const e of EXPERIENCIAS) {
      expect(e.prompt.toLowerCase(), e.id).toContain("não invente");
    }
  });

  /**
   * ⚠️ O prompt de redação é um PERFIL, e perfil nenhum repete a trava de segurança: quem a
   * põe primeiro é `experience-runner.ts`, como `buildSystemPrompt` faz no chat. Um prompt
   * que trouxesse a própria cópia dela divergiria da base na primeira edição.
   */
  it("nenhum prompt de panorama pede leitura — as ferramentas já rodaram", () => {
    for (const e of EXPERIENCIAS) {
      expect(e.prompt.toLowerCase(), e.id).not.toContain("consulte a ferramenta");
      expect(e.prompt.toLowerCase(), e.id).not.toContain("chame a ferramenta");
    }
  });
});

describe("18-F Bloco 4 — o modo Caixa de entrada", () => {
  it("o bloco dela também passa no vocabulário proibido", () => {
    for (const palavra of VOCABULARIO_PROIBIDO) {
      expect(BLOCO_DA_CAIXA_DE_ENTRADA.toLowerCase(), palavra).not.toContain(
        palavra.toLowerCase(),
      );
    }
  });

  /**
   * ⚠️ "Na dúvida ela pergunta" NÃO é uma promessa deste texto: quem a cumpre é o roteador,
   * porque palavra ambígua DESLIGA o roteamento (invariante 27) e a pergunta cai no
   * orquestrador — que tem `allowedTools: []` e portanto só pode perguntar. O bloco diz isso
   * para o caso em que o modelo TEM ferramenta e ainda assim o destino é ambíguo.
   */
  it("manda PERGUNTAR na dúvida, nunca chutar o destino", () => {
    expect(BLOCO_DA_CAIXA_DE_ENTRADA.toLowerCase()).toContain("pergunte");
    expect(VERSAO_DA_CAIXA_DE_ENTRADA).toMatch(/^caixa-v\d+$/);
  });

  it("não promete aplicar nada sozinha", () => {
    expect(BLOCO_DA_CAIXA_DE_ENTRADA).toContain("confirm");
  });

  /**
   * ⛔ O MODO MUDA O COMPORTAMENTO, ENTÃO A COLUNA TEM DE CONTÁ-LO. Sem isto, duas respostas
   * gravadas com o mesmo `prompt_version` teriam vindo de prompts diferentes — e a coluna
   * existe justamente para dizer qual texto produziu qual resposta.
   */
  it("a versão do run carrega o modo, junto com a do agente", () => {
    expect(versaoComCaixaDeEntrada("todo-v1")).toBe(`todo-v1+${VERSAO_DA_CAIXA_DE_ENTRADA}`);
  });

  /**
   * ⛔ ELA NÃO É UM PANORAMA, e por isso não está no catálogo: os três têm leitura DIRIGIDA,
   * e a caixa de entrada parte de um texto que só o dono tem. Este teste fica vermelho no dia
   * em que alguém a acrescentar como quarta experiência sem a conversa que isso exige.
   */
  it("não é uma experiência do catálogo", () => {
    expect(EXPERIENCIAS.map((e) => e.id)).not.toContain("caixa-de-entrada");
  });
});
