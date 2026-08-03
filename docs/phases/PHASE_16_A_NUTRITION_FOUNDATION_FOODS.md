# Fase 16-A — Dieta e Alimentação · Fundação, núcleo de cálculo e catálogo de alimentos

> Primeira das **6 subfases** da Fase 16 (Módulo Dieta e Alimentação).
> Leia antes: `docs/project/PROJECT_BRIEFING.md`, `PROJECT_RULES.md`,
> `PROJECT_ARCHITECTURE.md`, `PROJECT_ROADMAP.md`, `CURRENT_STATUS.md`,
> `docs/handoff/LAST_PHASE_SUMMARY.md`, `docs/handoff/NEXT_AGENT_INSTRUCTIONS.md`.

## Contexto

O sistema está em modo manutenção com 15 fases concluídas. O usuário pediu um **módulo
central novo** de Dieta e Alimentação, grande o bastante para exigir subfases. Esta é a
**fundação**: sem um catálogo de alimentos confiável e sem um núcleo de cálculo testado,
diário, planejamento, receitas, substituições e relatórios não têm em que se apoiar.

A restrição mais dura da subfase é de **integridade de dado**, não de UI: o usuário
determinou que **não se inventa valor nutricional**, que **valor ausente não vira zero**,
que **toda fonte é registrada** e que **a base não pode ser substituída por dado fictício**.
Isso define a modelagem inteira.

## Objetivo

Entregar:
1. A **fundação do módulo** — rota `/nutricao`, item na sidebar, navegação interna com os
   12 submódulos (os ainda não implementados aparecem honestamente marcados).
2. O **núcleo de cálculo nutricional puro e testado** (conversão de medidas, regra de
   100 g/100 ml, estados de valor, somatórios, arredondamento só na apresentação).
3. O **catálogo de alimentos completo** — CRUD, medidas caseiras, categorias, tags,
   favoritos, arquivamento, duplicação, filtros combináveis, ações em massa e exportação.
4. Uma **base brasileira real e verificável**, com pipeline de importação versionado.

## Dependências

- Fase 01 — design system (preto/branco/dourado, dark/light), `PageHeader`, `EmptyState`,
  `StatCard`, componentes `ui/`.
- Fase 14 — `settings` (preferências), padrão de exportação, auditoria de RLS.
- Fase 15 — padrão de módulo com **navegação interna própria** (`/todo`), reuso de
  `SortableList`, `ActionResult`, `authContext`.
- Supabase MCP no projeto `yjvnlbjvippefvzgrxxw` para `apply_migration` +
  `generate_typescript_types`.

## Escopo

### Dados (11 objetos novos)
`nutrition_nutrients`, `nutrition_food_sources`, `nutrition_food_categories`,
`nutrition_foods`, `nutrition_food_nutrients`, `nutrition_food_measures`,
`nutrition_food_prefs`, `nutrition_food_tags`, `nutrition_food_tag_links`,
`nutrition_import_batches` + a view `nutrition_foods_view`.

### Núcleo de cálculo (puro, testado)
- `src/lib/nutrition/units.ts` — conversão medida → gramas/ml, medida-base, validação de
  conversão impossível.
- `src/lib/nutrition/calc.ts` — nutriente por quantidade, soma de itens, estados de valor,
  energia declarada × estimada por macros, arredondamento de apresentação.
- `src/lib/nutrition/constants.ts` — enums, rótulos pt-BR, ordem de exibição.
- `src/lib/nutrition/filters.ts` — filtro/ordenação/agrupamento do catálogo (puro).

### Catálogo (UI)
- `/nutricao` — visão geral do módulo (nesta subfase: estado real do catálogo + atalhos;
  os indicadores do dia chegam na Subfase B, quando existir diário).
- `/nutricao/alimentos` — lista, busca, filtros combináveis, seleção múltipla, ações em
  massa, criar/editar/duplicar/arquivar/excluir, detalhe com todos os nutrientes e medidas.

### Pipeline da base brasileira
- Script de build que lê o **XLSX oficial da TACO 4ª edição** e gera um dataset normalizado
  versionado, com checksum e manifesto.
- Migration de seed idempotente gerada a partir do dataset.
- Arquivo de atribuição com a licença e a forma de citação.

## Fora do escopo (registrado, não silenciado)

| Item | Onde entra |
| --- | --- |
| Diário alimentar, refeição consumida, totais do dia | **Subfase B** |
| Metas nutricionais e planejamento | **Subfase B** |
| Receitas, refeições-modelo, substituições | **Subfase C** |
| Lista de compras e despensa | **Subfase D** |
| Medidas corporais, fotos, relatórios | **Subfase E** |
| Busca global, lançamento rápido, notificações, cards no dashboard geral | **Subfase F** |
| **Leitura de código de barras pela câmera** | Subfase F. Nesta subfase existe o **campo** `barcode`, a busca por código e o cadastro manual do produto. |
| **Medidas caseiras oficiais em massa** (colher de sopa de arroz = X g) | A estrutura, a UI e o cálculo ficam prontos aqui, mas **não seedamos valores inventados**: a TACO 4 não publica medidas caseiras por alimento. O pipeline aceita uma segunda fonte (ex.: tabela de medidas referidas do IBGE/POF) — ver "Riscos". |
| Micronutrientes na tela de metas | Subfase B/E |

## Modelagem

Prefixo `nutrition_*`. Todas as tabelas com **RLS + FORCE RLS**, índice em `user_id`,
trigger `set_updated_at` e migrations idempetentes.

### Regra de propriedade: `user_id` nulo = linha global
Três tabelas aceitam `user_id` **nulo** (`nutrition_foods`, `nutrition_food_nutrients`,
`nutrition_food_measures`, `nutrition_food_categories`, `nutrition_food_sources`).
Linha global = **base do sistema, somente leitura**. As policies são **separadas por
comando** (não `for all`):

```sql
-- lê o que é meu + o que é global
create policy "select own or global" ... for select using (user_id = auth.uid() or user_id is null);
-- escreve SÓ o que é meu (global fica inalterável)
create policy "insert own" ... for insert with check (user_id = auth.uid());
create policy "update own" ... for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own" ... for delete using (user_id = auth.uid());
```

`nutrition_nutrients` é **catálogo de referência puramente global**: RLS ligada, `select`
liberado para `authenticated`, **nenhuma** policy de escrita (ninguém escreve pelo app).

### Tabelas

**`nutrition_nutrients`** — definição do nutriente (o que permite não ter uma coluna por
nutriente). `code` (único), `name`, `unit` (`kcal|kJ|g|mg|mcg`), `nutrient_group`
(`energia|macro|carboidrato|lipidio|mineral|vitamina|aminoacido|outro`), `position`,
`is_core` (aparece nos resumos), `precision`.

**`nutrition_food_sources`** — `code`, `name`, `publisher`, `edition`, `version`,
`reference_url`, `license_note`, `citation`, `obtained_at`, `is_official`.

**`nutrition_food_categories`** — `name`, `slug`, `parent_id`, `position`, `color`, `icon`.

**`nutrition_foods`** — `source_id`, `source_food_code`, `source_version`, `name`,
`alternative_name`, `brand`, `barcode`, `category_id`, `food_type`
(`alimento|industrializado|suplemento|bebida|ingrediente|preparacao`), `preparation_state`
(`nao_informado|cru|cozido|assado|grelhado|frito|refogado|drenado|pronto|congelado|desidratado|enlatado`),
`base_quantity` (default 100), `base_unit` (`g|ml`), `edible_portion_percent`,
`data_quality` (`analitico|calculado|estimado|rotulo|desconhecido`), `is_system_food`,
`is_verified`, `last_verified_at`, `notes`, `origin_food_id` (referência à origem quando é
cópia pessoal), `archived_at`.
Índice único parcial `(source_id, source_food_code) where user_id is null` → **o seed é
idempotente e reimportável**.

**`nutrition_food_nutrients`** — `food_id`, `nutrient_id`, `amount numeric(16,6)` (**nulo
quando não há valor**), `value_state` (`disponivel|traco|nao_disponivel|nao_aplicavel`),
`method` (`analitico|calculado|estimado|rotulo|desconhecido`), `source_note`.
Único `(food_id, nutrient_id)`. **Zero e "não disponível" são coisas diferentes** e nunca
se confundem: `amount = 0, value_state = 'disponivel'` ≠ `amount = null,
value_state = 'nao_disponivel'`.

**`nutrition_food_measures`** — medida caseira com conversão **real por alimento**:
`label`, `unit_type` (`peso|volume|unidade`), `grams`, `milliliters`, `is_default`,
`position`, `source_note`. Sem conversão genérica compartilhada entre alimentos.

**`nutrition_food_prefs`** — preferência do usuário **sobre qualquer alimento**, inclusive
os globais (que ele não pode editar): `is_favorite`, `archived_at`, `use_count`,
`last_used_at`, `custom_note`. Único `(user_id, food_id)`.

**`nutrition_food_tags`** / **`nutrition_food_tag_links`** — etiquetas do usuário.

**`nutrition_import_batches`** — auditoria de cada carga da base: `source_id`,
`source_version`, `file_name`, `file_checksum`, `rows_total`, `rows_imported`,
`rows_skipped`, `rows_failed`, `status`, `report jsonb`, `started_at`, `finished_at`.

**View `nutrition_foods_view`** (`security_invoker = true`) — pivota os nutrientes quentes
(kcal, proteína, carboidrato, lipídios, fibra, sódio, açúcar, saturada) para permitir
ordenar/filtrar por faixa sem N+1. **Derivação, não segunda fonte de verdade**: a única
fonte é `nutrition_food_nutrients`.

## Regras de negócio

1. **Nunca inventar valor nutricional.** Célula ausente na fonte → `amount = null` +
   `value_state = 'nao_disponivel'`. `Tr` da TACO → `value_state = 'traco'` (o cálculo trata
   traço como 0 **e sinaliza** na UI). `NA` → `nao_aplicavel`.
2. **Alimento do sistema é somente leitura.** A UI não oferece editar; a policy impede no
   banco. Duplicar cria cópia pessoal com `origin_food_id` preenchido.
3. **Cru ≠ preparado.** `preparation_state` faz parte da identidade do alimento; a UI
   sempre exibe o estado junto do nome.
4. **Base de cálculo explícita.** Todo alimento declara `base_quantity` + `base_unit`.
   A conversão é `nutriente = amount × gramas_consumidos ÷ base_quantity`.
5. **Sem arredondamento intermediário.** Só a camada de apresentação arredonda, com casas
   decimais por nutriente (`nutrition_nutrients.precision`).
6. **Conversão impossível não é estimada.** Alimento em `ml` sem densidade não vira gramas
   por chute — a função pura devolve um erro tipado e a UI explica.
7. **Excluir alimento é bloqueado quando há uso.** Nesta subfase ainda não há consumo; a
   regra é implementada na função pura e reforçada nas subfases seguintes.
8. **Ação em massa nunca extrapola o filtro atual** e nunca exclui sem confirmação; a ação
   padrão é **arquivar**, não excluir.

## Plano de implementação

1. Migrations (11 arquivos + view), aplicadas via MCP; `get_advisors` sem lint de schema;
   `src/types/supabase.ts` regenerado.
2. Seed de referência: 48 nutrientes, categorias da TACO, fontes.
3. Núcleo puro + testes Vitest (co-localizados, ambiente node, sem `Date.now()`).
4. Pipeline: `scripts/nutrition/build-taco-dataset.mjs` (XLSX oficial → JSON versionado +
   manifesto com checksum) e `scripts/nutrition/generate-taco-migration.mjs`
   (JSON → migration idempotente).
5. Validators Zod + queries server-only + Server Actions.
6. UI: navegação interna, visão geral, catálogo, formulário, detalhe.
7. Verificação: `test:run` + `lint` + `tsc --noEmit` + `build`.
8. Documentação e handoff.

## Critérios de aceite

- [ ] Existe o item **Dieta e Alimentação** na sidebar, abrindo `/nutricao`.
- [ ] A navegação interna lista os 12 submódulos e funciona no desktop e no celular.
- [ ] Consigo pesquisar, filtrar (categoria, tipo, fonte, marca, preparo, favoritos,
      personalizados, base do sistema, com/sem código de barras, faixa de kcal e de
      proteína), ordenar e combinar filtros, com contagem de resultados.
- [ ] Consigo criar, editar, duplicar, favoritar, arquivar, restaurar e excluir alimento.
- [ ] Alimento da base do sistema é **somente leitura** e duplicar gera cópia editável com
      referência à origem.
- [ ] Consigo cadastrar **medidas caseiras com conversão real** e escolher a padrão.
- [ ] O detalhe do alimento mostra **todos** os nutrientes com unidade e **estado do valor**,
      distinguindo zero de "não disponível" e de "traço".
- [ ] Todo alimento exibe **fonte, versão, código original e data de verificação**.
- [ ] Existem **597 alimentos** da TACO 4ª edição, com atribuição visível.
- [ ] Ações em massa (favoritar, arquivar, mudar categoria, excluir, exportar) respeitam o
      filtro e pedem confirmação para excluir.
- [ ] RLS funciona: nenhuma escrita em linha global; nenhum acesso a dado de outro usuário.
- [ ] Dark e light corretos; responsivo; pt-BR.
- [ ] `npm run test:run`, `npm run lint`, `npx tsc --noEmit` e `npm run build` passam e
      **nenhuma fase anterior quebrou**.

## Testes obrigatórios (puros, Vitest)

- Conversão: g↔g, ml↔ml, medida caseira → gramas, medida por unidade, medida sem conversão
  (erro tipado), medida com `grams` e `milliliters`.
- Cálculo: nutriente por 100 g, por porção, por medida caseira, base ≠ 100.
- Estados: `nao_disponivel` não vira 0 no total (propaga "parcial"); `traco` conta como 0
  mas marca o total como aproximado; `nao_aplicavel` é ignorado.
- Soma: por item, por lista, mistura de estados, alimento sem o nutriente.
- Energia: declarada preservada; estimada por macros calculada à parte; divergência
  detectada acima do limiar.
- Arredondamento: só na apresentação; casas por nutriente; sem arredondar intermediário.
- Filtros: combinação, faixa numérica, favoritos, arquivados, contagem.

## Riscos

| Risco | Mitigação |
| --- | --- |
| **Inventar dado nutricional** (o pior risco do módulo) | Nenhum valor é digitado à mão: tudo vem do XLSX oficial via script determinístico, com checksum no manifesto. Célula vazia vira `null`, nunca `0`. |
| **Licença da fonte** | TACO 4ª ed. declara literalmente *"É permitida a reprodução parcial ou total desta obra, desde que citada a fonte"*. Atribuição em `data/nutrition/taco-4/ATTRIBUTION.md` + na UI. **Não** houve scraping: o arquivo é o publicado pelo NEPA para download. |
| **Medidas caseiras** | A TACO não publica medida caseira por alimento. **Não inventamos.** Estrutura + UI + cálculo prontos; o usuário cadastra as suas e o pipeline aceita uma segunda fonte oficial depois. Registrado em "Fora do escopo". |
| Tabela normalizada ficar lenta | View de pivô `nutrition_foods_view` + índices `(food_id, nutrient_id)` e `(user_id, name)`. |
| Duas fontes de verdade de nutriente | Proibido materializar nutriente em coluna de `nutrition_foods`; o pivô é **view**. |
| Migration de seed grande | Gerada por script, idempotente (`on conflict do update`), reexecutável. |

## Arquivos de documentação a atualizar ao concluir

`docs/project/PROJECT_BRIEFING.md`, `PROJECT_ARCHITECTURE.md`, `PROJECT_ROADMAP.md`,
`CURRENT_STATUS.md`, `docs/handoff/LAST_PHASE_SUMMARY.md`,
`docs/handoff/NEXT_AGENT_INSTRUCTIONS.md`.

## Instruções para o próximo agente

Próxima subfase: **16-B — Metas, diário alimentar e planejamento**
(`docs/phases/PHASE_16_B_NUTRITION_DIARY_PLANNING.md`).

Antes de escrever qualquer linha:
1. Leia `src/lib/nutrition/calc.ts` e `units.ts` — **reuse**, não reescreva. Todo total do
   diário sai dali.
2. O consumo **precisa gravar snapshot** (regra 25 do pedido original): quantidade, unidade,
   conversão em gramas, nutrientes, fonte e versão do alimento. Editar alimento não muda
   o passado.
3. `atrasada`/`pendente` de refeição é **derivado na leitura**, como em todo o resto do
   sistema. Não persista status derivado.
4. Data pura `'yyyy-MM-dd'` para o dia do diário; hora em coluna `time`. Nunca timestamptz
   para representar "o dia".
5. Não duplique a água — leia do módulo Hábitos.
