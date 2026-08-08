/**
 * Fase 18-C · Bloco 3 — IA · As travas que moram NO BANCO, conferidas no repositório.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ POR QUE VARRER MIGRATION EM VEZ DE CONFIAR NO CÓDIGO                                  ║
 * ║                                                                                       ║
 * ║ Uso único, hash correto e imutabilidade não são `if`s deste módulo — são um índice     ║
 * ║ único, uma FK composta e a ausência de policy. Um teste que exercitasse só o TypeScript ║
 * ║ continuaria verde depois de alguém remover qualquer uma das três, porque o caminho     ║
 * ║ feliz não passa por elas: elas existem para o caminho que ninguém escreveu.            ║
 * ║                                                                                       ║
 * ║ ⚠️ E o arquivo é procurado por CONTEÚDO, nunca por nome fixo. Um teste amarrado a      ║
 * ║ `20260810100100_ai_action_approvals.sql` fica vermelho para sempre no dia em que a     ║
 * ║ migration for renomeada ou consolidada — com o banco correto. Foi o defeito corrigido  ║
 * ║ no teste do RPC na 18-C · Bloco 1.                                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = path.resolve(__dirname, "..", "..", "..", "..", "supabase", "migrations");

/** Todo o SQL do repositório, em ordem lexicográfica (= ordem de aplicação). */
function sqlCompleto(): string {
  return fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => fs.readFileSync(path.join(MIGRATIONS, f), "utf8"))
    .join("\n");
}

/** Só as declarações — comentário que descreve a regra não pode fazer o teste passar. */
function semComentarios(sql: string): string {
  return sql
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n");
}

const SQL = semComentarios(sqlCompleto());

const TABELAS = [
  "ai_action_proposals",
  "ai_action_approvals",
  "ai_action_executions",
] as const;

describe("as três tabelas da 18-C", () => {
  it.each(TABELAS)("%s é criada, com RLS e FORCE RLS", (tabela) => {
    expect(SQL).toContain(`create table if not exists public.${tabela}`);
    expect(SQL).toContain(`alter table public.${tabela} enable row level security`);
    expect(SQL).toContain(`alter table public.${tabela} force row level security`);
  });

  it.each(TABELAS)("%s tem índice em user_id", (tabela) => {
    expect(SQL).toMatch(new RegExp(`${tabela}_user_idx[\\s\\S]{0,80}\\(user_id\\)`));
  });

  /**
   * ⛔ NENHUMA DAS TRÊS TEM POLICY DE DELETE. Auditoria que se apaga não é auditoria — e a
   * de execuções é o registro de que a IA alterou um dado real do dono.
   */
  it.each(TABELAS)("%s não tem policy de DELETE", (tabela) => {
    expect(SQL).not.toMatch(new RegExp(`create policy[^\\n]*on public\\.${tabela}\\s*\\n\\s*for delete`, "i"));
    expect(SQL).not.toMatch(new RegExp(`for delete[^\\n]*on public\\.${tabela}`, "i"));
  });

  it("proposta e aprovação são IMUTÁVEIS — nem policy de UPDATE existe", () => {
    for (const tabela of ["ai_action_proposals", "ai_action_approvals"]) {
      expect(SQL, tabela).not.toMatch(
        new RegExp(`create policy[^\\n]*on public\\.${tabela}\\s*\\n\\s*for update`, "i"),
      );
    }
  });

  /**
   * A execução é a única que abre UPDATE, e a policy só FECHA o que está aberto: reescrever
   * `falhou` para `sucesso` depois do fato é exatamente o que uma auditoria não pode deixar.
   */
  it("a execução só pode ser FECHADA, nunca reescrita", () => {
    expect(SQL).toMatch(
      /create policy "ai_action_executions_close"[\s\S]{0,200}for update using \(user_id = auth\.uid\(\) and status = 'executando'\)/,
    );
  });
});

describe("as travas que o código não pode contornar", () => {
  /**
   * ⛔ USO ÚNICO. Uma proposta recebe UMA decisão, e a garantia é um índice — não um
   * `select` seguido de `insert`, que é uma corrida com duas abas abertas.
   */
  it("uma decisão por proposta, por índice único", () => {
    expect(SQL).toMatch(
      /create unique index if not exists ai_action_approvals_proposal_uidx\s*\n\s*on public\.ai_action_approvals \(proposal_id\)/,
    );
  });

  /**
   * ⛔ O HASH VIAJA NA FK. Uma confirmação cujo hash não seja o da própria proposta é
   * impossível de gravar — e não porque alguém se lembrou de comparar em código.
   */
  it("a FK da aprovação carrega o hash, amarrando-o ao effect_hash da proposta", () => {
    expect(SQL).toMatch(
      /foreign key \(proposal_id, user_id, confirmed_hash\)\s*\n?\s*references public\.ai_action_proposals \(id, user_id, effect_hash\)/,
    );
    // ...e o alvo dela existe.
    expect(SQL).toContain(
      "ai_action_proposals_id_user_hash_uidx\n  on public.ai_action_proposals (id, user_id, effect_hash)",
    );
  });

  /**
   * ⛔ O PRAZO É DO BANCO. `expires_at` tem default e teto no CHECK; o servidor não envia a
   * coluna. Uma janela vinda de aritmética de data em JavaScript é uma janela de replay
   * esperando um bug de fuso.
   */
  it("o prazo de 10 minutos é default do banco, com teto de 1 hora", () => {
    expect(SQL).toContain("expires_at         timestamptz not null default (now() + interval '10 minutes')");
    expect(SQL).toMatch(/check \(expires_at > created_at and expires_at <= created_at \+ interval '1 hour'\)/);
  });

  it("o servidor NÃO envia expires_at ao gravar a proposta", () => {
    const proposals = fs.readFileSync(path.join(__dirname, "proposals.ts"), "utf8");
    const codigo = semComentarios(proposals).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(codigo).not.toContain("expires_at:");
  });

  /**
   * ⛔ A DECISÃO DELIBERADA QUE ESTE TESTE PROTEGE (e que sem ele alguém "consertaria"):
   *
   * `ai_action_executions` NÃO tem FK para a aprovação nem para a proposta. `ai_conversations`
   * tem policy de DELETE; com a corrente completa de FKs compostas, apagar uma conversa
   * apagaria por cascade o registro de que a IA lançou uma transação. A execução é o único
   * dos três registros que fala de uma escrita real nos dados do dono, e ela sobrevive.
   *
   * Quem acrescentar a FK "por consistência" derruba este teste — que é o objetivo.
   */
  it("a execução não pendura numa cadeia que morre com a conversa", () => {
    expect(SQL).not.toMatch(
      /alter table public\.ai_action_executions[\s\S]{0,200}foreign key \(approval_id/,
    );
    expect(SQL).not.toMatch(
      /alter table public\.ai_action_executions[\s\S]{0,200}foreign key \(proposal_id/,
    );
  });

  /**
   * ...e, SEM a FK composta, a chave única global seria ocupável: bastaria inserir uma
   * execução com o `approval_id` de outro usuário para impedir o dono de executar a
   * aprovação dele. É a mesma classe de defeito da ponte da agenda na 17-F. Por isso os
   * dois índices de idempotência são emparelhados com `user_id`.
   */
  it("as chaves de idempotência da execução são emparelhadas com user_id", () => {
    expect(SQL).toMatch(
      /ai_action_executions_approval_user_uidx\s*\n\s*on public\.ai_action_executions \(approval_id, user_id\)/,
    );
    expect(SQL).toMatch(
      /ai_action_executions_idempotency_user_uidx\s*\n\s*on public\.ai_action_executions \(idempotency_key, user_id\)/,
    );
  });

  /**
   * A proposta, ao contrário, PODE usar chave única sem `user_id`... porque ela nem tem
   * chave única de negócio. O que ela tem é FK composta em cada referência ao chat — e é
   * isso que impede um `run_id` de um run e um `tool_call_id` de outro na mesma linha.
   */
  it("a proposta amarra run, conversa e tool call ao MESMO dono e ao MESMO run", () => {
    expect(SQL).toMatch(
      /foreign key \(run_id, conversation_id, user_id\)\s*\n?\s*references public\.ai_runs \(id, conversation_id, user_id\)/,
    );
    expect(SQL).toMatch(
      /foreign key \(tool_call_id, run_id, user_id\)\s*\n?\s*references public\.ai_tool_calls \(id, run_id, user_id\)/,
    );
  });

  /**
   * O CHECK de risco recusa 1 (leitura não propõe) e 5 (nível "não permitido", que por
   * desenho não tem descriptor). É a escala do CÓDIGO — §3.1 do design.
   */
  it("proposta só aceita risco de escrita (2 a 4)", () => {
    expect(SQL).toMatch(/risk\s+integer not null check \(risk between 2 and 4\)/);
  });

  /**
   * `origem` só aceita `'tela'`. Nenhuma confirmação vem do modelo, de webhook, de link por
   * e-mail ou de auto-execução — e uma origem nova exige migration, que é o pedágio certo.
   */
  it("a confirmação só tem uma origem, e ela é a tela", () => {
    expect(SQL).toMatch(/origem\s+text not null default 'tela' check \(origem in \('tela'\)\)/);
  });
});

describe("as cinco chaves de escrita", () => {
  const CHAVES = [
    "allow_write_todo",
    "allow_write_habits",
    "allow_write_calendar",
    "allow_write_nutrition",
    "allow_write_finance",
  ];

  it.each(CHAVES)("%s nasce DESLIGADA", (chave) => {
    expect(SQL).toMatch(new RegExp(`add column if not exists ${chave}\\s+boolean not null default false`));
  });

  /**
   * ⚠️ O CHECK de `rejection_reason` é uma lista que precisa concordar com
   * `ToolRejectionReason`. O que falta lá não impede a recusa (o guard é puro) — apaga o
   * REGISTRO dela, em silêncio, porque `audit.ts` loga e não lança.
   */
  it("o vocabulário de recusa do banco conhece TOOL_WRITE_OUT_OF_BAND", () => {
    const ultimoCheck = SQL.lastIndexOf("ai_tool_calls_rejection_reason_check");
    expect(ultimoCheck).toBeGreaterThan(-1);
    expect(SQL.slice(ultimoCheck, ultimoCheck + 600)).toContain("TOOL_WRITE_OUT_OF_BAND");
  });
});

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ 18-C · Bloco 4 — O CHECK QUE TERIA QUEBRADO SÓ EM RUNTIME.                            ║
 * ║                                                                                       ║
 * ║ `concluirTarefaTodo` grava a conclusão pelo MESMO serviço do formulário, com           ║
 * ║ `source: 'ia'`. O CHECK da Fase 15 aceitava só manual/rapido/massa/notificacao/cron:   ║
 * ║ a gravação falharia com 23514 **depois** de o dono confirmar na tela.                  ║
 * ║                                                                                       ║
 * ║ Este teste lê a migration real. É a lição do Bloco 3 aplicada de novo: duplo de teste  ║
 * ║ que não modela a restrição do banco esconde exatamente este tipo de defeito.           ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
describe("o vocabulário de origem de conclusão do TO-DO", () => {
  it("existe uma migration que alarga o CHECK", () => {
    expect(SQL).toContain("todo_completions_completion_source_check");
  });

  /**
   * ⚠️ A JANELA É A DA LISTA, NÃO "OS PRÓXIMOS 300 CARACTERES" — e a diferença foi pega por
   * mutação, não por leitura.
   *
   * A primeira versão deste teste fatiava 300 caracteres a partir do `check`. Removendo 'ia'
   * do CHECK, ele continuava VERDE: o `comment on column` logo abaixo cita `''ia''` na
   * explicação, e a janela o engolia. O teste estava lendo a documentação da regra em vez da
   * regra — exatamente o defeito que `semComentarios` existe para evitar, entrando por outra
   * porta (aqui é um literal SQL, não um comentário `--`).
   *
   * Agora a fatia vai do `in (` até o `)` que o fecha. Nada além da lista entra.
   */
  it("o ÚLTIMO CHECK declarado aceita ia e mantém os cinco anteriores", () => {
    const ultimo = SQL.lastIndexOf("check (completion_source in");
    expect(ultimo).toBeGreaterThan(-1);

    const abre = SQL.indexOf("(", SQL.indexOf(" in", ultimo));
    const fecha = SQL.indexOf(")", abre);
    expect(abre, "lista não delimitada").toBeGreaterThan(-1);
    expect(fecha, "lista não fechada").toBeGreaterThan(abre);

    const lista = SQL.slice(abre + 1, fecha);
    for (const valor of ["manual", "rapido", "massa", "notificacao", "cron", "ia"]) {
      expect(lista, valor).toContain("'" + valor + "'");
    }
    // E nada além dos seis: um valor a mais aqui seria uma origem que nenhuma tela produz.
    expect(lista.match(/'/g)?.length, lista).toBe(12);
  });
});
