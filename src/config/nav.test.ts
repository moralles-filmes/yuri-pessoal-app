import { describe, expect, it } from "vitest";
import { allNavItems, navHrefs, navSections } from "./nav";
import { PADROES_DE_ROTA, ROTAS_DO_APP, temPagina } from "@/test/rotas";

/**
 * REDESIGN-02-D — o sentido inverso da 02-C.
 *
 * A 02-C provou, varrendo o disco, que nenhuma rota real acende dois itens do menu.
 * Ela não diz nada sobre a outra ponta: um item pode apontar para uma rota que NÃO
 * EXISTE, e o defeito é invisível de dentro do sistema. O `tsc` vê uma string; o lint
 * vê uma string; a tela pinta o item normalmente, com ícone e rótulo; e o 404 só
 * aparece para quem clica. Renomear uma pasta em `src/app/(app)/` é suficiente.
 *
 * ⚠️ HONESTIDADE SOBRE O QUE ESTE ARQUIVO É: ao contrário da 02-C, ele NÃO nasceu
 * vermelho — os 20 itens do menu apontavam para rotas existentes quando foi escrito.
 * Ele não conserta nada; ele impede. Por isso o que importa aqui é o primeiro bloco:
 * um teste que nunca soube dizer "não" não está afirmando coisa alguma.
 */

describe("a varredura de rotas sabe dizer não", () => {
  it("enxerga o disco (guarda anti-tautologia)", () => {
    // Sem isto, tudo abaixo poderia estar passando sobre uma lista vazia.
    expect(PADROES_DE_ROTA.length).toBeGreaterThan(50);
    expect(PADROES_DE_ROTA).toContain("/dashboard/financeiro");
    // O padrão guarda o segmento dinâmico como o Next o declara.
    expect(PADROES_DE_ROTA).toContain("/ia/conversas/[id]");
    expect(navHrefs.length).toBeGreaterThan(15);
  });

  it("a casca autenticada não inclui as telas de fora dela", () => {
    // `/login`, `/cadastro` e `/` existem, mas não renderizam dentro do AppShell —
    // e por isso não são rotas sobre as quais faça sentido perguntar "qual item acende".
    expect(PADROES_DE_ROTA).toContain("/login");
    expect(ROTAS_DO_APP).not.toContain("/login");
    expect(ROTAS_DO_APP).not.toContain("/");
    expect(ROTAS_DO_APP).toContain("/dashboard");
  });

  it("recusa o que não existe — é o que torna o resto deste arquivo uma afirmação", () => {
    expect(temPagina("/dashboard")).toBe(true);
    expect(temPagina("/dashboard/nao-existe")).toBe(false);
    // Fronteira de segmento, como em `hrefAtivo`: `/financeiro` não é `/financeiros`.
    expect(temPagina("/financeiros")).toBe(false);
    // Rota que existe só como pasta intermediária, sem `page.tsx`, não é rota.
    expect(temPagina("/nutricao/despensa")).toBe(false);
  });

  it("resolve segmento dinâmico, query e âncora — as formas em que os links aparecem", () => {
    expect(temPagina("/ia/conversas/9f8e7d6c-1234")).toBe(true);
    expect(temPagina("/nutricao/compras?aba=despensa")).toBe(true);
    expect(temPagina("/financeiro/lancamentos#topo")).toBe(true);
    // Um segmento dinâmico casa com UM segmento, não com o resto do caminho.
    expect(temPagina("/ia/conversas/abc/def")).toBe(false);
  });
});

describe("todo item do menu abre uma tela que existe", () => {
  it.each(allNavItems.map((item) => [item.title, item.href] as const))(
    "%s → %s",
    (_titulo, href) => {
      expect(temPagina(href)).toBe(true);
    },
  );
});

describe("a forma de um href do menu", () => {
  it("é interno, absoluto, sem query e sem barra final", () => {
    for (const item of allNavItems) {
      // `hrefAtivo` compara o href com o `pathname`, que nunca carrega query nem
      // barra final. Um href com qualquer um dos dois NUNCA ficaria ativo — e o
      // item ficaria apagado para sempre, sem nada quebrar.
      expect(item.href.startsWith("/"), item.title).toBe(true);
      expect(item.href, item.title).not.toContain("?");
      expect(item.href, item.title).not.toContain("#");
      expect(item.href === "/" || !item.href.endsWith("/"), item.title).toBe(true);
      expect(item.href, item.title).not.toContain("http");
      expect(item.title.trim(), item.href).not.toBe("");
    }
  });

  it("nenhum href se repete — dois itens na mesma rota acendem os dois", () => {
    // É a 02-C entrando pela outra porta: `hrefAtivo` devolve UM href vencedor, mas
    // a tela acende todo item cujo `href` seja igual a ele. Com o href duplicado,
    // "dois itens acesos" volta a ser montável, e desta vez sem prefixo nenhum
    // envolvido. `findNavItem` seria pior ainda: devolveria o primeiro, em silêncio.
    expect(new Set(navHrefs).size).toBe(navHrefs.length);
  });

  it("a lista plana é exatamente a soma das seções, na ordem", () => {
    // `navHrefs` alimenta `hrefAtivo` na sidebar. Se ela deixar de refletir o que as
    // seções contêm, um item passa a existir na tela e não na decisão — ou o contrário.
    expect(allNavItems).toEqual(navSections.flatMap((secao) => secao.items));
    expect(navHrefs).toEqual(allNavItems.map((item) => item.href));
  });
});
