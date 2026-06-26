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
 * valor inválidos saem com status 'erro' (com motivo claro). O `tipo` é derivado da origem:
 * cartão → sempre despesa (magnitude); conta → despesa/receita pelo sinal (convenção do lote).
 * A deduplicação é aplicada DEPOIS (dedup.ts) sobre estas linhas.
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
    let tipo: "despesa" | "receita";
    if (options.origem === "cartao") {
      // Fatura de cartão: linhas são despesas (estornos/pagamentos são exceção e ficam editáveis).
      tipo = "despesa";
    } else {
      const ehDespesa = options.sinalNegativoDespesa
        ? valorAssinado < 0
        : valorAssinado > 0;
      tipo = ehDespesa ? "despesa" : "receita";
    }

    return { ...base, valorCentavos: magnitude, tipo };
  });
}

/** Re-exporta para a UI mostrar o texto-base usado na dedup (debug/explicação). */
export { normalizarDescricao };
