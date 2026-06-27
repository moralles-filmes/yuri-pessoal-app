/**
 * Fase 06 — Parsing de CSV via papaparse (detecção automática de separador, aspas e BOM).
 * Server-only (chamado pelas Server Actions). Devolve a `ParsedTable` consumida pela mesma
 * pipeline de mapeamento/normalização do CSV/Excel/OFX.
 */
import Papa from "papaparse";
import { detectHeaderRow } from "@/lib/import/mapping";
import type { ParsedTable } from "@/lib/import/types";

/**
 * Converte o texto de um CSV em `ParsedTable`. O cabeçalho NÃO é assumido como a 1ª linha:
 * faturas/extratos costumam trazer linhas de título/resumo antes da tabela, então
 * `detectHeaderRow` acha a linha real (data + valor) e as linhas de dados saem a partir dela.
 */
export function parseCsv(content: string): ParsedTable {
  const result = Papa.parse<string[]>(content, {
    delimiter: "", // auto-detecta , ; \t |
    skipEmptyLines: "greedy",
  });

  const matrix = (result.data as string[][])
    .map((r) => r.map((c) => String(c ?? "").trim()))
    .filter((r) => r.some((c) => c !== ""));
  if (matrix.length === 0) return { headers: [], rows: [] };

  const h = detectHeaderRow(matrix);
  const headers = matrix[h];
  const rows = matrix.slice(h + 1).map((r) => headers.map((_, i) => r[i] ?? ""));
  return { headers, rows };
}
