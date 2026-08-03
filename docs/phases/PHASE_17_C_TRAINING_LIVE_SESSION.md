# Fase 17-C — Treinos · Preparação, sessão ao vivo, cronômetro e recuperação

> Terceira das **6 subfases** da Fase 17. **Depende das 17-A e 17-B concluídas.**
> **É a subfase mais importante do módulo** — é a tela que o usuário abre suado, com uma mão
> só, num celular, com Wi-Fi ruim, no meio da academia.

## Contexto

Até aqui o módulo é organização: exercícios, treinos, programas, planejamento. Esta subfase
é **execução**. E execução tem exigências que nenhuma outra tela do sistema tem:

- **Não pode perder dado.** Fechar a aba, bloquear o celular, cair a internet, o navegador
  matar a página em segundo plano — nada disso pode apagar uma série já feita.
- **Não pode errar o tempo.** Um cronômetro que conta com `setInterval` para quando a aba
  perde o foco. O descanso precisa nascer de **timestamps**, não de contagem local.
- **Não pode errar o fluxo.** Concluir a 3ª de 4 séries avança para a **4ª série**, não para o
  próximo exercício. Este é um critério de aceite literal do pedido.
- **Não pode exigir precisão.** Botões grandes, teclado numérico, poucos toques, alto
  contraste, uma mão.

## Objetivo

1. **Preparação da sessão** — escolher o treino, revisar e ajustar tudo antes de começar, com
   os valores da última vez como sugestão editável.
2. **Sessão ao vivo** — um exercício por vez, série por série, com registro rápido, descanso,
   reordenação, substituição e observações.
3. **Cronômetro confiável** — descanso e tempo de sessão baseados em timestamps, corretos
   depois de perder o foco, recarregar ou voltar do bloqueio de tela.
4. **Máquina de estados explícita e testável** para sessão, exercício e série.
5. **Resiliência real** — persistência incremental, idempotência, fila local e recuperação de
   sessão interrompida. Sem prometer offline que não existe.
6. **Finalização com revisão** — resumo, avaliação, e nada encerrado em silêncio.

## Dependências

17-A (catálogo + `tracking.ts`), 17-B (`expandPlannedSets`, modelos, planejamento).
Fase 14 (`attachments` para a foto opcional da finalização). Fase 16-B como referência de
**snapshot imutável** (`nutrition_diary_entries`) — o mesmo princípio, outro domínio.

## Escopo

### Schema (9 tabelas)

| Tabela | Papel |
| --- | --- |
| `training_locations` | Academia/local. Nome, observação, padrão. |
| `training_location_plates` | Anilhas e barras disponíveis por local (calculadora). |
| `training_sessions` | A execução. Estado, tempos, local, snapshot do treino, avaliação. |
| `training_session_exercises` | Exercício **daquela** sessão — cópia histórica, com ordem planejada e ordem executada. |
| `training_session_sets` | A série. Peso, reps, RIR/RPE, dificuldade, lados, tempo, distância, tipo, status, `client_mutation_id`. |
| `training_session_rests` | Descanso: planejado, `started_at`, `ended_at`, real, tipo de encerramento. |
| `training_session_pauses` | Pausas da sessão (início/fim), para o tempo ativo não incluí-las. |
| `training_session_events` | Linha do tempo append-only: iniciou, concluiu série, descansou, reordenou, substituiu, pausou, retomou, finalizou. |
| `training_session_substitutions` | Exercício original, substituto, motivo, momento. |

### Lógica pura (o coração desta subfase)

| Arquivo | Responsabilidade |
| --- | --- |
| `src/lib/training/session-machine.ts` | Estados e transições válidas de sessão, exercício e série. **Único lugar** que decide o que pode acontecer. |
| `src/lib/training/session-flow.ts` | `nextStep(sessão)` — qual é a próxima série/exercício, respeitando séries pendentes, supersets, exercícios pulados e ordem alterada. |
| `src/lib/training/timers.ts` | Tempo total, ativo, pausado, descanso acumulado e restante — **tudo derivado de timestamps**, com `agora` injetado. |
| `src/lib/training/previous.ts` | Valores da última execução (por exercício, em qualquer treino **ou** no mesmo modelo), melhor série recente, comparação. |
| `src/lib/training/plates.ts` | Calculadora de anilhas: anilhas por lado, peso alcançável, diferença para o alvo. |
| `src/lib/training/session-snapshot.ts` | Congela o modelo (17-B) no formato que a sessão consome. |

### Estados

```
Sessão    DRAFT → READY → ACTIVE ⇄ RESTING ⇄ PAUSED → COMPLETED
                                                    ↘ ABANDONED / CANCELLED
Exercício PENDING → ACTIVE → PARTIAL → COMPLETED
                          ↘ SKIPPED / SUBSTITUTED
Série     PENDING → ACTIVE → COMPLETED
                          ↘ SKIPPED / FAILED / CANCELLED
```

### Interface

- `/treinos/hoje` — treino do dia, próximo treino, status, duração estimada, grupos, séries
  previstas, **Iniciar treino** e **Escolher outro treino**.
- `/treinos/sessao/preparar` — etapa 1 (escolher: programado, cadastrado, recente, favorito,
  vazio, repetir último, duplicar sessão passada) e etapa 2 (revisar cada exercício: ordem,
  séries, reps, peso, descanso, RIR/RPE, tipo, alternativa, superset) + configuração geral
  (local, horário, descanso padrão, som, vibração, avanço automático, manter tela ativa,
  unidade, observação, energia, disposição, sono, dor).
- `/treinos/sessao` — a tela ao vivo.
- `/treinos/sessao/revisar` — finalização.

## Fora do escopo

| Item | Onde entra |
| --- | --- |
| Histórico navegável, detalhe de sessão passada, gráficos | **17-D** |
| Volume agregado, 1RM, recordes | **17-D** (a sessão **marca** o candidato a recorde; a consolidação é lá) |
| Sugestão de progressão de carga | **17-D** (aqui só aparecem os valores anteriores) |
| Metas, dashboards, relatórios | **17-E** |
| Notificação, agenda, TO-DO, hábitos, PWA/service worker | **17-F** |

## Modelagem

### Snapshot: a regra inegociável

Ao iniciar, a sessão **copia** do modelo: nome do treino, programa, versão, exercícios, ordem,
séries, repetições, descansos, cargas planejadas, observações, tipo de série, superset,
tracking type e nome do exercício. Isso vive em `training_sessions.workout_snapshot (jsonb)`
+ nas linhas de `training_session_exercises` / `training_session_sets`.

`workout_id` e `exercise_id` continuam gravados **como referência informativa** (`on delete
set null`), nunca como fonte de leitura para renderizar a sessão. Renomear, editar ou
arquivar o exercício depois **não** muda nada do que já aconteceu.

### Ordem planejada × ordem executada

`planned_position` nunca muda. `executed_position` é reescrita quando o usuário reordena
durante o treino. As séries já registradas **pertencem ao exercício**, não à posição — por
isso reordenar não pode perder nada. Todo movimento vira evento em
`training_session_events`.

### Idempotência

Toda gravação de série carrega um `client_mutation_id` (uuid gerado no dispositivo) com
**unique por sessão**. Clique duplo, retry da fila e duas abas abertas convergem para uma
linha só. É o mesmo princípio do `dedupe_key` das notificações e do unique de
`todo_completions`.

### Cronômetro por timestamps

Nada de "restam 87 segundos" guardado em estado. O descanso guarda `started_at` e
`planned_seconds`; o restante é `planned − (agora − started_at)`, recalculado a cada render e
**recalculado do zero** ao voltar para a aba. Pausar grava um intervalo em
`training_session_pauses`; o tempo ativo é `total − pausas − descansos`.

Só pode existir **um** descanso ativo (`ended_at is null`) por sessão — índice único parcial
garante no banco.

### Fila local e status de sincronização

Cada mutação da sessão é aplicada **primeiro** no estado local e enfileirada. A UI mostra:
`Salvo` · `Salvando` · `Salvo no dispositivo` · `Aguardando conexão` · `Erro ao sincronizar`.
O rascunho local guarda apenas o necessário para reconstruir a fila; a verdade continua sendo
o servidor. **Não afirmamos "funciona offline"** — afirmamos que o registro continua durante
uma queda e sincroniza depois, que é o que de fato é implementado e testado.

## Regras de negócio

1. **A 3ª de 4 séries avança para a 4ª série.** O sistema **não** troca de exercício enquanto
   houver série pendente no exercício atual, salvo escolha manual explícita.
2. **Última série → descanso (se configurado) → próximo exercício disponível na ordem
   atual.**
3. **Nunca duas sessões ativas** sem decisão explícita do usuário.
4. **Nunca dois descansos ativos.**
5. **Nunca duas séries com o mesmo número** no mesmo exercício da sessão.
6. **Não iniciar descanso para série não concluída**, salvo comando explícito.
7. **Não finalizar sessão com série ativa** sem confirmação.
8. **Sessão concluída não volta a ativa** sem fluxo explícito de reabertura.
9. **Reordenar/pular/substituir preserva tudo**: séries feitas, séries pendentes, cargas,
   repetições, cronômetros e o registro da alteração.
10. **Substituição é registro, não equivalência.** A tela oferece alternativas (do treino, do
    mesmo padrão de movimento, do mesmo grupo, compatíveis com o equipamento do local,
    favoritas, busca) e diz explicitamente que **não** afirma equivalência biomecânica.
11. **Valores anteriores são sugestão, nunca aplicação automática.** O usuário escolhe a
    fonte (última vez em qualquer treino / última vez no mesmo modelo) e sempre pode editar
    antes de começar. Carga nunca muda sozinha.
12. **Aquecimento não conta no volume principal** por padrão — com opção de incluir.
13. **Calorias de equipamento são estimativa**, sempre rotuladas como tal.
14. **Dor registrada não gera diagnóstico.** A UI mostra aviso neutro, oferece encerrar ou
    adaptar, preserva o registro e sugere procurar orientação profissional sem alarmismo.
    **Nenhuma sugestão de aumento de carga é feita quando há dor registrada.**
15. **Nada é encerrado em silêncio.** Descartar exige confirmação reforçada.
16. **Só implementar o que o navegador entrega.** Wake Lock, vibração e som são detectados em
    tempo de execução; onde não houver suporte, a opção não aparece (em vez de fingir).

## Plano de implementação

1. Migrations das 9 tabelas + índices (`(user_id, started_at)`, `(user_id, status)`, unique
   parcial de sessão ativa, unique parcial de descanso ativo, unique de `client_mutation_id`).
2. Puros primeiro, com os testes: `session-machine.ts` → `session-flow.ts` → `timers.ts` →
   `previous.ts` → `plates.ts` → `session-snapshot.ts`.
3. Queries, validators e actions (todas idempotentes por `client_mutation_id`).
4. Camada de resiliência (estado local + fila + status de sincronização + recuperação).
5. UI: preparação → sessão ao vivo → descanso → lista de exercícios → substituição →
   finalização.
6. Verificação, incluindo teste manual em celular real.

## Critérios de aceite

- [ ] Escolho o treino ao iniciar: programado, cadastrado, recente, favorito, vazio, repetir
      último ou duplicar uma sessão passada.
- [ ] Reviso e altero séries, repetições, cargas, descansos, ordem, RIR/RPE, tipo de série e
      alternativas **antes** de começar.
- [ ] O sistema mostra os valores da última vez (peso, reps, séries, dificuldade, descanso,
      data, melhor marca) e me deixa escolher a fonte.
- [ ] Os valores sugeridos são editáveis e nada muda sozinho.
- [ ] A sessão mostra **um exercício por vez**, com número do exercício e da série.
- [ ] Registro peso, repetições, RIR/RPE ou dificuldade em poucos toques, com teclado
      numérico.
- [ ] **Concluir a 3ª de 4 séries leva para a 4ª série, não para outro exercício.**
- [ ] Concluir a última série leva para o próximo exercício.
- [ ] O descanso inicia sozinho, mostra o tempo restante, a próxima série e o próximo peso.
- [ ] Pauso, continuo, pulo, adiciono 15s/30s, reduzo 15s e altero a duração do descanso.
- [ ] O cronômetro continua correto depois de trocar de aba, bloquear a tela e recarregar.
- [ ] Abro a lista de exercícios, arrasto para reordenar, escolho outro como próximo, pulo,
      volto depois, mando para o fim, marco aparelho ocupado e adiciono exercício.
- [ ] Substituo um exercício e o original, o substituto, o motivo e o momento ficam
      registrados.
- [ ] Nenhuma série registrada se perde ao reordenar, pular ou substituir.
- [ ] Pauso e retomo a sessão; a pausa não entra no tempo ativo.
- [ ] Registro aquecimento, drop set, série unilateral com lados diferentes, exercício por
      tempo, exercício de peso corporal com carga adicional e com assistência, e cardio.
- [ ] Uso a calculadora de anilhas com as anilhas do meu local.
- [ ] Fecho a aba no meio do treino, reabro e o sistema pergunta se quero continuar.
- [ ] Perco a conexão, continuo registrando e a sessão sincroniza quando a conexão volta, sem
      duplicar nada.
- [ ] Finalizo e vejo o resumo completo; avalio, observo e salvo — ou salvo como rascunho.
- [ ] Descartar exige confirmação reforçada.
- [ ] Botões grandes, alto contraste, uso com uma mão, tudo acessível por teclado.
- [ ] Dark/light, responsivo, pt-BR; suíte, lint, tsc e build verdes.

## Testes obrigatórios

**Máquina de estados** — cada transição válida; **cada transição inválida rejeitada**;
concluída não volta a ativa; abandonar; cancelar; reabrir com fluxo explícito.

**Fluxo de séries** — 1→2; 3ª de 4 **não** avança de exercício; última série → próximo
exercício; série pulada; série até a falha; série unilateral com lados diferentes;
aquecimento fora do volume; drop set com múltiplos blocos; superset alternando entre
exercícios antes de repetir a rodada; circuito; exercício por duração; exercício sem série
pendente sendo pulado corretamente.

**Descanso** — início, pausa, retomada, +15s, +30s, −15s, pular, término natural; aba sem
foco; recarregamento; avanço automático nos três modos; **nunca dois descansos ativos**;
tempo real descansado gravado.

**Ordem** — reordenar antes e durante; pular e voltar; mover para o fim; substituir; **séries
realizadas preservadas em todos os casos**; `planned_position` intacta.

**Tempos** — total, ativo, pausado, descanso acumulado, tempo por exercício; pausa não soma
no ativo; sessão atravessando a meia-noite; fuso (`TZ=UTC` e `America/Sao_Paulo`).

**Valores anteriores** — última vez em qualquer treino; última vez no mesmo modelo; exercício
nunca executado; sessão incompleta; série excluída; sugestão que não altera nada sozinha.

**Idempotência e recuperação** — mesma mutação enviada duas vezes gera uma linha; fila
reenviada após reconexão; recuperação de sessão interrompida; duas sessões ativas bloqueadas.

**Segurança** — sessão de outro usuário inacessível; série de sessão de terceiro rejeitada;
IDs externos recusados nas actions.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Perder séries registradas | Persistência após **cada** série + fila local + idempotência + teste de recuperação. |
| Cronômetro errado ao voltar do segundo plano | Timestamps + recálculo no `visibilitychange`; teste com `agora` injetado. |
| Avançar de exercício com série pendente | `session-flow.ts` puro, testado exatamente nesse caso (critério de aceite literal). |
| Duplicar série com clique duplo | `client_mutation_id` único por sessão. |
| Duas sessões ativas | Índice único parcial `(user_id) where status in ('ACTIVE','RESTING','PAUSED')`. |
| Prometer offline completo | Escopo declarado: registro resiliente + fila, **não** app offline. Status de sincronização sempre visível. |
| Tela pesada re-renderizando a cada segundo | O cronômetro é um componente isolado; o resto da sessão não re-renderiza com o tique. |
| Editar o treino mudar sessão passada | Snapshot no início + teste que edita o modelo e confere a sessão. |

## Arquivos de documentação a atualizar

Os mesmos da 17-A.

## Instruções para o próximo agente

Próxima: **17-D** (`docs/phases/PHASE_17_D_TRAINING_HISTORY_PROGRESS.md`).

Você recebe sessões com **snapshot**. Leia sempre o snapshot, nunca o modelo atual — se um
gráfico de evolução mudar porque o usuário renomeou um exercício, a 17-C foi violada.
`training_session_sets.is_personal_record` é apenas um **marcador de candidato** gravado no
calor da sessão; a consolidação, a desduplicação e o histórico de recordes são seu trabalho.
