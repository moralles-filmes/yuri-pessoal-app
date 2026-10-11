/**
 * REDESIGN-07-C · D5 — o texto de erro de uma Server Action, com o campo junto.
 *
 * `invalid()` devolve "Verifique os campos destacados." + `fieldErrors`. Numa tela que não
 * tem o campo (ou nenhum campo: listas, ações em massa, exclusões), repassar só `error` deixa
 * o dono sem saída — nada está destacado e a mensagem real se perdeu. Aqui o erro passa por
 * `mapServerFieldErrors` (campo da tela fica para a tela; campo que ela não tem vira
 * "campo: mensagem") e `serverErrorMessage` (monta o texto). É a regra 2 de formulário do
 * CLAUDE.md, num ponto só para as ~130 chamadas de Dieta e Treinos.
 *
 * Puro (sem React, sem DOM), testado em `mensagem-da-action.test.ts`.
 */
import { mapServerFieldErrors, serverErrorMessage, type ServerFieldErrors } from "./server-errors";

export function mensagemDaAction(
  resultado: { error: string; fieldErrors?: ServerFieldErrors },
  /** Os campos que ESTA tela tem (vazio = nenhum: todo erro de campo sobe com o nome). */
  campos: readonly string[] = [],
): string {
  return serverErrorMessage(resultado.error, mapServerFieldErrors(resultado.fieldErrors, campos));
}

/**
 * Para formulário que mostra o erro SOB O CAMPO (useState/FormData): a primeira mensagem de
 * cada campo da tela (pela raiz: "values.0.value" → "values") e o texto do aviso geral — que,
 * com tudo destacado, é a mensagem da action; com campo que a tela não tem, diz "campo:
 * mensagem".
 */
export function errosDaAction(
  resultado: { error: string; fieldErrors?: ServerFieldErrors },
  campos: readonly string[],
): { porCampo: Record<string, string>; texto: string } {
  const mapa = mapServerFieldErrors(resultado.fieldErrors, campos);
  const porCampo: Record<string, string> = {};
  for (const { name, message } of mapa.toSet) {
    const raiz = name.split(".")[0];
    if (!(raiz in porCampo)) porCampo[raiz] = message;
  }
  return { porCampo, texto: serverErrorMessage(resultado.error, mapa) };
}
