import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hrefAtivo, rotasDeclaradas } from "./active";
import { allNavItems, findNavItem, navHrefs } from "@/config/nav";
import { ROTAS_DO_APP as ROTAS } from "@/test/rotas";

/**
 * REDESIGN-02-C — a navegação tem UMA decisão de item ativo.
 *
 * O que este arquivo guarda não é o algoritmo (ele cabe em seis linhas e o `tsc`
 * já o protege). É o que o `tsc` NÃO alcança:
 *
 *  - que a decisão continue sendo uma só, e não seis, como era antes;
 *  - que nenhuma rota real do disco acenda dois itens, com as rotas LIDAS do
 *    disco em vez de escritas à mão aqui — uma lista à mão fica para trás no dia
 *    em que alguém cria uma pasta, e é exatamente aí que o defeito voltaria.
 *
 * A varredura das pastas saiu daqui na REDESIGN-02-D (`@/test/rotas`), porque outros
 * três arquivos precisavam da mesma resposta e dois deles a estavam supondo.
 */

const SRC = path.resolve(__dirname, "..", "..");

function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/** Arquivos de componente, para as varreduras de fonte. */
function arquivosDeComponente(): string[] {
  const achados: string[] = [];
  const anda = (dir: string) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const alvo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) anda(alvo);
      else if (entrada.name.endsWith(".tsx")) achados.push(alvo);
    }
  };
  anda(path.join(SRC, "components"));
  return achados;
}

/**
 * `/busca` é a tela de resultado da busca global do Header — chega-se a ela pelo
 * Ctrl/Cmd+K, não pelo menu, e por isso ela legitimamente não acende item nenhum.
 * Exceção DECLARADA: sem esta lista, "toda rota acende alguma coisa" seria falso,
 * e um teste que se acomoda a uma rota órfã se acomoda à próxima também.
 */
const SEM_ITEM_NO_MENU = new Set(["/busca"]);

describe("hrefAtivo — a regra", () => {
  it("as rotas saem mesmo do disco (guarda anti-tautologia)", () => {
    // Sem isto, tudo abaixo poderia estar passando sobre uma lista vazia.
    expect(ROTAS.length).toBeGreaterThan(50);
    expect(ROTAS).toContain("/dashboard/financeiro");
    expect(navHrefs.length).toBeGreaterThan(15);
  });

  it("devolve o href mais fundo, não o primeiro que casa", () => {
    expect(hrefAtivo("/dashboard/financeiro", ["/dashboard", "/dashboard/financeiro"])).toBe(
      "/dashboard/financeiro",
    );
    // A ordem da lista não pode decidir nada.
    expect(hrefAtivo("/dashboard/financeiro", ["/dashboard/financeiro", "/dashboard"])).toBe(
      "/dashboard/financeiro",
    );
  });

  it("só casa em fronteira de segmento — `/financeiro` não é `/financeiros`", () => {
    expect(hrefAtivo("/financeiros", ["/financeiro"])).toBeNull();
    expect(hrefAtivo("/todos", ["/todo"])).toBeNull();
    expect(hrefAtivo("/financeiro/contas", ["/financeiro"])).toBe("/financeiro");
  });

  it("rota fora do menu devolve null, nunca um palpite", () => {
    expect(hrefAtivo("/busca", navHrefs)).toBeNull();
    expect(hrefAtivo("/qualquer-coisa", navHrefs)).toBeNull();
  });

  it("a rota-índice vence sozinha, sem exceção escrita à mão", () => {
    const secoes = ["/nutricao", "/nutricao/diario", "/nutricao/compras"];
    expect(hrefAtivo("/nutricao", secoes)).toBe("/nutricao");
    expect(hrefAtivo("/nutricao/diario", secoes)).toBe("/nutricao/diario");
    // Sub-rota não listada cai na seção que a contém — e não em duas.
    expect(hrefAtivo("/nutricao/diario/2026-09-20", secoes)).toBe("/nutricao/diario");
  });

  it("um alvo pode representar outras rotas, e continua vencendo UM", () => {
    const alvos = [{ href: "/a" }, { href: "/b", tambem: ["/a/x"] }];
    expect(hrefAtivo("/a/x/y", alvos)).toBe("/b");
    expect(hrefAtivo("/a/z", alvos)).toBe("/a");
    expect(hrefAtivo("/b", alvos)).toBe("/b");
    // A ordem da lista não decide.
    expect(hrefAtivo("/a/x/y", [...alvos].reverse())).toBe("/b");
    // String pura continua como antes.
    expect(hrefAtivo("/a/x", ["/a", "/a/x"])).toBe("/a/x");
  });
});

describe("a sidebar sobre as rotas reais", () => {
  it("o defeito era real: há rota onde DOIS itens do menu casam", () => {
    // Esta é a situação que o código antigo pintava como dois itens acesos.
    // Se um dia ela deixar de existir, este teste avisa em vez de ficar verde à toa.
    const comMaisDeUm = ROTAS.filter(
      (rota) =>
        navHrefs.filter((href) => rota === href || rota.startsWith(`${href}/`)).length > 1,
    );
    expect(comMaisDeUm).toContain("/dashboard/financeiro");
  });

  it("nenhuma rota real acende mais de um item", () => {
    for (const rota of ROTAS) {
      const acesos = allNavItems.filter((item) => item.href === hrefAtivo(rota, allNavItems));
      expect(acesos.length, `rota ${rota}`).toBeLessThanOrEqual(1);
    }
  });

  it("nenhuma rota real é reivindicada por dois itens na mesma profundidade", () => {
    // O desempate da função esconderia um dos dois; numa decisão item a item, os dois acenderiam.
    for (const rota of ROTAS) {
      const profundidade = (item: (typeof allNavItems)[number]) =>
        Math.max(-1, ...rotasDeclaradas(item).filter((r) => rota === r || rota.startsWith(`${r}/`)).map((r) => r.length));
      const melhor = Math.max(...allNavItems.map(profundidade));
      if (melhor < 0) continue;
      const empatados = allNavItems.filter((item) => profundidade(item) === melhor).map((i) => i.title);
      expect(empatados, `rota ${rota}`).toHaveLength(1);
    }
  });

  it("toda rota real acende um item, salvo as declaradas", () => {
    const orfas = ROTAS.filter((rota) => hrefAtivo(rota, allNavItems) === null);
    expect(new Set(orfas)).toEqual(SEM_ITEM_NO_MENU);
  });

  it("a rota declarada que acendeu o item é ancestral-ou-igual da rota aberta", () => {
    // Com `tambem`, o href do item (/rotinas) não é ancestral de /tarefas — a afirmação
    // antiga seria falsa, não mais fraca. O que continua valendo: alguma rota DELE cobre esta.
    for (const rota of ROTAS) {
      const ativo = allNavItems.find((i) => i.href === hrefAtivo(rota, allNavItems));
      if (!ativo) continue;
      expect(rotasDeclaradas(ativo).some((r) => rota === r || rota.startsWith(`${r}/`)), `rota ${rota}`).toBe(true);
    }
  });

  it("findNavItem responde o mesmo que a tela pinta", () => {
    for (const rota of ROTAS) {
      expect(findNavItem(rota)?.href ?? null, `rota ${rota}`).toBe(hrefAtivo(rota, allNavItems));
    }
  });

  it("Rotinas e tarefas: as duas telas acendem o mesmo item; o TO-DO segue separado", () => {
    expect(findNavItem("/rotinas")?.title).toBe("Rotinas e tarefas");
    expect(findNavItem("/tarefas")?.title).toBe("Rotinas e tarefas");
    expect(findNavItem("/todo")?.title).toBe("TO-DO");
  });
});

describe("a decisão continua sendo uma só", () => {
  it("nenhum componente escreve a regra de prefixo por conta própria", () => {
    const reincidentes: string[] = [];
    for (const arquivo of arquivosDeComponente()) {
      const codigo = semComentarios(fs.readFileSync(arquivo, "utf8"));
      // Era esta a linha, repetida em cinco telas com cinco redações.
      if (/pathname\s*\.\s*startsWith\s*\(/.test(codigo)) {
        reincidentes.push(path.relative(SRC, arquivo));
      }
    }
    expect(reincidentes).toEqual([]);
  });

  it("toda tela que lê a rota para pintar navegação usa a regra única", () => {
    const semARegra: string[] = [];
    for (const arquivo of arquivosDeComponente()) {
      const codigo = semComentarios(fs.readFileSync(arquivo, "utf8"));
      // Quem chama `usePathname` e pinta um estado "ativo" está decidindo
      // navegação; quem só empurra a URL (filtros) não aparece aqui.
      const decideNavegacao =
        /usePathname\s*\(/.test(codigo) && /\bativo\b|\bactive\b/.test(codigo);
      if (decideNavegacao && !/from\s+"@\/lib\/nav\/active"/.test(codigo)) {
        semARegra.push(path.relative(SRC, arquivo));
      }
    }
    expect(semARegra).toEqual([]);
  });
});

describe("pular para o conteúdo", () => {
  it("a casca do app tem o link e o alvo focável", () => {
    const casca = fs.readFileSync(
      path.join(SRC, "components", "layout", "app-shell.tsx"),
      "utf8",
    );
    const semNotas = semComentarios(casca);
    expect(semNotas).toMatch(/href="#conteudo"/);
    expect(semNotas).toMatch(/id="conteudo"/);
    // Sem `tabIndex={-1}` no alvo, o link rola a página e NÃO move o foco:
    // o Tab seguinte voltaria para o topo e o atalho não serviria para nada.
    expect(semNotas).toMatch(/id="conteudo"[\s\S]{0,80}tabIndex=\{-1\}/);
    // E ele precisa vir antes da sidebar, senão não é o primeiro a receber foco.
    expect(semNotas.indexOf('href="#conteudo"')).toBeLessThan(semNotas.indexOf("<Sidebar"));
  });
});
