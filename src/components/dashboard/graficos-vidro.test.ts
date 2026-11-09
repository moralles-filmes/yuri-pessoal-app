import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/lib/theme/ler-tokens";
import { chaveDoTopoDaPilha } from "./chart-theme";
import { linhasDaDica, type EntradaDaDica } from "./linhas-da-dica";

/**
 * 09-E, Task 2 — a dica em vidro, a legenda e o gancho de foco. O projeto não tem teste de
 * componente, então a prova é varredura de FONTE sem comentários (a explicação de uma regra não
 * pode satisfazer nem quebrar a própria varredura) e função pura.
 */

const pasta = join(process.cwd(), "src", "components", "dashboard");
const lerFonte = (nome: string) => semComentarios(readFileSync(join(pasta, nome), "utf8"));
const globals = semComentarios(
  readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8"),
);

const dica = lerFonte("dica-do-grafico.tsx");
const foco = lerFonte("use-foco-do-grafico.ts");

/** O elemento de abertura que carrega `data-slot="chart-tooltip"`, com todos os atributos. */
function raizDaDica(): string {
  const inicio = dica.indexOf('data-slot="chart-tooltip"');
  expect(inicio, "a raiz da dica tem data-slot=chart-tooltip").toBeGreaterThan(-1);
  const abre = dica.lastIndexOf("<div", inicio);
  const fecha = dica.indexOf(">", inicio);
  return dica.slice(abre, fecha + 1);
}

describe("dica em vidro", () => {
  it("a raiz liga data-slot e vidro-sobreposicao no MESMO elemento, sem bg/border/shadow", () => {
    const raiz = raizDaDica();
    expect(raiz).toContain("vidro-sobreposicao");
    const classes = /className="([^"]*)"/.exec(raiz)?.[1] ?? "";
    expect(classes).not.toMatch(/(^|\s)(bg-|border|shadow)/);
    expect(classes).toContain("rounded-[14px]");
  });

  it("devolve null sem linhas", () => {
    expect(dica).toMatch(/linhas\.length\s*===\s*0[\s\S]{0,40}return null/);
  });

  it("o total e o valor em dinheiro passam por ValorComOlho", () => {
    expect(dica).toContain('from "@/components/shared/painel/valor-com-olho"');
    expect(dica).toMatch(/<ValorComOlho\s+texto=\{total\}/);
    expect(dica).toMatch(/dinheiro\s*\?[\s\S]{0,60}<ValorComOlho\s+texto=\{l\.valor\}/);
  });

  it("não usa transição (a dica acompanha o ponteiro)", () => {
    expect(dica).not.toMatch(/transition/);
  });

  it("valor em dinheiro é tabular-nums", () => {
    expect(dica).toContain("tabular-nums");
  });

  it("a legenda escreve o nome em text-muted-foreground, nunca na cor da série", () => {
    const legenda = dica.slice(dica.indexOf("export function LegendaDoGrafico"));
    expect(legenda).toContain("text-muted-foreground");
    expect(legenda).not.toMatch(/style=\{\{[^}]*color:/);
  });

  it("a amostra de cor tem 10 px, raio 3 e aro ring-1 ring-foreground/NN", () => {
    const amostra = dica.slice(
      dica.indexOf("export function AmostraDeCor"),
      dica.indexOf("export function DicaDoGrafico"),
    );
    expect(amostra).toContain("size-2.5");
    expect(amostra).toContain("rounded-[3px]");
    expect(amostra).toMatch(/ring-1 ring-foreground\/\d+/);
  });

  it("a regra de vidro sobre vidro (sem desfoque) alcança a dica", () => {
    const regra = globals.slice(globals.indexOf("body:has("));
    const lista = regra.slice(0, regra.indexOf("{"));
    expect(lista).toContain('[data-slot="chart-tooltip"]');
  });
});

describe("gráfico em dinheiro e o olho", () => {
  it("esconde os valores do eixo com visibility: hidden sob [data-ocultar=\"true\"]", () => {
    expect(globals).toMatch(
      /\[data-ocultar="true"\]\s+\.grafico-dinheiro\s+\.recharts-cartesian-axis-tick-value\s*\{[^}]*visibility:\s*hidden/,
    );
  });
});

describe("use-foco-do-grafico", () => {
  it("registra pointerdown e scroll passivos e remove os dois no cleanup", () => {
    expect(foco).toMatch(/addEventListener\("pointerdown",[^)]*passive:\s*true/);
    expect(foco).toMatch(/addEventListener\("scroll",[^)]*passive:\s*true/);
    expect(foco).toMatch(/removeEventListener\("pointerdown"/);
    expect(foco).toMatch(/removeEventListener\("scroll"/);
  });

  it("pointermove, focusin e keydown DENTRO do gráfico reabilitam a dica, e saem no cleanup", () => {
    for (const evento of ["pointermove", "focusin", "keydown"]) {
      expect(foco, `add ${evento}`).toMatch(
        new RegExp(String.raw`raiz\?\.addEventListener\("${evento}",\s*aoMover,\s*\{\s*passive:\s*true`),
      );
      expect(foco, `remove ${evento}`).toMatch(
        new RegExp(String.raw`raiz\?\.removeEventListener\("${evento}",\s*aoMover`),
      );
    }
    expect(foco).toMatch(/aoMover\s*=\s*\(\)\s*=>\s*setDicaAtiva\(undefined\)/);
  });

  it("pointerdown só apaga a dica quando o alvo está FORA do ref", () => {
    expect(foco).toMatch(/\.contains\(e\.target\)/);
    expect(foco).toMatch(/dentro\s*\?\s*undefined\s*:\s*false/);
  });

  it("foco é null enquanto a dica está apagada (dicaAtiva === false)", () => {
    expect(foco).toMatch(/dicaAtiva\s*===\s*false\s*\?\s*null/);
  });

  it("o observador lê a dica do recharts e só chama aoMudar num efeito", () => {
    expect(foco).toContain("useActiveTooltipDataPoints");
    expect(foco).toMatch(/useEffect\(/);
    expect(foco).toMatch(/dados\.indexOf\(/);
  });
});

describe("linhasDaDica", () => {
  const entrada = (o: Partial<EntradaDaDica>): EntradaDaDica =>
    ({ graphicalItemId: "g", ...o }) as EntradaDaDica;

  it("descarta quem o formatador recusa (null) e mantém zero medido", () => {
    const linhas = linhasDaDica(
      [
        entrada({ dataKey: "a", name: "Entradas", value: 0, color: "var(--chart-1)" }),
        entrada({ dataKey: "b", name: "Saídas", value: 5, color: "var(--chart-2)" }),
        entrada({ dataKey: "c", name: "Sem dado", value: undefined, color: "var(--chart-3)" }),
      ],
      (e) => {
        if (e.value === undefined) return null;
        return { valor: e.value === 0 ? "R$ 0,00" : "R$ 5,00", dinheiro: true };
      },
    );
    expect(linhas.map((l) => l.valor)).toEqual(["R$ 0,00", "R$ 5,00"]);
    expect(linhas[0]).toMatchObject({
      chave: "a",
      nome: "Entradas",
      cor: "var(--chart-1)",
      dinheiro: true,
    });
  });

  it("o nome do formatador vence o da entrada; sem nenhum dos dois, vira texto vazio", () => {
    const [a, b] = linhasDaDica(
      [entrada({ dataKey: "x", name: "Original", color: "c" }), entrada({ dataKey: "y", color: "c" })],
      (e) => (e.dataKey === "x" ? { nome: "Trocado", valor: "1", dinheiro: false } : { valor: "2", dinheiro: false }),
    );
    expect(a.nome).toBe("Trocado");
    expect(b.nome).toBe("");
  });

  it("chave repetida não repete: cai no índice", () => {
    const linhas = linhasDaDica(
      [entrada({ dataKey: "k", color: "c" }), entrada({ dataKey: "k", color: "c" })],
      () => ({ valor: "1", dinheiro: false }),
    );
    expect(new Set(linhas.map((l) => l.chave)).size).toBe(2);
  });
});

describe("nenhum arquivo de gráfico diz 'Sobrou'", () => {
  it("varre os -impl, as fachadas e as peças novas", async () => {
    const { readdirSync } = await import("node:fs");
    const arquivos = readdirSync(pasta).filter(
      (n) => /\.tsx?$/.test(n) && !n.endsWith(".test.ts") && !n.endsWith(".test.tsx"),
    );
    expect(arquivos).toContain("dica-do-grafico.tsx");
    for (const nome of arquivos) {
      expect(lerFonte(nome), nome).not.toContain("Sobrou");
    }
  });
});


/**
 * 09-E, Task 3 — as cinco barras financeiras em vidro. Varredura de fonte sem comentários:
 * cada elemento JSX é extraído por inteiro (o `>` de uma seta dentro de `{...}` não o fecha), e
 * a classe é amarrada ao elemento certo, não a "algum lugar do arquivo".
 */
type ConfigDeBarras = {
  /** Relativo a `src/components`. */
  caminho: string;
  deitado?: boolean;
  /** `prop`: o invólucro só leva `grafico-dinheiro` quando a prop `dinheiro` é verdadeira. */
  dinheiro: "sempre" | "nunca" | "prop";
  legendas: number;
  /** O elemento que leva o `ref` do foco: um `<div>` ou o `<ChartFrame>` de Treinos. */
  raiz: "div" | "ChartFrame";
  /** Arquivo com vários gráficos: a varredura fica só no trecho do componente de barras. */
  trecho?: { de: string; ate: string };
};

const BARRAS: ConfigDeBarras[] = [
  { caminho: "dashboard/barras-entradas-saidas-chart-impl.tsx", dinheiro: "sempre", legendas: 1, raiz: "div" },
  { caminho: "dashboard/mes-a-mes-chart-impl.tsx", dinheiro: "sempre", legendas: 1, raiz: "div" },
  { caminho: "dashboard/faturas-chart-impl.tsx", dinheiro: "sempre", legendas: 1, raiz: "div" },
  { caminho: "dashboard/projecao-chart-impl.tsx", dinheiro: "sempre", legendas: 1, raiz: "div" },
  { caminho: "dashboard/forma-pagamento-chart-impl.tsx", deitado: true, dinheiro: "sempre", legendas: 0, raiz: "div" },
  { caminho: "habits/consistency-chart-impl.tsx", dinheiro: "nunca", legendas: 0, raiz: "div" },
  { caminho: "reports/report-bar-chart-impl.tsx", dinheiro: "prop", legendas: 0, raiz: "div" },
  {
    caminho: "training/training-charts-impl.tsx",
    dinheiro: "nunca",
    legendas: 0,
    raiz: "ChartFrame",
    trecho: { de: "export function PeriodBarChart", ate: "export function EvolutionLineChart" },
  },
];

const lerComponente = (caminho: string) =>
  semComentarios(readFileSync(join(process.cwd(), "src", "components", caminho), "utf8"));

/** Todo elemento de abertura `<Nome ...>` (ou `/>`) da fonte, com os atributos inteiros. */
function elementos(fonte: string, nome: string): string[] {
  const achados: string[] = [];
  const inicio = new RegExp(`<${nome}(?=[\\s/>])`, "g");
  let m: RegExpExecArray | null;
  while ((m = inicio.exec(fonte)) !== null) {
    let i = m.index + m[0].length;
    let chaves = 0;
    let aspas: string | null = null;
    for (; i < fonte.length; i++) {
      const c = fonte[i];
      if (aspas) {
        if (c === aspas) aspas = null;
      } else if (c === '"' || c === "'" || c === "`") aspas = c;
      else if (c === "{") chaves++;
      else if (c === "}") chaves--;
      else if (c === ">" && chaves === 0 && fonte[i - 1] !== "=") break;
    }
    achados.push(fonte.slice(m.index, i + 1));
  }
  return achados;
}

const classesDe = (elemento: string) =>
  (/className="([^"]*)"/.exec(elemento)?.[1] ?? "").split(/\s+/).filter(Boolean);

describe("o extrator de elementos", () => {
  it("não fecha no => de dentro de uma chave, e não confunde <Bar com <BarChart", () => {
    const fonte = `<BarChart a={1}><Bar f={(v) => v} x="a>b" /><Bar y />`;
    expect(elementos(fonte, "Bar")).toEqual([`<Bar f={(v) => v} x="a>b" />`, `<Bar y />`]);
    expect(elementos(fonte, "BarChart")).toEqual([`<BarChart a={1}>`]);
  });
});

describe.each(BARRAS)("barras em vidro: $caminho", (cfg) => {
  const inteiro = lerComponente(cfg.caminho);
  const fonte = cfg.trecho
    ? inteiro.slice(inteiro.indexOf(cfg.trecho.de), inteiro.indexOf(cfg.trecho.ate))
    : inteiro;
  const deitado = cfg.deitado === true;

  it("lê o arquivo (não afirma sobre string vazia)", () => {
    expect(inteiro.length).toBeGreaterThan(800);
    expect(fonte.length).toBeGreaterThan(200);
    expect(fonte).toContain("<BarChart");
  });

  it("toda <Bar> desliga a animação da recharts e usa larguraDaBarra", () => {
    const barras = elementos(fonte, "Bar");
    expect(barras.length).toBeGreaterThan(0);
    for (const b of barras) {
      expect(b).toContain("isAnimationActive={false}");
      expect(b).toContain("maxBarSize={larguraDaBarra(");
    }
  });

  it("todo <BarChart> separa as vizinhas por VAO_ENTRE_BARRAS", () => {
    const graficos = elementos(fonte, "BarChart");
    expect(graficos.length).toBe(1);
    expect(graficos[0]).toContain("barGap={VAO_ENTRE_BARRAS}");
  });

  it("todo <Tooltip> usa a dica em vidro, sem cursor, sem animação e preso ao foco", () => {
    const dicas = elementos(fonte, "Tooltip");
    expect(dicas.length).toBe(1);
    for (const t of dicas) {
      expect(t).toContain("content=");
      expect(t).toContain("active={foco.dicaAtiva}");
      expect(t).toContain("isAnimationActive={false}");
      expect(t).toContain("cursor={false}");
      expect(t).not.toContain("contentStyle");
    }
  });

  it("o invólucro com ref do foco leva a classe de crescimento e a do olho", () => {
    const comRef = elementos(fonte, cfg.raiz).filter((e) =>
      /\bref(DoGrafico)?=\{refDoGrafico\}/.test(e),
    );
    expect(comRef.length).toBe(1);
    const todas = comRef[0].match(/grafico-[a-z-]+/g) ?? [];
    expect(todas).toContain(deitado ? "grafico-barras-deitadas" : "grafico-barras");
    expect(todas).not.toContain(deitado ? "grafico-barras" : "grafico-barras-deitadas");
    if (cfg.dinheiro === "sempre") expect(classesDe(comRef[0])).toContain("grafico-dinheiro");
    if (cfg.dinheiro === "nunca") expect(todas).not.toContain("grafico-dinheiro");
    if (cfg.dinheiro === "prop") {
      // Só quando a prop é verdadeira: nunca a classe incondicional.
      expect(comRef[0]).toMatch(/dinheiro\s*\?\s*"grafico-barras grafico-dinheiro"\s*:\s*"grafico-barras"/);
      expect(classesDe(comRef[0])).not.toContain("grafico-dinheiro");
    }
  });

  it("o observador recebe o MESMO array que o gráfico (a recharts o acha por identidade)", () => {
    const dadosDoGrafico = /<BarChart[^>]*\bdata=\{(\w+)\}/.exec(fonte)?.[1];
    const dadosDoObservador =
      /<ObservadorDeFoco\s+dados=\{(\w+)\}\s+aoMudar=\{foco\.aoMudar\}/.exec(fonte)?.[1];
    expect(dadosDoGrafico).toBeTruthy();
    expect(dadosDoObservador).toBe(dadosDoGrafico);
  });

  it("toda <Cell> esmaece pelo foco, com opacidadeDoGrupo", () => {
    const celulas = elementos(fonte, "Cell");
    expect(celulas.length).toBeGreaterThan(0);
    for (const c of celulas) expect(c).toContain("opacity={opacidadeDoGrupo(");
  });

  it("o raio da ponta vem de raioDaPonta, no layout certo, e nunca é numérico solto", () => {
    expect(fonte).toContain(`raioDaPonta("${deitado ? "vertical" : "horizontal"}")`);
    expect(fonte).not.toMatch(/radius=\{\[/);
  });

  it("eixos sem linha nem marca, e Y com largura automática", () => {
    for (const e of [...elementos(fonte, "XAxis"), ...elementos(fonte, "YAxis")]) {
      expect(e).toContain("axisLine={false}");
      expect(e).toContain("tickLine={false}");
    }
    for (const y of elementos(fonte, "YAxis")) expect(y).toContain('width="auto"');
  });

  it("grade só horizontal (e nenhuma no deitado)", () => {
    const grades = elementos(fonte, "CartesianGrid");
    if (deitado) expect(grades).toEqual([]);
    else for (const g of grades) expect(g).toContain("vertical={false}");
  });

  it("não sobrou estilo antigo de tooltip nem a dica padrão da recharts", () => {
    expect(fonte).not.toMatch(/tooltip(Style|LabelStyle|ItemStyle)/);
    expect(fonte).not.toContain("formatter=");
  });

  it("usa a dica em vidro e os ganchos do foco", () => {
    expect(fonte).toContain("DicaDoGrafico");
    expect(fonte).toContain("{ ref: refDoGrafico, ...foco } = useFocoDoGrafico();");
    expect(inteiro).toMatch(/from "[^"]*use-foco-do-grafico"/);
  });

  it("a legenda, quando existe, é a LegendaDoGrafico", () => {
    const legendas = elementos(fonte, "Legend");
    for (const l of legendas) expect(l).toContain("content={<LegendaDoGrafico />}");
    expect(legendas.length).toBe(cfg.legendas);
  });
});

describe("barras em vidro: situações próprias", () => {
  it("barras-entradas-saidas: sem hachura; mês parcial a 35% com contorno tracejado", () => {
    const f = lerFonte("barras-entradas-saidas-chart-impl.tsx");
    expect(f).not.toContain("Hachura");
    expect(f).not.toContain("url(#hachura");
    expect(f).not.toContain("<pattern");
    expect(f).toContain("OPACIDADE_EM_ANDAMENTO");
    expect(f).toContain("strokeDasharray");
    expect(f).toContain('situacao={linha.parcial ? "ainda em andamento" : undefined}');
  });

  it("barras-entradas-saidas: os atributos de parcial entram por espalhamento condicional", () => {
    const f = lerFonte("barras-entradas-saidas-chart-impl.tsx");
    // `fillOpacity` explicitamente `undefined` numa Cell SOBRESCREVE o da Bar (a recharts mescla
    // as props da Cell por cima): o atributo entra por espalhamento condicional, nunca por ternário.
    expect(f).not.toMatch(/fillOpacity=\{[^}]*\?/);
    expect(f).toMatch(/\.\.\.\(\w+\.parcial \? \w+ : \{\}\)/);
  });

  it("barras-entradas-saidas: as saídas fechadas mantêm o 0,6 da Bar", () => {
    const f = lerFonte("barras-entradas-saidas-chart-impl.tsx");
    const saidas = elementos(f, "Bar").find((b) => b.includes('dataKey="saidas"')) ?? "";
    expect(saidas).toContain("fillOpacity={0.6}");
  });

  it("a fachada das barras escreve 'ainda em andamento' e não desenha hachura", () => {
    const f = lerFonte("barras-entradas-saidas-chart.tsx");
    expect(f).toContain("ainda em andamento");
    expect(f).not.toContain("<pattern");
    expect(f).not.toContain("hachura");
    expect(f).toContain("OPACIDADE_EM_ANDAMENTO");
    expect(f).toContain("dashed");
    expect(f).not.toContain("dica-do-grafico");
  });

  it("faturas: o total vai em total=, o título tem só o mês, e 'sem fatura' continua sem dinheiro", () => {
    const f = lerFonte("faturas-chart-impl.tsx");
    const dica = elementos(f, "DicaDoGrafico")[0] ?? "";
    expect(dica).toContain("total={");
    expect(dica).not.toMatch(/titulo=\{[^}]*total/);
    expect(f).toContain('"sem fatura"');
    expect(f).toMatch(/dinheiro:\s*false/);
    expect(f).not.toContain("?? 0");
  });

  it("faturas e projeção: o segmento mais alto com valor leva a ponta", () => {
    for (const nome of ["faturas-chart-impl.tsx", "projecao-chart-impl.tsx"]) {
      const f = lerFonte(nome);
      expect(f, nome).toContain("chaveDoTopoDaPilha(");
      expect(f, nome).toContain('raioDaPonta("horizontal")');
      for (const b of elementos(f, "Bar")) expect(b, nome).not.toContain("radius=");
    }
  });

  it("projeção: mantém hachura e '(projetado)', e a Bar leva a cor sólida (a legenda a usa)", () => {
    const f = lerFonte("projecao-chart-impl.tsx");
    expect(f).toContain("<pattern");
    expect(f).toContain("strokeDasharray");
    expect(f).toContain("(projetado)");
    for (const b of elementos(f, "Bar")) expect(b).not.toContain('fill="url(');
  });

  it("formas: a amostra da dica usa a cor da linha, e o filtro de positivos continua", () => {
    const f = lerFonte("forma-pagamento-chart-impl.tsx");
    expect(f).toMatch(/\.filter\(\(d\) => d\.meu > 0\)/);
    expect(f).toContain("CHART_COLORS[i % CHART_COLORS.length]");
  });
});

describe("chaveDoTopoDaPilha", () => {
  const chaves = ["a", "b", "c"] as const;
  it("devolve a última chave da ordem de empilhamento com valor positivo", () => {
    expect(chaveDoTopoDaPilha({ a: 1, b: 2, c: 3 }, chaves)).toBe("c");
    expect(chaveDoTopoDaPilha({ a: 1, b: 2, c: 0 }, chaves)).toBe("b");
    expect(chaveDoTopoDaPilha({ a: 5, b: 0, c: 0 }, chaves)).toBe("a");
  });
  it("sem nenhum valor positivo (zero, nulo, ausente) não há topo", () => {
    expect(chaveDoTopoDaPilha({ a: 0, b: null, c: undefined }, chaves)).toBeNull();
    expect(chaveDoTopoDaPilha({}, chaves)).toBeNull();
  });
});

/**
 * 09-E, Task 4 — as barras dos módulos. O que é DESTE grupo e não do molde: o `ReportBarChart`
 * só trata o valor como dinheiro quando quem chama diz (`dinheiro`), e as fachadas dos três
 * gráficos não podem arrastar a dica (ela traz recharts e o olho).
 */
describe("barras dos módulos", () => {
  it("as fachadas não importam a dica nem o gancho de foco", () => {
    for (const nome of [
      "habits/consistency-chart.tsx",
      "reports/report-bar-chart.tsx",
      "training/training-charts.tsx",
    ]) {
      const f = lerComponente(nome);
      expect(f.length, nome).toBeGreaterThan(300);
      expect(f, nome).not.toContain("dica-do-grafico");
      expect(f, nome).not.toContain("use-foco-do-grafico");
    }
  });

  it("report-bar: `dinheiro?: boolean`, padrão false, e a dica só marca dinheiro por ele", () => {
    const f = lerComponente("reports/report-bar-chart-impl.tsx");
    expect(f).toMatch(/dinheiro\?:\s*boolean/);
    expect(f).toMatch(/dinheiro\s*=\s*false/);
    // O formatador da dica repassa a prop (`dinheiro,`), nunca um literal.
    expect(f).toMatch(/String\(e\.value\),\s*dinheiro,\s*\}/);
    expect(f).not.toMatch(/dinheiro:\s*true/);
  });

  it("report-bar: a dica mantém o rótulo e o formatador de hoje", () => {
    const f = lerComponente("reports/report-bar-chart-impl.tsx");
    expect(f).toContain("formatValue ? formatValue(");
    expect(f).toContain("nome: name");
  });

  it("consistência: os textos de hoje continuam", () => {
    const f = lerComponente("habits/consistency-chart-impl.tsx");
    expect(f).toContain("`Semana de ${");
    expect(f).toContain('nome: "Conclusão"');
    expect(f).toMatch(/\(\$\{\w+\.done\}\/\$\{\w+\.scheduled\}\)/);
  });

  it("treinos: a barra mantém a tabela da fachada e o aria-hidden do quadro", () => {
    const f = lerComponente("training/training-charts-impl.tsx");
    expect(f).toContain('aria-hidden="true"');
    expect(f).not.toContain("[6, 6, 0, 0]");
  });

  it("/relatorios liga `dinheiro` só nos gráficos em BRL", () => {
    const f = semComentarios(
      readFileSync(join(process.cwd(), "src", "app", "(app)", "relatorios", "relatorios-client.tsx"), "utf8"),
    );
    const graficos = elementos(f, "ReportBarChart");
    expect(graficos.length).toBeGreaterThan(0);
    for (const g of graficos) {
      expect(g.includes("formatCurrency"), g).toBe(/(^|\s)dinheiro(\s|\/|=)/.test(g));
    }
    expect(graficos.some((g) => /(^|\s)dinheiro(\s|\/|=)/.test(g))).toBe(true);
  });

  it("raio: nenhuma barra dos módulos usa raio numérico solto", () => {
    for (const nome of [
      "habits/consistency-chart-impl.tsx",
      "reports/report-bar-chart-impl.tsx",
      "training/training-charts-impl.tsx",
    ]) {
      const f = lerComponente(nome);
      expect(f, nome).not.toMatch(/radius=\{\[/);
    }
  });
});
