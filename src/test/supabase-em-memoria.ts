/**
 * REDESIGN-03-C · A2 — um client Supabase FALSO, em memória, para testar caminhos de GRAVAÇÃO
 * (`criarTransacao`, `updateTransaction`, `reapplySplit`, `applySplit`) sem rede.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE ELE APLICA DE VERDADE                                                           ║
 * ║                                                                                       ║
 * ║ • `insert` guarda a linha na tabela (com `id` = `<tabela>-<n>` quando ausente); com   ║
 * ║   `.select()` encadeado, devolve as linhas inseridas.                                 ║
 * ║ • `update` faz merge nas linhas filtradas; `delete` as remove.                        ║
 * ║ • Filtros `eq`, `neq`, `in`, `is`, `gt`, `gte`, `lt`, `lte` são APLICADOS — é isso    ║
 * ║   que torna visível um `.eq("transaction_id", …)` esquecido.                          ║
 * ║ • `limit` corta; `single()` sem linha devolve erro (como o PostgREST); `maybeSingle`  ║
 * ║   devolve `null`.                                                                     ║
 * ║ • Toda escrita vira uma `Operacao`, NA ORDEM em que aconteceu: é por ela que um teste ║
 * ║   prova "a recusa não gravou nada" ou "o update veio depois da limpeza".              ║
 * ║                                                                                       ║
 * ║ O QUE ELE IGNORA: `order`, `or`, colunas do `select` (devolve a linha inteira),       ║
 * ║ `count` exato além do tamanho do resultado, RLS e constraints do banco.               ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Só para teste — nenhum arquivo de runtime o importa. Fixture sintética: o repositório é
 * público.
 */

export type Linha = Record<string, unknown>;

export type Operacao = {
  tabela: string;
  tipo: "insert" | "update" | "delete";
  valores?: Linha | Linha[];
  filtros: Array<[string, string, unknown]>;
};

type Resultado = { data: unknown; error: { code: string; message: string } | null; count?: number };

function comparar(a: unknown, b: unknown): number {
  if (a == null || b == null) return Number.NaN;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

const TESTES: Record<string, (valor: unknown, alvo: unknown) => boolean> = {
  eq: (v, a) => v === a,
  neq: (v, a) => v !== a,
  in: (v, a) => (a as unknown[]).includes(v),
  is: (v, a) => (a === null ? v === null || v === undefined : v === a),
  gt: (v, a) => comparar(v, a) > 0,
  gte: (v, a) => comparar(v, a) >= 0,
  lt: (v, a) => comparar(v, a) < 0,
  lte: (v, a) => comparar(v, a) <= 0,
};

export function criarSupabaseEmMemoria(
  tabelasIniciais: Record<string, Linha[]>,
  opcoes: { userId?: string } = {},
) {
  const tabelas: Record<string, Linha[]> = Object.fromEntries(
    Object.entries(tabelasIniciais).map(([nome, linhas]) => [nome, linhas.map((l) => ({ ...l }))]),
  );
  const operacoes: Operacao[] = [];
  const sequencia: Record<string, number> = {};

  function from(tabela: string) {
    let modo: "select" | "insert" | "update" | "delete" = "select";
    let devolveInseridas = false;
    let valores: Linha | Linha[] | undefined;
    let limite: number | undefined;
    const filtros: Array<[string, string, unknown]> = [];
    let executado: Resultado | undefined;

    const casa = (l: Linha) => filtros.every(([op, col, alvo]) => TESTES[op](l[col], alvo));

    function executar(): Resultado {
      if (executado) return executado;
      const linhas = (tabelas[tabela] ??= []);

      if (modo === "insert") {
        const novas = (Array.isArray(valores) ? valores : [valores ?? {}]).map((v) => {
          sequencia[tabela] = (sequencia[tabela] ?? 0) + 1;
          return { id: `${tabela}-${sequencia[tabela]}`, ...v };
        });
        linhas.push(...novas);
        operacoes.push({ tabela, tipo: "insert", valores, filtros: [] });
        executado = { data: devolveInseridas ? novas.map((l) => ({ ...l })) : null, error: null };
        return executado;
      }

      if (modo === "update") {
        for (const l of linhas) if (casa(l)) Object.assign(l, valores);
        operacoes.push({ tabela, tipo: "update", valores, filtros: [...filtros] });
        executado = { data: null, error: null };
        return executado;
      }

      if (modo === "delete") {
        tabelas[tabela] = linhas.filter((l) => !casa(l));
        operacoes.push({ tabela, tipo: "delete", filtros: [...filtros] });
        executado = { data: null, error: null };
        return executado;
      }

      const todas = linhas.filter(casa).map((l) => ({ ...l }));
      executado = {
        data: limite === undefined ? todas : todas.slice(0, limite),
        error: null,
        count: todas.length,
      };
      return executado;
    }

    const builder: Record<string, unknown> = {};
    for (const op of Object.keys(TESTES)) {
      builder[op] = (coluna: string, alvo: unknown) => {
        filtros.push([op, coluna, alvo]);
        return builder;
      };
    }
    builder.select = () => {
      if (modo === "insert") devolveInseridas = true;
      return builder;
    };
    builder.insert = (v: Linha | Linha[]) => {
      modo = "insert";
      valores = v;
      return builder;
    };
    builder.update = (v: Linha) => {
      modo = "update";
      valores = v;
      return builder;
    };
    builder.delete = () => {
      modo = "delete";
      return builder;
    };
    builder.order = () => builder;
    builder.or = () => builder;
    builder.limit = (n: number) => {
      limite = n;
      return builder;
    };
    builder.single = async (): Promise<Resultado> => {
      const r = executar();
      const primeira = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
      return primeira === null
        ? { data: null, error: { code: "PGRST116", message: "nenhuma linha" } }
        : { data: primeira, error: null };
    };
    builder.maybeSingle = async (): Promise<Resultado> => {
      const r = executar();
      return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: null };
    };
    builder.then = (
      resolve: (v: Resultado) => unknown,
      reject: (e: unknown) => unknown,
    ) => Promise.resolve().then(executar).then(resolve, reject);
    return builder;
  }

  const client = {
    from,
    auth: {
      getUser: async () => ({ data: { user: { id: opcoes.userId ?? "user-1" } }, error: null }),
    },
  };

  return {
    /** Passe onde o código espera um `SupabaseClient` (é um dublê, não o tipo real). */
    client: client as unknown,
    /** O estado CORRENTE das tabelas, depois das escritas. */
    tabelas,
    operacoes,
    /** Só as escritas (insert/update/delete), na ordem — opcionalmente de uma tabela. */
    escritas(tabela?: string): Operacao[] {
      return operacoes.filter((o) => tabela === undefined || o.tabela === tabela);
    },
  };
}
