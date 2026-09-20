/**
 * REDESIGN-02-D · risco R4 — TODA ROTA MONTADA À MÃO TAMBÉM ABRE UMA TELA.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE A 02-D DEIXOU DE FORA.                                                          ║
 * ║                                                                                       ║
 * ║ Os módulos que têm um ARQUIVO DE LINKS (`search/ai-links.ts`,                          ║
 * ║ `search/nutrition-links.ts`, `search/training-links.ts`) já estão cobertos: são        ║
 * ║ funções puras, e o teste de cada um chama `temPagina` sobre o que elas devolvem.       ║
 * ║                                                                                       ║
 * ║ O que ficou descoberto é a rota escrita INLINE, no meio de uma função de I/O que       ║
 * ║ nenhum teste consegue chamar sem banco — `searchAll` monta `/faturas?card=…` dentro    ║
 * ║ de um `.then()` sobre o Supabase, e `generateNotifications` monta                      ║
 * ║ `/financeiro/contas-fixas` dentro de um laço. Não há função pura para chamar, então    ║
 * ║ não havia nada a afirmar.                                                              ║
 * ║                                                                                       ║
 * ║ Esses links vão para o SINO e para a BUSCA GLOBAL. Uma rota que some ou muda de nome   ║
 * ║ — e as fases REDESIGN-04 e 07 vão mexer exatamente nesses módulos — vira 404 na        ║
 * ║ notificação do dono, em produção, em silêncio: ninguém clica numa notificação de       ║
 * ║ fatura durante o desenvolvimento do redesign da tela de treinos.                       ║
 * ║                                                                                       ║
 * ║ Como não dá para CHAMAR o código, este teste LÊ o código. É o idioma do projeto para   ║
 * ║ contrato que o `tsc` não pega — `chat-events.test.ts` (evento SSE novo exige `case`    ║
 * ║ na tela), `boundaries.test.ts`, `painel-persistencia.test.ts`, `nav.test.ts`.          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ POR QUE ESTE ARQUIVO MORA EM `src/test/` E NÃO JUNTO DE UM DOMÍNIO.
 *
 * O idioma do projeto é co-locar o teste com o domínio, e eu o estou quebrando de
 * propósito. O sujeito deste teste não é `search/` nem `notifications/`: é o CONJUNTO
 * dos arquivos que cunham rota inline, e hoje ele atravessa os dois. Pendurá-lo em
 * `search/` deixaria a cobertura de `notifications/` invisível para quem abre
 * `notifications/` — e vice-versa —, que é exatamente como nasce a terceira cópia de uma
 * regra. Ele fica ao lado de `rotas.ts`, que é a resolução que ele consome, e a lista
 * `VARRIDOS` abaixo é a única coisa que precisa crescer quando um quarto arquivo passar a
 * montar rota à mão.
 *
 * ⛔ A LISTA DE ROTAS ESPERADAS NÃO É ESCRITA À MÃO. Ela é DERIVADA do código-fonte. Uma
 * lista à mão fica para trás no primeiro link novo — que é precisamente o defeito que o
 * R4 nomeia, e não adiantaria nada trocá-lo por uma segunda cópia de si mesmo.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { temPagina } from "@/test/rotas";

const SRC = path.resolve(__dirname, "..");

/**
 * Os arquivos que montam rota inline, com o PISO de literais que cada um tinha quando
 * este teste nasceu (contados pela própria varredura, no commit que a introduz).
 *
 * O piso é o que impede o teste de passar afirmando `[] === []`: um extrator que deixa de
 * casar com qualquer coisa — regex quebrada, `link:` que virou outra chave, caminho de
 * arquivo errado — não tem como ficar verde. É piso e não igualdade porque link novo é
 * bem-vindo; o que não pode é link DESAPARECER da varredura sem desaparecer do código.
 */
const VARRIDOS = [
  { arquivo: "lib/search/queries.ts", piso: 15 },
  { arquivo: "lib/notifications/generate.ts", piso: 13 },
  { arquivo: "lib/notifications/nutrition.ts", piso: 1 },
] as const;

/** O que ocupa um `${…}` para a rota ficar concreta. Um segmento dinâmico casa com um. */
const VALOR_DE_EXEMPLO = "abc123";

/**
 * O maior número de rotas que UM `link:` pode render. O caso mais largo do código é o
 * ternário (`r.projectId ? \`/todo?v=projeto…\` : \`/todo?v=todas…\``), que dá dois.
 *
 * Isto é a trava anti-desgoverno do leitor de expressão: se o controle de aninhamento
 * quebrar, ele não para na vírgula e engole o resto do arquivo — e aí TODO `link:`
 * relataria todas as rotas do módulo. O piso continuaria verde (sobrando), os links
 * inventados continuariam `false`, e a varredura estaria medindo lixo. Um teto derivado
 * da forma real do código transforma isso em vermelho.
 */
const MAXIMO_POR_LINK = 2;

/**
 * A varredura olha CÓDIGO, não prosa: sem isto, um `link: "/rota-que-morreu"` citado
 * dentro de um comentário explicativo entraria na conta e o teste cobraria uma rota que
 * ninguém mais abre — ou pior, passaria a aprovar o comentário em vez do código.
 *
 * Cada comentário vira espaço do MESMO tamanho, e não uma string vazia, para que os
 * deslocamentos não andem: é assim que a linha relatada no erro é a linha de verdade.
 *
 * ⚠️ Esta limpeza não conhece string: um `"https://…"` dentro de um literal seria
 * mutilado pelo `//`. Hoje nenhum dos três arquivos tem `://` — e o primeiro teste abaixo
 * afirma isso, para que o dia em que isso mudar seja um vermelho e não um silêncio.
 */
function semComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

/** Índice da aspa que FECHA o literal aberto em `i` (crase entende `${…}`). */
function fimDoLiteral(fonte: string, i: number): number {
  const aspa = fonte[i];
  for (let j = i + 1; j < fonte.length; j++) {
    const c = fonte[j];
    if (c === "\\") {
      j++;
      continue;
    }
    if (aspa === "`" && c === "$" && fonte[j + 1] === "{") {
      j = fimDaInterpolacao(fonte, j + 2);
      continue;
    }
    if (c === aspa) return j;
  }
  return fonte.length;
}

/** Índice da chave que FECHA a interpolação aberta em `i` (já depois do `${`). */
function fimDaInterpolacao(fonte: string, i: number): number {
  let profundidade = 0;
  for (let j = i; j < fonte.length; j++) {
    const c = fonte[j];
    if (c === '"' || c === "'" || c === "`") {
      j = fimDoLiteral(fonte, j);
      continue;
    }
    if (c === "{") profundidade++;
    else if (c === "}") {
      if (profundidade === 0) return j;
      profundidade--;
    }
  }
  return fonte.length;
}

/**
 * A expressão atribuída ao `link:` que começa em `i` (logo depois dos dois pontos).
 *
 * Para na vírgula que fecha a propriedade, ou no fecha-chaves do objeto quando o `link:`
 * é a última. Respeita aspas e aninhamento — senão o `}` de um `${…}` encerraria a
 * leitura no meio do próprio link, e o ternário de três linhas perderia a segunda ponta.
 */
function expressaoDoLink(fonte: string, i: number): string {
  let profundidade = 0;
  let j = i;
  for (; j < fonte.length; j++) {
    const c = fonte[j];
    if (c === '"' || c === "'" || c === "`") {
      j = fimDoLiteral(fonte, j);
      continue;
    }
    if (c === "(" || c === "[" || c === "{") profundidade++;
    else if (c === ")" || c === "]" || c === "}") {
      if (profundidade === 0) break;
      profundidade--;
    } else if (c === "," && profundidade === 0) break;
  }
  return fonte.slice(i, j);
}

/**
 * Todo literal da expressão que comece por `/` — string ou template.
 *
 * O que NÃO começa por `/` fica de fora de propósito: `link: foodLink(f.id)` é rota
 * montada pela fonte única do módulo, e a 02-D já a cobre pelo teste daquele arquivo;
 * `link: string | null` é declaração de tipo. Repescá-los aqui seria conferir duas vezes
 * o que já tem dono, e deixar de conferir continua sendo o defeito que este teste fecha.
 */
function rotasDaExpressao(expressao: string): string[] {
  const achadas: string[] = [];
  for (let j = 0; j < expressao.length; j++) {
    const c = expressao[j];
    if (c !== '"' && c !== "'" && c !== "`") continue;
    const fim = fimDoLiteral(expressao, j);
    const conteudo = expressao.slice(j + 1, fim);
    if (conteudo.startsWith("/")) achadas.push(conteudo);
    j = fim;
  }
  return achadas;
}

type PontoDeLink = {
  arquivo: string;
  linha: number;
  /** Como está escrito no código, com `${…}` preservado — é o que o erro precisa mostrar. */
  literal: string;
  /** Pronto para `temPagina`, com cada `${…}` trocado por um valor. */
  concreta: string;
};

/** Toda rota inline do texto, com o arquivo e a linha de onde saiu. */
function pontosDeLink(arquivo: string, fonte: string): PontoDeLink[] {
  const pontos: PontoDeLink[] = [];
  for (const m of fonte.matchAll(/\blink\s*:/g)) {
    const inicio = m.index + m[0].length;
    const linha = fonte.slice(0, m.index).split("\n").length;
    for (const literal of rotasDaExpressao(expressaoDoLink(fonte, inicio))) {
      pontos.push({
        arquivo,
        linha,
        literal,
        // Interpolação não aninha em nenhum destes links; o `[^}]` basta e diz isso.
        concreta: literal.replace(/\$\{[^}]*\}/g, VALOR_DE_EXEMPLO),
      });
    }
  }
  return pontos;
}

const LIDOS = VARRIDOS.map((alvo) => {
  const bruto = fs.readFileSync(path.join(SRC, alvo.arquivo), "utf8");
  const fonte = semComentarios(bruto);
  return { ...alvo, bruto, fonte, pontos: pontosDeLink(alvo.arquivo, fonte) };
});

const TODOS = LIDOS.flatMap((a) => a.pontos);

describe("R4 — os deep-links montados à mão abrem telas que existem", () => {
  it.each(LIDOS)(
    "$arquivo foi lido de verdade, e sobrou código depois de tirar os comentários",
    ({ arquivo, bruto, fonte }) => {
      // Sem esta afirmação, um caminho errado devolveria zero ponto e todo `toBe(true)`
      // abaixo viraria tautologia sobre uma lista vazia.
      expect(bruto.length, `${arquivo} está vazio`).toBeGreaterThan(0);
      expect(fonte, `${arquivo} não tem \`link:\` — o alvo mudou de forma`).toMatch(
        /\blink\s*:/,
      );
      // A pré-condição de `semComentarios`: ela não conhece string, então um `//` dentro
      // de um literal a faria comer o resto da linha — e o link sumiria da varredura sem
      // sumir do código, que é o silêncio exato que este teste existe para impedir.
      expect(
        bruto,
        `${arquivo} passou a ter \`://\` — a limpeza de comentários deixou de ser segura aqui`,
      ).not.toContain("://");
    },
  );

  it.each(LIDOS)("$arquivo continua cunhando ao menos $piso rotas inline", ({ arquivo, piso, pontos }) => {
    // O piso é o que faz este teste saber dizer não. Ver o comentário de `VARRIDOS`.
    expect(
      pontos.length,
      `a varredura achou ${pontos.length} rota(s) em ${arquivo}, e esperava ao menos ${piso} — ` +
        `ou o extrator parou de casar, ou links foram removidos sem atualizar o piso`,
    ).toBeGreaterThanOrEqual(piso);
  });

  it("nenhum `link:` rende mais rotas do que um ternário renderia", () => {
    // Trava anti-desgoverno do leitor de expressão. Ver o comentário de `MAXIMO_POR_LINK`.
    const porLink = new Map<string, number>();
    for (const p of TODOS) {
      const chave = `${p.arquivo}:${p.linha}`;
      porLink.set(chave, (porLink.get(chave) ?? 0) + 1);
    }
    const largos = [...porLink].filter(([, n]) => n > MAXIMO_POR_LINK);
    expect(
      largos,
      "um `link:` rendeu rotas demais — provavelmente a leitura da expressão não parou na vírgula",
    ).toEqual([]);
  });

  it("a varredura enxerga as duas formas que o código usa: string e template", () => {
    // Sem isto, quebrar só o ramo da crase deixaria o piso passar raspando em algum
    // arquivo e a cobertura dos links com `${…}` — os que carregam id — sumiria calada.
    expect(
      TODOS.some((p) => !p.literal.includes("${")),
      "nenhuma rota em string simples foi encontrada",
    ).toBe(true);
    expect(
      TODOS.some((p) => p.literal.includes("${")),
      "nenhuma rota em template com `${…}` foi encontrada",
    ).toBe(true);
  });

  it.each(TODOS)("$arquivo:$linha → $literal tem página no disco", ({ concreta, literal, arquivo, linha }) => {
    expect(
      temPagina(concreta),
      `${arquivo}:${linha} aponta para \`${literal}\`, e não há page.tsx que atenda \`${concreta}\``,
    ).toBe(true);
  });

  it("`temPagina` continua sabendo recusar — senão o teste acima não afirma nada", () => {
    // Um `temPagina` que devolve `true` para tudo aprovaria qualquer coisa que a varredura
    // encontrasse, inclusive uma rota que o redesign apagou.
    expect(temPagina("/cartoes-que-nao-existe")).toBe(false);
    // Erro de UMA letra num link real, que é a forma que o redesign vai produzir.
    expect(temPagina("/financeiro/contas-fixa")).toBe(false);
    /*
      ⚠️ `/financeiro` NÃO serve de controle negativo, por mais que pareça: ele é página
      de verdade (`src/app/(app)/financeiro/page.tsx`). Neste projeto todo segmento-pai é
      uma tela — `/dashboard`, `/nutricao`, `/treinos`, `/ia` também —, então truncar um
      deep-link cai numa rota que existe e `temPagina` responde `true` com razão. A ponta
      que sobra para afirmar é a oposta: o link que GANHA um segmento.
    */
    expect(temPagina("/faturas")).toBe(true);
    expect(temPagina(`/faturas/${VALOR_DE_EXEMPLO}`)).toBe(false);
    // E o dinâmico casa com UM segmento, nunca com vários.
    expect(temPagina(`/estudos/${VALOR_DE_EXEMPLO}`)).toBe(true);
    expect(temPagina(`/estudos/${VALOR_DE_EXEMPLO}/mais`)).toBe(false);
  });
});

/**
 * O extrator provado contra texto conhecido, sem depender dos arquivos reais.
 *
 * As afirmações de cima medem o código de produção; estas medem o instrumento. Sem elas,
 * um extrator que passasse a ignorar a crase continuaria verde enquanto os arquivos
 * tivessem string simples de sobra para cumprir o piso — e a cobertura que importa (a
 * rota com id dentro) teria evaporado sem um vermelho.
 */
const FIXTURE = [
  'const a = { link: "/cartoes", entity_type: "card" };',
  "const b = { link: `/estudos/${c.id}` };",
  "const c = { link: p.id ? `/todo?v=projeto&id=${p.id}` : `/todo?v=todas`, y: 2 };",
  "const d = { link: foodLink(f.id) };",
  "type E = { link: string | null };",
  'const f = { titulo: "/nao-e-um-link", deepLink: "/tambem-nao" };',
  'const g = { link: "/ultima-propriedade-sem-virgula" };',
].join("\n");

describe("R4 — o extrator, medido contra texto conhecido", () => {
  const achadas = pontosDeLink("fixture.ts", FIXTURE).map((p) => p.literal);

  it("acha string, template e as DUAS pontas de um ternário", () => {
    expect(achadas).toEqual([
      "/cartoes",
      "/estudos/${c.id}",
      "/todo?v=projeto&id=${p.id}",
      "/todo?v=todas",
      "/ultima-propriedade-sem-virgula",
    ]);
  });

  it("ignora o que tem outro dono e o que não é link", () => {
    // `foodLink(...)` é a fonte única do módulo, coberta pelo teste dela; `string | null`
    // é tipo; `titulo` e `deepLink` não são a chave `link`.
    expect(achadas.join(" ")).not.toContain("foodLink");
    expect(achadas).not.toContain("/nao-e-um-link");
    expect(achadas).not.toContain("/tambem-nao");
  });

  it("troca cada `${…}` por um segmento concreto", () => {
    const concretas = pontosDeLink("fixture.ts", FIXTURE).map((p) => p.concreta);
    expect(concretas).toContain(`/estudos/${VALOR_DE_EXEMPLO}`);
    expect(concretas).toContain(`/todo?v=projeto&id=${VALOR_DE_EXEMPLO}`);
  });

  it("não lê além da propriedade", () => {
    // O `link:` do fixture `c` é seguido de `y: 2` e, depois, de outras linhas com rotas.
    // Se a leitura da expressão não parasse na vírgula, este `link:` sozinho traria o
    // arquivo inteiro — é a mesma falha que `MAXIMO_POR_LINK` vigia no código real.
    const doTernario = pontosDeLink("fixture.ts", FIXTURE).filter((p) => p.linha === 3);
    expect(doTernario).toHaveLength(2);
  });
});
