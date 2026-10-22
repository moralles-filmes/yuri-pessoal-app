# REDESIGN-03-F — Pagar fatura uma vez só, e desfazer com confirmação · Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pagar fatura vira uma transação única no banco (RPC `pagar_fatura`), e o "Desfazer" de `/faturas` vira um diálogo que lê o pagamento antes e só apaga o lançamento lido (RPC `desfazer_pagamento_fatura`).

**Architecture:** Uma migration aditiva (duas funções `security invoker`, nenhuma tabela). O lançamento continua montado em TS por `montarPagamentoFatura` e vai à RPC como jsonb; a RPC só ordena e torna atômico. A decisão do desfazer é pura (`desfazer-pagamento.ts`); a tela ganha um diálogo lazy que lê ao abrir (`preverDesfazerPagamento`) e confirma preso ao `lancamentoId`.

**Tech Stack:** Next.js 16 (Server Actions), Supabase (Postgres plpgsql, MCP), Vitest (node), harness `src/test/supabase-em-memoria.ts`.

**Spec:** `docs/superpowers/specs/2026-10-21-03f-pagamento-fatura-design.md` (aprovado em 2026-10-21). O spec é o contrato: SQL (§5.1), mensagens (§5.2, §5.3, §5.4, §6.1), mutações (§7) e a prova no banco (§10) são copiados de lá, não reescritos aqui.

## Global Constraints

- Migration **só** a M-F (`supabase/migrations/20261021120000_pagamento_fatura_atomico.sql`), aplicada só depois do "aplique" literal do dono numa mensagem só para isso, via MCP `apply_migration`. `declined` → parar e perguntar. Nenhuma policy, nenhum backfill, nenhum conserto de órfão.
- Tipos (`src/types/supabase.ts`) regenerados pelo MCP depois de aplicar, com o diff lido: **só** `pagar_fatura` e `desfazer_pagamento_fatura` em `Functions` entram.
- Sem push, sem merge, sem deploy, sem upstream.
- Intocados: `docs/redesign/STATUS.md`, todo `CLAUDE.md`, `AGENTS.md`, `src/lib/finance/dashboard.test.ts`, `src/lib/finance/dashboard-caracterizacao.test.ts`. Em `supabase/`, só a migration.
- `markStatementPaid(id, contaId, dataPagamento?)` com assinatura **igual**; `markStatementUnpaid(id: string, lancamentoId: string | null)` (K1, o único desvio).
- `montarPagamentoFatura` continua o único lugar que monta o lançamento; `liquidado_em` = data do pagamento.
- Nenhum `Date.now()` / `new Date()` sem argumento no código novo.
- `timestamptz` lido com `dateInSaoPaulo(new Date(x))`, nunca `.slice(0, 10)`.
- Fixture sintética sempre: nenhum nome, valor ou saldo real; nada de chave, token, `.env` ou `service_role` no diff.
- Commits: título pt-BR sem acento (`feat(redesign): 03-F <passo> — ...`), corpo com o que mudou de natureza, mutações com nomes de testes e o que ficou de fora; termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Antes de cada commit: `npx vitest run` nos diretórios tocados **e** `npm run test:run` (suíte inteira) verdes, `npx tsc --noEmit` limpo, `git diff` revisado.
- Cada tarefa substancial passa pelo `ai-router-br:route` (pacote ≤ 5 arquivos); migration, prova no banco e mutações ficam no principal; patch de worker é não confiável (`tsc` antes de aplicar); árvore suja → subagente Sonnet; nada de revisor nem de mexer na árvore durante um dispatch. O `summary_line` do roteador vai literal para a entrega.

## Review Focus

1. **Corrida que a leitura da action não vê** — a fatura está aberta na leitura e a RPC recusa com `FATURA_JA_PAGA`: a tela tem de dizer "Esta fatura já está paga." e nenhuma escrita direta pode ter acontecido (Task 2, teste "corrida").
2. **Resposta perdida depois do commit** — erro de rede/timeout da RPC: a mensagem não pode afirmar que não pagou (D-F5), e clicar de novo é seguro (Task 2, teste "erro desconhecido").
3. **`pago_em` perto da meia-noite** — `2026-03-10T01:30:00Z` é 09/03 em Brasília; o diálogo tem de mostrar 09/03 (Task 3, teste da previsão).
4. **Pagamento editado em Lançamentos** — virou despesa, `pendente`, ganhou destino ou grupo: o diálogo não pode oferecer o botão, e a RPC recusa (Task 1 varredura + Task 3 puro + Task 4 texto).
5. **Conta do pagamento excluída** — o lançamento ficou com `account_id` nulo: o texto não pode prometer "volta ao saldo" (Task 4, teste de `textoDoDesfazer`).

---

## Mapa de arquivos

| Arquivo | Task | Papel |
| --- | --- | --- |
| `supabase/migrations/20261021120000_pagamento_fatura_atomico.sql` | 1 | as duas RPCs (SQL do spec §5.1) |
| `src/lib/finance/m-f-pagamento-fatura.test.ts` | 1 | varredura do arquivo + espelho das colunas |
| `src/types/supabase.ts` | 1 | regenerado (só as duas funções) |
| `src/lib/finance/statement-payment.ts` (+ `.test.ts`) | 2 | `pagoEmTimestamp`, `argumentosDoPagamento`, `mensagemDoErroDoPagamento` |
| `src/test/supabase-em-memoria.ts` | 2 | opção `rpc` |
| `src/lib/actions/statements.ts` | 2, 3, 5 | as actions |
| `src/lib/actions/statements.test.ts` | 2, 3, 5 | testes das actions (novo) |
| `src/lib/finance/quem-escreve-transactions.test.ts` | 2 | 4 → 1, seção de funções SQL |
| `src/lib/finance/desfazer-pagamento.ts` (+ `.test.ts`) | 3, 4 | puros do desfazer |
| `src/app/(app)/faturas/desfazer-pagamento-dialog.tsx` | 4 | o diálogo (novo) |
| `src/app/(app)/faturas/statements-client.tsx` | 3, 4, 5 | botão e diálogo de pagar |
| `src/lib/finance/faturas-tela.test.ts` | 4, 5 | varredura de fonte da tela (novo) |
| `src/lib/finance/caixa.ts` | 5 | `MSG_DATA_PAGAMENTO_FATURA_FUTURA` |

---

### Task 1: M-F — a migration (principal, não roteada)

**Files:**
- Create: `supabase/migrations/20261021120000_pagamento_fatura_atomico.sql`
- Test: `src/lib/finance/m-f-pagamento-fatura.test.ts`
- Modify (depois do "aplique"): `src/types/supabase.ts`

**Interfaces:**
- Produces: `rpc("pagar_fatura", { p_statement_id: string; p_pago_em: string; p_lancamento: Json }) → uuid`; `rpc("desfazer_pagamento_fatura", { p_statement_id: string; p_lancamento_id: string | null }) → void`. Códigos de erro (em `error.message`): `FATURA_SEM_SESSAO`, `FATURA_PAGAMENTO_INVALIDO`, `FATURA_JA_PAGA`, `FATURA_NAO_ENCONTRADA`, `FATURA_NAO_PAGA`, `PAGAMENTO_MUDOU`, `PAGAMENTO_EDITADO`.

- [ ] **Step 1: Escrever o teste** no padrão de `m2-liquidado-em.test.ts` (achado por conteúdo, `semComentarios`, minúsculas, espaços colapsados). Arquivos: `DA_PAGAR` = os que contêm `create or replace function public.pagar_fatura(`; `DA_DESFAZER` idem. Cada asserção do spec §5.1 "Teste do arquivo" vira um `it`:
  - `DA_PAGAR` e `DA_DESFAZER` com tamanho 1 (e o mesmo arquivo);
  - cada corpo (fatiado entre `create or replace function public.<nome>(` e o `$$;` seguinte) contém `security invoker` e `set search_path = ''`; o arquivo não contém `security definer`;
  - em `pagar_fatura`: índice de `where id = p_statement_id and pago_em is null` < índice de `if not found then` < índice de `raise exception 'fatura_ja_paga'` < índice de `insert into public.transactions`;
  - o insert sai de `jsonb_populate_record(null::public.transactions, p_lancamento)`, o primeiro item do `select` é `v_user`, e `v_user uuid := auth.uid()` existe; `p_lancamento ->> 'user_id'` não aparece;
  - **espelho:** extrair a lista entre `insert into public.transactions (` e `)`, tirar `user_id`, e comparar como conjunto ordenado com `Object.keys(montarPagamentoFatura({ contaId: "c", total: 1, cartaoNome: "X", competencia: "2031-01-01", dataPagamento: "2031-01-10" })).sort()` — tem de conter `liquidado_em`;
  - nenhum `exception when` no arquivo;
  - em `desfazer_pagamento_fatura`: `for update` aparece **duas** vezes; `raise exception 'fatura_nao_paga'`, `is distinct from p_lancamento_id` + `raise exception 'pagamento_mudou'`, e as quatro condições (`v_forma.type <> 'transferencia'`, `v_forma.status <> 'pago'`, `v_forma.transfer_account_id is not null`, `v_forma.transfer_group_id is not null`) + `raise exception 'pagamento_editado'` vêm todas **antes** de `update public.card_statements` e de `delete from public.transactions`;
  - para as duas assinaturas, `revoke all on function public.pagar_fatura(uuid, timestamptz, jsonb) from public;`, `... from anon;`, `grant execute ... to authenticated;` (e o equivalente de `desfazer_pagamento_fatura(uuid, uuid)`);
  - sem `create table`, `alter table`, `create policy`, `create index`, `truncate`; e, **com os corpos `$$…$$` removidos**, nenhum `insert into`/`update `/`delete from` (nenhum backfill).
- [ ] **Step 2:** `npx vitest run src/lib/finance/m-f-pagamento-fatura.test.ts` → FAIL (nenhum arquivo).
- [ ] **Step 3:** Escrever a migration com o SQL do spec §5.1, mais o cabeçalho e os dois `comment on function` (o de `pagar_fatura` declara o RR-F-4: o lançamento vem do chamador, sem privilégio novo, porque a RLS é a mesma).
- [ ] **Step 4:** O mesmo comando → PASS. Suíte inteira verde.
- [ ] **Step 5:** `saas-shield-br:migration-validator` sobre o arquivo. Bloqueante → corrigir e repetir antes de seguir.
- [ ] **Step 6: PARAR.** Mostrar o SQL e o veredito do validador e pedir o "aplique" literal. Nada abaixo acontece sem ele.
- [ ] **Step 7:** `apply_migration` (nome `pagamento_fatura_atomico`). `declined` → parar e perguntar.
- [ ] **Step 8: Conferir no banco pelo objeto** (`execute_sql`, só leitura): `select proname, prosecdef, proconfig from pg_proc where proname in ('pagar_fatura','desfazer_pagamento_fatura')` → 2 linhas, `prosecdef = false`, `proconfig = {search_path=""}`; `has_function_privilege('anon', ..., 'execute') = false` e `('authenticated', ...) = true` para as duas.
- [ ] **Step 9:** `generate_typescript_types`; aplicar ao `src/types/supabase.ts` **só** as duas entradas de `Functions` (ler o diff; deixar fora o que não é da M-F). `npx tsc --noEmit` limpo.
- [ ] **Step 10: Commit** `feat(redesign): 03-F M-F — pagar e desfazer o pagamento de fatura viram uma transacao cada` (migration, teste, tipos), citando o "aplique" do dono no corpo.

### Task 2: A1 — a action de pagar passa pela RPC

**Files:**
- Modify: `src/lib/finance/statement-payment.ts`, `src/lib/finance/statement-payment.test.ts`
- Modify: `src/test/supabase-em-memoria.ts`
- Modify: `src/lib/actions/statements.ts` (`markStatementPaid`; apagar o `pagoEmTimestamp` local)
- Create: `src/lib/actions/statements.test.ts`
- Modify: `src/lib/finance/quem-escreve-transactions.test.ts`

**Interfaces:**
- Consumes: Task 1 (`pagar_fatura`, códigos).
- Produces:
  - `pagoEmTimestamp(data: string): string` → `` `${data}T12:00:00Z` ``.
  - `argumentosDoPagamento(p: { statementId: string; dataPagamento: string; lancamento: PagamentoFaturaPayload }): { p_statement_id: string; p_pago_em: string; p_lancamento: PagamentoFaturaPayload }`.
  - `mensagemDoErroDoPagamento(error: { message?: string } | null): string` — `FATURA_JA_PAGA` → "Esta fatura já está paga."; `FATURA_NAO_ENCONTRADA` → "Fatura não encontrada."; `FATURA_SEM_SESSAO` → "Sessão expirada. Faça login novamente."; `FATURA_PAGAMENTO_INVALIDO` → "Não foi possível registrar o pagamento."; qualquer outro → "Não foi possível confirmar o pagamento. Recarregue a página para ver se ele foi registrado." Casa por igualdade do `message` (o PostgREST devolve o texto do `raise`), sem `includes`.
  - Harness: `criarSupabaseEmMemoria(tabelas, { rpc?: (nome: string, args: Record<string, unknown>) => { data: unknown; error: ErroSimulado | null } })`; `client.rpc(nome, args)` devolve o resultado e registra `Operacao` com `tipo: "rpc"`, `tabela: nome`, `valores: args`, `filtros: []`. Sem a opção → `{ data: null, error: { code: "SEM_RPC", message: "rpc não configurada no teste" } }`, também registrada. `Operacao.tipo` passa a `"insert" | "update" | "delete" | "rpc"`; `escritas()` continua devolvendo todas.

- [ ] **Step 1: Testes puros** em `statement-payment.test.ts`: `pagoEmTimestamp("2031-01-10") === "2031-01-10T12:00:00Z"` e `dateInSaoPaulo(new Date(pagoEmTimestamp("2031-01-10"))) === "2031-01-10"`; `argumentosDoPagamento` devolve o payload por identidade (`toBe`) em `p_lancamento`; `mensagemDoErroDoPagamento` para os quatro códigos, para `{ message: "fetch failed" }` e para `null`.
- [ ] **Step 2: Teste do harness** (no mesmo `statements.test.ts` ou num `supabase-em-memoria.test.ts` se já existir): `rpc` sem opção devolve erro e registra a operação.
- [ ] **Step 3: Testes da action** em `src/lib/actions/statements.test.ts` (molde de `receivables.test.ts`: `vi.mock("@/lib/supabase/server")`, `vi.mock("next/cache")`, `await import`). Fixture: `card_statements_with_total` com uma fatura aberta (`pago_em: null`, `total_atual: 100`, `competencia: "2031-01-01"`, `card_id`), `accounts` com a conta, `credit_cards` com `nome: "Cartão Sintético"`. Os testes:
  - "manda à RPC exatamente o lançamento de montarPagamentoFatura": a única operação é `rpc pagar_fatura` com `p_lancamento` `toEqual` `montarPagamentoFatura({...})` (incluindo `liquidado_em: "2031-01-10"`) e `p_pago_em: "2031-01-10T12:00:00Z"`;
  - "não escreve direto em tabela nenhuma": `fake.escritas().filter(o => o.tipo !== "rpc")` vazio;
  - "fatura já paga na leitura não chama a RPC": `pago_em` preenchido → erro "Esta fatura já está paga.", `escritas()` vazio;
  - "corrida: a RPC recusa FATURA_JA_PAGA": `rpc` devolve `{ message: "FATURA_JA_PAGA" }` → `{ ok: false, error: "Esta fatura já está paga." }`, só a operação `rpc`;
  - "erro desconhecido não afirma que não pagou": mensagem de D-F5.
- [ ] **Step 4:** Rodar → FAIL. Implementar: puros em `statement-payment.ts`; `rpc` no harness; em `markStatementPaid`, trocar o insert + update + compensação (linhas 89-109) por `const { error } = await ctx.supabase.rpc("pagar_fatura", argumentosDoPagamento({...})); if (error) return dbError(mensagemDoErroDoPagamento(error));`. O resto da função fica como está. Atualizar o comentário do topo da função (a garantia é a RPC).
- [ ] **Step 5: Inventário.** `lib/actions/statements.ts`: `quantidade: 1`, motivo "moveTransactionToStatement: reatribui statement_id, não toca status — pagar e desfazer escrevem pela RPC (M-F)". Acrescentar um `describe` "escritas por função SQL": varre `supabase/migrations/*.sql` (sem comentários), recorta cada corpo de `create or replace function` até `$$;`, conta `insert into public.transactions` / `update public.transactions` / `delete from public.transactions`, e compara com `ESCRITAS_SQL = { "20261021120000_pagamento_fatura_atomico.sql": { quantidade: 2, motivo: "pagar_fatura insere o pagamento (nasce pago com liquidado_em); desfazer_pagamento_fatura o apaga" } }`. Inclui o `it` "a varredura alcança ao menos um arquivo" (não afirma `[] === []`) e "nenhuma entrada fantasma". ⚠️ Antes de fixar a tabela, rodar a varredura e conferir se alguma migration **antiga** tem função que escreve em `transactions`; se tiver, declarar com motivo (não é desvio, é inventário).
- [ ] **Step 6:** `npx vitest run src/lib/finance/ src/lib/actions/ src/test/` → PASS; suíte inteira; `tsc`; lint.
- [ ] **Step 7: Commit** `feat(redesign): 03-F A1 — pagar fatura passa pela RPC atomica`.

### Task 3: A2 — a previsão e o desfazer preso ao lançamento lido

**Files:**
- Create: `src/lib/finance/desfazer-pagamento.ts`, `src/lib/finance/desfazer-pagamento.test.ts`
- Modify: `src/lib/actions/statements.ts` (`preverDesfazerPagamento`, `markStatementUnpaid`)
- Modify: `src/lib/actions/statements.test.ts`
- Modify: `src/app/(app)/faturas/statements-client.tsx` (só `handleUnpay`, transitório — ver Step 5)

**Interfaces:**
- Consumes: Task 1 (`desfazer_pagamento_fatura`, códigos), Task 2 (harness `rpc`).
- Produces (em `desfazer-pagamento.ts`, puro, sem `server-only` — a tela o lê):
  - `type LancamentoDoPagamento = { id: string; type: string; status: string; amount: number; description: string; transfer_account_id: string | null; transfer_group_id: string | null; conta: string | null }`
  - `type PrevisaoDoDesfazer` exatamente como no spec §5.3.
  - `temFormaDePagamentoDeFatura(l: Pick<LancamentoDoPagamento, "type" | "status" | "transfer_account_id" | "transfer_group_id">): boolean`
  - `previsaoDoDesfazer(p: { fatura: { pago_em: string | null; pago_transacao_id: string | null }; lancamento: LancamentoDoPagamento | null }): PrevisaoDoDesfazer`
  - `mensagemDoErroDoDesfazer(error: { message?: string } | null): string` — mensagens do spec §5.3, mais `FATURA_NAO_ENCONTRADA` → "Fatura não encontrada." e `FATURA_SEM_SESSAO` → a de sessão.
  - Actions: `preverDesfazerPagamento(id: string): Promise<ActionResult<PrevisaoDoDesfazer>>`; `markStatementUnpaid(id: string, lancamentoId: string | null): Promise<ActionResult>`.

- [ ] **Step 1: Testes puros** (`desfazer-pagamento.test.ts`, fixture sintética):
  - `temFormaDePagamentoDeFatura`: `true` para a forma de `montarPagamentoFatura`; `false` para cada uma das quatro edições (`type: "despesa"`, `status: "pendente"`, `transfer_account_id: "x"`, `transfer_group_id: "g"`);
  - `previsaoDoDesfazer`: `pago_em: null` → `nao-paga`; ponteiro nulo → `sem-lancamento` com a data; ponteiro e lançamento `null` → `sem-lancamento`; lançamento editado → `pagamento-editado`; forma certa → `com-lancamento` com `lancamentoId`, `descricao`, `conta`, `valor`; conta `null` preservada; **`pago_em: "2026-03-10T01:30:00Z"` → `dataPagamento: "2026-03-09"`**;
  - `mensagemDoErroDoDesfazer` para cada código e para o desconhecido.
- [ ] **Step 2: Testes das actions** em `statements.test.ts`: `preverDesfazerPagamento` lê `card_statements` e `transactions` e devolve a previsão (sem nenhuma escrita); `markStatementUnpaid(ID, "tx-1")` faz **uma** operação, `rpc desfazer_pagamento_fatura` com `{ p_statement_id: ID, p_lancamento_id: "tx-1" }`, e nenhuma escrita direta em `card_statements` nem em `transactions`; cada código de erro devolvido pela RPC vira a mensagem dele.
- [ ] **Step 3:** Rodar → FAIL. Implementar os puros e as duas actions. A leitura do lançamento em `preverDesfazerPagamento` usa `.maybeSingle()` com `account:accounts!transactions_account_id_fkey(name)` e achata para `conta` antes de chamar o puro (o harness devolve a linha inteira; a fixture traz `account: { name }`).
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5: Manter o `tsc` verde neste commit.** A assinatura nova quebra `handleUnpay` (`statements-client.tsx:368`). Transitório até a Task 4: `handleUnpay` chama `preverDesfazerPagamento(id)`; só com `estado` `com-lancamento`/`sem-lancamento` chama `markStatementUnpaid(id, lancamentoId ?? null)`; nos outros estados, `toast.error` com o texto. Declarar no corpo do commit que o clique único continua até a A3.
- [ ] **Step 6:** Diretórios tocados + suíte inteira + `tsc` + lint.
- [ ] **Step 7: Commit** `feat(redesign): 03-F A2 — desfazer pela RPC, preso ao lancamento lido`.

### Task 4: A3 — o diálogo de confirmação

**Files:**
- Modify: `src/lib/finance/desfazer-pagamento.ts`, `src/lib/finance/desfazer-pagamento.test.ts` (`textoDoDesfazer`)
- Create: `src/app/(app)/faturas/desfazer-pagamento-dialog.tsx`
- Modify: `src/app/(app)/faturas/statements-client.tsx`
- Create: `src/lib/finance/faturas-tela.test.ts`

**Interfaces:**
- Consumes: Task 3 (`PrevisaoDoDesfazer`, `preverDesfazerPagamento`, `markStatementUnpaid`, `mensagemDoErroDoDesfazer`).
- Produces:
  - `textoDoDesfazer(p: PrevisaoDoDesfazer): { texto: string; podeConfirmar: boolean; linkLancamentos: boolean }` — textos do spec §5.4, valor por `formatCurrency`, data por `formatDate` (data pura, reordenada como texto). `podeConfirmar` só em `com-lancamento` e `sem-lancamento`; `linkLancamentos` só em `pagamento-editado`.
  - `DesfazerPagamentoDialog({ statementId: string | null; onOpenChange: (aberto: boolean) => void })` — `default export` para o `next/dynamic`.

- [ ] **Step 1: Testes de `textoDoDesfazer`**: `com-lancamento` contém a descrição, `formatCurrency(valor)`, o nome da conta e `"09/03/2026"` (Y10, três asserções separadas); conta `null` → contém "conta que foi excluída" e **não** contém "volta ao saldo"; `sem-lancamento` → "nenhum saldo muda", `podeConfirmar: true`; `pagamento-editado` → `podeConfirmar: false`, `linkLancamentos: true`; `nao-paga` → `podeConfirmar: false`.
- [ ] **Step 2: Varredura de fonte** (`faturas-tela.test.ts`, lê os `.tsx` sem comentários): `statements-client.tsx` não contém `markStatementUnpaid` (Y9); importa o diálogo por `dynamic(() => import("./desfazer-pagamento-dialog")` com objeto literal; `desfazer-pagamento-dialog.tsx` chama `markStatementUnpaid(` exatamente uma vez, e chama `preverDesfazerPagamento(`.
- [ ] **Step 3:** Rodar → FAIL. Implementar:
  - Diálogo `"use client"`: ao abrir com `statementId`, chama `preverDesfazerPagamento` (estado `lendo` → "Lendo o pagamento…", confirmar desabilitado; erro de leitura → mensagem, sem confirmar). Mostra `textoDoDesfazer`; link para `/financeiro/lancamentos` quando `linkLancamentos`. Botões "Cancelar" e "Desfazer pagamento" (`variant="destructive"`, "Desfazendo…" durante o envio), confirmando com o `lancamentoId` **da previsão lida** (ou `null` em `sem-lancamento`). Sucesso → toast "Pagamento desfeito.", fecha, `router.refresh()`; erro → toast com `res.error` e `router.refresh()`. `DialogContent` com `sm:max-w-md`; textos com `min-w-0`/quebra.
  - Client: remove `handleUnpay` e o import de `markStatementUnpaid`/`preverDesfazerPagamento`; estado `desfazendo: string | null`; o botão "Desfazer" (`:532-539`) faz `setDesfazendo(s.id)`; `const desfazerMontado = useLazyDialog(desfazendo !== null)`; `{desfazerMontado && <DesfazerPagamentoDialog statementId={desfazendo} onOpenChange={(a) => !a && setDesfazendo(null)} />}`.
- [ ] **Step 4:** Rodar → PASS; suíte inteira; `tsc`; lint.
- [ ] **Step 5: Bundle:** `npm run build && npm run perf:bundle` e a cópia do scratchpad (`bundle-rotas.mjs`) para `/faturas`, `/cartoes`, `/financeiro/lancamentos`, `/dashboard/financeiro`; anotar antes × depois.
- [ ] **Step 6: Commit** `feat(redesign): 03-F A3 — desfazer pagamento so com confirmacao lida`.

### Task 5: B2 — data de pagamento futura

**Files:**
- Modify: `src/lib/finance/caixa.ts`, `src/lib/actions/statements.ts`, `src/lib/actions/statements.test.ts`, `src/app/(app)/faturas/statements-client.tsx` (`PayStatementDialog`), `src/lib/finance/faturas-tela.test.ts`

**Interfaces:**
- Produces: `MSG_DATA_PAGAMENTO_FATURA_FUTURA = "A data do pagamento não pode ser futura. Pague a fatura quando o valor sair da conta."` em `caixa.ts`, ao lado da P8.

- [ ] **Step 1: Testes:** `markStatementPaid(ID, CONTA, <amanhã>)` → `{ ok: false, fieldErrors: { dataPagamento: [MSG_DATA_PAGAMENTO_FATURA_FUTURA] } }` e `fake.operacoes` sem nenhuma `rpc` nem escrita (Y13); hoje e uma data passada chegam à RPC. "Hoje" vem de `vi.mock` de `hojeISO` (ou de `vi.setSystemTime` com instante absoluto em `Z`), nunca do relógio da máquina. Varredura: `PayStatementDialog` contém `max={today}` e lê `fieldErrors` (Y17).
- [ ] **Step 2:** Rodar → FAIL. Implementar: na action, logo depois do `safeParse`, `if (dataDePagamentoFutura(parsed.data.dataPagamento, hojeISO())) return invalid({ dataPagamento: [MSG_DATA_PAGAMENTO_FATURA_FUTURA] });`. No diálogo: `max={today}` no `#fatura-data-pagamento`; estado `erroData: string | null`; em erro, `const msg = res.fieldErrors?.dataPagamento?.[0]`; com `msg`, mostra sob o campo (`aria-invalid`, `aria-describedby`) e no toast; sem `msg`, `toast.error(res.error)`. Limpa o erro ao mudar a data.
- [ ] **Step 3:** Rodar → PASS; suíte inteira; `tsc`; lint.
- [ ] **Step 4: Commit** `feat(redesign): 03-F B2 — data de pagamento futura recusada com mensagem no campo`.

### Task 6: A prova no banco com dado sintético (principal)

- [ ] **Step 1:** Escrever o roteiro SQL do spec §10 (marcar, concorrência, desfazer duas vezes, remoção), com as consultas de contagem e de hash do saldo (`md5` sobre `account_balance` de cada conta), e **mostrar ao dono antes de rodar**. Conferir o horário: terminar e limpar antes das 21h BRT.
- [ ] **Step 2:** Rodar pelo MCP. Registrar só contagens, códigos de erro, `clock_timestamp()` das duas chamadas e "hash igual / diferente". Sobreposição não demonstrada → `dblink` se existir; senão declarar a prova como sequencial.
- [ ] **Step 3:** Remoção pelo marcador; contagem antes e depois; hash igual. `declined` → parar e pedir que o dono rode no SQL Editor.
- [ ] **Step 4:** Repetir a contagem da §2.1 (iguais, inclusive 0 candidatos a órfão).

### Task 7: Mutações, verificação final e revisão (principal)

- [ ] **Step 1: Mutações Y1–Y17** do spec §7, uma por vez: aplicar, `npx tsc --noEmit` (tem de compilar), rodar o arquivo de teste esperado, registrar o **nome** de cada teste que cai, restaurar e conferir com `git diff --quiet`. Mutação verde é medida antes de ser chamada de fraqueza.
- [ ] **Step 2: Os cinco comandos** com números: `npm run test:run`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run perf:bundle` (mediana e as quatro rotas, antes × depois).
- [ ] **Step 3:** `TZ=UTC npx vitest run src/lib/finance/ src/lib/actions/ src/lib/notifications/` verde.
- [ ] **Step 4:** `git diff 85d9ad1 --stat` sem `STATUS.md`, `CLAUDE.md`, `AGENTS.md`, `dashboard*.test.ts`; em `supabase/`, só a migration; nada sensível.
- [ ] **Step 5: Conferência visual** do diálogo (claro, escuro, 390 px) pela extensão do Chrome; se não conectar, dizer e pedir ao dono, com o que olhar. Não digitar senha.
- [ ] **Step 6: Revisão final da branch** num subagente no modelo mais capaz; achados confirmados viram commit de correção (`fix(redesign): 03-F revisao — ...`).
- [ ] **Step 7:** Acrescentar ao spec a seção "Resultado da execução" (números, mutações com nomes de testes, prova, desvios, risco residual com destino) e commitar `docs(redesign): 03-F resultado da execucao`. Parar: sem push, sem merge.
