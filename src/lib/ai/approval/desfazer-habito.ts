import type { FatosParaDesfazer } from "./contracts";

export const MOTIVO_REGISTRO_ANTERIOR =
  "O dia já tinha um registro; desfazer apagaria também o que estava antes.";

/** Só uma criação comprovada pode ser apagada. Execuções antigas sem o fato não autorizam. */
export function impedimentoDoDesfazerDeHabito(fatos: FatosParaDesfazer): string | null {
  if (fatos.changedFields.registro_novo === true) return null;
  return fatos.changedFields.registro_novo === false
    ? MOTIVO_REGISTRO_ANTERIOR
    : "Esta execução não registrou se o dia estava vazio. Confira o registro em Hábitos; não há desfazer seguro por aqui.";
}
