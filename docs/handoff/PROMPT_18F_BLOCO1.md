# PROMPT — Fase 18-F · Bloco 1 (costura)

> Copie o bloco abaixo inteiro e cole num chat novo, na raiz do projeto.

```text
Você vai implementar o Bloco 1 da Fase 18-F do "Sistema Pessoal Yuri" — um sistema pessoal
single-user em Next.js 16 + Supabase + Tailwind v4 + shadcn/ui, locale pt-BR.

O QUE JÁ ESTÁ FEITO POR VOCÊ:
O desenho foi validado com o dono e o plano de implementação já está escrito, com código real
em cada passo. Você NÃO precisa desenhar nada — precisa executar com rigor.

  Plano:  docs/superpowers/plans/2026-09-19-18f-bloco1-costura.md
  Spec:   docs/superpowers/specs/2026-09-19-18f-memoria-integracoes-design.md
  Branch: feat/18-f-memoria-integracoes  (já existe, já tem spec e plano commitados)

LEIA ANTES DE ESCREVER QUALQUER LINHA, NESTA ORDEM:
  1. CLAUDE.md da raiz — em especial "Layout responsivo (5 regras)", "Fuso: o sistema inteiro
     é America/Sao_Paulo" e o "Contrato das Server Actions"
  2. A spec acima — seções §3 (o que fica FORA e por quê), §4 (este bloco) e §9 (fronteiras)
  3. O plano acima — é o seu roteiro, task a task
  4. docs/project/PROJECT_RULES.md e docs/handoff/NEXT_AGENT_INSTRUCTIONS.md

O QUE O BLOCO 1 ENTREGA:
Tirar o módulo de IA da condição de ilha. Quatro famílias de notificação no sino, busca global
alcançando conversas/análises/ações, seção de IA no backup, e exclusão em massa que declara o
que permanece. Oito tasks. NENHUMA MIGRATION — este bloco não cria tabela nem coluna.

COMO TRABALHAR:
- Siga o plano task a task, na ordem. Cada task é TDD: escreva o teste, veja falhar, implemente
  o mínimo, veja passar, comite.
- O plano traz o código. Onde ele disser "confirme o nome real no arquivo", CONFIRA — ele foi
  escrito contra o repositório, mas nomes podem ter mudado. Se algo divergir, corrija o código;
  NÃO invente coluna, função ou rota que não exista.
- Commits pequenos e frequentes, mensagens em pt-BR.

⛔ O QUE NÃO PODE SER AFROUXADO (cada uma saiu de um bug real deste projeto):

1. `filterByPrefs` é o ÚNICO ponto onde a preferência de notificação decide. Um tipo novo NUNCA
   consulta preferência por conta própria.
2. Toda notificação deste bloco é `low` ou `medium`, tem link, e tem `dedupe_key`
   determinístico — rodar o Cron três vezes não pode duplicar nada.
3. O teste de vocabulário proibido (src/lib/tone/vocabulary.ts) varre os textos gerados. Se ele
   reprovar, MUDE O TEXTO, nunca o teste: reprovar significa que a frase cobra ou prescreve.
4. O Cron roda com service role e IGNORA a RLS — toda consulta ali carrega `user_id`
   explicitamente. Já a busca global (`searchAll`) usa o client COM SESSÃO e NÃO filtra por
   user_id, porque a RLS faz isso. Os dois estão certos, cada um no seu contexto; trocá-los é
   ou vazar dado ou devolver vazio em silêncio.
5. O orçamento NÃO é recalculado no Cron. Ele sai de `getUsageSummary`, a MESMA função de
   /ia/consumo, que passa a aceitar `LeituraDoDono`. Um segundo somatório faria o número do
   sino divergir do número da tela.
6. `ai_provider_credentials` NUNCA entra no backup — guarda o ciphertext da chave de API.
7. A exclusão em massa DECLARA o que permanece, antes de confirmar, na tela. O registro em
   `ai_action_executions` sobrevive à exclusão da conversa porque a FK foi omitida de
   propósito; esconder isso daria uma tela mais limpa e uma auditoria mentirosa.
8. NÃO existe retenção automática, e isso é decisão, não esquecimento: "nada some sozinho,
   descartar é clique do dono". Não acrescente um job que apaga conversa velha.
9. `.slice(0, 10)` num `timestamptz` devolve o dia em UTC e erra a data entre 21h e 00h BRT.
   Use `dateInSaoPaulo(new Date(x))`. Data pura ('yyyy-MM-dd') é TEXTO, com aritmética em
   `Date.UTC`.
10. Lógica pura recebe `hoje`/`agora` INJETADOS. Nunca `Date.now()` dentro de função pura.
11. NÃO linke para /ia/memoria — essa rota só nasce no Bloco 3. Link para rota inexistente é
    404, e o projeto já levou esse bug uma vez.

VERIFICAÇÃO (o que significa "pronto"):
  npm run lint && npx tsc --noEmit && npm run test:run && npm run build && npm run perf:bundle
  TZ=UTC npx vitest run     # a suíte tem de passar em qualquer fuso

  ⚠️ `vitest` NÃO checa tipo — rode `npx tsc --noEmit` mesmo com a suíte verde.
  ⚠️ `perf:bundle` reprova rota acima de 250 KB gz. /ia/configuracoes já está em 277,5 KB
     (teto próprio documentado) — confirme que NÃO subiu.
  ⚠️ Confira o `pwd` antes de acreditar num verde: `cd` persiste entre chamadas de shell, e
     isso já fez tsc e vitest "passarem" sem rodar arquivo nenhum neste projeto.

AO FECHAR O BLOCO:
Atualize docs/project/CURRENT_STATUS.md e docs/handoff/NEXT_AGENT_INSTRUCTIONS.md com o que
mudou e as decisões tomadas — de forma PONTUAL, sem reescrever seções de outras frentes.
Não faça push sem o dono pedir.

Comece lendo os quatro documentos e me diga o que entendeu do escopo antes de abrir a Task 1.
```
