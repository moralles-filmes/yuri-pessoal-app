/**
 * REDESIGN-03-G (L0) — erro é erro: o núcleo único de leitura.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ POR QUE ISTO EXISTE.                                                                  ║
 * ║                                                                                       ║
 * ║ O `supabase-js` NÃO lança: devolve `{ data: null, error }`, o código lê só `data`,    ║
 * ║ cai no `?? []` e a tela soma uma lista vazia — R$ 0,00 com cara de fato. Toda leitura ║
 * ║ do escopo passa por aqui e LANÇA `ErroDeLeitura`; zero volta a significar "medido".   ║
 * ║                                                                                       ║
 * ║ E o `max_rows` do PostgREST corta em silêncio e responde 200: só o `count: "exact"`   ║
 * ║ mostra o corte. `listaComTeto` devolve a situação; `listaCompleta` lança              ║
 * ║ `LeituraIncompleta` quando a lista alimenta número e veio cortada (ou sem contagem —  ║
 * ║ errar para "pode faltar", invariante 29).                                             ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Neutro (fora de `finance/`) pelo mesmo motivo de `supabase/owner.ts`: o Cron também o usa.
 * Puro: nenhum import de runtime — os testes o importam sem mock.
 *
 * ⛔ A MENSAGEM É NOSSA. O texto do Postgres traz nome de tabela, de coluna e às vezes valor
 * de linha; ele vai só em `cause`, e o log grava `oQue` + o `code` (D-G2).
 */

/** O mínimo que lemos de uma resposta do PostgREST — compatível com `PostgrestError`. */
export type ErroDoBanco = { code?: string | null; message?: string | null };

export type RespostaDoBanco<T> = {
  data: T;
  error: ErroDoBanco | null;
  count?: number | null;
};

/**
 * Leitura com teto visível (03-B2, A5): o `count: "exact"` comparado com o que chegou.
 * `total` (03-G, D-G4) é o `count` — o "M" do aviso "N de M".
 */
export type LeituraComTeto<T> = {
  linhas: T[];
  situacao: "completa" | "saturou" | "sem_contagem";
  total: number | null;
};

/** `.single()` sem linha: ausência legítima, não falha de leitura (D-G27). */
const SEM_LINHA = "PGRST116";

export class ErroDeLeitura extends Error {
  readonly tipo: "falhou" | "incompleta";
  /** Rótulo nosso em pt-BR ("os lançamentos", "as faturas"). */
  readonly oQue: string;
  /** O `code` do PostgREST, para o log — nunca a mensagem. */
  readonly codigo: string | null;

  constructor(
    oQue: string,
    opcoes: { codigo?: string | null; tipo?: "falhou" | "incompleta"; cause?: unknown } = {},
  ) {
    super(`Não foi possível ler ${oQue}.`, { cause: opcoes.cause });
    this.name = "ErroDeLeitura";
    this.tipo = opcoes.tipo ?? "falhou";
    this.oQue = oQue;
    this.codigo = opcoes.codigo ?? null;
  }
}

/** A lista que alimenta número veio cortada (ou sem contagem para provar que não veio). */
export class LeituraIncompleta extends ErroDeLeitura {
  readonly lidas: number;
  readonly total: number | null;

  constructor(oQue: string, lidas: number, total: number | null) {
    super(oQue, { tipo: "incompleta" });
    this.name = "LeituraIncompleta";
    this.lidas = lidas;
    this.total = total;
  }
}

export function ehErroDeLeitura(e: unknown): e is ErroDeLeitura {
  return e instanceof ErroDeLeitura;
}

function falhou(error: ErroDoBanco, oQue: string): ErroDeLeitura {
  return new ErroDeLeitura(oQue, { codigo: error.code ?? null, cause: error });
}

/**
 * Um registro (ou um corte que é REGRA, como as 10 candidatas do comprovante). Lança no erro;
 * `PGRST116` vira `null` — o chamador mantém o "não encontrado" que já tinha.
 */
export function exigir<T>(res: RespostaDoBanco<T>, oQue: string): T {
  if (res.error) {
    if (res.error.code === SEM_LINHA) return null as T;
    throw falhou(res.error, oQue);
  }
  return res.data;
}

/** Compara com o recebido: o max_rows do PostgREST pode cortar antes do nosso limit. */
export function leituraComTeto<T>(linhas: T[], count: number | null): LeituraComTeto<T> {
  return {
    linhas,
    situacao: count === null ? "sem_contagem" : count > linhas.length ? "saturou" : "completa",
    total: count,
  };
}

/** Lista de que o CHAMADOR decide o teto (aviso "N de M" ou `exigirCompleta`). Lança no erro. */
export function listaComTeto<T>(res: RespostaDoBanco<T[] | null>, oQue: string): LeituraComTeto<T> {
  if (res.error) throw falhou(res.error, oQue);
  return leituraComTeto(res.data ?? [], res.count ?? null);
}

/** A lista inteira ou erro: alguém soma isso. */
export function exigirCompleta<T>(l: LeituraComTeto<T>, oQue: string): T[] {
  if (l.situacao !== "completa") throw new LeituraIncompleta(oQue, l.linhas.length, l.total);
  return l.linhas;
}

/** Lista que alimenta número: lança no erro, na saturação e sem `count`. */
export function listaCompleta<T>(res: RespostaDoBanco<T[] | null>, oQue: string): T[] {
  return exigirCompleta(listaComTeto(res, oQue), oQue);
}

/**
 * Quem CAPTURA um `ErroDeLeitura` (card, insight, Cron) o registra: o erro capturado não chega
 * ao log do Next sozinho. Só o rótulo e o código — nada do banco.
 */
export function registrarFalhaDeLeitura(e: ErroDeLeitura): void {
  console.error("[leitura]", e.oQue, e.codigo);
}
