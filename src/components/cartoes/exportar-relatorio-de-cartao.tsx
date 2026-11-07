"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toCsv } from "@/lib/reports/csv";
import { downloadCsv } from "@/lib/reports/download";

/**
 * REDESIGN-05-C — o botão "Exportar CSV" do "Mês a mês". É a única ilha cliente do relatório e
 * não escreve nada: só monta o arquivo no navegador a partir das linhas que a tela já mostra.
 * Valores em REAIS (como o CSV de `/relatorios`); mês sem fatura vai com células vazias, nunca 0.
 */
export type LinhaDoCsvDeCartao = {
  mes: string;
  faturas: number | null;
  total: number | null;
  meu: number | null;
  terceiros: number | null;
};

export function ExportarRelatorioDeCartao({
  linhas,
  nomeDoArquivo,
}: {
  linhas: LinhaDoCsvDeCartao[];
  nomeDoArquivo: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() =>
        downloadCsv(
          nomeDoArquivo,
          toCsv(linhas, ["mes", "faturas", "total", "meu", "terceiros"]),
        )
      }
    >
      <Download aria-hidden />
      Exportar CSV
    </Button>
  );
}
