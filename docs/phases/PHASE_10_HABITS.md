# Fase 10 — Hábitos

## Contexto
Com tarefas e rotinas funcionando (Fase 09), esta fase entrega o módulo de **Hábitos** — o acompanhamento daquilo que se repete e se mede no dia a dia: leitura, exercícios, água, sono, caminhada, alimentação e qualquer hábito customizado. É um módulo fortemente **visual e motivacional** (check-in rápido, **streaks**, gráficos de consistência, ranking) e complementa as rotinas: enquanto a rotina é uma checklist do dia, o hábito tem **meta, unidade e histórico mensurável** ao longo do tempo. Alimentará o Dashboard Geral (Fase 12) e gerará alertas na Fase 13.

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
Permitir cadastrar hábitos (com frequência, meta, unidade, horário ideal, cor/ícone), ver os hábitos do dia, fazer **check-in rápido** (incluindo botões rápidos para água e leitura), acompanhar **streaks** e histórico, visualizar gráficos de consistência e ranking dos mais consistentes, e receber a base de alertas de hábitos esquecidos — tudo com RLS, em pt-BR e formato brasileiro.

## Escopo da fase
- **Schema + migrations (Supabase, `supabase/migrations/`):** todas com `user_id uuid not null references auth.users(id) on delete cascade`, **RLS habilitada** (`user_id = auth.uid()` em `using` e `with check`), índices em `user_id` e nas colunas de filtro, trigger `updated_at`.
  - **`habits`** (cadastro do hábito): `name`, `category` (ex.: `leitura | exercicios | agua | sono | alimentacao | caminhada | outro`), `frequency` (enum `diaria | semanal | dias_especificos`), `weekdays` (int[] 0–6, quando aplicável), `target_value` (numeric, meta — ex.: 8 copos, 30 min, 10 páginas), `unit` (enum/texto: `vezes | minutos | horas | litros | ml | paginas | passos | km`), `time_of_day` (horário ideal, nullable), `reminder_at` (nullable), `color`, `icon`, `is_active`, `position`. Índice em `(user_id, is_active)`.
  - **`habit_logs`** (registro/check-in por dia): `habit_id` (fk → `habits` on delete cascade), `log_date` (date), `value` (numeric — quanto foi feito; para hábitos booleanos, 1/0 ou `value = target_value`), `is_done` (atingiu a meta?), `notes`. **Único** por `(user_id, habit_id, log_date)`; índices em `(user_id, log_date)` e `(user_id, habit_id)`.
- **Cadastro de hábitos:** CRUD; frequência (diária, semanal, dias específicos), meta + unidade, horário ideal e lembrete, cor/ícone, ativar/desativar, reordenar (`position`). Seed opcional com hábitos comuns (Beber água, Ler, Exercícios, Dormir bem) que o usuário pode editar/excluir.
- **Hábitos do dia:** lista dos hábitos cujo `frequency`/`weekdays` cai no dia atual, mostrando progresso (feito x meta) e estado (pendente/parcial/concluído).
- **Check-in rápido:** marcar/registrar o hábito do dia em poucos cliques — incrementar valor, marcar como feito, ou registrar valor exato; grava/atualiza `habit_logs` respeitando a unicidade diária. Desfazer check-in.
- **Água (especializado):** meta diária em copos/litros, **botão rápido** ("+1 copo" / "+250 ml"), conversão copo↔ml documentada, **progresso visual** (barra/anel até a meta), histórico do dia e da semana.
- **Leitura (especializado):** livro atual, registrar páginas e/ou tempo lido no dia, meta diária/semanal, progresso e histórico; observações por sessão.
- **Exercícios (especializado):** tipo de exercício, registrar tempo/feito, frequência da semana, histórico.
- **Streaks:** cálculo de **sequência atual** e **melhor sequência** por hábito (dias consecutivos atingindo a meta, respeitando a frequência configurada — um hábito de "dias específicos" não quebra streak em dias fora da regra). Exibir o streak com destaque (dourado) no card do hábito.
- **Histórico e consistência:** histórico por hábito (calendário/heatmap de dias feitos); **gráfico de consistência** (taxa de conclusão semanal/mensal, recharts); **taxa de conclusão** geral.
- **Ranking:** ranking dos hábitos **mais consistentes** (maior taxa de conclusão / maior streak) no período.
- **Alertas de hábitos esquecidos:** identificar hábitos do dia ainda **não feitos** após o horário ideal (base de dados/consulta pronta para a Fase 13 gerar a notificação). Nesta fase, exibir destaque na UI ("pendentes de hoje"); o disparo agendado fica para a Fase 13.
- **UI:** cards de hábito com progresso e streak, botões rápidos, anel/barra de progresso, heatmap/calendário, gráficos (recharts), badges de status, empty states, skeletons, toasts, confirmação ao excluir. Reusar componentes das Fases 01–02.

## Fora do escopo
- **Estudos** (Fase 11) — embora "leitura" e "estudo" se relacionem, o módulo de cursos/sessões é da próxima fase.
- **Dashboard Geral** (Fase 12) e **notificações/alertas disparados** (Fase 13, Vercel Cron) — aqui apenas deixar dados/consultas prontos.
- Integrações externas (wearables, apps de saúde) e sincronização automática de passos/sono por dispositivo.

## Instruções técnicas
- Centralizar o cálculo de **streak** e **taxa de consistência** em `src/lib/habits/streak.ts` (puro, sem I/O), com **testes unitários** cobrindo: dias consecutivos, lacunas, hábitos de frequência semanal/dias específicos, virada de mês e fuso local pt-BR. Tratar "hoje ainda não feito" sem quebrar o streak antes do fim do dia.
- Modelar a **unidade** de forma que água/leitura/exercícios sejam casos do modelo genérico (`target_value` + `unit`), evitando tabelas separadas; telas especializadas são *views* sobre `habits`/`habit_logs` filtrando por categoria.
- Documentar a conversão de água (ex.: 1 copo = 250 ml) em constante reutilizável; respeitar a unidade escolhida pelo usuário ao exibir.
- Helpers de query (TanStack Query) por entidade em `src/hooks` (`useHabits`, `useHabitLogs`, `useTodayHabits`), com invalidação seletiva após check-in (atualizar card + streak imediatamente, optimistic update seguro).
- Mutations via **Server Actions** (Next 16) com Zod no servidor; nunca confiar em `user_id` do client (`auth.uid()`). Garantir idempotência do check-in diário (upsert por `(user_id, habit_id, log_date)`).
- Gráficos com **recharts**; cores no padrão preto/branco/dourado, legíveis em dark e light.
- Datas sempre locais (pt-BR) para o `log_date` não "virar o dia" por UTC.
- Seguir estrutura de pastas e padrões de `PROJECT_ARCHITECTURE.md`; rota `/habitos`, código em inglês.

## Cuidados
- **RLS obrigatória** em `habits` e `habit_logs` — nenhuma sem policy `user_id = auth.uid()`.
- **Unicidade diária** em `habit_logs` (`user_id, habit_id, log_date`) para o check-in não duplicar; check-in deve ser **upsert**, não insert cego.
- Streaks são fáceis de errar: validar com testes antes de finalizar (especialmente frequência semanal/dias específicos e o "ainda dá tempo hoje").
- Não quebrar as Fases 01–09 (layout, tema, rotas, auth, financeiro, agenda, tarefas/rotinas).
- Migrations **idempotentes** e versionadas.
- Manter estados de UI obrigatórios (loading/empty/erro/sucesso), dark/light, responsividade (botões rápidos confortáveis no mobile) e confirmação ao excluir hábito.

## Critérios de aceite
- [ ] CRUD de hábitos com frequência, meta, unidade, horário, cor/ícone, funcionando com RLS.
- [ ] Hábitos do dia + check-in rápido (upsert) com progresso feito x meta; desfazer check-in.
- [ ] Água (copos/litros, botão rápido, progresso visual), leitura (páginas/tempo/livro atual) e exercícios funcionando.
- [ ] Streaks (atual e melhor) corretos por hábito, com testes em `lib/habits/streak.ts` passando.
- [ ] Histórico, gráfico de consistência, taxa de conclusão e ranking dos mais consistentes exibidos.
- [ ] Base de alertas de hábitos esquecidos (consulta/destaque "pendentes de hoje") pronta para a Fase 13.
- [ ] Estados de UI, dark/light e responsividade; confirmação ao excluir.
- [ ] `npm run build` passa.

## Ao finalizar
O agente deve atualizar:
- `docs/project/CURRENT_STATUS.md`
- `docs/handoff/LAST_PHASE_SUMMARY.md`
- `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md` (apontando para `docs/phases/PHASE_11_STUDIES.md`)
