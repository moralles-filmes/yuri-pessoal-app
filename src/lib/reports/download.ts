/**
 * Fase 14 — Utilitários de download no client (exportação de relatórios). Geram um
 * arquivo a partir de uma string/objeto já carregado (sem round-trip ao servidor).
 * Só devem ser chamados em handlers do navegador.
 */

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Baixa um CSV (com BOM para o Excel reconhecer UTF-8 em pt-BR). */
export function downloadCsv(filename: string, csv: string) {
  triggerDownload(
    new Blob(["﻿", csv], { type: "text/csv;charset=utf-8;" }),
    filename,
  );
}

/** Baixa um JSON formatado. */
export function downloadJson(filename: string, data: unknown) {
  triggerDownload(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    filename,
  );
}
