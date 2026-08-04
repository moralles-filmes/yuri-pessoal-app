/**
 * Erros de campo devolvidos pela Server Action → formulário.
 *
 * ⛔ **"Verifique os campos destacados." só pode aparecer se algum campo for destacado
 * de fato.** Foi essa quebra de contrato que deixou um bug de salvamento indiagnosticável:
 * a action recusava por causa de um campo que o formulário nem mostra (`icon`), e o usuário
 * só via uma mensagem vermelha pedindo para conferir campos que estavam todos corretos.
 *
 * Daí a distinção que esta função faz:
 *
 * - **`toSet`** — erros de campos que existem na tela: viram `setError` e ficam visíveis.
 * - **`orphans`** — erros de campos que a tela NÃO tem. Não há onde destacar, então a
 *   mensagem sobe para o toast. Melhor um texto feio e verdadeiro que um silêncio.
 *
 * Função pura (sem react-hook-form, sem DOM) para poder ser testada de verdade.
 */

/** O formato que `invalid()` (src/lib/actions/helpers.ts) devolve. */
export type ServerFieldErrors = Record<string, string[] | undefined>;

export type MappedServerErrors = {
  /** Campos presentes no formulário, na ordem em que chegaram. */
  toSet: { name: string; message: string }[];
  /** Mensagens de campos ausentes do formulário, já prefixadas com o campo. */
  orphans: string[];
};

export function mapServerFieldErrors(
  fieldErrors: ServerFieldErrors | undefined,
  knownFields: readonly string[],
): MappedServerErrors {
  const known = new Set(knownFields);
  const toSet: MappedServerErrors["toSet"] = [];
  const orphans: string[] = [];

  for (const [name, messages] of Object.entries(fieldErrors ?? {})) {
    const message = messages?.find((m) => m && m.trim().length);
    if (!message) continue;
    // Campo aninhado ("sets.0.reps") pertence à tela se a raiz pertence.
    const root = name.split(".")[0];
    if (known.has(name) || known.has(root)) toSet.push({ name, message });
    else orphans.push(`${name}: ${message}`);
  }

  return { toSet, orphans };
}

/**
 * Texto do toast. Sem órfãos, mantém a mensagem original da action; com órfãos, diz o que
 * de fato impediu de salvar — já que não existe campo na tela para destacar.
 */
export function serverErrorMessage(
  fallback: string,
  { toSet, orphans }: MappedServerErrors,
): string {
  if (!orphans.length) return fallback;
  const detalhe = orphans.join(" · ");
  return toSet.length ? `${fallback} ${detalhe}` : detalhe;
}
