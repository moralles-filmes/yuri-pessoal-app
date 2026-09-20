# STATUS

**Atualizado:** 2026-09-20
**Fase atual:** REDESIGN-00 ✅ · D6–D11 ✅ · REDESIGN-01 ✅ · **visual e dicionário APROVADOS
por você em 2026-09-20** · **REDESIGN-02-A entregue** — 02-B (tokens) liberada

⛔ **As três migrations continuam sem ser aplicadas.** "Aprovado tudo" foi lido como aval do
**visual** e do **dicionário**. Cada migration escreve no banco de produção e segue precisando
de um "aplique a M1" (ou M2, ou M3) seu, separado. Serão pedidas uma a uma, no momento em que
a subfase precisar delas — a M3 é a primeira, na 03-B.

---

## REDESIGN-02-A — cor de entidade × token de marca ✅

**Por que existe:** `"Dourado"` é uma cor que **você escolhe** para projetos e etiquetas, e
estava implementada com o token de **marca**. Trocar `--primary` para azul faria todo item
marcado como "Dourado" virar azul, **indistinguível do item `"Azul"` da mesma paleta** — sem
nada na tela denunciando.

**A varredura achou mais três casos do mesmo mecanismo**, que o plano não previa:

| Onde | Era | Virou | Colidia com |
| --- | --- | --- | --- |
| TO-DO · cor de projeto/etiqueta `gold` | `bg-primary` | `bg-yellow-600` | `azul` |
| TO-DO · prioridade **P2** | `text-primary` | `text-warning-ink` | **P3** (`sky`) |
| Tarefas · prioridade **alta** | `bg-primary/10` | `bg-warning/10` | **media** (`sky`) |
| Treinos · calendário, **descanso** | `bg-sky-500/20` | `bg-violet-500/25` | **parcial** (`bg-primary/45`) |

Também entraram os tokens semânticos `success`/`warning`/`info` (com a variante `-ink`
legível), **aditivos** — nenhum valor existente foi alterado, `--primary` segue dourado.

**Evidências:**
- `src/lib/theme/entity-colors.test.ts` — 7 casos, **confirmados por 5 mutações**: cada uma
  das cinco linhas revertida individualmente deixa a suíte vermelha. Teste de ausência que
  nunca foi visto vermelho não prova nada.
- **Inspeção visual real:** `globals.css` compilado pelo Tailwind e renderizado no Chrome
  headless em 4 combinações (claro/escuro × marca dourada/azul). Confirmado na imagem que,
  com a marca azul, `Dourado` continua dourado e `Azul` continua azul.

**Limitação declarada:** o dourado **cravado em hex** (`#C99A2E`) em Agenda, Hábitos, Estudos
e Tarefas **não foi tocado**. Ele não mente sobre dado nenhum — não depende de `--primary` e
continua dourado —, mas vira um tom órfão num app azul. É ajuste de aparência dos módulos
deles, e fica para a **REDESIGN-07**.

---

## REDESIGN-01 — o que foi entregue

| Subfase | Entrega | Onde |
| --- | --- | --- |
| **01-A** | Dicionário de métricas **fechado**: base caixa, base competência, terceiros, cartões, comparações | `METRICAS-FINANCEIRAS.md` §13 |
| **01-A** | Desenho das 3 migrations aprovadas — **escritas, nenhuma aplicada** | `MIGRATIONS.md` |
| **01-B** | Tokens claro/escuro, semânticos novos, paleta de gráficos **validada por script** | `TOKENS.md` |
| **01-C** | Prévias: Dashboard, Relatório financeiro, Central de cartões, celular 390 px, folha de tokens | Artifact privado (link na conversa) |

**Nenhuma linha de `src/` foi alterada na 01.** Nenhuma migration aplicada.

### O que as prévias provam

A base aparece na tela e nenhum número existe sem ela · renda pessoal separada de dinheiro de
terceiros · resultado do período usa a **sua** parte, nunca o bruto · saldo das contas sai do
bloco de resultado, com a data no rótulo · os três números de terceiros têm rótulos que os
distinguem · horizonte de faturas declarado honestamente (6 ciclos × 3 cartões = 18) ·
**ausência, zero medido e falha de leitura viram três coisas diferentes**.
**Branch:** `feat/redesign-00-auditoria` (de `main` em `5de90d6`)

---

## Concluído

- Branch criada de `main` já com a Fase 18 dentro (PR #55 mergeado às 19:09). Nenhuma branch
  de outro trabalho tocada.
- Baseline dos 5 comandos executado de verdade: **test 185/3.738 ✅ · lint ✅ · tsc ✅ ·
  build ✅ · perf:bundle ✅**. **Não há falha preexistente.**
- Inventário conferido no disco e no banco: 66 `page.tsx`, 7 route handlers, 68 rotas no
  orçamento de bundle, 132 tabelas, 3 views, RLS + FORCE RLS em 132/132.
- Seis varreduras paralelas: navegação/casca, design system, dashboard, relatórios, cartões,
  demais módulos.
- Núcleo financeiro auditado por mim (decisão do briefing §14), com leitura direta do banco.
- Cinco documentos escritos em `docs/redesign/`.

## Decisões tomadas nesta fase

| # | Decisão |
| --- | --- |
| D1 | Branch nasce de `main` (você confirmou que o PR #55 foi mergeado — verificado: merge commit `5de90d6`) |
| D2 | REDESIGN-00 fica com o agente principal. O roteador classificou TIER 2 → DeepSeek; o CLAUDE.md do projeto manda decisões de arquitetura ficarem no principal, e a fase inteira é decisão de arquitetura |
| D3 | **A soma de terceiros do cartão continua sem filtrar status de recebível.** Um subagente classificou como P0; reli contra o briefing e discordo — somar todos é o correto para "responsabilidade original". Filtrar só os em aberto faria minha despesa crescer a cada reembolso. Registrado em `METRICAS-FINANCEIRAS.md` §5 |
| D4 | Rotas antigas (`/faturas`, `/parcelamentos`, `/tarefas`) **não morrem**. Layout compartilhado antes de mover a árvore |
| D5 | Os 11 ids de `DASH_CARD_IDS` são imutáveis — renomear apaga preferência salva em silêncio |

## Decisões do dono — 2026-09-20 (respondidas)

| # | Decisão | Detalhe |
| --- | --- | --- |
| D6 | **Recebimento parcial ENTRA** | Tabela `receivable_receipts`. Torna atingíveis os critérios do briefing §13 |
| D7 | As outras duas categorias de receita são **renda dele** | Só a categoria de terceiros é reclassificada |
| D8 | **Categoria ganha marcação de terceiros** + lista separada por tipo | ⛔ É **atalho e filtro**, nunca fonte de verdade — `METRICAS-FINANCEIRAS.md` §11 |
| D9 | **Caixa EXATO** | `transactions.liquidado_em`; nulo cai para `competence_date` com a aproximação **declarada na tela** |
| D10 | Separação vale **daqui pra frente** | Nenhuma reclassificação automática do histórico |
| D11 | Recebível `ignorado` **vira despesa minha** | Sem sobrescrever `valor_pessoal`: a tela mostra a **parte efetiva** (acordada + perdoado), derivada. `METRICAS-FINANCEIRAS.md` §12. 0 casos hoje |

## Migrations aprovadas (aditivas, nenhuma apaga ou reinterpreta dado)

1. `receivable_receipts` (E1)
2. `transactions.liquidado_em` (E6)
3. `categories.classificacao_padrao` (E7)

`transactions.classificacao`/`valor_pessoal` para receita (E2) **não precisa de migration** —
as colunas já existem e o CHECK já aceita.

| D12 | **REDESIGN-02-A fica com o agente principal.** O roteador classificou TIER 1 → Codex; o conteúdo é decisão de design system (qual tom o "Dourado" passa a ter, quais estados colidem) e o CLAUDE.md manda decisão de arquitetura ficar no principal. A execução são ~30 linhas em 4 arquivos |

## Bloqueios

Nenhum.

## Riscos abertos

~~`R1` cor de entidade "Dourado" ligada a `bg-primary`~~ **FECHADO na 02-A**, com teste e
mutação · `R2` 3,3 KB de folga de bundle na casca ·
`R3` ids de card do dashboard · `R4` deep-links sem teste em 8 módulos · `R5` mudar número sem
perceber · `R6` estado vivo (sessão de treino, chat) · `R7` salvar layout sequestra o período.
Detalhe em `AUDITORIA.md` §4.

## Testes executados

| Comando | REDESIGN-00/01 | REDESIGN-02-A |
| --- | --- | --- |
| `npm run test:run` | ✅ 185 arq. / 3.738 testes | ✅ **186 / 3.745**, 13,63 s |
| `npm run lint` | ✅ exit 0 | ✅ exit 0 |
| `npx tsc --noEmit` | ✅ exit 0 | ✅ exit 0 |
| `npm run build` | ✅ exit 0 | ✅ exit 0 |
| `npm run perf:bundle` | ✅ mediana 213,9 KB · configurações 281,6/285 | ✅ mediana **213,9** · configurações **281,7/285** (3,3 KB de folga) · 68 rotas dentro |

O delta de testes é **exatamente** o arquivo novo (+1 arquivo, +7 casos). **Nenhum teste
existente foi alterado** para passar.

## Próximo passo — REDESIGN-02-B

Trocar `--primary` de dourado para azul em `globals.css`, com os neutros re-matizados de hue
quente para frio e a paleta de gráficos validada entrando no lugar de "dourado + 2 cinzas".
`--font-sans` **intocado**.

Depois: 02-C (navegação), 02-D (teste de `href` × `page.tsx`), 02-E (`ModuleShell` único).

Em paralelo, a **03-A** (testes de caracterização de `resumoMes`, `gastosPorCategoria`,
`proximas6Faturas`, `totalAReceber`) já está liberada e **não depende de migration nenhuma**.
