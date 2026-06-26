# Fase 03 — Cartões de Crédito & Faturas

## Contexto
Esta é a **parte mais importante** do sistema. Com o financeiro à vista pronto (Fase 02), agora entra o crédito: cadastrar cartões e fazer com que **toda compra caia automaticamente na fatura correta**, calculada por **data da compra + dia de fechamento + dia de vencimento** do cartão. Essa regra é o coração do produto — tudo que vem depois (parcelamentos, terceiros, importação, dashboard) depende dela estar **certa e testada**. A lógica é centralizada em `src/lib/finance/invoice.ts`, isolada da UI e coberta por testes unitários de borda (meses com 28–31 dias, virada de mês e de ano). Esta fase ainda **não** trata parcelamento (Fase 04) nem terceiros (Fase 05).

## Antes de começar
O agente deve ler:
- `docs/project/PROJECT_BRIEFING.md`
- `docs/project/PROJECT_RULES.md`
- `docs/project/PROJECT_ARCHITECTURE.md`
- `docs/project/PROJECT_ROADMAP.md`
- `docs/project/CURRENT_STATUS.md`
- `docs/handoff/LAST_PHASE_SUMMARY.md`
- `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md`
- Este arquivo.

## Objetivo da fase
Permitir cadastrar cartões de crédito (limite, fechamento, vencimento, bandeira, cor) e lançar compras no cartão que caem **automaticamente na fatura correta**, com a regra de fechamento/vencimento centralizada e testada. Entregar a visão de faturas por cartão/mês, com estados aberta/fechada/paga, marcação de fatura como paga e ajuste manual da fatura vinculada a um lançamento.

## Escopo da fase
- **Schema + migrations (Supabase, `supabase/migrations/`):** duas novas tabelas, ambas com `user_id uuid not null references auth.users(id) on delete cascade`, **RLS habilitada** (`user_id = auth.uid()` em `using` e `with check`), índice em `user_id`, índices nas colunas de filtro e trigger de `updated_at`.
  - **`credit_cards`** — cartões do usuário. Colunas mínimas: `id`, `user_id`, `nome`, `banco/instituicao`, `bandeira` (visa/mastercard/elo/amex/outros), `limite_total numeric(14,2)`, `dia_fechamento smallint` (1–31, com `check`), `dia_vencimento smallint` (1–31, com `check`), `cor` (hex), `ativo boolean default true`, `observacoes`, `created_at`, `updated_at`. Índice em `(user_id, ativo)`.
  - **`card_statements`** — faturas (uma por cartão por ciclo). Colunas mínimas: `id`, `user_id`, `card_id uuid references credit_cards(id) on delete cascade`, `competencia date` (mês/ano de referência da fatura, dia 1), `data_fechamento date`, `data_vencimento date`, `status` (enum/text com `check`: `aberta` | `fechada` | `paga` | `atrasada`), `pago_em timestamptz null`, `total_calculado numeric(14,2) default 0` (cache opcional), `observacoes`, `created_at`, `updated_at`. **Unicidade** por `(user_id, card_id, competencia)`. Índices em `(user_id, card_id)` e `(user_id, status)`.
- **Vínculo com `transactions` (Fase 02):** adicionar (migration) as colunas que faltam para o crédito: `card_id uuid null references credit_cards(id)`, `statement_id uuid null references card_statements(id)`, e marcar a forma de pagamento `cartao_credito`. Lançamento à vista permanece com `card_id`/`statement_id` nulos. Índices em `(user_id, card_id)` e `(user_id, statement_id)`.
- **Regra de fatura — `src/lib/finance/invoice.ts` (núcleo desta fase):** função pura, sem dependência de UI nem de banco, que recebe `data_compra`, `dia_fechamento`, `dia_vencimento` e devolve a competência, a `data_fechamento` e a `data_vencimento` da fatura onde a compra entra. Detalhada em **Instruções técnicas**. Usar `date-fns` para aritmética de datas.
- **Resolução/criação de fatura:** ao lançar uma compra no cartão, calcular a fatura-alvo via `invoice.ts` e **encontrar ou criar** (`get-or-create`) a `card_statements` correspondente (`user_id` + `card_id` + `competencia`), vinculando `statement_id` na transação.
- **Cadastro de cartão (UI):** CRUD completo (criar/editar/excluir/inativar) com form (RHF + Zod): nome, banco, bandeira, limite, **dia de fechamento**, **dia de vencimento**, cor, status, observações. Validar fechamento/vencimento (1–31). Confirmação antes de excluir.
- **Lançar compra no cartão (UI):** no form de lançamento, ao escolher forma de pagamento "cartão de crédito", exigir cartão; mostrar **em qual fatura a compra vai cair** (preview reativo via `invoice.ts`, antes de salvar). Reusar o form da Fase 02, estendido.
- **Aba de faturas (`/faturas`):** seleção de cartão e mês; exibir fatura **atual**, **próxima** e **histórico**; por fatura: total, data de fechamento, data de vencimento, status (aberta/fechada/paga/atrasada), lista de lançamentos vinculados, indicador visual de vencimento. Filtros por cartão/mês/status. Ver fatura de **qualquer mês**.
- **Marcar fatura como paga:** ação que muda `status` para `paga` e grava `pago_em`; refletir na UI. (Sem gerar lançamento de pagamento ainda — apenas estado da fatura.)
- **Ajuste manual da fatura vinculada:** permitir, em modo "ajuste", **mover um lançamento** para outra fatura (alterar `statement_id`) com confirmação — para casos de exceção em que o usuário discorda do cálculo automático.
- **Página de cartões (`/cartoes`):** lista de cartões com nome, bandeira, cor, limite e atalho para as faturas do cartão.

## Fora do escopo
- **Parcelamento** (qtd de parcelas, distribuição de parcelas em faturas futuras) — Fase 04.
- **Gastos de terceiros / divisão** (valor meu x de terceiros na fatura) — Fase 05.
- **Importação** de faturas/extratos (Excel/CSV/OFX) — Fase 06.
- **Dashboard financeiro** e **provisão das próximas 6 faturas** consolidada — Fase 07. (Esta fase entrega a fatura por cartão/mês; a visão agregada de 6 faturas é da Fase 07.)
- Cálculo de limite disponível dinâmico e alertas de limite — Fase 07.

## Instruções técnicas

### `src/lib/finance/invoice.ts` (regra obrigatória, com testes)
Função pura e determinística. Sugestão de assinatura:

```ts
type FaturaAlvo = {
  competencia: Date;      // dia 1 do mês de referência da fatura
  dataFechamento: Date;   // dia do fechamento (com clamp)
  dataVencimento: Date;   // dia do vencimento (com clamp)
};

function resolverFatura(
  dataCompra: Date,
  diaFechamento: number,  // 1..31
  diaVencimento: number,  // 1..31
): FaturaAlvo;
```

Regras (conforme `PROJECT_ARCHITECTURE.md`):
1. **Qual ciclo:** comparar o dia da compra com o `diaFechamento` **já clampado** ao mês da compra. Se `dia(dataCompra) <= diaFechamentoClampado`, a compra entra na fatura que **fecha no mês corrente**; senão, entra na fatura que **fecha no mês seguinte**. (Convenção do projeto: compra **no próprio dia do fechamento** entra na fatura que fecha naquele mês — documentar essa escolha de borda no topo do arquivo e cobrir por teste.)
2. **`dataFechamento`:** o `diaFechamento` aplicado ao mês de referência, com **clamp** para o último dia do mês quando o mês tiver menos dias (ex.: fechamento 31 em fevereiro → 28/29; em abril → 30). Usar `date-fns` (`lastDayOfMonth`, `setDate`, `min`) ou util própria de clamp.
3. **`dataVencimento`:** o `diaVencimento` aplicado ao mês do fechamento; **se `diaVencimento <= diaFechamento`, o vencimento cai no mês seguinte ao fechamento** (vencimento sempre depois do fechamento). Aplicar o mesmo **clamp** de dias.
4. **Virada de ano:** quando o "mês seguinte" cruza dezembro→janeiro, o ano incrementa corretamente (a aritmética do `date-fns` com `addMonths` já cobre; **garantir teste** dez/jan).
5. **`competencia`:** normalizar para o **dia 1** do mês de referência da fatura (usar como chave de unicidade junto de `card_id`/`user_id`).
6. **Sem dependência de fuso/horas:** trabalhar só com a parte de data (normalizar para meia-noite local) para evitar erro por timezone.

### Testes unitários (Vitest) — obrigatórios
Reaproveitar o Vitest configurado na Fase 02. Criar `src/lib/finance/invoice.test.ts` cobrindo, no mínimo:
- Compra **antes** do fechamento → fatura do mês corrente; compra **depois** do fechamento → mês seguinte; compra **no dia** do fechamento (borda).
- **Fechamento 31** em meses de 30 dias e em **fevereiro** (28 e 29 — ano bissexto), confirmando o clamp.
- **Vencimento < fechamento** (vencimento no mês seguinte ao fechamento).
- **Virada de ano:** compra em dezembro que fecha/vence em janeiro do ano seguinte.
- **Vencimento 31 / 30** caindo em mês curto (clamp do vencimento).
- Consistência: a `competencia` retornada é sempre dia 1; fechamento < vencimento.

### Dados e integração
- **Resolver fatura no servidor:** o cálculo e o `get-or-create` da `card_statements` rodam no **servidor** (Server Action / rota), derivando `user_id` de `auth.uid()` — nunca confiar em `user_id`/`statement_id` vindos do client.
- **Mutations** via Server Actions (Next 16) com validação **Zod** no servidor; revalidar a fatura/listas após salvar (`updateTag`/revalidate).
- **Client tipado:** regenerar tipos do Supabase após a migration; criar hooks de query por entidade em `src/hooks` (TanStack Query) para cartões e faturas.
- **UI:** reusar componentes da Fase 01/02 (StatCard, PageHeader, EmptyState, tabela com filtros, dialogs, skeletons, toasts). Badges de status da fatura com cores do design system (dourado para destaque, neutros para estados).
- **Datas/moeda:** usar `lib/format.ts` (BRL, `date-fns`/`ptBR`) em toda a UI.
- **Estrutura:** seguir pastas e padrões de `PROJECT_ARCHITECTURE.md` (`lib/finance/`, `hooks/`, route group `(app)`).

## Cuidados
- **A regra de fatura é crítica:** não finalizar a fase sem os testes de borda passando. Bugs aqui contaminam parcelas (Fase 04), terceiros (Fase 05), importação (Fase 06) e dashboard (Fase 07).
- **RLS obrigatória** em `credit_cards` e `card_statements` (e nas novas colunas/índices de `transactions`) — nenhuma tabela/dado sem policy.
- **Clamp de dias** sempre que aplicar fechamento/vencimento a um mês mais curto (28/29/30/31). Não usar datas inválidas (ex.: 31/02).
- **Timezone:** normalizar para data local (sem horas) ao calcular faturas, para a borda do dia do fechamento não "vazar" para o mês errado.
- **Ajuste manual** de fatura é exceção: exigir confirmação e manter rastreabilidade (não apagar histórico, apenas reatribuir `statement_id`).
- **Não quebrar** as Fases 01/02 (layout, tema, rotas, auth, CRUD à vista, formatação, testes existentes).
- Migrations **idempotentes** e versionadas; alterações em `transactions` **aditivas** (colunas nulas), sem destruir dados.
- Excluir cartão com faturas/lançamentos: decidir e documentar (recomendado bloquear ou usar inativação; `on delete cascade` só com confirmação clara).

## Critérios de aceite
- [ ] Cadastrar/editar/excluir/inativar cartões (limite, fechamento, vencimento, bandeira, cor) com RLS.
- [ ] `src/lib/finance/invoice.ts` implementada como função pura, com **testes de borda passando** (dias 28–31, vencimento < fechamento, virada de ano).
- [ ] Lançar compra no cartão → cai **automaticamente na fatura correta** (`card_statements` resolvida/criada e vinculada via `statement_id`).
- [ ] Preview no form mostra **em qual fatura** a compra vai cair antes de salvar.
- [ ] Aba `/faturas`: ver fatura **atual, próxima e de qualquer mês**, por cartão, com total e estados **aberta/fechada/paga/atrasada**.
- [ ] Marcar fatura como **paga** (status + `pago_em`) refletindo na UI.
- [ ] Ajuste manual: mover lançamento para outra fatura com confirmação.
- [ ] Empty states, skeletons, toasts e confirmação ao excluir.
- [ ] `npm run build` passa.

## Ao finalizar
O agente deve atualizar:
- `docs/project/CURRENT_STATUS.md` (Fase 03 concluída; próxima = Fase 04; caminho do arquivo).
- `docs/handoff/LAST_PHASE_SUMMARY.md` (resumo, arquivos criados/alterados, migrations de `credit_cards`/`card_statements` e colunas em `transactions`, regra de fatura + testes, pendências).
- `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md` (apontando para `docs/phases/PHASE_04_INSTALLMENTS.md`).
