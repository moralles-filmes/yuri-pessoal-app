/**
 * Fase 06 — Parser de OFX (lógica PURA, testada em ofx.test.ts). Funciona tanto para OFX 1.x
 * (SGML, tags sem fechamento) quanto 2.x (XML), extraindo os blocos <STMTTRN> e devolvendo uma
 * `ParsedTable` com cabeçalho conhecido — assim a mesma pipeline (autoDetectMapping/applyMapping)
 * usada para CSV/Excel também serve para OFX, sem fluxo paralelo.
 */
import type { ParsedTable } from "@/lib/import/types";

/** Cabeçalho fixo gerado para um arquivo OFX (casa com a detecção automática de colunas). */
export const OFX_HEADERS = [
  "Data",
  "Valor",
  "Descrição",
  "Memo",
  "Identificador",
  "Tipo",
] as const;

/** Lê o valor de uma tag (até o próximo '<' ou fim de linha). Serve para SGML e XML. */
function tagValue(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() : "";
}

/**
 * Converte o conteúdo de um arquivo OFX em `ParsedTable`. Cada <STMTTRN> vira uma linha
 * [Data(DTPOSTED), Valor(TRNAMT), Descrição(NAME|MEMO), Memo, Identificador(FITID), Tipo(TRNTYPE)].
 * Retorna linhas vazias quando não há transações.
 */
export function parseOfx(content: string): ParsedTable {
  const headers = [...OFX_HEADERS];
  if (!content) return { headers, rows: [] };

  const blocks = content.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi);
  if (!blocks) return { headers, rows: [] };

  const rows = blocks.map((block) => {
    const dtposted = tagValue(block, "DTPOSTED");
    const trnamt = tagValue(block, "TRNAMT");
    const name = tagValue(block, "NAME");
    const memo = tagValue(block, "MEMO");
    const fitid = tagValue(block, "FITID");
    const trntype = tagValue(block, "TRNTYPE");
    return [dtposted, trnamt, name || memo, memo, fitid, trntype];
  });

  return { headers, rows };
}

/** True se o conteúdo parece um arquivo OFX (header OFX ou tag de transação). */
export function pareceOfx(content: string): boolean {
  return /<OFX>|OFXHEADER|<STMTTRN>/i.test(content);
}
