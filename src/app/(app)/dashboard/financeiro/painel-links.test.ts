import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { temPagina } from "@/test/rotas";
import { parametrosLidos } from "@/test/parametros-lidos";
import { semComentarios } from "@/test/links-inline";

/**
 * 04-A, Tarefa 6 — todo link do painel financeiro abre uma tela que existe (D-A-4, aceite 1).
 *
 * O requisito não é "o link está escrito", é "o link ABRE": só o disco prova (molde de
 * `search/ai-links.test.ts`, que usa a mesma resolução de rotas, `@/test/rotas`).
 */

const pasta = join(process.cwd(), "src", "app", "(app)", "dashboard", "financeiro");
const fonte = (nome: string) => semComentarios(readFileSync(join(pasta, nome), "utf8"));
const CODIGO = [fonte("page.tsx"), fonte("financial-dashboard-client.tsx")].join("\n");

/** Os destinos que o desenho promete (spec §3.2 D-A-4 e plano, Tarefa 6 "Links"). */
const DESTINOS = [
  ["Saldo → contas", "/financeiro/contas"],
  ["entradas e saídas → lançamentos", "/financeiro/lancamentos"],
  ["terceiros e A receber → terceiros", "/terceiros"],
  ["Cartões → cartões", "/cartoes"],
  ["Próximas faturas → faturas", "/faturas"],
  ["Barras → relatório", "/relatorios"],
] as const;

describe("painel financeiro — links", () => {
  it.each(DESTINOS)("%s: a rota tem página no disco", (_nome, rota) => {
    expect(temPagina(rota)).toBe(true);
  });

  it.each(DESTINOS)("%s: o painel de fato aponta para ela", (_nome, rota) => {
    expect(CODIGO).toContain(rota);
  });

  it("todo href estático escrito no painel tem página no disco (nenhum link morto)", () => {
    const achados = new Set<string>();
    for (const m of CODIGO.matchAll(/\bhref\s*[=:]\s*\{?\s*["'`](\/[^"'`?#$]*)/g)) achados.add(m[1]);

    // Sem isto, uma extração que não achasse nada passaria verde.
    expect(achados.size).toBeGreaterThanOrEqual(DESTINOS.length);
    for (const rota of achados) expect(temPagina(rota), rota).toBe(true);
  });

  it("a tela de lançamentos lê os parâmetros que o painel manda (type e month)", () => {
    // Link com parâmetro que a página ignora abre a lista inteira, em silêncio.
    const lidos = parametrosLidos("/financeiro/lancamentos");
    expect(lidos.has("type")).toBe(true);
    expect(lidos.has("month")).toBe(true);
    // 04-B (D-B-14): os indicadores deixaram de ir direto a Lançamentos e abrem os registros do
    // número (`?detalhe=`, URL pronta do servidor). A tela de lançamentos continua alcançável pelo
    // rodapé da gaveta (`linkLancamentos`) e pelo "Ver todas" de Últimas transações.
    expect(CODIGO).toMatch(/href=\{hrefs\.entradas\}/);
    expect(CODIGO).toMatch(/href=\{hrefs\.saidas\}/);
    expect(CODIGO).toMatch(/linkLancamentos=\{`\/financeiro\/lancamentos\?month=/);
  });
});
