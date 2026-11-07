/**
 * REDESIGN-03-G2 (K3, D-G2-17) — o que a exclusão de um lançamento leva junto, em frases.
 *
 * Puro: sem `server-only`, sem Supabase. A TELA importa este módulo; quem lê o banco é a Server
 * Action `preverExclusaoDoLancamento`, que devolve a `PrevisaoDeExclusao`. A previsão mostra tudo o
 * que a exclusão apaga — não só o pendente (o alcance é `so-dinheiro-registrado`).
 */
import { RECEIVABLE_STATUS_LABELS } from "@/lib/finance/constants";

export type PrevisaoDeExclusao = {
  /** Motivo de recusa (recebimento registrado). Preenchido ⇒ o botão de excluir não existe. */
  bloqueio: string | null;
  faturaReaberta: { competencia: string } | null;
  recebiveis: { pessoa: string; status: string; quantidade: number }[];
  parcelas: number;
  linhasDaImportacao: number;
  ehTransferencia: boolean;
};

export type EstadoDaPrevisao =
  | { fase: "carregando" }
  | { fase: "erro" }
  | { fase: "pronta"; previsao: PrevisaoDeExclusao };

export const FRASE_DA_PREVISAO_FALHA = "Não foi possível conferir o que sai junto. Feche e tente de novo.";

/** '2031-03-01' ⇒ '03/2031'. Por texto: data pura não vira `Date`. */
export function competenciaMMAAAA(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

function rotuloDoStatus(status: string): string {
  const rotulo = (RECEIVABLE_STATUS_LABELS as Record<string, string | undefined>)[status];
  return (rotulo ?? status).toLowerCase();
}

export function linhasDaPrevisao(p: PrevisaoDeExclusao): string[] {
  const linhas: string[] = [];
  if (p.faturaReaberta) {
    linhas.push(
      `Esta é a transferência que pagou a fatura de ${competenciaMMAAAA(p.faturaReaberta.competencia)}. Ela volta a ficar em aberto.`,
    );
  }
  for (const r of p.recebiveis) {
    linhas.push(`${r.quantidade} recebível(is) ${rotuloDoStatus(r.status)} de ${r.pessoa} sai(em) junto.`);
  }
  if (p.parcelas > 0) {
    linhas.push(`As ${p.parcelas} parcelas desta compra saem das faturas.`);
  }
  if (p.linhasDaImportacao > 0) {
    linhas.push("Este lançamento veio de uma importação; a linha do lote perde o vínculo.");
  }
  return linhas;
}

/** `true` só com a leitura de volta, sem erro e sem bloqueio (Y13). */
export function podeConfirmar(e: EstadoDaPrevisao | null): boolean {
  return e !== null && e.fase === "pronta" && e.previsao.bloqueio === null;
}
