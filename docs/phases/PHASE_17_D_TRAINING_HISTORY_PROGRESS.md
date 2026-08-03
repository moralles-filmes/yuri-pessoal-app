# Fase 17-D — Treinos · Histórico, volume, recordes e progressão

> Quarta das **6 subfases** da Fase 17. **Depende das 17-A, 17-B e 17-C concluídas.**

## Contexto

Com a 17-C o sistema passa a acumular sessões com snapshot. Esta subfase transforma esse
acúmulo em **leitura útil**: histórico navegável, detalhe de sessão, evolução por exercício,
volume, recordes pessoais e sugestão transparente de progressão.

A regra que sustenta tudo aqui é aritmética honesta: **não somar coisas incompatíveis**. Um
minuto de prancha, 12 repetições de flexão e 100 kg × 8 no supino não têm um denominador
comum. Um app que joga tudo num número só de "volume" produz um gráfico bonito e sem
significado. Este módulo separa as métricas por tipo de acompanhamento e diz qual regra usou.

## Objetivo

1. **Histórico** completo, filtrável, em lista/calendário/semana/mês/linha do tempo.
2. **Detalhe de sessão** com exercícios, séries, tempos, substituições e linha do tempo.
3. **Histórico por exercício** com melhores marcas e gráficos de evolução.
4. **Volume** calculado de forma transparente e documentada, por série, exercício, sessão,
   grupo muscular, semana, mês e programa.
5. **Recordes pessoais** consolidados, sem duplicidade.
6. **Estimativa de 1RM** claramente identificada como estimativa, com fórmula escolhível.
7. **Sugestão de progressão** opcional, transparente e nunca automática.

## Dependências

17-A (`tracking.ts`), 17-B (modelos e programas), 17-C (sessões, séries, tempos, snapshot).
Fase 07/14 — `recharts` e os padrões de gráfico já usados nos dashboards.

## Escopo

### Schema (3 tabelas)

| Tabela | Papel |
| --- | --- |
| `training_personal_records` | Recorde consolidado: tipo, exercício, valor, unidade, data, série de origem, marca anterior. |
| `training_progression_rules` | Regra de progressão do usuário (por exercício, grupo ou global): condição, incremento, ativa. |
| `training_progression_suggestions` | Sugestão gerada: motivo legível, valor anterior, valor sugerido, status (`pendente/aceita/ignorada/expirada`). |

Nenhuma métrica agregada é materializada. Volume, 1RM e séries por grupo são **derivados na
leitura** a partir do snapshot — materializar criaria uma segunda verdade que dessincroniza
(mesma regra do `nutrition_foods_view`).

### Lógica pura (com testes)

| Arquivo | Responsabilidade |
| --- | --- |
| `src/lib/training/metrics.ts` | **Única fonte de volume, tonelagem, repetições totais, carga efetiva e agregações.** |
| `src/lib/training/one-rm.ts` | Estimativas de 1RM (Epley, Brzycki, Lombardi, Lander) com faixa de validade. |
| `src/lib/training/records.ts` | Detecção e consolidação de recordes, comparação e desduplicação. |
| `src/lib/training/progression.ts` | Avaliação das regras de progressão e geração da justificativa legível. |
| `src/lib/training/history.ts` | Filtros, agrupamentos e comparações entre sessões. |

### Interface

- `/treinos/historico` — lista/calendário/semana/mês/linha do tempo, agrupável por treino e
  por programa, com filtros combináveis e ações em massa.
- `/treinos/historico/[id]` — detalhe da sessão, com linha do tempo e comparação.
- `/treinos/exercicios/[id]` — ganha a aba **Histórico** (última execução, melhores marcas,
  gráficos, todas as séries).
- `/treinos/recordes` — recordes por tipo e por exercício.
- `/treinos/evolucao` — evolução de desempenho (a evolução **corporal** chega na 17-E).

## Fora do escopo

| Item | Onde entra |
| --- | --- |
| Metas, medidas corporais, dashboards semanais/mensais/anuais | **17-E** |
| Relatórios consolidados e exportação | **17-E** |
| Notificação de novo recorde | **17-F** (a detecção é aqui; a notificação é lá) |
| Comparar com outros usuários / normas populacionais | **Não planejado.** O sistema é single-user e não faz comparação normativa. |

## Modelagem

### Volume: a regra, escrita e documentada

```
volume (peso_reps)               = peso × repetições
volume (peso_corporal_adicional) = (peso corporal do dia + carga adicional) × repetições
volume (peso_corporal_assistido) = (peso corporal do dia − assistência) × repetições
volume (peso_corporal_reps)      = peso corporal do dia × repetições
volume (reps_sem_carga)          = SEM volume em kg → conta em repetições
volume (duracao / isometria)     = SEM volume em kg → conta em segundos
volume (distancia_duracao)       = SEM volume em kg → conta em distância e segundos
volume (calorias)                = SEM volume em kg → estimativa do equipamento, isolada
```

- Quando **não há peso corporal registrado** para a data, os tipos que dependem dele entram
  como **volume indisponível** — nunca como zero, e o total do período fica marcado como
  **parcial**. (Mesma disciplina do `value_state` da Dieta: ausência de dado não é zero.)
- **Séries de aquecimento** ficam fora do volume por padrão, com opção de incluir.
- **Drop set** soma os blocos e conta como **uma** série.
- **Unilateral**: a contagem é configurável — `por_lado`, `soma_dos_lados` ou
  `serie_completa`. O default é `soma_dos_lados`, a regra fica gravada em
  `training_preferences` e **a UI sempre mostra qual regra está valendo**.
- Todo agregado devolve, junto do número, a **qualidade** (`exato | parcial`) e o motivo.

### Recordes

Tipos: maior peso; maior nº de repetições com um dado peso; melhor volume de série; melhor
volume de sessão; melhor 1RM estimado; maior duração; maior distância; maior sequência de
semanas treinadas; mais sessões num mês.

- Só séries **concluídas e válidas** contam. Série pulada, cancelada ou de aquecimento não
  gera recorde.
- Consolidação por `(user_id, exercise_id, record_type)` mantendo o **melhor** e preservando
  a marca anterior em `previous_value` — o histórico não é apagado.
- Empate não gera recorde novo (evita duplicidade e notificação repetida).

### 1RM estimado

Sempre rotulado **estimativa**, sempre com a fórmula visível e escolhível. Fora da faixa de
validade (tipicamente acima de ~12 repetições) a UI **avisa** em vez de esconder ou de fingir
precisão. O sistema **não** sugere tentativa de carga máxima e não substitui teste real.

### Progressão

Regra configurável, avaliada sobre as **últimas N sessões** (nunca sobre uma série isolada).
Exemplo do default sugerido: atingiu o topo da faixa de repetições em **todas** as séries de
trabalho + sem falha + dificuldade "adequada" ou "fácil" + **sem dor registrada** → sugerir
`+ incremento mínimo do equipamento`.

Cada sugestão carrega o **motivo em pt-BR** ("nas 2 últimas sessões você fez 12/12/12 com RIR
2 e sem dor"). A sugestão é **pendente** até o usuário aceitar; aceitar grava o novo valor no
modelo (17-B) preservando o anterior no histórico da sugestão; ignorar a marca como ignorada.
**Desativar a progressão desliga o recurso por completo.**

## Regras de negócio

1. **Todo número agregado sai de `metrics.ts`.** Histórico, gráfico, recorde, dashboard
   (17-E) e relatório usam a mesma função — é o que garante que concordem entre si.
2. **Só o snapshot alimenta o histórico.** Nunca ler o modelo ou o exercício atual para
   renderizar o passado.
3. **Não comparar métricas incompatíveis.** Quilos, segundos, repetições e distância vivem em
   séries separadas, com rótulo próprio.
4. **Ausência de dado não é zero.** Agregado incompleto é marcado como parcial, com o motivo.
5. **1RM é estimativa**, com fórmula visível; nunca é apresentado como carga a tentar.
6. **Progressão nunca é aplicada sozinha**, é sempre justificada, é ignorável e é
   desativável. **Nunca sugere aumento quando há dor registrada.**
7. **Exclusão segura.** Excluir sessão exige confirmação, recalcula os recordes afetados e
   registra a alteração.
8. **Gráfico nunca é a única leitura do dado** — sempre há tabela ou valor textual
   equivalente (acessibilidade).

## Plano de implementação

1. Migrations das 3 tabelas + índices (`(user_id, exercise_id, record_type)`,
   `(user_id, status)` das sugestões).
2. Puros: `metrics.ts` → `one-rm.ts` → `records.ts` → `progression.ts` → `history.ts`, cada um
   com os testes antes da UI.
3. Queries agregadas (uma leitura ampla por período, derivação em memória) e actions.
4. UI: histórico, detalhe, aba de histórico do exercício, recordes, evolução de desempenho.
5. Consolidação de recordes ao finalizar sessão (idempotente) + reprocessamento ao excluir.
6. Verificação + documentação.

## Critérios de aceite

- [ ] Abro qualquer treino passado e vejo pesos, séries, repetições, descansos e tempos.
- [ ] Vejo ordem original × ordem executada, substituições e observações.
- [ ] Vejo a linha do tempo da sessão (início, séries, descansos, alterações, pausas, fim).
- [ ] Comparo com a sessão anterior do mesmo treino, com a última execução do exercício, com
      a melhor sessão e com a média das últimas quatro.
- [ ] Filtro o histórico por período, programa, treino, exercício, grupo muscular, duração,
      volume, com recorde, com observação e status.
- [ ] Vejo o histórico completo de um exercício com melhores marcas e gráficos.
- [ ] O volume é calculado de forma transparente e a tela explica a regra usada.
- [ ] Configuro como exercícios unilaterais são contabilizados.
- [ ] Vejo meus recordes por tipo, sem duplicidade, com a marca anterior preservada.
- [ ] A estimativa de 1RM está identificada como estimativa, com a fórmula escolhida.
- [ ] Recebo sugestões de progressão com o motivo explícito, e posso aceitar, ignorar ou
      desligar tudo.
- [ ] Nenhuma sugestão de aumento aparece quando registrei dor.
- [ ] Excluir uma sessão recalcula os recordes afetados.
- [ ] Dark/light, responsivo, pt-BR; suíte, lint, tsc e build verdes.

## Testes obrigatórios

**Volume** — cada tipo de acompanhamento; aquecimento dentro/fora; drop set como uma série;
unilateral nas três regras; peso corporal com e sem peso do dia registrado (parcial, nunca
zero); assistência reduz e carga adicional soma; agregação por sessão, semana, mês, grupo
muscular e programa; propagação de "parcial".

**1RM** — as quatro fórmulas com valores conhecidos; 1 repetição devolve o próprio peso;
acima da faixa de validade devolve aviso; entrada inválida não devolve número.

**Recordes** — primeiro recorde; superação; empate não gera novo; série pulada/aquecimento
não gera; recorde por repetições com o mesmo peso; recorde de sessão; desduplicação;
recálculo após exclusão de sessão.

**Progressão** — condição satisfeita gera sugestão; uma série isolada **não** gera; dor
registrada bloqueia; sugestão ignorada não reaparece igual; aceitar preserva o valor anterior;
recurso desativado não gera nada.

**Histórico** — filtros combinados; agrupamentos; comparação entre sessões; sessão que
atravessa a meia-noite; suíte verde em `TZ=UTC`.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Somar métricas incompatíveis num "volume" único | Separação por `tracking_type` em `metrics.ts`, testada tipo a tipo. |
| Tratar dado ausente como zero e inflar gráfico | Agregado parcial com motivo; teste dedicado. |
| Recorde duplicado ou notificado duas vezes | Consolidação por chave + empate não conta + idempotência. |
| Gráfico mudar ao renomear exercício | Leitura só do snapshot; teste que renomeia e confere. |
| Progressão soar como prescrição | Texto revisado, motivo explícito, confirmação obrigatória, desativável. |
| Consulta pesada com muitas sessões | Uma leitura ampla por período + índices por `(user_id, started_at)` + paginação. |

## Arquivos de documentação a atualizar

Os mesmos da 17-A.

## Instruções para o próximo agente

Próxima: **17-E** (`docs/phases/PHASE_17_E_TRAINING_GOALS_DASHBOARDS.md`).

`metrics.ts` já é a fonte única dos números — **os dashboards consomem, não recalculam**.
E leia com atenção a decisão sobre **medidas corporais compartilhadas** registrada na 17-E:
elas **não** são tabelas do módulo Treinos.
