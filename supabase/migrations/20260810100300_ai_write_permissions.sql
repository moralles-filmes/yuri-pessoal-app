-- ══════════════════════════════════════════════════════════════════════════════════════
-- Fase 18-C · Bloco 3 — IA · As chaves de ESCRITA e o vocabulário novo de recusa.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ ESCREVER NUM MÓDULO EXIGE DUAS CHAVES: `allow_<modulo>` E `allow_write_<modulo>`.     ║
-- ║                                                                                       ║
-- ║ Não é redundância. Propor uma alteração começa por LER (resolver "a tarefa do          ║
-- ║ mercado" para um id é uma consulta), e autorizar a IA a alterar um módulo que ela não  ║
-- ║ pode nem ler descreveria um estado que não existe. A consequência prática é a que      ║
-- ║ importa: desligar a leitura de um módulo desliga a escrita dele junto, sem que ninguém ║
-- ║ precise lembrar de desligar as duas.                                                   ║
-- ║                                                                                       ║
-- ║ TODAS NASCEM `false`, como as nove de leitura. E são CINCO, não nove: só os módulos    ║
-- ║ que têm ação de escrita prevista na matriz do Bloco 0. Uma chave sem ferramenta que a  ║
-- ║ honre é um botão que não liga nada — o defeito que `toolsForPermission` (invariante 24 ║
-- ║ da 18-B) existe para não cometer. Módulo que ganhar sua primeira escrita ganha sua      ║
-- ║ chave na mesma migration do command, e essa é a decisão que se quer explícita.         ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- Idempotente.
-- ══════════════════════════════════════════════════════════════════════════════════════

alter table public.ai_user_preferences
  add column if not exists allow_write_todo      boolean not null default false,
  add column if not exists allow_write_habits    boolean not null default false,
  add column if not exists allow_write_calendar  boolean not null default false,
  add column if not exists allow_write_nutrition boolean not null default false,
  add column if not exists allow_write_finance   boolean not null default false;

comment on column public.ai_user_preferences.allow_write_finance is
  'Fase 18-C. Autoriza a IA a PROPOR lançamentos financeiros. Nem esta chave nem nenhuma outra autoriza aplicar sem confirmação na tela: toda escrita confirma, em qualquer modo, em qualquer nível de risco.';

-- ─────────────── O vocabulário de recusa ganha `TOOL_WRITE_OUT_OF_BAND` ───────────────
--
-- ⚠️ ESTE CHECK É UMA LISTA QUE PRECISA CONCORDAR COM `ToolRejectionReason`
-- (`src/lib/ai/tools/guard.ts`). Ela já existia assim desde a 18-B, e a consequência de
-- esquecê-la é a pior possível para uma trilha de auditoria: a recusa ACONTECE (o guard é
-- puro e independe do banco), o usuário fica protegido, e a linha que registraria o motivo
-- estoura `23514` — em silêncio, porque `audit.ts` loga e não lança. Ficaria uma escrita
-- barrada sem registro de ter sido barrada.
--
-- `TOOL_WRITE_OUT_OF_BAND` é o motivo NOVO: pedido de escrita fora do modo proposta. Ele
-- não deve acontecer nunca — o laço sempre admite escrita em modo proposta — e é justamente
-- por isso que ele precisa ser registrável: um defeito que não deveria existir e que não
-- deixa rastro é um defeito que ninguém encontra.

alter table public.ai_tool_calls
  drop constraint if exists ai_tool_calls_rejection_reason_check;
alter table public.ai_tool_calls
  add constraint ai_tool_calls_rejection_reason_check
  check (rejection_reason is null or rejection_reason in (
    'TOOL_UNKNOWN','TOOL_NOT_ALLOWED_FOR_AGENT','TOOL_INCOHERENT',
    'TOOL_WRITE_DISABLED','TOOL_WRITE_OUT_OF_BAND','TOOL_PERMISSION_DENIED',
    'TOOL_INVALID_INPUT','TOOL_TIMEOUT','TOOL_FAILED'));

comment on column public.ai_tool_calls.rejection_reason is
  'Vocabulário EXATO de ToolRejectionReason (src/lib/ai/tools/guard.ts). As duas listas têm de concordar: a recusa acontece no guard, que é puro; o que falta aqui não impede a recusa, apaga o REGISTRO dela.';
