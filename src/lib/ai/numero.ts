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
 * Puro e sem um único import: as telas o leem sem arrastar nada.
 */

export type Leitura = { ok: true; valor: number | null } | { ok: false; motivo: string };

type Partes = { ok: true; inteiro: string; fracao: string } | { ok: false; motivo: string };

const SO_ALGARISMOS = "Use só algarismos, com vírgula para a parte decimal (ex.: 1,50).";
const MILHAR_TORTO =
  "Não deu para entender o número: os pontos separam milhares de três em três (ex.: 1.250,00).";
const INCOMPLETO = "Número incompleto: falta o que vem depois do separador.";

const MILHAR = /^[1-9]\d{0,2}(?:\.\d{3})+$/;

/** O texto → parte inteira e fração, só com algarismos. `null` = vazio. */
function partes(texto: string): Partes | null {
  const t = texto.trim();
  if (t === "") return null;
  if (t.startsWith("-")) return { ok: false, motivo: "O valor não pode ser negativo." };
  if (!/^[\d.,]+$/.test(t)) return { ok: false, motivo: SO_ALGARISMOS };

  const virgulas = t.split(",");
  if (virgulas.length > 2) {
    return { ok: false, motivo: "Use uma vírgula só, para a parte decimal." };
  }

  if (virgulas.length === 2) {
    const [antes, fracao] = virgulas as [string, string];
    if (fracao === "") return { ok: false, motivo: INCOMPLETO };
    if (!/^\d+$/.test(fracao)) return { ok: false, motivo: MILHAR_TORTO };
    if (antes === "" || /^\d+$/.test(antes)) return { ok: true, inteiro: antes, fracao };
    if (MILHAR.test(antes)) return { ok: true, inteiro: antes.replace(/\./g, ""), fracao };
    return { ok: false, motivo: MILHAR_TORTO };
  }

  const pontos = t.split(".");
  if (pontos.length === 1) return { ok: true, inteiro: t, fracao: "" };
  if (pontos.length === 2) {
    const [antes, depois] = pontos as [string, string];
    if (depois === "") return { ok: false, motivo: INCOMPLETO };
    if (depois.length <= 2 || /^0?$/.test(antes)) {
      return { ok: true, inteiro: antes, fracao: depois };
    }
    if (depois.length === 3 && MILHAR.test(t)) return { ok: true, inteiro: antes + depois, fracao: "" };
    return { ok: false, motivo: MILHAR_TORTO };
  }
  if (MILHAR.test(t)) return { ok: true, inteiro: t.replace(/\./g, ""), fracao: "" };
  return { ok: false, motivo: MILHAR_TORTO };
}

/** Decimal digitado → número. Vazio → `null` (ausência, nunca zero). */
export function lerDecimal(texto: string): Leitura {
  const p = partes(texto);
  if (p === null) return { ok: true, valor: null };
  if (!p.ok) return p;
  const valor = Number(`${p.inteiro || "0"}${p.fracao ? `.${p.fracao}` : ""}`);
  return Number.isFinite(valor) ? { ok: true, valor } : { ok: false, motivo: SO_ALGARISMOS };
}

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
