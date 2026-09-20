/**
 * Fase 18-F · Bloco 4 — IA · As travas da experiência que moram NO BANCO.
 *
 * Varrer a migration, e não confiar no TypeScript: a armadilha deste bloco é uma AUSÊNCIA —
 * `ai_runs` tem DOIS checks sobre `kind`, e mexer só no de valores deixa o de coerência
 * dizendo que apenas `chat` tem conversa. O panorama abre conversa, então todo run falharia
 * no INSERT, dentro da transação de admissão, e o erro chegaria à tela como `AI_UNKNOWN`.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EXPERIENCIA_IDS } from "./contracts";

const migration = (nome: string) =>
  path.resolve(__dirname, "..", "..", "..", "..", "supabase", "migrations", nome);

const ARQUIVO = migration("20260922100000_ai_experiencias.sql");
const ARQUIVO_CLIQUE_DUPLO = migration("20260922110000_ai_experiencia_clique_duplo.sql");

/**
 * ⛔ SÓ AS DECLARAÇÕES. O cabeçalho desta migration DESCREVE as trocas em relação a
 * `ai_begin_chat_run` — e cita `p_user_text` e `p_conversation_id` por nome, justamente para
 * dizer que foram removidos. Sem cortar os comentários, o teste que prova a remoção passaria
 * a reprovar a própria explicação dela.
 */
const semComentarios = (arquivo: string) =>
  fs
    .readFileSync(arquivo, "utf8")
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n");

const sql = semComentarios(ARQUIVO);
const sqlCliqueDuplo = semComentarios(ARQUIVO_CLIQUE_DUPLO);

describe("18-F Bloco 4 — a migration das experiências", () => {
  it("a 4ª espécie entra nos DOIS checks — valores E coerência", () => {
    expect(sql).toMatch(/kind in \('chat', 'extracao', 'insight', 'experience'\)/);
    // ⛔ O que quase ficou de fora: experience TEM conversa.
    expect(sql).toMatch(/kind = 'experience'\s+and conversation_id is not null/);
    // E as outras três continuam com a forma delas, por inteiro.
    expect(sql).toMatch(/kind = 'chat'\s+and conversation_id is not null/);
    expect(sql).toMatch(/kind = 'extracao'\s+and conversation_id is null/);
    expect(sql).toMatch(/kind = 'insight'\s+and conversation_id is null/);
  });

  /**
   * ⛔ O recurso disputado é o ORÇAMENTO DO DONO, não a espécie do run. Com namespace
   * próprio, um panorama e uma mensagem simultâneos leriam o mesmo consumo e passariam os
   * dois — foi a lição da 18-D, repetida pela 18-E.
   */
  it("o advisory lock é o MESMO das outras três espécies", () => {
    expect(sql).toContain("hashtextextended('ai:begin_run:' || v_user::text, 0)");
  });

  it("a RPC é SECURITY INVOKER com search_path travado", () => {
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set search_path = ''");
    expect(sql).not.toContain("security definer");
  });

  it("a experiência é allowlist, e a chave do mecanismo é conferida no BANCO", () => {
    expect(sql).toContain("not in ('planejar-dia', 'encerrar-dia', 'planejar-semana')");
    expect(sql).toContain("select p.allow_cross_module into v_allowed");
    expect(sql).toContain("raise exception 'AI_CROSS_MODULE_NOT_ALLOWED'");
    expect(sql).toContain("raise exception 'AI_EXPERIENCE_NOT_AVAILABLE'");
  });

  it("o texto da primeira mensagem NÃO vem do cliente", () => {
    // `p_user_text` existiria se alguém tivesse copiado a assinatura inteira sem pensar.
    expect(sql).not.toContain("p_user_text");
    // E a experiência nunca continua uma conversa existente.
    expect(sql).not.toContain("p_conversation_id");
  });

  it("o run nasce com kind = 'experience' e com conversa", () => {
    expect(sql).toMatch(/insert into public\.ai_runs/);
    expect(sql).toContain("'experience', v_agent, p_prompt_version");
    expect(sql).toContain("insert into public.ai_conversations");
  });

  it("a allowlist do SQL concorda com EXPERIENCIA_IDS", () => {
    for (const id of EXPERIENCIA_IDS) expect(sql, id).toContain(`'${id}'`);
  });

  /**
   * ⚠️ A assinatura do REVOKE/GRANT tem de casar com a da função, argumento a argumento —
   * um tipo errado cria um `grant` para uma sobrecarga que não existe, e a função fica
   * inalcançável para `authenticated` sem nenhum erro na aplicação da migration.
   */
  it("a função é fechada para public/anon e aberta para authenticated", () => {
    const assinatura = "(text, text, text, text, text, numeric, text, integer)";
    expect(sql).toContain(
      `revoke all on function public.ai_begin_experience_run${assinatura} from public;`,
    );
    expect(sql).toContain(
      `revoke all on function public.ai_begin_experience_run${assinatura} from anon;`,
    );
    expect(sql).toContain(
      `grant execute on function public.ai_begin_experience_run${assinatura} to authenticated;`,
    );
  });

  it("não cria tabela nenhuma", () => {
    expect(sql).not.toMatch(/create table/i);
  });
});

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ 18-F Bloco 4 — A JANELA DE DEDUPE DO CLIQUE DUPLO (achado P2 da auditoria).           ║
 * ║                                                                                       ║
 * ║ O panorama SEMPRE gasta. O advisory lock serializa duas chamadas simultâneas, mas não ║
 * ║ as deduplica: a segunda espera, lê a reserva da primeira e cria um segundo run pago   ║
 * ║ pelo mesmo conteúdo. A trava mora no BANCO porque o estado `enviando` do cliente não  ║
 * ║ atravessa duas requisições HTTP — nem duas telas (a página e o painel têm estados      ║
 * ║ independentes).                                                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
describe("18-F Bloco 4 — a migration do clique duplo", () => {
  it("recusa com um código próprio, não reusando um dos outros", () => {
    expect(sqlCliqueDuplo).toContain("raise exception 'AI_EXPERIENCE_JUST_STARTED'");
  });

  /**
   * ⛔ AS DUAS CONDIÇÕES, E É O PONTO INTEIRO DA CORREÇÃO. Só `status in (...)` travaria o
   * dono por 5 minutos (a lease da reconciliação) depois de ele fechar a aba; só a janela
   * recusaria o retry de um panorama que acabou de falhar — que é o caso mais comum de
   * querer clicar de novo. Uma mutação que remova qualquer uma das duas derruba este teste.
   */
  it("filtra por run ABERTO **e** por janela de tempo — nunca só um dos dois", () => {
    const bloco = sqlCliqueDuplo.slice(
      sqlCliqueDuplo.indexOf("AI_EXPERIENCE_JUST_STARTED") - 600,
      sqlCliqueDuplo.indexOf("AI_EXPERIENCE_JUST_STARTED"),
    );
    expect(bloco).toContain("r.status in ('reserved', 'streaming')");
    // ⚠️ `created_at`: a coluna que as OUTRAS janelas da função usam (rate limit, orçamento).
    expect(bloco).toContain("r.created_at > v_now - c_janela");
    expect(bloco).toContain("r.kind = 'experience'");
    // O dono, sempre: a janela de um não pode alcançar a de outro.
    expect(bloco).toContain("r.user_id = v_user");
  });

  /**
   * ⚠️ `agent_id` discrimina QUAL panorama. Sem ele, "Planejar meu dia" bloquearia
   * "Encerrar meu dia" por 15 segundos — e pedir os dois em sequência é uso normal.
   */
  it("a janela é por EXPERIÊNCIA, não por experiências em geral", () => {
    expect(sqlCliqueDuplo).toContain("r.agent_id = v_agent");
  });

  it("a janela é curta — segundos, nunca minutos", () => {
    expect(sqlCliqueDuplo).toMatch(/c_janela\s+constant interval := interval '\d+ seconds'/);
  });

  /** É `create or replace` da MESMA função: nenhuma tabela, coluna ou índice novos. */
  it("não cria tabela, coluna nem índice", () => {
    expect(sqlCliqueDuplo).not.toMatch(/create table/i);
    expect(sqlCliqueDuplo).not.toMatch(/add column/i);
    expect(sqlCliqueDuplo).not.toMatch(/create (unique )?index/i);
    expect(sqlCliqueDuplo).toContain(
      "create or replace function public.ai_begin_experience_run(",
    );
  });

  /**
   * ⛔ DEPOIS DO LOCK, ou a checagem tem corrida: duas admissões simultâneas leriam a tabela
   * antes de qualquer uma gravar, e as duas passariam — exatamente o defeito a corrigir.
   */
  it("a checagem acontece DEPOIS do advisory lock", () => {
    const lock = sqlCliqueDuplo.indexOf("pg_advisory_xact_lock");
    const checagem = sqlCliqueDuplo.indexOf("AI_EXPERIENCE_JUST_STARTED");
    expect(lock).toBeGreaterThan(0);
    expect(checagem).toBeGreaterThan(lock);
  });

  /** O rodapé viaja junto: `create or replace` não recria grants, mas repeti-los é barato. */
  it("mantém o fechamento para public/anon", () => {
    const assinatura = "(text, text, text, text, text, numeric, text, integer)";
    expect(sqlCliqueDuplo).toContain(
      `revoke all on function public.ai_begin_experience_run${assinatura} from public;`,
    );
    expect(sqlCliqueDuplo).toContain(
      `grant execute on function public.ai_begin_experience_run${assinatura} to authenticated;`,
    );
  });
});
