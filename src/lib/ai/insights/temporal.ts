/**
 * Fase 18-E — IA · AGREGAÇÃO TEMPORAL. Média, comparação e variação. Puro, sem I/O.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ESTE É O ARQUIVO QUE TORNA O ITEM 8-D DO PROMPT-BASE OBSOLETO.                         ║
 * ║                                                                                       ║
 * ║ Até a v2 o prompt dizia, com teste, que "médias, comparações entre dois períodos,     ║
 * ║ variações e percentuais de evolução não são calculados por nenhuma ferramenta". Era    ║
 * ║ verdade — e virou mentira no instante em que este módulo passou a existir, exatamente  ║
 * ║ como a v1 virou mentira quando a 18-B passou a ler Treinos. Daí a `seguranca-v3`.      ║
 * ║                                                                                       ║
 * ║ ⛔ A proibição ao MODELO não caiu; ela mudou de forma. Deixou de ser "esse número não   ║
 * ║ existe" e passou a ser "esse número não é seu para calcular".                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⛔ **ELE NÃO IMPORTA `resumoMes`, `metrics.ts` NEM `calc.ts`** — quem os chama são os
 * coletores. É a invariante 31 escrita como grafo de imports: este módulo AGREGA sobre o que
 * eles devolvem; não recalcula o que eles já calculam. Uma segunda soma aqui faria o insight
 * discordar da tela no primeiro campo novo.
 *
 * ⚠️ **As quatro recusas abaixo não são zelo — cada uma é uma invariante já paga em outro
 * módulo**, e devolver `0` no lugar de `null` seria desfazê-la:
 *
 *   janela incompleta        → `null` + motivo   (Dieta 21 — média móvel só com a janela cheia)
 *   sem período anterior     → `null` + "sem base" (Treinos 21)
 *   base zero                → `null` + motivo   (nunca `Infinity`, nunca `NaN`, nunca "+∞%")
 *   algum ponto `parcial`    → resultado `parcial` com o motivo do pior ponto (Dieta 15/Treinos 12)
 *
 * Puro, `hoje` injetado nas janelas, aritmética em `Date.UTC` — data pura é TEXTO e nunca vira
 * `Date` local, senão o dia vira o anterior entre 21h e 00h de Brasília.
 */

import type {
  Comparacao,
  Indicador,
  PeriodoDoIndicador,
  PontoDaSerie,
  QualidadeDoIndicador,
  SerieTemporal,
} from "./contracts";

/* ────────────────────────────── qualidade ────────────────────────────── */

/**
 * A pior qualidade vence, e o motivo viaja com ela. É a mesma regra que faz a `completude` de
 * um total da Dieta sair do PIOR nutriente: um agregado é tão confiável quanto o seu pior
 * ponto, e apresentar a média de uma série com um buraco como "exata" é a mentira que os dois
 * módulos já pagaram para não contar.
 */
function piorQualidade(
  pontos: readonly { qualidade: QualidadeDoIndicador; motivo_incompleto?: string }[],
): { qualidade: QualidadeDoIndicador; motivo_incompleto?: string } {
  const ruim = pontos.find((p) => p.qualidade === "parcial");
  if (!ruim) return { qualidade: "exato" };
  return {
    qualidade: "parcial",
    motivo_incompleto: ruim.motivo_incompleto ?? "algum período entrou incompleto",
  };
}

/** Monta um indicador ausente com o motivo obrigatório — nunca `valor: 0`. */
function indisponivel(
  molde: Omit<Indicador, "valor" | "qualidade" | "motivo_incompleto"> & {
    readonly indisponivel_porque: string;
  },
): Indicador {
  return { ...molde, valor: null, qualidade: "exato" };
}

/* ────────────────────────────── média ────────────────────────────── */

/**
 * A média dos últimos `janela` períodos da série.
 *
 * ⛔ **JANELA CHEIA OU NADA.** Uma "média de 7 dias" calculada sobre 5 dias medidos é um
 * número diferente com o mesmo nome — e o leitor não tem como saber. A alternativa (dividir
 * pelo que existe) esconde o buraco no denominador; a alternativa pior (contar o dia sem
 * registro como zero) inventa um dado. As duas já foram recusadas na 16-E, e a recusa vale
 * aqui inteira.
 *
 * ⚠️ **O buraco não é descartado em silêncio:** `n` diz quantos períodos foram MEDIDOS, e o
 * motivo escreve "N de M" — então quem lê sabe o tamanho do buraco, e não só que ele existe.
 */
export function media(serie: SerieTemporal, janela: number): Indicador {
  const molde = {
    id: `${serie.id}.media_${janela}`,
    modulo: serie.modulo,
    rotulo: `${serie.rotulo} — média de ${janela} ${janela === 1 ? "período" : "períodos"}`,
    unidade: serie.unidade,
    periodo: periodoDaSerie(serie.pontos.slice(-Math.max(janela, 1))),
    rota: serie.rota,
    ...(serie.regra_de_contagem ? { regra_de_contagem: serie.regra_de_contagem } : {}),
  };

  if (!Number.isInteger(janela) || janela < 1) {
    return indisponivel({
      ...molde,
      n: 0,
      indisponivel_porque: "a janela pedida não é um número de períodos válido",
    });
  }

  if (serie.pontos.length < janela) {
    return indisponivel({
      ...molde,
      n: serie.pontos.filter((p) => p.valor !== null).length,
      indisponivel_porque: `a média pedida cobre ${janela} períodos e a série tem ${serie.pontos.length}`,
    });
  }

  const ultimos = serie.pontos.slice(-janela);
  const medidos = ultimos.filter((p) => p.valor !== null);

  if (medidos.length < janela) {
    return indisponivel({
      ...molde,
      n: medidos.length,
      indisponivel_porque: `${medidos.length} de ${janela} períodos têm registro — a média só sai com a janela cheia`,
    });
  }

  const soma = medidos.reduce((acc, p) => acc + (p.valor as number), 0);

  return {
    ...molde,
    valor: soma / janela,
    n: janela,
    ...piorQualidade(ultimos),
  };
}

/* ────────────────────────── variação percentual ────────────────────────── */

export type VariacaoCalculada = {
  readonly valor: number | null;
  readonly indisponivel_porque?: string;
};

/**
 * Quanto `atual` variou em relação a `base`, em porcentagem.
 *
 * ⛔ **BASE ZERO NÃO VIRA `Infinity`.** Em JavaScript `(40 - 0) / 0 * 100` é `Infinity`, e
 * `(0 - 0) / 0` é `NaN`. Os dois atravessariam o resto do sistema calados: `Infinity` vira
 * "∞%" na tela, e `NaN` vira "NaN%" ou, pior, some numa comparação e o insight sai afirmando
 * outra coisa. De 0 para 40 a variação percentual não é grande — ela **não existe**, porque
 * não há do que tirar porcentagem. O fato ("era zero, agora são 40") continua dizível pela
 * diferença absoluta.
 */
export function variacaoPercentual(
  base: number | null,
  atual: number | null,
): VariacaoCalculada {
  if (base === null || atual === null) {
    return { valor: null, indisponivel_porque: "um dos dois períodos não foi medido" };
  }
  if (!Number.isFinite(base) || !Number.isFinite(atual)) {
    return { valor: null, indisponivel_porque: "um dos dois valores não é um número finito" };
  }
  if (base === 0) {
    return {
      valor: null,
      indisponivel_porque:
        "o período anterior é zero, e não há do que tirar porcentagem — a diferença absoluta continua valendo",
    };
  }
  return { valor: ((atual - base) / Math.abs(base)) * 100 };
}

/* ────────────────────────────── comparação ────────────────────────────── */

/**
 * Compara o período atual com o anterior, devolvendo os dois indicadores derivados —
 * diferença absoluta e variação percentual — já no formato citável por token.
 *
 * ⛔ **UNIDADES DIFERENTES NÃO SE COMPARAM.** É a invariante 1 dos Treinos aplicada ao tempo:
 * `tracking_type` é contrato de medição, e comparar 12 sessões com 4.800 kg produziria um
 * número com aparência de fato. A recusa é explícita, não um `if` esquecido.
 *
 * ⚠️ **`anterior: null` NÃO é `anterior: 0`.** Não ter base é diferente de a base ser zero, e
 * os dois têm motivos diferentes escritos. Treinos 21.
 */
export function comparar(atual: Indicador, anterior: Indicador | null): Comparacao {
  const periodo = anterior
    ? { de: anterior.periodo.de, ate: atual.periodo.ate }
    : atual.periodo;
  const n = atual.n + (anterior?.n ?? 0);
  const regra = atual.regra_de_contagem
    ? { regra_de_contagem: atual.regra_de_contagem }
    : {};

  const comumDiferenca = {
    id: `${atual.id}.diferenca`,
    modulo: atual.modulo,
    rotulo: `${atual.rotulo} — diferença para o período anterior`,
    unidade: atual.unidade,
    periodo,
    rota: atual.rota,
    ...regra,
  };
  const comumVariacao = {
    id: `${atual.id}.variacao`,
    modulo: atual.modulo,
    rotulo: `${atual.rotulo} — variação para o período anterior`,
    unidade: "%",
    periodo,
    rota: atual.rota,
    ...regra,
  };

  const semBase = (molde: typeof comumDiferenca | typeof comumVariacao, porque: string) =>
    indisponivel({ ...molde, n, indisponivel_porque: porque });

  if (!anterior) {
    const porque = "não há período anterior medido para comparar";
    return {
      atual,
      anterior: null,
      diferenca: semBase(comumDiferenca, porque),
      variacao: semBase(comumVariacao, porque),
    };
  }

  if (anterior.unidade !== atual.unidade) {
    const porque = `os dois períodos foram medidos em unidades diferentes (${atual.unidade} e ${anterior.unidade})`;
    return {
      atual,
      anterior,
      diferenca: semBase(comumDiferenca, porque),
      variacao: semBase(comumVariacao, porque),
    };
  }

  if (atual.valor === null || anterior.valor === null) {
    const qual = atual.valor === null ? atual : anterior;
    const porque =
      qual.indisponivel_porque ?? "um dos dois períodos não foi medido";
    return {
      atual,
      anterior,
      diferenca: semBase(comumDiferenca, porque),
      variacao: semBase(comumVariacao, porque),
    };
  }

  const qualidade = piorQualidade([atual, anterior]);
  const percentual = variacaoPercentual(anterior.valor, atual.valor);

  return {
    atual,
    anterior,
    diferenca: {
      ...comumDiferenca,
      valor: atual.valor - anterior.valor,
      n,
      ...qualidade,
    },
    variacao:
      percentual.valor === null
        ? semBase(comumVariacao, percentual.indisponivel_porque ?? "variação indisponível")
        : { ...comumVariacao, valor: percentual.valor, n, ...qualidade },
  };
}

/* ─────────────────── janelas de período (aritmética em Date.UTC) ─────────────────── */

/**
 * O período que uma sequência de pontos cobre. Série vazia devolve um período degenerado com a
 * data de hoje impossível de saber aqui — por isso a função exige ao menos um ponto no
 * caminho normal e devolve `{de:"", ate:""}` só quando não há nada, caso em que o indicador já
 * sai indisponível e o período não é lido.
 */
function periodoDaSerie(pontos: readonly PontoDaSerie[]): PeriodoDoIndicador {
  if (pontos.length === 0) return { de: "0001-01-01", ate: "0001-01-01" };
  return { de: pontos[0].periodo.de, ate: pontos[pontos.length - 1].periodo.ate };
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/**
 * Soma dias a uma data PURA, em `Date.UTC`.
 *
 * ⚠️ `new Date("2026-08-09")` já é interpretado como UTC, mas `new Date(2026, 7, 9)` é local —
 * e a segunda forma, somada com fuso negativo, devolve o dia anterior. Aqui a data entra e sai
 * como TEXTO, e o `Date` só existe entre as duas linhas.
 */
export function somarDias(data: string, dias: number): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const t = new Date(Date.UTC(ano, mes - 1, dia) + dias * 86_400_000);
  return `${t.getUTCFullYear()}-${doisDigitos(t.getUTCMonth() + 1)}-${doisDigitos(t.getUTCDate())}`;
}

/** O último dia do mês da data, como texto. `Date.UTC(a, m, 0)` é o dia 0 do mês seguinte. */
export function fimDoMes(data: string): string {
  const [ano, mes] = data.split("-").map(Number);
  const t = new Date(Date.UTC(ano, mes, 0));
  return `${t.getUTCFullYear()}-${doisDigitos(t.getUTCMonth() + 1)}-${doisDigitos(t.getUTCDate())}`;
}

/**
 * Os últimos `quantos` dias, um período por dia, terminando em `hoje` (inclusive).
 * Ordem cronológica crescente — a mesma que `media` espera.
 */
export function janelaDeDias(hoje: string, quantos: number): PeriodoDoIndicador[] {
  if (!Number.isInteger(quantos) || quantos < 1) return [];
  const saida: PeriodoDoIndicador[] = [];
  for (let i = quantos - 1; i >= 0; i--) {
    const dia = somarDias(hoje, -i);
    saida.push({ de: dia, ate: dia });
  }
  return saida;
}

/**
 * Os últimos `quantos` meses de calendário, terminando no mês de `hoje` (inclusive).
 *
 * ⚠️ **O último período está EM CURSO**, e quem chama precisa saber: um insight que compare o
 * mês corrente (9 dias) com o mês passado (31 dias) compara coisas diferentes. Quem decide
 * isso é o coletor — esta função só recorta o calendário. É também o que faz `expiry.ts`
 * expirar o insight quando o período fecha.
 */
export function janelaDeMeses(hoje: string, quantos: number): PeriodoDoIndicador[] {
  if (!Number.isInteger(quantos) || quantos < 1) return [];
  const [ano, mes] = hoje.split("-").map(Number);
  const saida: PeriodoDoIndicador[] = [];
  for (let i = quantos - 1; i >= 0; i--) {
    const t = new Date(Date.UTC(ano, mes - 1 - i, 1));
    const de = `${t.getUTCFullYear()}-${doisDigitos(t.getUTCMonth() + 1)}-01`;
    saida.push({ de, ate: fimDoMes(de) });
  }
  return saida;
}
