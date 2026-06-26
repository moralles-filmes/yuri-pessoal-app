# Fase 05 — Gastos de Terceiros & Divisão

## Contexto
Com cartões, faturas (Fase 03) e parcelamentos (Fase 04) prontos, esta fase resolve um dos pontos centrais do briefing: **separar o que é meu do que é de terceiros**. Uma compra pode ser **pessoal**, **de terceiro** ou **compartilhada** (ex.: R$ 500 → R$ 250 meus, R$ 250 de outra pessoa), com divisão por **valor** ou **porcentagem**. O sistema precisa controlar o **a receber** por pessoa (status de cobrança, datas, histórico) e, na fatura, deixar claro **quanto é meu e quanto é de terceiros**, sem que os valores de terceiros **distorçam o meu gasto pessoal real**. Esta é a base para o dashboard diferenciar "total movimentado" de "valor realmente meu" (Fase 07). Ainda **não** trata importação (Fase 06) nem dashboard (Fase 07).

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
Permitir marcar uma despesa como **pessoal / de terceiro / compartilhada**, dividir o valor entre uma ou mais pessoas (por valor ou %), controlar o **status de cobrança** e o **a receber** por pessoa, e exibir na fatura o **valor meu x valor de terceiros** — garantindo que valores de terceiros **não distorçam** o gasto pessoal real.

## Escopo da fase
- **Schema + migrations (Supabase, `supabase/migrations/`):** três novas tabelas, todas com `user_id uuid not null references auth.users(id) on delete cascade`, **RLS habilitada** (`user_id = auth.uid()` em `using` e `with check`), índice em `user_id`, índices de filtro e trigger de `updated_at`.
  - **`people`** — pessoas (terceiros). Colunas mínimas: `id`, `user_id`, `nome`, `telefone`, `email`, `observacoes`, `ativo boolean default true`, `created_at`, `updated_at`. Índice em `(user_id, ativo)`.
  - **`shared_expenses`** — divisão de uma despesa entre pessoas. Colunas mínimas: `id`, `user_id`, `transaction_id uuid not null references transactions(id) on delete cascade` (a despesa dividida), `person_id uuid not null references people(id)`, `tipo_divisao` (`valor` | `percentual`), `percentual numeric(5,2) null`, `valor numeric(14,2) not null` (parte desta pessoa, sempre resolvido em valor), `created_at`, `updated_at`. **Unicidade** por `(user_id, transaction_id, person_id)`. Índices em `(user_id, transaction_id)` e `(user_id, person_id)`.
  - **`receivables`** — o "a receber" por pessoa, derivado da parte de terceiros. Colunas mínimas: `id`, `user_id`, `person_id uuid not null references people(id)`, `transaction_id uuid references transactions(id)`, `shared_expense_id uuid references shared_expenses(id)`, `statement_id uuid references card_statements(id)` (fatura onde o gasto entrou, quando cartão), `card_id uuid references credit_cards(id)`, `valor numeric(14,2) not null`, `status` (`pendente` | `cobrado` | `pago` | `ignorado`), `data_prevista date null`, `pago_em date null`, `observacoes`, `created_at`, `updated_at`. Índices em `(user_id, person_id, status)`, `(user_id, statement_id)` e `(user_id, status)`.
- **Marcação da despesa em `transactions`:** adicionar (migration, aditivo) `classificacao` (`pessoal` | `terceiro` | `compartilhada`, default `pessoal`) e `valor_pessoal numeric(14,2) null` (minha parte, derivada quando há divisão). Lançamentos antigos permanecem `pessoal` com `valor_pessoal = valor`.
- **Divisão — `src/lib/finance/split.ts`:** função pura que recebe o **valor total** e a configuração de divisão (lista de pessoas com **valor** ou **percentual**, e a minha parte) e devolve as partes resolvidas em **valor**, com **minha parte** + soma das partes de terceiros = total (ajuste de centavos consistente). Detalhada em **Instruções técnicas**.
- **Fluxo de divisão (UI):** no form de lançamento (à vista ou cartão), seletor de **classificação** (pessoal/terceiro/compartilhada). Em compartilhada/terceiro: escolher **uma ou mais pessoas** (`people`), definir **valor ou %** de cada, ver **minha parte** calculada e a **parte de cada terceiro**; preview reativo via `split.ts`. Ao salvar, gravar `shared_expenses` e gerar os `receivables` correspondentes.
- **Cadastro de pessoas (`/terceiros` ou seção dedicada):** CRUD de `people` (nome, telefone, email, observações, status). Avatar/iniciais. Confirmação ao excluir (ou inativar se houver `receivables` vinculados).
- **Aba "A Receber de Terceiros":** lista de `receivables` com **pessoa, valor pendente, origem do gasto, cartão usado, fatura onde entrou, data da compra, data prevista, status**; ação **marcar como recebido** (status `pago` + `pago_em`); filtros por **pessoa/mês/cartão/status**; **total geral a receber**, **total recebido no mês** e **histórico** de pagamentos recebidos.
- **Integração na fatura (estende Fase 03):** em cada fatura mostrar **valor total**, **valor realmente meu** e **valor de terceiros**, além de **quem precisa pagar e quanto** (lista dos `receivables` daquela `statement_id`). Em compras parceladas (Fase 04), a parte de terceiros segue **por parcela/fatura**.
- **Rastreabilidade:** de um `receivable` é possível chegar à **compra → fatura → pessoa** (origem completa).

## Fora do escopo
- **Importação** de gastos compartilhados a partir de arquivos (Excel/CSV/OFX) — Fase 06.
- **Dashboard** com cards de "valor pessoal x terceiros" e "a receber" consolidados, gráficos e projeções — Fase 07 (esta fase entrega os dados e a aba A Receber; a visão consolidada do dashboard é da Fase 07).
- **Cobrança automática** / envio de mensagem ao terceiro (WhatsApp/e-mail) — não previsto nesta fase.
- Geração de lançamento de **recebimento em conta** ao marcar recebido (apenas status `pago` + data nesta fase; conciliação fina pode ser tratada depois).

## Instruções técnicas

### `src/lib/finance/split.ts` (com testes)
Função pura e determinística. Trabalhar em **centavos**. Sugestão de assinatura:

```ts
type ParteDivisao =
  | { personId: string; tipo: 'valor'; valorCentavos: number }
  | { personId: string; tipo: 'percentual'; percentual: number }; // 0..100

type ResultadoDivisao = {
  minhaParteCentavos: number;
  partesTerceiros: { personId: string; valorCentavos: number }[];
};

function dividirDespesa(
  valorTotalCentavos: number,
  partes: ParteDivisao[],
): ResultadoDivisao;
```

Regras:
1. **Percentual → valor:** converter cada `%` em centavos sobre o total; a **minha parte** é o restante (total − soma das partes de terceiros).
2. **Soma fecha:** `minhaParte + Σ(partesTerceiros) === total`, com **ajuste de centavos** previsível (resto na minha parte, salvo override).
3. **Validação:** somatório de % ≤ 100; somatório de valores de terceiros ≤ total; rejeitar divisões que não fecham (validar no servidor).
4. **Pessoal:** `classificacao = pessoal` → minha parte = total, sem `receivables`.
5. Usar utilitários de `lib/format.ts` para centavos ↔ reais, consistente com Fases 02–04.

### Testes unitários (Vitest) — obrigatórios
Criar `src/lib/finance/split.test.ts` cobrindo, no mínimo:
- **50/50 por valor** (R$ 500 → 250 meu / 250 terceiro) e a soma fecha.
- **Divisão por %** (ex.: 70% meu / 30% terceiro; 1/3 cada entre 3 pessoas, resto de centavo na minha parte).
- **Múltiplas pessoas** com mistura de valor e %.
- Rejeição quando **% > 100** ou **soma de terceiros > total**.
- **Pessoal** → minha parte = total, zero `receivables`.

### Dados e integração
- **Derivar no servidor:** `valor_pessoal` da transação e os `receivables` são calculados no **servidor** a partir de `split.ts`, derivando `user_id` de `auth.uid()`. Nunca confiar em valores de divisão vindos do client sem revalidar.
- **Gasto pessoal real:** consultas/relatórios de "meu gasto" usam `valor_pessoal` (não `valor`). O `valor` total continua existindo para "total movimentado" (Fase 07). **Esta separação é a regra central da fase.**
- **Parcelas (Fase 04):** quando a compra é parcelada e compartilhada, a parte de terceiros acompanha **cada parcela** (e cada `receivable` aponta para a `statement_id` da parcela).
- **Mutations** via Server Actions (Next 16) com validação **Zod**; revalidar fatura, aba A Receber e listas após salvar (`updateTag`/revalidate).
- **Client tipado:** regenerar tipos do Supabase; hooks de query por entidade em `src/hooks` (pessoas, a receber, divisão por transação).
- **UI:** reusar componentes (StatCard, PageHeader, EmptyState, tabela com filtros, dialogs, skeletons, toasts, avatar/iniciais). Badges de status do recebível. pt-BR, BRL e datas brasileiras via `lib/format.ts`.
- **Estrutura:** seguir `PROJECT_ARCHITECTURE.md` (`lib/finance/`, `hooks/`, route group `(app)`).

## Cuidados
- **Valores de terceiros NÃO distorcem o gasto pessoal real:** garantir que todo "quanto eu gastei" use `valor_pessoal`. Este é o critério mais importante da fase.
- **Soma da divisão fecha sempre:** minha parte + terceiros = total (em centavos, com ajuste previsível). Validar no servidor; bloquear divisões inconsistentes.
- **Rastreabilidade compra → fatura → pessoa** preservada em `receivables` (não perder a origem ao marcar recebido).
- **Marcar recebido** muda status/`pago_em` sem apagar histórico; manter o histórico de pagamentos recebidos.
- **Excluir pessoa** com recebíveis vinculados: bloquear ou inativar (recomendado), com confirmação; não deixar `receivables` órfãos.
- **RLS obrigatória** em `people`, `shared_expenses`, `receivables` e nas novas colunas de `transactions`.
- **Não quebrar** Fases 01–04 (layout, tema, auth, CRUD, regra de fatura, parcelas e seus testes).
- Migrations **idempotentes**, versionadas e **aditivas**; sem mudanças destrutivas em `transactions`/`card_statements`.

## Critérios de aceite
- [ ] Marcar despesa como **pessoal / terceiro / compartilhada**; dividir por **valor** ou **%** entre uma ou mais pessoas.
- [ ] `src/lib/finance/split.ts` com **testes passando**: minha parte + terceiros = total (ajuste de centavos), validações de % e soma.
- [ ] CRUD de **pessoas** (`people`) com RLS.
- [ ] Aba **"A Receber de Terceiros"**: pessoa, valor pendente, origem, cartão, fatura, datas, status; **marcar recebido**; filtros (pessoa/mês/cartão/status); **total a receber** e **recebido no mês**; histórico.
- [ ] Na **fatura**: valor total, **valor meu**, **valor de terceiros**, e **quem paga e quanto**.
- [ ] **Valores de terceiros não distorcem** o gasto pessoal real (consultas de "meu gasto" usam `valor_pessoal`).
- [ ] Rastreabilidade **compra → fatura → pessoa** funcionando.
- [ ] Empty states, skeletons, toasts e confirmação ao excluir.
- [ ] `npm run build` passa.

## Ao finalizar
O agente deve atualizar:
- `docs/project/CURRENT_STATUS.md` (Fase 05 concluída; próxima = Fase 06; caminho do arquivo).
- `docs/handoff/LAST_PHASE_SUMMARY.md` (resumo, arquivos criados/alterados, migrations de `people`/`shared_expenses`/`receivables` e colunas em `transactions`, `split.ts` + testes, regra "terceiros não distorcem gasto pessoal", pendências).
- `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md` (apontando para `docs/phases/PHASE_06_IMPORTS.md`).
