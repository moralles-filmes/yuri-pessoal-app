# 04-C · Reembolso de terceiros ligado ao recebível — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** uma receita marcada como de uma pessoa move o saldo da conta, fica fora da renda do dono e abate sozinha o que a pessoa deve em Terceiros — sem escolher linha, com pagamento parcial, parcelas futuras incluídas e a sobra decidida pelo dono.

**Architecture:** a RECEITA é o pagamento: `transactions.reembolso_pessoa_id` é o único fato novo. Uma função SQL `realocar_reembolsos_da_pessoa` mantém as alocações automáticas em `receivable_receipts` (com `transaction_id`), disparada por triggers de **instrução** em `transactions` e `receivables` — atômica por construção e sem depender de cada chamador lembrar de chamá-la. A mesma regra existe em TS puro (`reembolso.ts`) para a prévia, provada igual à do banco pelos mesmos casos dourados.

**Tech Stack:** Next.js 16, Supabase (Postgres, plpgsql, RLS), TypeScript, Zod, Vitest, react-hook-form, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-10-25-reembolso-de-terceiros-design.md` (leia inteiro antes da Tarefa 1).

### Desvio declarado do desenho (decisão do plano)

O §5.1 do desenho sugeria uma tabela `person_payments` e o §5.3 uma lista de chamadores do RPC. O plano troca as duas coisas:
- **sem tabela de pagamentos:** o pagamento É a receita (`reembolso_pessoa_id` + `status = 'recebido'`), e a parte da pessoa é `amount − coalesce(valor_pessoal, 0)`. "Um reembolso é um fato só" (§3) fica literal, e o backup não ganha tabela;
- **triggers em vez de chamadores:** criar, editar, apagar ou mudar o status de uma receita, `reapplySplit`, `cancelInstallmentFuture`, importar, desfazer importação, o desfazer da IA, marcar/desmarcar `ignorado` — **todos** passam por `INSERT/UPDATE/DELETE` em `transactions` ou `receivables`, e o trigger realoca. Isso fecha o anti-objetivo "apagar a receita deixar a dívida abatida" sem uma lista que alguém esquece de atualizar, e faz a gravação ser atômica sem esperar o desenho da 03-G2.

Todo o resto do desenho vale como está.

## Global Constraints

- Português (pt-BR) em toda mensagem, rótulo e comentário; BRL via `formatCurrency` (recebe **reais**).
- `transactions.amount`, `valor_pessoal`, `receivables.valor`, `receivable_receipts.valor` são `numeric(14,2)` **em reais**; centavos inteiros só por dentro das funções puras (`reaisParaCentavos`/`centavosParaReais`).
- Lógica pura sem `Date.now()`, sem I/O, sem `zod`, sem `server-only` (a tela importa).
- `classificacao`/`valor_pessoal` da receita saem **só** de `decidirResponsabilidadeDaReceita` + `colunasDaReceita`.
- `parcial` nunca é gravado; **nenhum código novo grava `receivables.status`** (o estado `pago` de uma linha coberta é derivado da soma).
- Toda tabela/coluna que aponta para outra do mesmo dono usa **FK composta `(x_id, user_id)`**.
- Função SQL: `security invoker`, `set search_path = ''`, nomes qualificados `public.`.
- Leitura que falha não vira zero (03-G): `ErroDeLeitura` / `listaCompleta` / `exigirCompleta`.
- Campo de texto nunca controlado pela URL; schema de formulário aceita a própria saída (`round-trip.test.ts`).
- Responsivo + dark/light; `min-w-0` em texto de flex com irmão `shrink-0`.
- Data pura `'yyyy-MM-dd'` como texto; instante lido com `dateInSaoPaulo`.
- Arquivos em **LF** (o ambiente grava CRLF): `sed -i 's/\r$//'` nos alterados antes de cada commit.

## Review Focus

1. **Contagem em dobro na base caixa:** reembolso vinculado de R$ 500 tem de somar R$ 500 nas entradas, nunca R$ 1.000 (as alocações automáticas não podem entrar de novo em "Reembolsos recebidos"). Teste na Tarefa 5.
2. **Trigger durante cascade:** apagar a receita (ou a compra) dispara o cascade em `receivable_receipts` e o trigger; o resultado final não pode depender da ordem. A função apara sozinha alocação cujo pagamento sumiu ou deixou de valer. Prova no script SQL da Tarefa 3 (casos 6 e 8).
3. **Editar a receita sem trocar a pessoa nem o valor** (só a descrição) não pode mudar nada nas alocações — idempotência (caso 17), Tarefa 3.
4. **Classificação trocada para `pessoal` numa receita vinculada:** o vínculo tem de cair junto, senão o CHECK recusa e o formulário fica sem saída. Teste na Tarefa 6.
5. **Pessoa sem dívida e "receita minha":** a sobra é o valor inteiro, então a receita vira `pessoal` **sem** vínculo, e a prévia diz isso antes de salvar. Teste na Tarefa 2.

---

## Tarefa 0: Portão e ambiente

- [ ] **Passo 1:** conferir que a REDESIGN-03 fechou: `docs/redesign/STATUS.md` traz a **03-G2 ✅**, e `git merge-base --is-ancestor <ponta da 03-G2> feat/redesign-00-auditoria` sai 0. **Se não, PARE** e avise o dono: este plano roda depois da 03-G2 (decisão dele).
- [ ] **Passo 2:** worktree em caminho curto, sem CRLF: `git -c core.autocrlf=false worktree add -b feat/redesign-04c-reembolso-impl C:/tmp/04c-impl feat/redesign-00-auditoria`; `git cherry-pick` dos commits do desenho e deste plano (branch `feat/redesign-04c-reembolso`); `npm ci`.
- [ ] **Passo 3:** ler, nesta ordem: `CLAUDE.md`, `AGENTS.md`, o desenho, este plano, `docs/superpowers/specs/2026-10-11-03d-recebiveis-design.md` (K0, K1, K2, D3, D6, D11). Depois, reler onde a 03-G2 deixou `criarTransacao`, `updateTransaction`, `deleteTransaction` e `commitImport` — **as Tarefas 6 e 7 se encaixam no formato que a 03-G2 deixou**, não no de 2026-10-25.
- [ ] **Passo 4:** linha de base verde: `npm run test:run`, `npm run lint`, `npx tsc --noEmit`. Anote a contagem de testes.

## Tarefa 1: A regra pura da distribuição

**Files:**
- Create: `src/lib/finance/reembolso.ts`
- Create: `src/lib/finance/reembolso-casos.ts` (casos dourados, sem `vitest`: o script SQL da Tarefa 3 os replica)
- Test: `src/lib/finance/reembolso.test.ts`

**Interfaces — Produces:**
```ts
export type PagamentoDoReembolso = {
  transactionId: string; contaId: string | null;
  parteCentavos: number;      // amount − coalesce(valor_pessoal, 0), só receita 'recebido'
  recebidoEm: string;         // 'yyyy-MM-dd' = coalesce(liquidado_em, competence_date)
  criadoEm: string;           // ISO, desempate
};
export type DividaDaPessoa = {
  receivableId: string; valorCentavos: number;
  status: string;             // coluna crua
  recebidoManualCentavos: number;  // Σ recebimentos com transaction_id nulo (K0 incluído: legado pago = valor)
  dataDaDivida: string;       // coalesce(fatura.data_vencimento, lançamento.competence_date, data_prevista, created_at::date)
  criadoEm: string;
};
export type AlocacaoAutomatica = {
  id: string; receivableId: string; transactionId: string;
  valorCentavos: number; recebidoEm: string; criadoEm: string;
};
export type NovaAlocacao = Omit<AlocacaoAutomatica, "id" | "criadoEm"> & { contaId: string | null };
export type Realocacao = {
  remover: string[];                                   // ids
  reduzir: { id: string; valorCentavos: number }[];    // novo valor
  inserir: NovaAlocacao[];
};
export type EstadoDoReembolso = {
  pagamentos: readonly PagamentoDoReembolso[];
  dividas: readonly DividaDaPessoa[];
  alocacoes: readonly AlocacaoAutomatica[];
};
export function ordenarDividas(d: readonly DividaDaPessoa[]): DividaDaPessoa[];
export function realocar(e: EstadoDoReembolso): Realocacao;
export function aplicarRealocacao(e: EstadoDoReembolso, r: Realocacao): AlocacaoAutomatica[]; // para teste e prévia
export function situacaoDaPessoa(e: EstadoDoReembolso): { devidoCentavos: number; saldoAFavorCentavos: number };
export type PreviaDoReembolso = { devidoAntesCentavos: number; devidoDepoisCentavos: number; sobraCentavos: number };
export function previaDoReembolso(a: {
  devidoCentavos: number; saldoAFavorCentavos: number;
  /** na edição: o que ESTA receita já contribui hoje (0 e 0 na criação) */
  parteAtualDestaCentavos: number; alocadoDestaCentavos: number;
  valorCentavos: number;  // a parte da pessoa que o dono está lançando agora = amount inteiro
}): PreviaDoReembolso;
export function previaDoLote(situacao: { devidoCentavos: number; saldoAFavorCentavos: number },
  valoresCentavos: readonly number[]): PreviaDoReembolso[];  // importação: em sequência
```

**A regra (`realocar`), na ordem — o SQL da Tarefa 3 a espelha passo a passo:**
1. Alocação cujo `transactionId` não está em `pagamentos` → `remover`.
2. Para cada pagamento com Σ alocado > `parteCentavos`: aparar das alocações **mais novas** (`criadoEm` desc, `id` desc) — reduzir ou remover — até caber.
3. Dinheiro livre por pagamento = parte − alocado (após 1–2); pagamentos em ordem `recebidoEm`, `criadoEm`, `transactionId`.
4. Dívidas abertas = `status ∈ {pendente, cobrado}` com saldo > 0, saldo = valor − manual − automático (após 1–2); ordem `ordenarDividas`: `dataDaDivida`, `criadoEm`, `receivableId`. `ignorado`, `pago`, `desconhecido` ficam fora (o legado K0 tem `status = 'pago'`).
5. Guloso: cada pagamento livre preenche as dívidas na ordem; cada pedaço vira `NovaAlocacao` com `recebidoEm` **do pagamento**.
6. Alocação existente nunca é movida para "abrir espaço" a dívida mais antiga (só dinheiro livre corre).

`situacaoDaPessoa`: devido = Σ saldos abertos após `aplicarRealocacao`; saldo a favor = Σ dinheiro livre que sobrou. Os dois nunca são > 0 ao mesmo tempo.

`previaDoReembolso`: tira a contribuição desta receita (devido += alocadoDesta; crédito −= parteAtual − alocadoDesta), reequilibra (`devidoReal = max(0, devido − crédito)`), e então `sobra = max(0, valor − devidoReal)`, `devidoDepois = max(0, devidoReal − valor)`.

- [ ] **Passo 1: casos dourados** em `reembolso-casos.ts`: `export const CASOS_DO_REEMBOLSO: { nome: string; estado: EstadoDoReembolso; esperado: { devidoCentavos: number; saldoAFavorCentavos: number; alocadoPorDivida: Record<string, number> } }[]` com os casos 1, 2, 3, 5, 6 (sem o pagamento), 7, 8 (sem a dívida), 9 (manual), 10, 11, 16 e 17 da §6 do desenho. Ex.: caso 1 — dívidas `a,b,c,d` de 50000 com datas `2026-07-10…2026-10-10`, pagamento 50000 → `{ devidoCentavos: 150000, saldoAFavorCentavos: 0, alocadoPorDivida: { a: 50000 } }`; caso 3 — 10 parcelas de 20000, só a 1ª com data ≤ hoje, pagamento 60000 → parcelas 1–3 cobertas, devido 140000.
- [ ] **Passo 2: testes que falham** em `reembolso.test.ts`:
  - `it.each(CASOS_DO_REEMBOLSO)` → `situacaoDaPessoa` e `aplicarRealocacao` batem com `esperado`;
  - `"realocar é idempotente"`: `realocar(estado com o resultado aplicado)` → `{ remover: [], reduzir: [], inserir: [] }` para todo caso;
  - `"ignorado e legado pago nunca recebem"` e `"cobrado recebe"`;
  - `"aparar começa pela alocação mais nova"` (caso 7: 70000 → 40000 desfaz a de `b` primeiro);
  - `"devido e saldo a favor nunca coexistem"` em todos os casos;
  - `previaDoReembolso`: deve 200000, lança 50000 → `{200000, 150000, 0}`; deve 200000, lança 250000 → sobra 50000; edição de uma receita de 70000 totalmente alocada para 40000 → `devidoAntes` conta os 70000 de volta;
  - `previaDoLote(situação devido 100000, [60000, 60000])` → a 2ª tem sobra 20000.
- [ ] **Passo 3:** `npx vitest run src/lib/finance/reembolso.test.ts` → FAIL (módulo não existe).
- [ ] **Passo 4:** implementar as funções acima (centavos inteiros, sem arredondar).
- [ ] **Passo 5:** rodar de novo → PASS. Commit: `feat(04-C): regra pura da distribuicao do reembolso`.

## Tarefa 2: A decisão do reembolso no lançamento (pura)

**Files:**
- Modify: `src/lib/finance/reembolso.ts`
- Modify: `src/lib/validators/split.ts` (schema)
- Test: `src/lib/finance/reembolso.test.ts`, `src/lib/validators/round-trip.test.ts`

**Interfaces — Produces:**
```ts
export const ESCOLHAS_DA_SOBRA = ["receita", "saldo"] as const;
export type EscolhaDaSobra = (typeof ESCOLHAS_DA_SOBRA)[number];
export const MSG_ESCOLHA_A_SOBRA = "Este valor passa do que a pessoa deve. Escolha o que fazer com a sobra.";
export const MSG_DIVIDA_MUDOU = "O que esta pessoa deve mudou enquanto você lançava. Confira a prévia e salve de novo.";
export const MSG_REEMBOLSO_SO_DE_TERCEIRO = "Só uma entrada de terceiro pode abater o que uma pessoa deve.";
export type DecisaoDoReembolso =
  | { ok: true; receita_classificacao: "terceiro" | "compartilhada" | "pessoal";
      minhaParteCentavos: number | null; vincula: boolean }
  | { ok: false; campo: "reembolso_sobra" | "reembolso_pessoa_id"; mensagem: string };
export function decidirReembolso(a: {
  classificacaoPedida: Classificacao; previa: PreviaDoReembolso;
  valorCentavos: number; escolha: EscolhaDaSobra | null;
  devidoVistoCentavos: number | null;  // o que a tela mostrou; null = não conferir (importação)
}): DecisaoDoReembolso;
```
In `validators/split.ts`: `reembolsoSchema = z.object({ reembolso_pessoa_id: optionalUuid, reembolso_sobra: <preprocess ""/null → undefined> z.enum(ESCOLHAS_DA_SOBRA).optional().nullable(), reembolso_devido_visto: <inteiro ≥ 0 opcional, aceita null> })` — `ESCOLHAS_DA_SOBRA` vem de `reembolso.ts` (puro), não o contrário.

Regras de `decidirReembolso`: pessoa com classificação `pessoal` → erro `reembolso_pessoa_id` / `MSG_REEMBOLSO_SO_DE_TERCEIRO`; `devidoVistoCentavos` ≠ `previa.devidoAntesCentavos` → erro `reembolso_sobra` / `MSG_DIVIDA_MUDOU`; sobra 0 → `terceiro`, vincula; sobra > 0 sem escolha → erro `MSG_ESCOLHA_A_SOBRA`; `saldo` → `terceiro`, vincula; `receita` com sobra < valor → `compartilhada`, `minhaParteCentavos = sobra`, vincula; `receita` com sobra = valor → `pessoal`, `minhaParteCentavos: null`, **não** vincula.

- [ ] **Passo 1: testes que falham**, um por regra acima, mais `"compartilhada pedida pelo dono com pessoa é tratada pela sobra"` (a classificação final sempre sai da sobra quando há pessoa). No `round-trip.test.ts`, o objeto do schema de lançamento com os três campos passa `parse(parse(x))`.
- [ ] **Passo 2:** FAIL → implementar → PASS. Commit: `feat(04-C): decisao do reembolso e schema`.

## Tarefa 3: O banco — vínculo, realocação e triggers

**Files:**
- Create: `supabase/migrations/<YYYYMMDDHHMMSS>_reembolso_vinculo.sql` (M1) e `<+1min>_reembolso_realocacao.sql` (M2) — timestamps **depois** da última migration da 03-G2
- Create: `scripts/finance/verificar-reembolso.sql`
- Test: `src/lib/finance/m-reembolso.test.ts` (varredura textual, no molde de `src/lib/finance/m-f-pagamento-fatura.test.ts`)
- Modify: `src/types/supabase.ts` (regenerado), `src/types/database.ts`

**M1 (aditiva):**
- `transactions_id_user_uk unique (id, user_id)` e `people_id_user_uk unique (id, user_id)`;
- `transactions.reembolso_pessoa_id uuid` + FK composta `(reembolso_pessoa_id, user_id) → people (id, user_id)` (sem cascade: pessoa com reembolso não é excluída, como hoje com recebível) + CHECK `transactions_reembolso_forma`: `reembolso_pessoa_id is null or (type = 'receita' and classificacao in ('terceiro','compartilhada'))` + índice `(user_id, reembolso_pessoa_id) where reembolso_pessoa_id is not null`;
- `receivable_receipts.transaction_id`: troca a FK simples (`on delete set null`) por FK composta `(transaction_id, user_id) → transactions (id, user_id) on delete cascade`; `conta_id` ganha FK composta `(conta_id, user_id) → accounts (id, user_id) on delete set null (conta_id)`; índice `(transaction_id) where transaction_id is not null`. Confirme antes, no banco, que **nenhuma** linha tem `transaction_id` preenchido (K2 garantia nulo);
- `import_rows`: `receita_classificacao text check (in ('pessoal','terceiro'))`, `reembolso_pessoa_id uuid` + FK composta para `people`, `reembolso_sobra text check (in ('receita','saldo'))`;
- comentário de reversão no topo, como na M-F.

**M2:**
- `public.realocar_reembolsos_da_pessoa(p_user uuid, p_person uuid) returns void`: `pg_advisory_xact_lock(hashtext('reembolso:' || p_user || ':' || p_person))`, depois os passos 1–6 da Tarefa 1 **na mesma ordem e com os mesmos desempates**. `insert` em `receivable_receipts` com `user_id = p_user`, `transaction_id`, `conta_id = account_id` da receita, `recebido_em` do pagamento, `observacoes` nulo. ⛔ Nenhum `update public.receivables`.
- triggers **de instrução** com tabelas de transição (Postgres não aceita transição em trigger de vários eventos — são seis): `reembolso_tx_ins/upd/del` em `transactions` e `reembolso_rec_ins/upd/del` em `receivables`, chamando `public.reembolso_realocar_tx()` / `public.reembolso_realocar_rec()`, que juntam os pares distintos `(user_id, reembolso_pessoa_id)` / `(user_id, person_id)` de `old_table ∪ new_table` (não nulos) e chamam a função acima para cada um. Sem par → `return null` imediato (a importação insere linha a linha).

- [ ] **Passo 1: teste textual que falha** (`m-reembolso.test.ts`): M2 contém `security invoker` e `set search_path = ''` em cada função; **não** contém `update public.receivables`; contém os seis `create trigger`; M1 contém `on delete cascade` na FK de `transaction_id` e o CHECK `transactions_reembolso_forma`.
- [ ] **Passo 2:** escrever M1 e M2 → teste PASS.
- [ ] **Passo 3:** `scripts/finance/verificar-reembolso.sql`: um bloco `begin; … rollback;` que se identifica como o dono (`set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<uid>","role":"authenticated"}', true);`), cria pessoa, recebíveis e receitas de teste e confere, com `raise exception` em divergência, os casos 1, 2, 3, 5, 6, 7, 8, 10, 16 e 17 **com os mesmos números de `reembolso-casos.ts`**.
- [ ] **Passo 4 — ⛔ PEDE O AVAL DO DONO:** aplicar M1 e M2 no projeto `yjvnlbjvippefvzgrxxw` (MCP `apply_migration`). Sem MCP do Supabase nesta sessão: **pare** e entregue ao dono os dois arquivos para aplicar por uma sessão do Claude.
- [ ] **Passo 5 — ⛔ PEDE O AVAL DO DONO:** rodar o script (uma única chamada `execute_sql`, termina em `rollback`). Esperado: nenhum erro. Depois, conferir que nada ficou gravado (contagem de `people` igual à de antes).
- [ ] **Passo 6:** regenerar `src/types/supabase.ts` (MCP `generate_typescript_types`), **ler o diff** e manter só o deste bloco (invariante 94); `RecebimentoDoBanco` em `types/database.ts` ganha `transaction_id: string | null`. Commit: `feat(04-C): vinculo do reembolso e realocacao no banco`.

## Tarefa 4: Leitura e proteção

**Files:**
- Modify: `src/lib/finance/recebimentos-leitura.ts`, `src/lib/finance/recebimentos.ts`, `src/lib/finance/recebimentos-servico.ts`
- Test: `src/lib/finance/recebimentos-leitura.test.ts` (ou o harness que a 03-D usa para a A4), `src/lib/finance/recebimentos.test.ts`, `src/lib/finance/quem-apaga-recebiveis.test.ts`

**Interfaces — Produces:**
- `COLUNAS` de `receivable_receipts` inclui `transaction_id`; `RecebimentoLido` ganha `transaction_id?: string | null`.
- `protecaoDosRecebiveis` passa a marcar `temRecebimento` **só** com recebimento de `transaction_id` nulo (manual).
- `export async function lerEstadoDoReembolso(client: ClienteSupabase, personId: string): Promise<EstadoDoReembolso>` e `export async function lerSituacoesDoReembolso(): Promise<Map<string, { devidoCentavos: number; saldoAFavorCentavos: number }>>` — em `recebimentos-leitura.ts` (a única leitura da tabela, P3); lançam `ErroDeLeitura` em falha.
- Desfazer recebimento (um e em lote, `recebimentos-servico.ts`) só alcança recebimento manual; automático → recusa com `"Este recebimento veio de um lançamento. Edite ou exclua a receita em Lançamentos."`.

- [ ] **Passo 1: testes que falham:** proteção com só recebimento automático → `temRecebimento: false` (caso 8 do desenho); com manual → `true` (caso 9); desfazer o último quando ele é automático → recusa com a mensagem acima; `lerEstadoDoReembolso` monta `DividaDaPessoa.dataDaDivida` com fatura → `data_vencimento`, sem fatura → `competence_date` do lançamento de origem.
- [ ] **Passo 2: inventário de leitores da coluna `status`:** `grep -rn "status" src/lib src/app --include=*.ts --include=*.tsx` restrito a recebível (`receivables`, `ReceivableRow`, `r.status`). Todo ponto que decide "pago/em aberto" pela COLUNA passa a usar `estadoDoRecebivel`. Liste no commit cada ponto convertido.
- [ ] **Passo 3:** implementar → PASS. `quem-apaga-recebiveis.test.ts` continua igual: nenhum delete novo nasce em `src/` (se a 03-G2 moveu algum para SQL, siga o cabeçalho que ela escreveu). Inclua os novos arquivos na allowlist de `quem-le-os-recebimentos.test.ts` só se mencionarem a tabela — o desenho não exige nenhum). Commit: `feat(04-C): leitura do reembolso e protecao so do recebimento manual`.

## Tarefa 5: Os números da base caixa

**Files:**
- Modify: `src/lib/finance/caixa.ts`, `src/lib/finance/recebimentos.ts`, a leitura que monta `TxDeCaixa` (acrescente `reembolso_pessoa_id` ao `select`)
- Test: `src/lib/finance/caixa.test.ts`, `src/components/financeiro/bloco-do-caixa.test.ts`

**Interfaces:** `TxDeCaixa.reembolso_pessoa_id?: string | null`; `reembolsosRecebidosNoPeriodo(itens, periodo, opcoes?: { somenteManuais?: boolean })`.

Regra: receita com `reembolso_pessoa_id` → `amount − meu` vai para **`reembolsosRecebidos`** (não para `outrasEntradasDeTerceiros`); `meu` continua em renda. `reembolsosRecebidos` = recebimentos **manuais** do período + Σ desses. `avisoDeSobreposicao` = recebimentos manuais do período > 0 **e** `outrasEntradasDeTerceiros` > 0.

- [ ] **Passo 1: testes que falham:** reembolso vinculado de 50000 alocado inteiro → `entradasDoCaixa` soma 500,00, `reembolsosRecebidos` 500,00, `outrasEntradasDeTerceiros` 0, aviso `false`; vinculada compartilhada (2.500 com sobra 500 "receita minha") → renda +500, reembolsos +2.000; legado manual + receita de terceiro sem pessoa → aviso `true` como hoje.
- [ ] **Passo 2:** FAIL → implementar → PASS; `caixa-minha-parte.test.ts` continua verde sem alteração. Commit: `feat(04-C): reembolso vinculado conta uma vez no caixa`.

## Tarefa 6: O lançamento — servidor e formulário

**Files:**
- Modify: `src/lib/finance/services.ts` (criar), `src/lib/actions/transactions.ts` (editar) — **no formato que a 03-G2 deixou**
- Modify: `src/app/(app)/financeiro/lancamentos/transaction-form.tsx`, `src/app/(app)/financeiro/lancamentos/page.tsx`
- Test: `src/lib/finance/services.test.ts` / `src/lib/actions/transactions.test.ts` (o harness existente)

**Interfaces — Consumes:** `decidirReembolso`, `previaDoReembolso`, `lerEstadoDoReembolso`, `situacaoDaPessoa`, `reembolsoSchema`.

Servidor (criar e editar, ANTES de qualquer escrita, ao lado de `lerResponsabilidadeDaReceita`): só para `type = 'receita'` com `reembolso_pessoa_id`; lê o estado da pessoa, monta a prévia (na edição, com a contribuição atual desta receita), chama `decidirReembolso`, e então passa a classificação/minha parte decidida para `decidirResponsabilidadeDaReceita` (fonte única das colunas). Grava `reembolso_pessoa_id` só se `vincula`. Receita que deixa de ser receita, vira `pessoal` ou perde a pessoa → grava `reembolso_pessoa_id = null` (Review Focus 4). O trigger faz o resto. Erros voltam como `fieldErrors` dos campos `reembolso_sobra`/`reembolso_pessoa_id`, mapeados por `mapServerFieldErrors`.

Formulário: com tipo receita e classificação "de terceiro", aparece **"De quem?"** (pessoas de `getPeopleForSelect`, opcional). Com pessoa, a prévia mostra `"<Nome> deve R$ X → passa a dever R$ Y"` a partir de `lerSituacoesDoReembolso()` (lida na `page.tsx`); se `sobraCentavos > 0`, mostra `"Passa R$ Z do que <Nome> deve"` e duas opções **sem padrão**: "Receita minha" e "Saldo a favor de <Nome>"; se a pessoa não deve nada e o dono escolhe "Receita minha", o texto diz que a entrada vira receita sua, sem abater nada. O formulário envia `reembolso_devido_visto` = `devidoAntesCentavos` da prévia. A escolha entre "terceiro" e "compartilhada" deixa de ser do dono quando há pessoa: o campo "minha parte" some e a sobra decide.

- [ ] **Passo 1: testes que falham:** criar receita de 50000 com pessoa que deve 200000 → grava `classificacao 'terceiro'`, `valor_pessoal 0`, `reembolso_pessoa_id`; 250000 sem escolha → `fieldErrors.reembolso_sobra = [MSG_ESCOLHA_A_SOBRA]` e nada gravado; `devido_visto` desatualizado → `MSG_DIVIDA_MUDOU`; editar receita vinculada para `pessoal` → grava `reembolso_pessoa_id null`.
- [ ] **Passo 2:** FAIL → implementar servidor → PASS.
- [ ] **Passo 3:** formulário + página; conferir no navegador (`npm run dev`) em 375px e 1280px, claro e escuro. Commit: `feat(04-C): lancar reembolso com pessoa, previa e sobra`.

## Tarefa 7: Importação do extrato

**Files:**
- Modify: `src/lib/actions/imports.ts` (`updateImportRow` ou nova `setImportRowReembolso(rowId: string, input: unknown): Promise<ActionResult>`; `commitImport`), `src/app/(app)/importar/import-review.tsx`, `src/lib/finance/services.ts:58-63` (o comentário que declara receita importada `pessoal`)
- Test: `src/lib/actions/imports.test.ts` (harness existente)

Regras: linha `tipo = 'receita'` ganha na revisão a classificação (pessoal / de terceiro), "De quem?" e a escolha da sobra, com prévia por `previaDoLote` sobre as linhas da mesma pessoa **na ordem do lote**. A recusa de `imports.ts:666-668` continua para a **divisão** (`classificacao` da despesa); a da receita é campo próprio. No `commitImport`, a linha de receita envia `receita_classificacao`, `reembolso_pessoa_id`, `reembolso_sobra` e `reembolso_devido_visto: null` (sem conferir: a importação recalcula linha a linha, e o trigger da linha anterior já atualizou o estado). Sobra > 0 sem escolha → a linha falha com o motivo e as outras seguem. Transferência e linha ignorada nunca têm pessoa.

- [ ] **Passo 1: testes que falham:** duas linhas da mesma pessoa (60000 e 60000, deve 100000) → a revisão mostra sobra 0 e 20000; commit com "saldo" grava as duas vinculadas; sem escolha → 2ª linha `motivo` = `MSG_ESCOLHA_A_SOBRA`, 1ª importada; `undoImportBatch` com linhas vinculadas **não** é bloqueado pela proteção (só recebimento automático).
- [ ] **Passo 2:** FAIL → implementar → PASS; conferir a revisão no navegador. Commit: `feat(04-C): reembolso na importacao do extrato`.

## Tarefa 8: Terceiros por pessoa

**Files:**
- Modify: `src/app/(app)/terceiros/terceiros-client.tsx`, `src/app/(app)/terceiros/page.tsx`, `src/lib/actions/receivables.ts`, `src/lib/finance/recebimentos.ts`
- Delete: `src/app/(app)/terceiros/registrar-recebimento-dialog.tsx`
- Test: `src/app/(app)/terceiros/terceiros-client.test.ts`, `src/lib/finance/recebimentos.test.ts`

**Interfaces — Produces (puras, em `recebimentos.ts`):**
```ts
export function resumoDaPessoa(recs: readonly RecebivelComRecebimentos[], saldoAFavorCentavos: number):
  { devidoCentavos: number; saldoAFavorCentavos: number; emAberto: number; pagos: number };
export function recebidoDaPessoaNoPeriodo(a: { recebimentosManuais: readonly RecebimentoLido[];
  partesDasReceitasVinculadas: readonly { centavos: number; data: string }[]; periodo: { de: string; ate: string } }): number;
```
Tela: por pessoa, **total que deve** (`resumoDaPessoa.devidoCentavos`) e **saldo a favor** quando > 0; abaixo, as linhas em aberto (`secoesDaLista(...).emAberto`) **sem** chip de parcial nem saldo por linha; a aba/filtro **Pagos** com `secoesDaLista(...).historico`; "Não será cobrado" continua. Saem: botão Receber, "marcar recebido" em massa, `registrar-recebimento-dialog.tsx`, `markReceivableReceived` e `registrarRecebimentoAction` (e os testes deles). Desfazer aparece só em linha com recebimento **manual**. "Reembolsos recebidos em <mês>" passa a sair de `recebidoDaPessoaNoPeriodo` (inclui o dinheiro que virou saldo a favor).

- [ ] **Passo 1: testes que falham:** `resumoDaPessoa` do caso 2 → devido 130000, emAberto 3, pagos 1; `recebidoDaPessoaNoPeriodo` com pagamento de 250000 (500 a favor) no mês → 250000; RR-D-21: a soma por pessoa da tela sai de `resumoDaPessoa` (teste de comportamento, não textual).
- [ ] **Passo 2:** FAIL → implementar → PASS.
- [ ] **Passo 3:** navegador em 375px e 1280px, claro e escuro: pessoa com dívida, pessoa com saldo a favor, aba Pagos. Commit: `feat(04-C): terceiros mostram o total da pessoa e os pagos`.

## Tarefa 9: Fechamento

- [ ] **Passo 1:** os cinco: `npm run test:run` (se `boundaries.test.ts` estourar 5 s num checkout frio, confirme com `--testTimeout=30000`), `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run perf:bundle`. Tudo verde; anote as contagens.
- [ ] **Passo 2:** cenário real no app de desenvolvimento contra o banco (com o aval do dono, só se ele pedir): lançar um reembolso de teste, conferir Terceiros, apagar o lançamento, conferir que a dívida voltou.
- [ ] **Passo 3:** docs — `docs/project/CURRENT_STATUS.md` e `docs/handoff/*` (leia antes, edite pontualmente); acrescentar ao `CLAUDE.md` **só** a invariante nova, curta: o reembolso vinculado é a receita, a realocação mora no banco (triggers de instrução), o RPC nunca grava `status`, e só recebimento manual protege. ⛔ **Não edite `docs/redesign/STATUS.md` nem faça merge** — a integração é do dono.
- [ ] **Passo 4:** seção "Resultado da execução" no fim deste plano (o que foi feito, desvios, contagens, riscos residuais). Commit: `docs(04-C): resultado da execucao`.
- [ ] **Passo 5:** revisão de segurança do diff antes de qualquer push (nada de segredo, `.env`, `service_role`). Push, PR e merge **só com o aval explícito do dono**.
