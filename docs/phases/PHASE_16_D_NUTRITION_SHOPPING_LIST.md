# Fase 16-D — Dieta e Alimentação · Lista de compras e despensa

> Quarta das **6 subfases** da Fase 16. **Depende das 16-A, 16-B e 16-C concluídas.**

## Contexto

Planejamento e receitas já existem; o passo natural é transformar o que foi planejado no que
precisa ser comprado. Esta subfase é a mais **mobile-first** do módulo: a lista é usada em pé,
no mercado, com uma mão.

## Objetivo

1. Listas de compras manuais e **geradas** a partir de dia, semana, planejamento ou receitas.
2. **Consolidação correta** de itens repetidos, sem somar unidades incompatíveis.
3. Agrupamento por categoria de mercado, filtros, ações em massa e duplicação.
4. **Despensa opcional** e simples, para descontar o que já se tem.

## Dependências

16-A (alimentos e medidas), 16-B (planejamento), 16-C (receitas e refeições-modelo).

## Escopo

### Dados
`nutrition_shopping_lists`, `nutrition_shopping_list_items`, `nutrition_pantry_items`,
`nutrition_market_categories` (seed: hortifruti, carnes, frios e laticínios, grãos e
cereais, padaria, bebidas, suplementos, congelados, temperos, outros).

### Item da lista
Item, quantidade, unidade, categoria, marca opcional, preço estimado, preço real, loja,
observação, **status** (`pendente|no_carrinho|comprado|indisponivel|removido`), **origem**
(de quais refeições/receitas veio) e prioridade.

### Funcionalidades
Criar manual; gerar de dia/semana/planejamento/receitas selecionadas; duplicar lista;
lista recorrente; marcar/desmarcar comprado; editar quantidade; reordenar; mover categoria;
duplicar item; seleção múltipla com exclusão e marcação em massa; exportar/imprimir;
filtrar por status, categoria, loja e origem; pesquisar.

### Despensa
Item, quantidade disponível, unidade, validade, estoque mínimo, observação. Ao gerar a
lista, **opcionalmente** desconta o estoque. **Não é um ERP de estoque.**

## Fora do escopo

| Item | Onde entra |
| --- | --- |
| Relatório de gasto com mercado x financeiro | **16-E** (e, se virar lançamento, é decisão explícita do usuário) |
| Notificação de item de despensa vencendo | **16-F** |
| Compartilhamento externo da lista (link público) | **Nunca** — dado pessoal não fica público. Exportar/imprimir sim. |

## Regras de negócio

1. **Consolidação só soma o que é somável.** Mesma unidade → soma. Unidades com conversão
   confiável (g↔kg, ml↔L, medida caseira com gramas) → converte e soma. **Sem conversão
   confiável → linhas separadas**, com aviso. Nunca estimar.
2. **Rastreabilidade da origem:** cada item mostra de quais refeições/receitas veio; ao
   ajustar a quantidade manualmente, o item marca `quantity_overridden`.
3. **Desconto da despensa é opt-in** e mostrado antes de aplicar.
4. **Excluir é sempre confirmado**; a ação padrão em massa é marcar/desmarcar, não excluir.
5. **Ação em massa não afeta registro fora do filtro atual.**
6. **Lista recorrente** não gera duplicata: chave determinística por período.

## Plano de implementação

1. Migrations (4 tabelas) + seed das categorias de mercado.
2. Puro: `src/lib/nutrition/shopping.ts` — consolidação, conversão, agrupamento, desconto de
   despensa. Testes.
3. Validators, queries, actions.
4. UI `/nutricao/compras`: desktop com tabela e mobile com lista de toque grande, checkbox
   amplo, sem dependência de hover.
5. Verificação + documentação.

## Critérios de aceite

- [ ] Crio lista manual e gero lista a partir de dia, semana, planejamento e receitas.
- [ ] Itens iguais são consolidados; unidades incompatíveis **não** são somadas.
- [ ] Vejo de quais refeições/receitas cada item veio e ajusto a quantidade.
- [ ] Desconto o que já tenho na despensa (opcional e visível antes de aplicar).
- [ ] Marco comprado/desmarco, edito, reordeno, movo categoria, duplico item e lista.
- [ ] Seleciono vários e excluo/marco em massa, com confirmação para excluir.
- [ ] Filtro por status, categoria, loja e origem; pesquiso; exporto/imprimo.
- [ ] A lista é confortável de usar no celular, no mercado.
- [ ] Dark/light, responsivo, pt-BR; suíte, lint, tsc e build verdes.

## Testes obrigatórios

Geração por planejamento; consolidação de itens iguais; conversão compatível (g/kg, ml/L,
medida caseira); **unidades incompatíveis mantidas separadas**; desconto de despensa
(parcial, total, maior que o necessário); duplicação de lista; exclusão em massa; marcação
em massa; lista recorrente sem duplicar.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Somar "2 unidades" com "300 g" | Função pura recusa e devolve linhas separadas + aviso. Teste dedicado. |
| Perder o ajuste manual ao regerar a lista | `quantity_overridden` preserva o valor do usuário. |
| Despensa virar controle de estoque complexo | Escopo travado nos 6 campos; nada de movimentação/entrada/saída. |

## Arquivos de documentação a atualizar

Os mesmos da 16-A.

## Instruções para o próximo agente

Próxima: **16-E** (`docs/phases/PHASE_16_E_NUTRITION_MEASUREMENTS_REPORTS.md`).
As **fotos de evolução são o dado mais sensível do módulo**: bucket privado, URL assinada de
vida curta, validação de tipo e tamanho, policy por pasta `{user_id}/…`. Nunca URL pública.
