# Fase 06 — Importação de Faturas & Extratos

## Contexto
Com o financeiro manual (Fase 02), cartões e faturas (Fase 03), parcelamentos (Fase 04) e terceiros (Fase 05) prontos, esta fase entrega a **importação de faturas e extratos** (Excel, CSV e OFX). O ponto inegociável: **um lançamento importado é idêntico a um lançamento manual** — mesmo modelo de dados, mesmas opções e mesma edição completa. A importação é apenas uma forma mais rápida de criar transações; nada do que entra por aqui pode ser "de segunda classe". A fase também resolve o risco número um de qualquer importação financeira: **duplicar lançamentos**.

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
Permitir importar arquivos de cartão de crédito e conta corrente (Excel/CSV/OFX), mapear colunas, pré-visualizar, sugerir categoria pela descrição, **detectar duplicados** e revisar antes e depois de importar — gerando lançamentos com **exatamente as mesmas funcionalidades** do lançamento manual (categoria, subcategoria, tags, cartão, conta, parcelamento, fatura, terceiros, divisão, status e edição completa).

## Escopo da fase
- **Schema + migrations (Supabase, `supabase/migrations/`):**
  - **`import_batches`** — um lote por arquivo enviado: `user_id`, nome do arquivo, formato (`excel`/`csv`/`ofx`), origem (`cartao`/`conta`), `credit_card_id`/`account_id` alvo (quando aplicável), status do lote (`pendente`/`mapeando`/`revisando`/`importado`/`cancelado`), totais (linhas detectadas, importadas, ignoradas, duplicadas), mapeamento de colunas salvo (jsonb), `created_at`/`updated_at`.
  - **`import_rows`** — uma linha por registro do arquivo: `user_id`, `import_batch_id` (fk), índice/linha original, dados crus (jsonb), campos normalizados (data, descrição, valor, categoria sugerida, cartão/conta, parcela, nº de parcelas, identificador), status da linha (`pendente`/`para_importar`/`duplicada`/`ignorada`/`importada`/`erro`), `transaction_id` gerado (fk para `transactions`, quando importada), motivo de erro/duplicidade.
  - Ambas com `user_id uuid not null references auth.users(id) on delete cascade` e **RLS** (`for all using (user_id = auth.uid()) with check (user_id = auth.uid())`), índices em `user_id`, `import_batch_id` e `status`, trigger `updated_at`.
- **Upload:** componente de upload (drag-and-drop + seleção) aceitando **.xlsx/.xls, .csv e .ofx**; validação de tipo/tamanho; seleção da origem (cartão x conta) e do cartão/conta alvo.
- **Parsing:** parser por formato — Excel/CSV (ex.: `xlsx`/`papaparse`) e OFX (parser dedicado de transações). Detectar separador, encoding e cabeçalho; normalizar valores monetários (vírgula/ponto, sinais) e datas para o padrão do projeto.
- **Identificar e mapear colunas:** detecção automática das colunas com mapeamento editável pelo usuário — **data, descrição, valor, categoria, cartão/conta, parcela, nº de parcelas, identificador**. Mapeamento salvo no `import_batch` para reutilização.
- **Pré-visualização:** tabela (TanStack Table) com as linhas normalizadas, contadores (total, válidas, duplicadas, com erro) e destaque visual por status antes de confirmar.
- **Sugestão de categoria pela descrição:** heurística por palavras-chave/regras sobre a descrição, reaproveitando as categorias do usuário (seed da Fase 02). Sugestão sempre editável; nunca aplicada silenciosamente sem revisão.
- **Detecção de duplicados (crítico):** comparar cada linha com transações já existentes e com o próprio lote, por chave composta (data + valor + descrição normalizada + cartão/conta e, quando houver, identificador do extrato). Marcar como `duplicada`, explicar o motivo e **não importar** por padrão; permitir ao usuário forçar a importação caso confirme que não é duplicata. Reaproveitar a regra de "não duplicar transações importadas" das regras financeiras críticas.
- **Revisar antes e depois:** revisão **antes** de importar (ajustar mapeamento, categoria, cartão/conta, status, ignorar linhas) e revisão **depois** (lote importado mostra o que entrou, o que foi ignorado/duplicado e links para cada transação criada).
- **Importado = mesmo modelo do manual:** cada linha aprovada gera um registro em `transactions` com **todas** as opções do lançamento manual: categoria, subcategoria, tags, cartão, conta, parcelamento (qtd e parcelas distribuídas pela regra de fatura da Fase 03/04), fatura vinculada, marcação pessoal/terceiro/compartilhada e divisão (Fase 05), status e **edição completa** posterior. Compras parceladas detectadas (parcela / nº de parcelas) usam o mesmo motor de parcelamento — não uma cópia paralela.
- **UI:** fluxo em etapas (upload → mapear → pré-visualizar/revisar → importar → resultado), empty states, skeletons, toasts e confirmação antes de importar/cancelar lote. Reusar componentes das fases anteriores.

## Fora do escopo
- Dashboard financeiro e gráficos (Fase 07).
- Conciliação bancária automática avançada (matching por saldo/OFX `FITID` além da detecção de duplicados aqui prevista) e importação agendada.
- Qualquer módulo não financeiro (agenda, tarefas, hábitos, estudos).
- Criação de novas regras de fatura/parcelamento/terceiros — esta fase **consome** as regras já implementadas nas Fases 03–05.

## Instruções técnicas
- **Parsing no servidor** (Server Actions / route handlers do Next 16): o arquivo é processado no servidor; o `user_id` vem sempre de `auth.uid()` — **nunca** confiar em `user_id` do client. `cookies()`/`headers()` são **async** (use `await`).
- Persistir o lote (`import_batches`) e as linhas (`import_rows`) **antes** da criação das transações, para que a revisão seja editável e auditável; a importação final converte linhas `para_importar` em `transactions` em uma operação consistente (idealmente transacional/RPC), gravando `transaction_id` na linha.
- Reaproveitar `lib/finance/invoice.ts` (regra de fatura) e o motor de parcelamento (`installments.ts`) para linhas parceladas; reaproveitar a marcação de terceiros/divisão (Fase 05). Não duplicar lógica financeira.
- Normalização centralizada de valores e datas em `lib/format.ts` / utilitários de importação; manter **BRL** e formato de data brasileiro em toda a UI.
- Detecção de duplicados em `src/lib/finance/` (ou `src/lib/import/`) com **testes unitários** (Vitest) cobrindo: mesma compra repetida, valores com sinais/formatos diferentes, descrições com espaços/acentos, e linhas parceladas. Sugestão de categoria também coberta por testes.
- UI de tabela com TanStack Table; mutations com validação Zod no servidor; revalidar dados após importar.

## Cuidados
- **RLS obrigatória** em `import_batches` e `import_rows` — nenhuma linha de import acessível por outro usuário.
- **Nunca duplicar lançamentos:** a detecção de duplicados é o coração desta fase; por padrão, duplicata não entra. Forçar importação exige ação explícita do usuário.
- Lançamento importado **não pode** ter menos recursos que o manual — mesma tabela `transactions`, mesmas opções, mesma edição. Nada de modelo paralelo.
- Não corromper faturas/parcelamentos/terceiros existentes ao importar (cada parcela na fatura correta; valores de terceiros não distorcem o gasto pessoal real).
- Cancelar um lote **não** deve apagar transações já efetivamente importadas e editadas pelo usuário — deixar claro o estado do lote.
- Tratar arquivos malformados, colunas ausentes, encoding e datas inválidas com mensagens claras (linha em `erro`, nunca quebra silenciosa). Não logar dados financeiros sensíveis.
- Não quebrar as Fases 01–05 (layout, tema, rotas, auth, financeiro, cartões, faturas, parcelas, terceiros).

## Critérios de aceite
- [ ] Importar arquivos **Excel, CSV e OFX** (cartão e conta).
- [ ] Identificar e **mapear colunas** (data, descrição, valor, categoria, cartão/conta, parcela, nº de parcelas, identificador), com pré-visualização.
- [ ] **Sugestão de categoria** pela descrição, sempre editável.
- [ ] **Detecção de duplicados** funcionando: duplicatas marcadas e não importadas por padrão; possível forçar com confirmação.
- [ ] Revisão **antes** e **depois** de importar (ajustar/ignorar linhas; ver resultado com links para as transações).
- [ ] Lançamento importado = **mesmas opções do manual** (categoria, subcategoria, tags, cartão, conta, parcelamento, fatura, terceiros, divisão, status, edição completa).
- [ ] Parcelas importadas caem na **fatura correta** (regra das Fases 03/04); terceiros não distorcem o gasto pessoal (Fase 05).
- [ ] RLS em `import_batches` e `import_rows`; testes de duplicados e de sugestão de categoria passam.
- [ ] Empty states, skeletons, toasts e confirmação antes de importar/cancelar.
- [ ] `npm run build` passa.

## Ao finalizar
O agente deve atualizar:
- `docs/project/CURRENT_STATUS.md`
- `docs/handoff/LAST_PHASE_SUMMARY.md`
- `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md` (apontando para `docs/phases/PHASE_07_FINANCIAL_DASHBOARD.md`)
