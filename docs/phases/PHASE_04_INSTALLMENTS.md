# Fase 04 — Parcelamentos

## Contexto
Com cartões e a regra de fatura prontos e testados (Fase 03), esta fase adiciona **compras parceladas**: uma compra de N parcelas é dividida em N lançamentos, cada um caindo na **fatura correta** das próximas N competências do cartão. A distribuição **reaproveita** `src/lib/finance/invoice.ts` (não recriar a regra). O foco é precisão financeira (soma das parcelas = total, com ajuste de centavos na última), rastreabilidade (parcelas vinculadas à compra original) e segurança ao editar/cancelar (não corromper histórico nem faturas já pagas). Ainda **não** trata terceiros (Fase 05) nem importação (Fase 06).

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
Permitir marcar uma compra no cartão como **parcelada** (quantidade de parcelas e valor total → valor por parcela com ajuste de centavos na última), criar automaticamente todas as parcelas vinculadas à compra original, cada parcela na sua **fatura correta**, e oferecer uma aba de parcelamentos (ativos/finalizados/cancelados) com edição e cancelamento seguros.

## Escopo da fase
- **Schema + migrations (Supabase, `supabase/migrations/`):** uma nova tabela, com `user_id uuid not null references auth.users(id) on delete cascade`, **RLS habilitada** (`user_id = auth.uid()` em `using` e `with check`), índice em `user_id`, índices de filtro e trigger de `updated_at`.
  - **`transaction_installments`** — parcelas de uma compra parcelada. Colunas mínimas: `id`, `user_id`, `parent_transaction_id uuid not null references transactions(id) on delete cascade` (a compra original), `card_id uuid references credit_cards(id)`, `statement_id uuid references card_statements(id)` (fatura onde a parcela caiu), `numero smallint not null` (1..N), `total_parcelas smallint not null` (N), `valor numeric(14,2) not null` (valor desta parcela), `data_competencia date` (mês de referência da parcela), `status` (`ativa` | `paga` | `cancelada`), `created_at`, `updated_at`. **Unicidade** por `(user_id, parent_transaction_id, numero)`. Índices em `(user_id, parent_transaction_id)`, `(user_id, statement_id)` e `(user_id, card_id, status)`.
- **Marcação da compra original em `transactions`:** adicionar (migration, aditivo) flags para identificar uma compra parcelada: `parcelado boolean default false`, `qtd_parcelas smallint null`, `valor_total numeric(14,2) null` (valor cheio da compra). Cada **parcela** vira/gera um registro em `transaction_installments` (e/ou um lançamento filho, conforme decisão abaixo) — manter o modelo consistente com a Fase 02/03.
- **Decisão a documentar:** representação das parcelas. Recomendado: a compra original em `transactions` guarda o **total** e os metadados de parcelamento; as N parcelas ficam em `transaction_installments`, cada uma com seu `statement_id`. A **fatura** soma as parcelas (`transaction_installments`) e não o total da compra, evitando contar o valor cheio numa única fatura. Documentar essa escolha no topo de `installments.ts` e no `LAST_PHASE_SUMMARY`.
- **Cálculo de parcelas — `src/lib/finance/installments.ts`:** função pura que recebe `valor_total` e `qtd_parcelas` e devolve o array de valores por parcela, com **ajuste de centavos na última** (a soma exata bate com o total). Detalhada em **Instruções técnicas**.
- **Distribuição nas faturas:** para cada parcela `i` (1..N), calcular a competência somando `i-1` meses à competência da 1ª parcela e resolver a fatura via `invoice.ts` (`get-or-create` da `card_statements`), gravando `statement_id` na parcela. **Reusar** a regra da Fase 03; **não** reimplementar.
- **Fluxo "Compra parcelada?" (UI):** no form de lançamento no cartão, opção "Essa compra é parcelada?". Se sim: informar **quantidade de parcelas** e **valor total**; o sistema calcula e mostra o **valor por parcela** (com a última ajustada) e um **preview das faturas** onde cada parcela cairá (ex.: "1/6 → fatura jul, 2/6 → ago…"). Permitir **ajuste manual de centavos** na última parcela.
- **Identificação visual:** exibir "Parcela 1/6, 2/6, …" nos lançamentos/faturas (Fase 03) e na aba de parcelamentos.
- **Aba de parcelamentos (`/parcelamentos`):** lista dos parcelamentos com nome/descrição da compra, valor total, qtd de parcelas, **parcelas pagas** x **futuras**, cartão, categoria, data da 1ª e da última parcela, **valor restante**, faturas futuras onde entrarão, **status** (ativo/finalizado/cancelado). Filtros por cartão/categoria/status. Abrir **detalhe** com todas as parcelas e seus estados/faturas.
- **Editar/cancelar com segurança:**
  - **Cancelar parcelas futuras:** marcar parcelas ainda não pagas como `cancelada` e removê-las das faturas **abertas** (não mexer em faturas **pagas/fechadas** já efetivadas). O parcelamento vira `cancelado` (ou `finalizado` se todas as restantes forem canceladas) sem apagar o histórico.
  - **Editar:** ajustes (ex.: recalcular valor por parcela das **futuras**) sem corromper parcelas já pagas. Sempre com confirmação.

## Fora do escopo
- **Gastos de terceiros / divisão** de uma compra parcelada (valor meu x de terceiros por parcela) — Fase 05.
- **Importação** de compras parceladas (mapear "parcela X de Y" de arquivos) — Fase 06.
- **Provisão consolidada das próximas 6 faturas** e gráficos de parcelas futuras no dashboard — Fase 07.
- Renegociação/antecipação de parcelas com recálculo de juros (não previsto no briefing).

## Instruções técnicas

### `src/lib/finance/installments.ts` (com testes)
Função pura e determinística. Sugestão de assinatura:

```ts
// Trabalhar em centavos para evitar erro de ponto flutuante.
function dividirParcelas(valorTotalCentavos: number, qtd: number): number[];
// Retorna array de tamanho `qtd`, soma === valorTotalCentavos.
```

Regras:
1. **Base por parcela:** `Math.floor(total / qtd)` (em centavos) para as `qtd - 1` primeiras.
2. **Última parcela recebe o resto:** `total - base * (qtd - 1)`, garantindo que a **soma exata** seja igual ao total (ajuste de centavos concentrado na última).
3. **Permitir override manual** do valor da última parcela na UI, desde que a soma continue igual ao total (validar no servidor).
4. **Converter** de/para `numeric(14,2)` usando os utilitários de `lib/format.ts` (centavos ↔ reais) de forma consistente com a Fase 02.
5. **Distribuição de datas:** competência da parcela `i` = competência da 1ª parcela + `(i-1)` meses; a fatura de cada uma sai de `invoice.ts` (Fase 03). Não duplicar a regra de fatura aqui.

### Testes unitários (Vitest) — obrigatórios
Criar `src/lib/finance/installments.test.ts` cobrindo, no mínimo:
- **Soma exata:** R$ 100,00 em 3 → [33,33 / 33,33 / 33,34] e a soma é exatamente 100,00.
- Valores que **não dividem** redondo (ex.: R$ 99,99 em 4; R$ 10,00 em 3) — resto na última.
- **1 parcela** (à vista parcelado em 1) e **N grande** (ex.: 12, 24).
- **Override** da última parcela mantendo a soma; rejeição quando a soma não fecha.
- **Distribuição em faturas** (teste de integração leve com `invoice.ts`): N parcelas geram N competências sequenciais corretas, inclusive **virada de ano**.

### Dados e integração
- **Criação atômica:** ao salvar uma compra parcelada, criar a compra original + as N parcelas + resolver/criar as N faturas **na mesma operação de servidor** (transação lógica), derivando `user_id` de `auth.uid()`. Em falha, não deixar parcelas órfãs.
- **Mutations** via Server Actions (Next 16) com validação **Zod** no servidor; revalidar parcelamentos, faturas e listas após salvar (`updateTag`/revalidate).
- **Reuso:** consumir `src/lib/finance/invoice.ts` (Fase 03) para a fatura de cada parcela; **não** reimplementar a regra.
- **Client tipado:** regenerar tipos do Supabase após a migration; hooks de query por entidade em `src/hooks` (parcelamentos, parcelas por compra).
- **UI:** reusar componentes (StatCard, PageHeader, EmptyState, tabela com filtros, dialogs, skeletons, toasts). Badge "i/N" reutilizável. pt-BR, BRL e datas brasileiras via `lib/format.ts`.
- **Estrutura:** seguir `PROJECT_ARCHITECTURE.md` (`lib/finance/`, `hooks/`, route group `(app)`).

## Cuidados
- **Precisão monetária:** calcular em **centavos**; a soma das parcelas **tem que** bater com o total (ajuste na última). Nunca perder/criar centavos.
- **Parcelas vinculadas à compra original:** manter `parent_transaction_id` íntegro; excluir a compra deve tratar as parcelas de forma consistente (cascade controlado + confirmação).
- **Cancelamento seguro:** **não** alterar parcelas/faturas já **pagas ou fechadas**; cancelar apenas **futuras** e atualizar o status do parcelamento sem apagar histórico.
- **Cada parcela na fatura certa:** usar `invoice.ts`; conferir bordas (dias 28–31, vencimento < fechamento, virada de ano) herdadas da Fase 03.
- **Não contar o total cheio** numa única fatura: a fatura soma as **parcelas**, não o `valor_total` da compra. Validar para não inflar uma fatura.
- **RLS obrigatória** em `transaction_installments` e nas novas colunas de `transactions`.
- **Não quebrar** Fases 01–03 (layout, tema, auth, CRUD, regra de fatura e seus testes).
- Migrations **idempotentes**, versionadas e **aditivas**; sem mudanças destrutivas em `transactions`/`card_statements`.

## Critérios de aceite
- [ ] Marcar compra como parcelada (qtd + valor total) gera **todas as parcelas** vinculadas à compra original.
- [ ] `src/lib/finance/installments.ts` com **testes passando**: soma das parcelas = total, com ajuste de centavos na última.
- [ ] **Cada parcela cai na fatura correta** (reusa `invoice.ts`), inclusive na virada de ano.
- [ ] Identificação **"1/6, 2/6, …"** visível nos lançamentos/faturas e na aba de parcelamentos.
- [ ] Aba `/parcelamentos`: ativos/finalizados/cancelados, valor restante, parcelas pagas x futuras, faturas futuras; filtros por cartão/categoria/status; detalhe com todas as parcelas.
- [ ] **Cancelar parcelas futuras** sem corromper histórico nem faturas já pagas/fechadas.
- [ ] Preview das faturas e do valor por parcela **antes de salvar**; ajuste manual de centavos na última.
- [ ] Empty states, skeletons, toasts e confirmação ao excluir/cancelar.
- [ ] `npm run build` passa.

## Ao finalizar
O agente deve atualizar:
- `docs/project/CURRENT_STATUS.md` (Fase 04 concluída; próxima = Fase 05; caminho do arquivo).
- `docs/handoff/LAST_PHASE_SUMMARY.md` (resumo, arquivos criados/alterados, migration de `transaction_installments` e colunas em `transactions`, `installments.ts` + testes, decisão de modelagem das parcelas, pendências).
- `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md` (apontando para `docs/phases/PHASE_05_SHARED_EXPENSES.md`).
