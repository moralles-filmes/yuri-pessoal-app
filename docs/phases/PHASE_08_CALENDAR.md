# Fase 08 — Agenda & Google Agenda

## Contexto
Concluído todo o bloco financeiro (Fases 02–07), o sistema entra na camada de **produtividade**. Esta fase entrega a **Agenda** integrada ao **Google Agenda**: conectar a conta Google, listar/criar/editar/excluir e **sincronizar** eventos, com visões dia/semana/mês, lembretes, vínculo com tarefas e os próximos compromissos no dashboard. É a primeira integração externa do projeto, então o cuidado central é de **segurança dos tokens OAuth** — guardados apenas no servidor, nunca no frontend.

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
Permitir conectar a conta Google, gerenciar eventos (listar/criar/editar/excluir) com **sincronização** com o Google Agenda, em visões dia/semana/mês, com lembretes, cores por tipo, vínculo com tarefas e exibição dos próximos compromissos no dashboard — com os tokens OAuth armazenados **com segurança no servidor**.

## Escopo da fase
- **Schema + migrations (Supabase, `supabase/migrations/`):**
  - **`calendar_events`** — `user_id`, título, descrição, início/fim (`timestamptz`), dia inteiro (bool), local, **tipo** (pessoal/trabalho/estudos/exercícios/rotina), **cor** (derivada do tipo, personalizável), recorrência (quando aplicável), lembretes (minutos antes / config), `task_id` opcional (fk para `tasks`, vínculo com tarefas — quando a Fase 09 existir; deixar a coluna preparada), campos de sincronização Google (`google_event_id`, `google_calendar_id`, `etag`, `synced_at`, origem `local`/`google`), `created_at`/`updated_at`.
  - **Armazenamento seguro dos tokens OAuth** (ex.: tabela `google_integrations`/`settings` restrita): `user_id`, `access_token`, `refresh_token`, `expiry`, `scope`. **Apenas servidor** — nunca exposto ao client.
  - Todas com `user_id uuid not null references auth.users(id) on delete cascade` e **RLS** (`for all using (user_id = auth.uid()) with check (user_id = auth.uid())`), índices em `user_id`, datas e `google_event_id`, trigger `updated_at`.
- **OAuth Google:** fluxo de conexão usando `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` (variáveis de ambiente, só no servidor). Rota de início e **callback** (App Router) que troca o código por tokens e os persiste no servidor; refresh automático do `access_token` via `refresh_token`. Botão "Conectar Google Agenda" e estado conectado/desconectado.
- **CRUD de eventos:** listar, criar, editar e excluir eventos em `calendar_events`, com forms (RHF+Zod), datas/horas em formato brasileiro e validação de início/fim.
- **Sincronização:** sync (bidirecional básico) com o Google Agenda — eventos criados/editados/excluídos no sistema refletem no Google e vice-versa; usar `google_event_id`/`etag`/`synced_at` para conciliar e evitar duplicação. Tratar conflitos de forma previsível (última edição vence, registrando origem).
- **Visões:** **dia, semana e mês**, com calendário bonito, cards de eventos e **cores por tipo**; navegação entre períodos.
- **Lembretes:** configurar lembrete por evento (minutos antes); a entrega de notificações no sino é da Fase 13 — aqui fica a configuração e o vínculo.
- **Vínculo com tarefas:** preparar a relação `calendar_events.task_id` para vincular eventos a tarefas (a UI plena de tarefas chega na Fase 09; deixar o campo e o ponto de integração prontos sem quebrar nada).
- **Próximos compromissos no dashboard:** componente/seção reutilizável com os próximos eventos, pronto para o dashboard.
- **UI:** calendário premium, empty states (sem eventos / Google não conectado), skeletons, toasts e confirmação antes de excluir. Reusar componentes das fases anteriores; dark/light e responsividade reais.

## Fora do escopo
- Módulo completo de **tarefas e rotinas** (Fase 09) — aqui apenas o **vínculo** evento↔tarefa fica preparado.
- Geração/entrega de **notificações** no sino e Vercel Cron para lembretes (Fase 13).
- Dashboard geral multi-módulos (Fase 12) — apenas o componente "próximos compromissos" é entregue.
- Integrações de calendário além do Google (ex.: Outlook/iCal).

## Instruções técnicas
- **Next 16:** rotas OAuth e chamadas à API do Google **no servidor** (route handlers / Server Actions); `cookies()`/`headers()` são **async** (use `await`); proteção de rotas pelo `proxy.ts`. `user_id` sempre de `auth.uid()` — nunca do client.
- **Tokens só no servidor:** `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` em `.env.local` (documentar em `.env.local.example`); `access_token`/`refresh_token` persistidos no Supabase com RLS e **nunca** enviados ao frontend. O client recebe apenas eventos já normalizados.
- Usar a Google Calendar API (cliente oficial ou `fetch` direto) com refresh de token; mapear eventos Google ↔ `calendar_events` por `google_event_id`/`etag`. Idempotência na sincronização (não duplicar eventos).
- Datas com **date-fns** (`ptBR`), respeitando fuso; UI em pt-BR. Leitura preferencial em Server Components; interatividade do calendário com `'use client'` e TanStack Query onde necessário.
- Cores por tipo derivadas de tokens do design system (preto/branco/dourado + auxiliares), legíveis em dark e light.

## Cuidados
- **Segurança dos tokens é prioridade:** OAuth tokens guardados **com segurança no servidor**, nunca no frontend, nunca logados. **RLS obrigatória** em `calendar_events` e na tabela de integração/tokens.
- Sincronização **sem duplicar** eventos nem apagar eventos do Google indevidamente; tratar revogação de acesso e expiração de token (reconectar com clareza).
- Manter o sistema funcional **sem** o Google conectado (agenda local funciona; sync "liga" quando as chaves/credenciais existirem) — análogo ao tratamento de auth da Fase 01.
- Preparar o `task_id` sem criar dependência quebrada com a Fase 09 (coluna opcional; UI de vínculo evolui depois).
- Manter **dark/light** e **responsividade** no calendário (dia/semana/mês precisam funcionar bem no celular). Empty states, skeletons e confirmação ao excluir.
- Não quebrar as Fases 01–07 (layout, tema, rotas, auth, financeiro, dashboard).

## Critérios de aceite
- [ ] Conectar conta Google via OAuth (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`), com estado conectado/desconectado.
- [ ] CRUD de eventos (`calendar_events`) com RLS funcionando.
- [ ] **Sincronização bidirecional básica** com o Google Agenda, sem duplicar eventos.
- [ ] Visões **dia/semana/mês** funcionando, com **cores por tipo**.
- [ ] Lembretes configuráveis por evento; vínculo evento↔tarefa preparado (`task_id`).
- [ ] Componente de **próximos compromissos** pronto para o dashboard.
- [ ] **Tokens OAuth guardados com segurança no servidor** (RLS; nunca no frontend; nunca logados).
- [ ] Dark/light e responsividade preservados; empty states, skeletons, toasts e confirmação ao excluir.
- [ ] `npm run build` passa.

## Ao finalizar
O agente deve atualizar:
- `docs/project/CURRENT_STATUS.md`
- `docs/handoff/LAST_PHASE_SUMMARY.md`
- `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md` (apontando para `docs/phases/PHASE_09_TASKS_ROUTINES.md`)
