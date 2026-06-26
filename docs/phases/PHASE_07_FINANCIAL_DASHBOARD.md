# Fase 07 — Dashboard Financeiro

## Contexto
Todo o núcleo financeiro está pronto: lançamentos à vista (Fase 02), cartões e faturas (Fase 03), parcelamentos (Fase 04), terceiros e divisão (Fase 05) e importação (Fase 06). Esta fase **fecha o bloco financeiro** com o entregável mais visível do briefing: um **dashboard financeiro rico, bonito e útil**. É aqui que o sistema responde, de relance, à pergunta central do usuário: *"quanto eu realmente gastei e quanto vou receber de volta?"* — diferenciando sempre **total movimentado** de **valor realmente meu**. Não cria tabelas de negócio novas: consome e **agrega** os dados das fases anteriores (consultas/agregações e, se útil, views).

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
Entregar um dashboard financeiro completo, premium e responsivo, com cards de resumo, gráficos úteis (não decorativos), **provisão das próximas 6 faturas** e alertas — sempre deixando claro a diferença entre **total movimentado** e **valor realmente meu**, e quanto há **a receber de terceiros**.

## Escopo da fase
- **Sem novas tabelas de negócio.** Camada de **agregação** sobre os dados existentes (`transactions`, `credit_cards`, `card_statements`, `transaction_installments`, `accounts`, `bills`, `recurring_transactions`, `people`, `shared_expenses`, `receivables`). Usar consultas agregadas e, onde fizer sentido, **views SQL** (com `security_invoker` para respeitar a RLS por `user_id`). Persistir apenas, se necessário, preferências do dashboard (período padrão), sem entidades financeiras novas.
- **Cards de resumo (StatCards):**
  - **Saldo atual** (soma das contas).
  - **Entradas e saídas do mês.**
  - **Gasto no cartão x gasto à vista.**
  - **Próximas contas a pagar** e **próximos recebimentos.**
  - **Faturas abertas e fechadas.**
  - **Valor pessoal x valor de terceiros** — o card-âncora da fase: total da fatura/mês, **quanto é realmente meu** e **quanto é de terceiros**.
  - **A receber de terceiros** (total pendente que outras pessoas precisam me pagar).
- **Gráficos (recharts):**
  - **Por categoria** (distribuição dos gastos).
  - **Por forma de pagamento** (cartão, débito, pix, dinheiro, boleto...).
  - **Mês x mês** (comparativo do mês atual com o anterior).
  - **Evolução mensal** (série histórica de entradas/saídas/saldo).
  - **Projeção dos próximos meses** (com base em parcelas futuras, recorrências e contas fixas).
- **Próximas 6 faturas:** provisão por cartão das **próximas 6 faturas**, mostrando total da fatura, **valor que realmente será meu** e **valor que terceiros precisam me pagar** — reaproveitando a regra de fatura (Fase 03), parcelas (Fase 04) e terceiros (Fase 05).
- **Alertas:** **gasto alto** (acima de um limiar/média), **limite do cartão** (proximidade do limite) e **vencimento** (fatura/conta próxima ou atrasada). Exibidos no dashboard de forma clara e acionável.
- **Diferenciação total movimentado x valor meu:** todo número que envolva terceiros deve deixar explícito o **total movimentado** e o **valor realmente meu** — nunca somar o que é de terceiros ao gasto pessoal real.
- **Filtros e período:** filtro por período (mês/intervalo) e por cartão/conta quando aplicável; visão coerente entre cards e gráficos.
- **UI:** layout de dashboard premium (cards + gráficos), empty states (quando não há dados no período), skeletons de carregamento e responsividade real. Reusar `StatCard`, componentes shadcn e utilitários das fases anteriores.

## Fora do escopo
- Criação/edição de lançamentos, cartões, faturas, parcelas, terceiros ou importação — esta fase **só lê e agrega**.
- Dashboard geral (multi-módulos) — isso é a Fase 12.
- Relatórios exportáveis avançados e qualquer módulo não financeiro (agenda, tarefas, hábitos, estudos).
- Notificações persistidas/sino com geração de alertas (Fase 13) — aqui os alertas são exibidos a partir das agregações do próprio dashboard.

## Instruções técnicas
- **Leitura em Server Components** sempre que possível; agregações no servidor com Supabase respeitando **RLS** (`user_id = auth.uid()`). `cookies()` é **async** (use `await`) no client de servidor; Next 16 usa `proxy.ts`.
- Centralizar os cálculos do dashboard em `src/lib/finance/` (ex.: `dashboard.ts`) reutilizando `invoice.ts` (fatura), o motor de parcelamento e a lógica de terceiros/divisão — **uma única fonte de verdade** para "valor meu x total movimentado". Cobrir com **testes unitários** (Vitest): separação meu/terceiros, próximas 6 faturas, projeção com parcelas/recorrências e comparativo mês x mês.
- Views SQL (se usadas) com `security_invoker = true` e migrations idempotentes em `supabase/migrations/`; nenhuma view pode contornar a RLS.
- Gráficos com **recharts**; cores coerentes com o design system (preto/branco/dourado) e legíveis em **dark e light**; formatação **BRL** e datas em formato brasileiro em todos os eixos/tooltips.
- Performance: evitar N+1 — buscar dados agregados em poucas consultas; usar TanStack Query no client onde houver interatividade (troca de período).

## Cuidados
- **Nunca** distorcer o gasto pessoal real com valores de terceiros — o dashboard **diferencia total movimentado de valor realmente meu** em todo card/gráfico relevante.
- **Próximas 6 faturas** devem bater exatamente com a regra de fatura e com as parcelas/recorrências já lançadas (sem recálculo divergente do que existe nas Fases 03/04).
- Manter **dark e light** e **responsividade** em todos os cards e gráficos (testar mobile; gráficos não podem "estourar" o layout).
- Empty states quando o período não tem dados; skeletons no carregamento; sem números quebrados/`NaN` em meses vazios.
- Alertas devem refletir os dados reais (limiar de gasto alto e limite de cartão configuráveis/derivados de forma consistente), sem alarme falso.
- Não logar dados financeiros sensíveis. Não quebrar as Fases 01–06.

## Critérios de aceite
- [ ] Cards de resumo: saldo, entradas/saídas, cartão x à vista, próximas contas/recebimentos, faturas abertas/fechadas, **valor pessoal x terceiros**, a receber.
- [ ] Gráficos: por categoria, por forma de pagamento, mês x mês, evolução mensal e projeção — refletindo os dados reais.
- [ ] **Próximas 6 faturas** corretas (total, valor meu, valor de terceiros) por cartão.
- [ ] Alertas de **gasto alto**, **limite do cartão** e **vencimento** exibidos corretamente.
- [ ] Dashboard **diferencia total movimentado x valor realmente meu** em todos os pontos relevantes.
- [ ] Filtro por período funcionando; cards e gráficos coerentes entre si.
- [ ] Dark/light e responsividade preservados; empty states e skeletons presentes.
- [ ] Testes (separação meu/terceiros, próximas 6 faturas, projeção, comparativo) passam.
- [ ] `npm run build` passa.

## Ao finalizar
O agente deve atualizar:
- `docs/project/CURRENT_STATUS.md`
- `docs/handoff/LAST_PHASE_SUMMARY.md`
- `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md` (apontando para `docs/phases/PHASE_08_CALENDAR.md`)
