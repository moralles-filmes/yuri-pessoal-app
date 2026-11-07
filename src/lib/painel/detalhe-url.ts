/**
 * REDESIGN-04-B · T3 — a URL do detalhe e o mês válido, puros (a tela e a página os leem).
 *
 * Só `import type`: nenhum runtime, porque a tela lê este arquivo. A lista de chaves é literal aqui
 * e a cobertura da união é provada no teste (um `Record<ChaveDoDetalhe, true>`).
 *
 * Regras da URL:
 * - `detalhe`, `parte` e `alvo` vão sempre no FIM, nessa ordem; `parte=meu` e `alvo` nulo são omitidos;
 * - os outros parâmetros mantêm a ordem em que vieram;
 * - parâmetro repetido mantém só o primeiro valor ao reescrever a URL.
 */
import type { ChaveDoDetalhe, ParteDoDetalhe, PedidoDeDetalhe } from "@/lib/finance/detalhe";

export const CHAVES_DO_DETALHE = [
  "saldo",
  "entradas",
  "saidas",
  "cartao",
  "pendente",
  "pendente-do-mes",
  "categoria",
  "forma",
  "fatura",
  "projecao",
  "contas",
  "caixa",
] as const satisfies readonly ChaveDoDetalhe[];

/** Os três parâmetros que a URL do detalhe controla; todos os outros são preservados. */
const ESTADOS_DO_DETALHE = ["detalhe", "parte", "alvo"];

const PARTES: readonly ParteDoDetalhe[] = ["meu", "terceiros", "bruto"];

const REGEX_ALVO = /^[A-Za-z0-9_-]{1,64}$/;
const REGEX_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

type Entrada = URLSearchParams | Record<string, string | string[] | undefined>;

/** Valor único de um parâmetro: repetido ou ausente não conta (devolve null). */
function valorUnico(sp: Record<string, string | string[] | undefined>, nome: string): string | null {
  const v = sp[nome];
  return typeof v === "string" ? v : null;
}

/** Pares (chave, valor) na ordem de chegada, sem repetir chave (fica o primeiro valor). */
function paresSemRepeticao(sp: Entrada): [string, string][] {
  const vistos = new Set<string>();
  const pares: [string, string][] = [];
  if (sp instanceof URLSearchParams) {
    for (const [k, v] of sp.entries()) {
      if (vistos.has(k)) continue;
      vistos.add(k);
      pares.push([k, v]);
    }
    return pares;
  }
  for (const [k, raw] of Object.entries(sp)) {
    if (vistos.has(k)) continue;
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (v === undefined) continue;
    vistos.add(k);
    pares.push([k, v]);
  }
  return pares;
}

/** O pedido de detalhe da URL, ou `null` se a chave não existe na união. */
export function pedidoDaUrl(sp: Record<string, string | string[] | undefined>): PedidoDeDetalhe | null {
  const chave = valorUnico(sp, "detalhe");
  if (chave === null || !(CHAVES_DO_DETALHE as readonly string[]).includes(chave)) return null;

  const parteBruta = valorUnico(sp, "parte");
  const parte: ParteDoDetalhe =
    parteBruta !== null && (PARTES as readonly string[]).includes(parteBruta)
      ? (parteBruta as ParteDoDetalhe)
      : "meu";

  const alvoBruto = valorUnico(sp, "alvo");
  const alvo = alvoBruto !== null && REGEX_ALVO.test(alvoBruto) ? alvoBruto : null;

  return { chave: chave as ChaveDoDetalhe, parte, alvo };
}

/**
 * A URL abre a gaveta de registros? Só se ela tiver o parâmetro `detalhe` (o mesmo que
 * `urlComDetalhe` escreve). Quem abre a gaveta não deve rolar a página para o topo (08-T1).
 * Lê só o trecho depois do `?`, sem `new URL` com base implícita.
 */
export function abreAGaveta(href: string): boolean {
  const i = href.indexOf("?");
  if (i === -1) return false;
  return new URLSearchParams(href.slice(i + 1)).has("detalhe");
}

/** A mesma URL com o detalhe pedido: troca `detalhe`/`parte`/`alvo` e preserva o resto. */
export function urlComDetalhe(caminho: string, sp: Entrada, pedido: PedidoDeDetalhe): string {
  const resto = paresSemRepeticao(sp).filter(([k]) => !ESTADOS_DO_DETALHE.includes(k));
  const novos: [string, string][] = [["detalhe", pedido.chave]];
  if (pedido.parte !== "meu") novos.push(["parte", pedido.parte]);
  if (pedido.alvo !== null) novos.push(["alvo", pedido.alvo]);
  return montar(caminho, [...resto, ...novos]);
}

/** A mesma URL sem o detalhe: remove só `detalhe`, `parte` e `alvo`. */
export function urlSemDetalhe(caminho: string, sp: Entrada): string {
  return montar(caminho, paresSemRepeticao(sp).filter(([k]) => !ESTADOS_DO_DETALHE.includes(k)));
}

/** O mês da URL se for AAAA-MM válido; senão o mês atual (D-B-16). */
export function mesDaUrl(v: string | string[] | undefined, mesAtual: string): string {
  return typeof v === "string" && REGEX_MES.test(v) ? v : mesAtual;
}

function montar(caminho: string, pares: [string, string][]): string {
  if (pares.length === 0) return caminho;
  return `${caminho}?${pares.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}`;
}
