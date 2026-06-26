/**
 * Fase 06 — Parsing de CSV via papaparse (detecção automática de separador, aspas e BOM).
 * Server-only (chamado pelas Server Actions). Devolve a `ParsedTable` consumida pela mesma
 * pipeline de mapeamento/normalização do CSV/Excel/OFX.
 */
import Papa from "papaparse";
import type { ParsedTable } from "@/lib/import/types";

/** Converte o texto de um CSV em `ParsedTable` (1ª linha não-vazia = cabeçalho). */
export function parseCsv(content: string): ParsedTable {
  const result = Papa.parse<string[]>(content, {
    delimiter: "", // auto-detecta , ; \t |
    skipEmptyLines: "greedy",
  });

  const data = (result.data as string[][]).filter((r) =>
    r.some((c) => String(c ?? "").trim() !== ""),
  );
  if (data.length === 0) return { headers: [], rows: [] };

  const headers = data[0].map((h) => String(h ?? "").trim());
  const rows = data
    .slice(1)
    .map((r) => headers.map((_, i) => String(r[i] ?? "").trim()));
  return { headers, rows };
}
