# PROMPT_PROXIMA_FASE — Prompt reutilizável para continuar o projeto

> Como usar: **copie o bloco "PROMPT" abaixo** e cole no novo chat.
> Você só precisa **editar 1 linha** — a que começa com `>>> TAREFA:`.

> ⛔ **NÃO HÁ PRÓXIMA FASE.** As **14 fases do roadmap original**, a **15 (TO-DO)**, a
> **16 (Dieta)**, a **17 (Treinos)** e a **18 (IA)** estão **CONCLUÍDAS** — a 18 fechou em
> 2026-09-20, com os critérios validados um a um em
> `docs/phases/PHASE_18_CRITERIOS_VALIDADOS.md`. **Não há 18-G e não há Fase 19.**
>
> O projeto está em **manutenção/iteração**: toda melhoria entra como **tarefa avulsa**, com
> branch própria e o fluxo normal (brainstorming quando houver decisão de design em aberto →
> plano → execução). O prompt abaixo foi convertido para isso. ⚠️ Ele mandava implementar a
> **Subfase 17-E**, concluída em 2026-08-04 — e, como é um prompt para copiar e colar, um
> agente obedeceria ao pé da letra e reimplementaria coisa pronta.

---

## PROMPT (copie a partir daqui)

```text
Você vai trabalhar no projeto "Sistema Pessoal Yuri" (concluído, faseado e documentado).
Ele NÃO tem fase em aberto: toda melhoria é tarefa avulsa, com branch própria.

>>> TAREFA: <descreva aqui, em uma ou duas linhas, o que você quer> <<<
(edite SOMENTE a linha acima — o resto continua igual)

NÃO comece a codar antes de ler a documentação. Leia, nesta ordem:
1. docs/project/PROJECT_BRIEFING.md
2. docs/project/PROJECT_RULES.md
3. docs/project/PROJECT_ARCHITECTURE.md
4. docs/project/PROJECT_ROADMAP.md
5. docs/project/CURRENT_STATUS.md
6. docs/handoff/LAST_PHASE_SUMMARY.md
7. docs/handoff/NEXT_AGENT_INSTRUCTIONS.md
8. As INVARIANTES do módulo que a tarefa toca, no CLAUDE.md da raiz — quase todas nasceram
   de um bug real, e várias são travas de banco que um patch inocente desfaz
9. O arquivo docs/phases/PHASE_XX_*.md do módulo que a tarefa toca (o que já existe ali)

Faça AGORA apenas a tarefa acima, seguindo as regras:
- Trabalhe só nessa tarefa. NÃO invente uma "Fase 19" nem uma subfase nova para organizar o
  trabalho: o roadmap é histórico de construção, e reabri-lo por um ajuste faz a documentação
  mentir. Se a tarefa for grande, quebre em blocos DENTRO dela.
- Não reduza requisitos em silêncio: o que não couber, diga qual foi e por quê.
- Não quebre nada já pronto (layout, tema dark/light, responsividade, rotas, auth, format).
- CRIE UMA BRANCH para a tarefa a partir de origin/main e CONFIRME com
  `git branch --show-current` ANTES de cada commit. Enquanto houve duas frentes em paralelo
  (Fases 16 e 17), aconteceu duas vezes de uma fase inteira ser commitada na branch da outra e
  o push subir uma branch vazia. Se outro trabalho estiver em curso na mesma pasta e a branch
  trocar no meio: `git stash push -u -- src/`, volte para a SUA branch, `git stash pop`, e
  confira que nenhum arquivo alheio entrou. COMMITE CEDO E COMMITE SÓ OS SEUS ARQUIVOS.
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
  npm run lint && npx tsc --noEmit && npm run test:run && npm run build && npm run perf:bundle
  Mais TZ=UTC npx vitest run (a suíte tem de passar em qualquer fuso) e um smoke test:
  rotas privadas → 307 /login; /api/cron/* → 401 sem segredo.
  ⚠️ Confira o pwd antes de acreditar num verde: cd persiste entre chamadas de shell.
- Segurança: nunca suba segredo/chave/token; revise o diff antes de qualquer commit.
  Não faça push sem eu pedir.

Ao terminar, atualize docs/project/CURRENT_STATUS.md e docs/handoff/NEXT_AGENT_INSTRUCTIONS.md
(a seção de pendências), e o CLAUDE.md da raiz SE alguma invariante mudou. Me diga no fim:
o que foi feito, arquivos criados/alterados, o que ficou de fora e por quê.
```

(copie até aqui)

---

## Tabela de referência — onde está cada módulo (histórico)

⛔ **Nenhuma linha desta seção é "a próxima".** Todas as fases estão concluídas; a tabela serve
para achar o arquivo do módulo que a sua tarefa toca.

### Fase 18 — Inteligência Artificial (`/ia`)

| Subfase | Arquivo |
| --- | --- |
| 18-A | ✅ concluída (`PHASE_18_A_AI_FOUNDATION_PROVIDERS_CHAT.md`) |
| 18-B | ✅ concluída (`PHASE_18_B_AI_CONTEXT_READ_TOOLS_AGENTS.md`) |
| 18-C | ✅ concluída (`PHASE_18_C_AI_ACTIONS_APPROVALS_AUDIT.md`) — matriz em `PHASE_18_C_MATRIZ_DE_FERRAMENTAS.md` |
| 18-D | ✅ concluída (`PHASE_18_D_AI_VISION_DOCUMENTS_RECEIPTS.md`) |
| 18-E | ✅ concluída (`PHASE_18_E_AI_INSIGHTS_REPORTS_DASHBOARDS.md`) |
| 18-F | ✅ concluída (`PHASE_18_F_AI_MEMORY_VOICE_INTEGRATIONS_POLISH.md`) — **FECHOU a Fase 18** |

> ✅ **A Fase 18 está CONCLUÍDA** (2026-09-20). Os critérios de aceite da fase inteira foram
> validados **um a um** em `docs/phases/PHASE_18_CRITERIOS_VALIDADOS.md`: 163 critérios, 142
> validados, 17 dependendo de conferência à mão e 4 retirados no desenho, com motivo.
> **Não há 18-G.**

### Fase 17 — Treinos (`/treinos`)

| Subfase | Arquivo |
| --- | --- |
| 17-C | ✅ concluída (`PHASE_17_C_TRAINING_LIVE_SESSION.md`) |
| 17-D | ✅ concluída (`PHASE_17_D_TRAINING_HISTORY_PROGRESS.md`) |
| 17-E | ✅ concluída (`PHASE_17_E_TRAINING_GOALS_DASHBOARDS.md`) |
| 17-F | ✅ concluída (`PHASE_17_F_TRAINING_INTEGRATIONS_POLISH.md`) — **FECHOU a Fase 17** |

> ⛔ **Os dois avisos centrais de quem for mexer em Treinos:**
> **1.** `src/lib/training/metrics.ts` é a fonte ÚNICA de todo agregado do módulo (volume,
> séries, repetições, tempo, distância, frequência, distribuição por grupo). Os dashboards
> **consomem** — se refizerem a conta, vão discordar do histórico e o usuário verá dois números
> diferentes para a mesma semana. Faltando um agregado, acrescente **em `metrics.ts`**.
> **2.** As medidas corporais **já existem**: a 16-E criou as 4 tabelas `body_*` e o código em
> `src/lib/body/`. A 17-E **consome** e não cria tabela nenhuma.

### Fase 16 — Dieta e Alimentação (`/nutricao`)

| Subfase | Arquivo |
| --- | --- |
| 16-D | ✅ concluída (`PHASE_16_D_NUTRITION_SHOPPING_LIST.md`) |
| 16-E | ✅ concluída (`PHASE_16_E_NUTRITION_MEASUREMENTS_REPORTS.md`) |
| 16-F | ✅ concluída (`PHASE_16_F_NUTRITION_INTEGRATIONS_POLISH.md`) — **FECHOU a Fase 16** |

> ✅ **O encontro das duas frentes já aconteceu (2026-08-04).** A **16-E CRIOU** o módulo
> central `body_*` (4 tabelas + `src/lib/body/`); a **17-E CONSOME** e **não cria tabela
> nenhuma**. Nunca duas tabelas de peso corporal.
>
> ✅ **A Fase 16 está CONCLUÍDA.** A 16-F validou os **40 critérios de aceite gerais** — 40 de
> 40 atendidos (veredito item a item em `docs/handoff/LAST_PHASE_SUMMARY.md`). **Não há 16-G**:
> a frente Dieta entra em manutenção/iteração. A 16-F também fechou todas as pendências
> acumuladas de A a E — código de barras pela câmera, upload da foto de receita, arrastar
> ingrediente, busca global, lançamento rápido, card no dashboard, notificações (8 famílias),
> corredores de mercado e tipos de medida pela interface, quantidade por receita na lista e
> XLSX nos relatórios.

### Fases do roadmap original (todas concluídas — referência histórica)

`PHASE_01_FOUNDATION` · `PHASE_02_FINANCIAL_CORE` · `PHASE_03_CREDIT_CARDS_INVOICES` ·
`PHASE_04_INSTALLMENTS` · `PHASE_05_SHARED_EXPENSES` · `PHASE_06_IMPORTS` ·
`PHASE_07_FINANCIAL_DASHBOARD` · `PHASE_08_CALENDAR` · `PHASE_09_TASKS_ROUTINES` ·
`PHASE_10_HABITS` · `PHASE_11_STUDIES` · `PHASE_12_GENERAL_DASHBOARD` ·
`PHASE_13_SEARCH_QUICKADD_NOTIFICATIONS` · `PHASE_14_POLISH_SECURITY` ·
`PHASE_15_TODO_COMPLETE`

---

## Mais fácil ainda (sem editar nada)

```text
Trabalhe no projeto "Sistema Pessoal Yuri", que está concluído e em manutenção. Leia
docs/handoff/NEXT_AGENT_INSTRUCTIONS.md e docs/project/PROJECT_RULES.md antes de tocar em
qualquer coisa, e as invariantes do módulo no CLAUDE.md da raiz. Não há fase em aberto:
o que eu pedir é tarefa avulsa, com branch própria.
```

> **O que ainda está aberto?** As pendências conscientes — a conferência à mão dos 17 critérios
> da Fase 18, as duas chaves ociosas, o backlog de `auth_rls_initplan` — estão listadas em
> `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md`. **Não há próxima fase.**
