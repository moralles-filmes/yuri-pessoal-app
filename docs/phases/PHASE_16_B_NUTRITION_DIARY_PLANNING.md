# Fase 16-B — Dieta e Alimentação · Metas, diário alimentar e planejamento

> Segunda das **6 subfases** da Fase 16. **Depende da 16-A concluída.**

## Contexto

A 16-A entregou o catálogo de alimentos e o núcleo de cálculo puro, mas o sistema ainda não
sabe **o que o usuário comeu**. Esta subfase transforma o catálogo em uso diário: metas,
registro do consumo, comparação planejado × consumido e a visão geral do módulo com os
indicadores do dia.

É aqui que nasce a regra mais sensível do módulo inteiro: **o histórico não pode mudar
quando um alimento é editado**.

## Objetivo

1. **Metas nutricionais** com histórico datado e distribuição por refeição.
2. **Diário alimentar** completo — registro rápido, edição de quantidade, status por
   refeição, observação e horário real.
3. **Planejamento** diário e semanal, com modelos de semana e recorrência.
4. **Visão geral** do módulo com os indicadores reais do dia e da semana.

## Dependências

- **16-A** — `nutrition_foods`, `nutrition_food_measures`, `nutrition_food_nutrients`,
  `src/lib/nutrition/{units,calc,constants,filters}.ts`.
- Fase 10 (Hábitos) — leitura da água, sem duplicar a fonte de verdade.
- Fase 15 — padrão de recorrência pura em `Date.UTC` (`src/lib/todo/recurrence.ts`) como
  **referência de estilo**; a recorrência de planejamento é própria e mais simples.

## Escopo

### Metas
- `nutrition_profiles` — perfil nutricional do usuário (dados que ele mesmo informa).
- `nutrition_goal_periods` — meta vigente por período (`starts_on`/`ends_on`, motivo,
  tipo `fixa|por_dia_semana|treino_descanso|periodo`).
- `nutrition_goal_items` — valor por nutriente e, opcionalmente, por dia da semana, por
  tipo de dia (treino/descanso) e **por refeição** (percentual ou valor).

### Diário
- `nutrition_meal_types` — tipos de refeição (seed: café da manhã, lanche da manhã, almoço,
  lanche da tarde, jantar, ceia, refeição livre, outros), **criáveis, editáveis,
  reordenáveis e desativáveis** pelo usuário.
- `nutrition_diary_meals` — a refeição de um dia (`diary_date` **data pura**,
  `planned_time`, `consumed_time`, `status`, `notes`, vínculo com a refeição planejada).
- `nutrition_diary_entries` — o item consumido, com **snapshot nutricional imutável**.

### Planejamento
- `nutrition_plans`, `nutrition_plan_days`, `nutrition_planned_meals`,
  `nutrition_planned_meal_items` — modelos de semana, aplicação a um período, recorrência.

### UI
- `/nutricao` — visão geral real (indicadores do dia, distribuição, próximas refeições,
  ações rápidas).
- `/nutricao/diario` — hoje, dia anterior/próximo, dia escolhido, semana, histórico,
  calendário mensal com indicadores.
- `/nutricao/planejamento` — diário, semanal, calendário, lista, modelos.
- `/nutricao/metas` — metas, distribuição por refeição, histórico.

## Fora do escopo

| Item | Onde entra |
| --- | --- |
| Receitas e refeições-modelo como item do diário | **16-C** (o diário aceita alimento nesta subfase; receita/modelo entram na C) |
| Substituição de refeição/alimento com comparação | **16-C** |
| Lista de compras gerada do planejamento | **16-D** |
| Relatórios de período e exportação | **16-E** |
| Notificação de refeição pendente, busca global, lançamento rápido | **16-F** |

## Modelagem

### Snapshot histórico (regra central)
`nutrition_diary_entries` guarda, **no momento do registro**:
`food_id` (referência informativa, pode virar nulo), `food_name_snapshot`,
`preparation_state_snapshot`, `brand_snapshot`, `quantity`, `measure_label`,
`grams_equivalent`, `base_quantity`/`base_unit`, `source_id_snapshot`,
`source_version_snapshot`, `nutrients_snapshot jsonb` (código → `{amount, state, unit}`),
`energy_kcal`, `protein_g`, `carb_g`, `fat_g`, `fiber_g` (colunas quentes, derivadas do
snapshot **no ato da gravação** — não recalculadas depois).

> Editar ou excluir o alimento no catálogo **não** altera nenhum registro passado.

### Planejado × consumido
Nunca se sobrescreve o planejamento. `nutrition_planned_meal_items` permanece intacto;
`nutrition_diary_entries` carrega `planned_item_id` e `change_kind`
(`igual|quantidade_ajustada|substituido|removido|extra`) + `changed_at`. A diferença
nutricional é **derivada na leitura**.

### Status da refeição
`planejada | pendente | consumida | parcialmente_consumida | substituida | nao_consumida |
fora_do_planejamento`. `pendente` e o atraso são **derivados** de `planned_time` + hora
atual; **nunca gravados**.

## Regras de negócio

1. **Snapshot imutável** — ver acima. Sem exceção.
2. **Planejamento preservado** — registro de consumo cria/edita entradas do diário, nunca
   apaga o planejado.
3. **Status derivado na leitura**, como em fatura (F03), tarefa (F09) e TO-DO (F15).
4. **Alterar meta não muda relatório antigo** — a meta de um dia é a vigente **naquele
   dia** (`nutrition_goal_periods` por data).
5. **Recorrência de planejamento** com escolha explícita de escopo ao editar: *somente este
   dia* / *este dia e os próximos* / *todo o modelo*.
6. **Total do dia** = soma dos snapshots, com propagação do estado (se algum item tem
   nutriente `nao_disponivel`, o total daquele nutriente é marcado como **parcial** e a UI
   diz isso — não finge precisão).
7. **Água não é duplicada** — lida de `habit_logs`.
8. **Segurança nutricional:** nenhuma meta é definida automaticamente. Se houver estimador
   (ex.: gasto energético), ele é **opcional**, mostra a fórmula, se identifica como
   estimativa e exige confirmação. Sem diagnóstico, sem prescrição.

## Plano de implementação

1. Migrations das 9 tabelas + seed dos tipos de refeição.
2. Puros: `src/lib/nutrition/goals.ts` (meta vigente por data, distribuição por refeição,
   restante), `diary.ts` (totais, status derivado, planejado × consumido),
   `plan-recurrence.ts`.
3. Validators + queries + actions.
4. UI dos 4 submódulos + visão geral.
5. Verificação + documentação.

## Critérios de aceite

- [ ] Configuro metas de kcal, proteína, carboidrato, gordura, fibra, sódio e açúcar.
- [ ] Configuro metas diferentes por dia da semana e para dia de treino/descanso.
- [ ] Distribuo a meta por refeição (percentual ou valor).
- [ ] Vejo calorias e macros do dia, meta, restante e percentual de aderência.
- [ ] Planejo refeições de um dia e de uma semana; copio dia; duplico semana; aplico modelo.
- [ ] Registro o que consumi; ajusto quantidade; removo item; adiciono extra; marco
      parcialmente consumida e não consumida; registro horário real e observação.
- [ ] Vejo lado a lado o planejado e o consumido, com a diferença nutricional.
- [ ] Editar um alimento **não** altera nenhum registro do passado.
- [ ] Alterar a meta **não** altera períodos anteriores.
- [ ] Dark/light, responsivo, pt-BR; suíte, lint, tsc e build verdes.

## Testes obrigatórios

Snapshot (gravação e imutabilidade), totais por refeição/dia/semana, meta vigente por data,
distribuição por refeição, restante e aderência, planejado × consumido (integral, parcial,
não consumida, item removido, item extra), propagação de estado parcial, recorrência de
planejamento e edição por escopo, virada de mês/ano.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Recalcular totais a partir do catálogo atual (quebra o histórico) | O total **sempre** vem do snapshot. Teste explícito editando o alimento e conferindo o passado. |
| Sobrescrever o planejamento ao registrar consumo | Tabelas separadas + `planned_item_id`; teste de preservação. |
| Duplicar consumo ao confirmar refeição duas vezes | Unique por `(user_id, diary_meal_id, planned_item_id)` + idempotência na action. |
| Fuso "virar o dia" | Data pura `'yyyy-MM-dd'`, `hojeISO()`, hora em `time`. |

## Arquivos de documentação a atualizar

Os mesmos da 16-A.

## Instruções para o próximo agente

Próxima: **16-C** (`docs/phases/PHASE_16_C_NUTRITION_MEALS_RECIPES_SUBSTITUTIONS.md`).
Receita e refeição-modelo **viram itens do diário reusando o mesmo snapshot** — não crie um
segundo caminho de gravação.
