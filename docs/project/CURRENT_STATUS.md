# CURRENT_STATUS — Estado atual do projeto

> Atualizado ao final de **cada** fase. Última atualização: **2026-08-04**.

## Estado
As 14 fases do roadmap original e a **Fase 15 (Módulo TO-DO)** estão concluídas. Em
**2026-08-03** o usuário abriu **duas frentes de módulo grande, que convivem**:

| Fase | Módulo | Subfases | Situação |
| --- | --- | --- | --- |
| **16** | Dieta e Alimentação (`/nutricao`) | A–F | **16-A a 16-E concluídas**; 16-F é a próxima (fecha a fase) |
| **17** | Treinos (`/treinos`) | A–F | **17-A a 17-E concluídas**; 17-F é a próxima (fecha a fase) |

> ⚠️ As duas fases compartilham repositório e banco. Ao editar `PROJECT_ROADMAP.md`,
> `CURRENT_STATUS.md`, `NEXT_AGENT_INSTRUCTIONS.md`, `src/types/supabase.ts` e `src/config/nav.ts`,
> **leia antes e edite de forma pontual** — sobrescrever leva embora o trabalho da outra frente.
>
> ✅ **PONTO DE CONTATO CUMPRIDO (2026-08-04):** as medidas corporais `body_*` foram
> **CRIADAS pela 16-E** e a **17-E CONSOME** — lê e escreve por `src/lib/body/queries.ts` e
> `src/lib/actions/body-measurements.ts`, e **não criou tabela nenhuma**. Conferido no banco
> depois da 17-E: **4 tabelas `body_*`**, e a única coluna de peso corporal fora delas é
> `training_sessions.body_weight_kg` — o peso USADO naquele treino, congelado (17-C), que não
> é histórico de medida. Nunca duas tabelas de peso corporal.

## Fases atuais
- **Fase 16-E — Dieta e Alimentação · Medidas corporais, fotos de evolução e relatórios → CONCLUÍDA ✅**
  Arquivo: `docs/phases/PHASE_16_E_NUTRITION_MEASUREMENTS_REPORTS.md`
- **Fase 17-E — Treinos · Metas, medidas corporais compartilhadas e dashboards → CONCLUÍDA ✅**
  Arquivo: `docs/phases/PHASE_17_E_TRAINING_GOALS_DASHBOARDS.md`
- **Fase 17-D — Treinos · Histórico, volume, recordes e progressão → CONCLUÍDA ✅**
  Arquivo: `docs/phases/PHASE_17_D_TRAINING_HISTORY_PROGRESS.md`

## Próximas fases
- **Subfase 16-F — Integrações, notificações e polimento** (fecha a Fase 16; precisa validar
  os **40 critérios de aceite gerais** listados no próprio arquivo).
  Arquivo: `docs/phases/PHASE_16_F_NUTRITION_INTEGRATIONS_POLISH.md`
- **Subfase 17-F — Integrações, notificações, resiliência e polimento** (fecha a Fase 17;
  precisa validar os **critérios de aceite gerais do módulo**, listados no próprio arquivo).
  Arquivo: `docs/phases/PHASE_17_F_TRAINING_INTEGRATIONS_POLISH.md`

---

## O que foi implementado na Subfase 17-E (metas, dashboards, relatórios e corpo)

A 17-D transformou o acúmulo de sessões em **leitura**. A 17-E acrescenta a camada de
**direção** (metas) e a de **síntese** (dashboards e relatórios) — e liga o módulo à evolução
corporal, que é o que dá sentido ao resto.

### ⛔ A 17-E CONSUMIU `body_*`. Não criou tabela de medida nenhuma.

Conferido no banco antes de escrever a primeira linha (MCP `list_tables`): as 4 tabelas
`body_*` da 16-E já existiam. A 17-E **lê e escreve por `src/lib/body/`** — as mesmas queries,
as mesmas actions e os mesmos componentes (`measurement-chart`, `progress-photos`) que a Dieta
usa. Um peso registrado em `/treinos/evolucao` aparece em `/nutricao/medidas`, e vice-versa.

`training_goals.body_measurement_type_id` aponta para `body_measurement_types` com
`on delete set null` **de propósito**: excluir um tipo de medida é um fluxo da 16-E, com
escolha explícita do destino do histórico. Um `restrict` faria aquele fluxo estourar com um
erro que o módulo Dieta não saberia explicar; com `set null`, a meta sobrevive e a leitura a
marca como **"medida removida"** — indisponível, nunca zero.

### As duas tabelas novas (projeto: 111 tabelas · 28 `training_*`)

| Tabela | Papel |
| --- | --- |
| `training_goals` | A meta: família, o que mede, alvo, direção, período, prazo, marcos (jsonb) e situação |
| `training_goal_progress` | O histórico DELA: cada leitura de progresso e **toda** alteração de alvo, prazo ou situação |

### As regras que a subfase existe para garantir

1. **O dashboard não recalcula nada.** Volume, séries, repetições, tempo, frequência e
   distribuição por grupo saem de `metrics.ts` (17-D) através de `dashboards.ts`. Um teste
   compara os totais do dashboard com `aggregateSessions` diretamente: têm de ser idênticos.
   Se faltar um agregado, ele é acrescentado **em `metrics.ts`**.
2. **`atingida`, `expirada` e `em_atraso` são DERIVADOS na leitura**, de valor × alvo × prazo,
   com `hoje` injetado pelo servidor. O CHECK da migration **não aceita** esses três valores —
   verificado no banco. Só decisão do usuário (`planejada`, `ativa`, `pausada`, `concluida`,
   `cancelada`) é gravada, e ela **vence sempre**: uma meta pausada não vira "atingida"
   sozinha porque o número passou pelo alvo.
3. **Alterar a meta não reescreve o passado.** Cada campo que muda o significado (alvo,
   partida, prazo, direção, período, unidade, medição, situação) vira uma linha em
   `training_goal_progress` com anterior, novo, data e origem. Renomear a meta não polui o
   histórico; mudar o alvo, sim.
4. **Ausência de dado é `null` com motivo, nunca zero.** Meta corporal sem medição, exercício
   nunca executado e aderência sem planejamento devolvem `null`, e a tela escreve o porquê em
   vez de desenhar uma barra em 0% que pareceria fracasso. Já um período de frequência **sem
   nenhum treino vale 0** — aí o zero é fato medido, não buraco.
5. **Nenhuma divisão por zero.** Período vazio é caso normal (férias, lesão, semana corrida):
   toda razão devolve `null` e a tela diz "sem base de comparação". Um teste serializa o
   dashboard inteiro de um período vazio e exige que não apareça `NaN` nem `Infinity`.
6. **Sem prescrição.** O sistema não sugere alvo, prazo, direção nem carga; a distribuição por
   grupo muscular é apresentada como **"seu registro de treinamento"**, nunca como "o ideal é
   X séries".
7. **Sem linguagem de culpa.** O calendário de consistência mostra treinado, parcial, descanso
   planejado, planejado sem execução e **dia livre** — sem vermelho de alarme e sem "faltas".
   Um teste varre os rótulos procurando palavras de cobrança.
8. **Nenhuma afirmação de causalidade.** Treino e corpo aparecem lado a lado com o aviso
   explícito de que correlação não é causa.

### O valor de uma meta, e de onde ele vem

`goalCurrentValue` **não calcula**: recebe `PeriodMetrics`/`FrequencyMetrics` prontos e escolhe
o número que responde àquela meta. As melhores marcas de um exercício saem das séries
concluídas e não-aquecimento (a mesma regra de `records.ts`), e o **1RM só entra dentro da
faixa de validade** — acima dela vem com aviso e não vira marca, como na 17-D. Toda meta que
usa 1RM carrega a qualidade `parcial` com a frase "é uma ESTIMATIVA, não uma carga testada".

### Períodos: calendário para o que é semanal/mensal, bloco para o resto

`semanal` e `mensal` acompanham o CALENDÁRIO (é o que as palavras significam para quem lê);
`trimestral`, `semestral` e `anual` são blocos contados a partir de `starts_on` — uma meta que
começou em março fecha o trimestre no fim de maio, não porque o trimestre do calendário
terminou. Em todos os casos a janela é **presa** a `[starts_on, ends_on]`. A aritmética de mês
ganhou `addMonthsIso` em `schedule.ts` (prende ao último dia: 31/01 + 1 mês = 28/02), com teste.

### Telas

- **`/treinos/metas`** — criar, acompanhar, pausar, retomar, concluir, cancelar e excluir;
  marcos intermediários marcados na barra; histórico de alterações dobrável em cada card;
  registro manual só na meta personalizada.
- **`/treinos/relatorios`** — período (semana/mês/ano/personalizado), agrupamento (dia/semana/
  mês), comparação com o período anterior, aderência, grupos musculares, exercícios, recordes,
  medidas e **exportação CSV** com período, regra de contagem e qualidade no cabeçalho.
- **`/treinos/evolucao`** — ganhou a aba **Corpo**: gráfico com linha interrompida no dia sem
  medição, tabela equivalente, registro de medida e fotos privadas, tudo pelo módulo central.
  A aba Corpo funciona **mesmo sem treino registrado**.
- **`/treinos/calendario?visao=consistencia`** — mapa de 6 meses, com legenda contada e
  `aria-label` por dia.
- **`/treinos`** — visão geral completa: hoje, semana com comparação e aderência, metas em
  andamento, evolução recente (peso + séries por grupo) e ações rápidas.
- **Preparação da sessão** pré-preenche o peso corporal com `getLatestWeight()`. O valor da
  sessão vence sempre; o do histórico é só sugestão editável, e o que ficar gravado continua
  sendo o peso **daquele** treino.
- **`/api/export`** passou a incluir as 28 tabelas `training_*`. A base global de exercícios
  fica de fora pelo mesmo motivo da TACO: não é dado do usuário e a migration a recria.

## O que foi implementado na Subfase 16-E (medidas corporais, fotos e relatórios)

A 16-A a 16-D fizeram o sistema saber **o que entra**. A 16-E fecha o ciclo com **o que muda** —
e carrega a decisão arquitetural que as duas frentes esperavam.

### ⛔ A 16-E CRIOU o módulo central `body_*` — a 17-E CONSOME

Levantamento no banco em **2026-08-04** (MCP `list_tables`): a estrutura **não existia**. A 16-E
chegou primeiro e criou as **4 tabelas centrais**, com código em `src/lib/body/`:

| Tabela | Papel |
| --- | --- |
| `body_measurement_types` | Os 16 tipos (peso, %GC, massa muscular, cintura, abdômen, quadril, peitoral, pescoço, braço/antebraço/coxa/panturrilha D e E) + personalizados |
| `body_measurements` | O registro: data pura, hora, valor, unidade **congelada**, condição, `source` |
| `body_measurement_goals` | Meta por tipo, com direção, partida, alvo e prazo |
| `body_progress_photos` | Metadado da foto privada (o binário fica no bucket) |

**O prefixo não é de Dieta.** Peso interessa aos dois módulos, e duas tabelas seriam dois
gráficos discordando sobre quanto o usuário pesa. A **17-E não deve criar nada** — deve chamar
`src/lib/body/queries.ts` e `src/lib/actions/body-measurements.ts`. `getLatestWeight(upTo?)` já
existe para a preparação da sessão pré-preencher o peso (hoje digitado na hora).

### ⛔ As fotos de evolução — o dado mais sensível do sistema

Reuso total do mecanismo da Fase 14: tabela `attachments` + bucket **privado** `attachments`,
o mesmo que a foto de receita (16-C) usa. **Nenhum segundo mecanismo de upload.**

Cinco travas, e nenhuma delas é redundante:

1. **O binário passa pelo SERVIDOR.** A Server Action recebe `FormData` com o `File` real —
   deixar o navegador subir direto seria mais rápido, mas "validar tipo e tamanho no servidor"
   viraria uma frase sem implementação.
2. **MIME e bytes conferidos no servidor** (`photoFileSchema`), sobre o arquivo, não sobre a
   extensão do nome. Arquivo vazio é recusado à parte.
3. **Nome aleatório** (`crypto.randomUUID`) — o nome enviado pelo cliente é descartado. Bucket
   privado com nome previsível ainda é um convite.
4. **Pasta sempre `{auth.getUser().id}/…`**, nunca um caminho vindo do formulário.
5. **FK COMPOSTA `(attachment_id, user_id) → attachments(id, user_id)`.** Descoberta durante o
   teste pela role `authenticated`: a RLS sozinha permitia a linha
   `body_progress_photos(user_id = B, attachment_id = <anexo de A>)`, porque a policy confere o
   `user_id` da própria linha e nada sabe sobre o anexo apontado. Não vazava (a leitura junta
   `attachments`, cuja RLS bloqueia B) — mas depender do comportamento de um JOIN para não vazar
   foto de corpo é fino demais. Agora é impossível, não improvável.

**Leitura só por URL assinada de 5 minutos**, gerada no servidor a cada acesso (mais curta que
os 10 min dos anexos de tarefa, de propósito). `storage_path` **não sai do servidor** — o tipo
`SignedProgressPhoto` sequer tem o campo. Sem link público, sem link compartilhável.

> ⚠️ **A FK composta obrigou a abandonar o embed do PostgREST.** `getProgressPhotos` faz duas
> consultas e junta em memória, em vez de `select("...,attachments(...)")`: um embed sobre FK
> composta dependeria de inferência do PostgREST e quebraria **só em runtime** — a mesma família
> de armadilha do `ON CONFLICT` com índice parcial (42P10) que a 16-B documentou.

### Lógica pura (+151 testes) — suíte total: 1.321 → **1.472**

| Arquivo | Responsabilidade |
| --- | --- |
| `src/lib/body/measurements.ts` (69 testes) | Diferença absoluta e percentual, comparação entre datas, série temporal, média móvel, progresso e status de meta |
| `src/lib/nutrition/reports.ts` (54 testes) | Agregação por período do SNAPSHOT, micronutrientes, rankings, gasto com mercado, planejado × consumido |
| `src/lib/nutrition/diary-month.ts` (28 testes) | Visão de mês do diário |

### A regra que atravessa a subfase inteira: **buraco não é zero**

Um gráfico que despenca para zero na semana em que a pessoa não se pesou afirma que ela pesou
zero. É o `value_state` da 16-A aplicado ao **tempo**:

- `buildSeries` devolve `value: null` no dia sem medição, e o gráfico usa `connectNulls={false}`
  — a linha **interrompe** em vez de passar por cima do buraco;
- o calendário do mês mostra "—", nunca "0 kcal";
- a **média móvel só aparece com a janela cheia**; abaixo disso a UI omite a linha e explica,
  em vez de suavizar 2 pontos e chamar de tendência;
- o eixo do gráfico **não começa em zero** (2 kg num eixo de 0–80 vira linha reta).

Um caso que os testes pegaram: um dia **com meta e sem registro** estava entrando na aderência
média como **0%** — ou seja, "esqueci de anotar" virava "falhei na meta". Corrigido no código
(não no teste), com teste dedicado.

### Relatórios — as duas regras que já valiam, agora aplicadas ao período

1. **O relatório de um período passado sai do SNAPSHOT.** `buildDailyReports` entra por
   `dayTotals` (16-B), que soma `nutrients_snapshot`. Não existe um parâmetro sequer em
   `reports.ts` que aceite alimento do catálogo para somar consumo.
2. **A meta de um dia é a que valia NELE.** Cada dia resolve o próprio período com
   `goalPeriodForDate`. Teste dedicado: o mesmo consumo de 1.800 kcal dá 100% em janeiro
   (meta 1.800) e 72% em março (meta 2.500).

A qualidade viaja com o número: dia parcial torna o período parcial, e **dividir não melhora o
dado** — a média de um período parcial continua parcial.

**Duas médias, rotuladas:** por dia de calendário e por dia registrado. Elas respondem
perguntas diferentes, e oferecer só uma sem dizer qual esconderia a diferença entre "não comi"
e "não anotei".

### Pendências fechadas nesta subfase

| Item | Como ficou |
| --- | --- |
| Relatório de micronutrientes por período | Aba própria, com a coluna **"dias incompletos"** que impede a leitura ingênua do total |
| "Substituições mais realizadas" | Ranking do histórico da 16-C, com rótulos congelados e sem afirmar equivalência |
| Gasto com mercado × financeiro | **Reusa `summarizeShoppingList`** (16-D), não reconta. Virar lançamento é **decisão explícita** do usuário — a tela só aponta para `/transacoes` |
| Exportação do catálogo em CSV | `csv-export.ts` reusa `toCsv`/`downloadCsv` (Fase 14). **Célula vazia ≠ zero**, e a citação da TACO viaja com o arquivo |
| **Visão de mês do diário** | `?visao=mes` deixou de cair na semana: calendário com energia, meta do dia, pendências e tabela textual equivalente |

### Sem prescrição, sem diagnóstico, sem causalidade

Não há "peso ideal", faixa de IMC com juízo de valor nem alvo sugerido. A direção da meta
(`reduzir`/`aumentar`/`manter`) é **escolha do usuário**. Consumo e corpo aparecem **lado a
lado**, com o aviso de que correlação não é causa — nenhum cálculo de correlação é feito.
A comparação entre datas **avisa quando as condições diferem** (jejum × pós-treino), porque
parte da diferença pode ser contexto, não corpo.

### Acessibilidade

**Gráfico nunca é a única forma de ler o dado:** toda série tem tabela textual equivalente,
cada célula do calendário tem `aria-label` com a leitura completa, e a barra de progresso da
meta tem `role="progressbar"` com os valores.

### Segurança — verificado no banco pela role `authenticated`

Dois usuários de teste. Como B: **0 linhas** nas 4 tabelas, em `attachments` e em
`storage.objects` — inclusive consultando o caminho exato do arquivo de A. Bloqueados (42501):
gravar medição/tipo em nome de A, e enviar arquivo para a pasta de A. Bloqueado (23503, FK
composta): reivindicar anexo de A. `UPDATE`/`DELETE` nas linhas de A alcançam **0 linhas**.
**0 resíduo de teste no banco.** `get_advisors`: 0 lints de schema.

### Verificação

`npm run lint`, `npx tsc --noEmit`, `npm run test:run` (**1.472 testes**, de 1.321) e
`npm run build` passam. Suíte verde também em `TZ=UTC`. Smoke test: `/nutricao/medidas`,
`/nutricao/relatorios`, `/nutricao/diario?visao=mes` e `/api/export` → **307** `/login`;
`/api/cron/*` → **401**.

### Pendências registradas (escopo consciente, não bugs)

| Item | Onde resolve |
| --- | --- |
| Gerenciar tipos de medida pela interface (`saveMeasurementType`, `reorderMeasurementTypes`, `deleteMeasurementType` existem e são testados pelo tipo; a semente dos 16 cobre o uso normal) | **16-F** |
| Notificação de medição semanal pendente | **16-F** |
| Cards de evolução no dashboard geral | **16-F** |
| XLSX nos relatórios (o `xlsx` já está no projeto; a 16-E entregou CSV, que é o padrão) | **16-F** |
| `src/lib/nutrition/calendar.ts` é consumido por `src/lib/body/` — se o acoplamento incomodar, **promover** a util central, nunca copiar | Quando incomodar |
| Integração com balança/wearable | **Não planejado.** `body_measurements.source` já prevê o campo |

---

## Correção 2026-08-04 — o schema recusava a própria saída (bug de produção)

**Sintoma:** "Novo treino" mostrava `Verifique os campos destacados.` e **não salvava nunca**,
mesmo com todos os campos preenchidos, sem destacar campo algum.

**Causa, estrutural e não de um formulário só:** o `zodResolver` entrega ao `onSubmit` a saída
**já transformada**; o formulário manda isso para a Server Action; a action valida de novo com o
**mesmo** schema. `optionalText` transformava `""`/ausente em `null` mas só aceitava
`string | undefined` — recusava o que ele mesmo produzia. Como `icon` é opcional e **nem aparece
no formulário**, chegava `null` na segunda passada e derrubava o salvamento **sempre**.

Atingia três telas em produção: **Novo treino** e **Novo programa** (17-B) e **Novo exercício**
(17-A). A Dieta não era afetada — `food-form-dialog` monta o payload a partir de
`form.getValues()` (valores crus), não da saída do resolver.

**Correção:**
- `optionalText` passa a aceitar `null` (`.nullish()`), ficando idempotente — vale para os 23
  arquivos de validador que o usam.
- `src/lib/validators/round-trip.test.ts` fixa a propriedade `parse(parse(x))`. Sem a correção,
  10 dos 14 testes falham. **Todo schema novo usado com `zodResolver` deve entrar ali.**
- `src/lib/forms/server-errors.ts` (puro, testado): erro de campo que existe na tela vira
  `setError` e fica visível; erro de campo que a tela não tem sobe para o toast **com o nome do
  campo**. A mensagem "campos destacados" tinha virado mentira — foi isso que tornou o bug
  indiagnosticável. Os 26 campos dos três formulários passaram a exibir o próprio erro.

Provado no banco (role `authenticated`): insert de treino com o payload exato do schema
corrigido, lido de volta pelo próprio usuário, em transação revertida — 0 resíduo.

---

## O que foi implementado na Subfase 17-D (Treinos — histórico, volume, recordes e progressão)

A subfase que transforma o acúmulo de sessões em **leitura útil**. **3 tabelas novas** e
**+158 testes puros** (suíte: 1321 → 1479).

### ⛔ A regra que a subfase existe para garantir: NÃO SOMAR O QUE NÃO SE SOMA

Um minuto de prancha, 12 repetições de flexão e 100 kg × 8 no supino não têm denominador comum.
Um app que joga tudo num número único de "volume" produz um gráfico bonito e sem significado.

`src/lib/training/metrics.ts` é para os Treinos o que `calc.ts` é para a Dieta: **todo** número
agregado do módulo sai dali, e cada `tracking_type` acumula na SUA unidade, declarada em
`tracking.ts` (kg · repetições · segundos · distância · calorias). Histórico, gráfico, recorde,
visão geral e — na 17-E — dashboards e relatórios usam a mesma função, que é o que garante que
concordem entre si.

### As decisões de contrato

1. **Ausência de dado não é zero.** Sem peso corporal registrado na sessão, a carga efetiva de um
   exercício de peso corporal é INDISPONÍVEL: a série fica de fora e o total do período é marcado
   como **parcial**, com o motivo por extenso. `partialExplanation` monta a frase e a UI é
   obrigada a exibir. Mesma disciplina do `value_state` da Dieta.
2. **A regra de contagem viaja com o número.** Toda tela que mostra volume mostra também
   `volumeRuleLabel(...)`: aquecimento dentro ou fora, e como o unilateral está sendo contado.
3. **Unilateral tem três regras, e a diferença é o que o número REGISTRADO significa.**
   `por_lado` (2 séries, valores dobrados), `soma_dos_lados` (1 série, valores dobrados) e
   `serie_completa` (1 série, o valor registrado já é a série inteira). Com os lados gravados
   separadamente, o trabalho executado soma nas três — o que muda é só a contagem de séries.
4. **Drop set soma os blocos e conta como UMA série.** Contar cada queda como série inflaria a
   série semanal por grupo muscular.
5. **1RM é estimativa**, com a fórmula visível e escolhível (Epley, Brzycki, Lombardi, Lander).
   Série de 1 repetição devolve o próprio peso — é medida, não estimativa. Acima de 12 repetições
   o número vem **com aviso**, e nunca vira recorde. **O sistema não sugere carga máxima.**
6. **Empate não gera recorde novo.** A consolidação é por `record_key` (id do exercício ou, na
   falta dele, o NOME congelado) e preserva a marca anterior em `previous_value`.
7. **Excluir uma sessão recalcula os recordes.** O caminho é o mesmo da finalização —
   `rebuildRecords` reconstrói do histórico e o segundo melhor assume, com a data dele. Quando o
   valor CAI, `previous_value` é limpo: afirmar uma marca que o histórico já não sustenta seria
   inventar.
8. **Progressão nunca é aplicada sozinha, e dor bloqueia sempre.** A regra é escrita pelo
   usuário, avaliada sobre as últimas N sessões (N ≥ 2, com CHECK no banco), gera um motivo em
   pt-BR e nasce `pendente`. Aceitar grava a nova carga no treino-modelo (a única escrita no
   modelo em toda a 17-D) preservando o valor anterior na sugestão; ignorar impede que a mesma
   proposta reapareça. `progression_enabled` desliga o recurso inteiro.
9. **Gráfico nunca é a única leitura do dado.** Todo gráfico tem tabela equivalente dobrável.

### Schema — 3 tabelas (projeto: 109 tabelas, 26 `training_*`, 0 lints de schema)
`training_personal_records` (recorde consolidado + marca anterior),
`training_progression_rules` (a regra do usuário) e `training_progression_suggestions`
(a sugestão, com `basis` congelado e `dedupe_key`).

> **Nenhuma métrica é materializada.** Volume, tonelagem e 1RM continuam derivados na leitura —
> materializar criaria a segunda verdade que a view `nutrition_foods_view` evita na Dieta. O
> recorde é diferente: guarda um FATO datado e a marca que ele superou.

> ⚠️ O índice de deduplicação das sugestões é **PARCIAL**
> (`where status in ('pendente','ignorada')`): `ON CONFLICT` não infere índice parcial e falharia
> só em runtime (42P10). A gravação é *select-then-insert*, como nos pontos idempotentes da Dieta.

### Telas
`/treinos/historico` (lista · semana · mês · calendário · linha do tempo, 14 filtros combináveis,
agrupamento e ação em massa que **não alcança nada fora do filtro atual**),
`/treinos/historico/[id]` (detalhe com ordem planejada × executada, substituições, linha do tempo
e comparação com a sessão anterior / a melhor / a média das últimas quatro),
`/treinos/exercicios/[id]` (resumo, melhores marcas, evolução e todas as séries),
`/treinos/recordes` e `/treinos/evolucao` (desempenho + progressão). A visão geral do módulo
passou a mostrar os últimos 30 dias — e diz quando não há treino no período, em vez de exibir
"0 kg" com cara de resultado.

### Verificação
`npm run lint`, `npx tsc --noEmit`, `npm run test:run` (**1479 testes**, de 1321) e
`npm run build` passam; a suíte também passa em `TZ=UTC`. Smoke: rotas da 17-D → **307 `/login`**,
`/login` → 200, `/api/cron/notifications` → **401**. No banco, pela role `authenticated`:
**10 tentativas indevidas bloqueadas** (forja de `user_id`, escopo incoerente, marca anterior
maior que a atual, `record_key` duplicada, regra com 1 sessão, incremento fixo sem valor, regra
de exercício sem alvo, segunda regra global, sugestão decidida sem data e `dedupe_key` repetida
com sugestão pendente) e o dono lendo/escrevendo o que é dele. Dados de teste removidos: 0
resíduos, catálogo intacto (106 exercícios).

---

## O que foi implementado na Subfase 17-C (Treinos — sessão ao vivo)

A subfase mais importante do módulo: a tela que o usuário abre suado, com uma mão, no celular,
com Wi-Fi ruim, no meio da academia. **9 tabelas novas** e **+165 testes puros**.

### ⛔ A regra inegociável: o treino é CONGELADO ao iniciar

`startSession` copia o modelo para `training_sessions.workout_snapshot` (jsonb) **e** para as
linhas de `training_session_exercises` / `training_session_sets`. A partir daí **nenhuma leitura
de sessão passa pelo treino-modelo** — `session-queries.ts` não tem uma única referência a
`training_workouts`. `workout_id`, `exercise_id` e `scheduled_workout_id` são `on delete set
null`: referência informativa, nunca fonte de leitura.

**Verificado no banco, não só no código:** renomear o modelo, trocar a carga planejada para 999,
subir para 10 séries e por fim **excluir o treino inteiro** — a sessão registrada continua com
"TESTE MODELO 17C", 60 kg planejados, 1 série e o nome do exercício congelado; `workout_id` vira
`NULL` e nada mais muda. Mesmo princípio do `nutrients_snapshot` da 16-B, em outro domínio.

### O congelamento passa por `expandPlannedSets`, não por uma segunda expansão

`session-snapshot.ts` **chama** `expandPlannedSets` (17-B) em vez de reimplementar a expansão de
séries — como `buildRecipeEntrySnapshot` chama `buildDiaryEntrySnapshot` na Dieta. Construtor,
pré-visualização e sessão nunca discordam sobre quantas séries o treino tem, e a máscara por
`tracking_type` continua vindo de `tracking.ts`, a única matriz de medição do módulo.

### Schema — 9 tabelas (RLS + FORCE RLS em todas)
`training_locations`, `training_location_plates`, `training_sessions`,
`training_session_exercises`, `training_session_sets`, `training_session_rests`,
`training_session_pauses`, `training_session_events`, `training_session_substitutions`.
**Total do projeto: 102 tabelas.** Security advisor: **0 lints de schema**.

Decisões registradas:
- **Ordem planejada × ordem executada.** `planned_position` nunca muda; `executed_position` é
  reescrita ao reordenar. As séries pertencem ao EXERCÍCIO, não à posição — por isso reordenar,
  pular, voltar depois, mandar para o fim e substituir não perdem nada.
- **`parcial` e `concluido` não são graváveis** em `training_session_exercises.status`: só
  decisão do usuário entra (`pendente`, `ativo`, `pulado`, `substituido`), e os outros dois saem
  de `deriveExerciseStatus` na leitura. Mesma disciplina de `atrasada` no TO-DO.
- **`training_session_events` é append-only**: sem `updated_at`, sem trigger. Evento reescrito
  deixa de ser evento.
- **Índices únicos parciais** garantem no banco: uma sessão em execução por usuário, um descanso
  ativo por sessão, uma pausa aberta por sessão, um local padrão por usuário.
- **Idempotência por `client_mutation_id`** com unique por sessão — clique duplo, retry da fila e
  duas abas convergem para uma linha. As linhas planejadas nascem com um uuid do servidor; os do
  dispositivo entram ao registrar ou acrescentar série.
- **Peso corporal fica na sessão**, não numa tabela nova: é o valor USADO naquele treino,
  congelado. Quando a 17-E criar o módulo `body_*`, a preparação passa a pré-preencher dali.
  **Continua não existindo duas tabelas de peso corporal.**

### Lógica pura (+165 testes) — suíte de Treinos: 171 → **336**
- `session-machine.ts` — transições de sessão, exercício e série. O teste mais importante é o
  das transições **inválidas**: uma mutação atrasada da fila que chega depois do fim é recusada
  com motivo, não aplicada por cima. Concluída só volta a ativa com confirmação explícita;
  cancelada é definitiva.
- `session-flow.ts` — `nextStep`. **Concluir a 3ª de 4 séries leva para a 4ª SÉRIE**, não para
  outro exercício (critério de aceite literal, com teste isolado e nome explícito). Superset
  alterna A1 → B1 → A2 → B2 pela regra "menor série pendente do bloco, empate resolve pela ordem
  depois do atual"; circuito de três sai da mesma regra, sem caso especial.
- `timers.ts` — tudo derivado de timestamps com `agora` injetado. Tempo ativo = total − **união**
  de pausas e descansos (um descanso dentro de uma pausa não é descontado duas vezes). Reduzir o
  descanso abaixo do já decorrido ENCERRA em vez de criar alvo no passado.
- `previous.ts` — última execução por fonte escolhida pelo usuário; melhor marca ignora séries
  sem carga calculável e marca o agregado como **parcial**; assistência subtrai, adicional soma.
- `plates.ts` — calculadora com o estoque real do local, em pares (barra é simétrica), que
  **nunca passa do alvo** e declara a diferença quando não dá para fechar.
- `session-snapshot.ts` — o congelamento, com os testes de "editar o modelo depois".

### Resiliência: o que é prometido é o que é entregue
**Não afirmamos "funciona offline"** — não há service worker e recarregar sem rede não abre a
tela. O que existe: cada mutação é aplicada no estado local, persistida no dispositivo e
enfileirada; a fila reenvia **em ordem, uma por vez** ao voltar a conexão; o
`client_mutation_id` impede duplicata. A UI mostra o tempo todo `Salvo` · `Salvando` · `Salvo no
dispositivo` · `Aguardando conexão` · `Erro ao sincronizar`, com botão de tentar de novo.

Recuperação de sessão interrompida não depende do dispositivo: a sessão em execução vive no
servidor, então fechar a aba e reabrir cai na tela com tudo no lugar — inclusive o descanso,
recalculado a partir do `started_at`.

### Interface
- **`/treinos/sessao/preparar`** — etapa 1 (programado · cadastrado · recente · favorito · vazio
  · repetir o último · duplicar sessão) e etapa 2 (revisar ordem, séries, reps, cargas,
  descansos, RIR/RPE, superset + local, som, vibração, avanço automático, tela ativa, peso
  corporal, energia, disposição, sono e dor). Os valores da última vez são **sugestão**: o
  usuário escolhe a fonte e aplica com um toque — nada muda sozinho.
- **`/treinos/sessao`** — um exercício por vez, alvos de toque de 48 px, teclado numérico,
  cronômetro de descanso em componente isolado (o tique não re-renderiza a tela toda),
  reordenação com alternativa por teclado, substituição com motivo obrigatório e calculadora de
  anilhas.
- **`/treinos/sessao/revisar`** — resumo, tempos, tonelagem **marcada como parcial** quando
  alguma série não tinha carga calculável, substituições, linha do tempo e avaliação. Descartar
  exige digitar `DESCARTAR`; a alternativa oferecida é encerrar guardando o que foi feito.
- **`/treinos/hoje`** — ganhou **Iniciar treino**; sessão em andamento tem precedência.
- **`/treinos/configuracoes`** — locais de treino e estoque de anilhas de cada um.

### Sem prescrição, sem diagnóstico
Dor registrada gera aviso neutro, preserva o registro, oferece adaptar ou encerrar e sugere
orientação profissional — sem diagnóstico e **sem nenhuma sugestão de aumento de carga**.
Calorias de equipamento são sempre rotuladas como estimativa. Substituir é registro, e a tela diz
explicitamente que o sistema **não afirma equivalência** entre os exercícios.

### Segurança — verificado no banco pela role `authenticated`
Ler, editar e excluir sessão, exercício e série de terceiro: **0 linhas** em todos os casos.
Inserir com `user_id` alheio nas duas tabelas: **bloqueado**. Duas sessões em execução, dois
descansos ativos, duas pausas abertas, duas séries com o mesmo número, `client_mutation_id`
repetido, concluir sem `ended_at`, encerrar descanso sem tempo real, dois locais padrão e anilha
repetida: **todos bloqueados**. Integridade reconferida: 106 exercícios, 0 resíduo de teste.

### Verificação
`npm run lint` (0 erros), `npx tsc --noEmit` (0 erros), `npm run test:run` (**1297 testes**, de
1132) e `npm run build` passam. Suíte verde também em `TZ=UTC`. Smoke test: `/treinos/sessao`,
`/treinos/sessao/preparar` e `/treinos/sessao/revisar` → 307 `/login`; `/api/cron/*` → 401.
Fora de `training`/`treinos`, nada foi tocado.

---

## O que foi implementado na Subfase 17-B (Treinos — rotina e planejamento)

A 17-A entregou o vocabulário e o catálogo: o sistema sabia o que é "Supino reto com barra".
A 17-B entrega a camada que transforma exercícios soltos em **rotina** — treino-modelo,
programa e planejamento semanal. **7 tabelas novas** e **+105 testes puros**.

### A separação que define a subfase: **modelo é intenção; execução é fato consumado**

Tudo que a 17-B constrói é o lado **mutável**. Nenhuma tabela desta subfase pode ser lida "ao
vivo" por uma sessão passada — é por isso que **não existe coluna apontando para sessão** em
nenhuma delas. A 17-C vai gravar um **snapshot** ao iniciar o treino, e é o snapshot que
protege o histórico. O versionamento (`version` + `superseded_by` + `version_group_id`) existe
para outra coisa: o usuário **comparar intenções** ("meu ABC de janeiro × o de maio").

### `expandPlannedSets` — o contrato que a 17-C consome

Existem dois jeitos de configurar séries: **uniforme** (`default_sets`: "4×8-12, 90s") e
**série a série** (`training_workout_sets`: top set + back-off, pirâmide, drop set planejado).
Se cada tela resolvesse os dois casos por conta própria, construtor, sessão e relatório
discordariam sobre quantas séries o treino tem.

`expandPlannedSets` devolve **sempre o mesmo formato** (`PlannedSet[]`) e é o único caminho.
Regra: existindo ao menos uma linha configurada, ela é a verdade e `default_sets` vira só
exibição; `null` numa série significa "herda do exercício", e a herança mora num lugar só.
A função **usa a matriz de `tracking.ts`** para apagar o que não se aplica — um exercício de
duração não carrega peso planejado, um assistido guarda assistência e não peso na barra.
**Nenhuma segunda matriz de medição foi criada.**

### Schema — 7 tabelas (RLS + FORCE RLS em todas)
`training_programs`, `training_program_workouts`, `training_workouts`,
`training_workout_exercises`, `training_workout_sets`, `training_workout_alternatives`,
`training_scheduled_workouts`. **Total do projeto: 81 tabelas** (74 + 7). Security advisor:
**0 lints de schema**.

Decisões registradas:
- **Junção programa↔treino, e não FK direta.** Um treino pode ser avulso ou compor mais de um
  programa. `training_workouts.program_id` é só "programa de origem" (`set null`).
- **Três colunas de carga planejada**, e isso não é redundância: `planned_weight_kg` (barra),
  `planned_additional_weight_kg` (**soma**) e `planned_assistance_weight_kg` (**subtrai**).
  Num campo só, cada tela teria de reinterpretar o sinal — e uma delas erraria, mostrando
  progresso justamente na regressão.
- **`exercise_id` é `on delete restrict`**: excluir um exercício em uso num treino não pode
  removê-lo do treino em silêncio. A action conta os treinos e devolve a mensagem em pt-BR.
- **`workout_id` do planejamento é `set null`, não cascade**: excluir um treino não apaga dias
  planejados; a linha continua legível como "treino removido".
- **`is_active` sem índice único**: mais de um programa em uso gera **aviso**, não erro de
  banco. Índice único transformaria um aviso numa parede.
- **Índice único parcial** garante no máximo **um marcador de descanso por dia**.

### Status derivado, nunca gravado
`training_scheduled_workouts.status` guarda só FATO (`planejado`, `concluido`,
`nao_realizado`, `reagendado`, `cancelado`). **"Atrasado" e "hoje" nascem em
`derivePlannedStatus(entry, hoje)`**, com `hoje` injetado pelo servidor em Brasília — mesma
disciplina de `atrasada` no TO-DO e do status da fatura. Um desfecho gravado sempre vence a
derivação: um treino marcado como não realizado ontem **não** é "atrasado", já tem resposta.

**"Concluído" não é gravável por esta subfase.** Quem conclui um treino é a sessão ao vivo
(17-C); permitir marcar "feito" à mão criaria histórico sem execução, e a 17-D teria de
reconciliar dois "concluídos" que não significam a mesma coisa.

### Lógica pura (+105 testes) — suíte de Treinos: 66 → **171**
- `workout.ts` — `expandPlannedSets` (os dois formatos, herança, renumeração, máscara por
  `tracking_type`), contagem de séries, séries por grupo muscular (**principal e secundário
  contados à parte**, para uma remada não parecer treinar bíceps tanto quanto costas),
  duração estimada (execução + descanso, **sem contar o descanso da última série**, com marca
  de **parcial** quando falta alvo), validação de superset (contíguo × furado × sozinho),
  ordem canônica e reordenação que nunca perde item.
- `schedule.ts` — aritmética de data pura em `Date.UTC` (virada de mês, de ano e bissexto),
  semana com primeiro dia configurável, status derivado, **rodízio A/B/C que avança por dia de
  treino** (e não por dia de calendário, senão o ciclo quebra numa semana mais curta), ciclo de
  N semanas com âncora, duplicação de semana, reagendamento preservando a **primeira** data
  original, e aderência que **só conta o passado** (dia futuro não é falha; sem nada planejado
  a taxa é `null`, e não 0%).

### Interface
- **`/treinos/programas`** — lista com filtros, criar/editar/duplicar/ativar/pausar/finalizar/
  arquivar, composição do programa por arrastar (com alternativa por teclado), dias sugeridos
  por treino e **exclusão que sempre pergunta o destino** dos treinos.
- **`/treinos/treinos`** — lista com filtros combináveis, seleção múltipla, ações em massa,
  mover de programa; **versões substituídas ficam escondidas por padrão** e voltam por filtro.
- **`/treinos/treinos/[id]`** — construtor: arrastar exercícios, configurar séries (uniformes
  ou uma a uma, com **pré-visualização pela própria `expandPlannedSets`**), agrupar superset,
  definir alternativas do exercício naquele treino, salvar como nova versão.
- **`/treinos/calendario`** — semana, mês e lista; arrastar para reagendar; gerar rotina por
  dias da semana + rodízio; aplicar programa; duplicar semana; marcar descanso; registrar
  justificativa. **Nada é sobrescrito em silêncio**: gerar e duplicar exigem escolher entre
  preservar ou substituir, e "substituir" nunca alcança dia com desfecho gravado.
- **`/treinos/hoje`** — treino do dia com grupos musculares, nº de exercícios, total de séries
  e duração estimada, próximo treino e dias em aberto. **Sem "Iniciar treino"**: a tela diz
  que o botão chega na 17-C, em vez de mostrar um controle que não faz nada.
- **`/treinos`** — visão geral com a semana planejada. Continua **sem** volume, recorde e
  evolução: não há sessão registrada até a 17-C.

### Segurança — verificado no banco pela role `authenticated`
Ver programa/treino/planejado de terceiro: **0 linhas**. Editar e excluir os três de terceiro:
**0 linhas**. Inserir com `user_id` de terceiro nas três tabelas: **bloqueado**. Descanso com
treino: **bloqueado**. Dois descansos no mesmo dia: **bloqueado**. `superset_group` inválido:
**bloqueado**. Série duplicada: **bloqueado**. Excluir exercício em uso: **bloqueado**
(`restrict`). Faixa de repetições invertida: **bloqueado**. Integridade reconferida: 106
exercícios, 1 usuário, 0 resíduos de teste.

### Verificação
`npm run lint` (0 erros), `npx tsc --noEmit` (0 erros nos arquivos da 17-B), `npm run test:run`
(**1073 testes**) e `npm run build` passam. Smoke test: rotas privadas → 307 `/login`;
`/api/cron/*` → 401 sem segredo. Fora de `training`/`treinos`, nada foi tocado.

---

## O que foi implementado na Subfase 17-A (Treinos — fundação e catálogo)

Módulo central novo em **`/treinos`**, com navegação interna própria para **13 submódulos**.
Inspirado na *organização e na facilidade de registro durante o treino* de bons apps de
academia — **sem** copiar código, identidade visual, textos, ícones, telas, vídeos, imagens
ou base de dados de terceiros.

### A decisão que define o módulo: **um exercício é um contrato de medição**

`tracking_type` é `not null` em `training_exercises` e diz o que aquele movimento **mede**:
peso × repetições, só repetições, segundos, distância, calorias do painel do aparelho. Sem
isso, a Subfase 17-D somaria 100 kg × 8 do supino com 60 segundos de prancha e 3 km de
esteira num "volume" único — um gráfico bonito e sem significado.

Duas consequências que parecem detalhe e não são, ambas testadas:
- **Assistência SUBTRAI carga.** Na barra fixa assistida, 30 kg de assistência deixam o
  exercício mais fácil. Somar inverteria o sinal e mostraria "progresso" justamente quando o
  usuário estivesse regredindo.
- **Sem peso corporal registrado, a carga efetiva é INDISPONÍVEL — nunca zero.** Uma flexão
  não é "0 kg × 12". É a mesma disciplina do `value_state` da Dieta: ausência de dado não é
  zero. `src/lib/training/tracking.ts` é a única fonte dessa matriz.

### Base de exercícios própria e declarada
- **106 exercícios**, **132 vínculos de músculo secundário**, 22 grupos musculares e 20
  equipamentos — peitoral, costas, ombros, bíceps, tríceps, quadríceps/glúteos, posteriores,
  panturrilhas, abdômen/core e cardio complementar.
- **Conteúdo autoral**, produzido para o projeto. **Zero imagem, zero vídeo, zero texto de
  instrução e zero base de dados de terceiro.** Os campos `instructions`, `tips` e
  `common_mistakes` nascem vazios — quem escreve é o usuário.
- Pipeline determinístico e reexecutável: `data/training/exercise-base/exercises.json` →
  `scripts/training/generate-exercise-base-migration.mjs` → migration idempotente
  (`on conflict (system_code)` → atualiza, não duplica). Procedência, licença e as escolhas
  discutíveis (ex.: levantamento terra classificado em Costas) em
  `data/training/exercise-base/ATTRIBUTION.md`.

### Schema — 7 tabelas (RLS + FORCE RLS em todas)
`training_muscle_groups`, `training_equipment`, `training_exercises`,
`training_exercise_muscles`, `training_exercise_alternatives`, `training_exercise_prefs`,
`training_preferences`. **Total do projeto: 74 tabelas.** Security advisor: **0 lints de
schema**.

- **`user_id` nulo = base do sistema, imutável** — policies **separadas por comando** (SELECT
  alcança o global; INSERT/UPDATE/DELETE só o próprio), como em `nutrition_foods`. Três
  constraints amarradas (`user_id is null` ⇔ `is_system_exercise` ⇔ `source = 'sistema'`)
  impedem que um exercício digitado à mão se apresente como parte da base.
- **Preferência ≠ exercício.** Favoritar, arquivar, apelidar e ajustar descanso/incremento de
  um exercício global gravam em `training_exercise_prefs`. Duplicar cria cópia editável com
  `origin_exercise_id`.
- **Uma trigger impede o grupo principal de aparecer também como secundário** — a duplicidade
  inconsistente que o briefing do módulo pede para evitar. CHECK não resolveria: a informação
  está em outra tabela.
- `training_preferences` já nasce com as chaves das subfases seguintes (avanço automático,
  som/vibração, regra de volume unilateral, fórmula de 1RM, progressão) e **a tela diz a
  partir de quando cada bloco vale** — interruptor que não faz nada e não avisa é pior do que
  não existir.

### Lógica pura (+66 testes) — suíte: 823 → **889**
- `tracking.ts` — a matriz de medição dos 11 tipos, carga efetiva com assistência/adicional/
  peso corporal, resolução de incremento e descanso por especificidade, `snapToIncrement`.
- `filters.ts` — busca sem acento por múltiplos termos, 11 filtros combináveis, ordenação e
  serialização URL ↔ filtros (testada como ida e volta).
- `constants.ts` / `types.ts` — enums, rótulos pt-BR, seções da navegação e conversores
  seguros do banco para o tipo.

### Interface
- Item **Treinos** na sidebar (grupo **Saúde**, ícone halteres).
- **Visão geral** (`/treinos`) com o estado real do catálogo, distribuição por grupo muscular
  e a procedência da base. **Não exibe "0 treinos esta semana"** — não há de onde tirar esse
  número antes da 17-C, e inventá-lo seria desonesto.
- **Catálogo** (`/treinos/exercicios`): busca instantânea, 11 filtros com contagem, ordenação,
  seleção múltipla e ações em massa (favoritar/desfavoritar/arquivar/restaurar/excluir) que
  **relatam quantos itens foram ignorados** por serem da base, criar/editar/duplicar/excluir,
  lista incremental (60 por vez).
- **Painel de detalhe** com 3 abas: como o exercício é medido (com os campos que cada série
  vai pedir), alternativas (organização do usuário, sem afirmar equivalência biomecânica) e
  personalização (apelido/descanso/incremento próprios).
- **Configurações** (`/treinos/configuracoes`) com as preferências do módulo.
- As outras 10 rotas existem e dizem honestamente em qual subfase chegam.

### Segurança — 13 verificações de RLS executadas pela role `authenticated`
Ler a base (106 exercícios, 22 grupos, 132 vínculos): OK. Editar / excluir exercício global:
**0 linhas**. Editar grupo global: **0 linhas**. Editar equipamento global: **0 linhas**.
Excluir vínculo da base: **0 linhas**. Inserir com `user_id` de terceiro: **bloqueado**.
Forjar exercício "da base": **bloqueado**. Criar grupo global: **bloqueado**. Repetir o grupo
principal como secundário: **bloqueado pela trigger**. Favoritar exercício da base:
**permitido** (é preferência do usuário). Integridade reconferida depois: 106/132/0 — nenhum
resíduo de teste.

### Verificação
`npm run test:run` (**889 testes**), `npm run lint`, `npx tsc --noEmit` e `npm run build`
passam. Nenhuma fase anterior foi tocada — as únicas alterações fora de `training`/`treinos`
são a linha nova em `src/config/nav.ts` e a nota de decisão na 16-E.

---

## O que foi implementado na Subfase 16-D (lista de compras e despensa)

A 16-B/16-C fizeram o sistema saber o que a pessoa **vai comer**. A 16-D transforma isso no que
ela **precisa comprar**. É a tela mais **mobile-first** do módulo: usada em pé, no mercado, com
uma mão. **4 tabelas novas** e **+59 testes puros** (`shopping.test.ts`).

### A regra que a subfase existe para garantir

**A consolidação não soma unidades incompatíveis.** É a mesma disciplina de `calc.ts` ("não
analisado" não vira zero) aplicada a compras: 200 g de arroz + 1 xícara de arroz só viram **uma
linha** quando existe conversão real cadastrada (a medida caseira daquele alimento, com o peso).
Sem ela, viram **duas linhas**, com o motivo escrito na tela. Massa converte com massa, volume
com volume — **g ↔ ml exigiria densidade**, e densidade presumida é dado inventado. "3 unidades
de tomate" só vira gramas se alguém tiver dito quanto pesa aquele tomate.

Quem decide o que soma com o quê é `src/lib/nutrition/shopping.ts` (puro): cada parcela cai num
**balde** (`base:g`, `base:ml`, `un`, `medida:<rótulo>`, `sem_quantidade`) e só soma dentro do
balde. Quando um mesmo item produz mais de um balde, **todas** as linhas recebem
`separate_reason` — o usuário nunca vê duas linhas estranhas sem explicação.

### Tabelas

| Tabela | Papel |
| --- | --- |
| `nutrition_market_categories` | Corredores do mercado. **Dado do usuário**, semeado na primeira leitura (`ensureMarketCategories`, idempotente pelo unique parcial `(user_id, slug)`) com os 10 do enunciado. Não é taxonomia nutricional: "congelados" não é grupo alimentar. |
| `nutrition_shopping_lists` | O documento. `recurrence_key` determinística por período; `pantry_applied_at`; total gasto **nunca materializado** (sai da soma dos itens). |
| `nutrition_shopping_list_items` | O item. `origins` jsonb (procedência congelada), `consolidation_key`, `quantity_overridden`, `separate_reason`, preços em **centavos**. |
| `nutrition_pantry_items` | A despensa, travada em **6 campos**. Sem movimentação, entrada, saída ou histórico. |

Todas com RLS + FORCE RLS por `user_id = auth.uid()`, índice em `user_id` e trigger
`updated_at`. Testadas pela role **`authenticated`** (não como `postgres`): outro usuário lê 0
linhas nas quatro; o dono lê as dele; `WITH CHECK` recusa gravar em nome de terceiro.

### As decisões que sustentam a subfase

1. **A origem viaja congelada.** `origins` guarda de qual refeição, de qual data e de qual
   receita veio cada parcela — snapshot, porque o planejamento pode ser editado depois e a
   lista impressa que foi ao mercado precisa continuar explicando os números.
2. **O ajuste manual sobrevive à regeração.** Mexer na quantidade marca `quantity_overridden`;
   `planRegeneration` devolve `keepQuantity: true` e o recálculo atualiza origem e corredor,
   **não** a quantidade. Quem comprou 2 kg porque o pacote é de 2 kg não quer ver 1,4 kg de
   volta a cada regeração. Item digitado à mão nunca é tocado.
3. **Nada some sozinho.** O que o planejamento não pede mais vira **lista de obsoletos** na
   prévia; só é apagado com `remove_obsolete` explícito. A ação em massa oferecida primeiro é
   marcar, não excluir.
4. **Cobertura total da despensa não zera a quantidade.** O item vira `removido` ("não vou
   comprar"), continua na lista e volta com um toque. Zerar afirmaria "preciso de 0 g de
   arroz" — falso: eu preciso, só já tenho.
5. **`quantity` NULA na despensa ≠ zero.** Nula é "tenho, mas não sei quanto" (não desconta, e
   a tela diz por quê); zero é "acabou", um fato medido.
6. **Ausência de preço não é zero.** O resumo conta `semPrecoEstimado`/`semPrecoReal` para a
   tela dizer "R$ 84,20 em 12 de 19 itens" em vez de deixar o total parecer a compra inteira.
7. **Sem link público**, e não é esquecimento: a lista conta o que a pessoa come e quanto gasta.
   Exportar (.txt agrupado por corredor) e imprimir resolvem o caso real.
8. **Corredor sugerido por observação, nunca inventado.** A sugestão vem do que o próprio
   usuário já fez (a categoria que ele deu ao alimento antes, ou a da despensa). Não existe uma
   tabela nossa dizendo que "iogurte é frios" — isso seria opinião sobre o mercado dele.

### Lista recorrente não duplica (regra 6)

`shoppingRecurrenceKey` é determinística: `semanal:<início da semana>`, `mensal:<AAAA-MM>`,
`quinzenal:<âncora>` (ancorada em 05/01/1970, uma segunda-feira, para a mesma data cair sempre
na mesma quinzena). Abrir a tela cinco vezes na mesma semana reencontra a **mesma** lista.

> ⚠️ **A armadilha da 16-B se repetiria aqui.** Os índices únicos de `recurrence_key` e de
> `consolidation_key` são **PARCIAIS** — o Postgres não os infere num `ON CONFLICT` e o
> PostgREST não deixa repetir o predicado (42P10, **falha só em runtime**). Todo caminho da
> 16-D usa *select-then-insert/update*. Verificado no banco: o `ON CONFLICT (user_id,
> recurrence_key)` é recusado com `invalid_column_reference`, e o índice barra a duplicata.

### Verificação
`npm run lint`, `npx tsc --noEmit`, `npm run test:run` (**1.132 testes**, +59) e `npm run build`
passam; a suíte também passa com `TZ=UTC`. Smoke test: `/nutricao/compras` → 307 `/login`;
`/api/cron/*` → 401 sem segredo. `get_advisors` sem lints de schema. As 4 tabelas entraram em
`src/app/api/export/route.ts`.

### Pendências conscientes da 16-D

| Item | Onde resolve |
| --- | --- |
| Relatório de gasto com mercado × financeiro | **16-E** (virar lançamento é decisão explícita do usuário) |
| Notificação de item da despensa vencendo | **16-F** (a data já é gravada e exibida) |
| Reordenar corredores de mercado pela interface (`reorderMarketCategories` existe e é chamável) | **16-F** |
| Criar/renomear corredor pela interface (`saveMarketCategory`/`deleteMarketCategory` existem) | **16-F** |
| Escolher a quantidade de cada receita ao gerar por "receitas" (hoje entra 1 porção e o usuário ajusta no item) | **16-F** |

---

## O que foi implementado na Subfase 16-C (receitas, refeições-modelo e substituições)

A 16-B fez o sistema saber o que foi comido, item a item. A 16-C entrega as três abstrações
que tornam o uso diário rápido — **receita**, **refeição-modelo** e **substituição** — sem
abrir um segundo caminho de gravação. **Testes: +79 puros** (recipe, substitution e
meal-template).

### A regra que a subfase existe para garantir
**O peso de uma comida pronta não se deduz somando os ingredientes crus.** Um refogado perde
água, um bolo perde água e ganha volume, um feijão ganha água — a variação depende do fogo, do
tempo e da panela. Por isso `nutrition_recipes.total_weight_g` é **informado** pelo usuário, e
quando ele não existe o valor **"por 100 g" fica indisponível com explicação**, em vez de cair
silenciosamente para a soma dos crus (que daria um número plausível e errado).

O total da receita é a **soma dos ingredientes**; "por porção" é esse total dividido pelo
rendimento — então **alterar o rendimento recalcula a porção sem mexer no total**.

### ⛔ Receita e refeição-modelo entram no diário pelo MESMO caminho
`buildRecipeEntrySnapshot` (recipe.ts) **chama** `buildDiaryEntrySnapshot` (16-B). Não existe
segunda tabela, segunda fórmula nem segundo formato de snapshot. Consequências garantidas por
construção: o total do dia soma o `nutrients_snapshot`; editar ou excluir a receita **não muda
o que já foi comido**; e a qualidade do cálculo viaja junto do número.

`nutrition_diary_entries.entry_kind` ganhou `'receita'` e `'modelo'` (o CHECK da 16-B já
previa), e `nutrition_planned_meal_items` ganhou `item_kind` + `recipe_id` + `portion_unit`.
O discriminador estável continua sendo a coluna de tipo, nunca a presença de uma FK — todas
são `on delete set null`.

### A qualidade agregada passou a viajar com o número
Uma receita cujo ingrediente não tem fibra analisada tem total de fibra **parcial**. Antes da
16-C não havia como dizer isso ao entrar no diário: o valor seria gravado como se fosse exato.
Agora `SnapshotNutrient` e `ComputedNutrient` carregam um `quality` **opcional**, e
`sumNutrient` o respeita (um agregado parcial conta como contribuinte **e** degrada o total).
A mudança é aditiva: nenhum snapshot da 16-B tem o campo, e nada no comportamento anterior
mudou.

### Decisões registradas
1. **Sem peso final, a receita só é registrada em PORÇÕES** — e aí `grams_equivalent`,
   `base_quantity` e `base_unit` ficam **NULOS**. "Não sei quanto pesa" ≠ "pesa zero", então o
   tipo `DiaryEntrySnapshot` foi alargado para aceitar nulo nessas três colunas.
2. **Refeição-modelo aponta para a receita**, não copia os ingredientes: melhorar a receita
   melhora o modelo. O congelamento continua acontecendo só no consumo.
3. **Adicionar o mesmo modelo duas vezes não duplica** (`templateItemsToRegister`, puro e
   testado). Repetir de propósito exige um interruptor explícito na tela — a idempotência é de
   leitura, e não um índice único, porque um modelo vira VÁRIAS linhas no diário.
4. **Dois modos de registrar um modelo**: detalhado (uma linha por item, ajustável depois) e
   resumido (uma linha com o total). Os dois passam pelo mesmo snapshot.
5. **Substituir é sempre confirmado.** A tela mostra original × alternativa, a diferença de
   kcal/P/C/G/fibra, o impacto no total do dia e o que resta da meta. A diferença é
   **recalculada no servidor** antes de gravar — o que o navegador exibiu é conferido, não
   copiado.
6. **Nenhuma equivalência é afirmada.** A ordem das alternativas é a **prioridade do usuário**,
   não um ranking nutricional; a tolerância é preferência dele; "fora da tolerância" é aviso,
   nunca impedimento. Nenhuma sugestão nasce de heurística nova.
7. **Diferença desconhecida não é zero.** Se um lado não tem o nutriente medido, a comparação
   fica "não dá para comparar" e o impacto no dia é marcado como **parcial**.
8. **Duplicar não herda passado**: contagem de uso, último uso, favorito, arquivamento,
   consumo registrado e logs de substituição ficam com o original.
9. **No diário, a substituição regrava a MESMA linha** (`change_kind = 'substituido'`),
   preservando o vínculo com o item planejado. No nível refeição, os itens antigos viram
   `'removido'` (deixam de somar, continuam visíveis) e a refeição passa a `'substituida'` —
   status que já existia na 16-B.

### Schema — 8 tabelas novas + 2 alterações (0 lints de schema)
`nutrition_recipe_categories` · `nutrition_recipes` · `nutrition_recipe_ingredients` ·
`nutrition_meal_templates` · `nutrition_meal_template_items` ·
`nutrition_substitution_groups` · `nutrition_substitution_options` ·
`nutrition_substitution_logs`, mais as migrations que estendem `nutrition_diary_entries` e
`nutrition_planned_meal_items`. Todas com RLS + FORCE RLS, índice em `user_id` e trigger
`set_updated_at`. **A foto da receita reusa `attachments` + o bucket privado `attachments`** —
nenhum bucket novo.

### Pendências da 16-B fechadas aqui
- **Montar os dias de um modelo de semana pela interface** (antes só criar e aplicar
  funcionavam).
- **Escopo na EDIÇÃO de refeição planejada** — `updatePlannedMealInScope` já existia e era
  testada, mas a UI só expunha escopo na exclusão.

### Efeito colateral necessário
`/api/export` passou a incluir as **8 tabelas novas**. Tudo ali é conteúdo autoral do usuário
(as receitas dele, os modelos dele, as trocas que ele fez) e **nada é recriado por migration**:
ficar de fora do backup significaria perder para sempre.

### Verificação
`npm run test:run` **1.073** (58 arquivos; 79 novos desta subfase) · `npm run lint` limpo ·
`npx tsc --noEmit` limpo · `npm run build` verde com as 12 rotas de `/nutricao`. Suíte passa em
`TZ=UTC` e `TZ=Asia/Tokyo`. Smoke: rotas privadas → **307 `/login`**, `/login` → 200,
`/api/cron/notifications` → **401**.

**Verificações no banco pela role `authenticated`** (como `postgres` a RLS é ignorada e o teste
não provaria nada): intruso **não lê, não edita e não apaga** em nenhuma das 8 tabelas; forjar
`user_id` de outra pessoa é bloqueado pelo WITH CHECK; **8 CHECKs** rejeitam rendimento zero,
peso final zero, item com alimento e receita ao mesmo tempo, item livre sem rótulo, grupo
incoerente com o nível, tolerância negativa e log sem rótulo; `entry_kind = 'receita'` exige
quantidade mas **aceita peso nulo** (porção sem peso final); `'alimento'` continua exigindo o
snapshot completo. **Imutabilidade provada no banco real:** depois de editar a receita (nome,
rendimento e peso) e **excluí-la**, o consumo registrado continuou com o nome de origem,
276,75 kcal e a qualidade "parcial" congelada, com `recipe_id` nulo e `entry_kind` intacto; o
histórico de substituição sobreviveu à exclusão do grupo. Todos os dados de teste foram
removidos e o catálogo reconferido: **597 alimentos, 21.147 valores**.

### Fora do escopo (registrado, não silenciado)
| Item | Onde entra |
| --- | --- |
| Lista de compras a partir das receitas | **16-D** (a consolidação **não pode somar unidades incompatíveis**) |
| Relatório de "substituições mais realizadas" | **16-E** |
| Busca global e lançamento rápido de receita | **16-F** |
| Upload da foto da receita pela interface (a tabela e o bucket já são lidos) | **16-F**, junto do upload de anexos |
| Reordenar ingredientes arrastando (a action `reorderRecipeIngredients` existe) | **16-F** |
| Sugestão automática de substituição por IA ou heurística nova | **Nunca** — a sugestão só usa o que o usuário cadastrou |

---

## O que foi implementado na Subfase 16-B (metas, diário e planejamento)

A 16-A entregou o catálogo; a 16-B faz o sistema saber **o que o usuário comeu**. Quatro
telas reais (`/nutricao`, `/nutricao/diario`, `/nutricao/metas`, `/nutricao/planejamento`),
10 tabelas novas e **+152 testes puros** (671 → 823; a suíte total marca 889 somando os 66
da Subfase 17-A, que corre em paralelo).

### A decisão que define a subfase: **o histórico não muda quando o alimento muda**

`nutrition_diary_entries` congela, **no ato do registro**, tudo que o cálculo precisa:
identidade do alimento, preparo, marca, quantidade, medida, conversão para a unidade-base,
procedência (fonte/versão/código) e os nutrientes já ajustados à porção
(`nutrients_snapshot jsonb`). O total do dia soma **esse jsonb** — não existe caminho de
leitura do total que passe pelo catálogo.

Consequências deliberadas:
- `food_id` é `on delete set null` (referência informativa). **Excluir um alimento perde o
  link, nunca o histórico.**
- `entry_kind` é o discriminador estável da linha, e não a presença de `food_id` — que pode
  virar nulo.
- As colunas quentes (`energy_kcal`, `protein_g`…) são derivadas **na gravação** e servem só
  para listar/ordenar; `NULL` nelas significa **não disponível**, jamais zero.
- **Verificado no banco real** (role `authenticated`): editar o alimento (nome + energia
  128 → 999) e depois excluí-lo deixou o registro de 192 kcal intacto, com o nome de origem.

### Planejado ≠ consumido
`nutrition_planned_meals`/`_items` e `nutrition_diary_meals`/`_entries` são tabelas
separadas, e **nenhuma action de consumo escreve no planejamento**. O cruzamento é derivado
na leitura por `planned_item_id` + `change_kind`
(`igual | quantidade_ajustada | substituido | removido | extra`), e a tela mostra os dois
lados com a diferença nutricional. `removido` registra a *decisão* de pular um item — é
diferente de "não registrei nada" — e por isso não entra nas somas.

### Status derivado, como fatura (F03), tarefa (F09) e TO-DO (F15)
**`pendente` não existe no CHECK do banco.** Ele e o atraso saem de `planned_time` + hora
atual em `effectiveMealStatus`. Duas decisões de produto ficaram explícitas em constante, em
vez de escondidas numa comparação: a tolerância de atraso é de **45 minutos**, e uma refeição
de hoje **sem horário previsto nunca vira "atrasada"** — não há como saber, e cobrar por
suposição seria inventar.

### Meta vigente por data
A meta não é uma linha sobrescrita: é `nutrition_goal_periods` com `starts_on`/`ends_on`.
Toda leitura pergunta *"qual meta valia nesta data"*. A tela separa **"editar este período"**
de **"começar novo período"** justamente porque um muda o passado e o outro o preserva —
`startNewGoalPeriod` encerra o anterior na véspera e abre o novo.

O valor da meta tem três eixos de escopo opcionais (dia da semana · treino/descanso ·
refeição), resolvidos do mais específico para o mais geral por `resolveTarget`. Trocar o tipo
da meta e voltar **não apaga nada**: as linhas do eixo desligado ficam guardadas e a leitura
as ignora.

### Aderência: proximidade, não razão simples
Comer o dobro da meta de gordura daria "200% de aderência" numa divisão ingênua. Aqui
aderência é **100% quando o consumo fica na meta ou dentro da faixa**, e cai proporcional ao
desvio relativo fora dela. A fórmula é exportada como texto (`ADHERENCE_FORMULA`) e exibida
na tela — número que a pessoa usa para se avaliar não pode ser uma caixa-preta. Toda
aderência carrega a **qualidade** do pior total considerado.

### Recorrência do planejamento
Um modelo de semana com ciclo de 1 a 8 semanas. **Aplicar materializa** refeições com data
concreta em vez de criar vínculo vivo — se o modelo reescrevesse o passado, o histórico
deixaria de ser confiável. `weekIndexForDate` devolve `null` quando o ciclo tem mais de uma
semana e falta a âncora, em vez de chutar a "semana A".

Editar/excluir em série **sempre pergunta o escopo** (somente este dia / este e os próximos /
todo o modelo), e **nenhum dos três alcança datas passadas**.

### Schema — 10 tabelas (projeto: 67 tabelas, 0 lints de schema)
`nutrition_profiles`, `nutrition_meal_types`, `nutrition_goal_periods`,
`nutrition_goal_items`, `nutrition_plans`, `nutrition_plan_days`,
`nutrition_planned_meals`, `nutrition_planned_meal_items`, `nutrition_diary_meals`,
`nutrition_diary_entries`. Todas com RLS + FORCE RLS, índice em `user_id` e trigger
`set_updated_at`.

**Armadilha encontrada e registrada:** os índices únicos que sustentam a idempotência são
**parciais** (`where planned_item_id is not null`, `where plan_day_id is not null and …`), e
o Postgres **não infere índice parcial num `ON CONFLICT`** sem repetir o predicado — o
`upsert` do PostgREST falharia em runtime, passando por build, tsc e lint. Confirmado no
banco (`42P10`) e resolvido com *select-then-insert/update* nos dois pontos afetados
(`confirmPlannedMeal`/`skipPlannedItem` e a materialização de modelo). Mesma armadilha vale
para o índice de escopo de `nutrition_goal_items`, que usa `coalesce(...)`.

### Água não é duplicada (regra 7)
A fonte de verdade continua sendo o módulo Hábitos (Fase 10). O módulo Dieta **lê**
`habits`/`habit_logs` da categoria `agua` e linka para `/habitos`; não existe tabela de água
aqui. Sem hábito cadastrado, a tela diz isso e oferece o link — em vez de mostrar "0 de 0".

### Sem prescrição (regra 12)
O estimador de gasto energético (Mifflin-St Jeor) é **opcional**, devolve a **fórmula por
extenso** junto do número, exibe um aviso de que não é recomendação nutricional nem médica, e
**nunca grava meta**: ele preenche a tela, e quem salva é o usuário. Sem os dados necessários
devolve `null` e diz o que falta, em vez de estimar.

### Correção de efeito colateral: backup
`/api/export` não incluía nenhuma tabela do módulo Dieta (pendência não registrada da 16-A) —
o diário alimentar inteiro ficaria fora do backup. Agora inclui as 19 tabelas `nutrition_*`
do usuário, com `.eq("user_id", …)` explícito: sem esse filtro, as tabelas que aceitam
`user_id` nulo trariam os 597 alimentos e os 21.147 valores da TACO para dentro do backup —
dado que não é do usuário e que a migration recria. O mesmo `.eq` resolveu um `TS2589` ("type
instantiation is excessively deep") que a união de 67 tabelas provocou no `from()` dinâmico.

### Verificação
`npm run test:run` (**889** no total; 823 sem os testes da 17-A, eram 671), `npm run lint`, `npx tsc --noEmit`, `npm run build` —
todos verdes. Suíte passa em `TZ=UTC` e `TZ=Asia/Tokyo`. Rotas privadas → **307 `/login`**;
`/api/cron/*` → **401**. **30 verificações no banco pela role `authenticated`** (20 de
RLS/CHECK + 10 de imutabilidade e idempotência), com todos os dados de teste removidos ao
final e o catálogo da 16-A reconferido (597 alimentos, 21.147 valores).

---

## O que foi implementado na Subfase 16-A (Dieta e Alimentação — fundação)

Módulo central novo em **`/nutricao`** ("Dieta e Alimentação"), com navegação interna própria
para 12 submódulos. Inspirado na *organização e facilidade de registro* de bons apps de
nutrição — **sem** copiar código, identidade visual, textos, telas ou assets de terceiros.

### A decisão que define o módulo: **ausência de dado não é zero**
Todo valor nutricional carrega um **estado**: `disponivel | traco | nao_disponivel |
nao_aplicavel | em_revisao`. Só `disponivel` tem número, e uma **CHECK constraint** garante
isso no banco — não só no código. Toda soma propaga uma **qualidade** (`exato | aproximado |
parcial`) que a interface é obrigada a exibir. Somar tratando "não analisado" como 0 inventa
precisão que o dado não tem, e é o erro clássico de app de nutrição.
*Prova disso no dado real:* "Sal, grosso" tem energia `nao_aplicavel` na TACO, e o app mostra
**"n/a"**, não "0 kcal".

### Base nutricional real e verificável
- **TACO 4ª edição (NEPA/UNICAMP, 2011): 597 alimentos, 21.147 valores nutricionais**,
  17 categorias, 80 definições de nutriente (macros, minerais, vitaminas, 19 ácidos graxos
  individuais e 18 aminoácidos).
- Obtida do **XLSX oficial publicado pelo NEPA** — sem scraping, sem cópia de terceiros, sem
  valor gerado por IA. A obra declara: *"É permitida a reprodução parcial ou total desta
  obra, desde que citada a fonte"*; a citação aparece na interface.
- **Pipeline determinístico e reexecutável**, com SHA-256 do arquivo de origem no manifesto:
  `scripts/nutrition/build-taco-dataset.mjs` (XLSX → dataset + manifesto) e
  `generate-taco-migration.mjs` (dataset → 8 migrations idempotentes). Atribuição, licença e
  decisões de fidelidade em `data/nutrition/taco-4/ATTRIBUTION.md`.
- **Marcadores da fonte preservados um a um:** branco = "análises não solicitadas",
  `Tr` = traço, `NA` = não aplicável, `*` = "as análises estão sendo reavaliadas" (21
  alimentos ficaram `is_verified = false` por isso). Carboidrato levemente **negativo** em
  pescados/carnes magras — resultado real do cálculo por diferença da própria TACO — foi
  **preservado como publicado**, não "corrigido" para zero.
- **Medidas caseiras não foram inventadas:** a TACO não publica medida caseira por alimento.
  A estrutura, a UI e o cálculo estão prontos; o usuário cadastra as suas e o pipeline aceita
  uma segunda fonte oficial depois. Registrado como fora de escopo, não silenciado.

### Schema — 10 tabelas + 1 view (RLS + FORCE RLS em todas)
`nutrition_nutrients` (catálogo global de referência, **somente leitura: nenhuma policy de
escrita**), `nutrition_food_sources`, `nutrition_food_categories`, `nutrition_foods`,
`nutrition_food_nutrients` (**única fonte de verdade** de nutriente),
`nutrition_food_measures`, `nutrition_food_prefs`, `nutrition_food_tags`,
`nutrition_food_tag_links`, `nutrition_import_batches` + view `nutrition_foods_view`
(`security_invoker = true`). **Total do projeto: 57 tabelas.** Security advisor: **0 lints de
schema**.

- **`user_id` nulo = linha global, imutável.** As policies são **separadas por comando**
  (SELECT alcança o global; INSERT/UPDATE/DELETE só o próprio) — é o que permite ler a base
  oficial sem nunca poder reescrevê-la. Uma constraint amarra `user_id is null` a
  `is_system_food`, então não dá para forjar um alimento "oficial".
- **Preferência ≠ alimento.** Favoritar, arquivar e até **recategorizar** um alimento global
  gravam em `nutrition_food_prefs`. (A recategorização nasceu de um caso real: a TACO lista
  "Biscoito, polvilho doce" em *Verduras e hortaliças*, porque a tabela é alfabética dentro
  da seção. Corrigir na base seria reescrever a fonte; o override resolve sem mentir.)
- A **view pivota** os nutrientes quentes para ordenar/filtrar sem N+1 — derivação, nunca
  segunda fonte de verdade.

### Núcleo de cálculo puro (+82 testes) — suíte: 589 → **671**
- `units.ts` — conversão medida → base. **Conversão impossível é erro tipado, nunca
  estimativa**: gramas → mililitros exigiria densidade, e densidade chutada é dado inventado.
  Nenhuma conversão genérica entre alimentos (colher de arroz ≠ colher de azeite).
- `calc.ts` — fórmula única (`nutriente × quantidade ÷ base`, com a base lida do alimento,
  nunca assumida como 100), propagação de qualidade, energia estimada por Atwater **separada**
  da declarada, e arredondamento **só na apresentação**.
- `filters.ts` — busca sem acento por múltiplos termos, 13 filtros combináveis, ordenação e
  serialização URL ↔ filtros (testada como ida e volta).
- A suíte passa em `TZ=UTC`, `America/Sao_Paulo` e `Asia/Tokyo`.

### Interface
- Item **"Dieta e Alimentação"** na sidebar (grupo **Saúde**, ícone maçã).
- **Visão geral** (`/nutricao`) com o estado real do catálogo e a procedência da base.
- **Catálogo** (`/nutricao/alimentos`): busca instantânea, 13 filtros combináveis com
  contagem, ordenação, seleção múltipla e ações em massa (favoritar/arquivar/restaurar/
  excluir, com confirmação e relatório do que foi ignorado), criar/editar/duplicar/excluir,
  lista incremental (60 por vez).
- **Painel de detalhe** com 4 abas: **calculadora de porção** (usa o núcleo de ponta a ponta),
  todos os nutrientes agrupados com estado de valor, **medidas caseiras** (CRUD) e
  **procedência** (fonte, edição, código original, data de verificação e citação).
- **No formulário, campo vazio = "não informado"**, nunca zero — a UX foi desenhada a partir
  da regra de dado.
- 10 rotas de submódulo já existem e dizem honestamente em qual subfase chegam.

### Segurança — 10 verificações de RLS executadas pela role `authenticated`
Ler a base global: OK (597). Editar / excluir alimento global: **0 linhas**. Alterar nutriente
da base: **0 linhas**. Inserir com `user_id` de terceiro: **bloqueado**. Forjar alimento "da
base": **bloqueado**. Escrever no catálogo de nutrientes: **bloqueado**. Gravar valor com
estado `nao_disponivel`: **bloqueado**. Medida sem conversão: **bloqueado**. Favoritar
alimento da base: **permitido** (é preferência do usuário). Resíduos do teste removidos e
integridade reconferida.

### Verificação
`npm run test:run` (**671 testes**), `npm run lint`, `npx tsc --noEmit` e `npm run build`
passam. Rotas privadas respondem **307 → /login**. Nenhuma fase anterior foi tocada.

---

## Iteração 2026-07-28 — as 3 pendências do TO-DO foram fechadas

Logo após a Fase 15, a pedido do usuário. **Testes: 529 → 589.**

1. **Entrada em linguagem natural — implementada.** `src/lib/todo/parse.ts` (função pura com
   `hoje` injetado, **37 testes**) reconhece data, hora, prazo, prioridade, `#projeto`,
   `@etiqueta` e recorrência. O `QuickTaskInput` mostra chips do que foi entendido **antes**
   de salvar e **nunca reescreve o texto digitado**; há botão para desligar a interpretação.
   `todoQuickTaskSchema` ganhou `deadline_at` para o chip "Prazo final" não prometer algo que
   não seria salvo.
2. **Sincronização com Google Agenda — implementada, opt-in.** `google-event.ts` (mapeamento
   puro, **16 testes**) + `calendar-sync.ts` (I/O, `server-only`, best-effort). Nova coluna
   `google_integrations.todo_sync_enabled` (default `false`) e interruptor em `/agenda`.
   **Correção de premissa:** a Fase 15 registrou que faltava escopo OAuth de escrita — estava
   errado; a Fase 08 sempre pediu `calendar.events` (leitura **e** escrita) e já escrevia
   eventos. **Recorrente não vira RRULE**: enviamos só a ocorrência atual e movemos o mesmo
   evento a cada conclusão, coerente com o modelo de "a série avança na própria linha".
3. **Actions sem gatilho — todas expostas.** Arraste na navegação (projetos, etiquetas,
   filtros salvos), mover seção pelo menu da coluna no Kanban, mesclar etiquetas no
   `LabelDialog`, editar/excluir filtro salvo no `SaveFilterDialog`. Descoberto no caminho:
   **editar/excluir etiqueta era impossível pela interface** — agora há um lápis em cada
   linha. Criada a action `reorderTodoSavedFilters`, que não existia.

**Total do projeto após a iteração: 47 tabelas, 589 testes.** Migration nova:
`20260728120000_todo_google_sync.sql`.

## O que foi implementado na Fase 15 (Módulo TO-DO)

Gerenciador de tarefas completo em `/todo`, inspirado na *experiência* de ferramentas como o
Todoist (organização, velocidade, facilidade) — **sem copiar nome, logo, textos, ícones,
código, assets ou identidade visual de terceiros**. Segue integralmente o design system do
sistema (preto/branco/dourado, dark+light, Arial, shadcn/ui).

**Decisão arquitetural central:** o TO-DO usa **13 tabelas `todo_*` novas** em vez de evoluir
`tasks`/`projects` (Fase 09). Motivo: `tasks` está acoplado a `calendar_events.task_id`,
`generate.ts`, busca global, dashboard e ao kanban-por-status; remodelá-la para suportar
seções, subtarefas, `scheduled_date` + `deadline_at` e séries recorrentes exigiria mexer nos
cinco ao mesmo tempo — risco alto de regressão. **Consequência assumida:** o sistema tem
**dois módulos de tarefas coexistindo**; `/todo` é o gerenciador principal de execução e
`/tarefas` (Fase 09) segue vivo por causa das rotinas e do vínculo com a agenda. A separação
de responsabilidades está documentada no arquivo da fase.

- **Schema (13 tabelas, todas com RLS + FORCE RLS + policy `user_id = auth.uid()` + índices
  + trigger `updated_at`):** `todo_projects`, `todo_sections`, `todo_labels`, `todo_tasks`,
  `todo_task_labels`, `todo_recurrences`, `todo_completions`, `todo_comments`,
  `todo_reminders`, `todo_saved_filters`, `todo_activity`, `todo_preferences`,
  `todo_calendar_sync`. Security advisor: **0 lints de schema**. Total do projeto: **47 tabelas**.
- **Reuso, não duplicação:** anexos usam a tabela genérica **`attachments`** + bucket privado
  **`attachments`** (Fase 14) com `entity_type = 'todo_task'`; notificações usam a tabela
  **`notifications`** + `dedupe_key` + o Cron existente; drag-and-drop usa o **`SortableList`**;
  datas usam `hojeISO()`/`dateInSaoPaulo()`.
- **Regras críticas (puras, com datas injetadas, testadas):**
  - **`atrasada` NUNCA é gravado** — derivado na leitura de `scheduled_date`/`deadline_at`
    (`src/lib/todo/status.ts`), mesma regra das Fases 03/09.
  - **Recorrência** (`src/lib/todo/recurrence.ts`): modos **fixo** (calendário) e **após
    conclusão**; diária/semanal/mensal/anual; dias específicos da semana com ciclo de N
    semanas; dia do mês com clamp; **último dia do mês**; **primeiro/último dia útil**;
    **n-ésimo dia da semana do mês** (1ª..4ª e última); "somente dias úteis"; `ends_on`;
    `max_occurrences`; pausa. Toda a aritmética roda em **UTC interno** (`Date.UTC`) para
    eliminar o drift de fuso. Ano bissexto e virada de ano cobertos por teste.
  - **Não-duplicação de ocorrência:** concluir grava em `todo_completions` com unique
    `(user_id, task_id, scheduled_for)`; a tarefa recorrente **avança a própria linha** em vez
    de criar outra (preserva projeto, seção, prioridade, etiquetas e lembretes sem copiar
    nada). Reabrir **remove a última conclusão e volta a data** — não gera ocorrência extra.
    Verificado no banco real: a segunda conclusão da mesma data é rejeitada pelo unique.
  - **Nenhuma exclusão silenciosa:** excluir projeto exige escolher entre mover para a Caixa
    de entrada / mover para outro projeto / excluir tudo (com confirmação digitando
    "EXCLUIR"); excluir seção idem; excluir etiqueta remove **só a associação**; excluir série
    recorrente pergunta o escopo. Verificado no banco: excluir projeto move a tarefa para a
    caixa de entrada; excluir etiqueta mantém a tarefa.
  - **Concluir tarefa-mãe com subtarefas pendentes SEMPRE pergunta** (concluir tudo / só esta
    / cancelar).
- **UI (`/todo`):** navegação interna (Caixa de entrada, Hoje, Próximos, Todas, Concluídas,
  Projetos, Favoritos, Etiquetas, Filtros salvos, Projetos arquivados) — coluna fixa no
  desktop, gaveta no celular. Visões **lista** (agrupável, com subtarefas aninhadas e drag),
  **quadro/Kanban** (colunas = seções, drag entre colunas) e **calendário mensal** (drag
  reagenda). Painel de detalhes em drawer com abas Dados/Subtarefas/Notas/Histórico.
  Criação rápida com atalho **`T`**, `Enter` salva, `Ctrl/Cmd+Enter` salva e continua.
  Ações em massa, menu de contexto por tarefa, filtros combináveis e filtros salvos.
- **Integrações:** item **TO-DO** na sidebar; tipo **"Nova tarefa"** no lançamento rápido
  global; busca global passa a encontrar **tarefas, projetos e etiquetas do TO-DO** (com link
  que abre o painel da tarefa via `?task=`); **card TO-DO no Dashboard Geral**; notificações
  novas `todo_overdue` / `todo_today` / `todo_deadline` / `todo_reminder`, todas com
  `dedupe_key` determinístico (P1 atrasada tem destaque próprio); export de dados inclui as 13
  tabelas.
- **Fora do escopo (registrado, não silenciado):** entrada em linguagem natural (a
  arquitetura está preparada; a UI usa seletores convencionais) e **sincronização com Google
  Agenda** (a modelagem `todo_calendar_sync` existe com idempotência, mas **não há simulação
  de sync** — escrever eventos exige escopo OAuth de escrita que o projeto não tem).
- **Testes:** +115 testes puros novos (recorrência 53, status 26, filtros 36). Suíte total:
  **529** (era 414). `npm run lint`, `npx tsc --noEmit` e `npm run build` passam.

## Iterações (modo manutenção)
- **2026-07-20 — O sistema inteiro passa a operar em `America/Sao_Paulo`, nunca em UTC.** Auditoria completa (financeiro, agenda/tarefas/notificações, hábitos/estudos/busca/export) achou ~25 pontos onde o fuso vazava. Raiz: na Vercel o Node roda em **UTC**, e tudo que lê o fuso "local" — `date-fns` (`startOfDay`/`isSameDay`/`format`), getters de `Date` e `Intl` **sem** `timeZone` — respondia em UTC no servidor; entre **21h e 00h (BRT) o dia virava**. Correção em três camadas: **(1) `TZ=America/Sao_Paulo`** no processo (novo **`src/instrumentation.ts`**, que roda antes do app em todo boot/cold start, + scripts do `package.json` para dev/build/test baterem com produção); **(2) formatadores explícitos** — `dateFormatter` ganhou `timeZone`, `formatDate`/`formatDateWith` agora separam **data pura** (`'yyyy-MM-dd'` reordenada como TEXTO, imune a qualquer fuso) de **instante** (lido em Brasília), e entraram os helpers `timeInSaoPaulo`, **`saoPauloWallClockToInstant`** (hora digitada = hora de Brasília, não do fuso do aparelho), `toDateTimeLocalInSaoPaulo` e as constantes `TIMEZONE`/`SAO_PAULO_UTC_OFFSET` (offset fixo: sem horário de verão desde 2019); **(3) correção dos pontos onde a data vinha de instante** — o `TZ` não conserta `.slice(0,10)` de um timestamptz, que é sempre UTC. Bugs de dado corrigidos: **`bills.ts`** lançava a conta fixa na **competência errada e duplicava** a despesa na virada do mês (a guarda de duplicata comparava a data deslocada); **`dashboard/queries.ts`** montava a janela do card Agenda em UTC (deslocada 3h **todo dia**) e derivava "hoje" com `format(now)`; **`search/queries.ts`** dava data errada e **link quebrado** para evento das 21h-00h; **`reports/tasks.ts`** jogava tarefa concluída domingo à noite na semana seguinte; mais `financeiro/page.tsx` (mês corrente), `agenda-card.tsx`, `export/route.ts` (nome do backup), `period.ts`, `regional-card.tsx`. Agenda: `calendar/format.ts` distingue **instante** (novo helper **`emBrasilia`**, aplicado em `agenda-card`/`upcoming-events`/`event-details`) de **data de grade** (não converte — converter deslocaria um dia); `notification-meta.tsx` ganhou `timeZone`. Entrada do usuário (`event-form`, `quick-add`, `task-form`) passa a ancorar hora de parede em UTC-3 em vez de usar o fuso do dispositivo. **Crons da Vercel são sempre UTC** → `vercel.json` virou `0 12`/`0 0` para rodar de fato às **09h/21h de Brasília** (antes rodava 06h/18h). **Sem migration.** 6 testes novos de fuso; a suíte roda verde em **`TZ=UTC`, `America/Sao_Paulo` e `Asia/Tokyo`** — prova de que a correção não depende do fuso do ambiente. Suíte **421** (lint/tsc/build ok). **Resíduo conhecido:** o agrupamento por dia da grade da Agenda (`calendar/events.ts`, `grid.ts`, `upcoming.ts`, `recurrence.ts`) usa `date-fns` no fuso ambiente — correto no servidor (fixado) e em aparelho brasileiro, mas ainda seguiria o dispositivo num aparelho configurado em outro fuso.
- **2026-07-19 — Pagar fatura permite escolher a DATA do pagamento (bate com o extrato do banco).** O diálogo **Pagar** de `/faturas` só pedia a conta e carimbava **hoje** (`hojeISO()` no lançamento, `new Date()` em `pago_em`). Quem lança a fatura dias depois de pagar ficava com o lançamento na data errada — o extrato do banco não batia com o app. Agora o diálogo tem o campo **"Data do pagamento"** (`<input type="date">`, **default hoje**, editável para datas retroativas ou futuras) e o valor viaja até o lançamento: `markStatementPaid(id, contaId, dataPagamento?)` → `montarPagamentoFatura` (o parâmetro `hoje` virou **`dataPagamento`**, mesma injeção sem `Date.now()`) → `purchase_date`/`competence_date`. `card_statements.pago_em` (timestamptz) também passa a refletir a data escolhida via helper **`pagoEmTimestamp`**, que grava **meio-dia UTC** (= 09h em São Paulo) para a data cair no **mesmo dia do calendário** em leitura no fuso BR — meia-noite UTC voltaria um dia. `pagamentoFaturaSchema` ganhou `dataPagamento: dateString.optional()` (ausente → servidor usa `hojeISO()`, então chamadas antigas de 2 args seguem válidas). **Sem migration** (a coluna já existia). **Sem impacto em status/relatórios:** `statusEfetivo` só testa a *presença* de `pago_em`, e o pagamento continua `transferencia` (fora de entradas/saídas e do total da fatura). Teste novo de data retroativa em `statement-payment.test.ts`: suíte **415** (lint/tsc/build ok).
- **2026-07-19 — Apagar o pagamento de fatura pela tela de Lançamentos agora reabre a fatura.** O pagamento de fatura é um lançamento `transferencia` comum, então aparece em Lançamentos com Editar/Excluir. Excluir por ali estornava o saldo da conta (o lançamento some) mas deixava a fatura **marcada como paga** — o FK `card_statements.pago_transacao_id` é `on delete set null`, ou seja, zerava o ponteiro sem limpar `pago_em`/`status`/`pago_conta_id`. Resultado: fatura "paga" apontando para o nada, só destravável pelo "Desfazer" em `/faturas`. Agora `deleteTransaction` detecta que o lançamento quita uma fatura (helper **`statementPaidBy`**) e a reabre (`status='aberta'`, campos de pagamento nulos) — mesmo efeito do `markStatementUnpaid`. Junto, o mesmo helper cobre a **edição**: editar uma transferência apaga e recria a linha, então o pagamento recriado voltaria com **outro `id`** e a fatura perderia o vínculo; `updateTransaction` religa `pago_transacao_id` ao lançamento recriado (**editar o pagamento não desfaz o pagamento**). `revalidateTransactions()` já revalida `/faturas` e `/cartoes`. **Sem migration** (só comportamento das actions); nada a testar em unidade (é I/O puro, como `markStatementUnpaid`). Suíte **414** (lint/tsc/build ok).
- **2026-07-19 — Transferência entre contas não mexia no saldo (agora é UMA linha, não duas).** Registrar uma transferência não alterava o saldo de nenhuma das contas (ex.: Cofre travado no `initial_balance` de R$756,18 mesmo com 3 transferências recebidas). Causa-raiz: **contradição entre schema e cálculo**. A migration `20260625120300_transactions` documentou transferência como **DUAS linhas espelhadas** (A→B e B→A, mesmo `transfer_group_id`) e `createTransaction` gravava as duas; mas `public.account_balance` (`20260625120600`) já deriva **os dois lados de UMA linha** (`-amount` em `account_id`, `+amount` em `transfer_account_id`). Com o par, cada conta recebia `-amount` de uma perna e `+amount` da outra → **soma zero**, sempre. Efeito colateral: o par era **simétrico e sem marcador de direção**, então a origem/destino exibida na lista dependia do desempate arbitrário do `ORDER BY` (as duas linhas têm `competence_date` e `created_at` idênticos). Correção: `createTransaction` passa a inserir **uma linha** (origem em `account_id`, destino em `transfer_account_id`; `transfer_group_id` permanece como marcador de "isto é transferência", usado por update/delete/status, que já operavam por grupo). Migration **`20260720030000_transferencia_uma_linha`** (idempotente): apaga a perna espelhada mantendo a de **origem** (a gravada primeiro, menor `ctid` — a que o app já exibia) e cria índice único parcial **`transactions_transfer_group_unique`** em `transfer_group_id` para o par não voltar. A dedup por grupo em `transactions-client.tsx` virou desnecessária e saiu. **Dados:** 3 transferências Mercado Pago → Cofre corrigidas — Cofre 756,18 → **1.891,04**; Mercado Pago 6.222,70 → **5.087,84**. **Sem mudança em relatórios/dashboard** (`transferencia` já ficava fora de entradas/saídas). Suíte **414** (lint/tsc/build ok). **Pendência conhecida (pré-existente, não tocada):** 2 linhas `type='transferencia'` com `transfer_account_id` nulo (R$156,50 Itaú "Pagamento fatura junho" e R$4.262,45 Mercado Pago) — funcionam como saída pura da conta, sem destino; é o formato que o pagamento de fatura usa de propósito.
- **2026-06-27 — Ordenação manual (drag-and-drop) de Hábitos e Rotinas.** Antes a ordem dos cards era fixa (`position` só era gravada na criação, sem como reorganizar). Agora dá para **arrastar e soltar por uma alça (⠿)** em **Hábitos → "Gerenciar"** e em **Rotinas → "Todas as rotinas"** (só os cards de topo; itens internos da rotina ficam fora de escopo). A nova ordem grava na coluna `position` (**já existia** em `habits`/`routines`; as queries já faziam `ORDER BY position`) e passa a valer em todas as telas, inclusive "Hoje" — a visão "Hoje" dos hábitos já respeita a ordem porque o `Array.sort` por `todayDone` é **estável** sobre a lista ordenada por `position` (pendentes/feitos mantêm a ordem manual dentro de cada grupo). **Sem migration/RPC:** as actions novas **`reorderHabits`/`reorderRoutines`** gravam `position = índice` via updates em paralelo (`Promise.all`, filtrando `id`+`user_id`; single-user, poucos itens). Lib **`@dnd-kit`** (core+sortable+utilities) instalada; componente reutilizável **`SortableList`** (`src/components/shared/sortable-list.tsx`) com alça dedicada (só ela arrasta — botões Editar/Ativar/Excluir seguem clicáveis), acessível por teclado e com sensor de toque (delay p/ não brigar com scroll). **Optimistic UI** nas duas telas (reordena na hora; em erro → toast + `router.refresh` reverte; sincroniza a prop do servidor via ajuste de estado no render, sem `useEffect` — exigência do lint do React 19). Lógica pura **`reorderedPositions`/`arrayMoveById`** (`src/lib/shared/reorder.ts`) com testes. Arquivos: a lib, o componente, `actions/habits.ts`, `actions/routines.ts`, `habitos/habits-client.tsx`, `rotinas/routines-client.tsx`. Testes novos (`reorder.test.ts`, 6 casos): suíte **414** (lint/tsc/build ok). Spec em `docs/superpowers/specs/2026-06-27-ordenacao-habitos-rotinas-design.md`.
- **2026-06-27 — Recorrência em cartão de crédito (assinaturas mensais caem na fatura).** Em Financeiro → Recorrências só dava para vincular **conta**: o dropdown de forma de pagamento já listava "Cartão de crédito" (o enum `PAYMENT_METHODS` é compartilhado com lançamentos), mas ao escolher cartão **não aparecia seletor de cartão**, o form ainda pedia **Conta**, e salvar **quebraria** — a tabela `recurring_transactions` não tinha `card_id` nem aceitava `cartao_credito` no CHECK de `payment_method`. Agora: ao escolher cartão, o form **substitui "Conta" por "Cartão"** (cartões ativos + o cartão atual mesmo inativo, p/ edição não perder a seleção), **força tipo = despesa** (só despesa resolve fatura) e **não toca em conta**. Na geração, **cada ocorrência** vira despesa no cartão e é resolvida para a **fatura da sua data** via `resolveOrCreateStatement` (mesma regra pura `resolverFatura` da compra avulsa) — o `account_id` fica **null**. Migration **`20260627000000_recurring_card_support`** (idempotente; espelha a de `transactions`): `card_id` FK `on delete set null` + recria o CHECK com `cartao_credito` + índice `(user_id, card_id)`; `supabase.ts` ajustado. Validação cruzada no Zod (`superRefine`): cartão → `card_id` obrigatório e tipo despesa; sem cartão → `card_id` nulo. **Cartão excluído** deixa a recorrência **órfã** (`card_id` vira null com `payment_method` ainda `cartao_credito`) → a geração **pula** (não insere transação sem fatura, não avança `next_due_date`) sem travar as demais. Lógica pura nova **`buildGeneratedRow`/`isCardRecurrence`** em `src/lib/finance/generation.ts` (extraídas para teste; statement é I/O resolvido por data). Arquivos: a migration, `validators/recurring.ts`, `actions/recurring.ts`, `finance/generation.ts`, `finance/queries.ts` (join `card:credit_cards`), e `financeiro/recorrencias/{page,recurring-client,recurring-form}.tsx`. Testes novos (`generation.test.ts`, 5 casos): suíte **407** (lint/tsc/build ok).
- **2026-06-27 — Embed ambíguo no `getTransactions` esvaziava as listas (à vista somem das faturas; afeta Lançamentos/Dashboard).** Regressão de runtime introduzida pela feature de pagamento de fatura: a migration `20260627140000` adicionou `card_statements.pago_transacao_id → transactions.id`, criando um **2º FK** entre `transactions` e `card_statements`; ao mesmo tempo o `TX_SELECT` passou a embutir `statement:card_statements(id,pago_em)` **sem desambiguar o FK**. Com 2 relacionamentos, o PostgREST 14.5 responde **`PGRST201` (HTTP 300)** e o `getTransactions` cai em `data ?? []` → **lista vazia**. Sintoma visível em `/faturas`: o detalhe da fatura só mostrava as **parcelas** (vêm de `getStatementInstallmentItems`) — sumiam **à vista e estornos** (vêm do `getTransactions`); o mesmo afetava **Lançamentos** e o **Dashboard**. Não pega em build/tsc/lint/testes (erro só de runtime). Correção (1 linha em `src/lib/finance/queries.ts`): desambiguar como o `accounts` já fazia na mesma string → **`statement:card_statements!transactions_statement_id_fkey(id,pago_em)`**. Verificado contra o REST real: antes `HTTP 300/PGRST201`, depois `HTTP 200`. Sem migration, suíte **401** (lint/tsc ok). **Aprendizado:** ao adicionar um FK que cria um 2º caminho entre tabelas já usadas em embeds PostgREST, **todo `select` que embute aquela tabela precisa do hint `!nome_do_fk`** — varrer os `*_SELECT` em `queries.ts`.
- **2026-06-27 — Pagar fatura debita uma conta (sem duplicar relatórios) + resolve a pendência do "seletor de conta".** O botão **Pagar** da fatura abre um diálogo que **sempre pede a conta** a debitar e cria **um lançamento de pagamento tipo `transferencia`** (sai da conta escolhida, status `pago`, `amount` = `total_atual` da fatura, **sem** `statement_id`/`card_id`, sem 2ª perna). Por ser transferência, **não infla** despesas/relatórios (o `dashboard` exclui `transferencia`/`ajuste`) **nem** o `total_atual` da fatura (a view só soma despesa/receita/parcelas) → **zero duplicação**; e **abate o saldo** da conta (a `account_balance` conta `transferencia` no lado `account_id`). **Desfazer** deleta esse lançamento (estorna o saldo) e limpa os campos. A fatura ganhou `pago_conta_id`/`pago_transacao_id` (migration **`20260627140000_card_statements_pagamento`**, idempotente; `supabase.ts` regenerado). Na lista de **Lançamentos**, item de cartão exibe **pago/em aberto DERIVADO** da `pago_em` da fatura (não do status gravado) — `getTransactions` passou a embutir `statement:card_statements(id,pago_em)`. **Resolve a pendência** registrada abaixo (`markStatementPaid(id)` sem `contaId`): assinatura agora **`markStatementPaid(id, contaId)`** e `build`/`tsc` voltam a passar. Lógica pura **`montarPagamentoFatura`** (`src/lib/finance/statement-payment.ts`, 4 testes). Bloqueios: fatura já paga e total ≤ 0 (botão oculto). Suíte **401** (lint/tsc/build ok).
- **2026-06-27 — Importar fatura parcelada + divisão "por valor": recebível do terceiro vinha dividido por `qtd`.** Numa fatura de terceiro, a divisão de uma linha parcelada **por VALOR** ficava com o recebível **dividido pelo nº de parcelas** (ex.: SUZY com R$147,50/parcela aparecia como **R$73,75**). Causa-raiz (confirmada no banco): no diálogo de divisão da revisão o usuário digita/prevê a parte contra **uma parcela** (o valor da linha), mas `createInstallmentPurchase`/`applySplitParcelado` dividem a parte de cada pessoa pelo **total da compra** (`valor_total = parcela × qtd`) e a espalham nas `qtd` parcelas → toda parte **por valor** saía dividida por `qtd` (percentual não, pois P% da parcela = P% do total). Correção: nova função pura **`escalarPartesParcelado`** (`src/lib/import/parcelamento.ts`) multiplica as partes **por valor** por `qtd` (em centavos) antes de chamar o motor; `commitImport` aplica só no ramo do parcelamento. Agora o recebível por parcela bate com o preview. **Sem migration** (lógica do commit). Testes novos (6 casos de `escalarPartesParcelado`): suíte **401**. **Dados:** as 2 compras afetadas (todas "100% do terceiro", parcelas uniformes) foram corrigidas via SQL — **Bruna Biju 2** (Suzy: recebíveis 73,75→**147,50** ×2, `valor_pessoal` 147,50→**0**) e **Cea Bau 383 Ecpc** (Nicole: 30/29,99→**59,99** ×2, `valor_pessoal`→**0**). Total da SUZY em jun/2026 voltou aos **R$773,53** exatos. As compras com divisão **por percentual** (Anuidade, Ren Sushi, outra Cea) já eram autoconsistentes e não foram tocadas. **Pendência separada (pré-existente, não deste fix):** `npm run build`/`tsc` falham em `faturas/statements-client.tsx:260` — `markStatementPaid(id)` foi chamado sem o 2º arg `contaId` (recurso "marcar fatura como paga" meio-ligado no commit `b8696b5`); precisa de seletor de conta.
- **2026-06-27 — Estorno de cartão não infla "Entradas"/Receitas + rótulo na lista.** O estorno (receita vinculada à fatura, `account_id` nulo) aparecia em Lançamentos como **"Receita + Recebido"** e era somado em `entradasCent` no `resumoMes` — mas o estorno **também** já reduz o `total_atual` da fatura, então era **contado em dobro** (inflava as Entradas do mês no Painel/Relatórios/evolução/comparativo, que reusam `resumoMes`). **Saldo das contas NÃO era afetado** (a função `account_balance` só soma transações com `account_id`/`transfer_account_id`; estorno tem ambos nulos). Correção: em `resumoMes`, receita com `card_id` **não** entra em `entradas` (já está no total da fatura) — corrige evolução/comparativo/dashboard por reuso. UI: novo **`EstornoBadge`** ("Estorno de cartão") substitui "Receita + Recebido" na lista de lançamentos (detecção `type='receita' && card_id != null`). Teste novo em `dashboard.test.ts`: suíte **391** (lint/tsc/build ok). Sem migration (lógica de leitura).
- **2026-06-27 — Importação de fatura: parcelas iam para meses passados (faturas "Atrasada") + total da fatura errado.** Numa fatura de cartão, a linha "k/N" e a **última parcela "N/N"** trazem a **data da compra ORIGINAL** (meses atrás), não a data desta fatura. `commitImport` ancorava a fatura de destino nessa data antiga (`resolveOrCreateStatement(data_norm)` / `distribuirFaturas(data_norm)`), então a parcela `k` caía na fatura da compra original e espalhava `k…N` por **meses passados** — gerando faturas-fantasma "Atrasada" **e** drenando o total da fatura atual (as à vista, de data recente, caíam certo; só as parcelas/últimas vazavam). Causa única dos dois sintomas. Correção: **toda linha do arquivo pertence à fatura sendo importada**. Nova competência-âncora por lote: detectada das **compras à vista** (pura `detectarCompetenciaFatura`, `src/lib/import/competencia.ts`) e **confirmável na revisão** (campo "Fatura de destino", input de mês → `setImportBatchCompetencia`); gravada em **`import_batches.competencia_fatura`** (migration `add_competencia_fatura_to_import_batches`). `commitImport` ancora **todas** as linhas de cartão nela: parcela `k` → fatura importada e `k+1…` nos meses seguintes (`planejarParcelamento`/`distribuirFaturas` ganharam `competenciaBase`; `installmentPurchaseSchema.fatura_inicial_competencia`), última parcela e à vista via `transactionSchema.statement_competencia` + novo `getOrCreateStatementForCompetencia`, estorno idem. Fallback quando não há à vista p/ inferir: fatura aberta de hoje. Testes novos (`competencia.test.ts`, `competenciaBase` em `installments.test.ts`): suíte **390** (lint/tsc/build ok). `src/types/supabase.ts` regenerado. **Dados:** o lote `fatura-azul-julho` foi desfeito e **reimportado** corretamente — junho fechou nos **R$ 4.262,45** exatos e nenhuma parcela em mês passado. **Faturas vazias:** o desfazer deixou faturas com **0 lançamentos** (criadas pelo get-or-create) aparecendo como "Atrasada". Correção durável: `getStatements` passou a filtrar **`itens > 0`** (fatura sem lançamento não lista nem conta em faturas/dashboard/relatórios) e as 5 faturas vazias do cartão foram apagadas.
- **2026-06-27 — Importar fatura "como parcelado": valor da parcela + só as restantes.** Numa fatura de cartão, a linha "k/N" traz o valor de **uma parcela** — não o total da compra. O "Importar parcelado?" antes passava `valor_total = valor da linha` e `qtd = N`, então "5/12 R$105" virava 12 parcelas de **R$8,75** (105÷12) começando do zero. Agora: nova lógica pura **`planejarImportParcelado`** (`src/lib/import/parcelamento.ts`) — cada parcela = valor da linha; gera **só as restantes** (`N − k + 1`, da atual `k` até a última `N`); então "5/12 R$105" → **8 parcelas de R$105** numeradas **5/12…12/12** (a 5ª nesta fatura, as 6–12 nas próximas). `commitImport` calcula via essa função e passa `numero_inicial`/`parcelas_total_label` ao motor reusado. `planejarParcelamento` ganhou `numeroInicial` (offset; default 1, fluxo manual intacto) e o schema ganhou `numero_inicial`/`parcelas_total_label` (opcionais). UI: o botão **"Importar parcelado?"** some na **última parcela** (k = N, ex.: 3/3 — não há futuro a gerar); ao marcar, o chip vira **"Como parcelamento ✕"** com um **× para cancelar** (reverte para avulso na própria revisão); `commitImport` também trata `k = N` como despesa avulsa. **Sem migration** (só comportamento do commit). Testes novos (`parcelamento.test.ts` + offset em `installments.test.ts`): suíte **382** (lint/tsc/build ok).
- **2026-06-27 — Importação: total monetário na revisão + estornos de cartão.** Duas mudanças ligadas:
  - **Total na revisão:** o resumo do lote em `ImportReview` mostra **"Total a importar"** — soma das linhas `para_importar` (ignoradas/duplicadas fora), para conferir contra a fatura/extrato antes do commit. Atualiza ao vivo; vira **"Total importado"** quando finalizado. O número-chave é o **líquido** (despesas − créditos); quando há créditos, exibe o detalhamento. Lógica pura **`totaisPorStatus`** (`src/lib/import/totals.ts`, soma em centavos) com testes.
  - **Estornos/créditos de cartão (corrige divergência com a fatura):** o "Total" revelou que a importação de fatura **inflava** o valor — estornos (valores negativos) eram somados como despesa. Raiz dupla: (1) `parseValorCentavos` não detectava o `-` **depois** do prefixo de moeda (`"R$ -5,14"` virava +5,14); (2) fatura de cartão forçava todo valor a `despesa`. Agora: `parseValorCentavos` detecta o sinal antes do 1º dígito; em fatura de cartão **valor negativo vira estorno (`receita`)** e o **pagamento da fatura** (`ehPagamentoFatura`: "pagamento/pagto/pgto") é **auto-ignorado**; `commitImport` cria o estorno como **receita vinculada à fatura** (`createCardEstorno`, insert direto — `createTransaction` só vincula despesa a `statement_id`). Migration **`20260627130000_card_statements_total_estornos`**: a view `card_statements_with_total` passa a **subtrair** as receitas vinculadas (`despesas − estornos + parcelas`) — sem regressão (não havia receita com `statement_id`). A tela `/faturas` destaca estornos (tag + verde). **Importante:** lotes já em revisão precisam **reaplicar o mapeamento** para reclassificar os estornos. Testes novos (sinal pós-moeda, negativo→estorno, auto-ignore de pagamento). Suíte **375** (lint/tsc/build ok).
- **2026-06-27 — Divisão com terceiros na edição e na importação.** Antes a divisão (Fase 05) só podia ser definida na **criação** manual. Agora:
  - **Dividir na edição:** `updateTransaction` passa a (re)aplicar a divisão de uma **despesa simples (não parcelada)** — reusa `applySplit`. Só re-aplica quando a divisão **muda de fato** (classificação, total ou partes), então editar só descrição/categoria/data de um gasto já dividido não mexe nos recebíveis. **Bloqueia** alterar a divisão se já houver recebível `cobrado`/`pago` (protege histórico). O form de lançamento mostra a seção de divisão na edição e **pré-preenche** com as partes gravadas (`getTransactionSplit` + `sharedExpensesToFormParts`). Parcelados seguem em `/parcelamentos`.
  - **Dividir na revisão da importação:** migration `20260627120000_import_rows_split` adiciona `classificacao` + `split_parts (jsonb)` a `import_rows`. Botão **"Dividir"** por linha (despesa) abre o editor (`ImportRowSplitDialog`) com preview; `setImportRowSplit` grava na linha; `commitImport` repassa a divisão para `createTransaction`/`createInstallmentPurchase` (já aceitavam) — então a transação importada **já nasce dividida**, inclusive parceladas.
  - **Correção:** `splitSchema` (validators/split) agora aceita valor no padrão BR (`"44,01"`, `"1.234,56"`) via `normalizeBRMoney` — antes `z.coerce.number` quebrava com vírgula, então "dividir por valor" só funcionava com inteiros.
  - Testes novos (`sharedExpensesToFormParts`, `validators/split`): suíte **362** (lint/tsc/build ok). `src/types/supabase.ts` regenerado após a migration.
- **2026-06-27 — Importação: detecção do cabeçalho fora da 1ª linha.** Faturas/extratos reais (ex.: export do Itaú/cartão Azul) trazem linhas de **título/resumo antes da tabela**, então o cabeçalho real não é a 1ª linha. `parseCsv`/`parseXlsx` pegavam o título (`Nome;Yuri…`) como cabeçalho → `autoDetectMapping` devolvia `{}` → **toda** linha caía em "Mapeie as colunas de data e valor.". Correção: nova função pura **`detectHeaderRow()`** (`src/lib/import/mapping.ts`) acha a 1ª linha (nas ~30 primeiras) cujo `autoDetectMapping` resolve **DATA e VALOR**; `csv.ts`/`xlsx.ts` fatiam a partir dela. **Fallback para a linha 0** → sem regressão em arquivos já tabulares. Também: **`parseParcela`** passou a entender **"Parcela X de N"** (formato Itaú), além de "k/N". Testes novos (`csv.test.ts`, casos de `detectHeaderRow` e parcela "de"): suíte **356 testes** (lint/tsc/build ok). Linhas de rodapé (Subtotal/aviso) saem como `erro` ignorável e nunca são importadas.
- **2026-06-26 — Conta/Segurança em Configurações (trocar e-mail + senha).** Novo card **`SecurityCard`** (`src/components/settings/security-card.tsx`) em `/configuracoes`, logo após o `ProfileCard`, com duas seções (Separator entre elas):
  - **Trocar senha** (estando logado): senha atual + nova + confirmar. Reautentica com `signInWithPassword({ email, current })` e, se ok, `updateUser({ password })` — **reflete na hora** em `auth.users`.
  - **Trocar e-mail**: `updateUser({ email }, { emailRedirectTo: \`${origin}/auth/callback?next=/configuracoes\` })` — fluxo **padrão seguro** do Supabase (confirma no e-mail antigo **e** no novo). Reusa o `/auth/callback` existente (`exchangeCodeForSession`). **Sem migration** (senha/e-mail vivem em `auth.users`).
  - Segue a **convenção de auth do repo** (client do navegador, igual `auth-form.tsx`), `react-hook-form` + `zodResolver`. Schemas puros em `src/lib/validators/auth.ts` (`changePasswordSchema`/`changeEmailSchema`) + testes `auth.test.ts` (6). Suíte: **348 testes** (lint/tsc/build ok).
  - **Config manual no Dashboard Supabase** (`yjvnlbjvippefvzgrxxw` → Authentication → URL Configuration), não exposto por MCP: incluir `http://localhost:3000/auth/callback` e o callback de produção na **Redirect URLs allow-list**; conferir **Site URL** e que **"Secure email change"/"Confirm email"** estão ativos.

## Fases
| # | Fase | Status |
| --- | --- | --- |
| 01 | Foundation, Arquitetura & Design System | ✅ Concluída |
| 02 | Financeiro Base | ✅ Concluída |
| 03 | Cartões de Crédito & Faturas | ✅ Concluída |
| 04 | Parcelamentos | ✅ Concluída |
| 05 | Gastos de Terceiros & Divisão | ✅ Concluída |
| 06 | Importação (Excel/CSV/OFX) | ✅ Concluída |
| 07 | Dashboard Financeiro | ✅ Concluída |
| 08 | Agenda & Google Agenda | ✅ Concluída |
| 09 | Demandas, Tarefas & Rotinas | ✅ Concluída |
| 10 | Hábitos | ✅ Concluída |
| 11 | Estudos | ✅ Concluída |
| 12 | Dashboard Geral | ✅ Concluída |
| 13 | Busca Global, Lançamento Rápido & Notificações | ✅ Concluída |
| 14 | Segurança, Responsividade & Polimento Final | ✅ Concluída |
| 15 | Módulo TO-DO completo (fora do roadmap original) | ✅ Concluída |
| 16-A | Dieta e Alimentação · Fundação, cálculo e catálogo | ✅ Concluída |
| 16-B | Dieta e Alimentação · Metas, diário e planejamento | ✅ Concluída |
| 16-C | Dieta e Alimentação · Receitas, refeições e substituições | ✅ Concluída |
| 16-D | Dieta e Alimentação · Lista de compras e despensa | ✅ Concluída |
| 16-E | Dieta e Alimentação · Medidas, evolução e relatórios | ⬜ Próxima |
| 16-F | Dieta e Alimentação · Integrações e polimento | ⬜ |

## O que foi implementado na Fase 14 (Segurança, Responsividade & Polimento Final)
- **Schema finalizado (idempotente)** em `supabase/migrations/`, aplicado no projeto `yjvnlbjvippefvzgrxxw`. Security advisor: **0 lints de schema** (resta só o aviso externo de Auth "leaked password protection"). **34 tabelas** no total (+ `attachments`) e **2 buckets** privados de Storage.
  - **`settings` estendida** (`20260626200000_settings_profile.sql`) — apenas **adiciona** colunas à store da Fase 12 (RLS já ativa): `display_name`, `avatar_url`, `theme` (default `system`), `currency` (default `BRL`), `date_format` (default `dd/MM/yyyy`), `notification_prefs jsonb`. **Nenhuma tabela de domínio nova** aqui.
  - **`attachments`** (`20260626200100_attachments.sql`) — anexos/comprovantes genéricos (`entity_type`/`entity_id` **sem FK**, `storage_path`, `file_name`, `mime_type`, `size_bytes`), **RLS + FORCE RLS** (`user_id = auth.uid()`), índices `user_id` e `(user_id, entity_type, entity_id)`, único `(bucket_id, storage_path)`, trigger `updated_at`. Espelha o padrão de `task_attachments` (Fase 09).
  - **Bucket `attachments`** privado (`20260626200200_attachments_storage.sql`) — policy de `storage.objects` por pasta `{user_id}/…` (mesmo padrão de `task-attachments`).
- **Relatórios consolidados (`/relatorios`)** — Server Component `force-dynamic` + `relatorios-client.tsx` com **5 abas** (Financeiro, Cartões, Hábitos, Estudos, Tarefas), filtro de **período (mês)** na URL e **exportação** (CSV por aba + "Baixar relatório (JSON)"). **REUSO, não reescrita**: `src/lib/reports/queries.ts` monta tudo reaproveitando `finance/dashboard.ts` (Fase 07), `getHabitsDashboard` (Fase 10), `getStudyDashboard` (Fase 11) e o agregador **puro** `src/lib/reports/tasks.ts` (sobre `tasks/status.ts` da Fase 09). Gráficos reaproveitam os componentes da Fase 07 (`CategoriaChart`/`FormaPagamentoChart`/`EvolucaoChart`/`MesAMesChart`/`ProjecaoChart`) + um `ReportBarChart` genérico novo. `loading.tsx` (skeleton).
- **Configurações finais (`/configuracoes`)** — agora completa: **Perfil** (`ProfileCard`: nome + avatar), **Aparência** (`AppearanceCard` com claro/escuro/sistema, persiste o tema na store best-effort), **Regional** (`RegionalCard`: moeda BRL fixa + **formato de data** com pré-visualização ao vivo), **Notificações** (`NotificationsCard`: liga/desliga cada tipo de alerta in-app, agrupado por área), **Integração Google Agenda** (reusa `GoogleConnectCard`), **Dashboard** (`DashboardPrefsCard`: personalizar + restaurar padrão), **Exportação & backup** (link `/api/export`) e atalhos para **Categorias**/**Cartões**.
- **Store de preferências (Fase 12 estendida)** — `src/lib/settings/constants.ts` (enums/labels puros: tema, formato de data, prefs de notificação), `src/lib/settings/queries.ts` (`getUserSettings`/`getDisplayName`), validators Zod (`profileSchema`/`preferencesSchema`/`themeSchema`/`notificationPrefsSchema`) e Server Actions (`saveProfile`/`savePreferences`/`saveThemePreference`/`saveNotificationPrefs`) — **upsert parcial** por `user_id` (não sobrescreve outras prefs), `user_id` sempre de `auth.uid()`, retorno `ActionResult`.
- **Exportação/backup (`/api/export`)** — rota `nodejs` que devolve **JSON** com **todos** os dados do usuário (34 tabelas, **menos `google_integrations`** — tokens nunca saem). Cada `select` roda sob a sessão do usuário → **RLS garante** que não vaza dado de outro usuário. Rota **privada** (proxy exige sessão) **e** revalida `auth.getUser()` na própria rota (defesa em profundidade).
- **Auditoria de segurança** — **RLS habilitada em TODAS as 34 tabelas** (`using`+`with check` por `user_id`); `service_role` aparece **apenas** em `src/lib/supabase/service.ts` (definição server-only) e na rota do Cron (`/api/cron/notifications`) — **nunca** em código de client; segredos só no servidor; todas as Server Actions novas validam com **Zod no servidor**. Backup **não** inclui tokens. Confirmado pelo `get_advisors` (0 lints de schema).
- **Nav + layout** — item **Relatórios** (`/relatorios`) adicionado em `src/config/nav.ts` (grupo Geral). O header/menu do usuário passou a exibir o **nome de exibição** (`settings.display_name`), propagado pelo layout `(app)` → `AppShell` → `Header` → `UserMenu`.
- **Polimento** — novas telas com responsividade (grids `sm:`/`lg:`), **empty states** (`EmptyState`) por aba quando não há dados, **skeleton** de loading, e o helper `formatDateWith` (aplica a preferência de formato de data sem quebrar o padrão BR global).

## O que foi implementado na Fase 13 (Busca Global, Lançamento Rápido & Notificações)
- **Schema + RLS (1 tabela nova)** em `supabase/migrations/20260626190000_notifications.sql`, aplicada no projeto `yjvnlbjvippefvzgrxxw` (**RLS + FORCE RLS**, idempotente). Security advisor: **0 lints de schema**.
  - **`notifications`** — `title`, `description`, `type` (texto livre; o app produz/lê `invoice_due|invoice_overdue|bill_due|bill_overdue|receivable_pending|task_overdue|task_today|event_upcoming|habit_pending|water_goal|study_overdue|card_limit|high_spending`), `priority` (`low|medium|high|urgent`, CHECK), `link`, `entity_type`/`entity_id` (referência genérica, sem FK), `is_read`, `is_resolved`, `resolved_at`, `notify_at`, **`dedupe_key`** (índice **único parcial** em `(user_id, dedupe_key) where dedupe_key is not null` — o Cron não recria a mesma notificação), trigger `updated_at`. Índices em `user_id`, `(user_id,is_read)`, `(user_id,type)`, `(user_id,notify_at)`.
- **Lógica pura de geração de alertas + 28 testes Vitest** em `src/lib/notifications/generate.ts` (datas injetadas, sem `Date.now()`): `generateNotifications(input)` recebe estruturas simples e emite `NotificationCandidate[]` com `dedupe_key` determinístico para **10 famílias de regra** (fatura a vencer/atrasada, conta a vencer/vencida, recebível pendente, tarefa atrasada/do dia, evento próximo, hábito pendente, meta de água, estudo atrasado, limite de cartão, gasto alto); **`selectNewCandidates(cands, existingKeys)`** garante a **idempotência** (rodar 2× não duplica). Reusa `statusEfetivo` (F03), `isOverdue`/`isDueToday` (F09), `courseOverdueReason` (F11). Testes cobrem cada regra disparando quando deve + idempotência + dedupe no lote.
- **Central de notificações:** leitura server-only `src/lib/notifications/queries.ts` (`getUnreadCount`/`getRecentNotifications`/`getNotifications` com filtros) + Server Actions `src/lib/actions/notifications.ts` (`markNotificationRead`/`markAllNotificationsRead`/`resolveNotification`/`reopenNotification`/`deleteNotification`/`fetchRecentNotifications`). **Sino no header** (`src/components/notifications/notification-bell.tsx`) com **badge de não lidas** (semeado pelo layout) + popover (`src/components/ui/popover.tsx`, novo, sobre `radix-ui`) que carrega as últimas ao abrir; **página `/notificacoes`** (server + client) com **filtros** (status/tipo/prioridade na URL), **marcar lida / todas**, **resolver/reabrir**, **excluir** (confirm) e **abrir pelo link**; `loading.tsx`. Item de nav **Notificações** adicionado. O **card placeholder do dashboard** (`getNotificationsCardData`) agora **lê as não lidas reais**.
- **Geração agendada (Vercel Cron):** rota `src/app/api/cron/notifications/route.ts` (runtime nodejs) protegida por **`CRON_SECRET`** (`Authorization: Bearer …` → 401 sem segredo). Usa o **cliente service-role** (`src/lib/supabase/service.ts`, server-only) e o orquestrador `src/lib/notifications/cron.ts` (`runNotificationGeneration` → `generateForUser`): lê os dados de cada usuário **filtrando `user_id` explicitamente**, mapeia para a lógica pura, e **insere só os que faltam** por `dedupe_key`. `vercel.json` agenda 2×/dia (09:00 e 21:00 UTC). Sem service role configurada → **no-op 200** (degrada com elegância). `.env.local.example` documenta `CRON_SECRET` + `SUPABASE_SERVICE_ROLE_KEY`. `/api/cron` virou rota pública no `proxy.ts` (não redireciona p/ login; a proteção é o segredo).
- **Busca global:** `src/lib/search/queries.ts` (`searchAll`, server-only, RLS) consulta **11 entidades em paralelo** com `ilike` (transações, cartões, faturas, pessoas, contas, tarefas, rotinas, hábitos, estudos, eventos, notificações), sanitiza o termo e devolve shape unificado `{type,id,title,subtitle,link}` **agrupado por tipo**. Server Action `globalSearch` (RPC). **Command palette** (`src/components/search/search-command.tsx`) abre com **Ctrl/Cmd+K** e pelos triggers do header (caixa no desktop, ícone no mobile), com **debounce**, navegação por teclado (↑/↓/Enter), skeleton/loading e empty state. **Página `/busca`** (server lê `?q=` + client com busca ao vivo). Resultados abrem o item (deep-link).
- **Lançamento rápido:** `src/components/quick-add/quick-add.tsx` — botão "Lançar" (desktop) / "+" (mobile) no header → modal com seletor de **8 tipos** (despesa à vista, gasto no cartão, receita, transferência, tarefa, evento, check-in de hábito, sessão de estudo). Cada tipo é um **mini-form** que **reusa a Server Action original** (`createTransaction`/`createTask`/`createEvent`/`createSession`/`setHabitValue`) — **nenhuma regra de negócio reimplementada** (fatura correta pela F03, terceiros pela F05, etc.). Opções dos selects carregadas sob demanda (`loadQuickAddOptions`). Toast de sucesso + `router.refresh`.
- **Header religado:** `src/components/layout/header.tsx` agora compõe `SearchCommand` + `QuickAdd` + `NotificationBell` (os placeholders "chega na Fase 13" foram removidos). O layout `(app)` busca `getUnreadCount()` e passa `unreadCount` ao `AppShell` → `Header`.

## O que foi implementado na Fase 12 (Dashboard Geral)
- **Schema + RLS (1 tabela nova de PREFERÊNCIAS)** em `supabase/migrations/20260626180000_settings.sql`, aplicada no projeto `yjvnlbjvippefvzgrxxw` (**RLS + FORCE RLS**, idempotente). **Nenhuma tabela de domínio nova** — o dashboard só **lê e agrega** o que já existe.
  - **`settings`** — `dashboard_layout jsonb` (`{ order, hidden, period, view }`), **`unique(user_id)`** (uma linha por usuário, base do upsert e índice em `user_id`), trigger `updated_at`. Store reutilizável pela Fase 14. Security advisor: **0 lints de schema**.
- **Lógica pura + 18 testes Vitest** em `src/lib/dashboard/` (datas injetadas, fuso local pt-BR):
  - `period.ts` — `resolveWindow` traduz o período (hoje/semana/mês/mês anterior/personalizado) numa janela `{from,to,mes,view}` inclusiva (semana segunda→domingo, `weekStartsOn:1`); trata virada de mês/ano, datas custom trocadas/ inválidas (cai para o mês) e deriva a visão pelo tamanho da janela. `windowLabel`/`periodWord`/`asPeriod`/`asView`/`isIsoDate`.
  - `cards.ts` — registro dos 7 cards (ids/títulos), `DashboardLayout`, `DEFAULT_DASHBOARD_LAYOUT`, **`normalizeLayout`** (reconcilia o jsonb cru: mantém a ordem salva, **anexa cards novos** de fases futuras, descarta lixo, valida period/view — read-your-writes sem flash) e `visibleCards`.
- **Validators Zod** (`src/lib/validators/settings.ts`: `dashboardLayoutSchema`) + **Server Actions** (`src/lib/actions/settings.ts`): `saveDashboardLayout` (parse Zod → `normalizeLayout` → **upsert** por `user_id`) e `resetDashboardLayout`. `user_id` sempre de `auth.uid()`; retorno `ActionResult`; `revalidatePath('/dashboard')`.
- **Leituras agregadas server-only** (`src/lib/dashboard/queries.ts`, uma função por card, cada uma sob seu Suspense): **financeiro** (reusa `resumoMes`/`proximasContasPagar`/`totalAReceber` da Fase 07 — saldo, entradas/saídas, **valor meu × terceiros**, cartão × à vista, a receber, próximas contas), **faturas** (reusa `proximas6Faturas` — abertas/fechadas/pagas, próximos vencimentos, a receber), **agenda** (`getCalendarEvents`/`getUpcomingCalendarEvents` — contagem hoje/no período + próximos compromissos), **tarefas/rotinas** (open/hoje/atrasadas/em andamento via `effectiveTaskStatus` + rotinas do dia), **hábitos** (reusa `getHabitsDashboard` + `computeConsistency` no período — check-in rápido), **estudos** (leitura enxuta de cursos+sessões reusando `minutesInRange`/`studyStreak`/`courseOverdueReason` — em andamento, horas no período, atrasados, sequência), **notificações** (placeholder `available:false` — degrada com elegância até a Fase 13).
- **Tela `/dashboard` (agora o Dashboard GERAL)** — Server Component `force-dynamic` que carrega a preferência (`settings`) e monta **7 cards** (financeiro, cartões/faturas, agenda, tarefas/rotinas, hábitos, estudos, notificações), **cada um com seu `<Suspense>`/skeleton** (stream por card). `general-dashboard-client.tsx`: **filtro de período** (hoje/semana/mês/mês anterior/personalizado com datas) + **visão dia/semana/mês** (estado na URL `?periodo=&visao=&de=&ate=`, propaga para todos os cards), **modo Personalizar** com **reordenar (drag-and-drop HTML5 + ↑/↓)**, **ocultar/mostrar** (olho), **Salvar** e **Restaurar padrão** (persistido em `settings` via Server Action + toast). `loading.tsx` (skeleton do grid).
- **Dashboard financeiro (Fase 07) preservado** — movido para **`/dashboard/financeiro`** (`page.tsx` + `financial-dashboard-client.tsx` + `loading.tsx`), item de navegação **"Painel financeiro"** adicionado em `src/config/nav.ts`. O card "Financeiro" do dashboard geral linka para lá. **Nada da Fase 07 foi removido**, só relocado (o `/dashboard` raiz passou a ser o geral, como pede a fase).

## O que foi implementado na Fase 11 (Estudos)
- **Schema + RLS (6 tabelas novas)** em `supabase/migrations/`, aplicadas no projeto `yjvnlbjvippefvzgrxxw` (todas **RLS + FORCE RLS**, índices, trigger `updated_at`, idempotentes). Security advisor: **0 lints de schema**.
  - **`study_courses`** — `title`, `platform`, `url`, `category` (`marketing|trafego_pago|ingles|idiomas|negocios|tecnologia|design|vendas|desenvolvimento_pessoal|outro`), `status` (`nao_iniciado|em_andamento|pausado|concluido`), `priority` (`baixa|media|alta`), **`progress numeric(5,2)`** e **`studied_minutes int`** (ambos **derivados e persistidos** — ver decisões), `workload_minutes`, **`weekly_goal_minutes`** (meta semanal de idioma — coluna no curso, **não** tabela própria), `start_date`, `target_date`, `notes`, **`materials jsonb`** (`[{label,url}]`), `is_language`, `cover_color`, `icon`, `position`. Índices `(user_id,status)`, `(user_id,category)`.
  - **`study_modules`** — `course_id` (fk `on delete cascade`), `title`, `position`, `notes`.
  - **`study_lessons`** — `module_id` (fk cascade), **`course_id` desnormalizado** (fk cascade, preenchido no servidor), `title`, `url`, `duration_minutes`, `is_done`, `completed_at`, `position`, `notes`. Índices `(user_id,course_id)`, `(user_id,module_id)`, `(user_id,is_done)`.
  - **`study_sessions`** — `course_id` (fk cascade), `lesson_id` (fk `on delete set null`), `session_date`, `duration_minutes`, `what_i_learned`, `next_action`, `difficulty` (`facil|media|dificil`), **`task_id`** (fk→`tasks` `on delete set null`, vínculo **opcional** com a Fase 09). **Não** é único por dia (várias sessões/dia). Índices `(user_id,session_date)`, `(user_id,course_id)`.
  - **(Idiomas) `study_vocabulary`** — `course_id` (fk cascade), `term`, `translation`, `example`, `mastery` (`novo|aprendendo|dominado`), `next_review_date`. Índices `(user_id,course_id)`, `(user_id,mastery)`.
  - **(Idiomas) `study_language_practice`** — `course_id` (fk cascade), `practice_date`, `skill` (`listening|speaking|reading|writing`), `duration_minutes`, `notes`. Índices `(user_id,course_id)`, `(user_id,practice_date)`.
- **Lógica pura + 31 testes Vitest** em `src/lib/studies/` (datas injetadas, fuso local pt-BR):
  - `progress.ts` — `courseProgress` (razão de aulas concluídas; curso sem aulas → 0), `totalMinutes`/`minutesInRange` (horas semana/mês), `sessionDateSet`, `nextLesson` (primeira aula não concluída na ordem módulo→aula), `courseOverdueReason` (`target`=passou da data-alvo / `inactive`=sem sessão há >7 dias). **23 testes**.
  - `streak.ts` — `studyStreak`/`bestStudyStreak` (dias consecutivos com ≥1 sessão; **"hoje ainda conta"** como no streak de hábitos). **8 testes**.
  - `constants.ts` — enums/labels/cores (status/categoria/prioridade/dificuldade/mastery/skill), `formatMinutes` ("3h 20min"), `minutesToHours`, `formatPercent`, visões da tela.
  - `queries.ts` — leitura server-only: `getStudyDashboard` carrega cursos/módulos/aulas/sessões (janela ~1 ano)/prática-da-semana/tarefas **uma vez** e deriva cards + horas semana/mês + streak + evolução (8 sem.) + próximas aulas + atrasados + opções do formulário; `getCourseDetail` monta a árvore módulos/aulas + sessões + vocabulário + prática + progresso semanal de idioma.
- **Validators Zod** (`src/lib/validators/study.ts`: course/module/lesson/session/vocabulary/practice; `materials` valida `{label,url}`) + helpers `optionalUrl`/`minutesInt` em `shared.ts`. **Server Actions** (`src/lib/actions/studies.ts`): CRUD de curso/módulo/aula; `toggleLessonDone`; reordenação (`moveModule`/`moveLesson`); `createSession` (com "marcar aula concluída" na mesma operação + vínculo opcional com tarefa); vocabulário (CRUD + `setVocabMastery`); prática; `setCourseStatus`/`setWeeklyGoal`. **`recomputeCourseStats`** recalcula+persiste `progress`/`studied_minutes` após qualquer mudança de aula/sessão (fonte única, sem dupla contagem). `user_id` sempre de `auth.uid()`; retorno `ActionResult`.
- **Tela `/estudos`** (substitui o placeholder): Server `force-dynamic` + `studies-client.tsx` com **4 visões** (estado em URL `?view=`): **Painel** (StatCards de horas semana/mês, sequência, em andamento; **gráfico de evolução** recharts; próximas aulas; estudos atrasados; progresso por curso), **Cursos** (grid de cards com capa colorida + progresso + CRUD), **Sessões** (histórico global + registrar/editar/excluir) e **Idiomas** (cursos de idioma com meta semanal). `loading.tsx`.
- **Rota `/estudos/[id]`** (detalhe do curso): Server `force-dynamic` + `course-detail-client.tsx` — cabeçalho (status rápido, editar, excluir→redireciona), StatCards, barra de progresso, materiais, notas; abas **Conteúdo** (árvore módulos/aulas: CRUD, reordenar ↑↓, marcar concluída), **Sessões** (do curso) e **Idioma** (vocabulário com filtro/nível + prática por habilidade com meta semanal). `loading.tsx`. Item de navegação **Estudos** já existia em `src/config/nav.ts`.

## O que foi implementado na Fase 10 (Hábitos)
- **Schema + RLS (2 tabelas novas + 1 coluna)** em `supabase/migrations/`, aplicadas no projeto `yjvnlbjvippefvzgrxxw` (ambas **RLS + FORCE RLS**, índices, trigger `updated_at`, idempotentes). Security advisor: **0 lints de schema**.
  - **`habits`** — `name`, `category` (`leitura|exercicios|agua|sono|alimentacao|caminhada|estudos|outro`), `frequency` (`diaria|semanal|dias_especificos`), `weekdays int[]`, **`target_value numeric(12,2)`** (meta, `> 0`), `unit` (`vezes|minutos|horas|litros|ml|paginas|passos|km`), `time_of_day time` (horário ideal), `reminder_at time` (lembrete diário — entrega na Fase 13), `color`, `icon`, `is_active`, `position`, **`description`** (genérica: reaproveitada como "Livro atual"/"Tipo de exercício"). Índice `(user_id, is_active)`.
  - **`habit_logs`** — `habit_id` (fk→habits `on delete cascade`), `log_date date`, **`value numeric(12,2)`** (quanto foi feito), `is_done` (atingiu a meta?), `notes`. **Único** por `(user_id, habit_id, log_date)` (check-in nunca duplica — sempre **upsert**); índices `(user_id, log_date)` e `(user_id, habit_id)`. Molde direto de `routine_logs`.
- **Lógica pura + 27 testes Vitest** em `src/lib/habits/` (datas injetadas, fuso local pt-BR):
  - `streak.ts` — `habitOccursOn`/`scheduledDatesInRange`/`computeConsistency`/`currentStreak`/`bestStreak`/`reachedTarget`. **Diferença-chave vs. rotinas:** o streak **não quebra** quando o hábito de hoje ainda não foi feito (dia em andamento); um dia agendado **passado** sem conclusão, sim, quebra. **21 testes** (consecutivos, lacunas, semanal/dias específicos, virada de mês, "ainda dá tempo hoje", recorde).
  - `constants.ts` — categorias/unidades/cores/labels, passo do "+" por unidade, **conversão de água documentada** (`WATER_GLASS_ML = 250`, `glassesToUnit`), `formatHabitValue`/`formatAmount` (pt-BR), visões da tela. **6 testes** (água + formatação).
  - `queries.ts` — leitura server-only: **uma** consulta de `habit_logs` (janela ~1 ano) alimenta cards do dia (progresso, streak, recorde, consistência 7/30d, últimos 7 dias, histórico) **e** os agregados (`getHabitsDashboard`): taxa de conclusão 30d, **série semanal** (8 sem.), **heatmap** diário (15 sem.) e **ranking** dos mais consistentes.
- **Validators Zod** (`src/lib/validators/habit.ts`: `habitSchema` + `habitLogSchema`; helper `optionalTime` em `shared.ts`) e **Server Actions** (`src/lib/actions/habits.ts`): CRUD; **check-in idempotente** (`setHabitValue`/`incrementHabit`/`setHabitDone`/`logHabit`/`undoHabitCheckIn`) com `is_done` derivado da meta (`reachedTarget`); `setHabitDescription` (editor inline); `seedDefaultHabits` (Água/Leitura/Exercícios/Sono). `user_id` sempre de `auth.uid()`; retorno `ActionResult`.
- **Tela `/habitos`** (substitui o placeholder): Server `force-dynamic` + `habits-client.tsx` com **6 visões** (estado em URL `?view=`): **Hoje** (cards com check-in rápido, progresso feito×meta, streak dourado, destaque de **pendentes de hoje** + base de "esquecidos"), **Água** (anel de progresso, +/−1 copo, valor exato, tira da semana), **Leitura** e **Exercícios** (view reutilizável `SessionView`: editor inline "Livro atual"/"Tipo", registro com observações, histórico de sessões), **Consistência** (taxa 30d, gráfico recharts semanal, **heatmap** estilo contribuições, ranking) e **Gerenciar** (CRUD, ativar/desativar, excluir com confirmação, "Adicionar sugeridos"). `loading.tsx` (skeleton). Componentes em `src/components/habits/`. Item de navegação **Hábitos** já existia em `src/config/nav.ts`.

## O que foi implementado na Fase 09 (Demandas, Tarefas & Rotinas)
- **Schema + RLS (7 tabelas novas + 1 FK)** em `supabase/migrations/`, aplicadas no projeto `yjvnlbjvippefvzgrxxw` (todas **RLS + FORCE RLS**, índices, trigger `updated_at`, idempotentes). Security advisor: **0 lints de schema**.
  - **`projects`** — `name`, `description`, `color`, `icon`, `is_archived`, `position`.
  - **`tasks`** — `project_id` (fk→projects `on delete set null` = "Sem projeto/inbox"), `title`, `notes`, `priority` (`baixa|media|alta|urgente`), `status` (`pendente|em_andamento|concluida|atrasada|cancelada`), `start_date`, `due_date`, `completed_at`, `tags text[]`, **`recurrence jsonb`** (`{freq,interval,weekdays?,until?}`), `reminder_at`, **`calendar_event_id`** (fk→calendar_events `on delete set null`), `position`. Índices `(user_id,status)`, `(user_id,due_date)`, `(user_id,project_id)`.
  - **`task_checklist_items`**, **`task_attachments`** (+ bucket privado `task-attachments` em `storage.buckets` e policy de `storage.objects` por pasta `{user_id}/…`).
  - **`routines`** (`type`, `frequency` `diaria|semanal|dias_especificos`, `weekdays int[]`, `time_of_day`, `is_active`), **`routine_items`**, **`routine_logs`** (**único** por `(user_id,routine_id,log_date)`).
  - **FK preparada na Fase 08 conectada:** `calendar_events.task_id → tasks(id) on delete set null` (a coluna já existia sem FK).
- **Lógica pura + 35 testes Vitest** em `src/lib/tasks/` (mesmo rigor das fases anteriores, datas injetadas):
  - `recurrence.ts` — `nextOccurrence`/`materializeNext`/`normalizeRecurrence` (âncora com clamp de mês curto, weekdays de "semanal", `until` inclusivo). Ao **concluir** tarefa recorrente, materializa a próxima instância (clona campos + checklist).
  - `status.ts` — `effectiveTaskStatus`/`isOverdue`/`isDueToday`/`isOpen`/`compareTasks` (status **`atrasada` derivado na leitura**, nunca gravado — espelha "status na leitura" da fatura).
  - `routines.ts` — `routineOccursOn`/`scheduledDatesInRange`/`computeAdherence`/`currentStreak` (frequência "x de N dias" + streak).
  - `queries.ts` — leitura server-only (tarefas com projeto/checklist/anexos/evento; projetos com contagem; rotinas com log do dia/aderência/streak; opções de eventos).
- **Validators Zod** (`src/lib/validators/{project,task,routine}.ts`) e **Server Actions** (`src/lib/actions/{projects,tasks,routines}.ts`): CRUD completo, `completeTask`/`reopenTask`, **`moveTask` (status+position numa mutação)** para o kanban, checklist, anexos (Storage, URL assinada), check-in de rotina (upsert por dia), e **`seedDefaultRoutines`** (Manhã/Noite/Trabalho/Estudos/Exercícios + passos). `user_id` sempre de `auth.uid()`; retorno `ActionResult`.
- **Tela `/tarefas`** (substitui o placeholder): Server `force-dynamic` + `tasks-client.tsx` com **7 visões** (estado em URL `?view=&date=`): **lista** (busca + filtros prioridade/status), **kanban** (arrastável, HTML5 DnD + menu acessível), **calendário** (mês, reusa `buildMonthGrid`), **hoje** (tarefas do dia + rotinas do dia com check-in), **semana**, **atrasadas**, **concluídas**. Form de tarefa (RHF) com projeto, prioridade, status, datas, tags, recorrência (incl. weekdays), lembrete e vínculo com a agenda; detalhes com **checklist** e **anexos**; gestão de **projetos** (criar/editar/arquivar/excluir) num `Sheet`. `loading.tsx`.
- **Tela `/rotinas`** (nova, no nav): Server `force-dynamic` + `routines-client.tsx` — "Rotinas de hoje" com check-in (rotina e passos), aderência da semana e streak; gestão de rotinas (form com passos, ativar/desativar, excluir); botão "Adicionar sugeridas". `loading.tsx`. Item de navegação **Rotinas** adicionado em `src/config/nav.ts`.

## O que foi implementado na Fase 08 (Agenda & Google Agenda)
- **Schema + RLS (2 tabelas novas)** em `supabase/migrations/`, aplicadas no projeto `yjvnlbjvippefvzgrxxw` (ambas **RLS + FORCE RLS**, índices, trigger `updated_at`, idempotentes):
  - **`calendar_events`** — `title`, `description`, `location`, `start_at`/`end_at` (`timestamptz`), `all_day`, **`tipo`** (`pessoal`/`trabalho`/`estudos`/`exercicios`/`rotina`), `color` (personalizável; senão deriva do tipo), recorrência simples (`recurrence_freq`/`recurrence_interval`/`recurrence_until`), `reminder_minutes`, **`task_id`** (preparado p/ Fase 09, **sem FK** até `tasks` existir — documentado), campos de sync (`google_event_id`, `google_calendar_id`, `etag`, `origin` `local`/`google`, `synced_at`). Índice único parcial `(user_id, google_event_id)` evita duplicar no sync.
  - **`google_integrations`** — tokens OAuth (**server-only**): `access_token`, `refresh_token`, `token_expiry`, `scope`, `google_email`, `calendar_id`, `sync_token`, `last_synced_at`. `unique(user_id)`.
- **Lógica pura + 50 testes Vitest** em `src/lib/calendar/` (mesmo rigor das fases anteriores, datas injetadas):
  - `grid.ts` — `buildMonthGrid`/`buildWeekDays`/`dayHours`/`daySpan`/`layoutDayEvents` (empacotamento de sobreposições em colunas).
  - `recurrence.ts` — `expandOccurrences` (âncora sem drift de fim de mês; `until` inclusivo) + `toRRule`/`fromRRule` (mapeamento básico ↔ RRULE do Google).
  - `sync.ts` — `reconcile` (conciliação bidirecional "última edição vence", idempotente, sem duplicar).
  - `mapping.ts` — `rowToLite`, `eventToGoogleResource`, `googleToEventFields` (incl. dia inteiro ancorado ao meio-dia UTC).
  - `events.ts`/`expand.ts`/`upcoming.ts`/`colors.ts`/`format.ts`/`constants.ts` — filtros por dia, expansão de linhas→ocorrências, próximos compromissos, cores por tipo (legíveis dark/light) e formatação pt-BR.
- **Integração Google (server-only, `fetch` direto — sem dependência nova)** em `src/lib/google/`: `config.ts` (`isGoogleConfigured`, redirect URI), `oauth.ts` (authUrl/exchange/refresh/userinfo/revoke), `tokens.ts` (RLS-scoped; `getValidAccessToken` renova o token; nunca expõe/loga tokens), `calendar.ts` (list/insert/patch/delete na Calendar API v3).
- **OAuth (App Router):** `src/app/api/google/connect/route.ts` (gera `state` anti-CSRF em cookie httpOnly e redireciona ao consentimento) e `src/app/api/google/callback/route.ts` (valida `state`, troca o code, persiste tokens). `GOOGLE_CLIENT_ID`/`SECRET` só no servidor (documentados em `.env.local.example`).
- **Server Actions** (`src/lib/actions/calendar.ts`): `createEvent`/`updateEvent`/`deleteEvent` (push best-effort ao Google quando conectado, sem derrubar a ação local), `syncGoogleCalendar` (pull+push reconciliados numa janela [−30d, +180d]) e `disconnectGoogle` (revoga + remove). Leitura em `src/lib/calendar/queries.ts` (eventos por janela, próximos, estado da conexão **sem tokens**).
- **Tela `/agenda`** (substitui o placeholder): Server Component `force-dynamic` + `agenda-client.tsx`. Visões **dia/semana/mês** (estado em URL `?view=&date=`), navegação de período, **cores por tipo**, criar/editar/excluir com confirmação, detalhes do evento, lembretes e recorrência no form (RHF), card **Conectar/Sincronizar/Desconectar Google** e componente **Próximos compromissos** (`src/components/calendar/upcoming-events.tsx`) **pronto para o dashboard**. `loading.tsx` (skeleton).

## O que foi implementado na Fase 07 (Dashboard Financeiro)
- **Sem novas tabelas/migrations.** Camada de **agregação pura** (`src/lib/finance/dashboard.ts` + 22 testes) sobre as Fases 02–06, dinheiro em centavos. Cards de resumo (meu × total × terceiros), gráficos recharts (categoria/forma/mês-a-mês/evolução/projeção), próximas 6 faturas, alertas. UI em `/dashboard` (`page.tsx`/`loading.tsx`/`dashboard-client.tsx`), filtro de período por URL.

## O que ficou como evolução futura (manutenção — fora do escopo do roadmap)
- **Anexos genéricos ligados na UI:** a tabela `attachments` + bucket existem e estão prontos (RLS + Storage), mas a Fase 14 entregou a **infraestrutura**; ligar o upload em telas específicas além de tarefas (ex.: comprovante de lançamento) é uma melhoria pontual de manutenção (o precedente de upload está em tarefas, Fase 09).
- **Formato de data global:** a preferência `date_format` é persistida e aplicada nas telas que usam `formatDateWith`; o padrão global do app segue `dd/MM/yyyy` (BR) via `formatDate`. Propagar a preferência a 100% das telas é melhoria futura.
- **Canais externos de notificação** (push/e-mail/web-push): in-app apenas (sino + página). Evolução futura.
- A geração de notificações **só roda de fato** quando `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET` estiverem definidos no ambiente (Vercel) — ver Status do Supabase. Localmente dá para chamar `/api/cron/notifications` com o header `Authorization: Bearer $CRON_SECRET`.

## Verificação (Fase 14)
- **3 migrations** aplicadas (idempotentes) no projeto `yjvnlbjvippefvzgrxxw` (`settings_profile`, `attachments`, `attachments_storage`); **0 lints de schema** no `get_advisors` (resta só o aviso externo de Auth). `src/types/supabase.ts` regenerado (inclui `attachments` + colunas novas de `settings`).
- **RLS confirmada em TODAS as 34 tabelas** (`list_tables`: `rls_enabled: true` em todas). `service_role` só em `service.ts` + Cron (grep), **nunca** no client.
- `npm run test:run` ✅ (**342 testes**: 334 anteriores + **8 da Fase 14** — `reports/tasks` (4: contagens, taxa, produtividade semanal, vazio) e `reports/csv` (4: separador `;`, escaping, ordem de colunas, sem linhas)).
- `npm run lint` ✅ (0/0; React Compiler ok). `tsc --noEmit` ✅. `npm run build` ✅ (novas rotas `/relatorios` e `/api/export` geradas; `/configuracoes` agora completa; demais rotas intactas).
- Smoke test (build de produção): `/login` 200; `/relatorios`, `/configuracoes` e `/api/export` → 307 `/login?next=…` (proxy protege); `/api/cron/notifications` → 401 sem segredo.
- **Falta a verificação visual logada** (dark/light + mobile) de ponta a ponta — **já há usuário em `auth.users`**: dá para logar, editar perfil, alternar tema/sistema, salvar prefs de notificação, abrir os relatórios (5 abas), exportar CSV/JSON e baixar o backup. A confiança vem dos **342 testes** + build/lint/tsc + smoke test + auditoria de RLS.

## Status do Supabase (atualizado 2026-06-26)
- ✅ **`.env.local` configurado** (projeto `yjvnlbjvippefvzgrxxw`). Proteção de rotas (`proxy.ts`) ativa — `/dashboard`, `/dashboard/financeiro`, `/tarefas`, `/rotinas`, `/habitos`, `/estudos`, `/estudos/[id]`, `/agenda`, **`/busca`**, **`/notificacoes`** e `/api/google/*` exigem sessão (smoke test: 307 → `/login`; `/login` 200). **`/api/cron/*` é público para o proxy** (não redireciona), protegido por `CRON_SECRET` na própria rota (sem segredo → 401).
- ✅ **34 tabelas** (16 das Fases 02–08 + Fase 09 `projects`, `tasks`, `task_checklist_items`, `task_attachments`, `routines`, `routine_items`, `routine_logs` + Fase 10 `habits`, `habit_logs` + Fase 11 `study_courses`, `study_modules`, `study_lessons`, `study_sessions`, `study_vocabulary`, `study_language_practice` + Fase 12 `settings` + Fase 13 `notifications` + Fase 14 **`attachments`** — anexos genéricos `{user_id}/…`) **todas com RLS + FORCE RLS**, mais **2 buckets privados** de Storage (`task-attachments` da Fase 09 + `attachments` da Fase 14, ambos com policy de `storage.objects` por pasta `{user_id}/…`). A `settings` ganhou na Fase 14 as colunas de perfil/tema/moeda/data/notificações (idempotente). **Supabase security advisor: 0 lints de schema** (resta apenas o aviso pré-existente de Auth "leaked password protection", configuração externa).
- ⚠️ **`SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET` ainda não definidos** — necessários **só** para o **Vercel Cron** gerar notificações (a rota roda sem sessão e usa a service role, sempre filtrando `user_id`). Sem eles a rota degrada (401 sem `CRON_SECRET`; no-op 200 sem service role). Busca, sino e lançamento rápido funcionam normalmente (usam a sessão do usuário).
- ⚠️ **`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` ainda não definidos** — a agenda local funciona normalmente; o botão "Conectar Google Agenda" só ativa quando as duas chaves existirem (análogo ao tratamento de auth da Fase 01).
- ⚠️ **`SUPABASE_SERVICE_ROLE_KEY` vazio** — não necessário para o app em si (tudo via `authenticated` + RLS), **apenas** para o Vercel Cron de notificações (Fase 13), que roda sem sessão. Ver o item acima.
- ✅ **Já existe 1 usuário cadastrado** em `auth.users` (criado em 2026-06-26) — login por e-mail/senha funciona. Agora é possível **logar e exercitar RLS / verificação visual logada / check-in / anexos** de ponta a ponta.
- ⚠️ **Provider Google (Supabase Auth) desativado** (login por e-mail/senha; o OAuth do Google Agenda é à parte e ainda depende de `GOOGLE_CLIENT_ID/SECRET`).

## Decisões técnicas tomadas na Fase 13
- **Idempotência por `dedupe_key` sem `ON CONFLICT`:** o Cron **lê as chaves existentes** entre os candidatos e **insere só as que faltam** (`selectNewCandidates`) — robusto, testável sem banco, e o **índice único parcial** `(user_id, dedupe_key) where dedupe_key is not null` é a rede de segurança. Chaves determinísticas por origem: persistentes (`invoice_overdue:<id>`, `task_overdue:<id>`) ou por ciclo/dia (`task_today:<id>:<dia>`, `card_limit:<id>:<mês>`, `bill_due:<id>:<venc>`) — evita spam e ainda re-alerta no próximo período.
- **Lógica de geração 100% PURA + injeção de data** (`generate.ts`, `nowMs`/`todayIso` injetados, sem `Date.now()`) — espelha o rigor das fases anteriores; o Cron (`cron.ts`) só faz I/O e mapeamento. **Reusa** `statusEfetivo`/`isOverdue`/`isDueToday`/`courseOverdueReason`/`resumoMes` — nenhuma regra nova.
- **Cron com service-role, filtrando `user_id` explicitamente:** a rota não tem sessão; a service role **ignora RLS**, então toda leitura/escrita carrega `user_id`. Protegida por `CRON_SECRET` (Bearer). Sem service role → no-op 200 (degrada como a integração Google). Fuso pt-BR resolvido via `Intl` `America/Sao_Paulo` (correto independe do TZ do servidor Vercel/UTC).
- **Lançamento rápido = atalho, não regra nova:** cada mini-form chama a **Server Action original** (fatura correta F03, parcelas F04, pessoal×terceiro F05, status na leitura F09…). Zero reimplementação; o servidor revalida com Zod e devolve erro via toast.
- **Busca server-side com `ilike` em paralelo, respeitando RLS:** cada `select` roda sob a sessão do usuário (nunca varre outro). Termo sanitizado (remove `%_\,()*:` que quebram o filtro PostgREST). Faturas filtradas por nome do cartão/competência em memória (poucos registros). Shape unificado `{type,id,title,subtitle,link}` agrupado por tipo.
- **Command palette sem dependência nova:** popover/command construídos sobre o pacote unificado `radix-ui` (Popover) + `Dialog` já presentes — **nenhuma lib nova** (sem `cmdk`), alinhado à filosofia enxuta do projeto (HTML5 DnD, `fetch` direto). Atalho **Ctrl/Cmd+K** global + navegação por teclado.
- **`vercel.json` (não `vercel.ts`)** para os `crons`, como pede o arquivo da fase — 2 disparos/dia (compatível com limites do plano; ajustável).

## Decisões técnicas tomadas na Fase 12
- **`/dashboard` virou o Dashboard GERAL; o financeiro (Fase 07) foi PRESERVADO em `/dashboard/financeiro`.** A fase pede o geral como porta de entrada em `/dashboard` e que ele **agregue, não substitua** o financeiro. Mover (em vez de apagar) mantém todos os gráficos/regras da Fase 07 intactos, com novo item de nav "Painel financeiro" e link a partir do card "Financeiro". Os redirects pós-login (`/dashboard`) continuam válidos.
- **Card de notificações sem nova tabela de domínio:** a única persistência nova é `settings` (preferências). O card degrada com elegância (`available:false`) até a Fase 13 criar `notifications` — **não quebra build/tela**.
- **`settings` = uma linha por usuário (`unique(user_id)`), `dashboard_layout jsonb`.** Leitura reconciliada por `normalizeLayout` (absorve cards novos de fases futuras, descarta lixo) e gravação validada por Zod no servidor — read-your-writes sem flash. Store **reutilizável pela Fase 14**.
- **Período como fonte única da janela; visão é um atalho.** `resolveWindow` produz `{from,to,mes,view}`; o toggle dia/semana/mês apenas seleciona o preset correspondente. Cards financeiros são **mensais por natureza** (usam `window.mes` e reusam as agregações da Fase 07, sem reescrever regra); os cards de tempo (agenda/tarefas/estudos/hábitos) respeitam a janela `[from,to]`. Estado de período/visão na **URL** (`?periodo=&visao=&de=&ate=`), default vindo de `settings`.
- **Per-card Suspense (stream por card) + grid client para arranjo.** A página (server) cria o nó de cada card sob `<Suspense>` e os passa a um client que apenas **ordena/oculta** (não rebusca dados). Reordenar usa **drag-and-drop HTML5 nativo + ↑/↓** (sem dependência nova, igual ao kanban da Fase 09; funciona no mobile/teclado). Personalização persistida em `settings` via Server Action + toast.
- **Padrão Server Component + Server Action + `revalidatePath`/`router.refresh`** (igual às Fases 02–11), em vez dos hooks TanStack Query / Zustand mencionados no arquivo da fase — mantém a consistência com todo o app. Decisão deliberada e documentada.
- **Reuso, não reescrita:** o dashboard geral consome `src/lib/finance/dashboard.ts` (Fase 07), `getHabitsDashboard` (Fase 10), `effectiveTaskStatus`/`getRoutinesWithToday` (Fase 09), `getCalendarEvents`/`getUpcomingCalendarEvents` (Fase 08) e `minutesInRange`/`studyStreak`/`courseOverdueReason` (Fase 11). Nenhuma regra de negócio nova.

## Decisões técnicas tomadas na Fase 11
- **Fonte única para `progress`/`studied_minutes` (sem dupla contagem):** `progress` (0–100) vem **só** da razão de aulas concluídas (`study_lessons.is_done`); `studied_minutes` vem **só** da soma de `study_sessions.duration_minutes` — **nunca** das durações das aulas. Os dois são **recalculados e persistidos** por `recomputeCourseStats(courseId)` após qualquer mudança de aula/sessão, então as colunas são reais (úteis ao Dashboard Geral) e a leitura não precisa re-somar. Lógica centralizada e testada em `src/lib/studies/progress.ts`.
- **`course_id` desnormalizado em `study_lessons`/`study_sessions`** preenchido **no servidor** (lido do módulo/curso sob RLS), nunca do client — consultas por curso sem JOIN e consistência garantida.
- **Streak de estudos "hoje ainda conta":** `studyStreak` conta dias consecutivos com ≥1 sessão e **não quebra** se hoje ainda não houve sessão (dia em andamento) — mesma regra do streak de hábitos (Fase 10). Datas locais pt-BR (`'yyyy-MM-dd'`), sem drift de UTC.
- **Meta semanal de idioma como coluna** (`study_courses.weekly_goal_minutes`) em vez de tabela própria — é 1:1 com o curso de idioma; o realizado da semana é derivado de `study_language_practice` na leitura.
- **Estudos atrasados derivados na leitura:** `courseOverdueReason` marca curso **em andamento** como `target` (passou da `target_date`) ou `inactive` (sem sessão há >7 dias) — espelha "status na leitura" das fases anteriores; nada é gravado.
- **Modelo genérico de curso + detalhe em rota própria:** `/estudos` (painel/cursos/sessões/idiomas via `?view=`) e **`/estudos/[id]`** para a árvore módulos→aulas (CRUD + reordenar ↑↓ sem DnD, igual a rotinas/hábitos) — mantém cada client enxuto. **Uma leitura agregada** (`getStudyDashboard`) alimenta toda a página, como `getHabitsDashboard` na Fase 10.
- **Padrão Server Component + Server Action + `revalidatePath`/`router.refresh`** (igual às Fases 02–10), em vez dos hooks TanStack Query mencionados no arquivo da fase — mantém consistência com todo o app. Decisão deliberada e documentada.
- **Vínculo opcional com tarefa (Fase 09):** `study_sessions.task_id → tasks(id) on delete set null`; o seletor de tarefa só lista tarefas abertas (`pendente|em_andamento`) e nunca é obrigatório.
- **Forms com `useWatch`/`Controller`** (React Compiler) e **estado reiniciado em render** (editores inline "Livro atual"/meta semanal) — respeita `react-hooks/set-state-in-effect`.

## Verificação (Fase 13)
- **1 migration** aplicada (idempotente) no projeto `yjvnlbjvippefvzgrxxw` (`notifications`); **0 lints de schema** no security advisor; `src/types/supabase.ts` regenerado (inclui `notifications`).
- `npm run test:run` ✅ (**334 testes**: 306 anteriores + **28 da Fase 13** — cada uma das 10 famílias de regra disparando quando deve, casos negativos (paga/concluída/futuro distante/dentro da média), prioridades, e **idempotência** por `dedupe_key` (rodar 2× não traz nada novo) + dedupe dentro do lote).
- `npm run lint` ✅ (0 erros/0 warnings; React Compiler ok). `tsc --noEmit` ✅. `npm run build` ✅ (novas rotas `/busca`, `/notificacoes` e `/api/cron/notifications` geradas; demais rotas intactas).
- Smoke test (build de produção): `/login` 200; `/notificacoes` e `/busca` → 307 `/login?next=…` (proxy protege); **`/api/cron/notifications` → 401 `{"error":"Unauthorized"}`** sem `CRON_SECRET`/Bearer (NÃO redireciona — confirma rota pública ao proxy + protegida pelo segredo).
- **Falta a verificação visual logada** (dark/light + mobile) de ponta a ponta — **já há usuário em `auth.users`**, então o próximo agente pode logar, abrir a busca (Ctrl+K), lançar despesa/tarefa/evento/etc. pelo modal, e (após popular `notifications` ou definir `CRON_SECRET`+service role e chamar a rota) ver o sino/página. A confiança vem dos **28 testes** + build/lint/tsc + smoke test.

## Verificação (Fase 12)
- **1 migration** aplicada (idempotente) no projeto `yjvnlbjvippefvzgrxxw` (`settings`); **0 lints de schema** no security advisor; `src/types/supabase.ts` regenerado (inclui `settings`).
- `npm run test:run` ✅ (**306 testes**: 288 anteriores + **18 da Fase 12** — `resolveWindow` por período/visão incl. semana segunda→domingo, virada de mês/ano, custom trocado/ inválido; `windowLabel`/`asPeriod`/`asView`/`isIsoDate`; `normalizeLayout` (anexa cards novos, descarta lixo, não lança) e `visibleCards`).
- `npm run lint` ✅ (0 erros/0 warnings; React Compiler ok). `tsc --noEmit` ✅. `npm run build` ✅ (`/dashboard` e `/dashboard/financeiro` dinâmicas; demais rotas intactas).
- Smoke test (build de produção): `/login` 200; `/dashboard`, `/dashboard/financeiro`, `/dashboard?periodo=semana&visao=semana` e `/dashboard?periodo=custom&de=…&ate=…` → 307 `/login` (proxy protege; params preservados). Servidor de produção sobe limpo.
- **Falta a verificação visual logada** (dark/light + mobile) de ponta a ponta — **já há usuário em `auth.users`**, então o próximo agente pode logar, alternar período/visão, reordenar/ocultar cards, salvar/restaurar layout e fazer check-in de hábito direto do dashboard. A confiança vem dos **18 testes** + build/lint/tsc + smoke test.

## Verificação (Fase 11)
- **6 migrations** aplicadas (idempotentes) no projeto `yjvnlbjvippefvzgrxxw`; **0 lints de schema** no security advisor; `src/types/supabase.ts` regenerado (inclui as 6 tabelas novas).
- `npm run test:run` ✅ (**279 testes**: 248 anteriores + **31 da Fase 11** — `courseProgress`/`nextLesson`/`minutesInRange`/`courseOverdueReason` (23) e `studyStreak`/`bestStudyStreak` (8), incl. curso sem aulas, todas concluídas, horas semana/mês, "hoje ainda conta", virada de mês).
- `npm run lint` ✅ (0 erros/0 warnings; React Compiler ok — forms usam `useWatch`/`Controller`).
- `tsc --noEmit` ✅; `npm run build` ✅ (`/estudos` e `/estudos/[id]` dinâmicas; demais rotas intactas). Smoke test: `/estudos`, `/estudos?view=cursos` e `/estudos/[id]` → 307 `/login`; `/login` 200.
- **Falta a verificação visual logada** (dark/light + mobile) de ponta a ponta — **já há usuário em `auth.users`**, então o próximo agente pode logar, criar curso/módulos/aulas, registrar sessões, marcar aulas e exercitar idiomas (vocabulário/prática). A confiança vem dos **31 testes** + build/lint/tsc + smoke test.

## Decisões técnicas tomadas na Fase 10
- **Modelo genérico (sem tabelas por categoria):** água/leitura/exercícios são casos de `habits` (`target_value` + `unit`); as telas especializadas são **views** filtrando por `category`. Uma coluna `description` genérica vira "Livro atual" (leitura) e "Tipo de exercício" (exercícios) — **uma** tabela, não três.
- **Check-in idempotente por dia** (`habit_logs` único por `(user_id, habit_id, log_date)`, **upsert**) — molde do `routine_logs`. `value` guarda quanto foi feito; `is_done` é **derivado da meta** (`reachedTarget`: `value >= target`, ou qualquer valor positivo quando a meta é 0). `incrementHabit` soma ao valor do dia (clamp ≥ 0); `undoHabitCheckIn` remove o registro do dia.
- **Streak com "dia em andamento":** diferente das rotinas, `currentStreak` **não quebra** quando o hábito de **hoje** ainda não foi feito (ainda dá tempo); só dias agendados **passados** sem conclusão quebram. Coberto por testes dedicados. `bestStreak` = recorde na janela carregada.
- **Datas locais pt-BR** (`'yyyy-MM-dd'` puro) em todo o `log_date`/streak/heatmap — evita o bug de "virar o dia" por UTC (mesma regra do financeiro/rotinas).
- **Uma leitura alimenta tudo:** `getHabitsDashboard` carrega `habit_logs` de ~1 ano **uma vez** e deriva cards do dia + agregados (taxa 30d, série semanal, heatmap, ranking) em memória — sem N+1.
- **Padrão Server Component + Server Action + `revalidatePath`/`router.refresh`** (igual às Fases 02–09) em vez dos hooks TanStack Query mencionados no arquivo da fase — mantém consistência com todo o app. Decisão deliberada e documentada.
- **`reminder_at` como `time`** (e não `timestamptz`): hábito é recorrente, então o lembrete é um **horário do dia**; a Fase 13 combina `reminder_at` + "hoje" para o disparo. A base de "esquecidos" é a consulta de **pendentes de hoje** (agendado e não concluído), exibida em destaque.
- **Sem reorder por DnD** (igual rotinas): `position` é definido na criação e usado na ordenação; a UI não arrasta — alinhado à filosofia enxuta e ao precedente da Fase 09.
- **Forms com `useWatch`** (React Compiler ativo) e **estado reiniciado em render** (padrão "ajustar estado ao mudar prop") em vez de `setState` dentro de `useEffect` — respeita a regra `react-hooks/set-state-in-effect`.

## Decisões técnicas tomadas na Fase 09
- **`recurrence` em coluna `jsonb`** (`{freq,interval,weekdays?,until?}`, `null` = sem recorrência) — formato simples e versionável, centralizado e testado em `src/lib/tasks/recurrence.ts`. A materialização da próxima tarefa ancora no `due_date` (ou `start_date`) e desloca ambas as datas pelo mesmo delta.
- **Status `atrasada` derivado na leitura** (não gravado) — espelha "status na leitura" da fatura. O banco aceita `atrasada` no CHECK por compatibilidade, mas as actions só gravam `pendente|em_andamento|concluida|cancelada`.
- **Padrão Server Component + Server Action + `revalidatePath`/`router.refresh`** (igual às Fases 02–08) em vez dos hooks TanStack Query sugeridos no arquivo da fase — mantém **consistência** com todo o app (que nunca adotou TanStack para leitura) e evita introduzir um padrão novo só neste módulo. Decisão deliberada e documentada.
- **Kanban com drag-and-drop HTML5 nativo + menu acessível** ("mover para / concluir / cancelar" no card) em vez de `@dnd-kit` — alinha à filosofia enxuta do projeto (parsers próprios, `fetch` em vez de `googleapis`): **zero dependência nova**, funciona no desktop (arrastar) e no mobile/teclado (menu). `moveTask` grava `status`+`position` numa única mutação.
- **Anexos em Storage privado** (`task-attachments`, pasta `{user_id}/…`): upload pelo **client** (RLS de `storage.objects`), metadados gravados por Server Action que revalida o prefixo do caminho; download via **URL assinada** temporária (10 min). Excluir tarefa/anexo remove o objeto do Storage (best-effort).
- **Vínculo tarefa↔agenda opcional e desacoplado:** a tarefa guarda `calendar_event_id` (e a FK preparada `calendar_events.task_id` foi conectada); nenhum dos lados é obrigatório e excluir um não apaga o outro (`on delete set null`).
- **Rotinas:** `frequency` (`diaria|semanal|dias_especificos`) + `weekdays int[]`; check-in diário com **upsert** por `(user_id,routine_id,log_date)` (único — não duplica). `setRoutineItemDone` marca a rotina inteira como feita quando todos os passos são concluídos. Seed das 5 rotinas sugeridas só age quando não há nenhuma rotina.

## Decisões técnicas tomadas na Fase 08
- **Tokens OAuth = prioridade de segurança:** `google_integrations` com RLS + FORCE RLS; lidos **apenas no servidor** (`getValidAccessToken` renova via `refresh_token`); **nunca** enviados ao client nem logados. O client só recebe `{ connected, email, lastSyncedAt }`.
- **`fetch` direto à Google API** (sem `googleapis`) — mantém o bundle enxuto, alinhado à filosofia "parsers próprios" das fases anteriores.
- **Recorrência expandida na leitura** (módulo puro), espelhando "derivar na leitura" do financeiro. Ocorrências geradas recebem id sintético `<id>__<n>` e a edição/exclusão agem sobre o **mestre**.
- **Sync bidirecional básico, idempotente:** `reconcile` casa por `google_event_id`, detecta mudança por `etag`, e resolve conflito por **última edição** (`updated`/`updated_at` vs `synced_at`). `listEvents` usa `singleEvents=false` (mestres com RRULE) para o round-trip dos nossos próprios eventos não duplicar.
- **Dia inteiro ancorado ao meio-dia UTC** para estabilidade de data em fusos −11h…+11h.
- **App funciona sem o Google:** `isGoogleConfigured` desliga o fluxo OAuth; a agenda local é completa.

## Verificação (Fase 10)
- **3 migrations** aplicadas (idempotentes) no projeto `yjvnlbjvippefvzgrxxw` (`habits`, `habit_logs`, `habits_description`); **0 lints de schema** no security advisor; `src/types/supabase.ts` regenerado (inclui as 2 tabelas novas + coluna `description`).
- `npm run test:run` ✅ (**248 testes**: 221 anteriores + **27 da Fase 10** — 21 de streak/consistência incl. "ainda dá tempo hoje", virada de mês, semanal/dias específicos, recorde; 6 de conversão de água/formatação).
- `npm run lint` ✅ (0 erros/0 warnings; React Compiler ok — `useWatch` nos forms, estado reiniciado em render).
- `tsc --noEmit` ✅; `npm run build` ✅ (`/habitos` dinâmica; demais rotas intactas). Smoke test: `/habitos` e `/habitos?view=consistencia` → 307 `/login`; `/login` 200.
- **Falta a verificação visual logada** (dark/light + mobile) de ponta a ponta — **já há usuário em `auth.users`**, então o próximo agente pode logar, semear hábitos, fazer check-ins e validar streaks/heatmap/gráficos visualmente. A confiança vem dos **27 testes** + build/lint/tsc + smoke test.

## Verificação (Fase 09)
- **9 migrations** aplicadas (idempotentes) no projeto `yjvnlbjvippefvzgrxxw`; **0 lints de schema** no security advisor; `src/types/supabase.ts` regenerado (inclui as 7 tabelas novas).
- `npm run test:run` ✅ (**221 testes**: 186 anteriores + **35 da Fase 09** — recorrência de tarefas/materialização, status efetivo/atrasada/ordenação, agendamento/aderência/streak de rotinas).
- `npm run lint` ✅ (0 erros/0 warnings; React Compiler ok — forms usam `useWatch`).
- `tsc --noEmit` ✅; `npm run build` ✅ (`/tarefas` e `/rotinas` dinâmicas; demais rotas intactas). Smoke test: `/tarefas` e `/rotinas` → 307 `/login?next=…`; `/login` 200; `/agenda` e `/dashboard` intactos.
- **Falta a verificação visual logada** (dark/light + mobile), o fluxo de **anexos** (Storage) e a materialização de recorrência exercitados de ponta a ponta — **já há usuário em `auth.users`**, então o próximo agente pode logar e validar tudo manualmente.

## Verificação (Fase 08)
- **2 migrations** aplicadas (idempotentes); **0 lints de schema** no security advisor; `src/types/supabase.ts` regenerado.
- `npm run test:run` ✅ (**186 testes**: 136 anteriores + **50 da agenda** — grid/sobreposição, recorrência/until, RRULE round-trip, reconcile nos dois sentidos + conflito + idempotência, mapeamento Google, próximos compromissos).
- `npm run lint` ✅ (0 erros/0 warnings; React Compiler ok — forms usam `useWatch`).
- `npm run build` ✅ (`/agenda` dinâmica; rotas `/api/google/connect` e `/api/google/callback` geradas; demais rotas intactas). Smoke test: `/agenda` e `/api/google/connect` redirecionam (307) para `/login`; `/login` 200.
- **Falta a verificação visual logada** (dark/light + mobile) e o fluxo OAuth real — exige criar usuário em `auth.users` e definir `GOOGLE_CLIENT_ID`/`SECRET`.

## Como continuar (modo manutenção)
**O roadmap acabou — não há próxima fase.** Para qualquer melhoria/correção futura, abra
`docs/handoff/NEXT_AGENT_INSTRUCTIONS.md` (seção "Modo manutenção"): leia o briefing/regras,
trate a mudança como uma **tarefa pontual** e mantenha os invariantes do projeto — **RLS
(`using`+`with check`) em toda tabela**, **Zod no servidor** em toda Server Action, **nenhum
`service_role` no client**, **pt-BR/BRL**, **dark/light + responsividade** e **testes passando**
(`npm run lint && npx tsc --noEmit && npm run test:run && npm run build`).
