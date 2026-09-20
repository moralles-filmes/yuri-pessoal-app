/**
 * Fase 18-F · Bloco 3 — IA · O que os serviços da memória NÃO fazem.
 *
 * Varredura de fonte porque o projeto não testa contra banco (regra do projeto: lógica pura é
 * testada pura, I/O não é testado por banco) e porque o que importa aqui é uma AUSÊNCIA.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DIR = path.join(process.cwd(), "src/lib/ai/memory");
const ler = (arquivo: string) => fs.readFileSync(path.join(DIR, arquivo), "utf8");
const services = ler("services.ts");
const queries = ler("queries.ts");

/** Corta comentário: o cabeçalho descreve a regra e não pode fazer o teste passar nem falhar. */
function semComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");
}

describe("o evento não guarda o conteúdo", () => {
  it("⛔ nenhum insert em ai_memory_events carrega `content`", () => {
    const codigo = semComentarios(services);
    const inserts = [
      ...codigo.matchAll(/from\("ai_memory_events"\)\s*\.insert\(\{([\s\S]*?)\}\)/g),
    ];
    expect(inserts.length, "não achei o insert do evento").toBeGreaterThan(0);
    for (const [, corpo] of inserts) {
      expect(corpo).not.toMatch(/\bcontent\b/);
      expect(corpo).not.toMatch(/\bconteudo\b/);
      expect(corpo).not.toMatch(/forma\.valor/);
    }
  });

  it("toda escrita de memória registra um evento", () => {
    for (const fn of [
      "criarMemoria",
      "editarMemoria",
      "alternarMemoria",
      "esquecerMemoria",
      "excluirMemoria",
    ]) {
      const corpo = services.slice(services.indexOf(`export async function ${fn}`));
      const ate = corpo.slice(0, corpo.indexOf("\nexport ") + 1 || corpo.length);
      expect(ate, fn).toContain("registrarEvento(");
    }
  });

  /**
   * ⛔ O EVENTO VEM ANTES DO DELETE. Ver o docblock de `excluirMemoria`: erramos para "há
   * registro a mais", nunca para "a linha sumiu sem registro".
   */
  it("em excluirMemoria, o evento é gravado ANTES do delete", () => {
    const corpo = services.slice(services.indexOf("export async function excluirMemoria"));
    expect(corpo.indexOf("registrarEvento(")).toBeLessThan(corpo.indexOf(".delete()"));
  });

  /**
   * ⚠️ A IA NÃO EDITA MEMÓRIA — e a trava é a ausência de ferramenta, não um `if`. Aqui
   * guardamos a outra metade: mesmo chamado pelo command, `editarMemoria` registra `"dono"`,
   * porque ela só é alcançável pela tela.
   */
  it("editarMemoria registra origem `dono`, sempre", () => {
    const corpo = services.slice(services.indexOf("export async function editarMemoria"));
    const ate = corpo.slice(0, corpo.indexOf("\nexport ") + 1 || corpo.length);
    expect(ate).toContain('"editada", "dono"');
  });
});

describe("a leitura usa o client de sessão e o estado é derivado", () => {
  it("queries.ts não grava nada", () => {
    const codigo = semComentarios(queries);
    for (const escrita of [".insert(", ".update(", ".upsert(", ".delete("]) {
      expect(codigo, escrita).not.toContain(escrita);
    }
  });

  it("o estado vem de memory/state.ts, não de uma coluna", () => {
    expect(queries).toContain("estadoDaMemoria(");
    expect(semComentarios(queries)).not.toMatch(/\bactive\b|\bstatus\b/);
  });
});

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⚠️ `memory/` MISTURA PURO COM I/O, E NADA MAIS NO PROJETO GUARDA ESSA LINHA.          ║
 * ║                                                                                       ║
 * ║ `boundaries.test.ts` exige `server-only` em `ai/server/` e em `approval/commands/`, e ║
 * ║ tem a asserção "quem fala com o banco declara, quem é puro não" SÓ para `approval/`.  ║
 * ║ Esta pasta ficaria de fora das três.                                                  ║
 * ║                                                                                       ║
 * ║ E a metade de cima importa mais que a de baixo: `contracts.ts`, `forma.ts` e          ║
 * ║ `state.ts` são lidos pela TELA. Um `server-only` neles — ou um import de Supabase —   ║
 * ║ quebraria a build do cliente, e o erro apareceria longe daqui.                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
describe("quem fala com o banco declara server-only; quem é puro, não", () => {
  const COM_IO = ["queries.ts", "services.ts"];
  const PUROS = ["contracts.ts", "forma.ts", "state.ts", "prompt.ts"];

  it.each(COM_IO)("%s declara server-only", (arquivo) => {
    expect(ler(arquivo)).toMatch(/import\s+["']server-only["']/);
  });

  it.each(PUROS)("%s não declara server-only e não fala com o banco", (arquivo) => {
    const codigo = ler(arquivo);
    expect(codigo).not.toMatch(/import\s+["']server-only["']/);
    expect(semComentarios(codigo)).not.toMatch(/\.from\(|supabase/i);
  });

  /** A lista acima é escrita à mão — esta asserção impede um arquivo novo de escapar dela. */
  it("todo arquivo de memory/ está numa das duas listas", () => {
    const arquivos = fs
      .readdirSync(DIR)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect([...arquivos].sort()).toEqual([...COM_IO, ...PUROS].sort());
  });
});
