/**
 * Fase 18-F · Bloco 3 — IA · A FORMA de uma memória, nunca o assunto.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A TENTAÇÃO É UMA LISTA DE ASSUNTOS PROIBIDOS. ELA FURA NO PRIMEIRO ASSUNTO NOVO.      ║
 * ║                                                                                       ║
 * ║ É a invariante 39 da 18-C, onde `changed_fields` limita a FORMA e não o nome: só passa ║
 * ║ o que TEM a forma permitida. Um endereço, um token e um texto de três parágrafos       ║
 * ║ falham todos por forma, sem que ninguém precise tê-los previsto.                       ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_MEMORIA } from "./contracts";
import { formaDaMemoria, MOTIVO_DA_RECUSA } from "./forma";

describe("formaDaMemoria", () => {
  it("aceita uma preferência normal e normaliza o espaço", () => {
    const r = formaDaMemoria("  Prefiro   treinar de manhã  ");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor).toBe("Prefiro treinar de manhã");
  });

  it("recusa vazio, só espaço e o que não é texto", () => {
    for (const entrada of ["", "   ", null, undefined, 42, {}]) {
      const r = formaDaMemoria(entrada);
      expect(r.ok, String(entrada)).toBe(false);
      if (r.ok) return;
      expect(r.motivo).toBe("vazia");
    }
  });

  it(`recusa acima de ${MAX_MEMORIA} caracteres e aceita exatamente ${MAX_MEMORIA}`, () => {
    expect(formaDaMemoria("a".repeat(MAX_MEMORIA)).ok).toBe(true);
    const r = formaDaMemoria("a".repeat(MAX_MEMORIA + 1));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("longa");
  });

  /**
   * ⚠️ `forma.ts` NÃO PODE IMPORTAR NADA (ver o último `describe`), então o limite é literal
   * lá e literal em `contracts.ts`. Esta asserção é o que impede os dois de divergirem em
   * silêncio — e o CHECK do banco é comparado com `MAX_MEMORIA` em `schema.test.ts`.
   */
  it("o limite é o MESMO nos dois arquivos", () => {
    expect(MAX_MEMORIA).toBe(300);
    expect(MOTIVO_DA_RECUSA.longa).toContain(String(MAX_MEMORIA));
  });

  /**
   * ⚠️ CONTA PONTOS DE CÓDIGO, não unidades UTF-16. `"👍".length` é 2 em JS e 1 no
   * `char_length` do Postgres: com `.length`, o CHECK do banco e esta função discordariam
   * exatamente nas frases com emoji — e a recusa viria do banco, sem mensagem para a tela.
   */
  it("conta como o Postgres conta", () => {
    expect(formaDaMemoria("👍".repeat(MAX_MEMORIA)).ok).toBe(true);
  });

  it("recusa quebra de linha — a memória é uma frase só", () => {
    for (const entrada of ["a\nb", "a\r\nb"]) {
      const r = formaDaMemoria(entrada);
      expect(r.ok, entrada).toBe(false);
      if (r.ok) return;
      expect(r.motivo).toBe("multilinha");
    }
  });

  it("recusa endereço de site e e-mail", () => {
    for (const entrada of [
      "veja em https://exemplo.com",
      "olhar www.exemplo.com.br",
      "me avise em eu@exemplo.com",
    ]) {
      const r = formaDaMemoria(entrada);
      expect(r.ok, entrada).toBe(false);
      if (r.ok) return;
      expect(r.motivo).toBe("endereco");
    }
  });

  /**
   * ⚠️ A REGRA É DE FORMA: um bloco longo que mistura letra e dígito. Ela não sabe o que é
   * uma chave da OpenAI — ela sabe que preferência escrita em português não tem essa forma.
   */
  it("recusa trecho com forma de chave", () => {
    for (const entrada of [
      "guarde sk-proj-7aQ2ZxLm90PdRt41VbNc",
      "a senha é a3f9b21c7e4d8a05b6c3f21e9d40",
    ]) {
      const r = formaDaMemoria(entrada);
      expect(r.ok, entrada).toBe(false);
      if (r.ok) return;
      expect(r.motivo).toBe("parece_credencial");
    }
  });

  it("não confunde frase longa em português com credencial", () => {
    const frase =
      "Prefiro que as respostas sobre alimentação venham sempre com a quantidade em gramas antes da medida caseira";
    expect(formaDaMemoria(frase).ok).toBe(true);
    // Data pura e valor com vírgula continuam passando: não têm letra misturada no bloco.
    expect(formaDaMemoria("Meu aniversário é 1990-04-17 e eu gosto de lembrete").ok).toBe(true);
  });

  it("todo motivo tem texto em pt-BR, e nenhum vaza nome de coluna", () => {
    for (const [motivo, texto] of Object.entries(MOTIVO_DA_RECUSA)) {
      expect(texto.trim(), motivo).not.toBe("");
      expect(texto, motivo).not.toContain("content");
      expect(texto, motivo).not.toContain("_");
    }
  });
});

/**
 * ⛔ `contracts.ts` E `forma.ts` NÃO TÊM UM ÚNICO IMPORT, e é isso que os torna baratos o
 * bastante para a TELA usá-los no contador de caracteres. É a regra 3 do carregamento sob
 * demanda: constante lida pela tela não mora em `src/lib/validators/`, que começa com
 * `import { z } from "zod"` — 62,7 KB gz.
 */
describe("os dois módulos que a tela importa são livres de dependência", () => {
  it.each(["contracts.ts", "forma.ts"])("%s não importa nada", (arquivo) => {
    const codigo = fs.readFileSync(
      path.join(process.cwd(), "src/lib/ai/memory", arquivo),
      "utf8",
    );
    expect(codigo).not.toMatch(/^\s*import\s/m);
  });
});
