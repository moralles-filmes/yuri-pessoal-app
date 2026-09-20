/**
 * Fase 18-F · Bloco 3 — IA · A validação de FORMA de uma memória. Pura, sem import.
 *
 * ⛔ ELA NÃO OLHA O ASSUNTO, E ISSO É A DECISÃO. Uma lista de assuntos proibidos ("saúde",
 * "senha", "dinheiro") dá a sensação de proteção e fura no primeiro assunto que ninguém
 * previu. O que passa aqui é o que TEM a forma de uma preferência escrita em português: uma
 * frase, curta, sem endereço e sem bloco que pareça chave.
 *
 * A proibição de ASSUNTO existe — e mora no prompt da ferramenta, descrita e nunca citada
 * (invariante 30). São defesas de natureza diferente, nos lugares certos.
 *
 * ⚠️ SEM IMPORT, inclusive de `./contracts`: este arquivo é lido pela TELA (a validação do
 * formulário e a mensagem de recusa), e a regra 3 do carregamento sob demanda vale para ele.
 * Por isso o limite é literal aqui e literal lá, com teste comparando os dois.
 */

export type RecusaDeForma =
  | "vazia"
  | "longa"
  | "multilinha"
  | "endereco"
  | "parece_credencial";

const MAX = 300;

export const MOTIVO_DA_RECUSA: Record<RecusaDeForma, string> = {
  vazia: "Escreva a preferência. Uma memória vazia não orienta nada.",
  longa: `A memória precisa caber em ${MAX} caracteres. Diga a preferência em uma frase.`,
  multilinha: "A memória é uma frase só, sem quebra de linha.",
  endereco:
    "A memória não aceita endereço de site nem e-mail. Escreva a preferência em palavras.",
  parece_credencial:
    "Há um trecho com forma de chave ou senha. A memória guarda preferência, nunca credencial.",
};

export type FormaDaMemoria =
  | { readonly ok: true; readonly valor: string }
  | { readonly ok: false; readonly motivo: RecusaDeForma };

/** `://`, `www.` e `algo@dominio.x` — as três formas de endereço que cabem numa frase. */
const ENDERECO = /:\/\/|www\.|[\w.+-]+@[\w-]+\.[a-z]/i;

/**
 * Um bloco de 20+ caracteres que mistura letra e dígito, sem espaço.
 *
 * ⚠️ As duas condições juntas são o que separa uma chave de uma palavra:
 * "otorrinolaringologista" é longa e não tem dígito; "1990-04-17" tem dígito e não tem bloco
 * longo com letra. Uma chave de API tem as duas.
 */
const PARECE_CREDENCIAL =
  /(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{20,}/;

export function formaDaMemoria(bruto: unknown): FormaDaMemoria {
  if (typeof bruto !== "string") return { ok: false, motivo: "vazia" };
  // Antes do trim: uma quebra no meio não é espaço sobrando, é outra forma.
  if (/[\r\n]/.test(bruto)) return { ok: false, motivo: "multilinha" };

  const valor = bruto.trim().replace(/\s+/g, " ");
  if (valor === "") return { ok: false, motivo: "vazia" };

  // ⚠️ Pontos de código, como o `char_length` do Postgres — não `.length`, que é UTF-16.
  if ([...valor].length > MAX) return { ok: false, motivo: "longa" };

  if (ENDERECO.test(valor)) return { ok: false, motivo: "endereco" };
  if (PARECE_CREDENCIAL.test(valor)) return { ok: false, motivo: "parece_credencial" };

  return { ok: true, valor };
}
