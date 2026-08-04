# PROMPT_PROXIMA_FASE — Prompt reutilizável para continuar o projeto

> Como usar: **copie o bloco "PROMPT" abaixo** e cole no novo chat.
> Você só precisa **editar 1 linha** — a que começa com `>>> FASE A IMPLEMENTAR:`.
> Use a tabela do fim para saber o nome do arquivo de cada fase.

> ⚠️ **Duas frentes correm em paralelo desde 2026-08-03**: Fase 16 (Dieta, `/nutricao`) e
> Fase 17 (Treinos, `/treinos`). Escolha **uma** por chat. A próxima de cada uma está em
> `docs/project/CURRENT_STATUS.md`.

---

## PROMPT (copie a partir daqui)

```text
Você vai continuar o projeto "Sistema Pessoal Yuri" (já iniciado, faseado e documentado).

>>> FASE A IMPLEMENTAR: Subfase 17-D — docs/phases/PHASE_17_D_TRAINING_HISTORY_PROGRESS.md <<<
(edite SOMENTE a linha acima ao trocar de fase — o resto continua igual)

NÃO comece a codar antes de ler a documentação. Leia, nesta ordem:
1. docs/project/PROJECT_BRIEFING.md
2. docs/project/PROJECT_RULES.md
3. docs/project/PROJECT_ARCHITECTURE.md
4. docs/project/PROJECT_ROADMAP.md
5. docs/project/CURRENT_STATUS.md
6. docs/handoff/LAST_PHASE_SUMMARY.md
7. docs/handoff/NEXT_AGENT_INSTRUCTIONS.md
8. O arquivo da fase indicado na linha ">>> FASE A IMPLEMENTAR" acima
9. O arquivo da subfase ANTERIOR do mesmo módulo (para saber o que já existe)

Implemente AGORA apenas a fase indicada acima, seguindo o arquivo da fase e as regras:
- Trabalhe só nessa fase. Não adiante fases futuras. Não reduza requisitos em silêncio:
  o que não couber, registre no arquivo da subfase seguinte.
- Não quebre nada já pronto (layout, tema dark/light, responsividade, rotas, auth, format).
- DUAS FRENTES EM PARALELO (Fase 16 Dieta e Fase 17 Treinos) compartilham repositório e
  banco. Ao editar PROJECT_ROADMAP.md, CURRENT_STATUS.md, NEXT_AGENT_INSTRUCTIONS.md,
  src/types/supabase.ts e src/config/nav.ts, LEIA ANTES e edite de forma pontual —
  sobrescrever leva embora o trabalho da outra frente.
- CRIE UMA BRANCH para a fase a partir de origin/main e CONFIRME com
  `git branch --show-current` ANTES de cada commit. As duas frentes usam a mesma pasta e a
  outra pode trocar a branch no meio do trabalho: já aconteceu de uma fase inteira ser
  commitada na branch da outra frente e o push subir uma branch vazia.
- Migrations em supabase/migrations/ (idempotentes, timestamp YYYYMMDDHHMMSS) com RLS +
  FORCE RLS por user_id = auth.uid() em TODAS as tabelas; índice em user_id; trigger
  updated_at. Nunca confie em user_id vindo do client — sempre auth.getUser().
- Aplique as migrations no Supabase via MCP apply_migration (projeto yjvnlbjvippefvzgrxxw),
  rode get_advisors (0 lints de schema) e regenere src/types/supabase.ts.
- Toda regra de negócio crítica vira FUNÇÃO PURA testada (Vitest, `now`/`hoje` injetados,
  sem Date.now()). I/O fica separado em queries.ts / actions.
- pt-BR, moeda BRL, datas brasileiras, dark+light e responsividade reais.
  Reaproveite os componentes já existentes; não crie um segundo design system.
- Next.js 16: proxy.ts (não middleware.ts); cookies()/headers() e params são async.
- React Compiler ativo: use useWatch/Controller, nunca form.watch(); nada de setState em
  useEffect (ajuste de estado durante o render é o padrão adotado).
- FORMULÁRIO COM zodResolver (duas regras que vieram de um bug que travou o salvamento em
  produção sem destacar campo nenhum):
  1. O SCHEMA TEM DE ACEITAR A PRÓPRIA SAÍDA. O react-hook-form entrega ao onSubmit a saída
     JÁ TRANSFORMADA, o formulário manda isso para a action e a action revalida com o MESMO
     schema — logo parse(parse(x)) precisa funcionar. Acrescente o schema novo em
     src/lib/validators/round-trip.test.ts.
  2. Nunca descarte os fieldErrors da action: use mapServerFieldErrors
     (src/lib/forms/server-errors.ts) e passe `error` para TODO campo. "Verifique os campos
     destacados" só pode aparecer se algum campo for destacado de fato.
- Verificação obrigatória antes de declarar pronto:
  npm run lint && npx tsc --noEmit && npm run test:run && npm run build
  Mais um smoke test: rotas privadas → 307 /login; /api/cron/* → 401 sem segredo.
- Segurança: nunca suba segredo/chave/token; revise o diff antes de qualquer commit.

Ao terminar, atualize docs/project/CURRENT_STATUS.md, docs/handoff/LAST_PHASE_SUMMARY.md
e docs/handoff/NEXT_AGENT_INSTRUCTIONS.md (apontando para a PRÓXIMA fase), e me diga no fim:
o que foi feito, arquivos criados/alterados, fase concluída, próxima fase e o caminho exato
do arquivo que o próximo agente deve abrir.
```

(copie até aqui)

---

## Tabela de referência — o que pôr na linha `>>> FASE A IMPLEMENTAR`

### Fase 17 — Treinos (`/treinos`)

| Subfase | Linha para colar |
| --- | --- |
| 17-C | ✅ concluída (`PHASE_17_C_TRAINING_LIVE_SESSION.md`) |
| 17-D | `Subfase 17-D — docs/phases/PHASE_17_D_TRAINING_HISTORY_PROGRESS.md` ← **próxima** |
| 17-E | `Subfase 17-E — docs/phases/PHASE_17_E_TRAINING_GOALS_DASHBOARDS.md` |
| 17-F | `Subfase 17-F — docs/phases/PHASE_17_F_TRAINING_INTEGRATIONS_POLISH.md` |

> ⛔ **Aviso central para a 17-D:** leia sempre o **snapshot** da sessão, nunca o modelo atual.
> Se um gráfico mudar porque o usuário renomeou um exercício ou editou o treino, a 17-C foi
> violada. `training_session_sets.is_personal_record` é só um **marcador** de candidato — a
> consolidação de recordes é trabalho da 17-D, em `src/lib/training/metrics.ts`.

### Fase 16 — Dieta e Alimentação (`/nutricao`)

| Subfase | Linha para colar |
| --- | --- |
| 16-D | ✅ concluída (`PHASE_16_D_NUTRITION_SHOPPING_LIST.md`) |
| 16-E | `Subfase 16-E — docs/phases/PHASE_16_E_NUTRITION_MEASUREMENTS_REPORTS.md` ← **próxima** |
| 16-F | `Subfase 16-F — docs/phases/PHASE_16_F_NUTRITION_INTEGRATIONS_POLISH.md` |

> ⚠️ **A 16-E é onde as duas frentes se encontram.** As **medidas corporais são `body_*`**, um
> módulo central compartilhado: quem chegar primeiro (16-E ou 17-E) **cria**, o outro
> **consome** — nunca duas tabelas de peso corporal. E as **fotos de evolução são o dado mais
> sensível do módulo**: bucket privado, URL assinada de vida curta, policy por pasta
> `{user_id}/…`, nunca URL pública.

### Fases do roadmap original (todas concluídas — referência histórica)

`PHASE_01_FOUNDATION` · `PHASE_02_FINANCIAL_CORE` · `PHASE_03_CREDIT_CARDS_INVOICES` ·
`PHASE_04_INSTALLMENTS` · `PHASE_05_SHARED_EXPENSES` · `PHASE_06_IMPORTS` ·
`PHASE_07_FINANCIAL_DASHBOARD` · `PHASE_08_CALENDAR` · `PHASE_09_TASKS_ROUTINES` ·
`PHASE_10_HABITS` · `PHASE_11_STUDIES` · `PHASE_12_GENERAL_DASHBOARD` ·
`PHASE_13_SEARCH_QUICKADD_NOTIFICATIONS` · `PHASE_14_POLISH_SECURITY` ·
`PHASE_15_TODO_COMPLETE`

---

## Mais fácil ainda (sem editar nada)

Cada agente, ao terminar uma fase, atualiza `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md`
apontando para a fase seguinte. Como há duas frentes, diga qual você quer:

```text
Implemente a próxima subfase da frente TREINOS do projeto "Sistema Pessoal Yuri", seguindo
docs/handoff/NEXT_AGENT_INSTRUCTIONS.md e o arquivo de fase que ele indicar.
Respeite docs/project/PROJECT_RULES.md e atualize os arquivos de handoff ao terminar.
```

> **Qual é a próxima fase agora?** Veja sempre `docs/project/CURRENT_STATUS.md`.
