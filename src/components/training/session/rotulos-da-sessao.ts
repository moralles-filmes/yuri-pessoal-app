/**
 * REDESIGN-07-C · D4 — rótulos da tela da sessão ao vivo (puros, testados).
 *
 * Só importa constantes que a sessão já carrega: `/treinos/sessao` é a rota mais apertada do
 * lote, e um rótulo não pode trazer módulo novo junto.
 */
import { SESSION_SET_STATUS_LABELS, type SessionSetStatus } from "@/lib/training/constants";

/**
 * O chip de série na sessão: "Série 3 de aquecimento, concluída". O `aria-label` antigo dizia
 * só "Série 3" — feita, pulada ou pendente ficava no ícone e no tachado.
 */
export function rotuloDoChipDeSerie(serie: { setNumber: number; isWarmup: boolean; status: SessionSetStatus }): string {
  return `Série ${serie.setNumber}${serie.isWarmup ? " de aquecimento" : ""}, ${SESSION_SET_STATUS_LABELS[serie.status].toLowerCase()}`;
}
