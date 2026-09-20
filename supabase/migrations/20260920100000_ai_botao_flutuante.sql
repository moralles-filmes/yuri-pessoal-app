-- ════════════════════════════════════════════════════════════════════════════════════════
-- Fase 18-F · Bloco 2 — O botão flutuante do assistente.
--
-- DUAS COLUNAS, NENHUMA TABELA. O botão não guarda dado do dono: ele guarda onde o dono quer
-- o botão. Por isso a preferência mora junto das outras do módulo, e não numa tabela própria.
--
-- ⚠️ POR QUE BANCO E NÃO COOKIE. A sidebar usa cookie (`yuri:sidebar-collapsed`) porque o
-- estado dela é por aparelho e não vale nada fora do navegador. Este é outro caso: quem
-- escondeu o botão escondeu-o de propósito, e reencontrá-lo aparecendo de novo no celular
-- seria a preferência não valendo. Em banco ele também entra no backup (o export da IA, do
-- Bloco 1) e some na exclusão em massa junto do resto — como qualquer preferência.
--
-- ⛔ AS DUAS NASCEM COM O BOTÃO VISÍVEL, e isso NÃO fere "toda chave nasce desligada". Aquela
-- regra vale para AUTORIZAÇÃO: as nove `allow_*`, as cinco `allow_write_*`, `allow_vision`,
-- `allow_insight_jobs`. Esta não autoriza coisa nenhuma — o chat atrás do botão continua
-- exigindo exatamente as mesmas chaves, e todas continuam desligadas. Um botão que nasce
-- escondido é uma entrega que ninguém encontra.
--
-- RLS: nada a fazer. `ai_user_preferences` já tem RLS + FORCE RLS e policies por comando
-- desde `20260807100000_ai_foundation.sql`; policy é da TABELA e alcança coluna nova.
-- ════════════════════════════════════════════════════════════════════════════════════════

alter table public.ai_user_preferences
  add column if not exists floating_corner text    not null default 'direita',
  add column if not exists floating_hidden boolean not null default false;

-- O CHECK é a trava real do vocabulário: a tela valida com Zod e a action também, mas as duas
-- são código, e código se contorna com um POST montado à mão. Um canto fora da lista viraria
-- classe CSS inexistente e o botão sumiria sem erro nenhum — falha silenciosa, a pior espécie.
alter table public.ai_user_preferences
  drop constraint if exists ai_user_preferences_floating_corner_check;

alter table public.ai_user_preferences
  add constraint ai_user_preferences_floating_corner_check
  check (floating_corner in ('direita', 'esquerda'));

comment on column public.ai_user_preferences.floating_corner is
  'Fase 18-F Bloco 2. Em qual canto INFERIOR o botão flutuante fica. Só dois valores: o Header é sticky top-0 h-16 e ocupa a faixa de cima inteira, então canto superior é colisão garantida em toda rota.';

comment on column public.ai_user_preferences.floating_hidden is
  'Fase 18-F Bloco 2. Esconde o BOTÃO, não o assistente: o atalho Ctrl/Cmd+I continua abrindo o painel, e a tela que oferece ocultar diz isso. Nasce false de propósito — é aparência, não autorização.';
