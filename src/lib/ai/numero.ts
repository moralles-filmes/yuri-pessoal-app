/**
 * REDESIGN-07-D · D2 — IA · UM conversor só para os números digitados nas telas da IA.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ NADA VIRA ZERO POR OMISSÃO, E NADA VIRA `NaN`.                                        ║
 * ║                                                                                       ║
 * ║ `Number("")` é 0: o teto da análise automática em branco passava como zero enquanto a ║
 * ║ tela dizia que ele não podia ficar em branco. `Number("1,5")` é `NaN`, e chegava ao   ║
 * ║ dono como "expected number, received NaN" num toast. E `textoParaCentavos("12.50")`   ║
 * ║ apagava todos os pontos: R$ 1.250,00. Aqui o vazio é AUSÊNCIA (`null`), e quem chama  ║
 * ║ decide se a aceita (`exigirValor`); o que não é número volta recusado, com o motivo.  ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * A leitura é a do pt-BR, com a tolerância de quem digita com teclado americano:
 *  • vírgula é SEMPRE decimal, e os pontos antes dela são milhar ("1.234,56");
 *  • sem vírgula, um ponto seguido de 1 ou 2 dígitos é decimal ("12.50"), e de 3 é milhar
 *    ("1.250") — salvo quando o grupo da frente é "0" ("0.125"), que não tem milhar.
 *
 * Puro: só importa o próprio núcleo (`numero-base.ts`), e as telas o leem sem arrastar nada.
 * `lerCentavos` mora em `numero-centavos.ts` e é reexportado aqui — `/ia/comprovantes` o importa
 * de lá para não carregar os leitores das preferências (D8, orçamento medido).
 */
export type { Leitura } from "./numero-base";
export { lerCentavos } from "./numero-centavos";

import { partes, SO_ALGARISMOS, type Leitura } from "./numero-base";

/** Decimal digitado → número. Vazio → `null` (ausência, nunca zero). */
export function lerDecimal(texto: string): Leitura {
  const p = partes(texto);
  if (p === null) return { ok: true, valor: null };
  if (!p.ok) return p;
  const valor = Number(`${p.inteiro || "0"}${p.fracao ? `.${p.fracao}` : ""}`);
  return Number.isFinite(valor) ? { ok: true, valor } : { ok: false, motivo: SO_ALGARISMOS };
}

/** Inteiro digitado → número. Fração é recusada, não arredondada. */
export function lerInteiro(texto: string): Leitura {
  const p = partes(texto);
  if (p === null) return { ok: true, valor: null };
  if (!p.ok) return p;
  if (p.fracao !== "") return { ok: false, motivo: "Use um número inteiro, sem vírgula." };
  const valor = Number(p.inteiro);
  return Number.isSafeInteger(valor) ? { ok: true, valor } : { ok: false, motivo: SO_ALGARISMOS };
}

/** Campo obrigatório: a ausência vira recusa com o motivo de quem chama. */
export function exigirValor(leitura: Leitura, motivoSeVazio: string): Leitura {
  return leitura.ok && leitura.valor === null ? { ok: false, motivo: motivoSeVazio } : leitura;
}
