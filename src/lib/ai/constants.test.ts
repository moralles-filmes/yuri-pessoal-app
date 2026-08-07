/**
 * Fase 18-B — IA · A TRAVA DE HONESTIDADE DOS TEXTOS DA TELA.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR JÁ ACONTECEU DUAS VEZES.                ║
 * ║                                                                                       ║
 * ║ A 18-A escreveu, no prompt e na tela, que o assistente "não tem acesso aos seus       ║
 * ║ registros". Era verdade com o Tool Registry vazio. Virou MENTIRA no instante em que   ║
 * ║ as três leituras de Treinos entraram nele — e ninguém percebeu, porque nenhum teste   ║
 * ║ ligava o texto da tela ao conteúdo do registry. O prompt-base foi corrigido           ║
 * ║ (`seguranca-v2`), `AVISO_SEM_ACESSO` depois, e a `description` da página só agora.    ║
 * ║                                                                                       ║
 * ║ A regra que sai disso: **afirme a REGRA, nunca o ESTADO** — e, quando o texto precisar ║
 * ║ nomear o que a IA lê, que seja o REGISTRY a decidir se ele está desatualizado.        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { describe, expect, it } from "vitest";
import {
  AVISO_DA_TRILHA,
  AVISO_SEM_ACESSO,
  RESUMO_DO_ASSISTENTE,
  ROTULO_DA_PERMISSAO,
} from "./constants";
import { TOOL_PERMISSIONS } from "./tools/contracts";
import { toolsForPermission } from "./tools/registry";

describe("os avisos da tela afirmam a REGRA, não o estado", () => {
  /**
   * ⚠️ O TESTE QUE FAZ O REGISTRY MANDAR NO TEXTO.
   *
   * Um módulo com ferramenta publicada TEM de aparecer no aviso: é ele que o usuário lê antes
   * de escrever a primeira mensagem. No dia em que a 18-C acrescentar a primeira leitura de
   * Finanças, este teste falha até alguém editar o aviso — que é exatamente o que o docblock
   * de `AVISO_SEM_ACESSO` promete ("mexer aqui no MESMO commit") e o que ninguém cumpriu na
   * transição da 18-A para a 18-B.
   */
  it("todo módulo com ferramenta publicada é NOMEADO no aviso", () => {
    const comFerramenta = TOOL_PERMISSIONS.filter(
      (p) => toolsForPermission(p).length > 0,
    );
    expect(comFerramenta.length).toBeGreaterThan(0);

    for (const p of comFerramenta) {
      expect(AVISO_SEM_ACESSO, p).toContain(ROTULO_DA_PERMISSAO[p].titulo);
    }
  });

  it("a frase exata da 18-A não pode voltar", () => {
    for (const texto of [AVISO_SEM_ACESSO, RESUMO_DO_ASSISTENTE]) {
      expect(texto).not.toContain("sem acesso aos seus registros");
      expect(texto).not.toContain("não tem acesso aos seus registros");
    }
  });

  it("os dois avisos falam de AUTORIZAÇÃO e de não escrever", () => {
    for (const texto of [AVISO_SEM_ACESSO, RESUMO_DO_ASSISTENTE]) {
      expect(texto.toLowerCase()).toContain("autoriz");
      expect(texto.toLowerCase()).toContain("não cria nem altera");
    }
  });
});

/**
 * ⚠️ `completude` (do adapter: o TOTAL veio incompleto) e `itens_truncados` (do executor: a
 * LISTA foi encurtada por tamanho) são coisas DIFERENTES — e nenhuma das duas é gravada em
 * `ai_tool_calls`, que guarda o pedido e não o resultado.
 *
 * Então a tela de rastreabilidade não pode falar de nenhuma das duas. Dizer "dado incompleto"
 * assustaria sem base; dizer "dado completo" é a mentira que a subfase combate.
 */
describe("a trilha não afirma qualidade do dado — ela não a conhece", () => {
  const PROIBIDAS = ["incompleto", "completo", "parcial", "truncad", "exato"];

  for (const palavra of PROIBIDAS) {
    it(`AVISO_DA_TRILHA não usa "${palavra}"`, () => {
      expect(AVISO_DA_TRILHA.toLowerCase()).not.toContain(palavra);
    });
  }

  it("e diz o que de fato guarda", () => {
    expect(AVISO_DA_TRILHA.toLowerCase()).toContain("não é guardado");
  });
});

describe("os rótulos das autorizações", () => {
  it("toda permissão tem título e frase legíveis", () => {
    for (const p of TOOL_PERMISSIONS) {
      const r = ROTULO_DA_PERMISSAO[p];
      expect(r.titulo.trim(), p).not.toBe("");
      expect(r.frase.trim(), p).not.toBe("");
      // O rótulo não pode ser o identificador da coluna vazando para a tela.
      expect(r.titulo, p).not.toContain("allow_");
    }
  });

  /**
   * As flags são de LEITURA. Uma frase que prometa criar ou alterar descreveria a 18-C, que
   * não existe — e o `guard` rejeita `kind: "escrita"` de qualquer forma.
   */
  it("nenhuma frase promete escrita", () => {
    const ESCRITA = ["criar", "cria ", "alterar", "editar", "apagar", "excluir", "lançar"];
    for (const p of TOOL_PERMISSIONS) {
      const frase = ROTULO_DA_PERMISSAO[p].frase.toLowerCase();
      for (const verbo of ESCRITA) {
        expect(frase, `${p} → ${verbo}`).not.toContain(verbo);
      }
    }
  });

  it("toda frase começa por um verbo de leitura", () => {
    for (const p of TOOL_PERMISSIONS) {
      expect(ROTULO_DA_PERMISSAO[p].frase.startsWith("Ler "), p).toBe(true);
    }
  });
});
