# PROMPT — Fase 18-F · Bloco 3 (memória)

> Copie o bloco abaixo inteiro e cole num chat novo, na raiz do projeto.

```text
Você vai implementar o Bloco 3 da Fase 18-F do "Sistema Pessoal Yuri" — um sistema pessoal
single-user em Next.js 16 + Supabase + Tailwind v4 + shadcn/ui, locale pt-BR.

O QUE JÁ ESTÁ FEITO POR VOCÊ:
O desenho foi validado com o dono e o plano de implementação já está escrito, com código real
em cada passo. Você NÃO precisa desenhar nada — precisa executar com rigor.

  Plano:  docs/superpowers/plans/2026-09-20-18f-bloco3-memoria.md
  Spec:   docs/superpowers/specs/2026-09-19-18f-memoria-integracoes-design.md  (§6 é este bloco)
  Branch: feat/18-f-memoria-integracoes  (já existe; o Bloco 2 fechou nela em 2026-09-20)

LEIA ANTES DE ESCREVER QUALQUER LINHA, NESTA ORDEM:
  1. CLAUDE.md da raiz — em especial as invariantes 20, 30, 32, 35, 38, 39, 40, 41, 45, 70,
     81, 84, 91 e 94, o "Contrato das Server Actions" e as "4 regras do carregamento sob
     demanda"
  2. A spec acima — §6 (este bloco), §9 (fronteiras) e os critérios 1 a 5, 9 e 10
  3. O plano acima — é o seu roteiro, task a task
  4. docs/project/PROJECT_RULES.md e docs/handoff/NEXT_AGENT_INSTRUCTIONS.md

O QUE O BLOCO 3 ENTREGA:
O assistente passa a conhecer as preferências que o dono escreveu — e a poder PROPOR
preferências novas, que só existem depois que ele confirma. Nove tasks. UMA MIGRATION: duas
tabelas (`ai_memories`, `ai_memory_events`) e UMA coluna (`allow_write_memory`).
⚠️ `allow_memory` JÁ EXISTE na tabela desde a 18-A e nunca foi lida por uma linha de código;
este bloco a faz ligar alguma coisa.

COMO TRABALHAR:
- Siga o plano task a task, na ordem. Cada task é TDD: escreva o teste, veja falhar, implemente
  o mínimo, veja passar, comite.
- O plano traz o código. Onde ele disser "confirme no arquivo real", CONFIRA — ele foi escrito
  contra o repositório em 2026-09-20, mas nomes podem ter mudado. Se algo divergir, corrija o
  código; NÃO invente coluna, função ou rota que não exista.
- Commits pequenos e frequentes, mensagens em pt-BR.

⛔ O QUE NÃO PODE SER AFROUXADO:

1. O EVENTO NUNCA GUARDA O CONTEÚDO DA MEMÓRIA. `ai_memory_events` é append-only (só policies
   de SELECT e INSERT) e não tem coluna de texto. É a invariante 20 aplicada aqui: com a frase
   no log, "excluir memória" a deixaria viva num lugar que o dono não sabe que existe — o
   oposto exato do que o botão promete. ⛔ E pelo MESMO motivo `content` fica FORA de
   `camposAuditaveis` de `lembrarPreferencia`: `ai_action_executions.changed_fields` é
   permanente e não some com a conversa (invariante 38).
2. `memory_id` VAI SEM FK, de propósito (invariante 38) — como em `ai_action_executions` e
   `ai_insight_jobs`. Apagar a memória não pode apagar o registro de que ela existiu.
3. NENHUM ESTADO É GRAVADO. `ai_memories` não tem `active`, `status` nem `forgotten_at`:
   vigente/expirada/desativada/esquecida saem de `expires_at` + o último evento, em módulo puro
   com `agora` INJETADO. Precedência DECISÃO DO DONO > PRAZO, nos dois sentidos. E expirar NÃO
   apaga — a memória sai do prompt e continua legível, com a data em que venceu.
4. O SERVIDOR VALIDA FORMA, NUNCA ASSUNTO (invariante 39): uma linha, ≤300 caracteres, sem
   endereço, sem bloco com forma de chave. Uma lista de assuntos proibidos fura no primeiro
   assunto novo. A proibição de ASSUNTO existe e mora no prompt da ferramenta — DESCRITA e
   NUNCA CITADA (invariante 30). ⚠️ Há teste que reprova "diagnóstico" na descrição de
   qualquer ferramenta; escreva a proibição sem citar o termo.
5. A MEMÓRIA É O ÚNICO TEXTO DO DONO QUE ENTRA NO PROMPT SEM SER BLOCO NÃO CONFIÁVEL, E ELA
   ENTRA POR ÚLTIMO: SEGURANÇA + perfil + contexto de roteamento + memória. A seção declara por
   escrito que preferência orienta ESTILO e ESCOLHA e que NÃO desliga regra, NÃO autoriza
   leitura, NÃO autoriza alteração e NÃO é dado sobre os registros. Teto VISÍVEL (20).
6. MEMÓRIA DE MÓDULO ANDa COM A CHAVE DAQUELE MÓDULO. Sem isso, desligar a leitura de Treinos
   deixaria a preferência sobre Treinos continuar orientando a resposta — é ler pela porta dos
   fundos.
7. A ESCRITA CONTINUA FORA DO RUN (invariante 32) e o command é PARTIDO EM DOIS ARQUIVOS
   (invariante 40): `memory-preview.ts` só lê, `memory.ts` escreve. ⚠️ O teste de fronteira do
   lado preview usa a regex `@/lib/[a-z-]+/services$`, que só pega UM nível de pasta e deixaria
   `@/lib/ai/memory/services` passar — o plano manda apertá-la para `/services$`. Faça isso.
8. `memory/` ENTRA EM `CAMADAS_PURAS` NO MESMO COMMIT EM QUE NASCE. Aquela lista é escrita à
   mão: uma pasta nova FORA dela passa vacuamente verde. E ⛔ `approval/` também é camada pura
   lá — então `memory-preview.ts` NÃO pode importar de `@/lib/ai/server/`. Por isso o I/O da
   memória mora em `memory/queries.ts` e `memory/services.ts`, não em `ai/server/`.
9. O INVERSO DE `lembrarPreferencia` É `esquecerPreferencia`, NÃO uma exclusão. Invariante 48:
   o botão de desfazer PROPÕE, e o que ele propõe tem de ser proporcional — desfazer um
   "lembrar" não pode apagar uma linha que o dono talvez queira reler.
10. ⛔ O ORQUESTRADOR CONTINUA COM `allowedTools: []`. `memory.lembrar` vai para os OITO
    especialistas. O prompt do orquestrador afirma, literalmente, que ele "não consegue criar,
    editar nem excluir nada" — com uma ferramenta de escrita ali, essa frase vira mentira, e
    incluí-lo custaria reescrevê-la, subir `assistente-pessoal-v2` para `v3` e trocar a
    invariante 74. É decisão do dono, não sua: se achar que deve, PERGUNTE.
11. TRÊS DESCRIÇÕES DE AGENTE VIRAM MENTIRA NESTE BLOCO. Treinos, Estudos e Tarefas dizem
    "Só lê" e passam a ter ferramenta de escrita. É a QUARTA vez que uma frase de ausência
    envelhece neste módulo (AVISO_SEM_ACESSO quatro vezes, o prompt-base três). Arrume as três
    E escreva o teste que impede a quinta — derivado do registry, nunca de uma lista à mão.
12. CAMPO OBRIGATÓRIO NUM SCHEMA DE FORMULÁRIO ENTRA NO PAYLOAD NO MESMO COMMIT (invariante
    81). Aqui as chaves novas moram DENTRO de `permissions`/`writePermissions`, que já estão em
    `OBRIGATORIOS` — então NÃO acrescente nada àquela lista, e NÃO mexa no formulário (ele
    itera as constantes). Mas SALVE À MÃO pela tela `/ia/configuracoes` e recarregue antes de
    dizer pronto: foi exatamente esse caminho que ficou três subfases quebrado.
13. `allow_write_memory` É ANDada COM `allow_memory` NA ACTION, e a forma da linha é varrida
    por teste depois de colapsar espaço:
    `allow_write_memory: dados.writePermissions.allow_write_memory && dados.permissions.allow_memory,`
14. Lógica pura recebe `agora` INJETADO. Nunca `new Date()` nem `Date.now()` dentro dela.
15. `expires_at` é `timestamptz` — ⛔ NUNCA `.slice(0,10)` nele; use `dateInSaoPaulo`. E o
    prazo que o dono informa é uma DATA que vale até o fim daquele dia EM BRASÍLIA: use
    `saoPauloWallClockToInstant`, senão a memória vence às 21h do dia anterior no verão.
16. O DIÁLOGO DO FORMULÁRIO ENTRA POR `next/dynamic` + `useLazyDialog`, com o segundo argumento
    como OBJETO LITERAL escrito ali mesmo. E o contador de caracteres importa `MAX_MEMORIA` de
    `@/lib/ai/memory/contracts`, NUNCA de `@/lib/validators/ai` (que começa com
    `import { z } from "zod"` — 62,7 KB gz).

MIGRATION:
Aplicada no Supabase via MCP (`apply_migration`, projeto `yjvnlbjvippefvzgrxxw`), e depois os
tipos são REGENERADOS (`generate_typescript_types` → src/types/supabase.ts).
⛔ LEIA O DIFF DOS TIPOS ANTES DE ACEITAR: o gerador traz mais que a sua migration (no Bloco 2
ele trouxe uma relationship de `import_rows` e uma sintaxe nova de genéricos). O diff deste
bloco tem de mostrar só `ai_memories`, `ai_memory_events` e `allow_write_memory`.
As duas tabelas nascem com RLS + FORCE RLS, índice em user_id e trigger de updated_at (só a
primeira). Ao fim: 132 tabelas no `public`, 20 `ai_*` — CONFIRA no banco antes de citar.

VERIFICAÇÃO (o que significa "pronto"):
  npm run lint && npx tsc --noEmit && npm run test:run && npm run build && npm run perf:bundle
  TZ=UTC npx vitest run     # a suíte tem de passar em qualquer fuso

  ⚠️ `vitest` NÃO checa tipo — rode `npx tsc --noEmit` mesmo com a suíte verde. E rode-o LOGO
     DEPOIS da Task 3: acrescentar uma chave a `TOOL_PERMISSIONS` quebra todo literal
     `Record<ToolPermission, boolean>` do repositório, e o `tsc` é quem desenha esse mapa.
  ⚠️ Linha de base do `perf:bundle`, medida em 2026-09-20 depois do Bloco 2:
        /(app)/configuracoes  281,4 KB gz  (teto próprio 285 — folga de 3,6 KB)
        mediana 213,8 KB · 67 rotas
     Este bloco NÃO toca a casca do app, então nada deveria se mexer; a rota nova
     `/ia/memoria` é a 68ª. Se `/(app)/configuracoes` subir, o culpado é `@/lib/ai/constants`.
     ⛔ NÃO suba o teto — tire import.
  ⚠️ Confira o `pwd` antes de acreditar num verde: `cd` persiste entre chamadas de shell, e
     isso já fez tsc e vitest "passarem" sem rodar arquivo nenhum neste projeto.
  ⚠️ E CONFIRA À MÃO, nas duas larguras e nos dois temas — a lista está no Passo 6 da Task 7.
     Em especial: criar, desativar, reativar, esquecer e apagar; e depois abrir /ia, perguntar
     a um especialista com a chave ligada, e ver a resposta respeitar a preferência.

AO FECHAR O BLOCO:
Atualize docs/project/CURRENT_STATUS.md, docs/handoff/NEXT_AGENT_INSTRUCTIONS.md e as
invariantes da 18-F no CLAUDE.md (o Bloco 2 foi até a 95; a Task 9 traz as cinco sugeridas) —
de forma PONTUAL, sem reescrever seções de outras frentes.
Revise o diff antes de commitar: nada de segredo, chave, token, `.env` ou `service_role`.
Não faça push sem o dono pedir.

Comece lendo os quatro documentos e me diga o que entendeu do escopo antes de abrir a Task 1.
```
