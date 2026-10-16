# Design — REDESIGN-07-C: Dieta e Treinos

> Desenhado com o dono em **2026-10-11**, antes de qualquer linha de código de produção. D1–D7
> respondidas uma a uma (§3). Branch `feat/redesign-07c-dieta-treinos`, worktree
> `yuri.app.pessoal-07c`, criada de `078d73a` (ponta da 07-B, que nasceu da ponta da 07-A;
> nenhuma das duas integrada). Roda **em paralelo** com a REDESIGN-03-C, que ocupa a pasta
> principal — os arquivos dela, os já alterados pela 03-B2 e os da 07-D estão no §9 e não são
> editados aqui. Terceiro lote da fase 07 (`docs/redesign/PLANO.md`, "REDESIGN-07 — Demais
> módulos").

---

## 1. O que a 07-C muda de natureza

**Nenhum dado muda e nenhuma conta muda.** Nenhuma migration, nenhuma Server Action nova ou
alterada, nenhum caminho novo de escrita. A 07-C muda a **aparência, o anúncio de estado e o
carregamento** das 30 telas de `/nutricao/**` e `/treinos/**` — e, pela D1, **fecha os caminhos
em que a tela da sessão perde o que o dono registrou**. Cada correção que alguém pudesse desfazer
sem perceber sai com um teste que a impede, confirmado por mutação.

O cuidado do PLANO para este lote — ⛔ *a sessão de treino ao vivo não pode ser reiniciada por
remontagem* — é cumprido assim:

- o cronômetro continua saindo de timestamp (`timers.ts` intocado);
- a fila continua drenando em ordem estrita, uma mutação por vez, e `persist` continua o único
  escritor de `queueRef`;
- o que muda é **quem** drena (uma instância por sessão na aba), **o que** a revisão faz antes de
  finalizar (envia a fila do aparelho) e **o que** a tela mostra ao remontar (o que está na fila,
  não um "salvo" otimista).

---

## 2. Linha de base medida (2026-10-11, antes de tocar em qualquer coisa)

`npm ci` + `.env.local` copiado da pasta principal (ignorado pelo git, `.gitignore:34`).

| Comando | Resultado |
| --- | --- |
| `npm run test:run` | **208 arquivos / 4.421 testes — 4.420 ✅, 1 ❌** (ambiente) |
| `npm run lint` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `npm run perf:bundle` | exit 0 · mediana **214,0 KB** · **68** rotas · `/(app)/configuracoes` **282,0/285** |

A ❌ é a de ambiente herdada, e tem de ser a única no fim, com o mesmo nome:
`src/lib/ai/approval/schema.test.ts › as travas que o código não pode contornar › a FK da
aprovação carrega o hash, amarrando-o ao effect_hash da proposta` (CRLF do worktree).

As 30 rotas do lote (KB gz, primeiro carregamento; o script do projeto só imprime as 10 maiores,
estas saíram de um medidor com a mesma conta, rota a rota):

| Dieta | KB | Treinos | KB |
| --- | --- | --- | --- |
| `/nutricao` | 205,6 | `/treinos` | 202,0 |
| `/nutricao/alimentos` | 216,6 | `/treinos/calendario` | **230,9** |
| `/nutricao/compras` | **242,8** | `/treinos/configuracoes` | 210,5 |
| `/nutricao/configuracoes` | 211,0 | `/treinos/evolucao` | **227,5** |
| `/nutricao/diario` | **234,8** | `/treinos/exercicios` | 211,1 |
| `/nutricao/medidas` | 225,6 | `/treinos/exercicios/[id]` | 218,0 |
| `/nutricao/metas` | 214,0 | `/treinos/historico` | 219,2 |
| `/nutricao/planejamento` | 225,4 | `/treinos/historico/[id]` | 216,5 |
| `/nutricao/receitas` | 224,4 | `/treinos/hoje` | 203,3 |
| `/nutricao/refeicoes` | 221,5 | `/treinos/metas` | 218,3 |
| `/nutricao/relatorios` | **226,3** | `/treinos/programas` | 225,6 |
| `/nutricao/substituicoes` | 215,3 | `/treinos/recordes` | 214,5 |
| | | `/treinos/relatorios` | 224,4 |
| | | `/treinos/sessao` | **221,5** |
| | | `/treinos/sessao/preparar` | 221,3 |
| | | `/treinos/sessao/revisar` | 212,3 |
| | | `/treinos/treinos` | 213,2 |
| | | `/treinos/treinos/[id]` | 225,8 |

`/treinos/evolucao` mede 227,5 (o briefing dizia 227,6). **Vale o medido.**

---

## 3. Decisões do dono (2026-10-11)

| # | Decisão | Resposta |
| --- | --- | --- |
| **D1** | Sessão ao vivo (S1–S4) | **Os quatro, com (e').** (a) "Finalizar" vira botão que abre o diálogo, que diz quantos registros estão só no aparelho e oferece "Enviar agora"; (b) a revisão assume a fila e envia antes de finalizar ou encerrar, ou recusa dizendo quantos faltam — "Descartar" continua possível, dizendo que os registros do aparelho somem junto; (c) um enviador por sessão na aba; (d) camada otimista refeita da fila e status que nasce do tamanho dela, anunciado; (e) `RestPanel` com `key` pelo id do descanso, e (e') descanso já vencido ao montar não bipa de novo (o avanço automático não muda) |
| **D2** | Diálogos sob demanda | **Todos os componentes**, fora da sessão: os 27 locais saem para arquivo próprio por movimento puro; `SortableList` dinâmico em compras e programas; os 13 que fecham secos mantêm o item até o fim da animação. Exceções: os 5 da sessão, o `TodoLinkDialog`, as confirmações escritas inline em JSX |
| **D3** | Alternâncias | **`SeletorDeVisao` + `aria-pressed` + V1 estendida.** As 3 visões na URL usam o seletor com `?visao=` intacto; `aria-pressed` (ou `aria-current` no "item atual") nas demais; a V1 reconhece as duas assinaturas novas com precisão e deixa de pular corpo grande; `action-history-client.tsx:430` vira exceção da 07-D; as soltas ficam presas pelos contratos |
| **D4** | Calendários sem depender de cor | **Tudo, com G2 e contorno do futuro.** Fonte única célula/legenda; texto por função pura testada; hoje com `aria-current` + palavra em todos os calendários (inclusive histórico, "Sua semana" e chips de série); status no mês de Treinos com ícone; descanso exibido certo no mês e na lista (G2); futuro com contorno fino na consistência; aderência nomeada sem palavra de faixa |
| **D5** | Erros de formulário | **`mapServerFieldErrors` em tudo, sem ligar o resolver.** RHF → `setError`; `useState`/`FormData` → sob o campo onde já há lugar, senão toast com campo + mensagem real; G1 mostra a mensagem sem mudar a validação; varredura derivada das actions que chamam `invalid(` |
| **D6** | Links | **Construtores + notificação abre a semana.** `nutrition-links.ts` ganha a água e a semana do planejamento; a notificação abre a **semana**; os 4 links da água e o de integrações (`?view=gerenciar`) pelos construtores; contrato estendido à Dieta e Treinos reusando o extrator; os testes de `*-links` exigem a leitura do parâmetro; G4 exceção; IA registrada |
| **D7** | Gavetas | **Sim, as 6**, com o prefixo `data-[side=right]:`, saindo das exceções no mesmo commit; `module-shell.tsx` continua exceção, rotulada só "07-D" |

**Pontos que este spec acrescenta e que o "aprovado" do dono cobre** (não foram perguntas
separadas porque são o mesmo defeito de um item do mapa, achado em outro lugar do lote):

1. **G5 entra no L2:** os campos "Duração mínima", "Volume mínimo" e as datas De/Até do histórico
   de Treinos têm o mesmo defeito dos filtros de Alimentos (gravam na URL a cada tecla). Mesma
   correção (`useUrlText`), mesmo arquivo de contrato.
2. **G6 entra no V (regra 2):** os `CardHeader className="flex-row …"` não são flex (a primitiva é
   `grid`). A prévia confirmou com o CSS real: título e botão empilham, o botão estica. Passam a
   `flex flex-row flex-wrap … gap-2` com `min-w-0` no lado do texto.
3. **Os vazios, barras, recordes/favoritos e linhas que o mapa não listava** (§4, V) entram no
   commit do grupo correspondente, pelo mesmo critério da 07-A/07-B.
4. **Mais dois textos envelhecidos** ("… que chega na Subfase 17-C", `calendar-client.tsx:951-952`
   e `builder-client.tsx:376-377`) entram no T.
5. **A barra da revisão a 390 px** ("Finalizar e salvar" não cabe ao lado de "Voltar ao treino" e
   "Descartar") — medido na conta, não na tela: entra no commit da Sessão **se a medição a 390
   confirmar**; se não confirmar, sai declarada.
6. **`useClearQueueOnFinish`** (`session-live-client.tsx:811-815`, sem chamador) sai com a D1.

---

## 4. O mapa, reconfirmado sobre `078d73a`

Cada linha do briefing foi reconferida no código. As linhas batem salvo onde indicado; o que o
mapa não dizia está nos **G**.

### S — a sessão ao vivo (lido no principal)

- **S1 confirmado e DEMONSTRADO** (§5): `FinishBar` é `<Button asChild><Link href=…/sessao/revisar onClick={onFinish}>` (`session-live-client.tsx:729-733`); o `onClick` não chama `preventDefault`, a navegação acontece no mesmo clique. A revisão importa só `clearSessionQueue` (`session-review-client.tsx:58`) e o chama em `:177, :196, :210`. `useClearQueueOnFinish` (`:811-815`) não tem chamador. A ramificação de "sessão sem exercício" (`:329`) usa a mesma `FinishBar`.
- **S2 confirmado e DEMONSTRADO** (§5). Consequência do envio duplo, lida nas actions: `registrar_serie`/`adicionar_serie` convergem (`client_mutation_id`, `training-sessions.ts:737,836`); `iniciar_descanso` **reinicia o descanso** (`openRest` fecha o aberto e abre outro, `:929-948`); `ajustar_descanso` soma duas vezes; `adicionar_exercicio` adiciona duas vezes; `mover_exercicio` anda duas casas; `pausar` duplicado cai em `erro`; `encerrar_descanso` duplicado é inócuo (`closed=false → ok`).
- **S3 confirmado.** `optimistic`/`drafts`/`currentExerciseId` em `useState` (`:122-124`); `SyncStatus` nasce `"salvo"` (`use-session-queue.ts:109`) até o `setTimeout(retry, 0)` disparar; sem `aria-live` (`sync-status.tsx:50`). Agravante não dito no mapa: com a camada otimista perdida, o rascunho do campo volta para a **sugestão da última vez** (`draftFromSet(set, suggestion)`), e confirmar de novo uma série já registrada (com outro `client_mutation_id`) grava os valores sugeridos por cima dos digitados.
- **S4 confirmado.** `{activeRest && <RestPanel …/>}` sem `key` (`:351-352`); `openRest` fecha A e abre B na mesma action. O caso que morde é o modo **"avisar"** (no "automático" o fim de A chama `onFinish`, o painel desmonta e o de B nasce limpo).
- **Recusa do servidor depois de finalizar:** `recordSet`/`startRest` respondem "Este treino já foi encerrado." (`training-sessions.ts:729`, `:1013`), e o laço tira a mutação da fila nesse caso — é o que torna a perda do S1 definitiva.
- **Hidratação:** a página da sessão é renderizada no servidor (onde `readQueue` devolve `[]`). Hoje nada visível depende da fila no primeiro render (o status nasce "salvo", que esconde a contagem) — por isso não há divergência de hidratação. A (d) não pode criá-la (§6.1).

### C1 — diálogos

- **Dieta: 46 diálogos, 3 lazy** (os três em `alimentos`). Rota a rota: diário 7 (4 locais), planejamento 9 (6 locais), compras 3 + `PantryFormDialog` (só na aba despensa), medidas **8** (não 4: + o diálogo aninhado de exclusão em `measurement-types-dialog.tsx:249` e os 3 de `ProgressPhotos`, montados só na aba "fotos"), metas 2, receitas 3, refeições **6** (3 locais + `Sheet` inline + os dois pickers compartilhados), substituições 2. `BarcodeScannerDialog` é estático em `alimentos` via `food-filters.tsx:37` (montado sempre, `:387`).
- **Treinos + body: 40 diálogos, 9 lazy, 1 dinâmico sem o hook.** Estáticos fora da sessão: calendário (4 locais, `{x && …}`), configurações (2 inline em `locations-client`), evolução (exclusão inline `:615`, `RegisterMeasurementDialog` e os 3 de `ProgressPhotos` na aba "corpo"), histórico (2 inline), detalhe da sessão (1 inline), metas (`RecordProgressDialog` + exclusão inline), preparar (2 inline), revisar (2 inline), treinos (`DeleteWithDestinationDialog`, estático). Na sessão: `AddExerciseSheet`, `ExerciseListSheet`, `PlateCalculatorSheet`, `SubstituteSheet`, `ConfirmFinishDialog`.
- `DeleteWithDestinationDialog` é `{deleting && <… open/>}` **sem o hook nos dois lugares** (programas `:369`, treinos `:519`) — fecha seco em ambos.
- `TodoLinkDialog`: `trigger` é opcional; `hoje/page.tsx:328` usa o botão embutido. Nos dois casos o botão mora dentro do componente — a exceção do `trigger` vale.
- **Fecham sem animação: 9 do mapa + 4** — `workout-exercise-sheet.tsx:109` (`if (!item) return null`), `session/substitute-sheet.tsx:86`, e o `DeleteWithDestinationDialog` em treinos e programas. Em `food-detail-sheet` o `null` vem de `foods-client.tsx:364`; em `measure-dialog:79` o corte só acontece quando o detalhe fecha; o calendário vai até `:438`.
- **Peso:** `SortableList` estático em compras (`:57`, renderizado só com `reordering`, `:754`), em programas (`:55`, só no cartão expandido) e no construtor (`:41`, sempre que há exercício). O calendário monta `<DndContext>` sempre (`:342-362`), mas só a visão **semana** — a padrão — tem arrastáveis.
- O comentário de `foods-client.tsx:63` diz que o detalhe e a medida puxam zod/RHF — não puxam; só o formulário (o G3 da 07-B se repete aqui).

### C2 — formulários

- **Dieta: 17 arquivos chamam action; nenhum usa `mapServerFieldErrors`.** Todos são `useState`/`FormData`, salvo o de alimento.
- ⚠️ **G1 — `food-form-dialog.tsx` está quebrado de outro jeito:** o `<form>` chama `onSubmit()` direto (`:273-277`), sem `handleSubmit` — o resolver nunca roda; e o schema é aninhado (`{food, nutrients}`, `validators/nutrition.ts:112-115`), então `flatten()` devolve só `food`/`nutrients`, e o `setError("food")` não destaca campo nenhum (a tela só renderiza `errors.food.name`).
- `measure-dialog.tsx:99` só lê `grams`; medidas (3 diálogos `FormData`) e `progress-photos` mostram `result.error` num `<p role="alert">` — ainda a frase genérica.
- **Treinos: 28 arquivos; os 5 com RHF já usam `mapServerFieldErrors`.** Além da lista do mapa: `exercise-picker-dialog.tsx:93-97`, `integrations-card.tsx:59-62` e os dois fluxos de exclusão com destino.
- ⚠️ **Mensagens explícitas que hoje se perdem** (o `invalid({campo: "…"})` vira "Verifique os campos destacados."): `nutrition-recipes :525,:537` (arquivo da foto), `body-measurements :125` (nome duplicado), `:232/:380` (`typeId`), `:295` (`values`), `:480/:495` (arquivo), `training-sessions :401` (`workout_id`), `training-workouts :456-459` (`target_workout_id`), `:640/:770` (`superset_group`), `training-programs :256-262` (`target_program_id`), `training-exercises :463` (`muscle_group_id`).

### A1 — alternâncias

- As três visões na URL batem com o mapa. O diário e o planejamento mapeiam um literal (não `DIARY_VIEWS`/`PLANNING_VIEWS`); o calendário não tem constante de visões (a página valida por ternários, `calendario/page.tsx:33-40`) e usa `router.replace` (as outras duas, `router.push`).
- As demais batem; o mapa não nomeava "Versões antigas" (`workouts-client.tsx:307-313`). "Mostrar encerradas" troca o rótulo **e** o estado — com `aria-pressed`, o rótulo tem de parar de trocar.
- **O que a varredura estendida pegaria** (medido): assinatura `bg-primary/10` + `text-foreground` → 4 blocos, 3 mudos, **todos na Dieta**; assinatura `variant={… ? "x" : "y"}` → 12 blocos, 8 mudos: 6 reais (calendário, fonte da lista, barras, valores anteriores, dificuldade e **`ai/action-history-client.tsx:430`**, que são `<Link>`) e 2 falsos positivos (`terceiros-client.tsx:342`, `ai/memory-client.tsx:165` — um `<Badge>`).
- **Fora de qualquer assinatura de `.map`:** 14 alternâncias soltas, "Semana N" (`Array.from`), a assinatura `border-primary … bg-primary/5` (período das metas, substituto, exercício atual) e corpos acima de 8.000 caracteres que a varredura pula em silêncio (`planning-client.tsx:1525`, `substitutions-client.tsx:140`, `prepare-review-client.tsx:441`).

### A2 — calendários

- **Mês do diário:** confirmado, com uma divergência — hoje **já** tem `aria-current="date"` (`:141`). Classes reais das células (`cellTone`, `:36-44`): sem registro `bg-muted/30`; sem meta `bg-accent/40`; >110% `bg-destructive/15`; ≥90% `bg-primary/25`; ≥60% `bg-primary/15`; <60% `bg-primary/[0.07]`. Legenda: `bg-muted/60`, `bg-primary/15`, `bg-primary/25`, `bg-destructive/25` — falta a faixa <60% e "sem meta", e duas amostras não batem. O `cellLabel` diz "Sem registro" num dia passado com planejamento e não diz "fora do mês".
- **Consistência:** confirmado. `ORDER` não tem `futuro`; os cabeçalhos são uma letra (S S Q Q ambíguos).
- **Semana/mês do calendário de Treinos:** confirmado, com nuance — uma entrada **planejada** para hoje já mostra o selo "Hoje"; o cabeçalho da coluna nunca diz. Rótulos com ISO cru ("Marcar descanso em 2026-10-11").
- **Dias da semana:** o diário **já escreve "Hoje"** (`relativeDayLabel`, `diary-client.tsx:1173`) — falta só `aria-current`; o planejamento marca só por cor (`:767`).
- ⚠️ **G2 — descanso aparece como "Atrasado" nas visões mês e lista do calendário de Treinos.** O descanso é gravado com `status:"planejado"` (`actions/training-schedule.ts:633-641`) e essas duas visões passam a linha por `derivePlannedStatus` (`calendar-client.tsx:709/715`, `:766/770/782`): descanso passado sai com o tom destrutivo e, na lista, o texto "Atrasado"; descanso de hoje, com o tom de "hoje". A semana e `countByDerivedStatus` tratam certo.
- Também sem anúncio: o calendário do **histórico** (`history-client.tsx:845-873`), a faixa "Sua semana" (`treinos/page.tsx:495-517`) e os chips de série da sessão (o `aria-label="Série N"` esconde "feita"/"pulada", `session-live-client.tsx:432`).

### L1/L2 — links e campo numérico

- Tudo confirmado. `PLANNING_VIEWS = ["dia","semana","modelos"]`, padrão `"dia"`; a semana só carrega com `visao=semana` (`planejamento/page.tsx:50`). `nutrition-links.ts` não tem construtor para "planejamento numa data".
- `deep-links-query-string.test.ts` não varre `notifications/nutrition.ts`/`training.ts` (`ARQUIVOS`, `:25`), e `lidosPela` só enxerga `sp.<nome>` — as páginas da Dieta/Treinos usam `params.x`/desestruturação.
- **G3:** `components/training/integrations-card.tsx:102` ("Criar em Hábitos") vai a `/habitos` sem visão (`HABIT_VIEWS` tem `gerenciar`).
- **G4:** `programs-client.tsx:679` linka `/treinos/calendario?programa=…`, que a página declara e não lê (o mapa já o registra como R).
- **G5 — L2 também no histórico de Treinos:** "Duração mínima (min)" e "Volume mínimo (kg)" (`history-client.tsx:327-344`) e as datas De/Até (`:267-280`) gravam na URL a cada mudança; `FilterField` (`:912-919`) sem `htmlFor`. No popover de filtros de alimentos, as outras 7 `Label` também não estão associadas.

### G — gráficos

- Confirmado. Os três de `nutricao/relatorios` recebem `{label, value}` por dia (kcal) e uma série de medida; o de medida (`:931`) não tem `MeasurementTable` ao lado, e o `Select` de tipo (`:916`) não tem `aria-label`. Em Treinos, `EquivalentTable` e `ChartFrame` moram no `-impl` (`training-charts-impl.tsx:55-144`).

### W — gavetas

- Confirmado: as 6 com as classes e linhas do mapa. A 07-A resolveu o TO-DO com `data-[side=right]:w-full data-[side=right]:sm:max-w-xl` (`task-detail-sheet.tsx:231-234`). `module-shell.tsx:157` é `side="left"` e continua exceção. Medido na prévia (CSS real): **384 px antes, 576 px depois** a 1280; 390 px a 390.

### T — textos

- Confirmado, `revisar/page.tsx` em `:58`. A frase do `integrations-card` também omite "abandonar". **Mais dois textos envelhecidos:** `calendar-client.tsx:951-952` e `builder-client.tsx:376-377` ("… que chega na Subfase 17-C").
- `NUTRITION_SECTION_STATUS_LABELS` sem leitor; não existe equivalente em Treinos. `status` é lido por `treinos/page.tsx:176` (o card morto) e `module-shell.test.ts:173-176`; `phase` só pelos ramos mortos.

### V — alinhamento visual

- **Vazios:** dos 21+18 do mapa, 4 não são vazio (`nutricao/page.tsx:299` é chamada para ação — o vazio real é `:310-318`; `session-live-client.tsx:475` é estado de conclusão; `plate-calculator.tsx:164` é mensagem de sem solução; `exercise-detail-sheet.tsx:217` é nota informativa). ~20 vazios que o mapa não listava (ex.: `settings-client.tsx:198`, `hoje/page.tsx:217`, `exercise-history-client.tsx:182`, `treinos/relatorios :493`, `locations-client.tsx:158`). **35 `EmptyState` já em uso** nos dois módulos; 5 deles moram **dentro de Card** com o `py-16` padrão.
- **Barras:** confirmadas. Também `measurements-client.tsx:449-463` (`role="progressbar"` com "Progresso da meta", sem o nome da medida). Com alvo 0, `GoalProgressBar` diz "0% da meta" com `percent` nulo.
- **Recorde/favorito só por ícone:** os 3 do mapa + `recipes-client.tsx:369-371` e `meal-templates-client.tsx:310-312` (o lucide 1.21 põe `aria-hidden` no ícone sem rótulo).
- ⚠️ **G6 — os `CardHeader className="flex-row …"` não são flex.** A primitiva é `grid` (`ui/card.tsx:28`); `flex-row` sem `flex` não faz nada, e título e ações **empilham**. Atinge `reports-client.tsx:475,501,584,907`, `planning-client.tsx:613,1529`, `history-client.tsx:811`, `session-detail-client.tsx:220`, `diary-client.tsx:783`, `substitutions-client.tsx:152`, `measurements-client.tsx:624`, `progress-photos.tsx:107` (o mesmo padrão existe na 07-B, fora deste lote).
- **Hex cravado:** nenhum (confirmado).

### R — registrados para outros lotes (não consertados aqui)

Os do briefing continuam valendo (links da IA com `?date=`; links de Treinos montados fora de
`training-links.ts` na IA; G7 de `habit-sync.ts`; "Sessão ativa" acesa em `/revisar`; `programa`
declarado e não lido; parâmetros sem validação; `queries.ts` sem `server-only`; o fallback de
`newMutationId` que não é UUID; `restTimer` sem desconto de pausa; descanso que só conta depois de
sincronizar). Acrescentam-se:

- **`habit-reflection.ts`**: sessões concluídas com menos de 30 s (minutos) ou 18 s (horas), ou com
  tempos nulos, dão valor 0 — e o dia é **apagado** mesmo com sessão concluída. Corrigir muda a
  escrita (dono: quem tocar `lib/training` com mudança de comportamento).
- **`preparar` com sessão em andamento** oferece encerrar a sessão em execução sem olhar a fila do
  aparelho dela (o S1 por outra porta). Fica registrado: a revisão é a porta principal e a D1 a
  fecha; a do preparo exigiria a fila de outra sessão na tela de preparo.
- **O ponto de "Subfase" e o "chega na Subfase 17-C"** em telas de outros lotes, se houver, não
  foram procurados fora de `/nutricao` e `/treinos`.

---

## 5. S1 e S2 demonstrados (Passo 0, sem commit)

**Como.** O laço de envio saiu do `useCallback` do hook para
`src/components/training/session/session-queue-drain.ts` (`drainQueue(ports)`), e o hook passou a
só ligar os refs. **É movimento:** um script normalizou os nomes (`queueRef.current` →
`ports.queue()`, `sendRef.current(` → `ports.send(` etc.) e comparou o corpo antigo (`HEAD`) com o
novo — **idêntico**, comentários inclusos. `readQueue`/`writeQueue` ganharam `export` (só isso).
`tsc` e `eslint` passaram.

`session-queue-drain.demo.test.ts` roda o laço **real** e as funções de armazenamento **reais** com
um `localStorage` em memória e um envio falso. A montagem do hook (fila lida do aparelho na
montagem; `persist` = ref + aparelho) é reproduzida em 8 linhas, não executada — sem
infraestrutura de componente, é o limite.

| Teste (afirma o comportamento ATUAL) | Resultado |
| --- | --- |
| S2 — a instância desmontada continua; a nova reenvia o que estava em voo e a fila de uma apaga a da outra | ✅ passa: o mesmo `iniciar_descanso` enviado **duas vezes**; a série 3 registrada pela nova some do aparelho quando a antiga grava a sua cópia; a antiga segue enviando |
| S1 — a fonte: "Finalizar" navega no mesmo clique e a revisão só limpa a fila | ✅ passa (varredura da fonte, sem comentários) |
| S1 — série presa no aparelho (rede caiu) some quando a revisão finaliza | ✅ passa: `salvo_no_dispositivo`, a série no aparelho, `clearSessionQueue` → vazio, uma única tentativa de envio |
| S1 — o laço antigo continua depois de finalizar: o servidor recusa e a fila RESSUSCITA | ✅ passa: o aparelho é limpo, a antiga regrava `[serie-4, descanso-5]`, a série 4 é recusada ("Este treino já foi encerrado."), e sobra `[descanso-5]` de uma sessão encerrada |

**O que não foi demonstrado em node:** que o diálogo de finalizar nunca chega a ser visto (exige
navegador). É consequência direta do `<Link onClick>` sem `preventDefault`, e entra no roteiro de
conferência manual (§13).

**Destino:** no passo 1 esses quatro testes viram a caracterização **vermelha** (afirmando o
comportamento desejado), no commit `(1/2)`; o conserto vem no `(2/2)`.

---

## 6. A forma de cada item

### 6.1 D1 — a sessão ao vivo (no principal, sem roteador)

Arquivos novos (puros, sem React, testados em node):

- `session-queue-drain.ts` — o laço (já extraído) **e** o registro de filas por sessão (§ c).
- `session-mutations.ts` — `sendSessionMutation(sessionId, mutation)`: o `switch` de
  `session-live-client.tsx:134-162` **movido sem mudança** (conferido por script), para a revisão
  usar a mesma tradução de mutação em action.
- `session-queue-view.ts` — as regras que a tela consome: `estadoExibido`, `pendentesTexto`,
  `podeEncerrar`, `optimisticPatch`, `optimisticFromQueue`, `avisosDoFimDoDescanso`.

**(a) Finalizar.** A `FinishBar` vira `<Button variant="ghost" className="h-12 shrink-0"
onClick={onFinish}>` — **sem `<Link>`** (nas duas ramificações). O `ConfirmFinishDialog` recebe a
fila: com `pending > 0`, mostra o quadro "**N registros** ainda estão só neste aparelho. A revisão
envia todos, na ordem, antes de finalizar." + o `SyncStatus` + o botão **"Enviar agora"**
(`queue.flush`). "Revisar e finalizar" continua sendo o `<Link>` do diálogo (o desenho da prévia,
`sessao-*` seção 2).

**(b) A revisão assume a fila.** Em sessão **não encerrada**, a revisão monta
`useSessionQueue(session.id, sendSessionMutation, router.refresh)` — vira a dona da fila (§ c) e
drena na montagem, pela mesma ordem. Em sessão encerrada ela não assume nada (não há o que enviar a
um treino encerrado).
- `podeEncerrar({ pending, state })` → `{ ok: true } | { ok: false, motivo }`: com fila pendente,
  `motivo = "N registros deste aparelho ainda não chegaram ao servidor."`. **Finalizar e salvar**
  e **Encerrar guardando o que foi feito** consultam a função antes de chamar a action; recusados,
  mostram o motivo e o `SyncStatus` na barra fixa (o desenho da prévia, seção 3). O botão de
  finalizar fica desabilitado enquanto há pendência, com o motivo escrito ao lado.
- **Descartar** continua possível com fila pendente; o diálogo de descarte ganha a frase "Os N
  registros que estão só neste aparelho também serão descartados."
- `clearSessionQueue` continua sendo chamado **depois** de finalizar, encerrar ou descartar — agora
  sobre uma fila já vazia, salvo no descarte.

**(c) Um enviador por sessão na aba.** Em `session-queue-drain.ts`, um registro por sessão
(`criarRegistroDeFilas()`, com uma instância padrão no módulo e instâncias novas nos testes):
- a instância que monta **assume** a fila (`assumir(sessionId) → posse`) no efeito de montagem e a
  **solta** no de desmontagem; a mais recente é a dona;
- o laço checa a posse **antes de cada envio**: sem posse, para;
- o envio em andamento fica registrado (`voo`); se a instância perdeu a posse durante o envio, ela
  **não grava nada** — o desfecho fica no registro;
- a nova dona, ao começar a drenar, **espera o voo** da sessão, aplica o desfecho (retira o id do
  aparelho se o servidor respondeu; mantém se foi falha de rede) e **relê a fila do aparelho**
  antes do primeiro envio;
- **só a dona escreve** — por isso a cópia de uma instância nunca apaga o que a outra registrou.

⚠️ **Consequência declarada:** sair da tela da sessão (para outra seção de `/treinos`) **pausa** o
envio até voltar à sessão ou abrir a revisão. Hoje o envio "continuava" — justamente pelo defeito
S2. A fila não se perde: ela está no aparelho e a próxima dona a envia.

⛔ Invariantes preservadas: uma mutação por vez, em ordem estrita; `persist` continua o único
escritor de `queueRef`; `client_mutation_id` intocado; nenhuma action muda.

**(d) Remontar mostra o que está na fila.**
- `optimisticPatch(status, payload)` — a conversão que `registerSet` faz hoje (payload → valores
  da série), extraída para não haver duas cópias; `optimisticFromQueue(fila)` aplica-a a cada
  `registrar_serie` da fila, na ordem (a última de cada série vence).
- A camada otimista é **semeada uma vez, depois da hidratação**, a partir da fila do aparelho
  (ajuste de estado durante o render, o padrão que `useLazyDialog` já usa — sem `setState` em
  efeito). Depois disso ela funciona como hoje (limpa quando a fila esvazia e o `router.refresh`
  chega).
- `estadoExibido(state, pending)`: `"salvo"` com `pending > 0` vira `"salvo_no_dispositivo"` — é o
  "nasce do tamanho da fila". O texto passa a dizer **"· N a enviar"** (`pendentesTexto`).
- ⛔ **Sem divergência de hidratação:** o servidor não vê o aparelho. O hook expõe a fila e o
  pendente só depois de hidratado (`useSyncExternalStore` com instantâneo de servidor vazio — o
  idioma de `floating-assistant-panel.tsx:63`). O primeiro render do cliente é igual ao HTML do
  servidor; o seguinte já mostra a fila.
- `SyncStatus`: o texto (rótulo + pendentes) vai num `<span role="status" aria-live="polite">`;
  o erro continua ali, sem a cópia `sr-only` separada.

**(e) Descanso.** `{activeRest && <RestPanel key={activeRest.id} … />}`. **(e')**
`avisosDoFimDoDescanso({ isOver, isRunning, jaAvisou, jaAvancou, vencidoNaMontagem, autoAdvance })`
→ `{ tocar, avancar }`: descanso que **já tinha acabado quando o painel montou** não toca nem vibra
(`tocar=false`), mas o avanço automático continua acontecendo uma vez (`avancar` como hoje). Dois
refs no lugar de um (`avisou`, `avancou`); o tique continua isolado no `RestPanel`.

⛔ Não muda: `timers.ts`, `session-machine.ts`, `session-flow.ts`, as actions, a ordem da fila, o
tique isolado.

**Contrato da sessão** (`src/test/sessao-ao-vivo-contratos.test.ts`, por varredura sem
comentários): a `FinishBar` não contém `<Link`; o `RestPanel` tem `key={activeRest.id}`; a revisão
importa `useSessionQueue` e `podeEncerrar` e os chama antes de `finishSession`/`abandonSession`;
`SyncStatus` tem `aria-live="polite"`; os 5 diálogos da sessão continuam com import estático.

### 6.2 D2 — diálogos sob demanda

- **Molde** (o da 07-B): `const X = dynamic(() => import("…").then((m) => m.X), { ssr: false })`
  com o objeto literal ali mesmo e o comentário padronizado da 07-B; `const montado =
  useLazyDialog(aberto)` e `{montado && <X … />}`. ⛔ Nunca `{aberto && <X/>}` sozinho.
- **Os 27 locais** (diário 4, planejamento 6, medidas 3, metas 2, refeições 3, substituições 2,
  calendário 4, `RecordProgressDialog`, `RegisterMeasurementDialog`, `PantryFormDialog`) saem para
  arquivo próprio **por movimento**: o corpo idêntico, conferido por script byte a byte (como na
  07-B); só `export` e imports mudam. O que só o diálogo usa vai com ele; o que a tela usa fica.
- **Também viram lazy:** os diálogos já em arquivo próprio montados estaticamente (pickers
  compartilhados, `ShoppingItemDialog`, `MarketCategoriesDialog`, `ShoppingGenerateDialog`,
  `RecipeFormDialog`, `RecipeDetailSheet`, `SubstitutionCompareDialog`, `ScheduleMealDialog`,
  `MeasurementTypesDialog`, os 3 de `ProgressPhotos`, `BarcodeScannerDialog`,
  `DeleteWithDestinationDialog` nos dois lugares).
- **`SortableList`** por `next/dynamic` em `shopping-client.tsx` (só com `reordering`) e em
  `programs-client.tsx` (só no cartão expandido). No construtor continua estático (aparece sempre);
  o `@dnd-kit` do calendário fica (a visão padrão o usa).
- **Os 13 que fecham secos** passam a manter o último item até o fim da animação, com
  `useItemRetido(item)` (novo, `src/components/shared/use-item-retido.ts`): guarda o último valor
  não nulo por ajuste de estado durante o render, sem efeito. Vale também para o `SubstituteSheet`
  da sessão (é só renderização; continua estático).
- **Exceções declaradas:** os 5 da sessão ao vivo (offline no meio do treino); `TodoLinkDialog`
  (o botão mora nele); confirmações escritas **inline em JSX** (não são componente nem import).
- **Varredura** (`src/test/dieta-treinos-dialogos.test.ts`, sem comentários), em
  `app/(app)/{nutricao,treinos}/**` e `components/{nutrition,training,body}/**`:
  1. nenhum import **estático** de valor de módulo `*-dialog`/`*-sheet`/`*-form`/`*-picker`
     (import de tipo pode; as exceções nomeadas têm de continuar casando);
  2. nenhuma **função** `…Dialog`/`…Sheet` definida dentro de arquivo de tela (os locais saíram),
     salvo `ConfirmFinishDialog` (sessão);
  3. por arquivo, nº de `useLazyDialog(` ≥ nº de `dynamic(` que carregam diálogo;
  4. os 5 da sessão **não** usam `dynamic` (é o que M7 derruba);
  5. fixtures provando que diz sim e não.

### 6.3 D5 — erros de formulário

- Toda chamada de action que **pode** devolver `fieldErrors` passa por `mapServerFieldErrors(res.fieldErrors, CAMPOS)`, com `CAMPOS` = os campos que **aquela tela** tem, escritos no arquivo.
  - **RHF** (os 5 de Treinos, já feitos; o de alimento): `setError` nos `toSet`; toast com `serverErrorMessage`.
  - **`useState`/`FormData`**: a mensagem aparece **sob o campo** onde a tela já tem lugar (os 3 diálogos de medidas, o upload de foto, `measure-dialog`), em estado local (`Record<string,string>`), com `aria-invalid` e `aria-describedby`; nos demais, toast com `serverErrorMessage` — que, sem campo na tela, diz `campo: mensagem real`.
  - **G1:** `food`/`nutrients` entram em `CAMPOS` como raízes; a mensagem aparece num aviso no topo da seção correspondente do formulário e no toast. **Sem `handleSubmit`** (ligar o resolver muda a validação; registrado).
- **Varredura** (`src/test/dieta-treinos-formularios.test.ts`): deriva das fontes de `src/lib/actions/{nutrition,training,body}*.ts` (só leitura) **quais actions exportadas chamam `invalid(`**; todo arquivo de tela dos dois módulos que importa uma delas e lê `.ok`/`.error` tem de importar `mapServerFieldErrors`, salvo exceção declarada com motivo. Guarda anti-tautologia: piso de arquivos encontrados, **contado no commit que a introduz** (não estimado aqui); fixture que diz sim e não.
- `round-trip.test.ts` não muda (é da 03-C).

### 6.4 D3 — alternâncias

- **`SeletorDeVisao`** em `diary-client.tsx` (`rotulo="Visão do diário"`, `DIARY_VIEWS`/`DIARY_VIEW_LABELS`), `planning-client.tsx` (`PLANNING_VIEWS`/`PLANNING_VIEW_LABELS` — que ganha leitor) e `calendar-client.tsx` (visões e rótulos locais; a página continua validando como hoje). `aoEscolher` chama o `goTo`/`setParam` que já existem: `?visao=` igual, `push`/`replace` iguais.
- **`aria-pressed`** nas alternâncias do §4/A1 (liga/desliga e escolha única). "Mostrar encerradas" ganha rótulo fixo. **`aria-current`**: "exercício atual" (`exercise-list-sheet`, `"step"`), período selecionado das metas (`"true"`).
- **V1 estendida** (`seletor-de-visao.test.ts`, que pode ser estendido):
  - assinatura **B** (`bg-primary/10` e `text-foreground` no corpo do `.map`) e **C** (`variant={… ? "…" : "…"}` na **abertura** do `<Button`, ignorando `<Badge>` e `"destructive"`), cada uma com fixture que pega e com fixture que não pega;
  - o teto de 8.000 caracteres sobe (medido o que aparece); corpo acima do novo teto **falha**, em vez de ser pulado;
  - `EXCECOES_MUDAS` ganha `components/ai/action-history-client.tsx` (dono: 07-D, são `<Link>` → `aria-current="page"`);
  - `TELAS` ganha os 3 arquivos que passam a usar o seletor.
- As alternâncias **soltas** (fora de `.map`) corrigidas entram em `CONTRATOS` (§6.10).

### 6.5 D4 — calendários

- **Mês do diário:** `tomDaCelula(cell)` (puro, `components/nutrition/tons-do-mes.ts`) devolve a **chave** da faixa com os mesmos limites de hoje (`cellIntensity`/`goalPercent` lidos, não reescritos); `TONS_DO_MES` (chave → classe → rótulo) é a **única** fonte da célula e da legenda. "Pendente" e "hoje" entram na legenda. `textoDaCelulaDoMes(cell, hoje)` (puro, `components/nutrition/rotulos-do-mes.ts`) diz data, hoje, fora do mês, energia/meta, itens, pendentes e "planejado sem registro". O `role="grid"` sai: grupo nomeado (`role="group" aria-label="Dias de outubro de 2026"`), cabeçalhos `aria-hidden`.
- **Treinos** (`components/training/rotulos-do-calendario.ts`, puro): texto da coluna da semana, da célula do mês (com cada treino e seu status), do botão de adicionar (data escrita, não ISO), do dia da consistência e dos chips de série.
- **Hoje** = `data === hoje` com `hoje` do servidor, **injetado**: `aria-current="date"`, o anel que já existe e a palavra — na semana de Treinos, numa linha "Hoje" sob o cabeçalho da coluna (desenho da prévia); na consistência, no texto do dia e na legenda; no planejamento, na faixa "Sua semana" e no calendário do histórico, a palavra visível.
- **Mês de Treinos:** o chip ganha um ícone de status (concluído, não realizado, atrasado, reagendado, cancelado) — a palavra está no texto da célula e no `title`.
- **G2:** `statusExibido(entry, hoje)` (puro, no mesmo arquivo) devolve `"descanso"` para `entryKind === "descanso"` sem passar por `derivePlannedStatus` (que não muda); o mês e a lista usam o tratamento neutro da semana.
- **Consistência:** a legenda ganha "Hoje" e "Ainda vai chegar"; o dia futuro ganha `ring-1 ring-inset ring-border` (desenho da prévia); os cabeçalhos de uma letra ganham o nome inteiro em `sr-only`.
- **Dias da semana:** `aria-current="date"` no diário (que já escreve "Hoje") e no planejamento (que passa a escrever).
- **`AdherenceBadge`:** nome acessível "aderência de N%"; as faixas não ganham palavra (julgamento — invariante 25 da Dieta). A cor continua sendo ênfase do número.

### 6.6 D6 — links e query string

- `nutrition-links.ts` (07-C): `waterLink()` → `/habitos?view=agua` e
  `planningWeekLink(semana)` → `/nutricao/planejamento?data=${semana}&visao=semana`. Testes em
  `nutrition-links.test.ts`: `agua ∈ HABIT_VIEWS`, `semana ∈ PLANNING_VIEWS`.
- `notifications/nutrition.ts:255` passa a `link: planningWeekLink(week.weekStart)`. **Só
  notificações novas** levam o link novo; as já gravadas mantêm o antigo (que continua funcionando).
- `nutricao/page.tsx:217,227` e `diary-client.tsx:1206,1231` → `waterLink()`;
  `integrations-card.tsx:102` → `/habitos?view=gerenciar`.
- **Contrato** (`deep-links-query-string.test.ts`, estendido; **nenhum segundo extrator** —
  `lerLinks`/`VALOR_DE_EXEMPLO`/`semComentarios` de `links-inline.ts`):
  - `ARQUIVOS` ganha `notifications/nutrition.ts` e `notifications/training.ts`;
  - `lidosPela` aprende `params.<nome>`, `params?.<nome>` e a desestruturação `{ a, b } = await searchParams`;
  - `paginasComVisao` aprende `visao` (validada por `as*View`/`*_VIEWS` ou pelos ternários do calendário);
  - piso por rota contado no commit que o introduz (anti-tautologia);
  - `visao` literal tem de pertencer ao conjunto da página (é o que M14 derruba ao voltar a ter só `data`).
- `nutrition-links.test.ts`/`training-links.test.ts`: cada parâmetro de cada construtor tem de ser
  **lido** pela página de destino ou pelo client dela; `programa` (G4) é exceção nomeada.
- Links da IA com `?date=` e links de Treinos montados na IA: **registrados** para a 07-D.

### 6.7 L2 + G5 — campos numéricos e datas

- `food-filters.tsx`: os 4 campos (kcal/proteína mín./máx.) passam por `useUrlText` — o número vai
  como texto e é convertido na leitura, como hoje. As 11 `Label` do popover ganham `htmlFor`/`id`
  (os `SelectTrigger`, `id` ou `aria-label`).
- `history-client.tsx` (G5): "Duração mínima", "Volume mínimo" e De/Até pelo mesmo caminho;
  `FilterField` passa a associar o rótulo; `FilterSelect` ganha `aria-label`.
- Contrato: nenhum `onChange` desses campos chama a função que grava na URL diretamente.

### 6.8 G — gráficos

- **Treinos:** `EquivalentTable` sai do `-impl` para a fachada `training-charts.tsx` (regra 1: o
  que não usa `recharts` fica na fachada); a fachada renderiza a tabela + o gráfico dinâmico. O
  `-impl` fica só com o `recharts`. Contrato: a tabela existe na fachada **e não** no `-impl`.
- **Dieta (`nutricao/relatorios/reports-client.tsx`):** a alternativa textual nasce **no client da
  Dieta** (a fachada `components/reports/**` é compartilhada com `/relatorios`, 03-C): uma
  `<table className="sr-only">` por gráfico de barras (dia × kcal, mesma formatação), e a
  `MeasurementTable` da fachada de `body/measurement-chart` ao lado do gráfico de medida; o `Select`
  de tipo ganha `aria-label`. Só apresentação.

### 6.9 T — textos

- `integrations-card.tsx:93-96` passa a dizer: *"Ao concluir, reabrir, abandonar ou excluir um
  treino, o check-in daquele dia é recalculado a partir das sessões concluídas: o valor marcado à
  mão é substituído, e o registro do dia é apagado (com a observação) se não restar treino
  concluído."* — a mesma substância de `vinculo-treinos.tsx` (07-B), lida em `habit-sync.ts`.
- **Contrato** `src/test/vinculo-treinos-frases.test.ts`: lê as duas frases (sem comentários, sem
  importar um módulo no outro) e exige nas duas "substitu", "apagad" e "abandon". Fecha o risco
  residual da 07-B.
- `revisar/page.tsx:58`: "Resumo do que foi registrado. O histórico completo fica em Treinos →
  Histórico." `calendar-client.tsx:951-952` e `builder-client.tsx:376-377` perdem o "chega na
  Subfase 17-C" (o texto descreve o que a sessão faz hoje).
- Saem: `NutritionSectionPlaceholder`, `TrainingSectionPlaceholder`, o card "O que ainda vem" (e o
  `upcoming` que só ele lê) e `NUTRITION_SECTION_STATUS_LABELS`. **Ficam** os campos
  `status`/`phase` das seções (`module-shell.test.ts` lê `status`, D24).

### 6.10 V — alinhamento visual (um commit por grupo)

- **Grupos:** Diário e Planejamento · demais telas da Dieta · Sessão, Preparar e Revisar · demais
  telas de Treinos.
- **`EmptyState`** nas seções vazias (critério da 07-A/07-B): solta `className="py-8"`; dentro de
  `Card` `className="border-0 bg-transparent py-6"` — inclusive os 5 `EmptyState` já existentes
  dentro de Card. Item de lista repetida, picker e diálogo ficam `<p>` (declarados no contrato).
- **Barras:** nome acessível (`aria-label` com o nome da coisa medida) nas 5 do mapa + a de
  medidas; `GoalProgressBar`: `aria-valuenow` limitado a `aria-valuemax`, com `aria-valuetext`
  dizendo o percentual real ("120% da meta"); alvo 0 → sem "0%".
- **Recorde/favorito:** `sr-only` "Recorde pessoal" / "Favorito" ao lado dos 5 ícones.
- **Regra 2 e linhas que quebram:** os `justify-between` com grupo `shrink-0` do §4 ganham
  `min-w-0` no texto e `flex-wrap`; **G6**: os `CardHeader` viram `flex flex-row flex-wrap
  items-start justify-between gap-2 space-y-0` (+ `min-w-0` no bloco do título).
- **Contratos** (`src/test/dieta-treinos-contratos.test.ts`, molde `CONTRATOS` + `PROIBIDOS` da
  07-B, sem comentários): cada correção de 6.4–6.10 que alguém desfaria sem perceber.

---

## 7. Mutações — o critério de aceite

Aplicadas **uma a uma**, cada uma **compilando** (`npx tsc --noEmit` antes do vitest). Registra-se
o **nome** de cada teste que cai. Restauração com `git restore`, conferida por `git diff --quiet`,
**nunca** pelo verde. Mutação verde é **medida** antes de ser chamada de fraqueza (D28). Nenhuma
decisão saiu "não", então nenhuma das 18 do briefing cai.

| # | Mutação | Tem de derrubar |
| --- | --- | --- |
| M1 | "Finalizar" volta a ser `<Link>` para a revisão | `sessao-ao-vivo-contratos.test.ts` |
| M2 | a revisão volta a finalizar com a fila do aparelho pendente (`podeEncerrar` → sempre ok) | `session-queue-view.test.ts` (+ contrato da revisão) |
| M3 | a instância desmontada volta a continuar gravando a fila (posse ignorada) | `session-queue-drain.test.ts` (S2) |
| M4 | o `RestPanel` perde a `key` | `sessao-ao-vivo-contratos.test.ts` |
| M5 | o `SyncStatus` volta a nascer "salvo" com pendência (`estadoExibido` identidade) | `session-queue-view.test.ts` |
| M6 | um diálogo fora da sessão volta a import estático | `dieta-treinos-dialogos.test.ts` |
| M7 | um diálogo da sessão passa a `next/dynamic` | `dieta-treinos-dialogos.test.ts` (a exceção) |
| M8 | um formulário volta a só `toast.error(result.error)` | `dieta-treinos-formularios.test.ts` |
| M9 | as visões do diário voltam a `.map(<button>)` próprio | `seletor-de-visao.test.ts` (V1, assinatura B, e `TELAS`) |
| M10 | a visão do calendário perde o anúncio, com `variant=` | `seletor-de-visao.test.ts` (assinatura C) |
| M11 | a legenda do mês do diário volta a ter classes próprias | `tons-do-mes.test.ts` / contrato da legenda |
| M12 | hoje perde `aria-current="date"` na consistência | `dieta-treinos-contratos.test.ts` |
| M13 | "Registrar em Hábitos" volta a `/habitos` sem `view` | `dieta-treinos-contratos.test.ts` (links por `href`) |
| M14 | `notifications/nutrition.ts` volta a montar o link à mão | `deep-links-query-string.test.ts` + `deep-links-inline.test.ts` |
| M15 | o campo numérico volta a gravar na URL a cada tecla | `dieta-treinos-contratos.test.ts` |
| M16 | a tabela equivalente volta para dentro do `-impl` | `dieta-treinos-contratos.test.ts` |
| M17 | uma gaveta volta a pedir largura sem prefixo | `sheet-largura.test.ts` |
| M18 | a frase do `integrations-card` perde "apaga" | `vinculo-treinos-frases.test.ts` |
| M19 | (e') descanso vencido ao montar volta a tocar | `session-queue-view.test.ts` |
| M20 | (G2) o mês volta a passar descanso por `derivePlannedStatus` | `rotulos-do-calendario.test.ts` |
| M21 | (G6) um `CardHeader` perde o `flex` | `dieta-treinos-contratos.test.ts` |
| M22 | (G5) um campo do histórico volta a gravar na URL a cada tecla | `dieta-treinos-contratos.test.ts` |
| M23 | o `SyncStatus` perde `aria-live` | `sessao-ao-vivo-contratos.test.ts` |
| M24 | um dos 13 volta a `return null` sem item retido | `dieta-treinos-contratos.test.ts` |

M19–M24 são acréscimos deste spec (decisões e pontos do §3 que precisam de quem os segure).

---

## 8. Orçamento de bundle

| Rota | Antes | Regra | Expectativa |
| --- | --- | --- | --- |
| `/(app)/nutricao/compras` | 242,8 | **tem de cair** | `@dnd-kit` (só em "Reordenar") + 4 diálogos saem do 1º carregamento |
| `/(app)/nutricao/diario` | 234,8 | ≤ antes | 7 diálogos saem; `SeletorDeVisao` (~1 KB) entra |
| `/(app)/treinos/calendario` | 230,9 | ≤ antes | 4 diálogos saem; `SeletorDeVisao` entra; `@dnd-kit` fica |
| `/(app)/treinos/sessao` | 221,5 | ≤ antes | nenhum diálogo sai (exceção); entram as regras puras e o registro (pequenos) — medido |
| `/(app)/configuracoes` | 282,0 | ≤ 285, **sem subir o teto** | ~0 (nenhum arquivo dela é tocado) |
| demais | — | 250 | nenhuma fora; nenhuma das 30 sobe |

Medido **depois de cada passo que toca runtime**, com os números no corpo do commit. Variação
uniforme de +0,1 KB em rota não tocada só vale como ruído **se provada** (build da base e do depois
no mesmo ambiente, chunks com o mesmo tamanho cru). ⚠️ `/treinos/sessao` é o ponto mais apertado:
se a D1 a fizer subir, o passo para e o número é reportado antes de seguir.

---

## 9. O que NÃO muda

- ⛔ **Nenhuma migration.** Nenhuma Server Action nova ou alterada; `src/lib/actions/{nutrition,training}*.ts` só lidos.
- ⛔ `timers.ts`, `session-machine.ts`, `session-flow.ts`, a ordem da fila e o `persist`; `habit-sync.ts` (G7 registrado); `calc.ts`, `snapshot.ts`, `metrics.ts`, `records.ts`, `goals.ts`, `shopping.ts`. Nada em `src/lib/{nutrition,training,body}/**` muda de comportamento (a única edição prevista ali é tirar `NUTRITION_SECTION_STATUS_LABELS`, sem leitor).
- ⛔ As fotos (invariantes 21 e 29): URL assinada a cada leitura, `storage_path` fora do client. Os 3 diálogos de `ProgressPhotos` só mudam de **quando** carregam.
- ⛔ **Nenhuma rota morre e nenhum parâmetro deixa de ser aceito** (Dieta: `visao`, `data`, `aba`, `lista`, `alimento`, `receita`, `modelo`, `plano`, `tipo`, `periodo`, `de`, `ate`, filtros de alimentos; Treinos: `visao`, `data`, `programa`, filtros do histórico, `meta`, `recorde`, `id`, `treino`, `planejado`).
- ⛔ **Arquivos que não são editados** — 03-C: `src/lib/finance/**`, `src/lib/dashboard/**`, `src/lib/actions/transactions*.ts`, `src/lib/validators/split.ts`, `src/lib/validators/round-trip.test.ts`, `src/test/supabase-em-memoria.ts`, `src/app/(app)/{dashboard,financeiro,relatorios}/**`, `src/components/{financeiro,dashboard}/**`; 03-B2: `src/lib/notifications/{generate,cron}.ts`, `src/lib/search/queries.ts`, `src/lib/reports/**`; 07-D: `src/lib/ai/**`, `src/components/ai/**`, `src/app/(app)/{ia,configuracoes,notificacoes,busca}/**`, `floating-assistant*.tsx`; 07-B: `src/app/(app)/{habitos,estudos}/**`, `src/components/{habits,studies}/**`, `src/lib/{habits,studies}/**`; compartilhados (usar, não editar): `module-shell`, `seletor-de-visao`, `abas-de-rota`, `sortable-list`, `empty-state`, `chart-skeleton`, `use-lazy-dialog`, `src/components/reports/**`, `src/lib/nav/**`.
- ⛔ `floating-assistant*.tsx`, os 11 ids de `DASH_CARD_IDS`, a casca, `nav.ts`. `docs/redesign/STATUS.md` não é editado. Commits da 07-A/07-B não são reescritos.
- Sem push, sem merge, sem deploy, sem upstream.

---

## 10. A prévia

Dados **sintéticos**, marcados na imagem ("PRÉVIA REDESIGN-07-C · DADOS SINTÉTICOS — nada aqui é
registro real"). Gerada fora do repositório (scratchpad; cópia em `C:\tmp\previa-07c\`):

- HTML estático cujo **"antes" é lido do código do worktree**: as classes de `Button`/`Badge` (o
  `cva(` real), de `Card`/`Dialog`/`Sheet` (o primeiro literal do `cn(` de cada primitiva) e das
  telas (cada literal é exigido no arquivo — o gerador **falha** se ele sumir), combinadas pelo
  `twMerge(clsx())` real; ícones pelo `__iconNode` do `lucide-react` do worktree.
- O `src/app/globals.css` real compilado com `postcss` + `@tailwindcss/postcss` do `node_modules`.
- Chrome headless, claro/escuro × 1280/390 (a 390 num `iframe`); foco por `el.focus()` no load.

Mostra: **sessão** (barra de finalização com o foco visível, diálogo com 3 registros no aparelho,
revisão com fila pendente, `SyncStatus` nos 4 estados); **Dieta** (visões do diário e do
planejamento com o foco num `SeletorDeVisao`, mês do diário com a legenda nova, e o G6 com o CSS
real); **Treinos** (visões do calendário, semana com "Hoje" na largura real do conteúdo a 1280 —
≈752 px — e consistência com hoje e o contorno do futuro); **gaveta** (384 px → 576 px, medido).
20 fotos; **não** são commitadas (repositório público).

Conferido nas fotos: o anel de foco aparece nos dois temas; a 390 nada empurra a página; o G6 é
real (o botão cai para baixo do título e estica); na semana, a proposta inicial de `min-w-0
truncate` no rótulo **piorava** ("Se…") e foi retirada — o rótulo continua quebrando em duas
linhas, como hoje.

⚠️ Antes de fechar o passo 10, o gerador é **reapontado para o código final** e a prévia é
refotografada a partir dele.

---

## 11. Risco residual

| Risco | Por que fica |
| --- | --- |
| Duas **abas** com a mesma sessão continuam sendo dois enviadores | O registro da D1 é por aba (módulo JS). Entre abas, só a idempotência de `registrar_serie`/`adicionar_serie` protege |
| Recarregar no meio de um envio não idempotente (iniciar/ajustar descanso, mover, adicionar exercício) ainda reenvia | O desfecho em voo vive na memória da aba; resolver exige idempotência no servidor, e as actions estão fora do lote |
| Sair da sessão pausa o envio até voltar a ela ou à revisão | É a troca que fecha o S2 (§6.1 c); a fila fica no aparelho |
| `preparar` pode encerrar uma sessão em andamento sem olhar a fila dela | Registrado (§4 R) |
| A conferência de "o diálogo nunca aparece" e da animação de cada diálogo lazy | Comportamento de navegador; sem teste de componente, fica na conferência manual (§13) |
| A V1 vê três assinaturas, não todas | Alternâncias soltas ficam presas pelos contratos do módulo, não pela varredura |
| `href=` fora do extrator (G10 da 07-B) | Os 4 links da água são `href=`; ficam presos por `CONTRATOS`, não por `lerLinks` |
| G1 sem resolver | O formulário de alimento continua validando só no servidor; a mensagem passa a aparecer |
| Notificações já gravadas mantêm o link antigo do planejamento | O banco não é tocado; o link antigo continua abrindo a visão dia |
| Falha de ambiente CRLF | Não é código; confere-se que é a única e é a mesma |

---

## 12. Ordem (um commit por passo)

Cada passo fecha com `npx vitest run` verde nos diretórios tocados (salvo a falha de ambiente),
`tsc`, `eslint` nos arquivos tocados e `git diff` revisado — nada de `.env`, chave, token ou
`service_role`. Passo que toca runtime mede build + bundle. ⛔ Nenhum arquivo é editado durante
build ou durante dispatch do roteador.

0. Este desenho (só docs).
1. **D1, no principal:** caracterização `(1/2)` vermelha pelo motivo certo (S1–S4) e conserto `(2/2)` — um par por achado se não couberem juntos.
2. **D2** — diálogos sob demanda + `dieta-treinos-dialogos.test.ts`. Bundle antes × depois.
3. **D5** — erros de formulário + `dieta-treinos-formularios.test.ts`.
4. **D3** — alternâncias + V1 estendida.
5. **D4** — calendários.
6. **D6** — links e contrato + **L2/G5** — campos numéricos e datas.
7. **D7** — gavetas (+ `sheet-largura.test.ts` sem as 6 exceções, no mesmo commit).
8. **G** e **T**.
9. **V** — Diário e Planejamento · demais da Dieta · Sessão, Preparar e Revisar · demais de Treinos (um commit cada).
10. Mutações M1–M24, uma a uma; os cinco comandos; `TZ=UTC npx vitest run` nos testes tocados; prévia refotografada do código final.

**Roteador:** cada passo substancial passa pelo `ai-router-br:route`, com o TASK PACKAGE fatiado por
passo. Desenho, decisões, acessibilidade e **o passo 1 inteiro** ficam no principal. Cada
`summary_line` é copiada literalmente no commit e na entrega, inclusive a de dry-run de passo que
ficar com o principal.

---

## 13. O que o dono confere à mão (logado no `npm run dev` do worktree)

Entregue como lista; **não** declarado feito.

- **Sessão com rede ruim** (DevTools "Offline" ou "Slow 3G"): registrar séries, ir a outra seção e voltar — as séries feitas continuam feitas, o status diz quantas faltam enviar, nada é enviado duas vezes; finalizar com pendência — o diálogo aparece e diz quantas; na revisão, nada é perdido (ela envia antes e só então finaliza).
- **Sessão, recarregar no meio de um descanso:** o cronômetro continua do mesmo ponto; o descanso já vencido não bipa de novo.
- **Dois descansos seguidos (modo "avisar"):** o fim de cada um avisa.
- **Diálogos:** cada um abre e fecha com animação, sem piscar, na 1ª e na 2ª vez — inclusive os 13 que hoje fecham secos.
- **Erros:** um erro do servidor em campo que a tela não tem sobe para o toast com o nome do campo e a mensagem real.
- **Calendários:** estado e hoje legíveis sem depender da cor, claro e escuro; dia de descanso passado no mês/lista de Treinos **não** diz "Atrasado".
- **Alternâncias:** diário, planejamento e calendário por teclado (Tab + Espaço), com `?visao=` preservado ao recarregar.
- **Links:** "Registrar em Hábitos" cai na água; a notificação de planejamento (nova) cai na semana.
- **Filtros:** digitar "150" rápido no kcal de Alimentos e na duração mínima do Histórico não perde dígito.
- **Gavetas:** abrem na largura nova a 1280 e continuam cabendo a 390.
- **Celular:** a 390, nenhuma linha empurrando a página na horizontal (inclusive a barra da revisão).
