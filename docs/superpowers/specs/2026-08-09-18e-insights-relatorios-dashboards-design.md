# Design — Fase 18-E: IA · Insights, relatórios e dashboards

> Validado com o dono em **2026-08-09**, antes de qualquer linha de código.
> Quinta das 6 subfases da Fase 18. Depende das 18-A a 18-D concluídas.
> Desenho geral em `2026-08-04-modulo-ia-design.md`; a 18-C em
> `2026-08-07-18c-acoes-aprovacoes-design.md`; a 18-D em
> `2026-08-08-18d-visao-comprovantes-design.md`.

---

## 1. O que muda de natureza nesta subfase

Até aqui a IA **relatou** números que outro alguém calculou. As ferramentas de leitura da 18-B
e da 18-C são cascas finas: `resumoMes` soma, `metrics.ts` agrega, `calc.ts` totaliza, e o
adapter repassa. O item 8-D do prompt-base diz isso por escrito, e diz na forma negativa —
*"médias, comparações entre dois períodos, variações e percentuais de evolução não são
calculados por nenhuma ferramenta e nunca aparecem em `agregados`"*.

A 18-E cria a primeira grandeza **derivada** do projeto: um número que não existe em tela
nenhuma até ela existir. Média de uma janela, comparação de um período com o anterior, variação
percentual. Três coisas mudam junto:

1. **O 8-D vira mentira no instante em que esse módulo existir**, exatamente como a v1 virou
   mentira quando a 18-B passou a ler Treinos. Ele é reescrito, com versão nova de prompt.
2. **O texto que o dono lê passa a ser escrito pelo modelo**, e não por uma função pura. Todo
   teste de vocabulário do projeto (16-F, 17-F) varre saída de função determinística; aqui não
   há função para varrer. A checagem tem de **rodar em produção**, não só na suíte.
3. **A IA passa a aparecer numa tela que ela não controla** — o dashboard geral, que é da
   Fase 12 e é carregado a cada visita.

As três regras que governam a subfase saem daí: o número é medido e vem pronto; o texto não
contém dígito; e o dashboard nunca chama a IA.

---

## 2. As decisões

### 2.1 As três já validadas ao fechar a 18-D (2026-08-09)

| # | Decisão | Consequência |
| --- | --- | --- |
| 1 | **O módulo de agregação temporal É CRIADO**, e o item 8-D é reescrito com versão NOVA de prompt | Média, comparação e variação passam a ser calculadas pelo SISTEMA, num módulo puro e testado. ⛔ Ele vem ANTES de qualquer chamada de IA da subfase |
| 2 | **O job automático NASCE DESLIGADO**, com chave própria e orçamento SEPARADO para jobs | Sem ligar, insight só existe sob demanda. É a primeira vez que o sistema gastaria dinheiro do dono sem ele pedir |
| 3 | **"Conversar com um relatório" fica FORA**, declarado | Mesma razão que tirou o arquivo do chat na 18-D (§2.1 daquele spec). Vai para a 18-F |

### 2.2 As quatro decididas nesta sessão

| # | Decisão | Por quê |
| --- | --- | --- |
| 4 | **Fatia vertical fina, sob demanda primeiro** — quatro blocos, e o que não couber é declarado fora | O documento da fase é maior que a 18-C inteira (6 blocos). Cada bloco entrega algo verificável, e a corrente de honestidade é provada cedo |
| 5 | **`/ia/insights` GERA; o card do dashboard só EXIBE** | *"O dashboard não chama a IA no carregamento"* fica verdadeiro **por construção**, não por uma checagem que alguém pode esquecer — o mesmo raciocínio que separou os três processos da 18-D |
| 6 | **O texto gerado não contém dígito.** Todo número entra por token `{{ind:<id>}}` | Sem parser de português, sem allowlist de exceções, sem formatação para conciliar. A alternativa — o modelo escreve e o servidor confere — exigiria casar `R$ 1.234,56` com `1234.56` e ainda deixaria passar *"quase o dobro"* |
| 7 | **Financeiro + Treinos + Dieta na primeira fatia** | Três FORMAS diferentes de número: dinheiro, grandezas que não se somam entre si (com regra de contagem ao lado), e nutriente que carrega qualidade e cujo dia sem registro é `null`. Contrato desenhado sobre um consumidor só diverge no segundo |
| 8 | **"Transformar em ação" entra, restrito a `todo.criar_tarefa`** | Cumpre o critério de aceite com o menor risco: tarefa é risco 2 e tem inverso. Evento, meta e lançamento a partir de insight ficam declarados fora |

---

## 3. O fluxo — e por que ele tem duas metades separadas

```txt
GERAÇÃO (só em /ia/insights, só por clique do dono, ou pelo job se ele o ligar)
  1. Server Action confere allow_<modulo> do módulo pedido
  2. collectors/ chamam os serviços do módulo          ← resumoMes · metrics.ts · calc.ts
  3. temporal.ts agrega a série                        ← PURO. média · comparação · variação
  4. dedupe_key é calculada sobre os indicadores       ← ANTES de falar com o modelo
     └─ já existe insight não expirado com essa chave? devolve o existente e PARA
  5. ai_begin_insight_run (RPC) reserva orçamento      ← mesmo advisory lock do chat
  6. generateObject — sem laço de ferramentas
  7. validate.ts recusa ou aprova                      ← PURO
  8. ai_insights + ai_insight_sources gravados

LEITURA (dashboard, e a própria lista de /ia/insights)
  9. lê ai_insights vigentes
 10. render.ts resolve {{ind:x}} a partir de ai_insight_sources
```

Passos 1–8 vivem em `src/lib/actions/ai-insights.ts` + `src/lib/ai/server/insight-runner.ts`.
Passos 9–10 não alcançam nenhum dos dois — é o que a §8.2 transforma em teste.

---

## 4. Bloco 1 — a fundação, sem uma chamada de IA

### 4.1 Onde o módulo mora

```
src/lib/ai/insights/
  contracts.ts    Indicador · SerieTemporal · Comparacao · InsightGerado · Evidencia
  temporal.ts     ← O MÓDULO DA DECISÃO 1. Puro. média · comparação · variação
  validate.ts     texto sem dígito · token existe · evidência aponta indicador · vocabulário
  confidence.ts   a confiança é DERIVADA pelo servidor (ver §5.6)
  render.ts       {{ind:x}} → valor formatado
  state.ts        vigente | expirado | dispensado | adiado — derivado, `agora` injetado
  dedupe.ts       a chave canônica
  expiry.ts       expires_at a partir do período — puro, `hoje` injetado
  prompt.ts       schema.ts
  collectors/     ← A PORTA: finance.ts · training.ts · nutrition.ts

src/lib/tone/
  vocabulary.ts   ← os termos proibidos, UMA vez, em módulo NEUTRO (ver §4.4)
```

`"insights"` entra em `CAMADAS_PURAS` (`boundaries.test.ts` linha 92) e
`insights/collectors/` entra na checagem `naPorta` (linha 272) como **terceira porta
declarada**, ao lado de `tools/adapters/` (18-B) e `approval/commands/` (18-C). Pasta nomeada,
não padrão: acrescentar uma quarta continua exigindo editar o teste.

⚠️ **A porta é uma leitura de dado do dono FORA do Tool Registry** — sem guard, sem teto do
descriptor, sem linha em `ai_tool_calls`. Ela só se justifica porque os três controles voltam
por outro caminho, e a implementação tem de amarrar os três:

| O que o Tool Registry dava | O que substitui aqui |
| --- | --- |
| `guard.ts` confere `allow_*` | A Server Action confere `allow_<modulo>` do módulo pedido, **antes** do coletor |
| `maxRecords` do descriptor | Cada coletor declara o próprio teto e pede **TETO + 1**, como `getVolume` já faz |
| `ai_tool_calls` | `ai_insight_sources` — uma linha por indicador, com período, `n` e rota |

⛔ **Por que dentro de `src/lib/ai/` e não em `src/lib/insights/`.** A lista `modulos` do
`boundaries.test.ts` (linha 251) é **escrita à mão**. Uma pasta nova fora de `src/lib/ai/` não
estaria nela, e `src/lib/ai/... → @/lib/insights/...` passaria **verde sem provar nada** — a
fronteira ficaria decorativa. Manter dentro é o que mantém o teste com dentes.

### 4.2 O que `temporal.ts` calcula

Ele recebe **série de indicadores já calculados** e devolve média, comparação e variação. Ele
**não importa `resumoMes`, `metrics.ts` nem `calc.ts`** — quem os chama são os coletores. É a
invariante 31 escrita como grafo de imports: *ele agrega sobre o que eles devolvem; não
recalcula o que eles já calculam.*

As quatro recusas, cada uma herdada de uma invariante que já existe:

| Situação | Devolve | Origem |
| --- | --- | --- |
| Janela incompleta (5 de 7 dias com registro, janela de 7) | `null` + motivo | Dieta 21 — média móvel só com a janela cheia |
| Sem período anterior para comparar | `null` + `"sem base"` | Treinos 21 |
| Base zero (`0 → 40`) | `null` + motivo. **Nunca `Infinity`, nunca `"+∞%"`, nunca `NaN`** | Treinos 14 |
| Algum ponto da série é `parcial` | a comparação sai `parcial`, com o motivo do pior ponto | Dieta 15 / Treinos 12 |

E a regra que fecha o conjunto: **período sem registro não entra na média como zero e também
não é descartado em silêncio** — ele reduz o `n`, e o `n` viaja com o número, do mesmo jeito
que `regra_de_contagem` viaja com o volume desde a 17-D.

Puro, `hoje` injetado, aritmética em `Date.UTC`. Testes com valor escrito à mão e a aritmética
no comentário — não espelhando a implementação.

### 4.3 `seguranca-v3`

O 8-D atual (`security-prompt.ts` linha 57) separa dois casos: a grandeza não se aplica (o
número não existe, não é zero) e *"o sistema não calcula aquilo"*. **O segundo caso muda.**

A v3 reescreve o 8-D para dizer que média e comparação **existem quando o sistema as entrega
prontas, com o `n` e a qualidade ao lado**, e continuam proibidas de serem feitas pelo modelo.
A proibição deixa de ser *"esse número não existe"* e passa a ser **_"esse número não é seu
para calcular"_** — que é a formulação que não vence de novo, porque descreve a REGRA e não o
estado. É o mesmo conserto que a 18-B aplicou a `AVISO_SEM_ACESSO` e `RESUMO_DO_ASSISTENTE`.

⛔ **A v3 NÃO promete comparação ao chat.** `temporal.ts` alimenta o Insight Engine, não os
adapters de ferramenta; nenhum `agregados` de ferramenta passa a ter média nesta subfase.
Prometer no prompt o que o adapter não devolve é literalmente o defeito que o 8-A já teve uma
vez (a primeira redação dizia *"somas, médias, contagens e comparações já vêm prontas"* e os
adapters de Treinos não calculavam nenhuma média). O 8-A da v3 é reconferido junto.

### 4.4 A lista de vocabulário proibido passa a existir uma vez só

Hoje ela está **duplicada e não exportada**: `notifications/nutrition.test.ts:465` e
`notifications/training.test.ts:365`, com conteúdos parecidos e diferentes — a de Dieta tem
`"descontrol"` e `"exagerou"`; a de Treinos tem `"preguiç"`, `"desculpa"`, `"faltou"` e
`"sedentár"`. Uma terceira cópia dentro de `insights/` divergiria das duas no primeiro termo
novo.

A 18-E promove a lista para **`src/lib/tone/vocabulary.ts`** — módulo **neutro**, puro, só
listas de string — como **união das duas mais os termos de prescrição da 17-F**, e os dois
testes existentes passam a importá-la. É a mesma disciplina de `normalizarTexto` ser declarada
uma vez, e é o que o próprio handoff manda fazer quando dois módulos precisam da mesma util:
*"promova a util central, nunca copie"*.

⚠️ **Neutro, e não dentro de `insights/`, por uma razão de direção de dependência:** com a
lista morando no módulo de IA, `src/lib/notifications/` passaria a importar de `src/lib/ai/` —
o módulo geral dependendo do módulo novo, que é a seta ao contrário.

⛔ E a promoção abre um buraco na fronteira que precisa ser fechado **na mesma tarefa**: a lista
`modulos` do `boundaries.test.ts` (linha 251) é escrita à mão, e `@/lib/tone/` não estaria nela
— `src/lib/ai/ → @/lib/tone/vocabulary` passaria verde sem ser examinado. `tone` **entra na
lista `modulos`**, e o import de `insights/validate.ts` entra como **par declarado** em
`PARES_DECLARADOS`, no molde exato de `vision/duplicates.ts → @/lib/import/normalize`. O
critério do par é atendido: o alvo é puro, sem I/O, sem escrita, sem Supabase.

⚠️ **E há uma diferença de natureza que a implementação não pode ignorar:** nas 16-F/17-F o
texto sai de função pura, então um TESTE basta. Aqui o texto vem do modelo em runtime, então a
checagem **roda em produção**, dentro de `validate.ts`. O teste passa a cobrir o validador, não
o texto — e a suíte não é mais a última linha de defesa.

---

## 5. Bloco 2 — contrato de indicador, três tabelas e o Engine

### 5.1 O contrato

```ts
type Indicador = {
  id: string;                    // "financeiro.gasto_mes"
  modulo: "financeiro" | "treinos" | "dieta";
  rotulo: string;                // pt-BR, vindo do módulo
  valor: number | null;          // null = NÃO MEDIDO
  indisponivel_porque?: string;  // obrigatório quando `valor` é null
  unidade: string;
  qualidade: "exato" | "parcial";
  motivo_incompleto?: string;    // obrigatório quando `qualidade` é "parcial"
  periodo: { de: string; ate: string };
  n: number;                     // quantos períodos/registros entraram
  regra_de_contagem?: string;    // Treinos 12 — viaja com o número
  rota: string;                  // deep link interno; passa por `rotaInternaAceita`
};
```

`valor: number | null` **com motivo obrigatório** é a invariante 1 da Dieta aplicada ao nível do
contrato: a ausência não vira zero antes mesmo de chegar ao modelo. Um coerente
(`indicadorCoerente`) recusa `valor: null` sem motivo e `qualidade: "parcial"` sem motivo —
no molde de `isToolDescriptorCoherent`.

Cada coletor entrega os indicadores do seu módulo pelos **mesmos serviços que a tela usa**, com
as **mesmas opções** (a lição do `Required<MetricOptions>` em `adapters/training.ts`).

### 5.2 As três tabelas

⛔ **`ai_insights.explicacao` guarda os TOKENS, não os números resolvidos.** O texto gravado é
literalmente *"Você treinou `{{ind:treinos.sessoes}}` vezes"*, e `render.ts` resolve a partir de
`ai_insight_sources` a cada leitura.

Isso muda a natureza da garantia: **enquanto o texto guardar tokens, é impossível o banco
conter um insight que cite um número fora das fontes.** A regra deixa de depender de o
validador ter rodado e passa a ser propriedade do dado — o mesmo movimento que pôs uso único
num `unique` e prazo num `default` do banco, em vez de num `if`.

| Tabela | Conteúdo |
| --- | --- |
| `ai_insights` | `run_id` (FK composta), `modulo`, `tipo`, `prioridade`, `confianca`, `titulo`, `resumo`, `explicacao` **com tokens**, `periodo_de`/`periodo_ate` (`date`), `dedupe_key`, `expires_at`, `provider`/`model`/`prompt_version` |
| `ai_insight_sources` | uma linha por indicador usado: `indicador_id`, `rotulo`, `valor`, `unidade`, `qualidade`, `motivo_incompleto`, `periodo_*`, `n`, `regra_de_contagem`, `rota` |
| `ai_insight_feedback` | append-only, uma linha por decisão do dono: `util` · `inutil` · `dispensado` · `adiado` (+`adiado_ate`) · `nao_mostrar` |

Restrições obrigatórias, no padrão do projeto: `user_id` NOT NULL, RLS + FORCE RLS, índice em
`user_id`, trigger `updated_at`, **`unique (id, user_id)`** em `ai_insights` (senão a FK
composta dos filhos falha com `42830` — foi o tropeço da 16-E e o da 18-D),
**FK composta `(insight_id, user_id)`** nas duas filhas, `unique (user_id, dedupe_key)` e
`unique (insight_id, indicador_id)`.

**Nenhum estado é gravado em `ai_insights`** — invariante 35 aplicada aqui. `vigente`,
`expirado`, `dispensado` e `adiado` saem de `expires_at` + as linhas de feedback, em
`insights/state.ts` (puro, `agora` injetado), com precedência declarada:
**decisão do dono > prazo**.

⚠️ **Uma exceção declarada à invariante 20.** Guardar o VALOR do indicador em
`ai_insight_sources` é uma segunda cópia de dado pessoal dentro de `ai_*`, e a invariante 20
diz que a auditoria guarda o pedido e nunca o resultado. Aqui a cópia é deliberada e por outro
motivo: é **snapshot**, como `efeito_previsto` na proposta e `nutrients_snapshot` na Dieta. Sem
ela, reler um insight de julho recalcularia os números com os dados de hoje, e o insight
mudaria de conteúdo depois de escrito — a invariante 22 da Dieta já decidiu esse caso.

### 5.3 Dedupe ANTES da chamada, não depois

`dedupe_key = "v1" | modulo | periodo_de | periodo_ate | hash canônico dos indicadores`,
calculada **antes** de falar com o modelo, reusando a disciplina de `approval/canonical.ts`
(prefixo de versão, chaves ordenadas, array na ordem, NFC, `-0` → `0`, `NaN`/`Date`/`BigInt`
recusados).

Existindo insight **não expirado** com essa chave, o modelo **não é chamado** e o existente é
devolvido. Isso satisfaz *"rodar o job três vezes não gera três insights iguais"* por
construção — e não gasta dinheiro para descobrir. Dado mudou ⇒ chave diferente ⇒ insight novo,
legitimamente. O `tipo` **não entra na chave**: ele é escolhido pelo modelo e só existe depois
da chamada.

### 5.4 O run

`ai_runs.kind = 'insight'` — **terceira espécie**, pelo mesmo padrão da segunda: afrouxa na
coluna, **exige a forma inteira no CHECK** (sem `conversation_id`, sem mensagens). RPC
`ai_begin_insight_run`, `SECURITY INVOKER`, `search_path = ''`, com o **mesmo advisory lock**
do chat e da extração — o recurso disputado é o orçamento do dono, não a espécie do run (a
lição da 18-D: com namespace próprio, duas espécies simultâneas passariam as duas).

`generateObject` (18-D): o tipo `AiObjectRequest` **não tem campo `tools`**, então não há laço
e o modelo não pode pedir nada. Os indicadores entram por `security/untrusted.ts` — dado é
dado, nunca instrução.

### 5.5 A validação

`validate.ts`, puro, ordem fixa:

1. Zod `.strict()` sobre o objeto devolvido.
2. Todo `{{ind:x}}` do texto existe na lista de indicadores enviada.
3. **O texto não contém dígito**, depois de removidos os tokens.
4. Toda `evidencias[]` aponta indicador enviado.
5. Vocabulário proibido + vocabulário de prescrição (§4.4).

Falha em qualquer uma: **o insight NÃO é gravado**, o run fecha `failed` com código declarado,
e a tela diz o que aconteceu. Erra para *"não mostrar nada"*, nunca para *"mostrar algo não
conferido"* — a mesma direção de erro do claim-first da 18-C.

⚠️ Os indicadores com `valor: null` vão ao modelo com o motivo, e um token que aponte para eles
renderiza **"não medido"** com o motivo — nunca `—`, nunca `0`. É a regra 57 da 18-D
(`nao_identificado` não é zero e não é `null` ambíguo) aplicada ao insight.

### 5.6 A confiança é DO SERVIDOR, e ele só rebaixa

A invariante 57 da 18-D vale aqui inteira, e sem ela `confianca` seria um campo de
auto-elogio: um modelo que declara a própria confiança declara `alta` quase sempre, e o dono
leria como aval o que é só fluência.

`insights/confidence.ts` (puro) **deriva** a confiança dos indicadores que entraram:

- algum indicador `parcial` ⇒ **rebaixa**;
- algum indicador com `valor: null` citado por token ⇒ **rebaixa**;
- alguma comparação com `n` abaixo da janela pedida ⇒ **rebaixa**;
- comparação sem base anterior ⇒ **rebaixa**.

`rebaixar` devolve o mínimo e **`promover` não existe** — a mesma assimetria de
`vision/confidence.ts`. O modelo não declara confiança: o campo simplesmente **não está no
schema de saída dele**, que é a versão mais forte da regra (irrepresentável, não recusado).

`tipo` e `prioridade` continuam sendo escolha do modelo, e podem ser: nenhum dos dois é
afirmação factual sobre os registros do dono. `prioridade` é enum fechado no schema.

### 5.7 `expires_at`

Calculado por `insights/expiry.ts` (puro, `hoje` injetado) a partir do período do insight, e
enviado pelo servidor. Um insight sobre período **fechado** (o mês passado) expira num horizonte
fixo; um sobre período **em curso** (esta semana) expira quando o período termina, porque a
partir dali os números que ele cita deixaram de ser os do período inteiro. Um CHECK no banco
impede `expires_at` no passado no momento da inserção.

⛔ **Expirar não apaga.** O insight expirado sai da lista de vigentes e do card, e continua
legível com os números que ele tinha — snapshot, §5.2.

---

## 6. Bloco 3 — a tela, o card e a ponte com a 18-C

### 6.1 `/ia/insights`

**7º item** de `AI_SECTIONS` (hoje são 6), inserido **entre Comprovantes e Consumo** — pela
mesma razão que pôs Ações antes de Consumo: o que a IA faz com os dados do dono vem antes de
quanto ela custou.

A tela gera (módulo + período; só aparecem os módulos com a chave `allow_*` ligada) e lista. Cada
card mostra título, resumo, explicação **renderizada**, período, confiança, os indicadores
usados com valor + qualidade + `n` + regra de contagem, as fontes clicáveis, a data da análise
e provedor/modelo/`prompt_version`. Ações: útil · inútil · dispensar · adiar · não mostrar
novamente.

### 6.2 O card do dashboard

`"insights"` entra no **FIM** de `DASH_CARD_IDS` — é isso que faz `normalizeLayout` anexá-lo ao
layout já salvo sem reordenar a preferência do dono, exatamente como `dieta` (16-F) e `treinos`
(17-F) fizeram. Ele **só lê** `ai_insights` vigentes; não tem botão de gerar.

⛔ **E isso vira teste de fronteira, não promessa:** nenhum arquivo de `src/lib/dashboard/` ou
`src/components/dashboard/` pode alcançar `server/insight-runner` nem
`actions/ai-insights`. Varredura de import, no molde dos testes que já existem em
`boundaries.test.ts`.

### 6.3 Transformar em tarefa — a QUARTA forma declarada

`ai_action_proposals.origem` ganha `'insight'`, ao lado de `ferramenta`, `desfazer` e
`documento`, com o CHECK `ai_action_proposals_origem_coerente` exigindo a forma **por inteiro**:

```txt
origem = 'insight'
  and conversation_id is null
  and run_id is null
  and tool_call_id is null
  and undoes_execution_id is null
  and document_extraction_id is null
  and insight_id is not null
```

FK composta `(insight_id, user_id)` → `ai_insights (id, user_id)`. `insight_id` **não entra no
hash** — quem o protege é a FK composta, como `document_extraction_id` na 18-D.

A proposta nasce por `criarPropostaDeInsight`, ao lado de `criarPropostaDeDocumento` e
`criarPropostaDeDesfazer`, e passa pelo **mesmo** `prever`, `hashDe`, prazo de 10 min do banco,
uso único e revalidação. Exige `allow_todo` **E** `allow_write_todo`.

⛔ Restrito a **`todo.criar_tarefa`**. Evento, meta, refeição, treino e lançamento a partir de
insight ficam declarados fora (§9).

---

## 7. Bloco 4 — o job automático

`allow_insight_jobs` nasce `false`, no mesmo padrão de `allow_vision`. **Sem ela, insight só
existe sob demanda.**

**O orçamento de jobs é um segundo teto, e os dois valem:** o job respeita o teto próprio *e*
continua dentro do mensal. Ligar o job não pode estourar o orçamento global sem o dono também
mexer nele.

Rota própria `/api/cron/insights`, protegida por `CRON_SECRET` (Bearer) na própria rota, com
entrada nova em `vercel.json` dentro da cadência que já existe (`0 12` e `0 0` UTC = 09h e 21h
BRT). **Separada de `/api/cron/notifications`** porque um job de insight que falha não pode
derrubar as notificações.

⚠️ **O ponto difícil, declarado:** o Cron **não tem sessão** e usa service role, mas os
coletores leem sob RLS com a sessão do dono. Ou os coletores aceitam `client`/`userId` — que é
exatamente o que a 17-F fez em `getSessionHistory` (invariante 24 daquela subfase: *"a mesma
leitura da tela"*) — ou o job lê por um caminho diferente do da tela, que é a divergência que a
invariante 31 existe para impedir. **Vamos pela primeira.** Toda query que o coletor usar e que
ainda não aceite `client`/`userId` precisa passar a aceitar, sem mudar o comportamento do
caminho com sessão.

Job que falha registra erro **sanitizado** (`security/redact.ts`, único caminho de saída de
erro do módulo) e **não repete escrita**.

---

## 8. Segurança e fronteiras

### 8.1 O que a 18-E NÃO afrouxa

A escrita continua não acontecendo dentro do run · `approval/` continua tocando só `ai_*` ·
`tools/` continua alcançando só `commands/previews` · `.executar(` continua aparecendo em um
arquivo · `vision/` continua em `CAMADAS_PURAS` · `user_id` sempre de `authContext()` · Zod
`.strict()` nos dois lados · nenhuma ferramenta nova, nenhum command novo.

### 8.2 As fronteiras novas, provadas por teste

| Garantia | Como é provada |
| --- | --- |
| `insights/` é camada pura | `"insights"` em `CAMADAS_PURAS` |
| Serviço de módulo entra por **três** portas nomeadas | `insights/collectors/` em `naPorta`; nenhuma quarta |
| O dashboard não chama a IA | Nenhum arquivo de `src/lib/dashboard/` ou `src/components/dashboard/` alcança `server/insight-runner` nem `actions/ai-insights` |
| O texto gravado não cita número fora das fontes | Propriedade do dado (§5.2) + teste de que, removidos os tokens `{{ind:…}}`, o texto restante não casa `/\d/` |
| O vocabulário proibido é declarado uma vez | Varredura por segunda declaração da lista, no molde do teste de `normalizarTexto` |
| `insights/` não monta consulta a tabela de módulo | **Nenhum `.from()` nem `select()` em `insights/`**, no molde do teste que já vale para `tools/`. Os coletores chamam as *queries* do módulo; quem fala com o banco continua sendo o módulo |
| A confiança não vem do modelo | O campo **não existe** no schema de saída, e `promover` não é declarada em `confidence.ts` |

**Toda mutação de teste é conferida por md5 antes de se acreditar num verde** — o working tree é
CRLF e substituição multi-linha falha em silêncio (aconteceu duas vezes na 18-B).

### 8.3 Injeção pelo dado

Os indicadores levam `rotulo` vindo do módulo, que pode conter texto do dono (nome de
categoria, de exercício, de alimento). Eles entram por `security/untrusted.ts`, como resultado
de ferramenta, **nunca como mensagem de sistema**. E a defesa real é o schema: a saída é Zod
`.strict()`, e não existe campo que signifique "execute" — a mesma decisão da 18-D.

---

## 9. O que fica de fora, declarado

Declarar importa: foi o que a 18-D fez com o arquivo no chat, e é o que impede uma omissão de
parecer esquecimento.

| Item | Por quê | Para onde vai |
| --- | --- | --- |
| **Conversar com um relatório** | Decisão 3. Exige o conteúdo no histórico, repetido a cada turno, com custo e exposição multiplicados | 18-F, junto com "conversar sobre documento" |
| **Resumo do Dia** | Toca os nove módulos de uma vez; é o item mais caro em leitura e exige a fundação completa | Subfase seguinte |
| **Revisão Semanal** | Mesma razão | Subfase seguinte |
| **Análises cruzadas** | Dependem do módulo temporal, que só nasce agora; e exigem `allow_cross_module`, hoje sem consumidor | Subfase seguinte |
| **Os outros seis módulos** (TO-DO, Agenda, Hábitos, Estudos, Tarefas, `body_*`) | A fatia é fina de propósito; o contrato nasce sobre três formas de número e cada módulo novo é um coletor | Subfase seguinte |
| **Transformar insight em evento, meta, refeição, treino ou lançamento** | Três payloads vindos do modelo em vez de um, e o lançamento é risco 3 com sensibilidade `dinheiro` | Subfase seguinte |
| **Comparação e média no CHAT** | `temporal.ts` alimenta o Engine, não os adapters. Prometer no prompt o que a ferramenta não devolve é o defeito que o 8-A já teve | Quando os adapters ganharem série |
| **Notificação de insight no sino** | 18-F, junto com o resto das integrações | 18-F |
| **Retenção e pesquisa externa** | Já eram 18-F | 18-F |

---

## 10. Ordem de execução — quatro blocos

| Bloco | Entrega | Chama a IA? |
| --- | --- | --- |
| **1** | `insights/contracts.ts` · `temporal.ts` · `tone/vocabulary.ts` (+ os dois testes existentes passando a importá-la, + `tone` na lista `modulos` e o par declarado) · `seguranca-v3` · as fronteiras novas em `boundaries.test.ts` | **Não** |
| **2** | Migrations das 3 tabelas + `ai_runs.kind = 'insight'` + RPC · `collectors/` dos três módulos · `dedupe.ts` · `expiry.ts` · `confidence.ts` · `prompt.ts` · `schema.ts` · `validate.ts` · `render.ts` · `state.ts` · `server/insight-runner.ts` · `actions/ai-insights.ts` | Sim, sob demanda |
| **3** | `/ia/insights` + `AI_SECTIONS` · card no fim de `DASH_CARD_IDS` · feedback/dispensar/adiar · `origem = 'insight'` + `criarPropostaDeInsight` restrito a `todo.criar_tarefa` | Não acrescenta chamada |
| **4** | `allow_insight_jobs` + orçamento de jobs · `/api/cron/insights` + `vercel.json` · coletores aceitando `client`/`userId` | Sim, se o dono ligar |

O Bloco 1 vem antes de qualquer chamada de IA da subfase — decisão 1, e ela é sobre ordem, não
sobre conteúdo.

---

## 11. Riscos

| Risco | Mitigação |
| --- | --- |
| Custo recorrente alto | Job desligado de fábrica; orçamento próprio **e** o mensal; dedupe antes da chamada evita gastar para descobrir que o insight já existe |
| Insight genérico | A entrada é indicador calculado com `n` e qualidade, nunca texto solto; o feedback do dono fica gravado |
| IA chamada a cada carregamento | Geração e leitura em arquivos que o dashboard não alcança, com teste de import |
| Número inventado | Texto sem dígito + token + o banco guardando tokens (§5.2) |
| Linguagem de cobrança | `vocabulary.ts` roda **em produção**, não só na suíte (§4.4) |
| Afirmação sem suporte | `evidencias[]` obrigatória, apontando indicador enviado; falha ⇒ insight não gravado |
| `42830` na FK composta | `unique (id, user_id)` em `ai_insights` **na mesma migration** — o tropeço da 16-E e o da 18-D |
| O Cron sem sessão divergir da tela | Coletores aceitam `client`/`userId`, como `getSessionHistory` na 17-F |

---

## 12. Critérios de aceite

1. `temporal.ts` devolve `null` com motivo nos quatro casos da §4.2 — **nunca** `0`, `NaN` ou `Infinity`.
2. O 8-D é reescrito e a versão do prompt muda para `seguranca-v3`.
3. A lista de vocabulário proibido é declarada **uma vez**, em `src/lib/tone/`, e os dois testes existentes a importam; `tone` está na lista `modulos` do teste de fronteira, com o par declarado.
3-A. `confianca` **não existe** no schema de saída do modelo, e `confidence.ts` não declara `promover`.
3-B. `expires_at` sai de `expiry.ts` e é enviado pelo servidor; insight expirado **sai da lista e continua legível**, com os números que tinha.
4. Gerar duas vezes com os mesmos dados **não** chama o modelo na segunda e **não** cria segundo insight.
5. O texto gravado em `ai_insights.explicacao` não contém dígito fora de token.
6. Todo token renderizado resolve por uma linha de `ai_insight_sources`; indicador `null` renderiza "não medido" com o motivo.
7. Insight que falha a validação **não é gravado**, e o run fecha `failed` com código declarado.
8. Nenhum arquivo de `src/lib/dashboard/` ou `src/components/dashboard/` alcança o runner ou a action — por teste de import.
9. Fontes abrem os registros reais (rotas passam por `rotaInternaAceita`).
10. Feedback, dispensar e adiar gravam; o estado é **derivado**, com decisão do dono vencendo o prazo.
11. Transformar em tarefa passa pelo Approval Engine, com `origem = 'insight'`, hash, prazo, uso único e revalidação.
12. `allow_insight_jobs` nasce `false`; com ela desligada nenhum job roda.
13. Job com orçamento (próprio ou mensal) esgotado **não roda**, e registra o motivo sanitizado.
14. O vocabulário proibido e o de prescrição são recusados **em runtime**.
15. Transversais: `lint` · `tsc --noEmit` · `test:run` · `build` · suíte verde em `TZ=UTC` · rota privada → 307 `/login` · `/api/cron/*` → 401 sem o secret · `get_advisors` sem lint novo sobre tabela desta subfase · `src/types/supabase.ts` regenerado.

---

## 13. Números a reconferir antes de citar (medidos em 2026-08-09)

| Medida | Valor |
| --- | --- |
| Tabelas no `public` | 126, das quais **14 `ai_*`** |
| Testes / arquivos | 3.219 / 159 |
| Ferramentas no registry | 29 (22 leitura + 7 escrita) |
| Commands | 13 |
| Agentes | 9 |
| Itens em `AI_SECTIONS` | 6 |
| Formas de `ai_action_proposals.origem` | 3 (`ferramenta`, `desfazer`, `documento`) |

A 18-E acrescenta **3 tabelas** (`ai_insights`, `ai_insight_sources`, `ai_insight_feedback`),
**1 forma de `origem`**, **1 espécie de `ai_runs.kind`**, **1 item em `AI_SECTIONS`**, **1 card
em `DASH_CARD_IDS`** e **nenhuma ferramenta nem command**. Conte antes de citar.
