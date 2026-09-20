# PROMPT — Bloco 5 da Fase 18-F (fechamento da fase)

> Cole o bloco abaixo num chat novo aberto na raiz do projeto.

```text
Você vai implementar o Bloco 5 da Fase 18-F do "Sistema Pessoal Yuri" — um sistema pessoal
single-user em Next.js 16 + Supabase + Tailwind v4 + shadcn/ui, locale pt-BR.

⚠️ ESTE É O ÚLTIMO BLOCO DA FASE 18, E ELE FECHA A FASE. Depois dele o projeto volta ao modo
manutenção/iteração: não há 18-G e não há Fase 19.

O QUE JÁ ESTÁ FEITO POR VOCÊ:
O desenho foi validado com o dono e o plano de implementação já está escrito, com código real
em cada passo. Você NÃO precisa desenhar nada — precisa executar com rigor.

  Plano:  docs/superpowers/plans/2026-09-22-18f-bloco5-fechamento.md
  Spec:   docs/superpowers/specs/2026-09-19-18f-memoria-integracoes-design.md  (§8 é este bloco;
          §3 é o que ficou de fora e que a validação NÃO pode marcar como entregue)
  Branch: feat/18-f-memoria-integracoes  (já existe; o Bloco 4 fechou nela em 2026-09-22)

LEIA ANTES DE ESCREVER QUALQUER LINHA, NESTA ORDEM:
  1. CLAUDE.md da raiz — em especial as invariantes 14, 20, 24, 25, 26, 27, 30, 32, 40, 47,
     55, 71, 74, 77, 79, 93, 94, 99, 101 e 105
  2. A spec acima — §8 (este bloco), §3 (o que saiu do escopo) e os critérios 14, 15 e 16
  3. O plano acima — é o seu roteiro, task a task
  4. docs/project/PROJECT_RULES.md e docs/handoff/NEXT_AGENT_INSTRUCTIONS.md

O QUE O BLOCO 5 ENTREGA:
Uma suíte de evals com os oito casos do briefing (`src/lib/ai/evals/`), a validação ITEM A ITEM
dos 158 critérios de aceite das seis subfases, a conferência no banco do que a documentação
afirma, e o handoff reescrito para um projeto concluído. SETE tasks.

⛔ NENHUMA MIGRATION. Nenhuma tabela, coluna, rota, endpoint, ferramenta ou command. O banco é
tocado SÓ PARA LER (contagens, RLS, CHECKs, advisors). Se uma task parecer pedir escrita no
banco, ela está errada — releia a spec §8.

⚠️ E UMA CORREÇÃO DE PRODUÇÃO, DE DUAS PALAVRAS: a suíte encontra um defeito real antes de
ficar verde. Está na Task 2, com o motivo escrito. É a única mudança em `src/` além dos testes.

COMO TRABALHAR:
- Siga o plano task a task, na ordem. Cada task é TDD: escreva o teste, veja falhar, implemente
  o mínimo, veja passar, comite.
- O plano traz o código. Onde ele disser "confirme no arquivo real", CONFIRA — ele foi escrito
  contra o repositório em 2026-09-22, mas nomes podem ter mudado. Se algo divergir, corrija o
  código; NÃO invente coluna, função ou rota que não exista.
- Commits pequenos e frequentes, mensagens em pt-BR.

⛔ O QUE NÃO PODE SER AFROUXADO:

1. ⛔ A SUÍTE AFIRMA O ESTRUTURAL, NUNCA O COMPORTAMENTAL. Nenhum teste chama provedor, nenhum
   depende de o modelo obedecer. O que se afirma é sobre o registry, o roteador, a allowlist e
   os schemas — coisas que continuam verdade com a rede desligada. O doc da fase pedia duas
   tabelas (`ai_eval_cases`, `ai_eval_runs`); o desenho recusou, porque uma suíte que às vezes
   fica vermelha sem defeito é uma suíte que se aprende a ignorar.
2. ⛔ O CASO DESTRUTIVO É AUSÊNCIA DE CÓDIGO, NÃO RECUSA. "Exclua todas as minhas transações"
   não é barrado por prompt nem por "confirmação reforçada" — as duas dependeriam de o modelo
   obedecer. Ele é IRREPRESENTÁVEL: o registry não tem ferramenta que apague, e os SETE `undo`
   moram fora dele de propósito. O teste afirma isso SOBRE O REGISTRY.
3. ⛔ E ELE DERIVA AS DUAS LISTAS, nunca escreve nomes proibidos à mão: {commands que as
   ferramentas apontam} ∩ {inversos que os commands declaram} tem de ser VAZIA. Uma lista de
   nomes furaria no primeiro command novo. Medido em 2026-09-22: 30 ferramentas, 15 commands,
   7 inversos, interseção vazia, risco máximo 3.
4. ⛔ CONFIRME O TESTE DO CASO DESTRUTIVO POR MUTAÇÃO. Acrescente ao registry uma ferramenta
   que aponte para `excluirTransacao`, veja VERMELHO, desfaça. Um teste de ausência que nunca
   foi visto falhar pode estar afirmando `[] === []` sobre uma lista que ele nem leu.
5. ⛔ `evals/` ENTRA EM `CAMADAS_PURAS` (boundaries.test.ts) NO MESMO COMMIT EM QUE NASCE.
   Aquela lista é escrita à mão: pasta nova FORA dela passa VACUAMENTE VERDE. É a TERCEIRA vez
   que isso precisa ser dito neste módulo — `memory/` (Bloco 3) e `experiences/` (Bloco 4)
   pagaram as duas primeiras.
6. ⛔ A TASK 1 TERMINA VERMELHA, DE PROPÓSITO. Um dos oito casos do briefing — "Como estão
   minhas proteínas nesta semana?" — NÃO alcança a Dieta hoje. NÃO ajuste a expectativa para o
   que o código faz: a expectativa é o briefing, e quem está errado é o vocabulário. O conserto
   é a Task 2, num commit separado, e a separação é o que prova que a correção era necessária.
7. ⚠️ O DEFEITO É O PLURAL, E A CAUSA É UMA ESCOLHA DE DESENHO: o casamento do roteador é por
   FRONTEIRA DE PALAVRA, sem stemming (stemming faria palavras não relacionadas colidirem, e a
   invariante 27 diz que palavra ambígua DESLIGA o roteamento em vez de errá-lo). Logo cada
   forma precisa da própria entrada — e o arquivo já fazia isso ("serie"/"series",
   "caloria"/"calorias"). Faltavam "proteinas" e "carboidratos".
8. ⛔ NÃO "APROVEITE PARA" ACRESCENTAR OUTRAS PALAVRAS AO VOCABULÁRIO. Nenhuma outra frase do
   briefing falha. Palavra nova pode EMPATAR dois módulos e desligar o roteamento onde ele
   funcionava — "meta", "gordura" e "tarefa" estão fora de propósito.
9. ⛔ "LANCE ESTA NOTA NO PIX" CAIR NO ORQUESTRADOR **NÃO É DEFEITO** — é o desenho. O
   comprovante não é frase de chat: a porta é `/ia/comprovantes` e ela é a ÚNICA (invariante
   55). O orquestrador tem `allowedTools: []`, então a frase não faz nada por acidente. O teste
   afirma isso E afirma que `chatRequestSchema` recusa um corpo com arquivo.
10. ⛔ A VALIDAÇÃO ITEM A ITEM PODE SAIR NÃO VERDE, E ISSO É O PONTO. O doc da 18-A diz, com
    essas palavras: "A cobertura é o que importa, não o número. Acrescente critério se a
    implementação revelar caso não previsto; NÃO REMOVA para fechar a lista." Critério sem
    evidência não ganha ✅ — ele desce para a seção "O que NÃO foi validado, e por quê".
11. ⛔ CRITÉRIO QUE A SPEC RETIROU NÃO É ✅. Voz, automações configuráveis, pesquisa externa,
    observabilidade e canais externos saíram no §3 do desenho, COM MOTIVO e com o dono de
    acordo. Na tabela eles aparecem como RETIRADO (spec §3), com o motivo, e não contam no
    denominador. Marcá-los verdes seria fechar a fase numa mentira; omiti-los, numa omissão.
12. ⛔ NENHUMA LINHA DA VALIDAÇÃO DIZ "ok", "passa" OU "feito". Cada uma aponta para um teste
    (com o nome), um arquivo/migration, ou "conferido à mão" COM A DATA E O QUE FOI VISTO.
13. ⚠️ AS DUAS CHAVES OCIOSAS VIRAM REGISTRO ESCRITO, NÃO MIGRATION. `allow_external_search` e
    `allow_files` existem desde a 18-A e não ligam nada. ⛔ NÃO escreva migration para
    apagá-las: remover coluna no fechamento de fase é a mudança de schema mais arriscada
    possível pelo menor ganho possível.
14. ⛔ RLS + FORCE RLS EM TODAS AS TABELAS É BLOQUEANTE. A consulta da Task 4 tem de voltar
    VAZIA. Se alguma tabela aparecer, PARE, relate ao dono e NÃO feche a fase — é achado de
    segurança, não ajuste de documentação.
15. ⚠️ TODA AFIRMAÇÃO NUMÉRICA É MEDIDA, NUNCA COPIADA. Tabelas e `ai_*` saem do banco (Task 4);
    testes e arquivos saem do `npm run test:run`; KB por rota sai do `npm run perf:bundle`. O
    CLAUDE.md diz "conte antes de citar" porque o número muda a cada subfase.
16. ⛔ O `perf:bundle` TEM DE SAIR IDÊNTICO: 68 rotas, mediana 213,9 KB gz,
    `/(app)/configuracoes` em 281,6 KB de um teto próprio de 285. Este bloco não toca a casca e
    muda duas strings. Se mudar, algo além do planejado entrou no diff.
17. ⛔ A CONFERÊNCIA À MÃO É TASK, NÃO OPCIONAL (Task 6). O projeto roda em `environment:
    "node"` com zero `.test.tsx` (invariante 25): tema, responsividade, teclado e o caminho
    "salvar em /ia/configuracoes e RECARREGAR" NÃO TÊM COMO ser afirmados por teste. E se a
    tabela de 10 itens do Bloco 4 (ver NEXT_AGENT_INSTRUCTIONS.md) ainda não foi percorrida,
    percorra AGORA — é a última oportunidade antes de a fase fechar.
18. ⛔ `PROJECT_ROADMAP.md` ESTÁ MENTINDO DESDE A FASE 02, E ISSO É MAIOR DO QUE A SPEC PREVIA.
    A spec mandava corrigir um ⬜ da 18-D no CURRENT_STATUS.md — ele JÁ FOI corrigido. O
    problema real é o roadmap: quinze linhas erradas, incluindo "02 | Financeiro Base | ⬜
    Próxima" e "18-E | ⬜ Próxima — sem desenho validado". Ele é o item 4 da leitura obrigatória
    de todo agente novo, ANTES do CURRENT_STATUS.md.
19. ⛔ `PROMPT_PROXIMA_FASE.md` É UM PROMPT PARA COPIAR E COLAR, e ele ainda manda implementar a
    Subfase 17-E, concluída em 2026-08-04. Um agente vai obedecer ao pé da letra e
    reimplementar coisa pronta. Ele tem de passar a dizer que não há próxima fase.
20. ⚠️ EDITE A DOCUMENTAÇÃO DE FORMA PONTUAL. CURRENT_STATUS.md, NEXT_AGENT_INSTRUCTIONS.md,
    LAST_PHASE_SUMMARY.md e PROJECT_ROADMAP.md são compartilhados com as frentes 16 e 17:
    LEIA ANTES e some a sua seção — sobrescrever leva embora o trabalho da outra frente.

BANCO:
⛔ NENHUMA MIGRATION. Só leitura, via MCP do Supabase, projeto `yjvnlbjvippefvzgrxxw`
(`execute_sql` e `get_advisors`). O que conferir está na Task 4: contagem de tabelas (a doc diz
132, com 20 `ai_*`), RLS + FORCE RLS em todas, os DOIS CHECKs de `ai_runs.kind` que o Bloco 4
criou, e os advisors. Advisor de SEGURANÇA novo é bloqueante; o backlog de performance
(`auth_rls_initplan`, 179 policies, com razão medida no CLAUDE.md) continua backlog — ANOTE a
contagem, não conserte aqui.

VERIFICAÇÃO (o que significa "pronto"):
  npm run lint && npx tsc --noEmit && npm run test:run && npm run build && npm run perf:bundle
  TZ=UTC npx vitest run     # a suíte tem de passar em qualquer fuso

  ⚠️ `vitest` NÃO checa tipo — rode `npx tsc --noEmit` mesmo com a suíte verde.
  ⚠️ Confira o `pwd` antes de acreditar num verde: `cd` persiste entre chamadas de shell, e
     isso já fez tsc e vitest "passarem" sem rodar arquivo nenhum neste projeto.
  ⚠️ A contagem de testes SOBE (a suíte nova) — anote o número para o CLAUDE.md.

AO FECHAR O BLOCO (é o fechamento da FASE, não só do bloco):
Atualize, de forma pontual: docs/project/CURRENT_STATUS.md · docs/handoff/LAST_PHASE_SUMMARY.md
(a 18-F passa a ser a última fase concluída, com o placar e o link da validação) ·
docs/handoff/NEXT_AGENT_INSTRUCTIONS.md (deixa de apontar para um próximo bloco; lista as
pendências que sobrevivem à fase) · docs/project/PROJECT_ROADMAP.md (as quinze linhas) ·
docs/handoff/PROMPT_PROXIMA_FASE.md · CLAUDE.md (estado da fase + a invariante 106, sugerida na
Task 7 do plano).
Revise o diff antes de commitar: nada de segredo, chave, token, `.env` ou `service_role` —
inclusive nas saídas de SQL que você tenha colado na documentação.
Não faça push sem o dono pedir.

Comece lendo os quatro documentos e me diga o que entendeu do escopo antes de abrir a Task 1.
```
