/**
 * REDESIGN-04-C · M1/M2/M3 — os arquivos das migrations do reembolso, conferidos no repositório
 * (padrão de `m-g2-salvar-lancamento.test.ts`: achado por NOME, SQL sem comentários,
 * normalizado).
 *
 * O harness não executa SQL. O comportamento (os casos dourados) é provado no banco por
 * `scripts/finance/verificar-reembolso.sql`; aqui ficam travadas as propriedades de FORMA que um
 * teste de unidade não pega: FK composta e cascade, nenhuma escrita em `receivables`, as seis
 * triggers de instrução e o `search_path` vazio.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = path.resolve(__dirname, "..", "..", "..", "supabase", "migrations");

function semComentarios(sql: string): string {
  return sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}

const ler = (f: string) =>
  semComentarios(fs.readFileSync(path.join(MIGRATIONS, f), "utf8")).toLowerCase().replace(/\s+/g, " ");

const M1 = ler("20261102120000_reembolso_vinculo.sql");
const M2 = ler("20261102120100_reembolso_salvar_lancamento.sql");
const M3 = ler("20261102120200_reembolso_realocacao.sql");

/** Os corpos das funções de um arquivo. */
function funcoes(sql: string): string[] {
  const corpos: string[] = [];
  for (const m of sql.matchAll(/create or replace function/g)) {
    const fim = sql.indexOf("$$;", m.index ?? 0);
    corpos.push(sql.slice(m.index ?? 0, fim < 0 ? undefined : fim + 3));
  }
  return corpos;
}

describe("04-C · M1 — o vínculo", () => {
  it("cria as duas unique que as FKs compostas exigem", () => {
    expect(M1).toContain("add constraint transactions_id_user_uk unique (id, user_id)");
    expect(M1).toContain("add constraint people_id_user_uk unique (id, user_id)");
  });

  it("reembolso_pessoa_id aponta para people pela FK composta, SEM cascade (pessoa com reembolso é inativada)", () => {
    expect(M1).toContain(
      "foreign key (reembolso_pessoa_id, user_id) references public.people (id, user_id);",
    );
  });

  it("o CHECK só aceita vínculo em receita de terceiro ou compartilhada", () => {
    expect(M1).toContain(
      "add constraint transactions_reembolso_forma check ( reembolso_pessoa_id is null or (type = 'receita' and classificacao in ('terceiro', 'compartilhada')) )",
    );
  });

  it("a alocação aponta para a receita pela FK composta com cascade — apagar a receita apaga as alocações", () => {
    expect(M1).toContain("drop constraint if exists receivable_receipts_transaction_id_fkey");
    expect(M1).toContain(
      "foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete cascade",
    );
    expect(M1).toContain(
      "foreign key (conta_id, user_id) references public.accounts (id, user_id) on delete set null (conta_id)",
    );
  });

  it("é aditiva: nenhum update, delete ou drop de tabela/coluna existente", () => {
    expect(M1).not.toMatch(/\bupdate public\./);
    expect(M1).not.toMatch(/\bdelete from\b/);
    expect(M1).not.toContain("drop table");
    expect(M1).not.toContain("drop column");
  });
});

describe("04-C · M2 — salvar_lancamento com o vínculo", () => {
  it("só função e grants: nenhuma tabela, coluna, policy ou trigger", () => {
    expect(M2).not.toContain("alter table");
    expect(M2).not.toContain("create policy");
    expect(M2).not.toContain("create trigger");
    expect(M2).not.toContain("security definer");
  });

  it("grava reembolso_pessoa_id no insert e, só quando a chave veio, no update", () => {
    expect(M2).toContain("valor_pessoal, reembolso_pessoa_id )");
    expect(M2).toContain("r.valor_pessoal, r.reembolso_pessoa_id from");
    expect(M2).toContain(
      "reembolso_pessoa_id = case when p_lancamento ? 'reembolso_pessoa_id' then r.reembolso_pessoa_id else t.reembolso_pessoa_id end",
    );
  });
});

describe("04-C · M3 — a realocação", () => {
  it("toda função é security invoker com search_path vazio", () => {
    const corpos = funcoes(M3);
    expect(corpos).toHaveLength(3);
    for (const f of corpos) {
      expect(f).toContain("security invoker");
      expect(f).toContain("set search_path = ''");
    }
    expect(M3).not.toContain("security definer");
  });

  it("⛔ nunca grava receivables (o pago de uma linha coberta é derivado da soma)", () => {
    expect(M3).not.toMatch(/\bupdate public\.receivables\b/);
    expect(M3).not.toMatch(/\binsert into public\.receivables\b/);
    expect(M3).not.toMatch(/\bdelete from public\.receivables\b/);
  });

  it("só toca alocação automática (transaction_id preenchido) e nunca a manual", () => {
    expect(M3).toContain("and rr.transaction_id is not null");
    // A única escrita que não filtra por transaction_id é a do aparar, que vem de uma lista já
    // filtrada pelo transaction_id do pagamento.
    expect(M3).toContain("where rr.user_id = p_user and rr.transaction_id = v_pag.transaction_id order by rr.created_at desc, rr.id desc");
  });

  it("serializa por pessoa e grava a alocação com clock_timestamp() (o aparar desempata pela mais nova)", () => {
    expect(M3).toContain("pg_advisory_xact_lock(hashtext('reembolso:' || p_user::text || ':' || p_person::text))");
    expect(M3).toContain("clock_timestamp()");
  });

  it("os seis triggers de instrução, um por evento, com tabela de transição", () => {
    for (const [nome, tabela, evento] of [
      ["reembolso_tx_ins", "transactions", "insert"],
      ["reembolso_tx_upd", "transactions", "update"],
      ["reembolso_tx_del", "transactions", "delete"],
      ["reembolso_rec_ins", "receivables", "insert"],
      ["reembolso_rec_upd", "receivables", "update"],
      ["reembolso_rec_del", "receivables", "delete"],
    ] as const) {
      expect(M3).toContain(`create trigger ${nome} after ${evento} on public.${tabela} referencing`);
    }
    expect(M3.match(/for each statement/g) ?? []).toHaveLength(6);
    expect(M3).not.toContain("for each row");
  });

  it("nenhum ramo do trigger lê a tabela de transição que o evento não tem", () => {
    for (const f of funcoes(M3).slice(1)) {
      const insert = f.slice(f.indexOf("if tg_op = 'insert'"), f.indexOf("elsif tg_op = 'update'"));
      const del = f.slice(f.indexOf("else for v_par"));
      expect(insert).not.toContain("velhas");
      expect(del).not.toContain("novas");
    }
  });
});
