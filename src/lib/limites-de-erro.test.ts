/**
 * REDESIGN-03-G (L3) — os limites de erro, por varredura do código-fonte.
 *
 * O projeto não tem teste de componente (invariante 25 do CLAUDE.md): o contrato é conferido no
 * texto. O que cai aqui: um limite que some, que volta a usar `reset` (Next 16 usa
 * `unstable_retry`), que exibe `error.message` (em desenvolvimento ela pode trazer o texto do
 * banco), ou uma `TelaDeErro` que passa a importar algo — ela entra no JS de TODAS as rotas, uma
 * cópia por limite (D-G15). O `src/app/error.tsx` da raiz ficou de fora por decisão do dono
 * (2026-10-25): com ele, a mediana subia +2,2 KB contra o teto de 1,5.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), "utf8");

/** Tira os comentários: a explicação de uma regra não pode satisfazê-la (nem violá-la). */
const semComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Os limites de segmento REEXPORTAM o limite único — uma função própria custaria bundle. */
const DE_SEGMENTO = ["src/app/(app)/error.tsx", "src/app/(app)/financeiro/error.tsx"] as const;

describe("03-G L3 · os limites de erro (D-G14, com a decisão do dono de 2026-10-25)", () => {
  it.each(DE_SEGMENTO)("%s é client e reexporta o LimiteDeErro", (arquivo) => {
    const fonte = ler(arquivo);
    expect(fonte.trimStart().startsWith('"use client"')).toBe(true);
    expect(semComentarios(fonte)).toContain(
      'export { LimiteDeErro as default } from "@/components/shared/tela-de-erro";',
    );
  });

  it('global-error é client, tem <html lang="pt-BR"> e <body> próprios e usa o LimiteDeErro', () => {
    const fonte = ler("src/app/global-error.tsx");
    const codigo = semComentarios(fonte);
    expect(fonte.trimStart().startsWith('"use client"')).toBe(true);
    expect(codigo).toContain('<html lang="pt-BR">');
    expect(codigo).toContain("<body");
    expect(codigo).toContain("<LimiteDeErro error={error} unstable_retry={unstable_retry} />");
    expect(codigo).not.toMatch(/\breset\b/);
  });

  it("não há src/app/error.tsx: o global-error pega a falha do (app)/layout (custo de bundle)", () => {
    expect(existsSync(join(RAIZ, "src/app/error.tsx"))).toBe(false);
  });
});

describe("03-G L3 · TelaDeErro e LimiteDeErro (§5.4, D-G15)", () => {
  const fonte = ler("src/components/shared/tela-de-erro.tsx");
  const codigo = semComentarios(fonte);

  it("é client", () => {
    expect(fonte.trimStart().startsWith('"use client"')).toBe(true);
  });

  it("o LimiteDeErro usa unstable_retry, não usa reset e não exibe nem loga a mensagem", () => {
    expect(codigo).toContain("aoTentar={unstable_retry}");
    expect(codigo).not.toMatch(/\breset\b/);
    expect(codigo).not.toContain("error.message");
    expect(codigo).not.toContain("console.");
  });

  it("diz as duas frases do desenho e oferece tentar de novo", () => {
    expect(codigo).toContain("Não foi possível ler os dados desta tela.");
    expect(codigo).toContain("Nada foi alterado.");
    expect(codigo).toContain("Tentar de novo");
    expect(codigo).toContain("Código: {digest}");
  });

  it("não importa nada — nem o Button (o cva entraria em cada limite), nem ícone", () => {
    expect(codigo).not.toMatch(/\bimport\b/);
  });
});
