# Fase 16-F — Dieta e Alimentação · Integrações, notificações e polimento

> Sexta e **última** subfase da Fase 16. **Depende das 16-A a 16-E concluídas.**
> É ela que declara a Fase 16 concluída — validando os **40 critérios de aceite gerais**.

## Contexto

Com o módulo funcional de ponta a ponta, falta ligá-lo ao resto do sistema (dashboard, busca
global, lançamento rápido, notificações, TO-DO, agenda, hábitos) e fazer a passada final de
responsividade, acessibilidade, performance e segurança.

## Objetivo

1. **Integrar** o módulo aos pontos transversais do sistema.
2. **Notificações** configuráveis, sem duplicidade e sem linguagem de culpa.
3. **Polimento final** — responsividade, acessibilidade, performance, estados de erro.
4. **Auditoria de segurança** e fechamento da fase.

## Dependências

16-A a 16-E. Fase 12 (`settings.dashboard_layout` + `normalizeLayout`), Fase 13
(`searchAll`, `QuickAdd`, `notifications` + `dedupe_key` + Cron), Fase 14 (`/api/export`,
`settings.notification_prefs`), Fase 15 (`/todo`), Fase 08 (agenda), Fase 10 (hábitos).

## Escopo

### Dashboard geral (`/dashboard`)
Card novo de Dieta registrado em `src/lib/dashboard/cards.ts` — **`normalizeLayout` já
anexa cards novos** ao layout salvo, sem quebrar a preferência do usuário. Conteúdo:
calorias e proteínas do dia, refeições pendentes, próxima refeição, lista de compras
pendente, última medida e evolução do peso.

### Busca global (`src/lib/search/queries.ts`)
Passa a encontrar **alimentos, receitas, refeições-modelo, planejamentos e listas de
compras**, no shape unificado `{type,id,title,subtitle,link}`, com deep-link que abre o item
certo.

### Lançamento rápido (`src/components/quick-add/`)
Tipos novos: **registrar alimento**, **registrar refeição**, **adicionar medida** e
**adicionar item à lista de compras**. Registrar alimento = buscar → escolher medida →
quantidade → refeição → data → salvar. **Reusa as Server Actions originais** — nenhuma
regra reimplementada.

### Notificações
Famílias novas em `src/lib/notifications/generate.ts`, todas com `dedupe_key`
determinístico: próxima refeição, refeição não registrada, planejamento da semana pendente,
lista de compras pendente, medida semanal pendente, meta diária próxima (opt-in), alimento a
revisar, item de despensa perto da validade. Cada tipo liga/desliga em
`settings.notification_prefs`.

### Outros módulos
- **Hábitos:** Dieta **lê** a água (`habit_logs`) e linka para registrar. Fonte de verdade
  segue no módulo Hábitos. Sem duplicação.
- **TO-DO:** ação opcional de criar tarefa (fazer compras, preparar refeições, medir) e
  vincular lista de compras a uma tarefa.
- **Agenda:** ação opcional de criar bloco de preparo/refeição. **Nunca** transformar toda
  refeição em evento automaticamente.
- **Exercícios/treino:** se houver dado, permitir metas de dia de treino × descanso — **sem
  recalcular meta automaticamente** sem confirmação.
- **Exportação:** `/api/export` inclui as tabelas `nutrition_*` (sem tokens, sem binário de
  foto).

### Polimento
Responsividade (desktop/tablet/celular), acessibilidade (contraste, foco visível, labels,
teclado, leitor de tela, gráfico com descrição textual, nada dependente só de cor),
performance (índices, evitar N+1, Suspense por card), estados de erro (falha de carga, falha
ao salvar, fonte indisponível, falha de conversão), e **leitura de código de barras pela
câmera** no celular (com confirmação dos dados antes de salvar e sem sobrescrever alimento
existente em silêncio).

## Fora do escopo

| Item | Motivo |
| --- | --- |
| Canais externos de notificação (push/e-mail) | Fora do escopo do sistema inteiro; só ligar quando houver infraestrutura real de envio. |
| Base externa de código de barras confiada automaticamente | O usuário confirma os dados; conflito mostra fonte e data e permite criar versão pessoal. |
| Prescrição/diagnóstico nutricional | Proibido por decisão de produto. |

## Regras de negócio

1. **Sem duplicidade de notificação** — `dedupe_key` determinístico + `selectNewCandidates`,
   como na Fase 13. Rodar o Cron duas vezes não cria duas.
2. **Sem linguagem de culpa.** Notificação informa e oferece ação; não repreende.
3. **Toda notificação é configurável e desativável.**
4. **A água tem uma única fonte de verdade** (Hábitos).
5. **Nada vira evento/tarefa automaticamente** — sempre ação explícita do usuário.
6. **`normalizeLayout` cuida do card novo** — não recrie o layout do dashboard.

## Plano de implementação

1. Card do dashboard + registro em `cards.ts`.
2. Busca global + deep-links.
3. Lançamento rápido (4 tipos novos).
4. Notificações (geração pura + testes de idempotência + prefs).
5. TO-DO / agenda / hábitos / exportação.
6. Scanner de código de barras (mobile).
7. Passada de responsividade, acessibilidade e performance.
8. Auditoria de segurança (`get_advisors`, RLS, storage, segredos, logs).
9. Validação dos **40 critérios de aceite gerais** e fechamento da fase.

## Critérios de aceite gerais da Fase 16 completa

1. Existe uma aba central "Dieta e Alimentação".
2. Os submódulos estão organizados dentro dela.
3. Consigo configurar metas.
4. Consigo visualizar calorias e nutrientes do dia.
5. Consigo visualizar refeições do dia e da semana.
6. Consigo planejar refeições.
7. Consigo registrar o que realmente consumi.
8. Consigo editar quantidades.
9. Consigo marcar refeição como não consumida.
10. Consigo substituir uma refeição.
11. Consigo substituir um alimento.
12. Consigo comparar nutricionalmente uma substituição.
13. Consigo cadastrar alimentos.
14. Existe uma base brasileira útil e verificável.
15. Os alimentos possuem fonte registrada.
16. Consigo usar medidas caseiras.
17. Consigo cadastrar receitas.
18. Os nutrientes da receita são calculados.
19. Consigo criar refeições-modelo.
20. Consigo duplicar refeições, receitas e planejamentos.
21. Consigo excluir em massa onde aplicável.
22. Consigo filtrar todos os submódulos.
23. Consigo gerar lista de compras.
24. A lista consolida itens corretamente.
25. Consigo registrar medidas.
26. Consigo acompanhar evolução.
27. Fotos de evolução são privadas.
28. O histórico não muda quando um alimento é editado.
29. O dashboard principal recebe os cards do módulo.
30. O buscador global encontra os registros.
31. O lançamento rápido permite registrar alimentação.
32. As notificações funcionam sem duplicidade.
33. O módulo funciona em modo dark e light.
34. O módulo funciona no celular.
35. As políticas RLS estão funcionando.
36. Os cálculos possuem testes.
37. Nenhuma funcionalidade anterior foi quebrada.
38. A documentação foi atualizada.
39. O handoff foi preenchido.
40. O próximo agente recebeu o caminho exato da próxima subfase.

## Testes obrigatórios

Geração de notificação por família + **idempotência** (rodar 2× não duplica); respeito às
preferências; busca global encontra cada tipo novo e o link abre o item; lançamento rápido
cria pelo caminho oficial (snapshot correto); export contém só o usuário e nenhum token;
segurança: usuário não acessa dado de outro, não edita alimento global, foto permanece
privada, id de terceiro é rejeitado, ação em massa respeita o usuário.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Notificação duplicada/invasiva | `dedupe_key` + prefs por tipo + testes. |
| Quebrar o layout salvo do dashboard | `normalizeLayout` anexa card novo sem descartar preferência (já testado na Fase 12). |
| Reimplementar regra no lançamento rápido | Só chamar as actions existentes. |
| Scanner exigir permissão e falhar em silêncio | Estado de erro explícito + entrada manual do código sempre disponível. |

## Arquivos de documentação a atualizar

Os mesmos da 16-A + marcar a **Fase 16 como concluída** em `PROJECT_ROADMAP.md` e
`CURRENT_STATUS.md`, e devolver `NEXT_AGENT_INSTRUCTIONS.md` ao estado
"projeto em manutenção, sem próxima fase planejada".

## Instruções para o próximo agente

Não há subfase seguinte. Ao concluir, o sistema volta ao **modo manutenção/iteração**.
Antes de declarar pronto, valide os 40 critérios acima **um a um** e registre no handoff
qualquer item não atendido — nada de aceite silencioso.
