import { describe, expect, it } from "vitest";
import { VOCABULARIO_PROIBIDO } from "@/lib/tone/vocabulary";
import { EXPERIENCIAS } from "./catalog";

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
