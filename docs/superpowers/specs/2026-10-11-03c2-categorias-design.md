# Design — REDESIGN-03-C2: categorias, marcação de terceiros como atalho e filtro (E7/D8)

> Desenhado com o dono em **2026-10-11**, antes de qualquer linha de código. Escopo declarado em
> `docs/redesign/PLANO.md` (linha 66), `METRICAS-FINANCEIRAS.md` §10 (E7) e §11 (D8, D10) e
> `MIGRATIONS.md` (M3).
>
> **Base:** `ade0dd0`, ponta de `feat/redesign-00-auditoria` com a 03-C integrada
> (`git merge-base --is-ancestor 0dd3619 feat/redesign-00-auditoria` = 0). A primeira conferência,
> no início da sessão, deu 1 (a branch ainda estava em `6c8aeab`); a frente principal integrou a
> 03-C (`22ec12f`, `ade0dd0`) e só então a branch `feat/redesign-03c2-categorias` nasceu, sem
> upstream.
>
> Depois de aprovado, este documento é o contrato: quem discordar de algo aqui para e reporta.
>
> ⛔ O "aprovado" deste desenho **não** é o "aplique a M3". São duas autorizações separadas.

---

## 1. O que a 03-C2 muda de natureza

Até aqui a categoria dizia o tipo (`kind`) e o rótulo. A 03-C2 dá a ela uma **opinião** sobre de
quem costuma ser o dinheiro — `categories.classificacao_padrao` —, e a subfase inteira existe
para essa opinião **nunca virar fato**:

- a categoria **propõe**, na tela, num lançamento **novo**;
- o lançamento **registra** no ato (`classificacao` + `valor_pessoal`, desde a 03-C);
- motor, pipeline, relatórios, dashboards, IA, sino e `import/split-totals.ts` **nunca** leem a
  marcação.

⛔ **Nada é marcado sozinho.** A migration não marca categoria nenhuma, e "Restaurar padrão"
também não. A categoria de terceiros do §1 do dicionário quem marca é o dono, pela tela.

⛔ **Nada é reclassificado (D10).** O atalho só age em lançamento novo, e o filtro só peneira.

**Esta subfase não tem Parte B.** Com ou sem marcação, todo número de toda tela continua igual.
Se a execução concluir que algum número muda, ela para: é sinal de que a categoria começou a
decidir.

---

## 2. Linha de base

### 2.1 Banco — medido em 2026-10-11, só leitura

Contagens por `count(*)` agrupado; nenhum nome, nenhum valor.

| Recorte | Contagem |
| --- | --- |
| Categorias | **26** |
| … `kind = 'despesa'` | 19 |
| … `kind = 'receita'` | 6 |
| … `kind = 'ambos'` | 1 |
| Coluna `categories.classificacao_padrao` | **não existe** |
| Receitas | **48** |
| … `classificacao = 'pessoal'` | 48 |
| … `valor_pessoal` não nulo | **0** |
| Receitas em categoria `receita` | 45 |
| Receitas sem categoria | 3 |
| Receitas em categoria `ambos` | **0** (a única `ambos` tem 23 despesas e nenhuma receita) |

Igual às referências (26 em 2026-09-20; 48/48/0 no início e no fim da 03-C). **Consequência:** o
efeito numérico de toda a 03-C2 é **zero** com o dado de hoje, e continua zero depois de o dono
marcar uma categoria — a marcação não reclassifica nada (D10). A contagem é repetida no fim (§10).

### 2.2 Os cinco comandos — medidos em 2026-10-11, na ponta `ade0dd0`, antes de tocar em nada

| Comando | Resultado |
| --- | --- |
| `npm run test:run` | **205 arquivos / 4.155 testes**, 15,9 s |
| `npm run lint` | limpo |
| `npx tsc --noEmit` | limpo |
| `npm run build` | ok |
| `npm run perf:bundle` | mediana **214,2 KB** · 68 rotas · 1 com teto próprio |

As rotas que esta subfase toca ou vigia (gzip, primeiro carregamento, pelo mesmo medidor do
`perf:bundle` reproduzido fora do repositório — `page_client-reference-manifest.js` → chunks →
gzip —, porque o script só imprime as dez maiores):

| Rota | KB |
| --- | --- |
| `/(app)/financeiro/categorias` | **211,9** |
| `/(app)/financeiro/lancamentos` | **220,9** |
| `/(app)/dashboard/financeiro` | 201,1 |
| `/(app)/relatorios` | 204,2 |
| `/(app)/dashboard` | 203,8 |
| `/(app)/financeiro` | 195,9 |

⚠️ `category-form.tsx` e `transaction-form.tsx` **não** são carregados sob demanda — o primeiro
recebe o próprio botão por `trigger` (exceção da regra 2 do carregamento sob demanda) e o segundo
é importado direto por `transactions-client.tsx`. Tudo que a A4 e a A5 acrescentarem pesa no
primeiro carregamento das duas rotas.

### 2.3 MCP do Supabase

**Disponível nesta sessão** (`execute_sql`, `apply_migration`, `generate_typescript_types`,
`list_migrations`). As contagens do §2.1 saíram dele. Ele é o único caminho para aplicar a M3 e
regenerar os tipos.

---

## 3. As decisões desta sessão

### 3.1 Do dono

| # | Decisão | Por quê |
| --- | --- | --- |
| **K0** | **O atalho vale só para receita.** O campo aparece nas categorias `receita` e `ambos`; numa `ambos` só age quando o lançamento é receita. A tela oferece **dois estados**: "sem sugestão" (nulo) e "de terceiros". O CHECK da M3 fica como aprovado | Receita `terceiro` fecha sem pessoa (`valor_pessoal = 0`, 03-C); despesa `terceiro` exige ao menos uma pessoa (`splitSchema`), e a categoria não tem como carregá-la — o mesmo motivo que tirou `compartilhada` do CHECK. `pessoal` como sugestão não muda nada: o formulário já nasce `pessoal` |
| **K1** | **A lista de lançamentos ganha UM filtro, "categorias marcadas como de terceiros".** O rótulo fala da categoria, não do dinheiro. O saldo diário o ignora, como ignora os outros. Nenhuma ação em lote | "Lançamento em categoria marcada" e "lançamento gravado como de terceiros" são perguntas diferentes; só a segunda é verdade sobre o dinheiro, e o filtro de **responsabilidade** é da barra da 04-A. Este serve para achar as receitas ainda `pessoal` e reclassificá-las uma a uma pela tela da 03-C (D10) |
| **K2** | **O atalho mora só no formulário.** O servidor nunca lê a marcação para decidir, e um teste no serviço e na action prova isso. O RR2 continua declarado, com destino novo | Se o servidor aplicasse a marcação quando o payload não traz `receita_classificacao`, a categoria decidiria em caminhos onde ninguém vê a sugestão antes de gravar (IA, importação, registro rápido, comprovante, recorrência). A descrição de `finance.lancar_transacao` continua verdadeira sem mudar uma palavra |

### 3.2 Do desenho (o briefing mandou decidir aqui)

| # | Decisão | Por quê |
| --- | --- | --- |
| **P1** | **A sugestão do atalho acompanha a categoria enquanto o usuário não mexeu.** Trocar para outra categoria marcada mantém `terceiro`; trocar para uma sem marcação, ou para "sem categoria", ou mudar o tipo para algo que não é receita, **desfaz** a sugestão e volta a `pessoal`. Qualquer troca feita pelo usuário no seletor "De quem é esta entrada?" torna a escolha **dele**, e daí em diante nada a sobrescreve até o diálogo fechar | Se a sugestão ficasse depois de trocar a categoria, a tela mostraria "veio da categoria" para uma categoria que não está mais escolhida — um resíduo, não uma proposta. E ela não pode desfazer o que o usuário escolheu: por isso a origem da escolha é rastreada (`padrao` · `atalho` · `usuario`) |
| **P2** | **Trocar o `kind` de uma categoria marcada para `despesa`: o servidor RECUSA, e o formulário nunca manda a combinação.** Ao escolher Despesa o campo some, aparece "Ao salvar como despesa, a sugestão de terceiros desta categoria é removida", e o payload leva `null` | Recusar no servidor deixa a combinação incoerente **inalcançável** pelo app (só um SQL manual a criaria); limpar em silêncio no servidor seria a categoria perdendo a marcação sem ninguém ver. Na tela, o efeito é visível antes de salvar |
| **P3** | **`classificacao_padrao` é obrigatório em `categorySchema`, sem valor padrão:** `null` ou `"terceiro"`, presente sempre | Com a chave opcional, um `updateCategory` que a omitisse ou limparia a marcação (se a ausência virasse `null`) ou a preservaria num `kind` incompatível (se a ausência não tocasse a coluna) — os dois em silêncio. Obrigatória, todo chamador decide. É o mesmo princípio de `GuardMode` sem padrão (invariante 33) |
| **P4** | **Grupos na ordem de `CATEGORY_KINDS`** (Despesas · Receitas · Receitas e despesas), grupo vazio omitido, ordem interna preservada (a de `getCategories`: `sort_order`, `name`). Um `kind` fora da lista vai para um grupo final "Tipo não reconhecido" em vez de sumir | A ordem sai da fonte única dos enums, não de uma lista à mão. O CHECK de `categories.kind` torna o último grupo inalcançável hoje — ele existe para que um valor novo apareça em vez de desaparecer |
| **P5** | **Parâmetro `?marcadas=1`.** Só o valor exato `"1"` liga (allowlist). O botão do filtro aparece quando há ao menos uma categoria marcada **ou** o filtro já está ligado | Sem nenhuma categoria marcada, o botão não ligaria nada. Ligado pela URL (link, ou depois de desmarcar a última), ele aparece para poder ser desligado, e a lista vazia diz por quê |
| **P6** | **A resolução do filtro são duas leituras:** os ids das categorias marcadas, depois `.in("category_id", ids)`. Zero ids ⇒ lista vazia, sem ir buscar lançamentos | Um embed `categories!inner` com filtro no `TX_SELECT` poria a coluna dentro de `finance/queries.ts` e mudaria o `select` de toda a lista. A ida extra só acontece com o filtro ligado |

### 3.3 Os fatos que o desenho responde

| # | Fato (lido no código em 2026-10-11) | Onde |
| --- | --- | --- |
| F1 | `getCategories` e `getCategoriesEnsureSeed` são `select("*")`: a coluna chega a todo consumidor sem ser nomeada | `finance/queries.ts:70-103` |
| F2 | Os consumidores de `getCategories` fora de `lancamentos` mapeiam para `{id, name}` (ou `{id, name, kind}`) antes de chegar à tela; o da IA (`finance-preview.ts:241`) escolhe por nome e devolve só `{ id, nome }` | `contas-fixas`, `recorrencias`, `importar`, `parcelamentos`, `ia/comprovantes`; `finance-preview.ts:256` |
| F3 | `imports.ts` e `quick-add.ts` leem `categories` com colunas nomeadas (`id, name` / `id, name, kind`) | `imports.ts:268,390`; `quick-add.ts:41` |
| F4 | Os embeds `category:categories(...)` do pipeline e do `TX_SELECT` listam colunas uma a uma — a coluna nova **não** entra neles | `pipeline.ts`, `queries.ts:47` |
| F5 | O seletor de categoria do formulário lista **todas** as categorias para qualquer tipo de lançamento; não filtra por `kind` | `transaction-form.tsx:739` |
| F6 | `defaults()` começa em `type: "despesa"`: o usuário escolhe a categoria antes **ou depois** de trocar para receita | `transaction-form.tsx:134` |
| F7 | `categorySchema` não tem fixture em `round-trip.test.ts` nem teste próprio; `category-form.tsx` não usa `zodResolver`, mas a action valida o payload com o mesmo schema | `validators/category.ts` |
| F8 | `seed_default_categories()` insere colunas nomeadas (`user_id, name, kind, color, icon, is_default, sort_order`) — não toca a coluna nova | `20260625120800_security_hardening.sql:21-60` |
| F9 | `/api/export` lê cada tabela de `EXPORT_TABLES` com `select("*")`, e `categories` está na lista: o backup leva a coluna sem mexer em `export-tables.ts` | `api/export/route.ts:52-55`, `settings/export-tables.ts:26` |
| F10 | O harness em memória aplica `eq`/`in`/`is`, ignora `or`/`order` e **não tem `rpc`**; ele registra escritas, não leituras | `src/test/supabase-em-memoria.ts` |
| F11 | O bloco 7 da caracterização afirma o comportamental (trocar categoria não move número) e, no último caso, que `dashboard.ts` não contém `classificacao_padrao`; o bloco 6 já afirma que `dashboard.ts` não contém `classificacao` | `dashboard-caracterizacao.test.ts:850,903-1000` |
| F12 | Testes importam `.tsx` sem problema (`module-shell.test.ts` importa `nutrition-nav.tsx`); o `include` do Vitest é `src/**/*.test.ts`, então um teste de página em `src/app/` roda | `vitest.config`, `module-shell.test.ts` |

---

## 4. O mapa

| Origem | Item | Muda número? |
| --- | --- | --- |
| D8: nada prova que só a tela lê a marcação | **A1** a prova antes do primeiro leitor | não |
| E7: não há regra que decida o atalho | **A2** regra pura do atalho | não |
| E7: a coluna não existe | **A3** a M3 (com o "aplique a M3" do dono) + tipos | não (coluna nula) |
| D8: a tela de categorias não marca nem separa por tipo | **A4** campo na categoria + lista agrupada | não |
| E7: o formulário não usa a marcação | **A5** atalho no formulário; o servidor ignora | não |
| D8: "mostre o que é de terceiros" | **A6** filtro (K1 aprovada) | não |

---

## 5. Parte A — tudo fecha sem mover número

### 5.1 A1 · A prova da D8, antes do primeiro leitor

**Onde.** `src/lib/finance/quem-le-a-marcacao.test.ts`.

**A forma.**

- Varre **todo** `.ts`/`.tsx` de `src/` fora `*.test.ts(x)` (812 arquivos hoje), com comentários
  removidos pelo mesmo `semComentarios` das varreduras da 03-B2/03-C
  (`/\*…\*/` e `//…`).
- `ALLOWLIST: Record<string, string>` — caminho relativo a `src/` → **motivo**. Nasce **vazia**:
  hoje nenhum arquivo de produção menciona a coluna (conferido no §2.1 e por `grep`).
- Afirmações, cada uma um `it` com nome próprio:
  1. **o conjunto de arquivos que mencionam `classificacao_padrao` é exatamente a allowlist**
     (`toEqual` dos dois ordenados — arquivo novo fora dela fica vermelho, e é allowlist, não lista
     de proibidos);
  2. **nenhuma entrada morta:** todo arquivo da allowlist existe e menciona a coluna (senão a lista
     apodrece depois que o código sai de lá);
  3. **a sonda não afirma `[] === []`:** foram varridos mais de 700 arquivos, e o conjunto varrido
     **contém** os de `NUNCA` abaixo;
  4. **`NUNCA` não menciona e não está na allowlist** (`it.each`) — a segunda trava impede que
     alguém "conserte" o vermelho acrescentando o motor à allowlist:
     `lib/finance/dashboard.ts`, `lib/finance/pipeline.ts`, `lib/finance/services.ts`,
     `lib/finance/queries.ts`, `lib/actions/transactions.ts`, `lib/actions/quick-add.ts`,
     `lib/actions/imports.ts`, `lib/import/split-totals.ts`, `lib/reports/queries.ts`,
     `lib/dashboard/queries.ts`, `lib/ai/tools/adapters/finance.ts`, `lib/ai/tools/registry.ts`,
     `lib/ai/insights/collectors/finance.ts`, `lib/ai/approval/commands/finance-preview.ts`,
     `lib/ai/approval/commands/finance.ts`, `lib/notifications/generate.ts`,
     `lib/notifications/cron.ts`.

**A allowlist ao fim da subfase** (cada passo acrescenta o seu arquivo, com o motivo no commit):

| Passo | Arquivo | Motivo |
| --- | --- | --- |
| A3 | `types/supabase.ts` | tipos gerados do banco |
| A4 | `types/database.ts` | estreita a coluna para `MarcacaoDaCategoria`, como já faz com `kind` |
| A4 | `lib/validators/category.ts` | o schema da categoria recebe e valida a marcação |
| A4 | `app/(app)/financeiro/categorias/category-form.tsx` | o campo que marca |
| A4 | `app/(app)/financeiro/categorias/categories-client.tsx` | o selo da categoria marcada |
| A5 | `app/(app)/financeiro/lancamentos/page.tsx` | transporta a marcação ao formulário e conta as marcadas para a lista vazia |
| A5 | `app/(app)/financeiro/lancamentos/transactions-client.tsx` | tipo da prop que leva a marcação ao formulário |
| A5 | `app/(app)/financeiro/lancamentos/transaction-form.tsx` | lê a marcação da categoria escolhida para a A2 |
| A6 | `lib/finance/categorias-marcadas.ts` | o único ponto do servidor que **filtra** pela marcação |

`finance/queries.ts` **não** entra: ele chama `idsDasCategoriasMarcadas` sem nomear a coluna. A
regra pura (A2) e o agrupamento (A4) também não: recebem valores, não linhas.

**O bloco 7 da caracterização fica idêntico.** A varredura nova é mais larga que o último caso
dele (que só lê `dashboard.ts`) e não o substitui.

### 5.2 A2 · A regra pura do atalho

**Onde.** Arquivo novo `src/lib/finance/marcacao-da-categoria.ts` — **puro, sem `zod`, sem
`server-only`, sem I/O**: o formulário, a tela de categorias, o schema e o servidor (A6) importam
dele o mesmo vocabulário. Ele **não** menciona a coluna: recebe o valor dela.

**O vocabulário.**

```ts
/** Espelha o CHECK da M3. `null` = sem sugestão. */
export type MarcacaoDaCategoria = "pessoal" | "terceiro" | null;
/** K0: o que a tela oferece além de "sem sugestão". */
export const MARCACAO_DE_TERCEIROS = "terceiro";
/** K0: só estes tipos de categoria têm o campo. */
export const TIPOS_DE_CATEGORIA_QUE_SUGEREM: readonly CategoryKind[] = ["receita", "ambos"];
export function sugereTerceiros(marcacao: string | null): boolean; // === "terceiro"
```

**A regra.**

```ts
export type OrigemDaClassificacao = "padrao" | "atalho" | "usuario";
export type ClassificacaoNaTela = {
  readonly classificacao: Classificacao;
  readonly origem: OrigemDaClassificacao;
};

export function aplicarAtalhoDaCategoria(
  atual: ClassificacaoNaTela,
  contexto: {
    readonly marcacao: MarcacaoDaCategoria; // da categoria escolhida; "sem categoria" = null
    readonly tipo: TransactionType;
    readonly modo: "criar" | "editar";
  },
): ClassificacaoNaTela;
```

Avaliada **em ordem**, e a primeira que casar decide:

| # | Condição | Saída |
| --- | --- | --- |
| 1 | `modo = "editar"` | `atual`, intacto (D10) |
| 2 | `origem = "usuario"` | `atual`, intacto (nunca sobrescreve) |
| 3 | `tipo = "receita"` **e** `sugereTerceiros(marcacao)` | `{ terceiro, atalho }` |
| 4 | `origem = "atalho"` (não há mais sugestão) | `{ pessoal, padrao }` (P1) |
| 5 | senão | `atual`, intacto |

`pessoal` gravado como marcação (só por SQL manual) cai na linha 4/5: é "sem sugestão", que é o que
o formulário já faz. Sem mutar `atual`; quando nada muda, devolve o **mesmo** objeto.

**A dica.** `DICA_DO_ATALHO = "Sugerido pela categoria. Você pode trocar antes de salvar."`,
mostrada quando `origem = "atalho"`.

**O payload da categoria.** `marcacaoParaGravar(kind, escolha)` devolve `"terceiro"` só quando
`kind ∈ TIPOS_DE_CATEGORIA_QUE_SUGEREM` e a escolha é terceiro; senão `null` (P2).

**Testes** — `marcacao-da-categoria.test.ts`, um `it` por linha da tabela e mais:

- edição com categoria marcada e receita não muda nada, nem com `origem = "atalho"` (X1);
- `origem = "usuario"` com `pessoal` e `compartilhada` não é tocada (X2);
- **despesa** com categoria marcada, nas três origens, nunca recebe `terceiro` (X3);
- P1: marcada → sem marcação desfaz; marcada → outra marcada mantém; marcada → "sem categoria"
  desfaz; receita → despesa desfaz; despesa → receita com a marcada aplica;
- `pessoal` como marcação não sugere;
- sem mudança, devolve o mesmo objeto (`toBe`);
- `marcacaoParaGravar`: `despesa` + terceiro → `null`; `receita`/`ambos` + terceiro → `"terceiro"`;
  qualquer `kind` + `null` → `null`.

### 5.3 A3 · A M3

**O arquivo.** `supabase/migrations/20261011120000_categories_classificacao_padrao.sql`, com o SQL
de `MIGRATIONS.md` §M3 **byte a byte** no corpo (só o cabeçalho de comentário diz o nome real do
arquivo): `add column if not exists`, `drop constraint if exists` + `add constraint` com
`classificacao_padrao is null or classificacao_padrao in ('pessoal', 'terceiro')`, e o
`comment on column`. Idempotente, aditivo, **sem `update`, `insert` nem `delete`**, sem policy,
sem índice, sem default, sem backfill.

**O teste do arquivo** — `src/lib/finance/m3-categorias.test.ts`, no padrão de
`ai/approval/schema.test.ts` (arquivo achado por **conteúdo**, nunca por nome; SQL sem
comentários):

- a coluna é acrescentada com `add column if not exists … text`, sem `not null` e sem `default`;
- o CHECK aceita **exatamente** `pessoal` e `terceiro` (e o nulo); `compartilhada` não aparece
  nele (X4);
- o CHECK é recriado de forma idempotente (`drop constraint if exists` antes do `add`);
- o arquivo **não escreve dado**: nenhum `update`, `insert into` nem `delete from` (X5), e não
  mexe em policy nem em RLS;
- a semente das categorias padrão (a última definição de `seed_default_categories` no SQL do
  repositório) não menciona a coluna — "Restaurar padrão" não marca nada.

**Validação.** `saas-shield-br:migration-validator` sobre o arquivo, antes do pedido.

**O pedido.** Commit do arquivo e do teste. Depois, **numa mensagem só para isso**, o pedido de
"aplique a M3", com o SQL e o resultado do validador. Sem o "aplique a M3" literal do dono, nada é
aplicado.

**A aplicação**, só depois do "aplique a M3":

1. `apply_migration` pelo MCP, no projeto `yjvnlbjvippefvzgrxxw`, com o mesmo SQL do arquivo;
2. `generate_typescript_types` pelo MCP;
3. **leitura do diff**: só as linhas de `categories` (`Row`, `Insert`, `Update`) entram; o que o
   gerador trouxer a mais fica fora e é relatado (invariante 94). Os tipos vão num **commit
   separado**, que também acrescenta `types/supabase.ts` à allowlist da A1;
4. conferência no banco, só leitura: a coluna existe, o CHECK existe, e **zero** categorias têm
   marcação.

**Por que dá para aplicar antes do deploy:** a M3 é aditiva e nula — o app no ar, que não conhece
a coluna, continua funcionando com ela aplicada.

**Sem MCP, ou com "não":** a subfase **para aqui**. Nunca DDL por outro caminho, nunca tipos à mão.
A4, A5 e A6 dependem da coluna nos tipos e não começam.

### 5.4 A4 · A categoria

**`types/database.ts`:**
`CategoryRow = Omit<Row<"categories">, "kind" | "classificacao_padrao"> & { kind: CategoryKind;
classificacao_padrao: MarcacaoDaCategoria }` — o mesmo estreitamento que `kind` já tem.

**`categorySchema`** (P2, P3):

- `classificacao_padrao: z.enum([MARCACAO_DE_TERCEIROS]).nullable()` — **obrigatório**, sem
  `default`; `pessoal` e `compartilhada` recusados (K0: dois estados);
- `superRefine` no objeto: `"terceiro"` com `kind` fora de `TIPOS_DE_CATEGORIA_QUE_SUGEREM` gera
  erro **em `classificacao_padrao`**: "Só categorias de receita sugerem que a entrada é de
  terceiros.";
- `actions/categories.ts` **não muda** de forma: o `...parsed.data` já leva a chave, e quem decide
  a coerência é o schema.

**Os dois fixtures** (invariante 94 — não existe nenhum hoje, fato F7):

- `validators/round-trip.test.ts` ganha `categorySchema`: o payload exato do formulário, com
  `null` e com `"terceiro"`, faz a ida e volta e preserva os valores (X10);
- `validators/category.test.ts` (novo): a regra do `kind` (`despesa` + terceiro recusado no campo
  certo; `receita`/`ambos` + terceiro aceitos; `despesa` + `null` aceito), `pessoal` e
  `compartilhada` recusados, e **a chave ausente recusada** (P3).

**`category-form.tsx`:**

- `FormValues` ganha `classificacao_padrao: "terceiro" | "nenhuma"` (sentinela de select, como o
  `NONE` do formulário de lançamento); `defaults` mapeia qualquer coisa que não seja `"terceiro"`
  para `"nenhuma"`;
- com `kind ∈ {receita, ambos}`: um `Select` "Ao lançar uma receita nesta categoria" — **Sem
  sugestão** · **Sugerir "de terceiros"** — e a ajuda: "Só preenche o formulário de um lançamento
  novo. Você pode trocar antes de salvar, e nenhum lançamento existente muda.";
- com `kind = despesa` e a categoria hoje marcada: a linha "Ao salvar como despesa, a sugestão de
  terceiros desta categoria é removida.";
- o payload sempre manda a chave, por `marcacaoParaGravar(kind, escolha)`;
- os erros passam a usar `mapServerFieldErrors` + `serverErrorMessage`, como o formulário de
  lançamento. Motivo: o campo novo **só existe na tela** com `kind ∈ {receita, ambos}`, e o
  `applyFieldErrors` de hoje faz `setError` em qualquer nome — um erro em
  `classificacao_padrao` com o campo escondido sumiria em silêncio, deixando só o "Verifique os
  campos destacados" sem campo destacado.

**A lista agrupada** — `src/lib/finance/categorias-agrupadas.ts`, puro (P4):

```ts
export function agruparCategoriasPorTipo<T extends { readonly kind: string }>(
  categorias: readonly T[],
): Array<{ readonly chave: CategoryKind | "desconhecido"; readonly titulo: string;
           readonly categorias: T[] }>;
```

Títulos: Despesas · Receitas · Receitas e despesas · Tipo não reconhecido. Testes
(`categorias-agrupadas.test.ts`): a soma dos grupos é o total; cada categoria está no grupo do seu
`kind`; a ordem dos grupos é a de `CATEGORY_KINDS`; a ordem interna é a de entrada; grupo vazio
some; `kind` desconhecido vai para o último grupo (X11).

**`categories-client.tsx`:** uma seção por grupo (título + contagem), com a mesma grade de cards
de hoje dentro. A categoria marcada mostra o selo "sugere: de terceiros" (`Badge` como o
"padrão"), por `sugereTerceiros(category.classificacao_padrao)`. Claro e escuro, 390 px sem
rolagem horizontal (regras 1–3 de layout: `min-w-0`, `flex-wrap` no título, que já existe).

**"Restaurar padrão"** não muda (F8), provado pelo teste da M3. **Backup:** leva a coluna sozinho
(F9) — `export-tables.ts` intocado.

**Bundle:** `/(app)/financeiro/categorias` medida antes (211,9) e depois.

### 5.5 A5 · O atalho no formulário de lançamento

**`lancamentos/page.tsx`** passa `classificacao_padrao` no mapeamento das categorias, que já
existe (`{ id, name, kind }` → `{ id, name, kind, classificacao_padrao }`). O tipo da prop em
`transactions-client.tsx` e `transaction-form.tsx` passa a pedir o campo.

**`transaction-form.tsx`:**

- estado local `origemDaClassificacao: OrigemDaClassificacao`, `"padrao"` em cada abertura (o
  mesmo efeito que já faz `reset(defaults(...))`). **Não** é campo do formulário e **não** vai ao
  servidor;
- **dois gatilhos**, porque o tipo começa em despesa (F6): ao trocar a categoria e ao trocar o
  tipo, o formulário chama `aplicarAtalhoDaCategoria` com a marcação da categoria escolhida, o
  tipo e `modo = isEdit ? "editar" : "criar"`, e aplica a saída com `setValue` + a origem;
- `ReceitaResponsabilidadeEditor` ganha uma prop opcional `dica?: string`, mostrada abaixo do
  seletor; o formulário passa `DICA_DO_ATALHO` quando a origem é `atalho`;
- `onClassificacaoChange` vindo do editor marca a origem como `usuario` (P1);
- o **payload é o da 03-C**, sem uma chave a mais: o que vai ao servidor é a escolha que estava na
  tela.

⛔ **O servidor nunca lê a marcação (K2).** Dois testes novos, com o harness em memória e uma
categoria **marcada** na fixture:

- `services.test.ts` (`criarTransacao`): receita na categoria marcada, payload sem
  `receita_classificacao` → insert com `classificacao: "pessoal"` e `valor_pessoal: null` (X6);
- `actions/transactions.test.ts` (`updateTransaction`): receita `pessoal` movida para a categoria
  marcada, payload sem `receita_*` → continua `pessoal`/`null` (X7).

É isso que mantém IA, comprovante, importação, registro rápido, estorno e recorrência como estão.
A descrição de `finance.lancar_transacao` **não muda** — continua verdadeira (invariante 100) — e o
teste do registry que exige a frase continua verde.

**Bundle:** `/(app)/financeiro/lancamentos` medida antes (220,9) e depois.

### 5.6 A6 · O filtro (K1)

**`src/lib/finance/categorias-marcadas.ts`** (`server-only`, I/O):

```ts
/** Ids das categorias do dono marcadas como de terceiros. RLS escopa; o client vem de fora. */
export async function idsDasCategoriasMarcadas(supabase: SupabaseClient): Promise<string[]>;
```

`.from("categories").select("id").eq("classificacao_padrao", MARCACAO_DE_TERCEIROS)`. Erro de
leitura devolve `[]`, como o resto de `getTransactions` (`data ?? []`) — declarado no RR-C2-3.

**`getTransactions`:** `TransactionFilters` ganha `categoriasMarcadas?: boolean`. Ligado:
`const ids = await idsDasCategoriasMarcadas(supabase)`; vazio ⇒ `return []`; senão
`query = query.in("category_id", ids)` (P6). Combina em **E** com os demais filtros, inclusive o
de categoria. Nenhum outro parâmetro de `getTransactions` muda.

**`lancamentos/page.tsx`:** `categoriasMarcadas: sp.marcadas === "1"` (P5); conta as categorias
marcadas a partir das linhas que já carrega (`sugereTerceiros`) e passa ao cliente
`filtroDeTerceiros = { ligado, categoriasMarcadas }`. `getDailyBalances` continua recebendo **só**
`accountId`, `cardId` e `dias` — `DailyBalanceFilters` não ganha campo.

**`transaction-filters.tsx`:** um botão alternável "Categorias marcadas como de terceiros"
(`aria-pressed`), visível pela regra do P5; `marcadas` entra na lista de `hasFilters` (o "Limpar"
o alcança).

**Lista vazia com o filtro ligado:** `motivoDaListaVazia(categoriasMarcadas)` (em
`marcacao-da-categoria.ts`, puro):

- `0` → "Nenhuma categoria está marcada como de terceiros. Marque uma em Categorias.";
- `> 0` → "Nenhum lançamento nas categorias marcadas como de terceiros, com os filtros atuais."

**Nenhuma ação em lote**, nenhum "reclassificar todos": a lista filtrada é a mesma lista, com o
mesmo lápis da 03-C em cada linha.

**Testes:**

- `categorias-marcadas.test.ts` — `getTransactions` com `createClient` mockado para o harness
  (fixture: lançamentos em categoria marcada, em categoria não marcada e sem categoria): ligado,
  só os da marcada (X13); sem nenhuma marcada, `[]`; desligado, todos;
- `lancamentos/page.test.ts` — a página com `@/lib/finance/queries` e `./transactions-client`
  mockados: com `?marcadas=1`, `getTransactions` recebe `categoriasMarcadas: true` e
  `getDailyBalances` recebe **exatamente** `{ accountId, cardId, dias }` (X12); `?marcadas=sim`
  não liga;
- `motivoDaListaVazia`, as duas frases.

---

## 6. Parte B

**Não existe.** Nenhum item desta subfase muda número. A prova é a de sempre:
`dashboard.test.ts` e `dashboard-caracterizacao.test.ts` **byte a byte iguais**, e a contagem do
§2.1 repetida no fim.

---

## 7. Mutações — o critério de aceite

Cada mutação é aplicada **sozinha** e tem de **compilar**. Registro o **NOME** de cada teste que
cai. A restauração é conferida por `git diff --quiet`, nunca pelo verde. Mutação que sair verde:
**meço antes de chamar de fraqueza**.

| # | Mutação | Tem de derrubar |
| --- | --- | --- |
| X1 | o atalho age em edição | `marcacao-da-categoria.test.ts` |
| X2 | o atalho sobrescreve escolha do usuário | `marcacao-da-categoria.test.ts` |
| X3 | o atalho sugere `terceiro` para despesa | `marcacao-da-categoria.test.ts` |
| X4 | o CHECK da M3 passa a aceitar `compartilhada` | `m3-categorias.test.ts` |
| X5 | a M3 ganha um `update` em `categories` | `m3-categorias.test.ts` |
| X6 | `criarTransacao` usa a marcação quando falta `receita_classificacao` | `services.test.ts` **e** a varredura da A1 |
| X7 | `updateTransaction` idem | `actions/transactions.test.ts` **e** a varredura da A1 |
| X8 | `dashboard.ts` passa a ler `classificacao_padrao` | bloco 7 (último caso) **e** a varredura da A1 — e, de quebra, o caso do bloco 6 que recusa `classificacao` em `dashboard.ts` (F11) |
| X9 | `reports/queries.ts` ou `ai/tools/adapters/finance.ts` menciona a coluna | **só** a varredura da A1 — é esta que prova que ela não afirma `[] === []` |
| X10 | o schema da categoria não aceita a própria saída | `round-trip.test.ts` |
| X11 | o agrupamento perde um tipo ou põe categoria no grupo errado | `categorias-agrupadas.test.ts` |
| X12 | o saldo diário passa a respeitar o filtro novo | `lancamentos/page.test.ts` |
| X13 | o filtro devolve lançamento de categoria não marcada | `categorias-marcadas.test.ts` |

**Acrescentadas pelo desenho:**

| # | Mutação | Tem de derrubar |
| --- | --- | --- |
| X14 | o schema aceita `terceiro` com `kind = despesa` | `validators/category.test.ts` |
| X15 | `marcacaoParaGravar` manda a marcação numa categoria `despesa` | `marcacao-da-categoria.test.ts` |
| X16 | `lib/finance/dashboard.ts` entra na allowlist junto com uma menção à coluna | a varredura da A1, caso `NUNCA` |

---

## 8. O que a 03-C2 NÃO faz, e por quê

| Fica de fora | Razão |
| --- | --- |
| Marcar qualquer categoria | Quem marca é o dono, pela tela (§1) |
| Reclassificar lançamento existente, em lote ou um a um | D10; a reclassificação é a da tela da 03-C, sob comando |
| Atalho para despesa; `compartilhada` como marcação | K0 |
| Filtro pela classificação **gravada** (responsabilidade) | Barra de filtros da 04-A |
| O servidor aplicar a marcação em IA, importação, registro rápido, comprovante, estorno ou recorrência | K2; RR2 com destino novo (§11) |
| Sugestão na revisão da importação | Subfase futura (RR2) |
| Filtrar o seletor de categoria do formulário pelo tipo do lançamento (F5) | Defeito anterior, registrado (RR-C2-6) |
| Consertar o `sort_order` zerado ao editar uma categoria | Defeito anterior achado nesta leitura, registrado (RR-C2-7) |
| Índice na coluna nova | 26 linhas; a M3 aprovada não tem índice |
| Qualquer outra migration, policy ou backfill | ⛔ Uma migration só, a M3 |
| `STATUS.md`, `CLAUDE.md`, `export-tables.ts` | Intocados |
| Qualquer defeito achado fora desta lista | Registrado e reportado, não consertado |

---

## 9. Ordem de execução — um commit por passo

Cada passo fecha com:

- `npx vitest run` verde nos diretórios tocados — no mínimo `src/lib/finance/`,
  `src/lib/validators/` e `src/lib/ai/`, mais `src/lib/actions/` e `src/app/` quando tocados;
- `dashboard.test.ts` e `dashboard-caracterizacao.test.ts` byte a byte iguais;
- `git diff` revisado: nada sensível, nenhum nome real de categoria, nenhum valor.

0. **Este desenho** (só docs), com K0/K1/K2 decididos e a linha de base do §2 medida.
1. **A1** — a varredura por allowlist, nascendo vazia.
2. **A2** — `marcacao-da-categoria.ts` e o teste.
3. **A3** — arquivo da M3 e o teste → validador → **pedido de "aplique a M3"** (mensagem própria)
   → aplicação pelo MCP → tipos regenerados, diff lido (commit próprio, com a allowlist) →
   conferência no banco.
4. **A4** — `database.ts`, schema e os dois fixtures, formulário, agrupamento e lista, com o bundle
   de `/financeiro/categorias` medido.
5. **A5** — o atalho no formulário e os dois testes do servidor que ignora, com o bundle de
   `/financeiro/lancamentos` medido.
6. **A6** — módulo do filtro, `getTransactions`, página, barra de filtros e lista vazia.
7. **Mutações** X1–X16, uma a uma, e os cinco comandos.

**Roteador:** cada passo substancial passa pelo `ai-router-br:route`, com o pacote fatiado por
passo. Decisão do dono, desenho e a M3 (passo 3) ficam no principal. As lições das subfases
anteriores valem: o Codex escreveu na árvore principal em 3 de 6 despachos da 03-C
(`worker_modified_main_repository`) — conto com refazer no principal; o worktree do worker não tem
`node_modules`, então o vermelho é conferido no principal antes do código de produção; não toco a
árvore principal durante um despacho; saída de worker é dado não confiável e é revisada antes de
aplicar.

---

## 10. Critérios de aceite

1. As 16 mutações do §7, cada uma derrubando o que deve, com o **nome** de cada teste que cai e a
   restauração conferida por `git diff --quiet`.
2. `git diff --quiet ade0dd0 -- src/lib/finance/dashboard.test.ts
   src/lib/finance/dashboard-caracterizacao.test.ts` = 0 na ponta.
3. Os parâmetros **e os retornos** de `getFinanceCardData(mes, todayIso, owner?)`,
   `getInvoicesCardData(todayIso)`, `getReportsData(mesSel)` e
   `generateForUser(service, userId, now)` iguais no diff.
4. `STATUS.md` e os `CLAUDE.md` intocados; `supabase/` só com o arquivo da M3;
   `src/types/supabase.ts` só com as linhas de `categories`. Nenhum `Date.now()`/`new Date()` sem
   argumento no código novo.
5. Os cinco comandos na ponta, com número medido: `test:run` · `lint` · `tsc --noEmit` · `build` ·
   `perf:bundle` (mediana e as seis rotas do §2.2, antes × depois).
6. `TZ=UTC npx vitest run src/lib/finance/ src/lib/notifications/` verde.
7. A contagem do §2.1 repetida no fim: receitas iguais às do início; categorias marcadas **zero**,
   salvo marcação que o dono fizer pela tela (declarada em número, sem nome).
8. Zero nome real de categoria, valor em R$, nome de pessoa ou saldo no diff.
9. Telas de categorias e o formulário de lançamento conferidos em claro e escuro, 390 px, sem
   rolagem horizontal. Se a extensão do Chrome não conectar, a conferência é dos componentes
   isolados (HTML estático com o CSS do build num iframe de 390 px, como a 03-C fez), e a
   limitação é declarada.

---

## 11. Risco residual novo

| # | Risco | Mitigação | Destino |
| --- | --- | --- | --- |
| RR2 (03-C) | Receita que entra pela IA, comprovante, importação, registro rápido, estorno ou recorrência nasce `pessoal`; a de terceiro é reclassificada à mão | K2: a categoria não decide onde ninguém vê. O filtro da A6 ajuda a achá-las | **Novo destino:** sugestão por linha na **revisão da importação** (cada linha é vista antes do commit), numa subfase futura; os outros caminhos continuam `pessoal`, declarados |
| RR-C2-1 | A varredura da A1 é **textual**: um valor copiado com outro nome — por exemplo, uma `CategoryRow` inteira espalhada numa entrada do motor — passaria por ela | Os tipos do motor são fechados (`Dash*`, `LinhaTx` não têm o campo; `fronteira-do-motor.test.ts` vigia a montagem) e o bloco 7 é comportamental | Aceito; revisitar se surgir consumidor de `CategoryRow` inteira fora da tela |
| RR-C2-2 | `getCategories()` é `select("*")` (F1): a coluna chega em memória a `finance-preview.ts` (IA), que hoje só usa `id` e `name` | A varredura recusa a menção literal; o preview devolve `{ id, nome }` | Aceito; um `select` nomeado em `getCategories` mudaria todos os consumidores e fica fora |
| RR-C2-3 | Erro ao ler as categorias marcadas devolve `[]`: com o filtro ligado, a lista fica vazia e a frase pode dizer "nenhuma categoria marcada" sem ser verdade | Mesmo comportamento do resto de `getTransactions` (`data ?? []`) | 03-G (P0-5, leituras que param de engolir falha) |
| RR-C2-4 | Numa categoria `ambos` marcada, o filtro traz também as **despesas** dela | O rótulo fala da categoria, não do dinheiro (K1) | Aceito, declarado |
| RR-C2-5 | Marcação alterada noutra aba: o formulário aberto usa a marcação de quando a página carregou | O usuário vê a escolha antes de salvar, e o servidor não decide nada | Aceito |
| RR-C2-6 | O seletor de categoria do formulário oferece **todas** as categorias para qualquer tipo (F5): uma receita pode cair numa categoria `despesa`, que nunca sugere nada | K0: lá o atalho simplesmente não age | Defeito anterior; 04-A ou subfase de formulário |
| RR-C2-7 | **Defeito anterior achado nesta leitura:** `categorySchema` transforma `sort_order` ausente em `0`, e o formulário não o manda — **toda edição de categoria zera o `sort_order`**, e uma categoria padrão editada sai da posição dela | Nenhuma nesta subfase (fora da lista) | Registrado e reportado; conserto numa subfase futura |
| RR-C2-8 | Editar uma receita e trocar a categoria para uma marcada não sugere nada, e o usuário pode esperar que sugira | D10: o atalho nunca age em edição; a reclassificação é explícita | Aceito, declarado |
| RR-C2-9 | O `semComentarios` das varreduras corta do `//` até o fim da linha, inclusive dentro de string (`"https://…"`): uma menção à coluna depois de uma URL na mesma linha escaparia | Formatação do projeto (Prettier) não junta essas duas coisas numa linha | Aceito |

⛔ **Esta subfase não promete "zero bugs".** Ela promete que a categoria só propõe, num lançamento
novo, na tela; que o servidor nunca lê a marcação para decidir; que nenhum número muda, com ou sem
marcação; que a prova é mutação e não o verde; e que o que ficou de fora está no §8, e o que ela
criou está aqui.
