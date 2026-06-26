/**
 * Fase 14 — Geração de CSV (pura) para exportação de relatórios. Usa ';' como
 * separador (padrão do Excel em pt-BR) e escapa aspas/quebras conforme RFC 4180.
 * Testada em csv.test.ts.
 */

/** Escapa um valor para uma célula CSV. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Converte uma lista de objetos em CSV com cabeçalho. As colunas vêm de `headers`
 * (ou das chaves do 1º objeto). Retorna apenas o cabeçalho quando não há linhas.
 */
export function toCsv(
  rows: Record<string, unknown>[],
  headers?: string[],
): string {
  const cols = headers ?? (rows[0] ? Object.keys(rows[0]) : []);
  const head = cols.map(cell).join(";");
  if (rows.length === 0) return head;
  const body = rows
    .map((r) => cols.map((c) => cell(r[c])).join(";"))
    .join("\r\n");
  return `${head}\r\n${body}`;
}
