# PROMPT — Fase 18-F · Bloco 4 (experiências)

> Copie o bloco abaixo inteiro e cole num chat novo, na raiz do projeto.

```text
Você vai implementar o Bloco 4 da Fase 18-F do "Sistema Pessoal Yuri" — um sistema pessoal
single-user em Next.js 16 + Supabase + Tailwind v4 + shadcn/ui, locale pt-BR.

O QUE JÁ ESTÁ FEITO POR VOCÊ:
O desenho foi validado com o dono e o plano de implementação já está escrito, com código real
em cada passo. Você NÃO precisa desenhar nada — precisa executar com rigor.

  Plano:  docs/superpowers/plans/2026-09-20-18f-bloco4-experiencias.md
  Spec:   docs/superpowers/specs/2026-09-19-18f-memoria-integracoes-design.md  (§7 é este bloco)
  Branch: feat/18-f-memoria-integracoes  (já existe; o Bloco 3 fechou nela em 2026-09-20)

LEIA ANTES DE ESCREVER QUALQUER LINHA, NESTA ORDEM:
  1. CLAUDE.md da raiz — em especial as invariantes 5, 6, 8, 17, 20, 26, 27, 28, 29, 30, 32,
     56, 71, 74, 77, 79, 81, 91, 94 e 98, o "Contrato das Server Actions" e as "4 regras do
     carregamento sob demanda"
  2. A spec acima — §7 (este bloco), §9 (fronteiras) e os critérios 12, 13 e 16
  3. O plano acima — é o seu roteiro, task a task
  4. docs/project/PROJECT_RULES.md e docs/handoff/NEXT_AGENT_INSTRUCTIONS.md

O QUE O BLOCO 4 ENTREGA:
Três panoramas de um clique — "Planejar meu dia", "Encerrar meu dia", "Planejar minha semana" —
cujas leituras são decididas pelo SERVIDOR, e uma "Caixa de entrada inteligente" que classifica
o que o dono escreve e prepara a ação. Nove tasks. UMA MIGRATION, e ela NÃO CRIA TABELA: um
valor no CHECK de `ai_runs.kind` e uma função de admissão.
⚠️ `allow_cross_module` JÁ EXISTE na tabela desde a 18-A e nunca foi lida por uma linha de
código; este bloco a faz ligar alguma coisa. (Foi assim com `allow_memory` no Bloco 3.)

COMO TRABALHAR:
- Siga o plano task a task, na ordem. Cada task é TDD: escreva o teste, veja falhar, implemente
  o mínimo, veja passar, comite.
- O plano traz o código. Onde ele disser "confirme no arquivo real", CONFIRA — ele foi escrito
  contra o repositório em 2026-09-20, mas nomes podem ter mudado. Se algo divergir, corrija o
  código; NÃO invente coluna, função ou rota que não exista.
- Commits pequenos e frequentes, mensagens em pt-BR.

⛔ O QUE NÃO PODE SER AFROUXADO:

1. NENHUMA PORTA NOVA DE LEITURA. As experiências entram pelo TOOL EXECUTOR
   (`tools/executor.ts`): guard, Zod do adapter, timeout do descriptor, poda por `maxRecords` e
   pelo envelope, e linha em `ai_tool_calls`. `insights/collectors/` é a terceira porta
   (invariante 71) e ela NÃO CRESCE — não copie aquele padrão para cá.
2. A LISTA DE FERRAMENTAS DE CADA EXPERIÊNCIA É ESTÁTICA, em `experiences/catalog.ts`, e quem
   a executa é o servidor. O modelo NÃO recebe ferramenta nenhuma num panorama: ele só redige.
   Motivo: `MAX_TOOL_STEPS = 3` por tentativa, e "Planejar meu dia" lê quatro módulos — deixar
   o modelo pedir uma por vez faria o teto cortar antes da última TODA MANHÃ.
3. ⛔ `MAX_TOOL_STEPS` NÃO SE APLICA AO LAÇO DIRIGIDO — E ISSO NÃO É "NÃO HÁ TETO".
   `MAX_FERRAMENTAS_POR_EXPERIENCIA = 5`, um teste valida o catálogo contra ele, e
   `computeReservation` reserva sobre ESSE número, NUNCA sobre o tamanho da lista em runtime.
4. SÓ FERRAMENTA DE LEITURA ENTRA NUM CATÁLOGO. Uma de escrita criaria proposta sem o dono ter
   pedido nada. Há teste sobre o registry real.
5. ⛔ A ARMADILHA DA MIGRATION: `ai_runs` tem DOIS checks. Além de `ai_runs_kind_check`
   (valores), existe `ai_runs_kind_coerente`, que hoje diz que só `chat` tem conversa. A
   EXPERIÊNCIA ABRE UMA CONVERSA — ela é a SEGUNDA espécie com `conversation_id is not null`.
   Mexer só no primeiro CHECK faz todo panorama falhar no `insert`, DENTRO da transação de
   admissão, e o erro chega à tela como `AI_UNKNOWN`.
6. A RPC NOVA USA O MESMO ADVISORY LOCK DAS OUTRAS TRÊS
   (`hashtextextended('ai:begin_run:' || v_user::text, 0)`). Namespace próprio faria um
   panorama e uma mensagem simultâneos lerem o mesmo consumo e passarem os dois — o recurso
   disputado é o ORÇAMENTO DO DONO, não a espécie do run. Foi a lição da 18-D, repetida na 18-E.
7. ⛔ `allow_cross_module` NÃO ENTRA EM `aiPermissionsSchema`. Existe um teste em
   `validators/ai.test.ts` que usa EXATAMENTE essa chave como exemplo do que aquele schema
   recusa. Ela é campo SOLTO em `aiPreferencesSchema`, como `allowVision` e `allowInsightJobs`.
8. CAMPO OBRIGATÓRIO NUM SCHEMA DE FORMULÁRIO ENTRA NO PAYLOAD NO MESMO COMMIT (invariantes 81
   e 94) e mexe em DUAS fixtures, não uma: a lista `OBRIGATORIOS` de `validators/ai.test.ts` E
   a fixture de `round-trip.test.ts`. `allowVision` entrou sem isso na 18-D e deixou TODA
   gravação de preferências recusada por três subfases. E SALVE À MÃO por `/ia/configuracoes`,
   recarregando, antes de dizer pronto — nenhum teste percorre esse caminho.
9. MÓDULO SEM CHAVE É PULADO E DECLARADO, nunca motivo de recusa geral (invariante 77).
   Desligar a Agenda não pode calar o panorama inteiro. ⛔ Mas TODOS pulados ⇒ RECUSE ANTES DE
   GASTAR: chamar o modelo para escrever um panorama sem um único dado faz o dono pagar por
   uma resposta que o sistema já sabia que seria vazia (a lição do `NO_INDICATORS` da 18-E).
10. ⛔ A FRASE DO QUE FICOU DE FORA É NOSSA, e entra no TEXTO GRAVADO. Pedir ao modelo para
    dizê-la é obediência "quase sempre" — e num panorama diário isso é uma omissão por mês. Ela
    vai no FIM, no ramo de sucesso: uma tentativa nova zera o texto (invariante 23), e um aviso
    escrito antes do modelo sumiria no primeiro retry.
11. ⛔ NÃO ESCREVA UM TERCEIRO LAÇO DE TENTATIVAS. Retry, fallback, medição por chamada,
    heartbeat, cancelamento e a regra de que SÓ UMA TENTATIVA FICA ABERTA POR RUN
    (`ai_usage_events_one_active_uidx` — o próprio `chat-runner.ts` declara que NENHUM teste de
    unidade pega isso, porque a trava é do banco) ficam num lugar só. `experience-runner.ts`
    monta um PLANO e delega a `runChat`.
12. O `chat-runner` NÃO CONHECE O CATÁLOGO. Ele executa uma lista que recebeu no plano — não
    tem como buscar uma experiência nem trocar o prompt. Há teste de fronteira, e ele tem de
    ser confirmado POR MUTAÇÃO (acrescente o import proibido, veja vermelho, desfaça).
13. ⛔ NENHUM ENDPOINT NOVO. `POST /api/ia/chat` continua sendo a única exceção arquitetural
    (invariante 6) e continua sendo TRANSPORTE APENAS: auth, Origin, Zod, escolher o runner.
    `chatRequestSchema` vira uma UNIÃO de duas formas `.strict()` — a do panorama NÃO aceita
    `text` nem `conversationId`, e isso é irrepresentável, não recusado por `if`.
14. OS RESULTADOS DAS FERRAMENTAS ENTRAM COMO BLOCO NÃO CONFIÁVEL, em mensagem de papel `user`
    (`renderUntrusted` diz isso no próprio docblock). Nunca `system`; e nunca `tool-result`,
    que sem um `tool-call` correspondente é 400 na Anthropic.
15. A MEMÓRIA CONTINUA ENTRANDO POR ÚLTIMO no prompt (invariante 98). O bloco da caixa de
    entrada entra ANTES dela, e `memory/prompt.test.ts` varre essa ordem.
16. A CAIXA DE ENTRADA USA O LAÇO NORMAL, e isso não é preguiça: pelo runner dirigido ela
    exigiria um agente com as ferramentas dos cinco módulos de escrita ao mesmo tempo — um
    "agente de tudo", que é o que a allowlist por agente existe para impedir. No laço normal,
    `routeAgent` entrega ao especialista certo; palavra ambígua DESLIGA o roteamento
    (invariante 27) e cai no orquestrador, que não tem ferramenta e portanto PERGUNTA.
17. NENHUMA ROTA NOVA. Os atalhos moram dentro de `ChatView`, e é por isso que aparecem nos
    DOIS lugares (`/ia` e o painel flutuante) sem uma linha duplicada. `AI_SECTIONS` CONTINUA
    COM 8 ITENS — o 8º é `/ia/memoria`, do Bloco 3, e nada entra nele aqui.
18. ⛔ NÃO TOQUE em `floating-assistant.tsx`. Ele mora na CASCA e entra nas 68 rotas; a lista
    do que ele não pode importar está escrita lá (invariante 91).
19. Lógica pura recebe `hoje`/`agora` INJETADOS. Nunca `new Date()` nem `Date.now()` dentro de
    `experiences/`. Data pura ('yyyy-MM-dd') é TEXTO; ⛔ nunca `.slice(0,10)` num `timestamptz`.
20. `experiences/` ENTRA EM `CAMADAS_PURAS` (boundaries.test.ts) NO MESMO COMMIT EM QUE NASCE.
    Aquela lista é escrita à mão: pasta nova FORA dela passa VACUAMENTE VERDE. Foi o preço que
    o Bloco 3 pagou com `memory/`.

MIGRATION:
Aplicada no Supabase via MCP (`apply_migration`, projeto `yjvnlbjvippefvzgrxxw`), e depois os
tipos são REGENERADOS (`generate_typescript_types` → src/types/supabase.ts).
⛔ LEIA O DIFF DOS TIPOS ANTES DE ACEITAR: o gerador traz mais que a sua migration (no Bloco 2
ele trouxe uma relationship de `import_rows` e uma sintaxe nova de genéricos). O diff deste
bloco tem de mostrar SÓ a função nova em `Functions` — NENHUMA TABELA NOVA. O banco continua
com 132 tabelas e 20 `ai_*`; CONFIRA no banco antes de citar.
A RPC `ai_begin_experience_run` é cópia de `ai_begin_chat_run` (está em
supabase/migrations/20260808100100_ai_begin_chat_run_agents.sql) com as trocas listadas no
plano — SECURITY INVOKER, `set search_path = ''`, o mesmo advisory lock, REVOKE/GRANT no rodapé.

VERIFICAÇÃO (o que significa "pronto"):
  npm run lint && npx tsc --noEmit && npm run test:run && npm run build && npm run perf:bundle
  TZ=UTC npx vitest run     # a suíte tem de passar em qualquer fuso

  ⚠️ `vitest` NÃO checa tipo — rode `npx tsc --noEmit` mesmo com a suíte verde. E rode-o LOGO
     DEPOIS da Task 5: `MENSAGEM_ADMISSAO` é um `Record` sobre `BeginRunErrorCode`, então
     código novo sem frase em pt-BR é erro de COMPILAÇÃO, e é o `tsc` quem aponta.
  ⚠️ Linha de base do `perf:bundle`, medida em 2026-09-20 depois do Bloco 3:
        /(app)/configuracoes  281,6 KB gz  (teto próprio 285 — folga de 3,4 KB)
        mediana 213,9 KB · 68 rotas
     Este bloco NÃO cria rota e NÃO toca a casca. Se `/(app)/configuracoes` subir, o culpado é
     o interruptor novo em `ai-preferences-form.tsx`. ⛔ NÃO suba o teto — tire import.
  ⚠️ Confira o `pwd` antes de acreditar num verde: `cd` persiste entre chamadas de shell, e
     isso já fez tsc e vitest "passarem" sem rodar arquivo nenhum neste projeto.
  ⚠️ E CONFIRA À MÃO, nas duas larguras e nos dois temas — a tabela de 10 linhas está no Passo
     4 da Task 8. Em especial: panorama com um módulo desligado (tem de DIZER o que ficou de
     fora), responder ao panorama pedindo uma alteração (cartão de proposta normal), fechar o
     painel no meio da resposta (ela continua), e "meta" na caixa de entrada (tem de PERGUNTAR).

AO FECHAR O BLOCO:
Atualize docs/project/CURRENT_STATUS.md, docs/handoff/NEXT_AGENT_INSTRUCTIONS.md e as
invariantes da 18-F no CLAUDE.md (o Bloco 3 foi até a 100; a Task 9 traz as cinco sugeridas) —
de forma PONTUAL, sem reescrever seções de outras frentes.
Revise o diff antes de commitar: nada de segredo, chave, token, `.env` ou `service_role`.
Não faça push sem o dono pedir.

Comece lendo os quatro documentos e me diga o que entendeu do escopo antes de abrir a Task 1.
```
