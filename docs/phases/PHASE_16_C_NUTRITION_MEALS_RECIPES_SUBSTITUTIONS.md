# Fase 16-C — Dieta e Alimentação · Receitas, refeições-modelo e substituições

> Terceira das **6 subfases** da Fase 16. **Depende das 16-A e 16-B concluídas.**

## Contexto

Com catálogo (A) e diário/planejamento (B) prontos, o registro ainda é item a item. Esta
subfase entrega as três abstrações que tornam o uso diário rápido: **receita** (preparação),
**refeição-modelo** (conjunto reutilizável) e **substituição** (alternativa comparável).

## Objetivo

1. **Receitas** com cálculo nutricional correto, incluindo rendimento e perda/ganho de peso
   no preparo.
2. **Refeições-modelo** reutilizáveis, adicionáveis ao dia e à semana com um clique.
3. **Substituições** com comparação nutricional explícita antes de confirmar, e histórico.
4. **Duplicação e ações em massa** em todos os submódulos desta subfase.

## Dependências

16-A (catálogo, `calc.ts`, `units.ts`), 16-B (diário, planejamento, snapshot).

## Escopo

### Dados
`nutrition_recipes`, `nutrition_recipe_ingredients`, `nutrition_recipe_categories`,
`nutrition_meal_templates`, `nutrition_meal_template_items`,
`nutrition_substitution_groups`, `nutrition_substitution_options`,
`nutrition_substitution_logs`.

### Receitas
Nome, descrição, categoria, modo de preparo, tempo, rendimento, número de porções, **peso
final preparado**, foto (bucket privado, reusando `attachments`), tags, favorito,
observações, fonte, ingredientes com quantidade e unidade.

Cálculo: nutrientes da receita inteira (**soma dos ingredientes**), por porção e **por
100 g** (usando o **peso final informado**, não a soma dos crus). Alterar rendimento
recalcula por porção sem alterar o total.

### Refeições-modelo
Nome, tipo de refeição, descrição, horário sugerido, alimentos **e receitas**, quantidades,
tags, categoria, favorito, observações + totais calculados.

### Substituições
Dois níveis: **refeição inteira** e **alimento individual**. Grupo com nome, tipo, item
original, alternativas com quantidade sugerida e prioridade, tolerâncias por macro,
restrições, observações.

Antes de confirmar, a tela mostra: original × alternativa, diferença de kcal/P/C/G/fibra,
**impacto no total do dia** e o que resta da meta depois da troca. **O usuário confirma.**

## Fora do escopo

| Item | Onde entra |
| --- | --- |
| Lista de compras a partir de receitas | **16-D** (aqui só a ação "gerar itens" é preparada) |
| Relatórios de "substituições mais realizadas" | **16-E** |
| Busca global / lançamento rápido de receita | **16-F** |
| Sugestão automática por IA/heurística nova | **Nunca.** A sugestão só usa substituições já aprovadas pelo usuário, itens cadastrados e faixas configuradas. |

## Modelagem

- `nutrition_recipes.total_weight_g` (peso final preparado) é **informado**, não deduzido.
  Se ausente, "por 100 g" fica indisponível e a UI explica — não estimamos.
- `nutrition_recipe_ingredients` guarda `food_id`, `quantity`, `measure_id`,
  `grams_equivalent`, `is_optional`, `position`, `note`.
- Ao adicionar receita ao diário, o snapshot da 16-B é gerado **a partir do cálculo da
  receita naquele instante** — mesmo caminho de gravação, sem duplicar lógica.
- `nutrition_substitution_logs`: item original, substituto, quantidades, diferença
  nutricional, data, refeição, motivo opcional.

## Regras de negócio

1. **Total da receita = soma dos ingredientes.** A concentração por 100 g usa o **peso
   final**. Sem peso final → sem "por 100 g".
2. **Perda/ganho no preparo é declarado**, nunca inferido.
3. **Ingrediente sem um nutriente não zera o total** — propaga estado parcial (regra da B).
4. **Substituir exige confirmação** e grava histórico. Nada troca sozinho.
5. **Nenhuma equivalência clínica é afirmada.** A UI compara números; não diz que é
   "equivalente nutricionalmente" nem prescreve.
6. **Duplicar** cria novo identificador, marca como cópia, permite editar antes de salvar e
   **não** copia histórico de consumo nem logs.
7. **Ações em massa** com contagem, escopo visível, confirmação para excluir e preferência
   por arquivar.

## Plano de implementação

1. Migrations (8 tabelas) + storage da foto de receita reusando o bucket `attachments`.
2. Puros: `src/lib/nutrition/recipe.ts` (totais, por porção, por 100 g, rendimento) e
   `substitution.ts` (diferença nutricional, tolerância, impacto no dia).
3. Validators, queries, actions.
4. UI: `/nutricao/receitas`, `/nutricao/refeicoes`, `/nutricao/substituicoes`.
5. Verificação + documentação.

## Critérios de aceite

- [ ] Crio, edito, duplico, favorito, arquivo e excluo receita; excluo em massa; exporto.
- [ ] A receita calcula total, por porção e por 100 g com o peso final informado.
- [ ] Alterar o rendimento recalcula por porção sem alterar o total.
- [ ] Crio refeição-modelo com alimentos e receitas e a adiciono ao dia e à semana.
- [ ] Transformo receita em refeição-modelo.
- [ ] Cadastro grupos de substituição de refeição e de alimento.
- [ ] Antes de confirmar a substituição, vejo a diferença nutricional e o impacto no dia.
- [ ] O histórico de substituições registra o que mudou, quando e por quê.
- [ ] Dark/light, responsivo, pt-BR; suíte, lint, tsc e build verdes.

## Testes obrigatórios

Receita inteira / por porção / por 100 g; alteração de rendimento; peso final ausente;
ingrediente com nutriente indisponível; substituição de alimento e de refeição; diferença
nutricional; tolerância dentro/fora; impacto no total diário; duplicação sem herdar
histórico; não duplicação de consumo ao adicionar modelo duas vezes.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Estimar peso final da receita | Proibido: sem peso final, "por 100 g" fica indisponível com explicação. |
| Sugerir substituição como equivalência clínica | Linguagem revisada; a tela mostra números e um aviso de que não substitui orientação profissional. |
| Duplicar lógica de gravação no diário | Receita/modelo entram pelo **mesmo** caminho de snapshot da 16-B. |

## Arquivos de documentação a atualizar

Os mesmos da 16-A.

## Instruções para o próximo agente

Próxima: **16-D** (`docs/phases/PHASE_16_D_NUTRITION_SHOPPING_LIST.md`).
A consolidação da lista **não pode somar unidades incompatíveis** — reuse `units.ts` e trate
conversão impossível como item separado, não como estimativa.
