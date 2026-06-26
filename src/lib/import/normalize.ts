/**
 * Fase 06 — Normalização PURA de valores, datas, parcelas e descrições (testada em
 * normalize.test.ts). Toda aritmética de dinheiro é feita em CENTAVOS (inteiros), no mesmo
 * espírito de installments.ts/split.ts, para evitar erro de ponto flutuante. Datas saem no
 * padrão ISO 'yyyy-MM-dd' (compatível com purchase_date/competence_date das Fases anteriores).
 */

/** Remove acentos e baixa a caixa — base para comparações de descrição/cabeçalho. */
export function semAcento(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Normaliza a descrição para deduplicação: sem acento, sem pontuação ruidosa, espaços colapsados. */
export function normalizarDescricao(s: string | null | undefined): string {
  if (!s) return "";
  return semAcento(String(s))
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Converte um valor monetário textual (BR ou US) em CENTAVOS inteiros COM SINAL.
 * Aceita "1.234,56", "1234,56", "1234.56", "R$ 1.234,56", "-50,00", "50,00-", "(50,00)".
 * Retorna null quando vazio ou impossível de interpretar.
 *
 * Decimal: se houver ',' e '.', o separador decimal é o que aparecer por ÚLTIMO (BR usa
 * vírgula; US usa ponto). Só '.' presente → é decimal, EXCETO quando parece milhar
 * (mais de um ponto, ou exatamente 3 dígitos após o único ponto, ex.: "1.234" = 1234).
 */
export function parseValorCentavos(input: string | null | undefined): number | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;

  // Sinal: '-' à frente/atrás, parênteses contábeis, ou marcador D/C textual não é tratado aqui.
  let negativo = false;
  if (/^\(.*\)$/.test(s)) {
    negativo = true;
    s = s.slice(1, -1);
  }
  if (/-\s*$/.test(s)) {
    negativo = true;
    s = s.replace(/-\s*$/, "");
  }
  if (/^\s*-/.test(s)) {
    negativo = true;
  }

  // Mantém apenas dígitos e separadores.
  s = s.replace(/[^\d.,]/g, "");
  if (!s) return null;

  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");

  let normalizado: string;
  if (temVirgula && temPonto) {
    // O último separador é o decimal; o outro é milhar.
    const decimalSep = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const milharSep = decimalSep === "," ? "." : ",";
    normalizado = s
      .split(milharSep)
      .join("")
      .replace(decimalSep, ".");
  } else if (temVirgula) {
    normalizado = s.replace(/\./g, "").replace(",", ".");
  } else if (temPonto) {
    const pontos = s.split(".").length - 1;
    const aposUltimo = s.length - s.lastIndexOf(".") - 1;
    // Múltiplos pontos OU 3 dígitos após o único ponto → milhar (inteiro).
    if (pontos > 1 || aposUltimo === 3) {
      normalizado = s.replace(/\./g, "");
    } else {
      normalizado = s;
    }
  } else {
    normalizado = s;
  }

  const n = Number.parseFloat(normalizado);
  if (!Number.isFinite(n)) return null;
  const centavos = Math.round(n * 100);
  return negativo ? -centavos : centavos;
}

/** True se (ano, mês 1-12, dia) formam uma data de calendário real (rejeita 31/02). */
function dataValida(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
  );
}

function iso(y: number, m: number, d: number): string {
  return `${y.toString().padStart(4, "0")}-${m
    .toString()
    .padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
}

/**
 * Converte uma data textual em 'yyyy-MM-dd'. Aceita ISO ('2026-06-26'), BR com separadores
 * '/', '-' ou '.' ('26/06/2026', '26-06-26'), e OFX compacto ('20260626' / '20260626120000').
 * Assume ordem dia/mês/ano (padrão BR); anos com 2 dígitos viram 20yy. Retorna null se inválida.
 */
export function parseDataIso(input: string | null | undefined): string | null {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;

  // ISO 'yyyy-MM-dd' (com hora opcional).
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch.map(Number) as unknown as [string, number, number, number];
    return dataValida(y, m, d) ? iso(y, m, d) : null;
  }

  // OFX compacto 'yyyyMMdd' (com hora/fuso opcionais).
  const ofxMatch = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (ofxMatch && /^\d{8}/.test(s)) {
    const y = Number(ofxMatch[1]);
    const m = Number(ofxMatch[2]);
    const d = Number(ofxMatch[3]);
    if (dataValida(y, m, d)) return iso(y, m, d);
  }

  // BR/numérico com separadores: dd/mm/yyyy, dd-mm-yy, dd.mm.yyyy.
  const brMatch = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
  if (brMatch) {
    const d = Number(brMatch[1]);
    const m = Number(brMatch[2]);
    let y = Number(brMatch[3]);
    if (y < 100) y += 2000;
    return dataValida(y, m, d) ? iso(y, m, d) : null;
  }

  return null;
}

/**
 * Extrai "k/N" de um texto (descrição ou coluna de parcela): "3/12", "PARC 03/12", "(1/10)".
 * Só considera parcelamento quando N > 1 e 1 <= k <= N. Retorna null caso contrário.
 */
export function parseParcela(
  input: string | null | undefined,
): { parcela: number; total: number } | null {
  if (input == null) return null;
  const s = String(input);
  const m = s.match(/(\d{1,3})\s*\/\s*(\d{1,3})/);
  if (!m) return null;
  const parcela = Number(m[1]);
  const total = Number(m[2]);
  if (!Number.isInteger(parcela) || !Number.isInteger(total)) return null;
  if (total <= 1 || parcela < 1 || parcela > total) return null;
  return { parcela, total };
}
