/**
 * REDESIGN-03-F · M-F — o arquivo da migration, conferido no repositório (padrão de
 * `m2-liquidado-em.test.ts`: achado por CONTEÚDO, SQL sem comentários, normalizado).
 *
 * O harness não executa SQL. O que garante "a fatura é paga uma vez só" é a CONDIÇÃO da reserva
 * (`pago_em is null`) sob o lock da linha; o que garante "nunca transferência sem fatura
 * apontando" é a ATOMICIDADE (nenhum `exception when` engolindo a falha). As duas coisas são
 * travadas aqui por varredura; o comportamento real é provado uma vez no banco, com dado
 * sintético (spec §10).
 *
 * O ESPELHO: o SQL só conhece os NOMES das colunas do lançamento; os valores saem de
 * `montarPagamentoFatura`. Se um dos lados ganhar ou perder uma coluna, este teste cai.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { montarPagamentoFatura } from "@/lib/finance/statement-payment";

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

const CRIA_PAGAR = "create or replace function public.pagar_fatura(";
const CRIA_DESFAZER = "create or replace function public.desfazer_pagamento_fatura(";

const DA_PAGAR = ARQUIVOS.filter((f) => ler(f).includes(CRIA_PAGAR));
const DA_DESFAZER = ARQUIVOS.filter((f) => ler(f).includes(CRIA_DESFAZER));
const SQL = DA_PAGAR.length === 1 ? ler(DA_PAGAR[0]) : "";

/** O trecho de uma função: da criação até o fim do corpo (`$$;`). */
function corpo(inicio: string): string {
  const de = SQL.indexOf(inicio);
  if (de < 0) return "";
  const ate = SQL.indexOf("$$;", de);
  return ate < 0 ? "" : SQL.slice(de, ate + 3);
}

const PAGAR = corpo(CRIA_PAGAR);
const DESFAZER = corpo(CRIA_DESFAZER);
/** O arquivo SEM os corpos das funções: o que roda na aplicação, fora delas. */
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

describe("03-F · M-F — pagar_fatura e desfazer_pagamento_fatura", () => {
  it("existe exatamente um arquivo, e ele cria as duas funções", () => {
    expect(DA_PAGAR).toHaveLength(1);
    expect(DA_DESFAZER).toEqual(DA_PAGAR);
    expect(PAGAR).not.toBe("");
    expect(DESFAZER).not.toBe("");
  });

  it("as duas são security invoker com search_path vazio — nenhuma security definer", () => {
    for (const f of [PAGAR, DESFAZER]) {
      expect(f).toContain("security invoker");
      expect(f).toContain("set search_path = ''");
    }
    expect(SQL).not.toContain("security definer");
  });

  it("pagar: sem sessão é a primeira recusa — o payload só é lido depois", () => {
    expect(PAGAR).toContain("v_conta uuid;");
    emOrdem(PAGAR, [
      "if v_user is null then raise exception 'fatura_sem_sessao'",
      "v_conta := (p_lancamento ->> 'account_id')::uuid;",
    ]);
  });

  it("pagar: só cria o que o desfazer aceita apagar — as mesmas quatro condições, antes de qualquer escrita", () => {
    const primeiraEscrita = PAGAR.indexOf("update public.card_statements");
    expect(primeiraEscrita).toBeGreaterThan(0);
    const guarda = PAGAR.slice(0, primeiraEscrita);
    const formaNoPagar = [
      "(p_lancamento ->> 'type') is distinct from 'transferencia'",
      "(p_lancamento ->> 'status') is distinct from 'pago'",
      "(p_lancamento ->> 'transfer_account_id') is not null",
      "(p_lancamento ->> 'transfer_group_id') is not null",
    ];
    emOrdem(guarda, [...formaNoPagar, "raise exception 'fatura_pagamento_invalido'"]);
    // Espelho com o desfazer: mesma coluna, mesmo valor exigido.
    const formaNoDesfazer = formaNoPagar.map((c) =>
      c
        .replace(/\(p_lancamento ->> '(\w+)'\)/, "v_forma.$1")
        .replace("is distinct from", "<>"),
    );
    for (const c of formaNoDesfazer) expect(DESFAZER).toContain(c);
  });

  it("pagar: a conta tem de ser visível pela RLS (a FK não confere o dono), antes de qualquer escrita", () => {
    const primeiraEscrita = PAGAR.indexOf("update public.card_statements");
    emOrdem(PAGAR.slice(0, primeiraEscrita), [
      "if not exists (select 1 from public.accounts where id = v_conta) then raise exception 'fatura_pagamento_invalido'",
    ]);
  });

  it("pagar: a reserva é condicional e a recusa vem ANTES do insert", () => {
    emOrdem(PAGAR, [
      "update public.card_statements set status = 'paga'",
      "where id = p_statement_id and pago_em is null;",
      "if not found then",
      "raise exception 'fatura_ja_paga'",
      "insert into public.transactions",
    ]);
  });

  it("pagar: o lançamento vem do jsonb, mas o user_id vem da sessão", () => {
    expect(PAGAR).toContain("v_user uuid := auth.uid();");
    expect(PAGAR).toContain("from jsonb_populate_record(null::public.transactions, p_lancamento) r");
    expect(PAGAR).toMatch(/\bselect v_user, r\.type,/);
    expect(PAGAR).not.toContain("'user_id'");
    expect(PAGAR).not.toContain("r.user_id");
  });

  it("pagar: grava o ponteiro para o lançamento criado", () => {
    emOrdem(PAGAR, [
      "returning id into v_lancamento;",
      "update public.card_statements set pago_transacao_id = v_lancamento where id = p_statement_id;",
      "return v_lancamento;",
    ]);
  });

  it("espelho: as colunas do insert são exatamente as chaves de montarPagamentoFatura (mais user_id)", () => {
    const m = PAGAR.match(/insert into public\.transactions \(([^)]*)\)/);
    expect(m).not.toBeNull();
    const colunas = (m?.[1] ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c !== "user_id")
      .sort();
    const chaves = Object.keys(
      montarPagamentoFatura({
        contaId: "conta-sintetica",
        total: 1,
        cartaoNome: "Cartão Sintético",
        competencia: "2031-01-01",
        dataPagamento: "2031-01-10",
      }),
    ).sort();
    expect(colunas).toEqual(chaves);
    expect(colunas).toContain("liquidado_em");
    // E cada coluna sai do registro, na mesma lista.
    for (const c of colunas) expect(PAGAR).toContain(`r.${c}`);
  });

  it("nenhuma das duas engole falha — sem bloco exception when", () => {
    expect(SQL).not.toMatch(/\bexception\s+when\b/);
  });

  it("desfazer: trava a fatura e o lançamento antes de decidir", () => {
    expect(DESFAZER.match(/\bfor update\b/g) ?? []).toHaveLength(2);
    emOrdem(DESFAZER, [
      "from public.card_statements where id = p_statement_id for update;",
      "from public.transactions where id = p_lancamento_id for update;",
    ]);
  });

  it("desfazer: as três recusas vêm ANTES de qualquer escrita", () => {
    const primeiraEscrita = Math.min(
      DESFAZER.indexOf("update public.card_statements"),
      DESFAZER.indexOf("delete from public.transactions"),
    );
    expect(primeiraEscrita).toBeGreaterThan(0);
    const antes = DESFAZER.slice(0, primeiraEscrita);
    emOrdem(antes, [
      "if v_pago_em is null then raise exception 'fatura_nao_paga'",
      "if v_atual is distinct from p_lancamento_id then raise exception 'pagamento_mudou'",
    ]);
    expect(antes).toContain("raise exception 'pagamento_editado'");
  });

  it("desfazer: só apaga o que ainda tem a forma do pagamento (as quatro condições, D-F7)", () => {
    const i = DESFAZER.indexOf("raise exception 'pagamento_editado'");
    const guarda = DESFAZER.slice(0, i);
    for (const condicao of [
      "v_forma.type <> 'transferencia'",
      "v_forma.status <> 'pago'",
      "v_forma.transfer_account_id is not null",
      "v_forma.transfer_group_id is not null",
    ]) {
      expect(guarda).toContain(condicao);
    }
  });

  it("desfazer: solta a fatura e apaga o lançamento na mesma função", () => {
    emOrdem(DESFAZER, [
      "update public.card_statements set status = 'aberta', pago_em = null, pago_conta_id = null, pago_transacao_id = null where id = p_statement_id;",
      "delete from public.transactions where id = p_lancamento_id;",
    ]);
  });

  it("revoke de public e anon, grant a authenticated, para as duas", () => {
    for (const assinatura of [
      "public.pagar_fatura(uuid, timestamptz, jsonb)",
      "public.desfazer_pagamento_fatura(uuid, uuid)",
    ]) {
      expect(SQL).toContain(`revoke all on function ${assinatura} from public;`);
      expect(SQL).toContain(`revoke all on function ${assinatura} from anon;`);
      expect(SQL).toContain(`grant execute on function ${assinatura} to authenticated;`);
    }
  });

  it("o arquivo não muda schema nem dado — sem backfill", () => {
    expect(FORA_DAS_FUNCOES).not.toBe(SQL);
    for (const proibido of [
      /\bcreate\s+table\b/,
      /\balter\s+table\b/,
      /\bcreate\s+policy\b/,
      /\bcreate\s+(unique\s+)?index\b/,
      /\btruncate\b/,
      /\bdrop\s+/,
      /\binsert\s+into\b/,
      /\bupdate\s+public\./,
      /\bdelete\s+from\b/,
    ]) {
      expect(FORA_DAS_FUNCOES).not.toMatch(proibido);
    }
  });
});
