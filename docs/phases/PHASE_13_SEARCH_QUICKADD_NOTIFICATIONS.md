# Fase 13 — Busca Global, Lançamento Rápido & Notificações

## Contexto
Os módulos de domínio e o dashboard geral já existem (Fases 02–12). Agora entram as três funcionalidades **transversais** que amarram o sistema e fazem o uso diário ser rápido: a **busca global** (achar qualquer coisa em todos os módulos), o **lançamento rápido** (criar despesa/receita/tarefa/evento/etc. em segundos) e as **notificações** (sino + alertas inteligentes gerados por checagens agendadas). A Fase 01 já deixou no header os **placeholders** de busca, lançamento rápido e sino — esta fase os torna **funcionais**. É também a fase que cria a tabela `notifications` e liga o **Vercel Cron** para gerar alertas.

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
Entregar **busca global** em todos os módulos (resultados agrupados por tipo, abrindo o item), um **modal de lançamento rápido** que cria registros nos modelos corretos em poucos segundos, e uma **central de notificações** (sino + página) alimentada por **geração automática de alertas** via Vercel Cron — cada notificação com título, descrição, tipo, prioridade, data, status lida/não lida, link e ação de resolver.

## Escopo da fase
- **Schema + migration (Supabase, `supabase/migrations/`):** tabela **`notifications`** com:
  - `id uuid primary key default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`.
  - `title text not null`, `description text`, `type text not null` (ex.: `invoice_due`, `invoice_overdue`, `bill_overdue`, `receivable_pending`, `task_overdue`, `event_upcoming`, `habit_pending`, `water_goal`, `study_overdue`, `card_limit`, `high_spending`), `priority text not null` (`low`/`medium`/`high`/`urgent`).
  - `link text` (rota interna para abrir o item), `entity_type text` / `entity_id uuid` (referência genérica à origem), `is_read boolean not null default false`, `is_resolved boolean not null default false`, `resolved_at timestamptz`, `notify_at timestamptz not null default now()`.
  - `dedupe_key text` **único por usuário** (índice único parcial em `(user_id, dedupe_key)`) para o Cron **não** recriar a mesma notificação.
  - `created_at`/`updated_at` (trigger de `updated_at`); **RLS** habilitada (`user_id = auth.uid()` em `using` e `with check`); índices em `user_id`, `is_read`, `type`, `notify_at`. Migration **idempotente**.
- **Busca global (`/busca` + comando no header):**
  - Buscar em **todos** os módulos: transações, faturas, cartões, pessoas, contas, tarefas, rotinas, hábitos, estudos (cursos), eventos da agenda e notificações.
  - **Resultados agrupados por tipo**, com ícone por tipo, trecho/descrição e ação de **abrir o item** (deep-link para a rota correta).
  - Rápida e **debounced**; atalho de teclado (ex.: `Ctrl/Cmd+K`) abrindo um command palette (shadcn `command`); empty state e skeleton de resultados.
  - Busca executada no **servidor** respeitando RLS (cada `select` filtra por `auth.uid()` via policy); nada de varrer dados de outro usuário.
- **Lançamento rápido (modal a partir do botão do header / FAB):**
  - Tipos: **despesa, receita, gasto no cartão, gasto à vista, transferência, tarefa rápida, evento rápido, hábito (check-in), sessão de estudo**.
  - Cada tipo abre o formulário mínimo necessário (RHF + Zod) e **persiste no mesmo modelo** das fases originais (reutilizar Server Actions/validações já existentes — ex.: transação cai na **fatura correta** pela regra da Fase 03; parcelamento pela Fase 04; pessoal x terceiro pela Fase 05).
  - Foco em **velocidade**: defaults inteligentes (data = hoje, conta/cartão padrão), poucos campos, salvar em segundos, toast de sucesso e fechar.
  - **Não** reimplementar regra de negócio: o quick-add é um **atalho de entrada** para os mesmos fluxos.
- **Central de notificações (sino + `/notificacoes`):**
  - **Sino** no header com **badge de não lidas**; popover com as últimas notificações.
  - Página `/notificacoes` com lista filtrável (por tipo/prioridade/status), **marcar como lida**, **marcar todas como lidas**, **resolver** (quando aplicável) e **abrir o item** pelo `link`.
  - Cada item exibe título, descrição, tipo, **prioridade** (cor/badge), data/hora (pt-BR), status e ação.
- **Geração de alertas (Vercel Cron):**
  - Rota protegida (ex.: `app/api/cron/notifications/route.ts`) acionada por **Vercel Cron** (`vercel.json` com `crons`), executando as checagens e fazendo **upsert** em `notifications` por `dedupe_key` (sem duplicar).
  - Regras de alerta: **fatura próxima/vencida**, **conta (bill) próxima/atrasada**, **terceiro que precisa me pagar (receivable pendente)**, **tarefa atrasada/do dia**, **evento próximo**, **hábito pendente**, **meta de água incompleta**, **estudo planejado não realizado**, **limite de cartão** (uso alto), **gasto alto** no período.
  - Cada regra define `type`, `priority`, `title`, `description`, `link` e `dedupe_key` determinístico (ex.: `invoice_due:<card_statement_id>`). Idempotente: rodar o Cron N vezes não gera N notificações.

## Fora do escopo
- Alterar regras financeiras das Fases 02–07 (o quick-add **reusa** os fluxos existentes).
- Push/e-mail/web-push externos: nesta fase as notificações são **in-app** (sino + página). Canais externos ficam como evolução futura (modo manutenção, Fase 14+).
- Relatórios consolidados, configurações finais e revisão de segurança ampla (Fase 14).

## Instruções técnicas
- **Next 16:** rota de Cron como Route Handler em `app/api/cron/notifications/route.ts`; proteger com segredo (`CRON_SECRET` no header `Authorization`, validado no servidor) e configurar agenda em `vercel.json` (`crons`). Runtime **nodejs**.
- **Service vs RLS:** o Cron roda no servidor por usuário autenticado quando possível; se precisar varrer dados para gerar alertas, manter o filtro por `user_id` explícito. **Nunca** expor `service_role` no client; chaves sensíveis só no servidor.
- **Mutations** (marcar lida/resolver, quick-add) via **Server Actions** com validação **Zod**; revalidar/`updateTag` para o badge do sino e listas atualizarem (read-your-writes).
- **Busca:** preferir `ilike`/full-text no Postgres por entidade, em paralelo (`Promise.all`), retornando um shape unificado `{ type, id, title, subtitle, link }`; agrupar por `type` no servidor. Debounce e cancelamento no client (TanStack Query + AbortController).
- **Datas/moeda:** `lib/format.ts` (BRL, `date-fns/ptBR`) em toda a UI. Janelas "próximo/atrasado" centralizadas (ex.: fatura vence em ≤ X dias).
- **Componentes:** reutilizar shadcn `command` (busca), `dialog`/`sheet` (quick-add), `popover`/`badge` (sino), `EmptyState`/skeletons. Ligar nos **placeholders** já existentes no `Header` da Fase 01.
- **Testes (Vitest):** testar a **lógica de geração de alertas** (cada regra dispara quando deve) e a **idempotência por `dedupe_key`** (rodar duas vezes não duplica).

## Cuidados
- **RLS obrigatória** em `notifications`; nenhuma notificação sem policy. Garantir que a busca **nunca** retorne dados que não sejam do usuário.
- **Idempotência do Cron** é crítica: sem `dedupe_key` correto, o sino vira spam. Testar.
- Proteger a rota de Cron (segredo); não deixar endpoint público gerando carga/alertas.
- Quick-add **não pode** divergir das regras das fases originais (fatura correta, parcelas, pessoal x terceiro). Reusar, não recriar.
- Não logar dados financeiros sensíveis nas notificações/descrições nem nos logs do Cron.
- Manter **dark/light** e **responsividade** (sino, command palette e modal precisam funcionar bem no mobile). Não quebrar o dashboard nem os módulos anteriores.

## Critérios de aceite
- [ ] **Busca global** cobre transações, faturas, cartões, pessoas, contas, tarefas, rotinas, hábitos, estudos, eventos e notificações; resultados **agrupados por tipo** e **abrem o item**.
- [ ] Atalho de teclado abre a busca; há **skeleton** e **empty state**; tudo respeitando RLS.
- [ ] **Lançamento rápido** cria despesa/receita/cartão/à vista/transferência/tarefa/evento/hábito-checkin/sessão de estudo nos **modelos corretos**, em segundos, com toast.
- [ ] Tabela **`notifications`** criada com **RLS**, índices e `dedupe_key` único por usuário.
- [ ] **Sino** com badge de não lidas + página `/notificacoes` com filtros, marcar lida/todas, **resolver** e abrir pelo link.
- [ ] **Vercel Cron** gera os alertas (fatura, conta, terceiros, tarefa, evento, hábito, água, estudo, limite de cartão, gasto alto) de forma **idempotente** (`dedupe_key`).
- [ ] Testes de geração de alertas e de idempotência passam (Vitest).
- [ ] `npm run build` passa.

## Ao finalizar
O agente deve atualizar:
- `docs/project/CURRENT_STATUS.md` (Fase 13 concluída; próxima = Fase 14).
- `docs/handoff/LAST_PHASE_SUMMARY.md` (resumo, arquivos criados/alterados, migration de `notifications`, rota de Cron + `vercel.json`, regras de alerta, busca, quick-add, testes, pendências).
- `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md` (apontando para `docs/phases/PHASE_14_POLISH_SECURITY.md`).
