import { timingSafeEqual } from "node:crypto";

/** Vercel Cron: segredo ausente ou tamanho diferente nunca autentica. */
export function segredoConfere(header: string | null, secret: string | undefined): boolean {
  if (!header || !secret) return false;
  const recebido = Buffer.from(header);
  const esperado = Buffer.from("Bearer " + secret);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}
