-- ══════════════════════════════════════════════════════════════════════════════════════
-- Fase 18-C · Bloco 3 — IA · `ai_action_approvals`: a DECISÃO do dono.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ USO ÚNICO É UM ÍNDICE, NÃO UM `if`.                                                   ║
-- ║                                                                                       ║
-- ║ `unique (proposal_id)`: uma proposta recebe UMA decisão, para sempre. Confirmar duas   ║
-- ║ vezes (clique duplo, duas abas, replay do formulário) devolve `23505` — e a segunda    ║
-- ║ tentativa não chega perto de escrever nada. Confirmar depois de recusar também é       ║
-- ║ recusado: a decisão é final, e reabri-la seria uma janela nova sem previsão nova.      ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ POR QUE `unique (proposal_id)` E NÃO `unique (proposal_id, user_id)`.
--    Chave única global é ocupável: na 17-F, um intruso ocupava `(scheduled_workout_id,
--    provider)` e IMPEDIA o dono de sincronizar aquele dia. Aqui não dá, e o que impede é a
--    FK COMPOSTA abaixo — `(proposal_id, user_id)` só casa com uma proposta DO PRÓPRIO
--    usuário, então ninguém consegue inserir a linha que ocuparia a chave alheia. As duas
--    coisas trabalham juntas: sem a FK composta, este índice teria de virar par com user_id
--    e perderia o "uma decisão por proposta".
--
-- IMUTÁVEL: sem UPDATE e sem DELETE. Decisão registrada não se reescreve.
--
-- Idempotente.
-- ══════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.ai_action_approvals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  proposal_id      uuid not null,

  decision         text not null check (decision in ('confirmada','recusada')),

  -- O hash que a TELA mostrou e o dono confirmou. A FK composta mais abaixo o amarra ao
  -- `effect_hash` da proposta: confirmação com hash de outra previsão não entra no banco.
  confirmed_hash   text not null check (confirmed_hash ~ '^[0-9a-f]{64}$'),

  -- Na 18-C só existe uma origem, e ela é declarada em vez de presumida: nenhuma
  -- confirmação vem do modelo, de webhook, de link por e-mail ou de auto-execução. Um valor
  -- novo aqui exige migration — que é o pedágio certo para uma origem nova de aprovação.
  origem           text not null default 'tela' check (origem in ('tela')),

  decided_at       timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

-- ⛔ A trava de uso único. Ver o cabeçalho.
create unique index if not exists ai_action_approvals_proposal_uidx
  on public.ai_action_approvals (proposal_id);

create unique index if not exists ai_action_approvals_id_user_uidx
  on public.ai_action_approvals (id, user_id);
create index if not exists ai_action_approvals_user_idx
  on public.ai_action_approvals (user_id);
create index if not exists ai_action_approvals_decided_idx
  on public.ai_action_approvals (user_id, decided_at desc);

-- ⚠️ A FK CARREGA O HASH — e é o que torna impossível gravar uma confirmação que não
-- corresponda à previsão da proposta. O Approval Engine já compara e devolve mensagem em
-- pt-BR; isto é a trava que sobrevive a alguém apagar essa comparação por engano.
-- (Carregar `user_id` junto é o de sempre: a RLS confere o `user_id` da PRÓPRIA linha e não
-- alcança a linha apontada — invariante 23 da 17-F.)
alter table public.ai_action_approvals
  drop constraint if exists ai_action_approvals_proposal_owner_fk;
alter table public.ai_action_approvals
  add constraint ai_action_approvals_proposal_owner_fk
  foreign key (proposal_id, user_id, confirmed_hash)
  references public.ai_action_proposals (id, user_id, effect_hash)
  on delete cascade;

alter table public.ai_action_approvals enable row level security;
alter table public.ai_action_approvals force row level security;

drop policy if exists "ai_action_approvals_select" on public.ai_action_approvals;
create policy "ai_action_approvals_select" on public.ai_action_approvals
  for select using (user_id = auth.uid());
drop policy if exists "ai_action_approvals_insert" on public.ai_action_approvals;
create policy "ai_action_approvals_insert" on public.ai_action_approvals
  for insert with check (user_id = auth.uid());

-- Sem UPDATE e sem DELETE.

comment on table public.ai_action_approvals is
  'Fase 18-C. A decisão do dono sobre uma proposta: confirmada ou recusada, uma vez só (unique proposal_id). Imutável. O prazo NÃO mora aqui — ele é ai_action_proposals.expires_at, conferido na leitura.';
comment on column public.ai_action_approvals.confirmed_hash is
  'O hash da previsão que a TELA mostrou. A FK composta o amarra ao effect_hash da proposta: o banco recusa confirmação de uma previsão diferente da que foi lida.';
comment on column public.ai_action_approvals.origem is
  'Só "tela" na 18-C. Nenhuma confirmação vem do modelo, de webhook, de link externo ou de auto-execução. Origem nova exige migration, de propósito.';
