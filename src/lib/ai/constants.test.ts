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
  AVISO_DA_ESCRITA,
  AVISO_DA_TRILHA,
  AVISO_SEM_ACESSO,
  RESUMO_DO_ASSISTENTE,
  ROTULO_DA_PERMISSAO,
  ROTULO_DA_PERMISSAO_DE_ESCRITA,
} from "./constants";
import { TOOL_PERMISSIONS, TOOL_WRITE_PERMISSIONS } from "./tools/contracts";
import {
  permissaoDeLeituraDaEscrita,
  toolsForPermission,
  toolsForWritePermission,
  writeTools,
} from "./tools/registry";

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

  /**
   * ⚠️ **A ASSERÇÃO MUDOU NO BLOCO 4, E É O TERCEIRO CAPÍTULO DA MESMA HISTÓRIA.**
   *
   * Ela exigia a frase "não cria nem altera" nos dois avisos. Isso protegeu a verdade
   * enquanto ela era verdade; no commit que publicou `todo.criar_tarefa`, a MESMA asserção
   * passou a exigir uma mentira — um teste guardando um texto falso é pior que teste nenhum.
   *
   * O que ficou é derivado do registry, e por isso não envelhece sozinho: **enquanto existir
   * ferramenta de escrita, a frase de "não altera nada" NÃO pode aparecer; e a promessa que
   * substitui tem de ser a que o Approval Engine cumpre — confirmação.**
   */
  it("os dois avisos falam de AUTORIZAÇÃO e de CONFIRMAÇÃO", () => {
    for (const texto of [AVISO_SEM_ACESSO, RESUMO_DO_ASSISTENTE]) {
      expect(texto.toLowerCase()).toContain("autoriz");
      expect(texto.toLowerCase()).toContain("confirm");
    }
  });

  it("com escrita publicada, nenhum aviso promete que a IA não altera nada", () => {
    const temEscrita = writeTools().length > 0;
    for (const texto of [AVISO_SEM_ACESSO, RESUMO_DO_ASSISTENTE]) {
      const t = texto.toLowerCase();
      // Os dois sentidos: sem escrita a frase é obrigatória; com escrita, é proibida.
      expect(t.includes("não cria nem altera"), texto).toBe(!temEscrita);
    }
  });

  /**
   * O aviso de escrita é o texto que a pessoa lê no instante em que decide ligar a chave. Ele
   * tem de dizer as duas coisas — que a IA passa a PREPARAR, e que nada é aplicado sozinho.
   */
  it("o aviso da escrita diz que prepara e que nada é aplicado sem confirmação", () => {
    const t = AVISO_DA_ESCRITA.toLowerCase();
    expect(t).toContain("prepar");
    expect(t).toContain("confirm");
    expect(t).toContain("sozinha");
  });
});

describe("os rótulos das autorizações de ESCRITA", () => {
  it("toda chave de escrita tem título e frase legíveis", () => {
    for (const p of TOOL_WRITE_PERMISSIONS) {
      const r = ROTULO_DA_PERMISSAO_DE_ESCRITA[p];
      expect(r.titulo.trim(), p).not.toBe("");
      expect(r.frase.trim(), p).not.toBe("");
      expect(r.titulo, p).not.toContain("allow_");
    }
  });

  /**
   * ⛔ NENHUMA FRASE PODE PROMETER QUE A IA FAZ. Ela PREPARA — e a distinção não é retórica:
   * é a diferença entre o que o sistema faz e o que ele seria se alguém ligasse auto-execução
   * (que a 18-C proíbe por decisão do dono, §3.2). A frase da tela é onde essa proibição
   * aparece para quem não lê o código.
   */
  it("toda frase de escrita começa por 'Preparar' e termina prometendo confirmação", () => {
    for (const p of TOOL_WRITE_PERMISSIONS) {
      const frase = ROTULO_DA_PERMISSAO_DE_ESCRITA[p].frase;
      expect(frase.startsWith("Preparar "), p).toBe(true);
      expect(frase.toLowerCase(), p).toContain("confirmar na tela");
    }
  });

  /**
   * Chave de escrita SEM ferramenta é botão que não liga nada — mas ela não pode simplesmente
   * sumir da lista: as cinco existem no banco e no schema, e a tela as mostra desabilitadas
   * com a explicação. O que este teste guarda é que a decisão de habilitar sai do REGISTRY,
   * nunca de uma lista escrita à mão de "módulos prontos" (invariante 24 da 18-B).
   */
  it("a dependência de leitura de cada chave sai do descriptor, não de uma tabela paralela", () => {
    for (const p of TOOL_WRITE_PERMISSIONS) {
      const ferramentas = toolsForWritePermission(p);
      const leitura = permissaoDeLeituraDaEscrita(p);
      if (ferramentas.length === 0) {
        expect(leitura, p).toBeNull();
        continue;
      }
      expect(leitura, p).not.toBeNull();
      // Todas as ferramentas daquela chave têm de exigir a MESMA leitura — senão a tela
      // pediria uma chave e o guard exigiria outra.
      for (const t of ferramentas) expect(t.requiredPermission, t.name).toBe(leitura);
    }
  });

  /**
   * ⚠️ FECHADO O BLOCO 4, AS CINCO CHAVES TÊM FERRAMENTA — nenhuma é botão que não liga nada.
   *
   * O laço acima aceita chave sem ferramenta de propósito (era o estado dos Blocos 1–3), então
   * ele sozinho não notaria uma chave ficando órfã de novo. Esta asserção é a que percebe: ela
   * fica vermelha se alguém remover a última ferramenta de um módulo sem remover a chave, e
   * obriga a decisão a ser explícita nos dois sentidos.
   */
  it("as cinco chaves de escrita têm pelo menos uma ferramenta", () => {
    for (const p of TOOL_WRITE_PERMISSIONS) {
      expect(toolsForWritePermission(p).length, p).toBeGreaterThan(0);
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
