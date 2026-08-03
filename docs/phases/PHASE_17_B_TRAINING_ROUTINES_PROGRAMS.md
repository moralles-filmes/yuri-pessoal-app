# Fase 17-B — Treinos · Programas, treinos-modelo e planejamento semanal

> Segunda das **6 subfases** da Fase 17. **Depende da 17-A concluída.**

## Contexto

A 17-A entregou o vocabulário e o catálogo: o sistema sabe o que é "Supino reto com barra" e
como esse exercício se mede. Falta a camada que transforma exercícios soltos em **rotina**:
o treino-modelo (Treino A — Peito e tríceps), o programa que agrupa vários treinos (ABC,
Push/Pull/Legs, Upper/Lower) e o planejamento da semana.

Aqui nasce a separação conceitual mais importante do módulo:

> **Modelo é intenção e muda quando eu quiser. Execução é fato consumado e nunca muda.**

Esta subfase constrói só o lado mutável. Mas constrói **sabendo** que a 17-C vai congelar um
snapshot dele — e é por isso que nenhuma tabela daqui pode ser referenciada de forma viva por
uma sessão passada.

## Objetivo

1. **Programas de treino** com objetivo, nível, período, status, frequência e ordem.
2. **Treinos-modelo** com exercícios, ordem, séries, faixa de repetições, cargas planejadas,
   descansos, RIR/RPE alvo, tipos de série, técnicas, supersets e alternativas.
3. **Planejamento semanal** — quais dias são de treino, qual treino em cada dia, dias de
   descanso, reagendamento, duplicação de semana e recorrência.
4. **Versionamento do modelo** para que editar um treino em uso não apague a intenção
   anterior.

## Dependências

- **17-A** — `training_exercises`, `training_exercise_prefs`, `training_preferences`,
  `src/lib/training/{constants,types,tracking,filters}.ts`.
- **Fase 15** — `src/lib/todo/recurrence.ts` como **referência de estilo** de recorrência pura
  em `Date.UTC`. A recorrência de planejamento de treino é própria e mais simples.
- **Fase 01** — `SortableList` (`@dnd-kit`) para reordenação com alça e alternativa por
  teclado.

## Escopo

### Schema (7 tabelas)

| Tabela | Papel |
| --- | --- |
| `training_programs` | Programa (ABC, PPL, Upper/Lower…). Objetivo, nível, período, status, cor, ícone. |
| `training_program_workouts` | Quais treinos compõem o programa, em que ordem e em que dias sugeridos. |
| `training_workouts` | Treino-modelo. Nome, apelido, objetivo, duração estimada, `version`, status. |
| `training_workout_exercises` | Exercício dentro do modelo: ordem, séries, faixa de reps, peso planejado, descanso, RIR/RPE, tipo de série, grupo de superset, aquecimento, conta no volume, incremento. |
| `training_workout_sets` | Configuração **por série**, quando as séries não são uniformes (top set + back-off, pirâmide, drop set planejado). Opcional: sem linha = séries uniformes. |
| `training_workout_alternatives` | Alternativas **daquele exercício naquele treino** (mais específico que a alternativa global da 17-A). |
| `training_scheduled_workouts` | Planejamento: data, treino, horário previsto, status, justificativa, ordem no dia. |

### Vocabulários

- **Objetivo**: hipertrofia, força, resistência muscular, condicionamento, manutenção,
  retorno, personalizado. **Organizacional apenas** — nunca apresentado como prescrição.
- **Nível**: iniciante, intermediário, avançado, não informado.
- **Status do programa**: rascunho, ativo, pausado, finalizado, arquivado.
- **Tipo de série** (11): aquecimento, preparatória, trabalho, top set, back-off, drop set,
  falha, AMRAP, isométrica, assistida, personalizada.
- **Técnica** (11): superset, bi-set, tri-set, circuito, drop set, rest-pause, cluster,
  pirâmide crescente, pirâmide decrescente, série unilateral, personalizada.
- **Status do planejado**: planejado, em andamento, concluído, não realizado, reagendado,
  cancelado. **"Em andamento" e "não realizado" são derivados na leitura** (ver regras).

### Lógica pura (com testes)

| Arquivo | Responsabilidade |
| --- | --- |
| `src/lib/training/workout.ts` | Resumo do modelo: total de séries, séries por grupo muscular, duração estimada (soma de execução + descanso), validação de superset, ordem canônica. |
| `src/lib/training/schedule.ts` | Semana de planejamento, recorrência (dias da semana, ciclo de N semanas, rodízio A/B/C), reagendamento, duplicação de semana, status derivado. |

### Interface

- `/treinos/programas` — lista, filtros, criar/editar/duplicar/ativar/pausar/finalizar/
  arquivar, reordenar treinos, ações em massa, nova versão.
- `/treinos/treinos` — lista de modelos, filtros, construtor de treino (arrastar exercícios,
  configurar séries, agrupar superset, definir alternativas), duplicar, mover para outro
  programa, ações em massa.
- `/treinos/calendario` — planejamento em semana, mês e lista; arrastar para reagendar;
  duplicar semana; aplicar modelo semanal; marcar descanso; registrar justificativa.
- `/treinos/hoje` — passa a mostrar o treino programado do dia (ainda **sem** iniciar sessão:
  o botão "Iniciar treino" chega na 17-C e até lá diz isso).

## Fora do escopo

| Item | Onde entra |
| --- | --- |
| Iniciar/executar sessão, cronômetro, registro de série | **17-C** |
| Snapshot histórico do modelo | **17-C** (é a sessão que congela) |
| Sugestão de carga a partir do último treino | **17-C** |
| Histórico, volume realizado, recordes | **17-D** |
| Metas e dashboards | **17-E** |
| Evento na agenda / tarefa no TO-DO a partir do planejado | **17-F** |

## Modelagem

### Programa → treino → exercício → série

`training_programs 1—N training_program_workouts N—1 training_workouts 1—N
training_workout_exercises 1—N training_workout_sets`

Um treino pode existir **sem** programa (treino avulso) e pode ser reaproveitado por mais de
um programa — por isso a tabela de junção, e não uma FK direta `workout.program_id`.
`training_workouts.program_id` existe apenas como "programa de origem" para a UI, e é
`set null` ao excluir o programa.

### Versionamento (`version` + `superseded_by`)

Editar um treino já usado **não** cria versão automaticamente — isso encheria o banco. O
usuário decide: "salvar alterações" (mesma versão) ou **"salvar como nova versão"**, que cria
uma linha nova com `version = anterior + 1` e marca a antiga como `superseded_by`. A antiga
fica arquivada e legível; o planejamento futuro aponta para a nova.

> Isto **não** é o que protege o histórico. O que protege o histórico é o snapshot da 17-C.
> O versionamento existe para o usuário comparar intenções ("meu ABC de janeiro × o de maio").

### Séries uniformes × séries configuradas

`training_workout_exercises.default_sets` cobre o caso comum (4×8-12, 90s). Quando o usuário
precisa de séries diferentes entre si, cada série ganha uma linha em `training_workout_sets`.
**Regra:** se existir ao menos uma linha, ela é a verdade e `default_sets` passa a ser só
metadado de exibição. Uma função pura (`expandPlannedSets`) resolve os dois casos num único
formato — a 17-C consome só esse formato.

### Superset e circuito

`superset_group` (texto curto: `A`, `B`, `C`) em `training_workout_exercises`. Exercícios com
o mesmo grupo e posições **contíguas** formam um bloco. `workout.ts` valida a contiguidade e
a UI impede salvar um superset furado.

### Planejado: status derivado

`training_scheduled_workouts.status` só grava **fato**: `planejado`, `concluido`,
`nao_realizado` (decisão explícita do usuário), `reagendado`, `cancelado`. **"Em andamento"**
vem da sessão ativa (17-C) e **"atrasado"** vem de `scheduled_date` + agora — nenhum dos dois
é gravado, exatamente como `atrasada` no TO-DO e o status da fatura.

## Regras de negócio

1. **Editar o modelo nunca altera execução passada.** Vale a partir da 17-C, e é por isso que
   nenhuma tabela desta subfase pode ser lida "ao vivo" por uma sessão histórica.
2. **Nenhuma exclusão silenciosa.** Excluir programa pergunta o destino dos treinos (manter
   avulsos / mover para outro programa / excluir tudo). Excluir treino-modelo com
   planejamento futuro pergunta o que fazer com os dias planejados.
3. **Objetivo e nível são organizacionais.** Nenhuma tela apresenta um programa como
   prescrição, garantia de resultado ou recomendação profissional.
4. **Reordenar é sempre reversível** e tem alternativa por teclado (acessibilidade).
5. **O planejamento original é preservado.** Reagendar grava `original_date` e o motivo; a
   linha não é reescrita como se sempre tivesse sido naquele dia.
6. **Duplicar cria identificadores novos** e não arrasta histórico, recordes nem vínculos
   mutáveis. A cópia nasce com "(cópia)" no nome e editável antes de salvar.
7. **Só um programa ativo por vez** é o default (`is_active`), mas o usuário pode ter mais de
   um se quiser — o sistema avisa em vez de bloquear.
8. **A configuração respeita `tracking_type`.** Um exercício de `duracao` não pede peso; um
   de `distancia_duracao` pede distância. A matriz é a da 17-A.

## Plano de implementação

1. Migrations das 7 tabelas + índices (`user_id`, `program_id`, `workout_id`,
   `(user_id, scheduled_date)`).
2. Puros: `workout.ts` e `schedule.ts` + testes.
3. Validators Zod, queries e actions (programa, treino, exercício do treino, série, planejado).
4. UI: construtor de treino, programas, calendário de planejamento, "Treino de hoje" parcial.
5. Verificação + documentação.

## Critérios de aceite

- [ ] Crio, edito, duplico, ativo, pauso, finalizo, arquivo e excluo programas.
- [ ] Crio um programa ABC com 3 treinos, defino a ordem e os dias sugeridos.
- [ ] Crio um treino-modelo com exercícios, ordem, séries, faixa de repetições, peso
      planejado, descanso, RIR/RPE alvo, tipo de série e observação.
- [ ] Agrupo dois exercícios em superset e o sistema recusa um superset não contíguo.
- [ ] Defino alternativas de exercício dentro do treino.
- [ ] Reordeno exercícios arrastando **e** pelo teclado.
- [ ] Salvo alterações como **nova versão** e a versão anterior continua legível.
- [ ] Planejo a semana: escolho os dias, associo um treino a cada dia, marco descanso.
- [ ] Reagendo arrastando no calendário e a data original fica registrada.
- [ ] Duplico uma semana inteira e aplico um modelo semanal.
- [ ] Marco um treino como não realizado com justificativa.
- [ ] Vejo o treino de hoje em `/treinos/hoje` com grupos musculares, nº de exercícios,
      total de séries e duração estimada.
- [ ] Excluir programa/treino nunca apaga nada sem eu escolher o destino.
- [ ] Filtros de programas e treinos combinados, com contagem.
- [ ] Ações em massa (arquivar, restaurar, excluir, duplicar, mover de programa).
- [ ] Dark/light, responsivo, pt-BR; suíte, lint, tsc e build verdes.

## Testes obrigatórios

**`workout.ts`** — total de séries com e sem `training_workout_sets`; `expandPlannedSets` nos
dois formatos; séries por grupo muscular (principal e secundário contados de forma distinta);
duração estimada = execução + descanso; superset contíguo válido / não contíguo inválido;
ordem canônica após reordenação.

**`schedule.ts`** — semana de planejamento com primeiro dia configurável; rodízio A/B/C;
ciclo de N semanas; recorrência por dias da semana; virada de mês e de ano; ano bissexto;
reagendamento preservando `original_date`; duplicação de semana; status derivado
(`atrasado` só quando a data passou e não há desfecho).

## Riscos

| Risco | Mitigação |
| --- | --- |
| Sessão histórica ler o modelo ao vivo e mudar o passado | Nenhuma leitura de histórico usa estas tabelas; a 17-C grava snapshot. Teste explícito na 17-C. |
| Versionamento automático inflar o banco | Versão só é criada por escolha explícita do usuário. |
| Superset quebrado gerando ordem impossível na sessão | Validação pura + bloqueio na UI. |
| Recorrência errar na virada de mês/ano | Aritmética em `Date.UTC`, sem `Date.now()` nas puras, testes de borda. |
| Excluir programa apagar treinos em uso | Escolha explícita do destino, com confirmação. |

## Arquivos de documentação a atualizar

Os mesmos da 17-A.

## Instruções para o próximo agente

Próxima: **17-C** (`docs/phases/PHASE_17_C_TRAINING_LIVE_SESSION.md`) — **a subfase mais
importante do módulo**.

O que você recebe pronto e não deve reimplementar: `expandPlannedSets` (formato único de
série planejada), a matriz de `tracking.ts`, a validação de superset e o status derivado do
planejado. **Ao iniciar a sessão, congele tudo isso num snapshot** e nunca mais leia o modelo
para renderizar uma sessão passada.
