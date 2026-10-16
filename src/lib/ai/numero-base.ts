/**
 * REDESIGN-07-D · D2 — o NÚCLEO do conversor de números (`numero.ts`): o texto → parte inteira
 * e fração, com o motivo da recusa. Separado para `/ia/comprovantes`, que só lê centavos, não
 * carregar os leitores das preferências (D8, orçamento medido). Puro, sem import.
 */

export type Leitura = { ok: true; valor: number | null } | { ok: false; motivo: string };

export type Partes = { ok: true; inteiro: string; fracao: string } | { ok: false; motivo: string };

export const SO_ALGARISMOS = "Use só algarismos, com vírgula para a parte decimal (ex.: 1,50).";
const MILHAR_TORTO =
  "Não deu para entender o número: os pontos separam milhares de três em três (ex.: 1.250,00).";
const INCOMPLETO = "Número incompleto: falta o que vem depois do separador.";

const MILHAR = /^[1-9]\d{0,2}(?:\.\d{3})+$/;

/** O texto → parte inteira e fração, só com algarismos. `null` = vazio. */
export function partes(texto: string): Partes | null {
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
