# PROMPT — Fase 18-F · Bloco 2 (botão flutuante)

> Copie o bloco abaixo inteiro e cole num chat novo, na raiz do projeto.

```text
Você vai implementar o Bloco 2 da Fase 18-F do "Sistema Pessoal Yuri" — um sistema pessoal
single-user em Next.js 16 + Supabase + Tailwind v4 + shadcn/ui, locale pt-BR.

O QUE JÁ ESTÁ FEITO POR VOCÊ:
O desenho foi validado com o dono e o plano de implementação já está escrito, com código real
em cada passo. Você NÃO precisa desenhar nada — precisa executar com rigor.

  Plano:  docs/superpowers/plans/2026-09-19-18f-bloco2-botao-flutuante.md
  Spec:   docs/superpowers/specs/2026-09-19-18f-memoria-integracoes-design.md  (§5 é este bloco)
  Branch: feat/18-f-memoria-integracoes  (já existe; o Bloco 1 fechou nela em 2026-09-19)

LEIA ANTES DE ESCREVER QUALQUER LINHA, NESTA ORDEM:
  1. CLAUDE.md da raiz — em especial "Layout responsivo (5 regras)", "Carregamento sob
     demanda (4 regras da auditoria de performance)" e o "Contrato das Server Actions"
  2. A spec acima — §5 (este bloco), §9 (fronteiras) e o critério de aceite 6
  3. O plano acima — é o seu roteiro, task a task
  4. docs/project/PROJECT_RULES.md e docs/handoff/NEXT_AGENT_INSTRUCTIONS.md

O QUE O BLOCO 2 ENTREGA:
O assistente ao alcance de qualquer tela: um botão fixo num canto inferior que abre um painel
com o chat da 18-A. Oito tasks. UMA MIGRATION, que só acrescenta DUAS COLUNAS a
`ai_user_preferences` (canto e ocultação) — nenhuma tabela nova, nenhuma chave de permissão
nova.

COMO TRABALHAR:
- Siga o plano task a task, na ordem. Cada task é TDD: escreva o teste, veja falhar, implemente
  o mínimo, veja passar, comite.
- O plano traz o código. Onde ele disser "confirme no arquivo real", CONFIRA — ele foi escrito
  contra o repositório, mas nomes podem ter mudado. Se algo divergir, corrija o código; NÃO
  invente coluna, função ou rota que não exista.
- Commits pequenos e frequentes, mensagens em pt-BR.

⛔ O QUE NÃO PODE SER AFROUXADO:

1. O ORÇAMENTO DE JS MANDA NESTE BLOCO. O botão mora na casca do app, então tudo que ele
   importa entra nas 67 rotas. Medido em 2026-09-19, depois do Bloco 1:
   `/(app)/configuracoes` está em 279,2 KB gz de um teto próprio de 285 — sobram 5,8 KB.
   Esse é o orçamento. Se estourar, NÃO suba o teto em scripts/perf/bundle-budget.mjs:
   tire import do botão. Uma exceção que cresce a cada bloco é um orçamento que não existe.
2. `src/lib/ai/painel.ts` NÃO PODE TER UM ÚNICO IMPORT, e há teste varrendo o arquivo por
   `import`. São duas razões somadas: peso (item 1) e fronteira — o sino é a fonte de verdade
   para "algo aconteceu no sistema"; o selo do botão fala SÓ da conversa aberta. Sem import,
   ele não tem de onde ler insight, notificação nem ação travada. É o risco nº 1 da fase.
3. O painel inteiro fica atrás de `next/dynamic`, e o SEGUNDO ARGUMENTO tem de ser objeto
   literal escrito ali mesmo — o compilador o lê estaticamente e recusa constante
   compartilhada. Trocar o literal por constante faz o painel voltar ao manifest e o número
   de TODAS as rotas disparar.
4. `useLazyDialog`, nunca `{aberto && <Painel/>}`. O segundo quebra a animação de fechamento
   do Radix — o componente some no mesmo quadro em que a gaveta começaria a desmontar. E é o
   hook que faz o streaming continuar quando o dono fecha o painel e navega.
5. CAMPO OBRIGATÓRIO NUM SCHEMA DE FORMULÁRIO ENTRA NO PAYLOAD NO MESMO COMMIT. `allowVision`
   entrou em `aiPreferencesSchema` na 18-D e nunca chegou ao payload de
   `ai-preferences-form.tsx`: TODA gravação de preferências foi recusada por três subfases,
   com uma mensagem sobre um campo que a tela não tinha. `tsc` não pega — a action recebe
   `unknown`. Quem pega é a lista `OBRIGATORIOS` em `src/lib/validators/ai.test.ts`, e ela
   tem de crescer junto. Depois salve à mão pela tela e recarregue, antes de dizer pronto.
6. `cn()` é `twMerge` e variante entra em OUTRO grupo. `SheetContent` traz
   `data-[side=right]:sm:max-w-sm`; um `sm:max-w-lg` do chamador NÃO vence. Repita o prefixo:
   `data-[side=right]:sm:max-w-lg`.
7. `min-h-0 flex-1` no filho que rola, dentro do `flex-col` do SheetContent — senão o conteúdo
   estoura a gaveta sem rolar. `mobile-nav.tsx` já carrega essa linha com o motivo escrito.
8. A FRASE DE BLOQUEIO DO CHAT PASSA A SAIR DE UM LUGAR SÓ (`prontidaoDoChat`), consumida pela
   página `/ia` E pelo painel. Duas cópias divergiriam na primeira edição, e o dono leria um
   motivo na página e outro no painel para o mesmo sistema.
9. ⚠️ A action que abre o painel PRECISA chamar `reconcileOwnRuns()`. Abrir `/ia` é hoje o
   gatilho PRIMÁRIO da reconciliação preguiçosa; a partir deste bloco o caminho mais curto
   para o chat deixa de ser aquela página, e sem essa linha o gatilho pararia de disparar —
   com reserva presa no orçamento e nada na tela explicando.
10. `floating_hidden` esconde o BOTÃO, não o assistente: o atalho Ctrl/⌘+I continua abrindo o
    painel, e a tela que oferece ocultar diz isso com essas palavras. E ela nasce com o botão
    VISÍVEL — não fere "toda chave nasce desligada", porque aquilo vale para AUTORIZAÇÃO, e
    esta não autoriza nada. O chat atrás do botão continua exigindo as mesmas `allow_*`.
11. Lógica pura recebe `agora` INJETADO. Nunca `Date.now()` dentro de função pura.
12. NÃO linke para /ia/memoria — essa rota só nasce no Bloco 3. Link para rota inexistente é
    404, e o projeto já levou esse bug uma vez.

MIGRATION:
Aplicada no Supabase via MCP (`apply_migration`, projeto `yjvnlbjvippefvzgrxxw`), e depois os
tipos são REGENERADOS (`generate_typescript_types` → src/types/supabase.ts). Leia o diff dos
tipos antes de aceitar: o arquivo é ponto de contato entre frentes, e o diff tem de mostrar só
as duas colunas novas. `ai_user_preferences` já tem RLS + FORCE RLS — policy é da TABELA e
alcança coluna nova; não crie policy nenhuma.

VERIFICAÇÃO (o que significa "pronto"):
  npm run lint && npx tsc --noEmit && npm run test:run && npm run build && npm run perf:bundle
  TZ=UTC npx vitest run     # a suíte tem de passar em qualquer fuso

  ⚠️ `vitest` NÃO checa tipo — rode `npx tsc --noEmit` mesmo com a suíte verde.
  ⚠️ `perf:bundle` é o juiz deste bloco. Compare com a linha de base do plano, rota a rota.
  ⚠️ Confira o `pwd` antes de acreditar num verde: `cd` persiste entre chamadas de shell, e
     isso já fez tsc e vitest "passarem" sem rodar arquivo nenhum neste projeto.
  ⚠️ E CONFIRA À MÃO, nas duas larguras e nos dois temas — a lista está no Passo 5 da Task 7.
     Em especial: mande uma pergunta, FECHE o painel, navegue para outra rota, e confirme que
     o selo aparece quando a resposta termina e que reabrir mostra a resposta inteira.

AO FECHAR O BLOCO:
Atualize docs/project/CURRENT_STATUS.md, docs/handoff/NEXT_AGENT_INSTRUCTIONS.md e as
invariantes da 18-F no CLAUDE.md (o Bloco 1 foi até a 89; a Task 8 do plano traz as quatro
sugeridas) — de forma PONTUAL, sem reescrever seções de outras frentes.
Revise o diff antes de commitar: nada de segredo, chave, token, `.env` ou `service_role`.
Não faça push sem o dono pedir.

Comece lendo os quatro documentos e me diga o que entendeu do escopo antes de abrir a Task 1.
```
