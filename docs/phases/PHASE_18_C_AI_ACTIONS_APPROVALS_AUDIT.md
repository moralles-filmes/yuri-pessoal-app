# Fase 18-C — IA · Ações, aprovações, idempotência e auditoria

> Terceira das **6 subfases** da Fase 18. **Depende das 18-A e 18-B concluídas.**
> É a subfase de maior risco do módulo inteiro.
> Desenho geral em `docs/superpowers/specs/2026-08-04-modulo-ia-design.md`.

## Contexto

Até aqui a IA lê. Esta subfase dá a ela a capacidade de **mudar o sistema** — criar transação,
tarefa, evento, refeição, treino; reagendar; categorizar; concluir; e, com confirmação
reforçada, excluir.

O risco não é teórico. Uma transação criada duas vezes corrompe fatura e relatório. Uma
exclusão em massa não tem volta. Uma alteração de série recorrente atinge o futuro inteiro. E
tudo isso pode ser disparado por um modelo que interpretou mal uma frase ambígua.

Por isso a regra desta subfase: **a IA propõe; o usuário confirma; o backend executa e
registra.** Nunca as três coisas na mesma etapa.

## Objetivo

1. **Matriz de ferramentas** — inventário completo antes de qualquer código.
2. **Commands compartilhados**, extraídos sob demanda, sem duplicar regra.
3. **Classificação de risco** em cinco níveis.
4. **Approval Engine** — proposta → hash → confirmação vinculada → execução.
5. **Idempotência real** — a mesma mutação nunca cria dois registros.
6. **Auditoria completa** e tela "Ações realizadas pela IA".
7. **Desfazer** onde for tecnicamente seguro.

## Dependências

18-A e 18-B concluídas. Todas as Server Actions e serviços de domínio existentes.

## Escopo

### Entregável de abertura — a matriz (obrigatório antes de codar)

| Coluna | |
| --- | --- |
| Action atual · Módulo · Ferramenta futura · Tipo (leitura/escrita) · Caso A ou B · Command a extrair · Serviço de domínio reutilizado · Nível de risco · Confirmação necessária · Idempotência necessária · Efeito de cache · Testes necessários |

➡ **Entregue em `docs/phases/PHASE_18_C_MATRIZ_DE_FERRAMENTAS.md`** (2026-08-07), com uma coluna a
mais que este cabeçalho previa: **o teto de linhas da leitura reutilizada**, que na maioria dos
casos é invisível para quem chama e faria um total parcial ser apresentado como completo.

### Extração sob demanda (decisão registrada)

> ⚠️ **NÚMERO CORRIGIDO EM 2026-08-07.** "As 44 actions" contava **arquivos**, não funções — o que
> se percebe pelo próprio sinal ao lado ("3 usam `FormData`" são 3 *arquivos*). Recontagem no
> repositório: **49 arquivos** em `src/lib/actions/` (fora `helpers.ts`) e **410 funções**
> `export async function`. Os sinais de acoplamento continuam valendo e foram reconferidos.

Levantamento reconferido em 2026-08-07: **0** arquivos usam `redirect()`; **3** usam `FormData`
(`body-measurements`, `imports`, `nutrition-recipes`) e são **Caso B**; o padrão universal é
`(input: unknown)` + Zod + `authContext()`.

**`revalidatePath` sozinho não classifica como Caso B.** Uma action é **Caso A adaptável**
quando recebe input estruturado, usa Zod, usa `authContext()`, não recebe `FormData`, não
executa `redirect()`, não depende de componentes, não mistura regra com interface, e o único
acoplamento restante é `revalidatePath`.

```txt
Formulário → Server Action → Command compartilhado → Serviço de domínio → revalidatePath (na casca)
Tool Executor → Adapter da ferramenta → MESMO Command → MESMO serviço de domínio
```

`revalidatePath` fica **exclusivamente na casca da Server Action**, nunca dentro da regra
central. **Não refatore action que a IA não vai usar.** A ferramenta **nunca** chama rota HTTP
interna simulando formulário.

Continuam fonte única, sem cópia: `invoice.ts` (fechamento de fatura), parcelamentos, gastos de
terceiros, `addDiaryEntry` (snapshot nutricional imutável), recorrência do TO-DO, conflitos de
agenda, `session-machine.ts`.

### Níveis de risco

> ⚠️ **CORRIGIDO EM 2026-08-07.** A versão anterior desta tabela numerava de **0 a 4**, e o
> código da 18-A já tinha fixado `NIVEIS_DE_RISCO = [1,2,3,4,5]` (`tools/contracts.ts`) — com as
> três leituras de Treinos usando `risk: 1`. Eram duas escalas para a mesma coisa, deslocadas de
> um. **A escala do código venceu** (renumerar o enum reabriria 18-A e 18-B por estética), e a
> coluna "doc anterior" fica registrada só para leitura de commits antigos.

| Nível (código) | doc anterior | O quê | Confirmação |
| --- | --- | --- | --- |
| **1** | 0 | Leitura, consulta, análise, relatório | Nenhuma |
| **2** | 1 | Criação reversível de baixo impacto (tarefa simples, anotação, check-in de hábito) | **Sim** — simplificada na tela |
| **3** | 2 | Alteração relevante (transação, alteração de valor, evento, reagendamento, refeição consumida, treino passado) | **Sim** — pré-visualização + confirmação |
| **4** | 3 | Destrutiva ou externa (exclusão, exclusão em massa, cancelar evento sincronizado, alterar série recorrente, envio externo, substituir planejamento inteiro) | **Reforçada** |
| **5** | 4 | Não permitida (excluir sem escopo, SQL, revelar segredo, alterar dado de outro usuário, desativar segurança, contornar RLS) | **Bloqueada — ausência de código** |

Ferramenta que toque **dinheiro, dado de saúde ou histórico consolidado** tem `risk >= 3`,
declarado no descriptor — nunca deduzido do nome do módulo, que é adivinhação.

### Modos de confirmação

> ⛔ **DECISÃO DO DONO, 2026-08-07: a 18-C NÃO implementa auto-execução.**
> `ai_user_preferences.confirmation_mode` continua sendo lido e gravado, e o modo escolhe **o
> quanto a tela pergunta** — não *se* ela pergunta. **Toda escrita confirma, em qualquer modo, em
> qualquer nível.** Uma subfase futura que queira ligar auto-execução precisa de decisão explícita
> registrada no spec; não pode se apoiar em "já estava previsto aqui".

Os três modos ficam **declarados** para quando isso for revisto: **Seguro** confirma toda escrita;
**Equilibrado** executaria automaticamente só o simples e claramente reversível; **Rápido**
executaria ações de baixo risco previamente autorizadas.

**Em qualquer cenário futuro, sempre exige confirmação:** transação financeira · exclusão ·
alteração em massa · cancelamento · convite · evento externo · mudança em recorrência inteira ·
alteração de credencial · ação que afete dado de saúde ou histórico consolidado · ação
irreversível.

### Vínculo da confirmação

Usuário · ferramenta · argumentos · **hash da proposta** · horário · prazo curto · conversa ·
ID da ação. **Se a proposta mudar, exige nova confirmação.**

### Idempotência

Toda ferramenta de escrita aceita `client_mutation_id` (mesmo padrão já provado na 17-C, que
usa uuid do dispositivo com unique por sessão). A mesma mutação não cria dois registros ·
retry devolve o resultado anterior quando aplicável · **fallback de provedor não repete a
escrita** · cancelar o streaming não cancela ação já confirmada sem verificar o estado ·
estado desconhecido é reconciliado antes de nova tentativa · operações relacionadas usam
transação · ação em massa registra sucesso e falha **por item**.

### Auditoria

Usuário · conversa · agente · provedor · modelo · ferramenta · versão · argumentos sanitizados
· proposta · confirmação · executor · resultado · registro criado ou alterado · estado anterior
· estado posterior · data · duração · status · erro · idempotency key · origem (texto, voz,
imagem, automação, dashboard).

**Nunca registra:** API key · token · conteúdo integral desnecessário · dado sensível não
relacionado · URL assinada de longa duração.

Tela **"Ações realizadas pela IA"** com filtros por período, agente, módulo, ferramenta,
status, provedor, ação confirmada, ação recusada e erro.

### Explicação das ações

O que pretende fazer · quais registros serão afetados · por que escolheu determinado valor ·
qual ferramenta usará · se há consequência futura · se existe recorrência · se há integração
externa · se a ação pode ser desfeita. Detalhe técnico fica em área expansível.

### Desfazer

Onde for tecnicamente seguro: criação de tarefa, alteração de prioridade, reagendamento,
criação de evento, categorização, registro de hábito, mudança simples.

**Transação financeira:** nunca apagar em silêncio — usar o fluxo de cancelamento,
arquivamento ou exclusão segura que já existe, mostrando a consequência sobre faturas e
relatórios. **Todo desfazer também é auditado.**

### Novas tabelas

`ai_action_proposals`, `ai_action_approvals`, `ai_action_executions` (com `before_snapshot` e
`after_snapshot`), conforme a modelagem da seção 40 do briefing original.

## Fora do escopo

Imagens e documentos (18-D) · insights (18-E) · memória, voz, automações, botão flutuante
(18-F).

## Regras de segurança

O modelo não escolhe permissão, usuário efetivo, nível de risco nem se haverá confirmação ·
o executor sempre obtém o usuário da sessão · propriedade verificada em toda ferramenta ·
duplicidade verificada antes de executar · `.strict()` em todo schema · confirmação não pode
ser reproduzida (replay) · confirmação expirada é recusada · confirmação de outro usuário é
recusada · proposta alterada invalida a confirmação anterior.

## Plano de implementação

1. Matriz completa. 2. Migrations das três tabelas. 3. Approval Engine (proposta, hash,
confirmação, expiração). 4. Action Executor com idempotência. 5. Extração dos commands, um a
um, com teste antes e depois. 6. Ferramentas de escrita por módulo, em ordem de risco
crescente. 7. Auditoria e tela de ações. 8. Desfazer. 9. Testes. 10. Documentação.

## Critérios de aceite

Ação sem confirmação é recusada · confirmação válida executa uma única vez · confirmação
expirada recusada · proposta alterada exige nova confirmação · confirmação de outro usuário
recusada · replay de confirmação recusado · ação em massa exige confirmação reforçada e
registra por item · exclusão exige confirmação reforçada · transação financeira sempre exige
confirmação, em qualquer modo · retry não duplica · fallback não repete escrita · cancelar
streaming não desfaz ação confirmada · o fluxo completo do exemplo da seção 21 do briefing
(compra de R$ 120 no cartão, dividida com terceiro) funciona **chamando o serviço financeiro
existente**, sem recriar a regra de fechamento · nenhuma regra de negócio duplicada, provado
por teste que compara o resultado da ferramenta com o do formulário · auditoria completa e
sem segredo · desfazer funciona e é auditado · transversais do projeto.

## Testes

Confirmações (7 casos acima) · idempotência e retry · financeiro (gasto no cartão, gasto PIX,
identificar fatura, dividir com terceiro, evitar duplicidade, não duplicar após retry) ·
ferramenta permitida × proibida · schema inválido · argumento extra · registro de outro usuário
· data e valor inválidos · timeout · **equivalência**: ferramenta e formulário produzem o mesmo
registro para a mesma entrada.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Duplicação de lançamento | `client_mutation_id` + verificação de duplicidade + teste de retry |
| Extração de command quebra formulário existente | Um command por vez, com teste antes e depois; a Server Action vira casca fina |
| Modelo interpreta frase ambígua e propõe errado | Pré-visualização obrigatória no Nível 2+; a proposta mostra tudo antes |
| Confirmação reproduzida | Hash da proposta + prazo curto + vínculo com usuário e conversa |
| Refactor em excesso | Só se extrai command de action que a IA realmente usa |

## Instruções para o agente seguinte

A 18-D acrescenta imagem e documento — e **arquivo é conteúdo não confiável**. Nada do que
estiver dentro de um arquivo pode alterar as regras do agente nem as permissões desta subfase.
