/**
 * Fase 06 — Detecção automática e aplicação do mapeamento de colunas (lógica PURA, testada
 * em mapping.test.ts). Transforma a `ParsedTable` (cabeçalho + células) em `NormalizedRow[]`
 * já com data/valor/parcela normalizados, tipo derivado e categoria sugerida — pronto para a
 * deduplicação. Não toca no banco; a persistência fica nas Server Actions.
 */
import {
  HEADER_KEYWORDS,
  type MappingField,
} from "@/lib/import/constants";
import {
  normalizarDescricao,
  parseDataIso,
  parseParcela,
  parseValorCentavos,
  semAcento,
} from "@/lib/import/normalize";
import { sugerirCategoriaId } from "@/lib/import/categorize";
import type {
  ColumnMapping,
  NormalizeOptions,
  NormalizedRow,
  ParsedTable,
} from "@/lib/import/types";

/**
 * Ordem de resolução da detecção (não a ordem de exibição). `data`/`valor` (mais distintivos)
 * primeiro; `parcelas_total` antes de `parcela` para que a coluna "Parcelas" vire o total, não
 * a parcela atual; cada coluna é usada por no máximo um campo.
 */
const DETECTION_ORDER: MappingField[] = [
  "data",
  "valor",
  "descricao",
  "parcelas_total",
  "parcela",
  "categoria",
  "conta_cartao",
  "identificador",
];

/**
 * Acha a linha de cabeçalho real numa matriz de células. Muitos extratos/faturas trazem linhas
 * de título/resumo antes da tabela (nome, agência, "Fatura Fechada", subtotais). Escolhe a 1ª
 * linha (nas ~30 primeiras) cujo `autoDetectMapping` já resolve DATA e VALOR (as colunas
 * essenciais). Sem candidata, devolve 0 (1ª linha) — mantém o comportamento atual para arquivos
 * já tabulares. Exigir data E valor na MESMA linha evita falso-positivo em linhas de resumo que
 * têm só "Valor"/"R$".
 */
export function detectHeaderRow(rows: string[][]): number {
  const limit = Math.min(rows.length, 30);
  for (let i = 0; i < limit; i++) {
    const m = autoDetectMapping(rows[i]);
    if (m.data != null && m.valor != null) return i;
  }
  return 0;
}

/** Detecta o mapeamento das colunas pelo cabeçalho (ver DETECTION_ORDER). */
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const norm = headers.map((h) => semAcento(h ?? "").trim());
  const usados = new Set<number>();
  const mapping: ColumnMapping = {};

  for (const field of DETECTION_ORDER) {
    const keywords = HEADER_KEYWORDS[field];
    const idx = norm.findIndex(
      (h, i) => !usados.has(i) && h !== "" && keywords.some((k) => h.includes(k)),
    );
    if (idx >= 0) {
      mapping[field] = idx;
      usados.add(idx);
    }
  }
  return mapping;
}

/** Lê a célula de uma coluna mapeada (string, trim) ou null se não mapeada/ausente. */
function cell(raw: string[], idx: number | undefined): string | null {
  if (idx == null) return null;
  const v = raw[idx];
  return v == null ? null : String(v).trim();
}

/**
 * Descobre a CONVENÇÃO DE SINAL do arquivo: true quando valores negativos são as saídas
 * (compras/despesas) e positivos são os créditos.
 *
 * Faturas de cartão não têm convenção única — e assumir uma delas foi um bug real: o OFX
 * (padrão do Nubank e da maioria dos bancos) traz COMPRA com `TRNAMT` negativo e crédito
 * positivo, enquanto o CSV/XLSX de fatura (Itaú, Nubank) traz compra positiva e estorno
 * negativo. Com a convenção errada, a fatura inteira entrava como estorno e o total ficava
 * NEGATIVO.
 *
 * O critério é a CONTAGEM de linhas, não a soma: numa fatura a maioria das linhas é compra,
 * enquanto o pagamento da fatura anterior — uma única linha — tem magnitude parecida com a
 * soma de todas as compras e empataria uma decisão por valor. Pelo mesmo motivo o pagamento
 * fica FORA da amostra: ele é a linha de crédito garantida de toda fatura e envenenaria a
 * contagem num arquivo curto. Empate ou arquivo sem sinal devolve `false` (positivo =
 * despesa), que é a convenção das planilhas de fatura.
 */
export function detectarSinalNegativoDespesa(
  table: ParsedTable,
  mapping: ColumnMapping,
): boolean {
  if (mapping.valor == null) return false;
  let negativos = 0;
  let positivos = 0;
  for (const raw of table.rows) {
    const v = parseValorCentavos(cell(raw, mapping.valor));
    if (v == null || v === 0) continue;
    if (ehPagamentoFatura(cell(raw, mapping.descricao))) continue;
    if (v < 0) negativos++;
    else positivos++;
  }
  return negativos > positivos;
}

/**
 * True quando a descrição de uma linha de fatura é claramente o PAGAMENTO da fatura (anterior),
 * e não um lançamento a importar. Só faz sentido aplicar a valores NEGATIVOS (créditos), para não
 * confundir com uma compra que por acaso cite "pagamento". O texto é normalizado (sem acento,
 * minúsculo, sem pontuação) antes de casar palavras inteiras.
 */
export function ehPagamentoFatura(descricao: string | null | undefined): boolean {
  const d = normalizarDescricao(descricao);
  if (!d) return false;
  return /\b(pagamento|pagto|pgto)\b/.test(d);
}

/** Resolve a categoria: usa a coluna mapeada se casar com uma categoria; senão a heurística. */
function resolverCategoria(
  descricao: string,
  categoriaCelula: string | null,
  options: NormalizeOptions,
): string | null {
  if (categoriaCelula) {
    const alvo = semAcento(categoriaCelula).trim();
    const match = options.categorias.find(
      (c) => semAcento(c.name).trim() === alvo,
    );
    if (match) return match.id;
  }
  return sugerirCategoriaId(descricao, options.categorias);
}

/**
 * Aplica o mapeamento a cada linha de dados, produzindo `NormalizedRow[]`. Linhas com data ou
 * valor inválidos saem com status 'erro' (com motivo claro). O `tipo` sai da convenção de sinal
 * do lote (`sinalNegativoDespesa`) — em fatura, detectada do arquivo; o valor é sempre gravado
 * em magnitude. A deduplicação é aplicada DEPOIS (dedup.ts) sobre estas linhas.
 */
export function applyMapping(
  table: ParsedTable,
  mapping: ColumnMapping,
  options: NormalizeOptions,
): NormalizedRow[] {
  return table.rows.map((raw, i) => {
    const linhaIndex = i + 1;
    const descricaoCelula = cell(raw, mapping.descricao) ?? "";
    const descricao = descricaoCelula.replace(/\s+/g, " ").trim();
    const dataNorm = parseDataIso(cell(raw, mapping.data));
    const valorAssinado = parseValorCentavos(cell(raw, mapping.valor));

    // Parcela: coluna dedicada, ou "k/N" embutido na descrição/coluna de parcela.
    const parcelaCelula = cell(raw, mapping.parcela);
    const totalCelula = cell(raw, mapping.parcelas_total);
    let parcela: number | null = null;
    let parcelasTotal: number | null = null;
    const embutido =
      parseParcela(parcelaCelula) ?? parseParcela(descricaoCelula);
    if (embutido) {
      parcela = embutido.parcela;
      parcelasTotal = embutido.total;
    } else {
      const p = parcelaCelula ? Number.parseInt(parcelaCelula, 10) : NaN;
      const t = totalCelula ? Number.parseInt(totalCelula, 10) : NaN;
      if (Number.isInteger(t) && t > 1) {
        parcelasTotal = t;
        parcela = Number.isInteger(p) && p >= 1 && p <= t ? p : 1;
      }
    }

    const identificador = cell(raw, mapping.identificador) || null;
    const categoriaSugeridaId = resolverCategoria(
      descricao,
      cell(raw, mapping.categoria),
      options,
    );

    const base: NormalizedRow = {
      linhaIndex,
      raw,
      dataNorm,
      descricao,
      valorCentavos: null,
      tipo: null,
      parcela,
      parcelasTotal,
      identificador,
      categoriaSugeridaId,
      status: "pendente",
      motivo: null,
    };

    if (mapping.data == null || mapping.valor == null) {
      return { ...base, status: "erro", motivo: "Mapeie as colunas de data e valor." };
    }
    if (dataNorm == null) {
      return { ...base, status: "erro", motivo: "Data inválida." };
    }
    if (valorAssinado == null || valorAssinado === 0) {
      return { ...base, status: "erro", motivo: "Valor inválido." };
    }

    const magnitude = Math.abs(valorAssinado);
    // A convenção de sinal vale para as DUAS origens (ver detectarSinalNegativoDespesa):
    // em fatura ela é detectada do próprio arquivo; em extrato vem do lote.
    const ehDespesa = options.sinalNegativoDespesa
      ? valorAssinado < 0
      : valorAssinado > 0;
    const tipo: "despesa" | "receita" = ehDespesa ? "despesa" : "receita";

    // Fatura de cartão: o lado CRÉDITO é estorno (receita, que reduz a fatura) ou o pagamento
    // da fatura anterior — este não é lançamento, então auto-ignora. O estorno entra como
    // receita vinculada à fatura no commit (subtrai do total_atual).
    if (options.origem === "cartao" && !ehDespesa && ehPagamentoFatura(descricao)) {
      return {
        ...base,
        valorCentavos: magnitude,
        tipo,
        status: "ignorada",
        motivo: "Pagamento da fatura — não é um lançamento.",
      };
    }

    return { ...base, valorCentavos: magnitude, tipo };
  });
}

/** Re-exporta para a UI mostrar o texto-base usado na dedup (debug/explicação). */
export { normalizarDescricao };
