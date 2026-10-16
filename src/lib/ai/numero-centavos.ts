/**
 * REDESIGN-07-D · D2 — reais digitados → centavos, pelo núcleo do conversor único (`numero-base.ts`).
 * Módulo próprio para `/ia/comprovantes` carregar só isto (D8, orçamento medido).
 */

import { partes, SO_ALGARISMOS, type Leitura } from "./numero-base";

/**
 * Reais digitados → centavos INTEIROS, para o comprovante. A conta é feita no texto — sem
 * multiplicar fração por 100, que em ponto flutuante dá 100,49999… para "1,005".
 */
export function lerCentavos(texto: string): Leitura {
  const p = partes(texto);
  if (p === null) return { ok: true, valor: null };
  if (!p.ok) return p;
  if (p.fracao.length > 2) {
    return { ok: false, motivo: "Use no máximo dois dígitos de centavos." };
  }
  const valor = Number(p.inteiro || "0") * 100 + Number(p.fracao.padEnd(2, "0"));
  return Number.isSafeInteger(valor) ? { ok: true, valor } : { ok: false, motivo: SO_ALGARISMOS };
}
