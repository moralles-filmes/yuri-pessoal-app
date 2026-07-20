# LAST_PHASE_SUMMARY — Resumo da última fase concluída

## Iteração mais recente (manutenção) — 2026-07-19: Apagar o pagamento reabre a fatura
O pagamento de fatura é um lançamento `transferencia` comum e aparece em Lançamentos com
Editar/Excluir. **Excluir por ali** estornava o saldo mas deixava a fatura **marcada como paga**:
o FK `card_statements.pago_transacao_id` é `on delete set null`, então zerava o ponteiro sem limpar
`pago_em`/`status`/`pago_conta_id` — fatura "paga" apontando para o nada. Agora `deleteTransaction`
usa o helper novo **`statementPaidBy`** para detectar que o lançamento quita uma fatura e a **reabre**
(`status='aberta'` + campos de pagamento nulos), igual ao `markStatementUnpaid`. O mesmo helper cobre
a **edição**: editar transferência apaga e recria a linha, então o pagamento recriado teria **outro
`id`** e a fatura perderia o vínculo — `updateTransaction` religa `pago_transacao_id` ao lançamento
recriado (**editar o pagamento não desfaz o pagamento**). Sem migration; sem teste de unidade novo
(I/O puro, como `markStatementUnpaid`). Suíte **414** (lint/tsc/build ok).

## Iteração anterior (manutenção) — 2026-07-19: Transferência não mexia no saldo das contas
Registrar transferência entre contas **não alterava saldo nenhum** (Cofre travado no `initial_balance`
mesmo com 3 transferências recebidas). Contradição entre schema e cálculo: `20260625120300_transactions`
definiu transferência como **DUAS linhas espelhadas** (A→B e B→A, mesmo `transfer_group_id`) e
`createTransaction` gravava as duas — mas `public.account_balance` (`20260625120600`) já deriva **os dois
lados de UMA linha** (`-amount` em `account_id`, `+amount` em `transfer_account_id`). Cada conta recebia
`-amount` de uma perna e `+amount` da outra → **soma sempre zero**. O par também era **simétrico e sem
marcador de direção**, então a origem/destino exibida na lista saía do desempate arbitrário do `ORDER BY`
(as duas linhas têm `competence_date`/`created_at` idênticos). Agora: **uma linha por transferência**
(origem em `account_id`, destino em `transfer_account_id`); `transfer_group_id` fica como marcador de
"isto é transferência" — update/delete/status já operavam por grupo e seguem iguais. Migration
`20260720030000_transferencia_uma_linha` (idempotente): apaga a perna espelhada mantendo a de **origem**
(menor `ctid`, a que o app já exibia) + índice único parcial `transactions_transfer_group_unique` para o
par não voltar. A dedup por grupo em `transactions-client.tsx` saiu (virou desnecessária). Dados: 3
transferências Mercado Pago → Cofre corrigidas (Cofre 756,18 → **1.891,04**; MP 6.222,70 → **5.087,84**).
Relatórios/dashboard não mudam (`transferencia` já ficava fora de entradas/saídas). Suíte **414**
(lint/tsc/build ok). **Aprendizado:** quando o cálculo de saldo vive numa função SQL, o formato gravado
pelo action precisa casar com o que a função assume — aqui as duas convenções coexistiram e se anularam.

## Iteração anterior (manutenção) — 2026-06-27: Recorrência em cartão de crédito
Recorrências (Financeiro → Recorrências) só sabiam lidar com **conta**: o dropdown já listava
"Cartão de crédito" (enum compartilhado), mas **não havia seletor de cartão**, ainda pedia conta, e
salvar quebraria — `recurring_transactions` não tinha `card_id` nem aceitava `cartao_credito` no CHECK.
Agora, ao escolher cartão o form **troca "Conta" por "Cartão"**, força **tipo = despesa**, e cada
ocorrência gerada vira despesa no cartão **resolvida para a fatura da data** (reaproveita
`resolveOrCreateStatement`/`resolverFatura`), **sem abater conta** (`account_id` null). Migration
`20260627000000_recurring_card_support` (idempotente: `card_id` FK on delete set null + CHECK + índice;
`supabase.ts` ajustado). Decisões: cartão = sempre despesa, `card_id` obrigatório (Zod `superRefine`);
cartão excluído deixa recorrência **órfã** (`card_id` null) → a geração **pula** sem travar as demais.
Lógica pura nova `buildGeneratedRow`/`isCardRecurrence` em `generation.ts` (5 testes). Arquivos: migration,
`validators/recurring.ts`, `actions/recurring.ts`, `finance/generation.ts`, `finance/queries.ts`
(join `card`), `recorrencias/{page,recurring-client,recurring-form}.tsx`. Suíte **407** (lint/tsc/build ok).

## Iteração (manutenção) — 2026-06-27: Embed ambíguo no `getTransactions` esvaziava as listas
Regressão de **runtime** da feature de pagamento: a migration `20260627140000` adicionou
`card_statements.pago_transacao_id → transactions.id` (um **2º FK** entre as tabelas) e o `TX_SELECT`
passou a embutir `statement:card_statements(id,pago_em)` **sem dizer qual FK**. Com 2 caminhos, o
PostgREST 14.5 devolve **`PGRST201` (HTTP 300)** e `getTransactions` cai em `data ?? []` → **lista
vazia**. Em `/faturas`, o detalhe mostrava só as **parcelas** (query separada) e sumiam **à vista +
estornos**; também quebrava **Lançamentos** e o **Dashboard**. Passou em build/tsc/lint/testes (erro só
em runtime). **Fix (1 linha em `src/lib/finance/queries.ts`):** desambiguar igual ao `accounts` →
`statement:card_statements!transactions_statement_id_fkey(id,pago_em)`. Verificado no REST real (antes
HTTP 300/PGRST201 → depois HTTP 200). Sem migration, suíte **401**. **Lição:** novo FK que cria um 2º
caminho entre tabelas usadas em embeds → revisar todos os `*_SELECT` do `queries.ts` e pôr `!nome_fk`.

## Iteração anterior (manutenção) — 2026-06-27: Pagar fatura debita uma conta (+ resolve o "seletor de conta")
O botão **Pagar** da fatura abre um diálogo que **sempre pede a conta** e cria **um lançamento tipo
`transferencia`** (debita a conta, status `pago`, `amount` = total da fatura, sem `statement_id`/`card_id`).
Por ser transferência fica **fora** de despesas/relatórios (o `dashboard` exclui) e **fora** do
`total_atual` da fatura (a view só soma despesa/receita) → **zero duplicação**; e **abate o saldo** da
conta. **Desfazer** deleta o lançamento (estorna o saldo) e limpa os campos. A fatura ganhou
`pago_conta_id`/`pago_transacao_id` (migration `20260627140000`, idempotente; `supabase.ts` regenerado).
Em **Lançamentos**, item de cartão mostra **pago/em aberto DERIVADO** da `pago_em` da fatura
(`getTransactions` embute `statement(id,pago_em)`). **Resolve a pendência** anterior (`markStatementPaid(id)`
sem `contaId`) → assinatura agora `(id, contaId)`, `build`/`tsc` verdes. Lógica pura `montarPagamentoFatura`
(4 testes). Bloqueios: fatura já paga e total ≤ 0. Suíte **401** (lint/tsc/build ok). Detalhes em
`docs/project/CURRENT_STATUS.md` → *Iterações (modo manutenção)*.

## Iteração anterior (manutenção) — 2026-06-27: Importar fatura parcelada + divisão "por valor" dividia o recebível do terceiro por `qtd`
Numa fatura de terceiro, dividir uma linha **parcelada** **por VALOR** deixava o recebível **dividido
pelo nº de parcelas** (ex.: SUZY R$147,50/parcela aparecia como **R$73,75**). Causa-raiz (confirmada no
banco): o diálogo de divisão da revisão prevê a parte contra **uma parcela** (o valor da linha), mas
`createInstallmentPurchase`/`applySplitParcelado` dividem a parte pelo **total da compra** (parcela ×
`qtd`) e a espalham nas parcelas → a parte por valor saía dividida por `qtd` (percentual não sofre).
Correção: função pura **`escalarPartesParcelado`** (`src/lib/import/parcelamento.ts`) multiplica as
partes **por valor** por `qtd` em centavos antes do motor; `commitImport` aplica só no ramo do
parcelamento. Sem migration. Suíte **401** (lint ok, `tsc` só com erro **pré-existente** abaixo).
**Dados:** corrigidas via SQL as 2 compras afetadas (Suzy/**Bruna Biju 2** e Nicole/**Cea Bau**),
recebíveis e `valor_pessoal` recompostos — total da SUZY em jun/2026 voltou aos **R$773,53** exatos.
**⚠ Pendência separada (pré-existente):** `build`/`tsc` quebram em `faturas/statements-client.tsx:260`
(`markStatementPaid(id)` sem o 2º arg `contaId` — "marcar fatura como paga" meio-ligado no `b8696b5`);
precisa de seletor de conta. Detalhes em `docs/project/CURRENT_STATUS.md` → *Iterações*.

## Iteração anterior (manutenção) — 2026-06-27: Estorno de cartão não infla "Entradas"
O estorno (receita vinculada à fatura, sem conta) era somado em `resumoMes.entradas` **e** já reduzia
o `total_atual` da fatura → contado em dobro, inflando as Entradas no Painel/Relatórios (que reusam
`resumoMes`). O **saldo das contas nunca foi afetado** (`account_balance` só soma transações com
`account_id`). Correção: receita com `card_id` não entra em `entradas`. UI: `EstornoBadge` ("Estorno de
cartão") substitui "Receita + Recebido" na lista de lançamentos. Suíte **391** (lint/tsc/build ok), sem
migration. Detalhes em `docs/project/CURRENT_STATUS.md` → *Iterações (modo manutenção)*.

## Iteração anterior (manutenção) — 2026-06-27: Importação de fatura — parcelas em meses passados + total errado
Numa fatura de cartão, a linha "k/N" e a última parcela "N/N" trazem a **data da compra original**
(meses atrás), não a data desta fatura. O `commitImport` ancorava a fatura de destino nessa data
antiga, então a parcela `k` caía na fatura da compra original e espalhava `k…N` por **meses passados**
— criando faturas "Atrasada" fantasma **e** drenando o total da fatura atual (mesma causa dos dois
sintomas). Correção: **toda linha do arquivo pertence à fatura sendo importada**. Detecta-se a
**competência** da fatura pelas compras à vista (pura `detectarCompetenciaFatura`), **confirmável na
revisão** ("Fatura de destino") e gravada em `import_batches.competencia_fatura` (migration). O
`commitImport` ancora todas as linhas de cartão nela: parcela `k` na fatura importada e `k+1…` nos
meses seguintes (`planejarParcelamento`/`distribuirFaturas` + `competenciaBase`), última parcela/à
vista via `statement_competencia` + `getOrCreateStatementForCompetencia`. Suíte **390** (lint/tsc/build
ok), `supabase.ts` regenerado. **Dados:** o lote `fatura-azul-julho` foi desfeito e **reimportado** —
junho fechou nos R$ 4.262,45 exatos. **Faturas vazias** (0 lançamentos, criadas pelo get-or-create)
deixaram de listar: `getStatements` agora filtra `itens > 0`; as vazias do cartão foram apagadas.
Detalhes em `docs/project/CURRENT_STATUS.md` → *Iterações (modo manutenção)*.

## Iteração anterior (manutenção) — 2026-06-27: Importar fatura "como parcelado" (valor da parcela + só as restantes)
Numa fatura de cartão, a linha "k/N" traz o valor de **uma parcela**, não o total da compra. O
"Importar parcelado?" dividia o valor da linha por `N` e gerava `N` parcelas do zero — "5/12 R$105"
virava 12× R$8,75. Agora, nova lógica pura **`planejarImportParcelado`** (`src/lib/import/parcelamento.ts`):
cada parcela = valor da linha e gera **só as restantes** (`N − k + 1`), preservando a numeração
original → "5/12 R$105" vira **8× R$105 numeradas 5/12…12/12**. `planejarParcelamento` ganhou
`numeroInicial` (offset; default 1 mantém o fluxo manual), o schema ganhou `numero_inicial`/
`parcelas_total_label` opcionais e `commitImport` calcula o plano pela função pura. UI: o botão some
na **última parcela** (k = N). **Sem migration.** Suíte **382** (lint/tsc/build ok). Detalhes em
`docs/project/CURRENT_STATUS.md` → *Iterações (modo manutenção)*.

## Iteração anterior (manutenção) — 2026-06-27: Divisão com terceiros na edição e na importação
A divisão de gastos (Fase 05) deixou de ser exclusiva da criação. **Na edição:** `updateTransaction`
re-aplica a divisão de uma despesa simples (reusa `applySplit`), só quando ela muda de fato, e
**bloqueia** se houver recebível `cobrado`/`pago`; o form pré-preenche as partes via
`getTransactionSplit`/`sharedExpensesToFormParts`. **Na importação:** migration
`20260627120000_import_rows_split` (+`classificacao`/`split_parts` em `import_rows`), botão "Dividir"
por linha (`ImportRowSplitDialog`), `setImportRowSplit` grava e `commitImport` repassa para
`createTransaction`/`createInstallmentPurchase`. **Correção:** `splitSchema` passou a aceitar valor BR
com vírgula (`normalizeBRMoney`). Suíte **362** (lint/tsc/build ok); `src/types/supabase.ts`
regenerado. Detalhes em `docs/project/CURRENT_STATUS.md` → *Iterações (modo manutenção)*.

## Iteração anterior (manutenção) — 2026-06-27: Importação — cabeçalho fora da 1ª linha
Faturas/extratos reais (ex.: export do Itaú/cartão Azul) trazem **título/resumo antes da tabela**,
então o cabeçalho real não está na 1ª linha. Os parsers (`parseCsv`/`parseXlsx`) assumiam "1ª linha
= cabeçalho", pegavam o título (`Nome;Yuri…`) e **toda** linha caía em *"Mapeie as colunas de data e
valor."*. Correção: nova função pura **`detectHeaderRow()`** em `src/lib/import/mapping.ts` (acha a 1ª
linha cujo `autoDetectMapping` resolve **data E valor**; fallback linha 0 → sem regressão). `csv.ts` e
`xlsx.ts` passam a fatiar a partir dela. Bônus: **`parseParcela`** entende `"Parcela X de N"` (Itaú),
além de `"k/N"`. Testes novos (`csv.test.ts`, `detectHeaderRow`, parcela "de") → suíte **356**
(lint/tsc/build ok). Detalhes em `docs/project/CURRENT_STATUS.md` → *Iterações (modo manutenção)*.

## Iteração anterior (manutenção) — 2026-06-26: Conta/Segurança em Configurações
Adicionado `SecurityCard` em `/configuracoes` (após o `ProfileCard`) com **trocar e-mail** e
**trocar senha**, refletindo direto no **Supabase Auth** (`auth.users`) — **sem migration**.
Senha: reautentica com a atual (`signInWithPassword`) e aplica `updateUser({ password })`.
E-mail: `updateUser({ email })` com confirmação dupla (padrão Supabase), reusando o `/auth/callback`.
Convenção de auth do repo (client do navegador, `react-hook-form`+`zod`). Schemas/teste em
`src/lib/validators/auth.ts(.test.ts)`. **Passo manual**: liberar `…/auth/callback` na *Redirect URLs*
allow-list do projeto `yjvnlbjvippefvzgrxxw` (Authentication → URL Configuration). Detalhes em
`docs/project/CURRENT_STATUS.md` → *Iterações (modo manutenção)*.

## Fase concluída: **Fase 14 — Segurança, Responsividade & Polimento Final** (2026-06-26) — **ÚLTIMA FASE / PROJETO CONCLUÍDO** 🎉

### Resumo da implementação
A fase de **fechamento** do sistema (sem novos domínios): entregou os **relatórios consolidados**
(`/relatorios`), finalizou as **configurações** (`/configuracoes`), consolidou a **store de
preferências** (`settings` estendida), criou a infraestrutura de **anexos genéricos**
(`attachments` + bucket), entregou **exportação/backup** (`/api/export`), e fez a **auditoria de
segurança** (RLS em todas as tabelas, Zod no servidor, nenhum `service_role` no client). Tudo por
**reuso** das Fases 02–13 — nenhuma regra de negócio nova. Com isso, **as 14 fases do roadmap estão
concluídas** e o projeto entra em **modo manutenção** (não há Fase 15).

### Decisões de modelagem (importante)
- **`settings` estendida, não recriada:** migration **idempotente** que só **adiciona** colunas à
  store da Fase 12 (`display_name`, `avatar_url`, `theme`, `currency`, `date_format`,
  `notification_prefs jsonb`). RLS + FORCE RLS já existiam. Optou-se por **estender `settings`** em
  vez de criar `profiles` (uma linha por usuário, `unique(user_id)`).
- **`attachments` genérica** (1 tabela nova): `entity_type`/`entity_id` **sem FK** (referência a
  qualquer módulo), `storage_path`/`file_name`/`mime_type`/`size_bytes`, **RLS + FORCE RLS**,
  índices `user_id` e `(user_id, entity_type, entity_id)`, único `(bucket_id, storage_path)`,
  trigger `updated_at`. Bucket privado `attachments` com policy por pasta `{user_id}/…` — mesmo
  padrão de `task_attachments` (Fase 09).
- **Reuso total nos relatórios:** `reports/queries.ts` apenas **lê e agrega** via `finance/dashboard.ts`
  (Fase 07), `getHabitsDashboard` (Fase 10), `getStudyDashboard` (Fase 11) e o agregador **puro**
  `reports/tasks.ts` (sobre `tasks/status.ts` da Fase 09).

### Decisões técnicas (importante)
- **Upsert parcial de preferências:** `patchSettings` faz `upsert({ user_id, ...patch })` — o
  PostgREST só atualiza as colunas presentes, então salvar perfil **não** apaga prefs de
  notificação (e vice-versa). `user_id` sempre de `auth.uid()`.
- **Tema:** continua via `next-themes` (sem flash) como fonte de verdade; a coluna `settings.theme`
  é sincronizada **best-effort** pelo `AppearanceCard` (não bloqueia a UI) — store consolidada.
- **Exportação/backup respeita RLS:** `/api/export` roda cada `select` sob a sessão do usuário
  (nunca varre outro usuário) e **omite deliberadamente `google_integrations`** (tokens OAuth nunca
  saem). Rota privada (proxy) + `auth.getUser()` na própria rota (defesa em profundidade).
- **CSV/JSON no client, sem round-trip:** os relatórios exportam a partir dos dados já carregados
  (`reports/csv.ts` puro + `reports/download.ts` com BOM p/ Excel). Separador `;` (Excel pt-BR).
- **`formatDateWith`** aplica a preferência de formato de data onde é lida; o padrão global do app
  segue `formatDate` (dd/MM/yyyy, BR) para não arriscar quebra em telas das fases anteriores.
- **Gráficos reaproveitados** (Fase 07) + `ReportBarChart` genérico novo — **zero dependência nova**.

### Arquivos criados (principais)
- **Migrations:** `supabase/migrations/20260626200000_settings_profile.sql`,
  `20260626200100_attachments.sql`, `20260626200200_attachments_storage.sql`.
- **Preferências (store):** `src/lib/settings/constants.ts`, `src/lib/settings/queries.ts`
  (`getUserSettings`/`getDisplayName`).
- **Relatórios:** `src/lib/reports/queries.ts`, `src/lib/reports/tasks.ts` + `tasks.test.ts`
  (**4 testes**), `src/lib/reports/csv.ts` + `csv.test.ts` (**4 testes**), `src/lib/reports/download.ts`,
  `src/components/reports/report-bar-chart.tsx`; `src/app/(app)/relatorios/` (`page.tsx`,
  `relatorios-client.tsx`, `loading.tsx`).
- **Configurações:** `src/components/settings/profile-card.tsx`, `regional-card.tsx`,
  `notifications-card.tsx`, `dashboard-prefs-card.tsx`.
- **Backup:** `src/app/api/export/route.ts`.

### Arquivos alterados
- `src/types/supabase.ts` — regenerado (inclui `attachments` + colunas novas de `settings`).
- `src/lib/validators/settings.ts` — `profileSchema`/`preferencesSchema`/`themeSchema`/`notificationPrefsSchema`.
- `src/lib/actions/settings.ts` — `saveProfile`/`savePreferences`/`saveThemePreference`/`saveNotificationPrefs` (+ `patchSettings`).
- `src/lib/format.ts` — `formatDateWith` (+ helper `toLocalDate`).
- `src/components/settings/appearance-card.tsx` — claro/escuro/**sistema** + persiste tema best-effort.
- `src/app/(app)/configuracoes/page.tsx` — página completa (perfil/aparência/regional/notificações/Google/dashboard/backup/atalhos).
- `src/config/nav.ts` — item **Relatórios** (`/relatorios`).
- `src/app/(app)/layout.tsx` + `src/components/layout/{app-shell,header,user-menu}.tsx` — propagam o **nome de exibição** ao menu do usuário.

### Migrations aplicadas
- 3 migrations aplicadas no projeto `yjvnlbjvippefvzgrxxw` via Supabase MCP. **0 lints de schema**
  no `get_advisors`. Tipos regenerados. RLS confirmada em **todas as 34 tabelas** (`list_tables`).

### Funcionalidades entregues
- **Relatórios** (5 abas: financeiro, cartões, hábitos, estudos, tarefas) com gráficos úteis,
  filtro de período e **exportação** (CSV por aba + JSON do relatório).
- **Configurações finais** completas (perfil, tema/sistema, BRL, formato de data, notificações,
  Google, exportação/backup, preferências do dashboard, atalhos categorias/cartões).
- **`attachments`** + bucket privado (infra de anexos genéricos, RLS).
- **Backup** (`/api/export`) com **todos** os dados do usuário (sem tokens), respeitando RLS.
- **Auditoria de segurança** concluída: RLS em todas as tabelas, Zod no servidor, sem `service_role` no client.

### Testes
- `npm run test:run` ✅ **342 testes** (334 anteriores + **8 da Fase 14**): `reports/tasks` (4) e `reports/csv` (4).
- `npm run lint` ✅ (0/0); `tsc --noEmit` ✅; `npm run build` ✅. Smoke: `/login` 200;
  `/relatorios`, `/configuracoes`, `/api/export` → 307 `/login`; `/api/cron/notifications` → 401.

### Checklist de aceite do briefing (revisado item a item)
- ✅ Cadastrar cartões com fechamento/vencimento · lançar compra → fatura correta · parcelada →
  parcelas distribuídas · **provisão das próximas 6 faturas** (Fases 03–04, com testes).
- ✅ Importar Excel/CSV/OFX; importados têm as **mesmas opções** dos manuais (Fase 06).
- ✅ Separar pessoal × terceiros; ver quem precisa pagar/quanto/de qual fatura (Fase 05).
- ✅ Ver fatura de qualquer mês; contas/receitas/despesas à vista (Fases 03/02).
- ✅ Dashboard financeiro completo (Fase 07) · Google Agenda (Fase 08) · tarefas/rotinas/hábitos
  (água/leitura/exercícios)/estudos (Fases 09–11) · busca global + lançamento rápido + notificações
  (Fase 13) · **relatórios** (Fase 14).
- ✅ Dark/light; sistema premium preto/branco/dourado, responsivo. Segurança: **RLS em todas as
  tabelas**, validação no servidor, sem dados sensíveis no client, **backup/exportação** disponível.

### Problemas/pendências
- **Verificação visual logada pendente** (dark/light + mobile) de ponta a ponta — já há usuário em
  `auth.users`. Dá para exercitar perfil, tema, relatórios, exportação e backup.
- **Anexos na UI:** infra (`attachments` + bucket) pronta; ligar o upload em telas além de tarefas é
  melhoria de manutenção (precedente em tarefas, Fase 09).
- **Cron/notificações** ainda exige `SUPABASE_SERVICE_ROLE_KEY` + `CRON_SECRET` no ambiente; Google
  Agenda exige `GOOGLE_CLIENT_ID/SECRET` (degrada com elegância sem eles).

### Recomendação para o próximo agente
**O projeto está concluído (modo manutenção) — não inicie uma "Fase 15".** Para melhorias/correções
futuras, siga `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md`: leia briefing/regras, trate como tarefa
pontual e preserve os invariantes (RLS `using`+`with check`, Zod no servidor, sem `service_role` no
client, pt-BR/BRL, dark/light + responsividade, testes verdes). Rode sempre
`npm run lint && npx tsc --noEmit && npm run test:run && npm run build` antes de fechar.
