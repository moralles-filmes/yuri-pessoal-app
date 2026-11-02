import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/links-inline";

/**
 * 04-A, Tarefa 6 — INVENTÁRIO: nenhum bloco do painel de hoje (spec §2.3, 19 blocos) sumiu.
 *
 * Varredura de FONTE (o projeto não tem teste de componente): `page.tsx` + o cliente, sem
 * comentários — a explicação de uma regra não pode satisfazer a própria varredura. Cada linha
 * é um bloco do §2.3 com o marcador dele ou o do SUBSTITUTO declarado no §4 ("Antes → depois").
 * Componente é conferido pelo USO (`<Componente`), não pelo import: o import sozinho continuaria
 * satisfazendo a varredura depois de o bloco sair da tela.
 */

const pasta = join(process.cwd(), "src", "app", "(app)", "dashboard", "financeiro");
const PAGINA = semComentarios(readFileSync(join(pasta, "page.tsx"), "utf8"));
const CLIENTE = semComentarios(readFileSync(join(pasta, "financial-dashboard-client.tsx"), "utf8"));
const TUDO = `${PAGINA}\n${CLIENTE}`;

/** [nº no §2.3 · bloco, marcador(es) — basta um]. O destino vem do §4, "Antes → depois". */
const BLOCOS: readonly (readonly [string, readonly string[]])[] = [
  ["1 · filtro de mês", ['type="month"']],
  ["1 · seletor de base", ["<SeletorDeVisao"]],
  ["2 · alertas", ["alertas"]],
  ["3 · saldo (→ indicador Saldo das contas)", ["saldoCom", "Saldo das contas"]],
  ["4 · entradas (→ indicador Minhas entradas)", ["Minhas entradas"]],
  ["5 · saídas (→ indicador Minhas saídas)", ["Minhas saídas"]],
  ["(novo) · De terceiros", ["De terceiros"]],
  ["6 · pendente do mês (→ Pendente de terceiros)", ["Pendente de terceiros"]],
  ["6 · rótulo do pendente do mês", ["rotuloPendenteDoMes"]],
  ["7 · bloco do caixa", ["<BlocoDoCaixa"]],
  ["8 · card-âncora (perdoado)", ["fraseDoPerdoado("]],
  ["9 · Gasto no cartão", ["Gasto no cartão"]],
  ["10 · Faturas (aberta/fechada)", ["Faturas (aberta/fechada)", '"Faturas"']],
  ["11 · Próximas contas a pagar", ["Próximas contas a pagar"]],
  ["12 · Cartão realmente meu", ["Cartão realmente meu"]],
  ["13 · categorias (→ rosca)", ["<RoscaCategoriasChart"]],
  ["14 · forma de pagamento", ["<FormaPagamentoChart"]],
  ["15 · entradas × saídas (→ barras)", ["<BarrasEntradasSaidasChart"]],
  ["16 · Meu mês a mês", ["<MesAMesChart"]],
  ["17 · projeção", ["<ProjecaoChart"]],
  ["18 · faturas dos próximos meses", ["<FaturasChart"]],
  ["19 · Próximas 6 faturas (→ Próximas faturas)", ["Próximas faturas"]],
  ["estado · caixa não lido", ["<CaixaNaoLido"]],
  ["estado · faturas sem total", ["<RodapeDasFaturasSemTotal"]],
  ["(novo) · Cartões de crédito", ["Cartões de crédito"]],
  ["(novo) · Últimas transações", ["Últimas transações"]],
];

describe("inventário do painel financeiro — nenhum bloco do §2.3 sumiu", () => {
  it.each(BLOCOS)("%s", (_nome, marcadores) => {
    expect(marcadores.some((m) => TUDO.includes(m))).toBe(true);
  });

  it("o gabarito cobre os 19 blocos do §2.3 (cada número de 1 a 19 aparece)", () => {
    const numeros = new Set(
      BLOCOS.map(([nome]) => /^(\d+) ·/.exec(nome)?.[1]).filter((n): n is string => n !== undefined),
    );
    for (let n = 1; n <= 19; n++) expect(numeros.has(String(n)), `bloco ${n}`).toBe(true);
  });

  it("o que foi SUBSTITUÍDO saiu do cliente (e continua existindo para /relatorios)", () => {
    expect(CLIENTE).not.toMatch(/\bCategoriaChart\b/);
    expect(CLIENTE).not.toMatch(/\bEvolucaoChart\b/);
    expect(CLIENTE).not.toContain("Próximas 6 faturas");
    expect(CLIENTE).not.toMatch(/\bapresentarEntradas\b/);
  });
});

describe("o banner é só do servidor", () => {
  it("BannerDeBoasVindas aparece em page.tsx e NÃO no cliente", () => {
    expect(PAGINA).toContain("BannerDeBoasVindas");
    expect(CLIENTE).not.toContain("BannerDeBoasVindas");
  });

  it("o cliente não importa o banner nem a montanha dele — recebe o banner pronto por prop", () => {
    expect(CLIENTE).not.toMatch(/banner-de-boas-vindas/);
    expect(CLIENTE).not.toMatch(/montanha/i);
    expect(CLIENTE).toMatch(/\bbanner\b/);
    expect(PAGINA).toMatch(/banner=\{/);
  });
});

describe("indicadores: o número de cada um sai da fonte certa", () => {
  /** O trecho do cliente entre dois marcadores — para a asserção valer só para o indicador pedido. */
  const trecho = (de: string, ate: string) => {
    const i = CLIENTE.indexOf(de);
    const j = CLIENTE.indexOf(ate, i + de.length);
    expect(i, `marcador ${de}`).toBeGreaterThanOrEqual(0);
    expect(j, `marcador ${ate}`).toBeGreaterThan(i);
    return CLIENTE.slice(i, j);
  };

  it("Minhas saídas, em competência, vale resumo.meu — nunca resumo.saidas (K1/K6)", () => {
    const saidas = trecho("const saidasInd", "const terceirosInd");
    expect(saidas).toContain("formatCurrency(resumo.meu)");
    expect(saidas).not.toContain("resumo.saidas");
  });

  it("De terceiros, em competência, vale resumo.terceiros", () => {
    const terceiros = trecho("const terceirosInd", "const comparacao");
    expect(terceiros).toContain("formatCurrency(resumo.terceiros)");
  });

  it("Minhas entradas, em competência, vem da função de apresentação do painel (entradasMeu), não do bruto", () => {
    expect(PAGINA).toContain("indicadorMinhasEntradas(resumo)");
    expect(CLIENTE).toContain("entradasInd.valor");
    expect(CLIENTE).not.toContain("resumo.entradas");
  });

  it("o saldo vem de saldoComData (corte em hoje), com erro de leitura declarado — nunca R$ 0,00", () => {
    expect(PAGINA).toContain("saldoComData(");
    expect(CLIENTE).toContain("Não foi possível ler o saldo");
  });

  it("em caixa, os três indicadores saem de indicadoresDoCaixa — e a leitura com erro vira texto, não número", () => {
    expect(CLIENTE).toContain("indicadoresDoCaixa(");
    // O cliente não lê graficos.minha direto para os indicadores: o erro seria esquecido.
    const topo = trecho("const saidasInd", "const terceirosInd");
    expect(topo).not.toContain("graficos.minha");
  });

  it("os quatro indicadores ficam dentro do OlhoDosValores, e só o Saldo leva o botão", () => {
    expect(CLIENTE).toContain("<OlhoDosValores");
    expect(CLIENTE).toContain("<BotaoDoOlho");
    expect(CLIENTE.match(/<BotaoDoOlho/g)).toHaveLength(1);
    expect(CLIENTE.match(/<Indicador\b/g)).toHaveLength(4);
    expect(PAGINA).toMatch(/valoresOcultos\(/);
  });
});
