# Fase 02 — Financeiro Base

## Contexto
Com a base pronta (Fase 01), começa o **núcleo financeiro** — a parte mais importante do sistema. Esta fase entrega o financeiro **manual e à vista** (sem cartão de crédito ainda, que vem na Fase 03). Ela também **inicia o schema do banco** e o padrão de RLS que todas as fases seguintes vão reutilizar.

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
Permitir controlar contas, categorias e lançamentos financeiros à vista (despesa, receita, transferência, ajuste), contas fixas e recorrências — tudo com RLS, em BRL e formato de data brasileiro.

## Escopo da fase
- **Schema + migrations (Supabase, `supabase/migrations/`):** `accounts`, `categories`, `subcategories`, `transactions`, `bills` (contas fixas), `recurring_transactions`. Todas com `user_id` + RLS (`user_id = auth.uid()`), índices em `user_id` e colunas de filtro, trigger `updated_at`.
- **Decisão a documentar e aplicar:** representação monetária (recomendado `numeric(14,2)`), enums de tipo/forma de pagamento/status.
- **Contas (`accounts`):** CRUD; tipos (corrente, poupança, dinheiro, carteira digital, investimento); saldo inicial e atual; status.
- **Categorias/subcategorias:** CRUD; seed com as categorias do briefing; cor e ícone.
- **Lançamentos (`transactions`):** CRUD; tipo (despesa/receita/transferência/ajuste); forma de pagamento (débito/pix/dinheiro/boleto/transferência/conta corrente — cartão entra na Fase 03); conta vinculada; datas (compra/competência); valor; categoria/subcategoria; descrição/observações/tags; status (pendente/pago/recebido/cancelado). Transferência entre contas (saída+entrada).
- **Contas fixas (`bills`) e recorrências (`recurring_transactions`):** geração de lançamentos recorrentes; vencimento; status.
- **Utilitários:** `lib/format.ts` (BRL via `Intl.NumberFormat('pt-BR')`, datas via `date-fns/ptBR`).
- **Testes:** configurar **Vitest**; testes de formatação e de geração de recorrências.
- **UI:** listas com filtros (TanStack Table), forms (RHF+Zod), empty states, skeletons, toasts, confirmação ao excluir. Reusar componentes da Fase 01.

## Fora do escopo
- Cartões de crédito, faturas, parcelamento (Fases 03–04).
- Gastos de terceiros (Fase 05), importação (Fase 06), dashboards (Fase 07).

## Instruções técnicas
- Criar o **cliente Supabase tipado** (gerar tipos com `supabase gen types` quando possível) e helpers de query (TanStack Query) por entidade em `src/hooks`.
- Mutations preferencialmente via **Server Actions** (Next 16) com validação Zod no servidor; revalidar dados após mutação.
- Respeitar RLS: nunca confiar em `user_id` vindo do client — derivar de `auth.uid()` no servidor.
- Manter pt-BR, BRL e formato de data brasileiro em toda a UI.
- Seguir a estrutura de pastas e padrões de `PROJECT_ARCHITECTURE.md`.

## Cuidados
- **RLS obrigatória** em todas as novas tabelas — nenhuma tabela de dados sem policy.
- Não quebrar a Fase 01 (layout, tema, rotas, auth).
- Migrations **idempotentes** e versionadas; não aplicar mudanças destrutivas sem necessidade.
- Transferências não podem distorcer saldos (registrar as duas pontas de forma consistente).
- Validar valores monetários (sem negativos onde não faz sentido; arredondamento correto).

## Critérios de aceite
- [ ] CRUD de contas, categorias/subcategorias e transações funcionando com RLS.
- [ ] Lançamentos à vista (despesa/receita/transferência/ajuste) corretos; saldos por conta atualizam.
- [ ] Contas fixas e recorrências geram lançamentos.
- [ ] Valores em BRL e datas em formato brasileiro.
- [ ] Listas com filtros, empty states, skeletons, toasts e confirmação ao excluir.
- [ ] Vitest configurado; testes de formatação e recorrência passam.
- [ ] `npm run build` passa.

## Ao finalizar
O agente deve atualizar:
- `docs/project/CURRENT_STATUS.md`
- `docs/handoff/LAST_PHASE_SUMMARY.md`
- `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md` (apontando para `docs/phases/PHASE_03_CREDIT_CARDS_INVOICES.md`)
