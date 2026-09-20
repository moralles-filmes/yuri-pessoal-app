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

const ARQUIVO = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
  "20260922100000_ai_experiencias.sql",
);

/**
 * ⛔ SÓ AS DECLARAÇÕES. O cabeçalho desta migration DESCREVE as trocas em relação a
 * `ai_begin_chat_run` — e cita `p_user_text` e `p_conversation_id` por nome, justamente para
 * dizer que foram removidos. Sem cortar os comentários, o teste que prova a remoção passaria
 * a reprovar a própria explicação dela.
 */
const sql = fs
  .readFileSync(ARQUIVO, "utf8")
  .split("\n")
  .filter((l) => !/^\s*--/.test(l))
  .join("\n");

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
