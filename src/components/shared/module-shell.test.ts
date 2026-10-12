/**
 * REDESIGN-02-E — a navegação interna de módulo é UMA.
 *
 * O projeto não tem infraestrutura de teste de componente (`environment: "node"`, zero
 * `.test.tsx` — invariante 25 da 18-B). Então o contrato entre os módulos e a casca é
 * verificado das duas maneiras que sobram, e as duas são honestas:
 *
 *  - por VARREDURA DO CÓDIGO-FONTE, como `chat-events.test.ts` e `boundaries.test.ts`:
 *    nenhum módulo pode voltar a decidir sozinho o que é item ativo, o que é coluna e o
 *    que é gaveta;
 *  - pelos DADOS que os módulos declaram, que são importáveis aqui porque são objetos
 *    puros: toda seção entra na coluna, nenhuma rota se repete e todas existem no disco.
 *
 * ⚠️ Um teste de varredura que não casa com nada passa afirmando `[] === []`. Por isso
 * cada sonda é conferida CONTRA A CASCA — se o padrão não aparecer nem lá, é a sonda que
 * está quebrada, não o módulo que está limpo.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { temPagina } from "@/test/rotas";
import { NAV_DA_DIETA } from "@/components/nutrition/nutrition-nav";
import { NAV_DE_TREINOS } from "@/components/training/training-nav";
import { NAV_DA_IA } from "@/components/ai/ai-nav";
import type { NavegacaoDeModulo } from "@/components/shared/module-shell";
import { NUTRITION_SECTIONS } from "@/lib/nutrition/constants";
import { TRAINING_SECTIONS } from "@/lib/training/constants";
import { AI_SECTIONS } from "@/lib/ai/constants";

const COMPONENTES = path.resolve(__dirname, "..");

function fonte(relativo: string): string {
  return fs.readFileSync(path.join(COMPONENTES, relativo), "utf8");
}

const CASCA = fonte("shared/module-shell.tsx");

/** Os arquivos que ANTES decidiam isso sozinhos, cada um do seu jeito. */
const ARQUIVOS_DE_MODULO = [
  "nutrition/nutrition-nav.tsx",
  "nutrition/nutrition-shell.tsx",
  "training/training-nav.tsx",
  "training/training-shell.tsx",
  "ai/ai-nav.tsx",
  "ai/ai-shell.tsx",
] as const;

/**
 * As decisões de navegação, escritas como aparecem no código. Nenhuma pode viver num
 * arquivo de módulo; todas têm de viver na casca.
 */
const DECISOES = [
  ["o item ativo", "hrefAtivo("],
  ["a rota atual", "usePathname()"],
  ["a coluna do desktop", "<aside"],
  ["a gaveta do celular", "SheetContent"],
  ["o estado da gaveta", "React.useState"],
] as const;

const NAVS: { nome: string; nav: NavegacaoDeModulo }[] = [
  { nome: "Dieta", nav: NAV_DA_DIETA },
  { nome: "Treinos", nav: NAV_DE_TREINOS },
  { nome: "IA", nav: NAV_DA_IA },
];

function itensDe(nav: NavegacaoDeModulo) {
  return nav.grupos.flatMap((grupo) => grupo.itens);
}

describe("a varredura sabe dizer não", () => {
  it("cada sonda existe na casca — senão ela não estaria provando nada", () => {
    for (const [oQue, sonda] of DECISOES) {
      expect(CASCA, `a casca deveria ser quem decide ${oQue}`).toContain(sonda);
    }
  });

  it("os seis arquivos de módulo foram mesmo lidos", () => {
    for (const arquivo of ARQUIVOS_DE_MODULO) {
      expect(fonte(arquivo).length, arquivo).toBeGreaterThan(300);
    }
  });
});

describe("nenhum módulo decide navegação por conta própria", () => {
  it.each(ARQUIVOS_DE_MODULO)("%s não repete nenhuma das decisões", (arquivo) => {
    const texto = fonte(arquivo);
    for (const [oQue, sonda] of DECISOES) {
      expect(texto, `${arquivo} voltou a decidir ${oQue}`).not.toContain(sonda);
    }
  });

  it.each(ARQUIVOS_DE_MODULO)("%s consome a casca compartilhada", (arquivo) => {
    expect(fonte(arquivo)).toContain("@/components/shared/module-shell");
  });
});

describe("o que a IA não tinha e a casca passou a garantir", () => {
  // Estes dois eram o defeito VIVO da 02-E: em `/ia`, quem usa leitor de tela não recebia
  // "você está aqui", e o landmark de navegação do módulo não tinha nome.
  it("todo item ativo é anunciado com aria-current", () => {
    expect(CASCA).toContain('aria-current={ativo ? "page" : undefined}');
  });

  it("o landmark de navegação é nomeado pelo módulo", () => {
    expect(CASCA).toContain("aria-label={`Seções de ${nav.nome}`}");
  });

  it("a decisão de item ativo é tomada UMA vez, sobre a lista inteira", () => {
    // Um segundo ponto de chamada é como nasce um módulo com regra própria de item ativo
    // — foi exatamente o que a 02-C desfez.
    expect(CASCA.split("hrefAtivo(").length - 1).toBe(1);
    expect(CASCA).toContain("hrefAtivo(pathname, todosOsHrefs(nav))");
  });
});

describe("toda seção declarada entra na coluna", () => {
  // Um slug que exista nas constantes e não apareça em nenhum grupo some da navegação E
  // deixa de participar da decisão de item ativo — sem nada na tela denunciando.
  it.each([
    ["Dieta", NAV_DA_DIETA, NUTRITION_SECTIONS.map((s) => s.href)],
    ["Treinos", NAV_DE_TREINOS, TRAINING_SECTIONS.map((s) => s.href)],
    ["IA", NAV_DA_IA, AI_SECTIONS.map((s) => s.href)],
  ] as const)("%s leva todas as seções para a coluna", (_nome, nav, declaradas) => {
    const naColuna = itensDe(nav).map((item) => item.href);
    expect([...naColuna].sort()).toEqual([...declaradas].sort());
  });

  it.each(NAVS)("$nome não coloca dois itens na mesma rota", ({ nav }) => {
    const hrefs = itensDe(nav).map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it.each(NAVS)("$nome nomeia o módulo e dá título a todo item", ({ nav }) => {
    expect(nav.nome.length).toBeGreaterThan(2);
    for (const item of itensDe(nav)) {
      expect(item.title.trim(), item.href).not.toBe("");
      expect(item.href.startsWith("/"), item.href).toBe(true);
      expect(item.href).not.toContain("http");
    }
  });
});

describe("toda seção de módulo abre uma tela que existe", () => {
  const TODOS = NAVS.flatMap(({ nome, nav }) =>
    itensDe(nav).map((item) => [nome, item.href] as const),
  );

  it("há seção suficiente para a varredura significar alguma coisa", () => {
    // 12 da Dieta + 13 de Treinos + 8 da IA. O piso é o que impede este bloco de passar
    // verde sobre uma lista vazia.
    expect(TODOS.length).toBeGreaterThanOrEqual(33);
  });

  it.each(TODOS)("%s → %s", (_modulo, href) => {
    expect(temPagina(href)).toBe(true);
  });

  it("e uma rota inventada continua não existindo", () => {
    expect(temPagina("/nutricao/nao-existe")).toBe(false);
    expect(temPagina("/treinos/medidas")).toBe(false);
  });
});

describe("o badge que a 02-E não trouxe", () => {
  /**
   * As cópias antigas desenhavam "Em breve"/"Planejado" para seções ainda não entregues.
   * Nenhuma seção está nesse estado desde que as fases 16 e 17 fecharam, e um ramo que
   * dado nenhum alcança não foi copiado para dentro da casca compartilhada.
   *
   * ⛔ Se este teste ficar vermelho, a navegação perdeu o aviso que anunciava isso: ou a
   * seção nova volta a ser `pronto`, ou o badge volta — para a CASCA, uma vez só.
   */
  it("nenhuma seção de Dieta ou Treinos está pendente", () => {
    for (const section of [...NUTRITION_SECTIONS, ...TRAINING_SECTIONS]) {
      expect(section.status, `${section.slug} deixou de estar pronto`).toBe("pronto");
    }
  });
});
