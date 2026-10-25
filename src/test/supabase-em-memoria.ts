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
 * ║   `update().select()` devolve as linhas alteradas.                                   ║
 * ║ • `not(coluna, op, alvo)` nega o filtro indicado.                                    ║
 * ║ • `antesDeGravar` simula constraint/trigger: a escrita recusada não é gravada        ║
 * ║   nem registrada como operação.                                                     ║
 * ║ • Filtros `eq`, `neq`, `in`, `is`, `gt`, `gte`, `lt`, `lte` são APLICADOS — é isso    ║
 * ║   que torna visível um `.eq("transaction_id", …)` esquecido.                          ║
 * ║ • `limit` corta; `single()` sem linha devolve erro (como o PostgREST); `maybeSingle`  ║
 * ║   devolve `null`.                                                                     ║
 * ║ • Toda escrita vira uma `Operacao`, NA ORDEM em que aconteceu: é por ela que um teste ║
 * ║   prova "a recusa não gravou nada" ou "o update veio depois da limpeza".              ║
 * ║                                                                                       ║
 * ║ • `rpc(nome, args)` REGISTRA a chamada (tipo `rpc`, `tabela` = nome da função) e      ║
 * ║   devolve o que a opção `rpc` configurar; NÃO executa SQL nem mexe nas tabelas.       ║
 * ║                                                                                       ║
 * ║ • 03-G: `count` só vem quando a leitura pediu `{ count: "exact" }` (senão `null`,     ║
 * ║   como o PostgREST); `head: true` devolve `data: null`. `falharLeitura` faz o         ║
 * ║   `select` daquela tabela devolver `{ data: null, error }` — com a mensagem do banco ║
 * ║   preenchida DE PROPÓSITO, para um teste provar que ela não chega à tela.            ║
 * ║                                                                                       ║
 * ║ O QUE ELE IGNORA: `order`, `or`, colunas do `select` (devolve a linha inteira),       ║
 * ║ RLS e constraints do banco.                                                           ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Só para teste — nenhum arquivo de runtime o importa. Fixture sintética: o repositório é
 * público.
 */

export type Linha = Record<string, unknown>;

export type ErroSimulado = { code: string; message: string };
export type EscritaPretendida = {
  tabela: string;
  tipo: "insert" | "update" | "delete";
  valores?: Linha | Linha[];
  tabelas: Record<string, Linha[]>;
};

export type Operacao = {
  /** Para `rpc`, o nome da função. */
  tabela: string;
  tipo: "insert" | "update" | "delete" | "rpc";
  valores?: Linha | Linha[];
  filtros: Array<[string, string, unknown]>;
};

type Resultado = {
  data: unknown;
  error: { code: string; message: string } | null;
  count?: number | null;
};

/** A mensagem que um teste procura na saída para provar que o texto do banco não vazou. */
export const MENSAGEM_DO_BANCO_SIMULADA = "relation segredo_do_banco coluna_interna";

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
  opcoes: {
    userId?: string;
    antesDeGravar?: (op: EscritaPretendida) => ErroSimulado | null;
    /** Simula o `max_rows` do PostgREST: corta a leitura ANTES do `limit`; o `count` não muda. */
    maxRows?: number;
    /** Resposta de `client.rpc(nome, args)`. Sem ela, a chamada devolve o erro `SEM_RPC`. */
    rpc?: (nome: string, args: Record<string, unknown>) => { data: unknown; error: ErroSimulado | null };
    /** 03-G — tabela → `code` do erro que o `select` dela devolve. Escritas não são afetadas. */
    falharLeitura?: Record<string, string>;
  } = {},
) {
  const tabelas: Record<string, Linha[]> = Object.fromEntries(
    Object.entries(tabelasIniciais).map(([nome, linhas]) => [nome, linhas.map((l) => ({ ...l }))]),
  );
  const operacoes: Operacao[] = [];
  const sequencia: Record<string, number> = {};

  function from(tabela: string) {
    let modo: "select" | "insert" | "update" | "delete" = "select";
    let devolveInseridas = false;
    let devolveAlteradas = false;
    let valores: Linha | Linha[] | undefined;
    let limite: number | undefined;
    let pediuContagem = false;
    let soCabecalho = false;
    const filtros: Array<[string, string, unknown]> = [];
    let executado: Resultado | undefined;

    const casa = (l: Linha) =>
      filtros.every(([op, col, alvo]) => {
        if (op === "not") {
          const [opInterno, valor] = alvo as [string, unknown];
          return !TESTES[opInterno](l[col], valor);
        }
        return TESTES[op](l[col], alvo);
      });

    function executar(): Resultado {
      if (executado) return executado;
      const linhas = (tabelas[tabela] ??= []);

      if (modo !== "select") {
        const erro = opcoes.antesDeGravar?.({ tabela, tipo: modo, valores, tabelas });
        if (erro) {
          executado = { data: null, error: erro };
          return executado;
        }
      }

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
        const alteradas: Linha[] = [];
        for (const l of linhas) {
          if (casa(l)) {
            Object.assign(l, valores);
            alteradas.push({ ...l });
          }
        }
        operacoes.push({ tabela, tipo: "update", valores, filtros: [...filtros] });
        executado = { data: devolveAlteradas ? alteradas : null, error: null };
        return executado;
      }

      if (modo === "delete") {
        tabelas[tabela] = linhas.filter((l) => !casa(l));
        operacoes.push({ tabela, tipo: "delete", filtros: [...filtros] });
        executado = { data: null, error: null };
        return executado;
      }

      const codigo = opcoes.falharLeitura?.[tabela];
      if (codigo) {
        executado = {
          data: null,
          error: { code: codigo, message: `${MENSAGEM_DO_BANCO_SIMULADA} (${tabela})` },
          count: null,
        };
        return executado;
      }

      const todas = linhas.filter(casa).map((l) => ({ ...l }));
      executado = {
        data: soCabecalho
          ? null
          : todas.slice(0, Math.min(limite ?? Infinity, opcoes.maxRows ?? Infinity)),
        error: null,
        count: pediuContagem ? todas.length : null,
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
    builder.not = (coluna: string, op: string, alvo: unknown) => {
      filtros.push(["not", coluna, [op, alvo]]);
      return builder;
    };
    builder.select = (_colunas?: string, opcoesDoSelect?: { count?: string; head?: boolean }) => {
      if (opcoesDoSelect?.count === "exact") pediuContagem = true;
      if (opcoesDoSelect?.head) soCabecalho = true;
      if (modo === "insert") devolveInseridas = true;
      if (modo === "update") devolveAlteradas = true;
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
      if (r.error) return r;
      const primeira = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
      return primeira === null
        ? { data: null, error: { code: "PGRST116", message: "nenhuma linha" } }
        : { data: primeira, error: null };
    };
    builder.maybeSingle = async (): Promise<Resultado> => {
      const r = executar();
      if (r.error) return r;
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
    rpc: async (nome: string, args: Record<string, unknown>): Promise<Resultado> => {
      operacoes.push({ tabela: nome, tipo: "rpc", valores: args, filtros: [] });
      if (!opcoes.rpc) {
        return { data: null, error: { code: "SEM_RPC", message: "rpc não configurada no teste" } };
      }
      return opcoes.rpc(nome, args);
    },
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
    /** Só as escritas (insert/update/delete) e as chamadas `rpc`, na ordem — opcionalmente de uma tabela (ou função). */
    escritas(tabela?: string): Operacao[] {
      return operacoes.filter((o) => tabela === undefined || o.tabela === tabela);
    },
  };
}
