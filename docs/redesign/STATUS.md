# STATUS

**Atualizado:** 2026-09-20
**Fase atual:** REDESIGN-00 **concluída** · decisões D6–D11 tomadas · **REDESIGN-01 liberada**,
aguardando seu aval para começar
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
| D11 | Recebível `ignorado`: as duas bases respondem, cada uma acerta | `METRICAS-FINANCEIRAS.md` §12. 0 casos hoje |

## Migrations aprovadas (aditivas, nenhuma apaga ou reinterpreta dado)

1. `receivable_receipts` (E1)
2. `transactions.liquidado_em` (E6)
3. `categories.classificacao_padrao` (E7)

`transactions.classificacao`/`valor_pessoal` para receita (E2) **não precisa de migration** —
as colunas já existem e o CHECK já aceita.

## Bloqueios

Nenhum. Falta apenas o seu aval para eu começar a REDESIGN-01.

## Riscos abertos

`R1` cor de entidade "Dourado" ligada a `bg-primary` · `R2` 3,4 KB de folga de bundle na casca ·
`R3` ids de card do dashboard · `R4` deep-links sem teste em 8 módulos · `R5` mudar número sem
perceber · `R6` estado vivo (sessão de treino, chat) · `R7` salvar layout sequestra o período.
Detalhe em `AUDITORIA.md` §4.

## Testes executados nesta fase

| Comando | Resultado |
| --- | --- |
| `npm run test:run` | ✅ 185 arquivos, 3.738 testes, 13,55 s |
| `npm run lint` | ✅ exit 0 |
| `npx tsc --noEmit` | ✅ exit 0 |
| `npm run build` | ✅ exit 0 |
| `npm run perf:bundle` | ✅ mediana 213,9 KB · `/(app)/configuracoes` 281,6 de 285 |

Nenhum teste foi alterado. Nenhum arquivo de `src/` foi alterado.

## Próximo passo

**REDESIGN-01-A** — fechar o dicionário de métricas com as decisões D6–D11 e escrever o
desenho das 3 migrations, **sem aplicá-las**. Nenhuma migration é aplicada no Supabase sem uma
segunda autorização, específica para ela.
