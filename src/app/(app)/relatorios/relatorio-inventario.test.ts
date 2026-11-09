import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/links-inline";

/**
 * REDESIGN-04-A2 · T9 — INVENTÁRIO da aba Financeiro de `/relatorios`: nenhum bloco de hoje (spec §2,
 * 15 itens) sumiu, e a aba fala a língua das peças da 04-A.
 *
 * Varredura de FONTE sem comentários (o projeto não tem teste de componente): a explicação de uma
 * regra não pode satisfazer a própria varredura. Cada item do §2 tem o marcador dele ou o do
 * SUBSTITUTO declarado em "Antes → depois" (§4). Componente é conferido pelo USO (`<Componente`),
 * não pelo import: o import sozinho continuaria satisfazendo a varredura depois de o bloco sair.
 *
 * A aba é a função `AbaFinanceiro` do cliente: as outras abas (Cartões, Hábitos, Estudos, Tarefas)
 * seguem usando `StatCard` e ficam FORA do recorte que este teste lê.
 */

const pasta = join(process.cwd(), "src", "app", "(app)", "relatorios");
/** Fonte sem comentários e com fim de linha LF (o `Edit` pode gravar CRLF, e a varredura não deve notar). */
const ler = (caminho: string) => semComentarios(readFileSync(caminho, "utf8").replaceAll("\r\n", "\n"));
const CLIENTE = ler(join(pasta, "relatorios-client.tsx"));
const PAGINA = ler(join(pasta, "page.tsx"));

/** A função `AbaFinanceiro`, do `function` até o `}` de coluna 0 que a fecha. */
const ABA = (() => {
  const inicio = CLIENTE.indexOf("function AbaFinanceiro");
  expect(inicio, "function AbaFinanceiro").toBeGreaterThanOrEqual(0);
  const fim = CLIENTE.indexOf("\n}\n", inicio);
  expect(fim, "fim de AbaFinanceiro").toBeGreaterThan(inicio);
  return CLIENTE.slice(inicio, fim);
})();

/** O texto de cada tag de abertura `<Nome …>` (entende `{…}` e aspas; `=>` não fecha a tag). */
function tagsDe(fonte: string, nome: string): string[] {
  const achadas: string[] = [];
  const re = new RegExp(`<${nome}(?![\\w.])`, "g");
  for (let m = re.exec(fonte); m !== null; m = re.exec(fonte)) {
    let profundidade = 0;
    let aspa: string | null = null;
    let i = m.index;
    for (; i < fonte.length; i++) {
      const c = fonte[i];
      if (aspa !== null) {
        if (c === "\\") i++;
        else if (c === aspa) aspa = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") aspa = c;
      else if (c === "{") profundidade++;
      else if (c === "}") profundidade--;
      else if (c === ">" && profundidade === 0 && fonte[i - 1] !== "=") break;
    }
    achadas.push(fonte.slice(m.index, i + 1));
  }
  return achadas;
}

/* ─────────────────────── Os 15 itens do §2, com o destino do §4 ─────────────────────── */

/** [nº no §2 · bloco, marcadores que TODOS precisam estar na aba]. */
const ITENS: readonly (readonly [string, readonly string[]])[] = [
  ["1 · mês + seletor de base (→ barra de filtros)", ["<BarraDeFiltros"]],
  ["2 · Saldo atual (→ indicador Saldo das contas)", ["financeiro.saldo", "<BotaoDoOlho"]],
  ["3 · Entradas (→ indicador, por responsabilidade)", ["indicadores.entradas"]],
  ["4 · Saídas (→ indicador, por responsabilidade)", ["indicadores.saidas"]],
  ["5 · Pendente referente ao mês (→ quarto indicador e card meu × bruto × terceiros)", [
    "indicadores.quarto",
    "rotuloPendenteDoMes(",
  ]],
  ["6 · Bloco do caixa", ["<BlocoDoCaixa"]],
  ["7 · Gastos por categoria (→ rosca)", ["<RoscaCategoriasChart"]],
  ["8 · Forma de pagamento", ["<FormaPagamentoChart"]],
  ["9 · Evolução (→ barras entradas × saídas)", ["<BarrasEntradasSaidasChart"]],
  ["10 · Meu mês a mês", ["<MesAMesChart"]],
  ["11 · Projeção", ["<ProjecaoChart"]],
  ["12 · Faturas dos próximos meses", ["<FaturasChart"]],
  ["13 · Maiores gastos por categoria", ["Maiores gastos por categoria"]],
  ["14 · Assinaturas e recorrências", ["Assinaturas"]],
  ["15 · exportar CSV de categorias", ["downloadCsv(", "Exportar gastos por categoria (CSV)"]],
];

describe("inventário da aba Financeiro — nenhum item do §2 sumiu", () => {
  it.each(ITENS)("%s", (_nome, marcadores) => {
    for (const m of marcadores) expect(ABA, m).toContain(m);
  });

  it("o gabarito cobre os 15 itens do §2 (cada número de 1 a 15 aparece)", () => {
    const numeros = new Set(ITENS.map(([nome]) => /^(\d+) ·/.exec(nome)?.[1]));
    for (let n = 1; n <= 15; n++) expect(numeros.has(String(n)), `item ${n}`).toBe(true);
  });

  it("o fim do contrato: o CSV usa a lista `maiores` do modelo, e o JSON da página continua no cliente", () => {
    expect(ABA).toContain("financeiro.maiores");
    expect(CLIENTE).toContain("Baixar relatório (JSON)");
  });
});

/* ─────────────────────── A sequência: Resumo → … → Projeções (§4) ─────────────────────── */

const SECOES = ["Resumo", "Evolução", "Composição", "Detalhamento", "Projeções"] as const;

describe("a sequência da aba (§4)", () => {
  const titulos = [...ABA.matchAll(/<h2[^>]*>\s*([^<]+?)\s*<\/h2>/g)].map((m) => ({
    nome: m[1],
    indice: m.index ?? -1,
  }));

  it("as cinco seções são <h2>, nesta ordem", () => {
    expect(titulos.map((t) => t.nome)).toEqual([...SECOES]);
    for (let i = 1; i < titulos.length; i++) {
      expect(titulos[i].indice, SECOES[i]).toBeGreaterThan(titulos[i - 1].indice);
    }
  });

  it("filtros e aviso 'parcial' vêm ANTES do Resumo", () => {
    const resumo = titulos[0]?.indice ?? -1;
    expect(ABA.indexOf("<BarraDeFiltros")).toBeGreaterThanOrEqual(0);
    expect(ABA.indexOf("<BarraDeFiltros")).toBeLessThan(resumo);
    expect(ABA.indexOf("<AvisoParcial")).toBeGreaterThanOrEqual(0);
    expect(ABA.indexOf("<AvisoParcial")).toBeLessThan(resumo);
    expect(ABA.indexOf("<BarraDeFiltros")).toBeLessThan(ABA.indexOf("<AvisoParcial"));
  });

  it.each([
    ["Resumo", ["<Indicador", "<BlocoDoCaixa"]],
    ["Evolução", ["<BarrasEntradasSaidasChart", "<MesAMesChart"]],
    ["Composição", ["<RoscaCategoriasChart", "<FormaPagamentoChart"]],
    ["Detalhamento", ["Meu × bruto × terceiros", "Maiores gastos por categoria", "Assinaturas"]],
    ["Projeções", ["<ProjecaoChart", "<FaturasChart"]],
  ] as const)("a seção %s tem o que o desenho manda, e só dentro dela", (secao, marcadores) => {
    const i = SECOES.indexOf(secao);
    const de = titulos[i]?.indice ?? -1;
    const ate = titulos[i + 1]?.indice ?? ABA.length;
    const trecho = ABA.slice(de, ate);
    for (const m of marcadores) expect(trecho, `${secao}: ${m}`).toContain(m);
  });

  it("os gráficos de uma seção não aparecem em outra", () => {
    const secao = (nome: (typeof SECOES)[number]) => {
      const i = SECOES.indexOf(nome);
      return ABA.slice(titulos[i]?.indice ?? 0, titulos[i + 1]?.indice ?? ABA.length);
    };
    expect(secao("Resumo")).not.toContain("Chart");
    expect(secao("Detalhamento")).not.toContain("Chart");
    expect(secao("Evolução")).not.toContain("<RoscaCategoriasChart");
    expect(secao("Composição")).not.toContain("<BarrasEntradasSaidasChart");
    expect(secao("Projeções")).not.toContain("<MesAMesChart");
  });
});

/* ─────────────────────── Reuso das peças da 04-A, nunca cópia ─────────────────────── */

describe("a aba reusa as peças da 04-A", () => {
  it.each([
    "@/components/shared/painel/indicador",
    "@/components/shared/painel/bloco",
    "@/components/shared/painel/olho-dos-valores",
    "@/components/dashboard/barras-entradas-saidas-chart",
    "@/components/dashboard/rosca-categorias-chart",
    "@/components/reports/barra-de-filtros",
    "@/components/financeiro/aviso-parcial",
  ])("importa %s", (modulo) => {
    expect(CLIENTE).toContain(`from "${modulo}"`);
  });

  it("só importa as FACHADAS dos gráficos, nunca o `-impl` (o recharts entra sob demanda)", () => {
    expect(CLIENTE).not.toMatch(/-impl["']/);
    expect(CLIENTE).not.toMatch(/from "recharts"/);
  });

  it("nenhum arquivo de src/components/ define function Indicador ou function Bloco além das peças", () => {
    const definidores: string[] = [];
    const varrer = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const caminho = join(dir, e.name);
        if (e.isDirectory()) varrer(caminho);
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
          const fonte = ler(caminho);
          if (/\bfunction\s+(Indicador|Bloco)\b/.test(fonte)) {
            definidores.push(caminho.slice(process.cwd().length + 1).replaceAll("\\", "/"));
          }
        }
      }
    };
    varrer(join(process.cwd(), "src", "components"));
    expect(definidores.sort()).toEqual([
      "src/components/shared/painel/bloco.tsx",
      "src/components/shared/painel/indicador.tsx",
    ]);
    expect(CLIENTE).not.toMatch(/\bfunction\s+(Indicador|Bloco)\b/);
  });

  it("o aviso 'parcial' é a MESMA peça nos dois lugares, e o texto mora só nela", () => {
    const painel = ler(
      join(process.cwd(), "src", "app", "(app)", "dashboard", "financeiro", "financial-dashboard-client.tsx"),
    );
    const peca = ler(join(process.cwd(), "src", "components", "financeiro", "aviso-parcial.tsx"));
    expect(peca).toContain("export function AvisoParcial");
    expect(peca).toContain("Alguns números podem estar incompletos nesta leitura.");
    expect(painel).toContain("<AvisoParcial");
    expect(painel).not.toContain("Alguns números podem estar incompletos");
    expect(CLIENTE).not.toContain("Alguns números podem estar incompletos");
  });
});

/* ─────────────────────── O que a aba não tem ─────────────────────── */

describe("o que a aba Financeiro NÃO tem", () => {
  it("nenhum Abertura (o relatório é tela de análise)", () => {
    expect(CLIENTE).not.toContain("Abertura");
    expect(PAGINA).not.toContain("Abertura");
  });

  it("nenhum StatCard na aba Financeiro (os indicadores são as peças da 04-A)", () => {
    expect(ABA).not.toContain("StatCard");
  });

  it("nenhum apresentarEntradas, nenhuma conta de dinheiro e nenhum bruto como 'minhas entradas'", () => {
    expect(CLIENTE).not.toContain("apresentarEntradas");
    expect(ABA).not.toMatch(/formatCurrency\(\s*[\w.?]*\.entradas\s*\)/);
    // Só desenha o que o modelo entrega: nenhuma soma, nenhum motor.
    expect(ABA).not.toMatch(/\.reduce\(/);
    expect(CLIENTE).not.toContain("@/lib/finance/dashboard");
    expect(CLIENTE).not.toContain("@/lib/finance/pipeline");
  });

  it("ausência nunca vira R$ 0,00: nenhum `?? 0` nem `|| 0` na aba", () => {
    expect(ABA).not.toMatch(/\?\?\s*0\b/);
    expect(ABA).not.toMatch(/\|\|\s*0\b/);
  });

  it("nenhum relógio no cliente nem na página (`hoje` chega de fora)", () => {
    for (const fonte of [CLIENTE, PAGINA]) {
      expect(fonte).not.toMatch(/Date\.now\(/);
      expect(fonte).not.toMatch(/new Date\(\s*\)/);
    }
  });

  it("as quatro outras abas continuam", () => {
    for (const aba of ["financeiro", "cartoes", "habitos", "estudos", "tarefas"]) {
      expect(CLIENTE, aba).toMatch(new RegExp(`<TabsTrigger value="${aba}"`));
      expect(CLIENTE, aba).toMatch(new RegExp(`<TabsContent value="${aba}"`));
    }
  });
});

/* ─────────────────────── Cada Bloco obedece ao modelo (L1) ─────────────────────── */

const BLOCOS = [
  "barras",
  "mesAMes",
  "rosca",
  "formas",
  "ancora",
  "maiores",
  "assinaturas",
  "projecao",
  "faturasFuturas",
] as const;

describe("cada <Bloco> da aba deriva o estado do modelo (financeiro.blocos)", () => {
  const blocos = tagsDe(ABA, "Bloco");

  it("há um <Bloco> para cada bloco do modelo", () => {
    expect(blocos).toHaveLength(BLOCOS.length);
    for (const nome of BLOCOS) {
      expect(
        blocos.filter((t) => t.includes(`"${nome}"`)),
        nome,
      ).toHaveLength(1);
    }
  });

  it("nenhum Bloco tem estado fixo: todos leem `estadoDoRelatorio(` e `naoSegueDoRelatorio(`", () => {
    for (const tag of blocos) {
      expect(tag).not.toMatch(/\bestado="/);
      expect(tag).not.toMatch(/\bestado=\{\s*["'`]/);
      expect(tag).toMatch(/\bestado=\{\s*estadoDoRelatorio\(/);
      expect(tag).toMatch(/\bnaoSegue=\{\s*naoSegueDoRelatorio\(/);
      expect(tag).toContain("financeiro");
    }
  });

  it("o selo 'filtrado: <nome>' vai no `acao` de todo Bloco que segue o recorte", () => {
    for (const tag of blocos) expect(tag).toMatch(/\bacao=\{/);
    expect(CLIENTE).toContain("filtrado: ");
  });

  it("o motivo e o caminho de volta saem de `financeiro.blocos` e de urlDoRelatorio com SEM_RECORTE", () => {
    const i = CLIENTE.indexOf("function naoSegueDoRelatorio");
    expect(i, "function naoSegueDoRelatorio").toBeGreaterThanOrEqual(0);
    const corpo = CLIENTE.slice(i, CLIENTE.indexOf("\n}\n", i));
    expect(corpo).toContain(".blocos[");
    expect(corpo).toContain(".naoSegue");
    expect(corpo).toContain(".naoSegueResp");
    expect(corpo).toContain("urlDoRelatorio(");
    expect(corpo).toContain("recorte: SEM_RECORTE");
    expect(corpo).toContain("hrefSemFiltro");
    expect(CLIENTE).toMatch(/import \{[^}]*\bSEM_RECORTE\b[^}]*\} from "@\/lib\/finance\/recorte"/);
    expect(CLIENTE).toMatch(/import \{[^}]*\burlDoRelatorio\b[^}]*\} from "@\/lib\/reports\/url-do-relatorio"/);
  });

  it("`estadoDoRelatorio` põe o 'não segue' ACIMA de tudo e distingue falha de vazio", () => {
    const i = CLIENTE.indexOf("function estadoDoRelatorio");
    expect(i, "function estadoDoRelatorio").toBeGreaterThanOrEqual(0);
    const corpo = CLIENTE.slice(i, CLIENTE.indexOf("\n}\n", i));
    expect(corpo).toContain('"nao-segue"');
    expect(corpo).toContain('"falha"');
    expect(corpo).toContain('"vazio"');
    expect(corpo.indexOf('"nao-segue"')).toBeLessThan(corpo.indexOf('"falha"'));
  });
});

/* ─────────────────────── O olho, o cookie e a página ─────────────────────── */

describe("o olho dos valores e a página", () => {
  it("a página lê o cookie do olho no servidor, como a do painel", () => {
    expect(PAGINA).toContain("COOKIE_DO_OLHO");
    expect(PAGINA).toMatch(/valoresOcultos\(/);
    expect(PAGINA).toMatch(/await cookies\(\)/);
    expect(PAGINA).toMatch(/valoresOcultos=\{|ocultos=\{/);
    // A página entrega `data` (com `data.financeiro`); o cliente repassa `financeiro` à aba.
    expect(CLIENTE).toMatch(/<AbaFinanceiro financeiro=\{financeiro\}/);
  });

  it("os quatro indicadores ficam dentro do OlhoDosValores, e só o Saldo leva o botão", () => {
    expect(ABA).toContain("<OlhoDosValores");
    expect(ABA.match(/<BotaoDoOlho/g)).toHaveLength(1);
    expect(ABA.match(/<Indicador\b/g)).toHaveLength(4);
    const olho = ABA.indexOf("<OlhoDosValores");
    const primeiro = ABA.indexOf("<Indicador");
    expect(olho).toBeGreaterThanOrEqual(0);
    expect(olho).toBeLessThan(primeiro);
    expect(ABA.indexOf("</OlhoDosValores>")).toBeGreaterThan(ABA.lastIndexOf("<Indicador"));
  });

  it("o texto de dinheiro das listas some com o olho (peça compartilhada, mesmo seletor do Indicador)", () => {
    const peca = ler(join(process.cwd(), "src", "components", "shared", "painel", "valor-com-olho.tsx"));
    expect(peca).toContain("export function ValorComOlho");
    expect(peca).toContain("group-data-[ocultar=true]/olho:hidden");
    expect(peca).toContain("valor oculto");
    expect(CLIENTE).toContain("<ValorComOlho");
  });

  it("R3 · o relatório não define a própria peça do olho (reuso, não cópia)", () => {
    expect(CLIENTE).not.toMatch(/\bfunction\s+ComOlho\b/);
    expect(CLIENTE).not.toContain("<ComOlho");
    expect(CLIENTE).toMatch(
      /import \{[^}]*\bValorComOlho\b[^}]*\} from "@\/components\/shared\/painel\/valor-com-olho"/,
    );
  });

  it("o BlocoDoCaixa só aparece na base caixa, com o estado lido pelo modelo", () => {
    expect(ABA).toMatch(/caixa\s*}\s*=\s*financeiro|financeiro\.caixa/);
    expect(ABA).toMatch(/base === "caixa" && caixa/);
    expect(ABA).toMatch(/<BlocoDoCaixa[^>]*caixa=\{/);
  });

  it("a frase do perdoado e o pendente do mês saem das funções do painel", () => {
    expect(ABA).toContain("fraseDoPerdoado(");
    expect(ABA).toContain("rotuloPendenteDoMes(");
  });
});

/* ─────────────────────── R1: rosca e formas rotulam pela responsabilidade ─────────────────────── */

describe("a rosca e as formas levam os rótulos da responsabilidade (nunca o default 'minhas')", () => {
  it("<RoscaCategoriasChart> recebe `ariaDaLista` e `rotuloDoTotal`", () => {
    const tags = tagsDe(ABA, "RoscaCategoriasChart");
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatch(/\bariaDaLista=\{/);
    expect(tags[0]).toMatch(/\brotuloDoTotal=\{/);
  });

  it("<FormaPagamentoChart> recebe `rotuloDaSerie`", () => {
    const tags = tagsDe(ABA, "FormaPagamentoChart");
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatch(/\brotuloDaSerie=\{/);
  });

  it("R2: a nota da rosca (antes dos estornos) é desenhada no Bloco da rosca", () => {
    expect(ABA).toContain("rosca.nota");
  });

  it("os textos saem de `rotulosDaComposicao` (fonte única), não de literais na tela", () => {
    expect(CLIENTE).toContain("rotulosDaComposicao(");
    expect(ABA).not.toMatch(/minhas saídas|Minha parte/);
  });
});

/* ─────────────────────── R5: a aba Cartões troca o mês ─────────────────────── */

describe("o seletor do mês também vale na aba Cartões", () => {
  const cartoes = (() => {
    const inicio = CLIENTE.indexOf('<TabsContent value="cartoes"');
    expect(inicio, "TabsContent cartoes").toBeGreaterThanOrEqual(0);
    const fim = CLIENTE.indexOf("</TabsContent>", inicio);
    expect(fim).toBeGreaterThan(inicio);
    return CLIENTE.slice(inicio, fim);
  })();

  it("<SeletorDoMes> aparece dentro do TabsContent de cartões, com os filtros do relatório", () => {
    const tags = tagsDe(cartoes, "SeletorDoMes");
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatch(/\bfiltros=\{/);
    expect(tags[0]).toMatch(/\bid="[^"]+"/);
  });

  it("a barra de filtros usa a MESMA peça, com id distinto", () => {
    const barra = ler(join(process.cwd(), "src", "components", "reports", "barra-de-filtros.tsx"));
    expect(barra).toMatch(/export function SeletorDoMes\(/);
    const usos = tagsDe(barra, "SeletorDoMes");
    expect(usos).toHaveLength(1);
    const idDaBarra = /\bid="([^"]+)"/.exec(usos[0])?.[1];
    const idDeCartoes = /\bid="([^"]+)"/.exec(tagsDe(cartoes, "SeletorDoMes")[0] ?? "")?.[1];
    expect(idDaBarra).toBeDefined();
    expect(idDeCartoes).toBeDefined();
    expect(idDeCartoes).not.toBe(idDaBarra);
    expect(CLIENTE).toMatch(/import \{[^}]*\bSeletorDoMes\b[^}]*\} from "@\/components\/reports\/barra-de-filtros"/);
  });
});

/* ─────────────────────── 04-B: a aba abre os registros ─────────────────────── */

describe("04-B · a gaveta de registros da aba Financeiro", () => {
  const trecho = (de: string, ate: string) => {
    const i = ABA.indexOf(de);
    expect(i, de).toBeGreaterThanOrEqual(0);
    const j = ABA.indexOf(ate, i);
    expect(j, ate).toBeGreaterThan(i);
    return ABA.slice(i, j);
  };

  it("<GavetaDeRegistros> fica DENTRO do OlhoDosValores da aba, com a vista e as URLs da prop `gaveta`", () => {
    const dentro = trecho("<OlhoDosValores", "</OlhoDosValores>");
    const tags = tagsDe(dentro, "GavetaDeRegistros");
    expect(tags).toHaveLength(1);
    expect(tags[0]).toContain("vista={gaveta.vista}");
    expect(tags[0]).toContain("urlAoFechar={gaveta.urlAoFechar}");
    expect(tags[0]).toContain("linkLancamentos={gaveta.linkLancamentos}");
    expect(CLIENTE).toMatch(/import \{ GavetaDeRegistros \} from "@\/components\/shared\/painel\/gaveta-de-registros"/);
  });

  it("os quatro indicadores abrem os registros (as URLs vêm de `hrefs`) e o atalho antigo para Lançamentos saiu", () => {
    const indicadores = tagsDe(ABA, "Indicador");
    expect(indicadores).toHaveLength(4);
    for (const tag of indicadores) {
      expect(tag).toMatch(/\bhref=\{(hrefs\.\w+|quartoHref)\}/);
      expect(tag).toContain('hrefRotulo="Ver registros"');
    }
    expect(ABA).not.toContain("/financeiro/lancamentos?type=");
    expect(ABA).toMatch(/quartoHref\s*=\s*resp === "meu" && filtros\.recorte\.pessoa === null\s*\?\s*hrefs\.terceiros\s*:\s*hrefs\.pendente/);
  });

  it("cada número do §4 que o relatório tem lê a URL da sua chave (`hrefs`)", () => {
    for (const chave of [
      "hrefs.saldo",
      "hrefs.entradas",
      "hrefs.saidas",
      "hrefs.pendente",
      "hrefs.meu",
      "hrefs.bruto",
      "hrefs.terceiros",
      'hrefs["pendente-do-mes"]',
      '"categoria:"',
      '"forma:"',
      '"projecao:"',
      'hrefs["caixa:renda"]',
      'hrefs["caixa:reembolsos"]',
      'hrefs["caixa:outras"]',
      'hrefs["caixa:saidas"]',
      'hrefs["caixa:pagamentos"]',
    ]) {
      expect(ABA, chave).toContain(chave);
    }
  });

  it("a rosca, as formas, as categorias maiores e a projeção levam um link por item, fora do SVG", () => {
    expect(ABA.match(/<LinksPorFatia/g)?.length).toBe(3);
    expect(ABA.match(/<VerRegistros/g)?.length).toBeGreaterThanOrEqual(5);
    // Nenhum link dentro do gráfico: o componente do gráfico nunca recebe `href`.
    for (const nome of ["RoscaCategoriasChart", "FormaPagamentoChart", "ProjecaoChart", "FaturasChart"]) {
      for (const tag of tagsDe(ABA, nome)) expect(tag, nome).not.toMatch(/\bhref\b/);
    }
  });

  it("D-B-17: barras e mês a mês trazem a frase, sem link; 'Faturas dos próximos meses' não abre (sem id de fatura)", () => {
    expect(CLIENTE).toContain("Para ver os registros de um mês, escolha o mês no topo.");
    expect(ABA.match(/\{FRASE_DO_MES\}/g)).toHaveLength(2);
    const barras = tagsDe(ABA, "BarrasEntradasSaidasChart")[0] ?? "";
    expect(barras).not.toMatch(/\bhref\b/);
    expect(ABA).not.toMatch(/hrefs\[["'`]fatura/);
    expect(ABA).not.toMatch(/hrefs\[["'`]contas/);
  });

  it("⛔ o JSON exportado continua sendo o `data` inteiro, e a gaveta NÃO entra em ReportsData nem em RelatorioFinanceiro", () => {
    expect(CLIENTE).toMatch(/downloadJson\(\s*`relatorio-\$\{mes\}\.json`,\s*data\s*\)/);
    expect(CLIENTE).not.toMatch(/downloadJson\([^)]*gaveta/);

    const tipo = (arquivo: string, nome: string) => {
      const fonte = ler(join(process.cwd(), ...arquivo.split("/")));
      const i = fonte.indexOf(`export type ${nome} = {`);
      expect(i, nome).toBeGreaterThanOrEqual(0);
      return fonte.slice(i, fonte.indexOf("\n};\n", i));
    };
    for (const [arquivo, nome] of [
      ["src/lib/reports/queries.ts", "ReportsData"],
      ["src/lib/reports/financeiro.ts", "RelatorioFinanceiro"],
    ] as const) {
      const corpo = tipo(arquivo, nome);
      expect(corpo, nome).not.toMatch(/\b(gaveta|vista|hrefs|hrefsDoDetalhe|detalhe)\??:/);
      expect(corpo, nome).not.toContain("GavetaDoRelatorio");
      expect(corpo, nome).not.toContain("VistaDaGaveta");
    }
  });

  it("a página entrega `data` e `gaveta` como props separadas", () => {
    expect(PAGINA).toMatch(/const \{ data, gaveta \} = await getReportsData\(/);
    expect(PAGINA).toMatch(/<RelatoriosClient data=\{data\} gaveta=\{gaveta\}/);
    expect(CLIENTE).toMatch(/<AbaFinanceiro financeiro=\{financeiro\} gaveta=\{gaveta\}/);
  });

  it("a página lê o pedido pela URL e o detalhe nasce no servidor, não no cliente", () => {
    const queries = ler(join(process.cwd(), "src", "lib", "reports", "queries.ts"));
    expect(queries).toContain("pedidoDaUrl(filtros.sp)");
    expect(queries).toContain("gavetaDoRelatorio(");
    expect(queries).toContain("lerEstadoDoCaixa(");
    expect(queries).not.toMatch(/\bestadoDoCaixa\(/);
    expect(CLIENTE).not.toContain("detalheDoNumero");
    expect(CLIENTE).not.toContain("urlComDetalhe");
  });
});
