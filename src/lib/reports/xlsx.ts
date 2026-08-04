/**
 * Fase 16-F — exportação em XLSX (client-side).
 *
 * O CSV continua sendo o padrão do projeto (Fase 14 / 16-E): é texto, abre em qualquer lugar
 * e não depende de biblioteca. O XLSX resolve outra coisa — várias abas num arquivo só, para
 * quem quer o relatório inteiro de uma vez em vez de cinco downloads.
 *
 * ⛔ O `xlsx` é carregado por IMPORT DINÂMICO, dentro do handler do clique. Importá-lo no topo
 * de um componente client colocaria a biblioteca inteira no bundle de quem nunca vai exportar
 * nada — o custo cairia em todo mundo para servir um botão.
 *
 * ⛔ CÉLULA VAZIA ≠ ZERO. `null`/`undefined` viram string vazia, nunca 0 — a mesma disciplina
 * do `csv-export.ts` da 16-E. Um zero numa célula de nutriente afirma "medido zero".
 */

export type XlsxSheet = {
  /** Nome da aba. O Excel limita a 31 caracteres e proíbe alguns símbolos. */
  name: string;
  /**
   * Colunas na ordem desejada. Mesmo contrato de `toCsv` (Fase 14): o cabeçalho É a chave da
   * linha. Manter os dois formatos idênticos é o que permite reusar os `*_HEADERS` e os
   * `*Rows` de `csv-export.ts` (16-E) sem uma segunda montagem de tabela.
   */
  headers: string[];
  rows: Record<string, unknown>[];
};

/** O Excel recusa aba com mais de 31 caracteres ou com : \ / ? * [ ]. */
export function sanitizeSheetName(name: string): string {
  const clean = name.replace(/[:\\/?*[\]]/g, " ").trim();
  return (clean || "Planilha").slice(0, 31);
}

/** Uma célula. Ausência vira string vazia — jamais zero. */
function cell(value: unknown): string | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  return String(value);
}

/**
 * Gera e baixa um .xlsx com uma aba por seção.
 * Só deve ser chamado num handler do navegador (usa DOM e import dinâmico).
 */
export async function downloadXlsx(filename: string, sheets: XlsxSheet[]): Promise<void> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  for (const sheet of sheets) {
    const matrix: (string | number)[][] = [[...sheet.headers]];
    for (const row of sheet.rows) {
      matrix.push(sheet.headers.map((key) => cell(row[key])));
    }

    const worksheet = XLSX.utils.aoa_to_sheet(matrix);
    // Largura mínima legível por coluna — senão tudo sai espremido no Excel.
    worksheet["!cols"] = sheet.headers.map((key) => ({
      wch: Math.min(40, Math.max(12, key.length + 2)),
    }));

    // Nome duplicado quebra o arquivo inteiro: desambigua com sufixo numérico.
    let name = sanitizeSheetName(sheet.name);
    let suffix = 2;
    while (usedNames.has(name)) {
      name = sanitizeSheetName(`${sheet.name} ${suffix}`);
      suffix += 1;
    }
    usedNames.add(name);

    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  }

  XLSX.writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
