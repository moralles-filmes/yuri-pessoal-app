import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hrefsDoPainel } from "@/lib/painel/hrefs-do-painel";
import { semComentarios } from "@/test/links-inline";

/**
 * 04-B, Tarefa 5 — o painel abre os registros de cada número.
 *
 * Varredura de FONTE (o projeto não tem teste de componente), sem comentários: a explicação de uma
 * regra não pode satisfazer a própria varredura. Prova três coisas que um teste de unidade não vê:
 * (1) a página monta o detalhe com as MESMAS variáveis do número — uma lista paralela faria o
 * número e os registros discordarem (o achado do §13.5 da 04-A2); (2) todo link de entrada existe
 * no cliente e os gráficos de mês a mês NÃO têm link (D-B-17); (3) a gaveta mora dentro do olho
 * (D-B-13), senão abrir com o olho fechado mostraria todos os valores.
 */

const pasta = join(process.cwd(), "src", "app", "(app)", "dashboard", "financeiro");
const PAGINA = semComentarios(readFileSync(join(pasta, "page.tsx"), "utf8"));
const CLIENTE = semComentarios(readFileSync(join(pasta, "financial-dashboard-client.tsx"), "utf8"));

/** O texto de uma tag JSX de auto-fechamento, de `<Nome` até o primeiro `/>`. */
function tag(fonte: string, nome: string): string {
  const i = fonte.indexOf(`<${nome}`);
  expect(i, `tag <${nome}`).toBeGreaterThanOrEqual(0);
  const j = fonte.indexOf("/>", i);
  expect(j, `fim da tag <${nome}`).toBeGreaterThan(i);
  return fonte.slice(i, j + 2);
}

/** O corpo de uma chamada `nome({ … })`, por contagem de chaves. */
function chamada(fonte: string, nome: string): string {
  const i = fonte.indexOf(`${nome}({`);
  expect(i, `chamada ${nome}`).toBeGreaterThanOrEqual(0);
  let fundo = 0;
  for (let k = i + nome.length + 1; k < fonte.length; k++) {
    if (fonte[k] === "{") fundo++;
    else if (fonte[k] === "}" && --fundo === 0) return fonte.slice(i, k + 1);
  }
  throw new Error(`chamada ${nome} sem fechamento`);
}

describe("a página monta o detalhe a partir das MESMAS entradas do número", () => {
  const detalhe = chamada(PAGINA, "detalheDoNumero");

  it("as variáveis do resumo (txs/sts/recs/inst) são as que a página desestrutura da leitura", () => {
    // De onde vêm: a leitura do motor, uma única vez.
    expect(PAGINA).toMatch(
      /const\s*\{\s*txs,\s*sts,\s*recs,\s*inst,\s*cards:\s*dashCards,\s*recorrencias,\s*bills:\s*dashBills\s*\}\s*=\s*entradas;/,
    );
    // O número: resumoMes sobre elas.
    expect(PAGINA).toMatch(
      /resumoMes\(\{\s*mes:\s*mesSel,\s*transactions:\s*txs,\s*statements:\s*sts,\s*receivables:\s*recs\s*\}\)/,
    );
    // Os registros: detalheDoNumero sobre as MESMAS, na mesma ordem — nenhuma lista paralela.
    expect(detalhe).toMatch(
      /entradas:\s*\{\s*txs,\s*sts,\s*recs,\s*inst,\s*cards:\s*dashCards,\s*recorrencias,\s*bills:\s*dashBills\s*\}/,
    );
  });

  it("o mês, o hoje, a base, a completude e os recebíveis crus também são os da página", () => {
    expect(detalhe).toMatch(/\bmes:\s*mesSel\b/);
    expect(detalhe).toMatch(/\bhoje,/);
    expect(detalhe).toMatch(/\bbase,/);
    expect(detalhe).toMatch(/\bcompletude,/);
    expect(detalhe).toMatch(/recebiveisCrus:\s*recebiveis\b/);
  });

  it("na base caixa o detalhe usa a leitura e o motor que alimentaram o número (lerEstadoDoCaixa)", () => {
    expect(PAGINA).toContain("lerEstadoDoCaixa(");
    expect(PAGINA).not.toMatch(/\bestadoDoCaixa\(/);
    expect(detalhe).toMatch(/leitura:\s*doCaixa\.leitura,\s*motor:\s*doCaixa\.motorDoCaixa/);
  });

  it("o saldo por conta só é lido com a gaveta aberta no saldo (uma chamada por conta)", () => {
    expect(PAGINA).toMatch(/pedido\?\.chave\s*===\s*"saldo"/);
    expect(PAGINA).toMatch(/lerSaldoAte\(corte,\s*conta\.id\)/);
  });

  it("a página entrega ao cliente a vista pronta, a URL ao fechar e as URLs de cada número", () => {
    expect(PAGINA).toMatch(/vistaDaGaveta\(detalhe\)/);
    expect(PAGINA).toMatch(/hrefsDoPainel\(\{/);
    expect(PAGINA).toMatch(/vista=\{vista\}/);
    expect(PAGINA).toMatch(/hrefs=\{hrefs\}/);
    expect(PAGINA).toMatch(/urlAoFechar=\{urlSemDetalhe\("\/dashboard\/financeiro",\s*sp\)\}/);
    expect(PAGINA).toMatch(/pedidoDaUrl\(sp\)/);
  });
});

describe("os links de entrada", () => {
  const chaves = Object.keys(
    hrefsDoPainel({
      sp: {},
      base: "competencia",
      pessoas: [],
      categorias: [],
      formas: [],
      faturas: [],
      meses: [],
    }),
  );

  it("o gabarito leu as chaves reais de hrefsDoPainel (não uma lista escrita à mão)", () => {
    expect(chaves.length).toBeGreaterThanOrEqual(14);
  });

  it.each(chaves)("hrefs.%s aparece no cliente", (chave) => {
    expect(CLIENTE).toContain(`hrefs.${chave}`);
  });

  it("os quatro indicadores recebem hrefs.", () => {
    for (const k of ["saldo", "entradas", "saidas", "terceiros"]) {
      expect(CLIENTE, k).toMatch(new RegExp(`href=\\{hrefs\\.${k}\\}`));
    }
    // Nenhum indicador aponta mais para Lançamentos direto.
    expect(CLIENTE).not.toMatch(/href=\{`\/financeiro\/lancamentos\?type=/);
  });

  it("o cliente não monta URL do detalhe (ela vem pronta do servidor)", () => {
    expect(CLIENTE).not.toMatch(/detalhe=/);
    expect(CLIENTE).not.toMatch(/urlComDetalhe|pedidoDaUrl|URLSearchParams\(\)\.set\("detalhe/);
  });

  it("os links por fatia ficam ABAIXO dos gráficos, fora do SVG: as tags dos gráficos não têm href", () => {
    for (const nome of ["RoscaCategoriasChart", "FormaPagamentoChart", "ProjecaoChart"]) {
      expect(tag(CLIENTE, nome), nome).not.toMatch(/href/);
    }
  });
});

describe("gráficos de mês a mês não abrem registros (D-B-17)", () => {
  it.each(["BarrasEntradasSaidasChart", "MesAMesChart"])("<%s> não leva link", (nome) => {
    expect(tag(CLIENTE, nome)).not.toMatch(/href|onClick|Link/);
  });

  it("a frase do desenho está na tela, ao lado dos gráficos de mês a mês", () => {
    expect(CLIENTE).toContain("Para ver os registros de um mês, escolha o mês no topo.");
    expect(CLIENTE.match(/\{FRASE_DO_MES\}/g)).toHaveLength(2);
  });
});

describe("a gaveta e o olho dos valores", () => {
  it("<GavetaDeRegistros> está DENTRO de <OlhoDosValores> (o portal só alcança o olho pelo contexto)", () => {
    const abre = CLIENTE.indexOf("<OlhoDosValores");
    const gaveta = CLIENTE.indexOf("<GavetaDeRegistros");
    const fecha = CLIENTE.indexOf("</OlhoDosValores>");
    expect(abre).toBeGreaterThanOrEqual(0);
    expect(gaveta).toBeGreaterThan(abre);
    expect(fecha).toBeGreaterThan(gaveta);
    expect(CLIENTE.match(/<GavetaDeRegistros/g)).toHaveLength(1);
  });

  it("a gaveta recebe a vista pronta, a URL ao fechar e o link para Lançamentos", () => {
    const t = tag(CLIENTE, "GavetaDeRegistros");
    expect(t).toMatch(/vista=\{vista\}/);
    expect(t).toMatch(/urlAoFechar=\{urlAoFechar\}/);
    expect(t).toMatch(/linkLancamentos=\{linkLancamentos\}/);
  });
});

describe("a base caixa não oferece o que ela não calcula", () => {
  it("o bloco do caixa recebe hrefs.caixa (sete linhas) e só na base caixa", () => {
    expect(CLIENTE).toMatch(/<BlocoDoCaixa[^>]*hrefs=\{hrefs\.caixa\}/);
    expect(CLIENTE).toMatch(/base === "caixa" && caixa/);
  });
});
