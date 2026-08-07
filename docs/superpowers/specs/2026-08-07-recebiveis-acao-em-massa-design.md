# Ação em massa em "A Receber" (`/terceiros`)

**Data:** 2026-08-07
**Módulo:** Financeiro — Gastos de Terceiros (Fase 05)
**Status:** aprovado, pronto para implementar

## Problema

A aba **A Receber** lista os recebíveis um por card, e a única forma de dar baixa é clicar
em **Receber** em cada um. Com 109 recebíveis em aberto de uma pessoa — o caso real que
motivou isto — são 109 cliques, 109 idas ao servidor e 109 `router.refresh()`.

Falta selecionar vários e agir uma vez.

## Escopo

Selecionar recebíveis (individualmente ou por seção) e aplicar em lote uma de quatro ações:

| Ação | Alcança (status de origem) | Resultado |
| --- | --- | --- |
| `receber` | tudo que **não** é `pago` | `pago`, `pago_em` = data escolhida |
| `cobrado` | `pendente`, `ignorado` | `cobrado`, `pago_em` = `null` |
| `ignorar` | tudo que **não** é `ignorado` | `ignorado`, `pago_em` = `null` |
| `desfazer` | só `pago` | `pendente`, `pago_em` = `null` |

**Fora de escopo:** exclusão em massa (recebível não se exclui nesta tela), edição em lote de
data prevista/observações, seleção por intervalo com Shift, seleção persistida na URL.

## Arquitetura

Três camadas, seguindo o desenho que já existe na lista de compras da Dieta
(`bulkShoppingItems` + `selectionInScope`):

### 1. Módulo puro — `src/lib/finance/receivables-bulk.ts`

Nenhuma decisão de lote fica na tela. Exporta:

- `BULK_RECEIVABLE_ACTIONS` / `BulkReceivableAction` — as quatro ações.
- `ORIGENS_DA_ACAO: Record<BulkReceivableAction, ReceivableStatus[]>` — a tabela acima, em
  código. É a **única** fonte de "que status cada ação alcança": a tela usa para contar, a
  action usa para filtrar no `UPDATE`.
- `alcanceDaAcao(selecionados, visiveis, acao)` → `{ ids, valorTotal, foraDoFiltro, jaNoEstado }`

`alcanceDaAcao` faz numa passada só as duas coisas que a tela precisa saber:

1. **Interseção com o que está visível.** Selecionar 109, filtrar para 5 e clicar não pode
   marcar os 109 — é a mesma regra que `selectionInScope` guarda na lista de compras.
2. **Filtro por status de origem**, via `ORIGENS_DA_ACAO`.

O que ficou de fora volta **contado**, nunca omitido: `foraDoFiltro` (selecionado mas não
visível) e `jaNoEstado` (visível, mas já naquele status). São esses números que a barra e o
diálogo exibem — número apresentado como completo depois de um recorte silencioso é
exatamente o que o projeto não faz.

Testes puros co-localizados em `receivables-bulk.test.ts`, incluindo o caso "seleção velha
depois de trocar o filtro".

### 2. Server Action — `bulkSetReceivableStatus`

Em `src/lib/actions/receivables.ts`, no molde padrão: `authContext()` → Zod `.strict()` →
update → `revalidateReceivables()` → `ActionResult<{ afetados, ignorados }>`.

- Schema em `src/lib/validators/receivable.ts`:
  `{ ids: uuid[] (1..2000), acao: BulkReceivableAction, pago_em?: 'yyyy-MM-dd' }`.
  `user_id` **não existe no schema** — vem sempre de `auth.getUser()`.
- **Aplica em blocos de 200 ids.** O PostgREST manda o filtro `id=in.(...)` na query string;
  109 uuids já são ~4 KB e o filtro cresce linear com a seleção. Em lote grande a requisição
  estoura no proxy antes de o banco ver qualquer coisa. Os blocos são somados.
- **Reaplica o filtro de status de origem no servidor** (`.in("status", ORIGENS_DA_ACAO[acao])`).
  A conta do client é para a tela; a garantia é do servidor.
- `pago_em` só é aceito no `receber`; nas demais grava `null`, mesma semântica de
  `setReceivableStatus`. Data ausente ou malformada cai em `hojeISO()`.
- Idempotente: rodar duas vezes não faz dano — o segundo passe não alcança mais nada.

### 3. Tela — `src/app/(app)/terceiros/terceiros-client.tsx`

- **Checkbox por card**, à esquerda do avatar em `ReceivableCard`. Um único `Set<string>` de
  selecionados vive em `TerceirosClient`.
- **Checkbox no título de cada seção** — "Em aberto (109)", "Histórico (42)" — marcando e
  desmarcando os daquela seção, sempre respeitando os filtros ativos.
- **Barra de ações `sticky top-18 z-20`**, visível só com seleção. O Header do app é
  `sticky top-0 h-16`: uma barra em `top-0` escorregaria para trás dele e sumiria ao rolar.
  Cada botão declara o alcance no rótulo — `Receber (104)`, `Desfazer (5)`. Alcance zero
  esconde o botão, em vez de exibi-lo desabilitado sem explicação. Quando houver seleção fora
  do filtro, a barra escreve `(5 fora do filtro não será afetado)`.
- **Diálogo de confirmação** (`Dialog`, `sm:max-w-md`): quantidade + **valor total** do lote,
  a linha do que fica de fora e — só no `receber` — o campo **Data do recebimento**, já
  preenchido com hoje. O botão de confirmar carrega o número: "Marcar 104 como recebidos".
- Ao concluir: `toast` com o resultado **devolvido pelo servidor** (não com a estimativa do
  client), limpa a seleção, `router.refresh()`.

## Critérios de aceite

1. Selecionar todos os 109 em aberto e marcar como recebido faz **uma** ação de servidor.
2. Selecionar 109, filtrar para 5 e confirmar altera **5** — e a tela avisa antes.
3. Seleção que mistura aberto e pago: `Receber` alcança só os não-pagos, e o diálogo declara
   quantos ficam de fora.
4. A data escolhida no diálogo é a que vai para `pago_em`.
5. O KPI "Total a receber" e a seção "Em aberto" refletem o lote depois do refresh.
6. `receivables-bulk.test.ts` cobre interseção, filtro por status, valor total e lote vazio.
7. Dark/light e responsividade preservados; a barra não se esconde atrás do Header.
