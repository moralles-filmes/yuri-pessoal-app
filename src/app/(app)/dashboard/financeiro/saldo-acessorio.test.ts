import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/links-inline";

/**
 * 04-B, conferência visual — o indicador de saldo leva SÓ o olho no acessório. Com um atalho para
 * as contas ao lado (texto ou ícone), o rótulo perdia 1 a 2 linhas em todo desktop e, em 1280 px,
 * "Saldo das contas" quebrava no meio da palavra. O caminho para as contas mora no rodapé da
 * gaveta do saldo (`linkContas`), onde "Abrir em Lançamentos" não serve: saldo não é competência.
 */
const raiz = join(process.cwd(), "src");
const fonte = (...p: string[]) => semComentarios(readFileSync(join(raiz, ...p), "utf8"));

describe.each([
  ["painel", fonte("app", "(app)", "dashboard", "financeiro", "financial-dashboard-client.tsx")],
  ["relatório", fonte("app", "(app)", "relatorios", "relatorios-client.tsx")],
])("o saldo (%s)", (_tela, codigo) => {
  it("o acessório do indicador de saldo é só o olho", () => {
    expect(codigo).not.toMatch(/aria-label="Abrir contas"/);
    expect(codigo).not.toMatch(/>\s*Contas\s*<\/Link>/);
  });

  it("a gaveta recebe o link das contas", () => {
    expect(codigo).toMatch(/linkContas=\{/);
  });
});

it("as duas leituras só oferecem o link das contas na gaveta do saldo", () => {
  expect(fonte("app", "(app)", "dashboard", "financeiro", "page.tsx")).toMatch(
    /pedido\?\.chave === "saldo" \? "\/financeiro\/contas" : null/,
  );
  expect(fonte("lib", "reports", "financeiro.ts")).toMatch(/pedido\?\.chave === "saldo" \?/);
});

it("com linkContas, o rodapé abre Contas e não a nota de Lançamentos", () => {
  const impl = fonte("components", "shared", "painel", "gaveta-de-registros-impl.tsx");
  expect(impl).toMatch(/Abrir em Contas/);
  expect(impl).toMatch(/linkContas \? <LinkContas/);
});
