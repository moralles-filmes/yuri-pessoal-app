/**
 * Fase 18-F · Bloco 3 — IA · As travas da memória que moram NO BANCO.
 *
 * Varrer migration, e não confiar no TypeScript: append-only é a AUSÊNCIA de duas policies, e
 * "o evento não guarda o conteúdo" é a AUSÊNCIA de uma coluna. Um teste que exercitasse só o
 * caminho feliz continuaria verde depois de alguém acrescentar as duas.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EVENTOS_DE_MEMORIA, MAX_MEMORIA, MODULOS_DE_MEMORIA } from "./contracts";

const MIGRATIONS = path.resolve(__dirname, "..", "..", "..", "..", "supabase", "migrations");

function sqlCompleto(): string {
  return fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => fs.readFileSync(path.join(MIGRATIONS, f), "utf8"))
    .join("\n");
}

/** Só as declarações — comentário que descreve a regra não pode fazer o teste passar. */
const SQL = sqlCompleto()
  .split("\n")
  .filter((l) => !/^\s*--/.test(l))
  .join("\n");

const TABELAS = ["ai_memories", "ai_memory_events"] as const;

/** O `create table` de uma tabela, até o `);` que o fecha. */
function blocoDaTabela(tabela: string): string {
  const inicio = SQL.indexOf(`create table if not exists public.${tabela}`);
  expect(inicio, `não achei o create table de ${tabela}`).toBeGreaterThan(-1);
  return SQL.slice(inicio).split(");")[0];
}

/**
 * Os valores literais de um CHECK, pelo nome da constraint.
 *
 * ⚠️ ANCORA EM `add constraint`, NÃO no nome solto. A migration é idempotente, então cada
 * constraint aparece DUAS vezes — e a primeira é o `drop constraint if exists …;`, que
 * termina no ponto e vírgula seguinte. Buscar o nome devolvia o pedaço do `drop`, sem um
 * único literal dentro: os dois testes abaixo comparavam lista vazia com lista vazia e
 * teriam passado se `toEqual` não exigisse o conteúdo.
 */
function valoresDoCheck(constraint: string): string[] {
  const inicio = SQL.indexOf(`add constraint ${constraint}`);
  expect(inicio, `não achei o add constraint de ${constraint}`).toBeGreaterThan(-1);
  const bloco = SQL.slice(inicio).split(";")[0];
  return [...bloco.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe("as duas tabelas da memória", () => {
  it.each(TABELAS)("%s é criada, com RLS e FORCE RLS", (t) => {
    expect(SQL).toContain(`create table if not exists public.${t}`);
    expect(SQL).toContain(`alter table public.${t} enable row level security`);
    expect(SQL).toContain(`alter table public.${t} force row level security`);
  });

  it.each(TABELAS)("%s tem índice em user_id", (t) => {
    expect(SQL).toMatch(new RegExp(`${t}_user_idx[\\s\\S]{0,80}\\(user_id\\)`));
  });

  /**
   * ⛔ APPEND-ONLY É A AUSÊNCIA DE POLICY, e a ausência é o que este teste guarda.
   *
   * ⚠️ E UM TESTE DE AUSÊNCIA PRECISA PROVAR QUE SABE ENCONTRAR PRESENÇA. A primeira versão
   * desta asserção exigia quebra de linha entre a tabela e o comando (`\s*\n\s*for update`),
   * e o SQL escreve `on public.ai_memory_events for select` na MESMA linha: ela não casaria
   * nem com as policies que EXISTEM, e passaria verde para sempre — inclusive depois de
   * alguém acrescentar o UPDATE que ela deveria barrar. Por isso o segundo `expect`.
   */
  it("ai_memory_events não tem policy de UPDATE nem de DELETE", () => {
    const policyPara = (comando: string) =>
      new RegExp(`on public\\.ai_memory_events\\s+for ${comando}`, "i");

    for (const comando of ["update", "delete"]) {
      expect(SQL, comando).not.toMatch(policyPara(comando));
    }
    // A mesma regex encontra as duas que existem — senão a asserção acima é vácua.
    for (const comando of ["select", "insert"]) {
      expect(SQL, comando).toMatch(policyPara(comando));
    }
  });

  /**
   * ⛔ O EVENTO NÃO GUARDA O CONTEÚDO. Varre o BLOCO da criação da tabela, não o arquivo
   * inteiro: `content` aparece de propósito em `ai_memories`, logo acima.
   */
  it("ai_memory_events não tem coluna de texto da memória", () => {
    const bloco = blocoDaTabela("ai_memory_events");
    expect(bloco).not.toMatch(/\bcontent\b/);
    expect(bloco).not.toMatch(/\btexto\b/);
    expect(bloco).not.toMatch(/\bconteudo\b/);
  });

  /** ⛔ SEM FK — invariante 38. Se alguém acrescentar `references`, o registro passa a sumir. */
  it("memory_id não referencia ai_memories", () => {
    const bloco = blocoDaTabela("ai_memory_events");
    expect(bloco).toMatch(/memory_id\s+uuid\s+not null/);
    expect(bloco).not.toMatch(/memory_id[^\n]*references/i);
  });

  it("ai_memories não tem coluna de estado — ele é derivado", () => {
    const bloco = blocoDaTabela("ai_memories");
    for (const coluna of ["active", "status", "forgotten_at", "disabled"]) {
      expect(bloco, coluna).not.toMatch(new RegExp(`\\b${coluna}\\b`));
    }
  });

  it("o CHECK do conteúdo usa o MESMO limite de MAX_MEMORIA", () => {
    expect(SQL).toContain(`char_length(content) between 1 and ${MAX_MEMORIA}`);
  });

  /** A memória é uma frase só — a mesma regra de `formaDaMemoria`, aqui como trava final. */
  it("o CHECK recusa quebra de linha no conteúdo", () => {
    expect(SQL).toContain("ai_memories_content_uma_linha");
    expect(SQL).toMatch(/check\s*\(content\s*!~\s*'\[\\n\\r\]'\)/);
  });

  /**
   * ⚠️ EXATAMENTE os de `MODULOS_DE_MEMORIA` — nem a mais, nem a menos. Conferir só que cada
   * um "aparece no SQL" não provaria nada: todos aparecem em outras migrations do projeto.
   */
  it("o CHECK de módulo lista exatamente MODULOS_DE_MEMORIA", () => {
    expect(valoresDoCheck("ai_memories_modulo_check").sort()).toEqual(
      [...MODULOS_DE_MEMORIA].sort(),
    );
  });

  it("o CHECK de evento lista exatamente EVENTOS_DE_MEMORIA", () => {
    expect(valoresDoCheck("ai_memory_events_evento_check").sort()).toEqual(
      [...EVENTOS_DE_MEMORIA].sort(),
    );
  });

  /** As duas origens, nas duas tabelas. `ia` só existe depois de o dono confirmar. */
  it.each([
    ["ai_memories_origem_check"],
    ["ai_memory_events_origem_check"],
  ])("%s aceita só dono e ia", (constraint) => {
    expect(valoresDoCheck(constraint).sort()).toEqual(["dono", "ia"]);
  });

  it("allow_write_memory nasce desligada", () => {
    expect(SQL).toMatch(
      /add column if not exists allow_write_memory boolean not null default false/,
    );
  });

  /** A tabela do dono tem trigger de `updated_at`; a append-only não tem `updated_at`. */
  it("só ai_memories tem trigger de updated_at", () => {
    expect(SQL).toContain("set_ai_memories_updated_at");
    expect(blocoDaTabela("ai_memory_events")).not.toMatch(/\bupdated_at\b/);
  });
});
