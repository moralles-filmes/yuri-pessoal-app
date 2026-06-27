/**
 * Fase 06 — Parsing de Excel (.xlsx/.xls) via SheetJS. Server-only (chamado pelas Server
 * Actions). Lê a primeira planilha como matriz de células e devolve a `ParsedTable` consumida
 * pela mesma pipeline de mapeamento/normalização. Datas são emitidas em ISO 'yyyy-MM-dd'
 * (parseDataIso entende) e números viram texto cru (parseValorCentavos entende).
 */
import * as XLSX from "xlsx";
import { detectHeaderRow } from "@/lib/import/mapping";
import type { ParsedTable } from "@/lib/import/types";

/** Converte uma célula (Date/number/string) em texto previsível para a normalização. */
function cellToString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).trim();
}

/** Lê o buffer de um arquivo Excel e devolve a 1ª planilha como `ParsedTable`. */
export function parseXlsx(buffer: ArrayBuffer | Uint8Array): ParsedTable {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };

  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    blankrows: false,
    defval: "",
  });

  const data = aoa
    .map((r) => r.map(cellToString).map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== ""));
  if (data.length === 0) return { headers: [], rows: [] };

  // O cabeçalho não é assumido na 1ª linha: faturas/extratos trazem título/resumo antes da tabela.
  const h = detectHeaderRow(data);
  const headers = data[h];
  const rows = data.slice(h + 1).map((r) => headers.map((_, i) => r[i] ?? ""));
  return { headers, rows };
}
