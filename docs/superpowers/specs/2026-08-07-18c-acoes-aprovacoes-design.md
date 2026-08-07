# Design — Fase 18-C: IA · Ações, aprovações, idempotência e auditoria

> Validado com o dono do sistema em **2026-08-07**, antes de qualquer linha de código.
> Complementa (não substitui) `docs/superpowers/specs/2026-08-04-modulo-ia-design.md` e
> `docs/phases/PHASE_18_C_AI_ACTIONS_APPROVALS_AUDIT.md`.
> **Onde este documento diverge dos dois anteriores, ele diz explicitamente que diverge e por quê.**

## 1. O que muda de natureza nesta subfase

Até a 18-B, o pior caso de um defeito era **a IA dizer um número errado**. A partir da 18-C é
**a IA alterar um registro do usuário**. Toda decisão abaixo foi tomada com esse peso, e a regra
que organiza a subfase inteira é:

```txt
A IA PROPÕE  ·  O USUÁRIO CONFIRMA  ·  O BACKEND EXECUTA E REGISTRA
Nunca as três coisas na mesma etapa. Nunca duas delas no mesmo processo.
```

## 2. A entrega de abertura NÃO é a escrita

A primeira metade da 18-C é a **matriz de ferramentas de LEITURA dos 7 módulos restantes**
(Financeiro, Dieta, TO-DO, Agenda, Tarefas & Rotinas, Hábitos, Estudos), replicando o molde que a
18-B deixou pronto. A escrita só começa depois, com autorização explícita do dono — e este
documento existe para que essa autorização seja informada.

## 3. As decisões

### 3.1 Escala de risco — o código vence, o documento é corrigido

`PHASE_18_C` descreve **níveis 0–4**. O código da 18-A fixou `NIVEIS_DE_RISCO = [1,2,3,4,5]`
(`tools/contracts.ts`), e as três leituras de Treinos usam `risk: 1`. **O mapeamento de fato é
`código = documento + 1`.**

| Doc da fase | Código | O quê | Confirmação |
| --- | --- | --- | --- |
| 0 | **1** | Leitura, consulta, análise | Nenhuma |
| 1 | **2** | Criação reversível de baixo impacto (tarefa, anotação, check-in) | Sim (simplificada na tela) |
| 2 | **3** | Alteração relevante (transação, valor, evento, refeição consumida, treino passado) | Sim, com pré-visualização |
| 3 | **4** | Destrutiva ou externa (exclusão, massa, série recorrente, evento sincronizado) | Reforçada |
| 4 | **5** | Não permitida | **Ausência de código** — não existe descriptor |

Renumerar o enum reabriria 18-A e 18-B por estética, e o `risk: 1` das três leituras vivas está
correto na escala do código. **A escala do código é a única citada em código, teste e matriz;**
a tabela acima é a única tradução autorizada, e `PHASE_18_C_AI_ACTIONS_APPROVALS_AUDIT.md` é
corrigido no mesmo commit da matriz.

**A trava de coerência sobe.** `isToolDescriptorCoherent` hoje exige, para escrita,
`requiresConfirmation && risk >= 2` — que traduzido só diz "escrita não é leitura". Passa a exigir
também: **ferramenta que toque dinheiro, dado de saúde ou histórico consolidado tem `risk >= 3`**,
declarado por um campo do descriptor (não deduzido do nome do módulo, que é adivinhação).

### 3.2 Modos de confirmação — declarados, mas nenhuma auto-execução na 18-C

`PHASE_18_C` prevê os modos **Seguro / Equilibrado / Rápido**, com os dois últimos executando
automaticamente ações de baixo risco. **A 18-C não implementa auto-execução.**

`ai_user_preferences.confirmation_mode` continua sendo lido e gravado (a coluna já existe), e o
modo escolhe **o quanto a tela pergunta** — não *se* ela pergunta. Toda escrita confirma, em
qualquer modo, em qualquer nível.

> ⛔ **Isto é invariante, não um degrau temporário.** Uma subfase futura que quiser ligar
> auto-execução precisa de decisão explícita do dono registrada aqui — não pode se apoiar em
> "já estava previsto no documento da fase".

### 3.3 A escrita NÃO acontece dentro do run — a decisão mais importante do documento

O documento da fase não diz o que o Tool Executor devolve ao modelo quando a ferramenta é de
escrita. Fica decidido:

```txt
DENTRO DO RUN (streaming, Route Handler /api/ia/chat)
  ferramenta de escrita  →  valida  →  resolve entidades  →  calcula a PREVISÃO do efeito
                         →  grava ai_action_proposals  →  devolve ao modelo:
                            "proposta {id} criada, aguardando confirmação do usuário"
                            NADA foi escrito em nenhum módulo do usuário.

FORA DO RUN (Server Action comum, exatamente como um formulário)
  usuário confirma na tela  →  confirmarAcaoDaIa(proposalId, hash)
                            →  Approval Engine (vínculo, prazo, uso único, revalidação)
                            →  Action Executor  →  COMMAND compartilhado  →  serviço de domínio
                            →  ai_action_executions  →  revalidatePath (na casca)
```

**Por que esta e não a alternativa.** Um critério de aceite da própria fase é *"cancelar o
streaming não desfaz ação confirmada"*. Com a execução fora do run, isso é **verdadeiro por
construção** — não é uma checagem que alguém pode esquecer de escrever. De quebra, `revalidatePath`
volta para a casca da Server Action, que é onde o desenho geral manda que ele fique, em vez de
rodar dentro de um Route Handler.

**Trava física, provada por teste de fronteira** (mesmo espírito de `boundaries.test.ts`):

```txt
tools/           NÃO importa approval/execute.ts    ← o laço não alcança o executor de ações
approval/        NÃO é importado por api/ia/chat/route.ts para EXECUTAR
                 (a rota só alcança a criação de proposta, pelo Tool Executor)
```

O guard muda de `kind !== "leitura" → TOOL_WRITE_DISABLED` para: **escrita é admitida no laço
apenas em modo proposta**. `TOOL_WRITE_DISABLED` continua existindo — passa a ser o que responde
quando o dono não ligou a escrita daquele módulo.

### 3.4 O hash cobre o EFEITO, não os argumentos

"Hash da proposta" sobre os argumentos do modelo não protege do que precisa proteger: a proposta é
imutável, **quem muda é o mundo**. Entre propor e confirmar, o dia pode virar (a transação cai em
outra fatura), a tarefa recorrente pode ter avançado, o saldo pode ter mudado.

```txt
hash = sha256( serialização canônica de {
         tool, tool_version, payload normalizado,
         ids das entidades RESOLVIDAS,
         a previsão do efeito exibida na tela
       } )
```

- A serialização é **canônica e determinística** (chaves ordenadas, sem espaço, números
  normalizados) — função pura, testada, com vetores escritos à mão.
- O Action Executor **recalcula a previsão no momento da execução** e compara com o hash gravado.
  Divergiu → recusa com motivo em pt-BR e oferece propor de novo. É a única leitura possível de
  *"proposta alterada invalida a confirmação anterior"* que de fato funciona.

**Vínculo da confirmação:** usuário · conversa · run · tool call · hash · `expires_at` **curto
(10 min)** · uso único garantido por índice no banco, nunca por checagem em código.

### 3.5 Idempotência — a chave é a aprovação, e ela não vem do modelo

`PHASE_18_C` manda a ferramenta aceitar `client_mutation_id`, "mesmo padrão da 17-C". **Não se
aplica.** Na 17-C o uuid é do **dispositivo** e é estável entre retries; um uuid gerado pelo
*modelo* muda a cada retry, e a trava vira decoração.

```txt
idempotency_key = "ai:" + approval_id        ← derivada no SERVIDOR, determinística
```

`client_mutation_id` **não existe nos schemas de entrada das ferramentas** — pela mesma razão que
`user_id` não existe. Consequências que saem de graça:

| Critério de aceite | Por que passa |
| --- | --- |
| Retry não duplica | A aprovação é de uso único, no banco |
| Fallback de provedor não repete a escrita | Fallback acontece na fase de **proposta**, que não escreve nada |
| Confirmação válida executa uma única vez | Mesma chave única |
| Cancelar streaming não desfaz ação confirmada | A execução nunca esteve no streaming |

Ação **em massa** registra sucesso e falha **por item**, e o conjunto de itens entra no hash — item
a mais depois de confirmado é proposta diferente.

### 3.6 Snapshot restrito — a exceção declarada à invariante 20 da 18-B

A invariante 20 (18-B) diz: *a auditoria guarda o pedido, nunca o resultado*. `before_snapshot`
completo seria uma **segunda cópia do registro pessoal dentro do módulo de IA**, com prazo
indefinido. **Decisão do dono, tomada em 2026-08-07:**

> `ai_action_executions` guarda **apenas os campos que a ação tocou**, declarados por allowlist no
> próprio command — mais o id e a rota interna do registro. Nunca o registro inteiro.

- A allowlist é do **command**, estática em código. Campo fora dela não vai para a linha, mesmo que
  o serviço de domínio o tenha alterado — nesse caso a execução registra que houve alteração não
  detalhada, o que é honesto, em vez de gravar o campo.
- Anexo, foto, texto livre longo e material criptográfico **nunca** entram, em nenhuma allowlist.
- A invariante 20 é **reescrita** no `CLAUDE.md` para declarar esta exceção — pelo mesmo motivo que
  a trava de honestidade virou `seguranca-v2` na 18-B: **texto que descreve o que a IA não faz é
  datado**, e um texto desatualizado é pior que nenhum.

### 3.7 Desfazer é por command, nunca genérico

Reverter aplicando um `after_snapshot` significa escrever no banco um estado que **nenhum
formulário produziu** — exatamente o que a arquitetura proíbe.

- `undo` é **declarado no command**, e só existe onde o serviço de domínio já tem a operação
  inversa que a tela usa (criou tarefa → `deleteTodoTask`; mudou prioridade → grava a anterior).
- Sem `undo` declarado, **o botão não aparece** e a tela explica por quê.
- **Todo desfazer passa pelo mesmo Approval Engine** — é uma ação, não um atalho — e é auditado.
- **Transação financeira nunca é apagada em silêncio:** o desfazer usa o fluxo de cancelamento /
  exclusão segura que já existe, mostrando a consequência sobre fatura e relatório.

### 3.8 Roteador multi-módulo — o desempate deixa de ser acidental

`moduloPeloTexto` devolve hoje **o primeiro módulo que casar, na ordem de declaração do objeto**
(`agents/routing.ts`). Com dois vocabulários ninguém percebe; com nove, a ordem de declaração vira
desempate silencioso — e há colisão real e frequente:

| Palavra | Módulos que a reivindicam |
| --- | --- |
| conta / contas | Financeiro (conta bancária, conta a pagar) |
| meta / metas | Dieta · Treinos · TO-DO |
| série / séries | Treinos (série de exercício) · TO-DO (série recorrente) |
| aula | Estudos · Agenda |
| lista | Dieta (compras) · TO-DO |
| registro / registrei | Hábitos · Dieta · Treinos |

**Decisão:** desempate explícito por **contagem de casamentos**; empate cai no **orquestrador
declarando a ambiguidade** (motivo novo, `AMBIGUO`, na lista fechada de `ROUTING_MOTIVOS`), nunca
no primeiro da ordem. Teste com as frases colidentes **escritas à mão**, não geradas do
vocabulário — teste que espelha a implementação não prova nada.

### 3.9 Leitura dos 7 módulos — forma e ritmo

**2 a 3 ferramentas por módulo** (~18–21 no total), em **3 lotes**, cada lote fechando com
`lint + tsc + test:run + build` e `TZ=UTC`:

| Lote | Módulos | Por que nesta ordem |
| --- | --- | --- |
| 1 | TO-DO · Hábitos · Estudos | Baixo acoplamento, sem dinheiro, sem dado de saúde |
| 2 | Agenda · Tarefas & Rotinas · Medidas corporais | Agenda tem integração externa; `body_*` é módulo central |
| 3 | **Financeiro · Dieta** | Os dois com agregação própria (`invoice.ts`, `calc.ts`) — os mais fáceis de fazer a IA divergir da tela |

**Um agente especialista por módulo** — 7 novos. Mantém a relação `1 agente ↔ 1 flag allow_* ↔ 1
allowlist` que a 18-B estabeleceu, e mantém cada allowlist pequena o bastante para caber no teto de
3 passos por tentativa.

**Ferramentas de `body_*` não têm agente próprio:** entram na allowlist dos agentes de Dieta **e**
de Treinos, exigindo `allow_body`. Isso já funciona sem código novo — o guard checa a permissão da
*ferramenta*, não a do agente.

**Cada ferramenta nova exige, no MESMO commit:** descriptor · adapter (casca fina sobre o serviço
que a tela usa, com as **mesmas opções** que a tela passa) · entrada Zod `.strict()` · entrada em
`TOOL_EXECUTORS` · rótulo em `ROTULO_DA_FERRAMENTA` · `refs` com rota que passa por
`rotaInternaAceita` · teste que não espelha a implementação.

## 4. As três tabelas novas

| Tabela | Papel | Guarda |
| --- | --- | --- |
| `ai_action_proposals` | O que a IA **quer** fazer | tool, versão, payload normalizado, entidades resolvidas, previsão, hash, risco, `expires_at`, FK para o `ai_tool_calls` que a originou |
| `ai_action_approvals` | A confirmação do dono | proposta, hash confirmado, momento, origem (tela), **uso único por índice** |
| `ai_action_executions` | O que **foi** feito | command, `idempotency_key`, status, duração, erro sanitizado, id + rota do registro, **e só os campos tocados** (§3.6) |

Todas com `user_id NOT NULL`, RLS + FORCE RLS, índice em `user_id`, trigger `updated_at`, CHECK de
status, e **FK composta `(x_id, user_id)`** em toda referência dentro do mesmo usuário — a RLS
confere o `user_id` da própria linha e **não alcança a linha apontada** (16-E nas fotos, 17-F na
ponte da agenda, e a mesma correção aqui).

**Fontes de verdade, declaradas para não virarem três cópias da mesma auditoria:**

```txt
ai_tool_calls         → o que o MODELO pediu          (existe desde a 18-B)
ai_action_proposals   → o que SERIA feito
ai_action_executions  → o que FOI feito
```

Uma proposta sempre nasce de uma tool call, e a FK prova isso.

## 5. Ordem de execução

| Bloco | O quê | Gate |
| --- | --- | --- |
| **0** | A matriz completa das actions (documento, zero código) | — |
| **1** | Leitura dos 7 módulos, em 3 lotes | Verificação por lote |
| **2** | Agentes, roteador com desempate, prompts, rotas de contexto | Verificação |
| — | **🚧 AUTORIZAÇÃO EXPLÍCITA DO DONO PARA A ESCRITA** | **Bloqueante** |
| **3** | Approval Engine (3 migrations, hash, prazo, uso único, revalidação) | Verificação |
| **4** | Commands + ferramentas de escrita, em ordem crescente de risco | Teste de equivalência por command |
| **5** | Tela "Ações realizadas pela IA" + desfazer declarado | Verificação |
| **6** | Documentação e verificação final | `lint · tsc · test:run · build · TZ=UTC · smoke` |

O critério de aceite financeiro do documento da fase (*"compra de R$ 120 no cartão, dividida com
terceiro"*) atravessa `invoice.ts`, parcelamentos e recebíveis — as regras que **já produziram bug
em produção** (valor em dobro na fatura seguinte, sinal invertido na importação). É o **último**
command do Bloco 4, nunca um dos primeiros.

## 6. Regras de segurança que a 18-C não pode afrouxar

Todas as invariantes 1–25 do `CLAUDE.md` continuam valendo. Além delas:

1. O modelo **não escolhe** permissão, usuário efetivo, nível de risco, nem se haverá confirmação.
2. `user_id` sempre de `authContext()` — na proposta **e** na execução.
3. Propriedade verificada em toda ferramenta e em todo command.
4. `.strict()` em todo schema, dos dois lados.
5. Confirmação **expirada**, **de outro usuário** ou **já usada** é recusada — e a recusa é auditada.
6. Nenhuma regra de negócio duplicada — provado por **teste de equivalência**: ferramenta e
   formulário produzem o mesmo registro para a mesma entrada.
7. Auditoria completa e **sem segredo**: nunca API key, token, URL assinada de longa duração ou
   conteúdo integral desnecessário.

## 7. O que fica de fora, declarado

| Item | Onde |
| --- | --- |
| Imagens, documentos e **qualquer upload** | 18-D |
| Insights e dashboards de IA | 18-E |
| Memória, voz, automações, botão flutuante, sino, busca global | 18-F |
| Auto-execução sem confirmação (modos Equilibrado/Rápido) | **Nenhuma subfase** sem nova decisão do dono |
| `allow_cross_module` | Continua **existindo na tabela e nunca lido**. Com um agente por módulo, pergunta que cruza módulos segue sem resposta — pendência consciente, não bug |

## 8. Riscos

| Risco | Mitigação |
| --- | --- |
| Duplicação de lançamento | Aprovação de uso único no banco + `idempotency_key` derivada dela + teste de retry |
| Extração de command quebra o formulário existente | Um por vez, teste antes e depois; a Server Action vira casca fina |
| Modelo interpreta frase ambígua e propõe errado | Proposta obrigatória com previsão do efeito; nada executa sem confirmação |
| Confirmação reproduzida (replay) | Hash do efeito + prazo de 10 min + uso único + vínculo com usuário e conversa |
| O mundo muda entre propor e confirmar | Revalidação com recálculo da previsão no momento da execução |
| Refactor em excesso | Só se extrai command de action que a IA realmente usa |
| Roteador manda a pergunta para o módulo errado | Desempate por contagem + empate no orquestrador declarando ambiguidade |

## 9. Números a reconferir antes de citar

- "44 actions" (levantamento de 2026-08-04) está **datado**: hoje há **49 arquivos** em
  `src/lib/actions/`. O Bloco 0 refaz a contagem e a classificação Caso A / Caso B.
- Total de tabelas no `public` e total de testes mudam a cada subfase — **conte antes de citar**.
