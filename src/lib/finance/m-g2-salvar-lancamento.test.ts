/**
 * REDESIGN-03-G2 · M-G2 — o arquivo da migration, conferido no repositório (padrão de
 * `m-f-pagamento-fatura.test.ts`: achado por CONTEÚDO, SQL sem comentários, normalizado).
 *
 * O harness não executa SQL. O que garante "o lançamento e a divisão dele são gravados juntos"
 * é a ATOMICIDADE (nenhum `exception when` engolindo a falha); o que garante "o que entrou não
 * sai" é a ORDEM — travar, reconferir a proteção e só então apagar. As duas coisas são travadas
 * aqui por varredura; o comportamento real é provado uma vez no banco, com dado sintético.
 *
 * O ESPELHO: o SQL só conhece os NOMES das colunas; os valores saem de `montarLinhaDoLancamento`
 * e `montarCompraPai`. Se um dos lados ganhar ou perder uma coluna, este teste cai.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COLUNAS_DA_COMPRA_PAI, COLUNAS_DA_LINHA } from "@/lib/finance/linha-do-lancamento";
import { STATUS_PROTEGIDOS } from "@/lib/finance/protecao-do-recebivel";

const MIGRATIONS = path.resolve(__dirname, "..", "..", "..", "supabase", "migrations");

function semComentarios(sql: string): string {
  return sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}

const normalizar = (sql: string) => semComentarios(sql).toLowerCase().replace(/\s+/g, " ");

const ARQUIVOS = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
const ler = (f: string) => normalizar(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));

const CRIA_SALVAR = "create or replace function public.salvar_lancamento(";
const CRIA_PARCELADA = "create or replace function public.criar_compra_parcelada(";

const DA_SALVAR = ARQUIVOS.filter((f) => ler(f).includes(CRIA_SALVAR));
const DA_PARCELADA = ARQUIVOS.filter((f) => ler(f).includes(CRIA_PARCELADA));
/**
 * 04-C (DV-1, DV-2): `salvar_lancamento` foi redefinido por
 * `20261102120200_reembolso_salvar_lancamento.sql`. As conferências da função leem a definição
 * MAIS NOVA (o nome do arquivo é a ordem de aplicação); as regras de forma valem para cada arquivo
 * que define uma das duas.
 */
const ultimo = (lista: string[]) => (lista.length > 0 ? ler(lista[lista.length - 1]) : "");
const SQL = [...new Set([...DA_SALVAR, ...DA_PARCELADA])].map(ler).join(" ");

/** O trecho de uma função: da criação até o fim do corpo (`$$;`). */
function corpo(sql: string, inicio: string): string {
  const de = sql.indexOf(inicio);
  if (de < 0) return "";
  const ate = sql.indexOf("$$;", de);
  return ate < 0 ? "" : sql.slice(de, ate + 3);
}

const SALVAR = corpo(ultimo(DA_SALVAR), CRIA_SALVAR);
const PARCELADA = corpo(ultimo(DA_PARCELADA), CRIA_PARCELADA);
const FORA_DAS_FUNCOES = SQL.replace(/\$\$.*?\$\$/g, "$$$$");

/** Afirma que cada trecho aparece, e na ordem dada. */
function emOrdem(texto: string, trechos: string[]) {
  let anterior = -1;
  for (const t of trechos) {
    const i = texto.indexOf(t, anterior + 1);
    expect(i, `"${t}" depois da posição ${anterior}`).toBeGreaterThan(anterior);
    anterior = i;
  }
}

/** A lista de colunas de um `insert into public.<tabela> (...)`, sem `user_id`. */
function colunasDoInsert(texto: string, tabela: string): string[] {
  const m = texto.match(new RegExp(`insert into public\\.${tabela} \\(([^)]*)\\)`));
  expect(m, `insert em ${tabela}`).not.toBeNull();
  return (m?.[1] ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c !== "user_id");
}

describe("03-G2 · M-G2 — salvar_lancamento e criar_compra_parcelada", () => {
  it("a M-G2 cria as duas funções, e só a 04-C redefine salvar_lancamento depois dela", () => {
    expect(DA_PARCELADA).toEqual(["20261025120000_salvar_lancamento_atomico.sql"]);
    expect(DA_SALVAR).toEqual([
      "20261025120000_salvar_lancamento_atomico.sql",
      "20261102120200_reembolso_salvar_lancamento.sql",
    ]);
    expect(SALVAR).not.toBe("");
    expect(PARCELADA).not.toBe("");
  });

  it("as duas são security invoker com search_path vazio — nada de definer, policy ou alter table", () => {
    for (const f of [SALVAR, PARCELADA]) {
      expect(f).toContain("security invoker");
      expect(f).toContain("set search_path = ''");
    }
    expect(SQL).not.toContain("security definer");
    expect(SQL).not.toContain("create policy");
    expect(SQL).not.toContain("alter table");
    expect(SQL).not.toContain("drop table");
  });

  it("p_id vai por último e com default (D-G2-18)", () => {
    expect(SALVAR).toContain("p_lancamento jsonb, p_divisao jsonb, p_id uuid default null");
  });

  it("sem sessão é a primeira recusa — o payload só é lido depois", () => {
    emOrdem(SALVAR, ["if v_user is null then raise exception 'lancamento_sem_sessao'", "p_lancamento ->>"]);
    emOrdem(PARCELADA, ["if v_user is null then raise exception 'lancamento_sem_sessao'", "p_pai ->>"]);
  });

  it("o user_id vem da sessão, nunca do payload", () => {
    for (const f of [SALVAR, PARCELADA]) {
      expect(f).toContain("v_user uuid := auth.uid();");
      expect(f).not.toContain("'user_id'");
      expect(f).not.toContain("r.user_id");
    }
  });

  it("espelho: o insert do lançamento tem exatamente COLUNAS_DA_LINHA, e cada uma sai do registro", () => {
    const colunas = colunasDoInsert(SALVAR, "transactions");
    expect(colunas).toEqual([...COLUNAS_DA_LINHA]);
    for (const c of COLUNAS_DA_LINHA) expect(SALVAR).toContain(`r.${c}`);
  });

  it("espelho: o update escreve cada coluna só quando a chave veio (D-G2-5)", () => {
    for (const c of COLUNAS_DA_LINHA) {
      expect(SALVAR).toContain(`${c} = case when p_lancamento ? '${c}' then`);
    }
    expect(SALVAR).not.toMatch(/\bparcelado =/);
    expect(SALVAR).not.toMatch(/\bvalor_total =/);
  });

  it("espelho: a compra-pai tem exatamente COLUNAS_DA_COMPRA_PAI (mais as fixas do parcelado)", () => {
    const colunas = colunasDoInsert(PARCELADA, "transactions");
    for (const c of COLUNAS_DA_COMPRA_PAI) expect(colunas).toContain(c);
    const fixas = colunas.filter((c) => !(COLUNAS_DA_COMPRA_PAI as readonly string[]).includes(c));
    expect(fixas.sort()).toEqual(["account_id", "parcelado", "statement_id", "transfer_account_id"]);
  });

  it("a lista protegida do SQL é a mesma de STATUS_PROTEGIDOS", () => {
    const m = SALVAR.match(/rc\.status in \(([^)]*)\)/);
    expect(m).not.toBeNull();
    const doSql = (m?.[1] ?? "").split(",").map((s) => s.trim().replace(/'/g, ""));
    expect([...doSql].sort()).toEqual([...STATUS_PROTEGIDOS].sort());
  });

  it("trava, reconfere a proteção e SÓ ENTÃO apaga e grava (D-G2-4)", () => {
    emOrdem(SALVAR, [
      "or rc.shared_expense_id in (select id from public.shared_expenses where transaction_id = v_id) for update;",
      "raise exception 'divisao_protegida'",
      "delete from public.receivables",
      "delete from public.shared_expenses",
      "insert into public.shared_expenses",
      "insert into public.receivables",
    ]);
  });

  it("o recebimento MANUAL protege em qualquer alcance (04-C, §5.6); o status, só na regra cheia", () => {
    expect(SALVAR).toContain(
      "exists (select 1 from public.receivable_receipts rr where rr.receivable_id = rc.id and rr.transaction_id is null)",
    );
    expect(SALVAR).toContain("(v_alcance = 'regra-cheia' and rc.status in (");
  });

  it("toda referência que a FK não confere precisa ser visível pela RLS (D-G2-7, D-G2-21)", () => {
    for (const tabela of ["accounts", "credit_cards", "card_statements", "categories", "subcategories", "people"]) {
      expect(SALVAR).toContain(`from public.${tabela}`);
    }
    // 04-C: a pessoa do reembolso também (a FK composta não passa pela RLS do PostgREST).
    expect(SALVAR).toContain("from public.people where id = (p_lancamento ->> 'reembolso_pessoa_id')::uuid");
    expect(SALVAR.match(/from public\.people p where p\.id = x\.person_id/g) ?? []).toHaveLength(2);
    expect(SALVAR).toContain("and i.status = 'ativa'");
  });

  it("parcela inexistente ou cancelada recusa ANTES de travar e apagar (achado 1 do validador)", () => {
    emOrdem(SALVAR, [
      "and i.status = 'ativa')",
      "raise exception 'divisao_invalida'",
      "or rc.shared_expense_id in (select id from public.shared_expenses where transaction_id = v_id) for update;",
      "delete from public.receivables",
    ]);
  });

  it("a compra-pai confere a quantidade de parcelas, e só mede lista (achados 2 e 3)", () => {
    expect(PARCELADA).toContain(
      "(case when jsonb_typeof(p_parcelas) = 'array' then jsonb_array_length(p_parcelas) < 1 or (p_pai ->> 'qtd_parcelas')::int is distinct from jsonb_array_length(p_parcelas) else true end) then",
    );
    expect(PARCELADA.match(/jsonb_array_length\(p_parcelas\)/g) ?? []).toHaveLength(2);
  });

  it("nenhum CASE fora de parênteses na condição de um IF — o IF do PL/pgSQL termina no 1º THEN fora deles", () => {
    // Imita o leitor do PL/pgSQL: a condição vai do `if` até o primeiro `then` com profundidade
    // de parênteses zero. Um `case` nessa profundidade teria o próprio `then` cortando a condição.
    for (const f of [SALVAR, PARCELADA]) {
      for (const m of f.matchAll(/(?<![a-z_])if\s/g)) {
        let profundidade = 0;
        let k = (m.index ?? 0) + 3;
        let noTopo = "";
        for (; k < f.length; k++) {
          const c = f[k];
          if (c === "(") profundidade++;
          else if (c === ")") profundidade--;
          else if (profundidade === 0 && /^then(?![a-z_])/.test(f.slice(k, k + 5))) break;
          if (profundidade === 0) noTopo += c;
        }
        expect(noTopo, f.slice(m.index ?? 0, k + 4)).not.toMatch(/(?<![a-z_])case(?![a-z_])/);
      }
    }
  });

  it("compra parcelada não muda de tipo por aqui (D-G2-6, RR12)", () => {
    emOrdem(SALVAR, ["for update;", "raise exception 'parcelado_nao_muda_de_tipo'", "update public.transactions t set"]);
  });

  it("a compra-pai confere a forma antes de gravar e a divisão entra pela MESMA função (D-G2-3)", () => {
    emOrdem(PARCELADA, [
      "raise exception 'parcelado_invalido'",
      "insert into public.transactions",
      "insert into public.transaction_installments",
      "perform public.salvar_lancamento(null, p_divisao, v_pai);",
    ]);
  });

  it("nenhuma das duas engole falha — sem bloco exception when", () => {
    expect(SQL).not.toMatch(/\bexception\s+when\b/);
  });

  it("fora das funções: só revoke de public e anon e grant para authenticated", () => {
    for (const assinatura of [
      "public.salvar_lancamento(jsonb, jsonb, uuid)",
      "public.criar_compra_parcelada(jsonb, jsonb, jsonb)",
    ]) {
      expect(FORA_DAS_FUNCOES).toContain(`revoke all on function ${assinatura} from public;`);
      expect(FORA_DAS_FUNCOES).toContain(`revoke all on function ${assinatura} from anon;`);
      expect(FORA_DAS_FUNCOES).toContain(`grant execute on function ${assinatura} to authenticated;`);
    }
    // O texto dos `comment on` cita "insert"; o que importa é o SQL fora das aspas.
    expect(FORA_DAS_FUNCOES.replace(/'[^']*'/g, "''")).not.toMatch(/\b(insert|update|delete)\b/);
  });
});
