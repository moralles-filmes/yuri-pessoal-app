import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/links-inline";

/**
 * REDESIGN-04-B · T4 — a gaveta de registros, conferida pela FONTE (o projeto não tem teste de
 * componente: `environment: "node"`).
 *
 * O que estas varreduras seguram:
 *  - D-B-1 / carregamento sob demanda: a fachada só chega ao `Sheet` por `next/dynamic` com objeto
 *    literal, e nunca o importa (senão o `Sheet` volta ao manifest da rota);
 *  - invariante 95: o estado (o último detalhe) vive na FACHADA, fora do `Sheet` — `SheetContent`
 *    desmonta os filhos ao fechar, e o fechamento piscaria vazio;
 *  - D-B-13: a gaveta vive num portal, fora do `group/olho` da página. Ela lê o olho pelo contexto
 *    (`useOlhoDosValores`) e todo dinheiro passa por `ValorComOlho`. Um `formatCurrency` cru na
 *    lista mostraria o valor com o olho fechado;
 *  - `forceMount` deixaria rolagem travada e `aria-hidden` permanentes (regra 2 do sob demanda).
 */
const DIR = path.resolve(__dirname);
const fonte = (nome: string) => semComentarios(fs.readFileSync(path.join(DIR, nome), "utf8"));

const FACHADA = fonte("gaveta-de-registros.tsx");
const IMPL = fonte("gaveta-de-registros-impl.tsx");
const OLHO = fonte("olho-dos-valores.tsx");

describe("04-B · a gaveta de registros", () => {
  it("a fachada carrega a impl por next/dynamic com objeto literal e ssr: false", () => {
    expect(FACHADA).toMatch(/from\s+["']next\/dynamic["']/);
    expect(FACHADA).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\(["']\.\/gaveta-de-registros-impl["']\)[\s\S]*?,\s*\{\s*ssr:\s*false\s*\},?\s*\)/);
  });

  it("a fachada não importa o Sheet nem o renderiza (o estado fica fora da gaveta)", () => {
    expect(FACHADA).not.toMatch(/@\/components\/ui\/sheet/);
    expect(FACHADA).not.toMatch(/<Sheet\b/);
    expect(FACHADA).toMatch(/useLazyDialog\(/);
    // A última vista não nula é guardada na fachada, para a animação de fechar.
    expect(FACHADA).toMatch(/useState<VistaDaGaveta \| null>/);
  });

  it("a impl lê o olho pelo contexto e repõe o group/olho no próprio invólucro", () => {
    expect(OLHO).toMatch(/export function useOlhoDosValores\(\)/);
    expect(IMPL).toMatch(/useOlhoDosValores\(\)/);
    expect(IMPL).toMatch(/data-ocultar=/);
    expect(IMPL).toMatch(/group\/olho/);
  });

  it("todo dinheiro da impl passa por ValorComOlho, e as peças não formatam moeda", () => {
    // A vista chega PRONTA (`vistaDaGaveta`): a peça não importa @/lib/finance nem formata moeda.
    expect(IMPL).not.toMatch(/formatCurrency|@\/lib\/finance|@\/lib\/format/);
    expect(FACHADA).not.toMatch(/@\/lib\/finance/);
    const CAMPOS_DE_DINHEIRO = [
      "vista.total",
      "l.valor",
      "o.valor",
      "vista.soma.valor",
      "vista.diferenca",
      "g.cabecalho.fatura",
      "g.cabecalho.minhaParte",
      "g.diferenca.fatura",
      "g.diferenca.itens",
    ];
    for (const campo of CAMPOS_DE_DINHEIRO) {
      const esc = campo.replace(/\./g, "\\.");
      const usos = IMPL.match(new RegExp(`\\{${esc}\\}`, "g")) ?? [];
      const comOlho = IMPL.match(new RegExp(`<ValorComOlho texto=\\{${esc}\\}`, "g")) ?? [];
      expect(usos.length, campo).toBeGreaterThan(0);
      expect(comOlho.length, campo).toBe(usos.length);
    }
  });

  it("a impl não usa forceMount e a largura lateral tem o prefixo data-[side=right]:", () => {
    expect(IMPL).not.toMatch(/forceMount/);
    expect(IMPL).toMatch(/data-\[side=right\]:sm:max-w-xl/);
  });

  it("ao fechar, o foco volta a quem o tinha ao abrir (aberta pela URL não há SheetTrigger)", () => {
    // Revisão final, achado 5: sem isto o Radix devolve o foco ao <body> e o teclado perde a posição.
    expect(IMPL).toMatch(/onOpenAutoFocus=\{/);
    expect(IMPL).toMatch(/onCloseAutoFocus=\{/);
    expect(IMPL).toMatch(/\.focus\(\{\s*preventScroll:\s*true\s*\}\)/);
  });

  it("o vazio não escreve R$ e a falha é alerta", () => {
    expect(IMPL).toMatch(/role="alert"/);
    expect(IMPL).not.toMatch(/R\$ 0,00/);
  });
});

describe("08 C1 - fechar a gaveta", () => {
  it("a fachada decide entre voltar e substituir pelo helper sem imports", () => {
    expect(FACHADA).toMatch(/comoFecharAGaveta\(/);
    expect(FACHADA).toMatch(/router\.back\(\)/);
    expect(FACHADA).toMatch(/router\.replace\(urlAoFechar, \{ scroll: false \}\)/);
    expect(FACHADA).toMatch(/useState\(false\)/);
  });

  it("a fachada importa o helper de @/lib/painel/gaveta-historico", () => {
    expect(FACHADA).toMatch(/from\s+["']@\/lib\/painel\/gaveta-historico["']/);
  });
});
