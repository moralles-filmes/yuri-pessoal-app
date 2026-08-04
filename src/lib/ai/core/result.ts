/**
 * Fase 18-A — IA · `Result<T, E>`.
 *
 * NENHUMA exceção de fornecedor cruza a fronteira de `providers/`. O adapter converte tudo
 * em `Result`, e quem chama é obrigado pelo TypeScript a olhar o caso de erro.
 *
 * É o mesmo espírito do `ActionResult` do projeto (`src/types/finance.ts`), com uma
 * diferença deliberada: aqui o erro é TIPADO (`AiError`, com uma das 10 classes), não uma
 * string. Erro de IA precisa ser CLASSIFICADO para o `fallback.ts` decidir o que fazer com
 * ele — "deu erro" não diz se cabe tentar outro provedor ou se insistir é abusivo.
 */

export type Ok<T> = { ok: true; value: T };
export type Err<E> = { ok: false; error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}
