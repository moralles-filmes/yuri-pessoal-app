# NEXT_AGENT_INSTRUCTIONS — Instruções para o próximo agente

## 📌 Estado atual — Fase 16 (Dieta e Alimentação) em andamento

As 14 fases do roadmap original e a Fase 15 (TO-DO) estão concluídas. Em **2026-08-03** o
usuário abriu a **Fase 16 — Módulo Dieta e Alimentação**, dividida em **6 subfases (A–F)**.

**A Subfase 16-A está concluída.**

## ▶️ Sua tarefa: Subfase 16-B — Metas, diário alimentar e planejamento

**Arquivo da fase (leia inteiro antes de codar):**
`docs/phases/PHASE_16_B_NUTRITION_DIARY_PLANNING.md`

**Leitura obrigatória, nesta ordem:**
1. `docs/project/PROJECT_BRIEFING.md` (Módulo 17 — Dieta e Alimentação)
2. `docs/project/PROJECT_RULES.md`
3. `docs/project/PROJECT_ARCHITECTURE.md` (seção "Módulo Dieta e Alimentação")
4. `docs/project/PROJECT_ROADMAP.md` (Fase 16, tabela das subfases)
5. `docs/project/CURRENT_STATUS.md`
6. `docs/handoff/LAST_PHASE_SUMMARY.md`
7. `docs/phases/PHASE_16_A_NUTRITION_FOUNDATION_FOODS.md` (o que já existe)
8. `docs/phases/PHASE_16_B_NUTRITION_DIARY_PLANNING.md` (o que você vai fazer)

**Código que você precisa entender antes de escrever qualquer linha:**
`src/lib/nutrition/units.ts`, `calc.ts`, `constants.ts`, `types.ts`, `queries.ts` e
`src/lib/actions/nutrition-foods.ts`.

---

## ⛔ Invariantes do módulo Dieta que NÃO podem ser quebradas

1. **AUSÊNCIA DE DADO NÃO É ZERO.** É a regra que sustenta o módulo inteiro.
   `value_state` distingue `disponivel | traco | nao_disponivel | nao_aplicavel |
   em_revisao`, e uma CHECK constraint impede valor sem estado coerente. Toda soma propaga
   `exato | aproximado | parcial` e a interface **tem de mostrar isso**. Nunca faça
   `amount ?? 0` fora de `calc.ts`.
2. **TODO TOTAL SAI DE `calc.ts`.** Diário, receita e relatório precisam concordar entre si —
   reimplementar a conta em qualquer lugar quebra isso silenciosamente. Reuse
   `convertToBase` + `scaleNutrients` + `sumNutrients` + `mergeTotals`.
3. **A BASE DO SISTEMA É IMUTÁVEL.** `user_id is null` = somente leitura, garantido por
   policies separadas por comando. Favoritar/arquivar/recategorizar vai em
   `nutrition_food_prefs`. Duplicar cria cópia com `origin_food_id`.
4. **CONVERSÃO IMPOSSÍVEL É ERRO EXPLÍCITO.** `convertToBase` devolve `{ok:false, reason}` —
   mostre a mensagem de `CONVERSION_FAILURE_MESSAGES`, nunca estime.
5. **NUNCA MATERIALIZE NUTRIENTE** em coluna de `nutrition_foods`. O pivô é a view
   `nutrition_foods_view`, que é derivação. Duas fontes de verdade dessincronizam.
6. **NÃO INVENTE DADO NUTRICIONAL.** Nenhum valor entra no sistema sem fonte. Se precisar de
   outra base, use o pipeline de `scripts/nutrition/` e registre a licença.
7. **ARREDONDE SÓ NA APRESENTAÇÃO** (`roundForDisplay`, com a precisão de cada nutriente).

## ⛔ O que a Subfase 16-B precisa acertar (e é fácil errar)

- **SNAPSHOT HISTÓRICO.** Ao registrar consumo, grave quantidade, unidade, conversão em
  gramas, nutrientes, fonte e versão **no momento do registro**. Editar o alimento depois
  **não pode** mudar o passado. Escreva um teste que edita o alimento e confere o histórico.
- **PLANEJADO ≠ CONSUMIDO.** Registrar consumo nunca sobrescreve o planejamento. Tabelas
  separadas + `planned_item_id` + `change_kind`.
- **STATUS DERIVADO NA LEITURA**, como fatura (F03), tarefa (F09) e TO-DO (F15). `pendente` e
  atraso saem de `planned_time` + agora; não persista.
- **META VIGENTE POR DATA.** Alterar a meta hoje não pode mudar relatório de mês passado.
- **DATA PURA** `'yyyy-MM-dd'` para o dia do diário + hora em coluna `time`. Nunca
  timestamptz para representar "o dia" (na Vercel o processo roda em UTC).
- **ÁGUA NÃO SE DUPLICA** — a fonte de verdade é o módulo Hábitos (Fase 10). Leia e linke.
- **SEM PRESCRIÇÃO.** O módulo registra e organiza; não diagnostica, não prescreve dieta
  clínica e não define meta médica automaticamente. Estimador (se houver) é opcional, mostra
  a fórmula, se identifica como estimativa e exige confirmação.

## 📋 Pendências registradas da 16-A (não são bugs — escopo consciente)

| Item | Onde resolve |
| --- | --- |
| Medidas caseiras oficiais em massa (a TACO não publica) | Importar uma segunda fonte pelo mesmo pipeline; nada foi inventado |
| Leitura de código de barras pela câmera | Subfase 16-F (o campo, a busca e o cadastro manual já existem) |
| Cards no dashboard geral, busca global, lançamento rápido, notificações | Subfase 16-F |
| Micronutrientes na tela de metas | Subfases 16-B / 16-E |
| Exportação do catálogo em CSV | Subfase 16-E (com os demais relatórios) |

## 🔁 Como aplicar migrations neste projeto

Padrão: **Supabase MCP `apply_migration`** no projeto `yjvnlbjvippefvzgrxxw`, com o arquivo
versionado em `supabase/migrations/` (idempotente, timestamp `YYYYMMDDHHMMSS`).

Para cargas grandes de dados (como o seed da TACO, 488 KB), o conteúdo não cabe
confortavelmente numa chamada MCP. Nesse caso os arquivos foram aplicados **direto do disco**
pela Management API, usando o token da CLI do Supabase já autenticada nesta máquina:

```bash
RAW="$(security find-generic-password -s "Supabase CLI" -w)"      # macOS keychain
TOKEN="$(printf '%s' "${RAW#go-keyring-base64:}" | base64 -d)"    # go-keyring
curl -X POST "https://api.supabase.com/v1/projects/yjvnlbjvippefvzgrxxw/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data "$(jq -Rs '{query: .}' < supabase/migrations/ARQUIVO.sql)"
```

Registre o arquivo em `supabase_migrations.schema_migrations` depois, para o ledger bater com
o repositório. **Nunca imprima o token.**

Depois de qualquer migration: `get_advisors` com **0 lints de schema** e
**regenere `src/types/supabase.ts`** (MCP `generate_typescript_types`).

## ⛔ Invariantes gerais do projeto (bloqueantes)

- **RLS + FORCE RLS em TODAS as tabelas** (hoje **57**). Teste pelo client SDK autenticado ou
  trocando de role no SQL — o SQL editor como `postgres` ignora RLS.
- **Zod no servidor** em toda Server Action; `user_id` sempre de `auth.getUser()`.
- **Nenhum `service_role` no client** — só `src/lib/supabase/service.ts` e o Cron.
- **pt-BR / BRL**, datas BR, **dark/light** e responsividade reais em tudo.
- **React Compiler ativo:** use `useWatch`/`Controller`, nunca `form.watch()` nem `setState`
  em `useEffect` (ajuste de estado durante o render é o padrão adotado).

## ✅ Verificação obrigatória antes de fechar qualquer mudança

```bash
npm run lint && npx tsc --noEmit && npm run test:run && npm run build
```

Os **671 testes** devem continuar passando (acrescente testes para toda lógica pura nova).
A suíte precisa passar em qualquer fuso — confira com `TZ=UTC npx vitest run`.
Smoke test: rotas privadas → 307 `/login`; `/api/cron/*` → 401 sem segredo.

## 🗺️ Mapa rápido do que existe (reaproveitar, não reescrever)

- **Dieta:** `src/lib/nutrition/*` (puro + queries), `src/lib/actions/nutrition-foods.ts`,
  `src/components/nutrition/*`, `src/app/(app)/nutricao/*`, `scripts/nutrition/*`,
  `data/nutrition/taco-4/*`.
- **TO-DO:** `src/lib/todo/*` — referência de recorrência pura em `Date.UTC`.
- **Financeiro/relatórios:** `src/lib/finance/*`, `src/lib/reports/*`.
- **Preferências:** store `settings` (uma linha/usuário) — **estenda com chaves novas**,
  nunca recrie.
- **Anexos genéricos:** tabela `attachments` + bucket privado `attachments`
  (`{user_id}/…`) — é o que a foto de receita (16-C) e a de evolução (16-E) devem usar.
- **Notificações:** `src/lib/notifications/*` com `dedupe_key` + Cron da Vercel.

## 🧩 Os dois módulos de tarefas continuam coexistindo (proposital)

| Módulo | Rota | Papel |
| --- | --- | --- |
| **TO-DO** (Fase 15) | `/todo` | Gerenciador principal de execução |
| Tarefas & Rotinas (Fase 09) | `/tarefas`, `/rotinas` | Legado + rotinas com check-in diário |

**Não remova `/tarefas`** sem antes migrar os quatro pontos que dependem de `tasks`:
`calendar_events.task_id`, `src/lib/notifications/generate.ts`, `src/lib/search/queries.ts` e
`src/lib/dashboard/queries.ts`.

## 🔧 Pendências gerais do projeto (anteriores à Fase 16)

- Ligar upload de anexos (`attachments`) em telas além de tarefas.
- Propagar a preferência `date_format` a mais telas.
- Canais externos de notificação (push/e-mail) — fora do escopo atual.
- Produção: definir `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `GOOGLE_CLIENT_ID/SECRET`.
  Sem eles os recursos degradam com elegância.
