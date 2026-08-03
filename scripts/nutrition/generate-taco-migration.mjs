#!/usr/bin/env node
/**
 * Fase 16-A — Gera as migrations de seed da base TACO 4 a partir do dataset normalizado.
 *
 *   node scripts/nutrition/generate-taco-migration.mjs
 *
 * Lê `data/nutrition/taco-4/foods.json` (produzido por build-taco-dataset.mjs) e escreve
 * migrations idempotentes em `supabase/migrations/`.
 *
 * DUAS DECISÕES DE FORMATO, ambas por causa do volume (597 alimentos × ~35 nutrientes =
 * 21.147 valores):
 *
 *  1. VÁRIOS ARQUIVOS. Um só passaria de 2 MB. O seed é fatiado por faixa de alimento e cada
 *     arquivo é autocontido (alimentos + seus nutrientes), reexecutável sozinho.
 *
 *  2. NUTRIENTES EM JSONB, não uma linha SQL por valor. Uma linha por valor repetiria o UUID
 *     do alimento 35 vezes e quadruplicaria o arquivo. Cada alimento carrega um objeto
 *     `{"codigo_do_nutriente": valor}` e o próprio SQL o expande com `jsonb_each`. A
 *     codificação está documentada no cabeçalho de cada arquivo gerado e o dataset legível
 *     continua versionado em data/nutrition/taco-4/foods.json.
 *
 * NADA aqui inventa dado: o script só transcreve o JSON para SQL. As únicas informações
 * derivadas são `food_type` (a partir da categoria da própria fonte), `is_verified` (falso
 * quando a fonte declara análises em reavaliação) e `method` (a TACO calcula energia,
 * carboidrato e vitamina A em vez de analisá-los) — todas documentadas no arquivo gerado.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { idForBatch, idForFood, idForSource } from "./uuid.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA_DIR = resolve(ROOT, "data/nutrition/taco-4");
const MIGRATIONS_DIR = resolve(ROOT, "supabase/migrations");

const SOURCE_CODE = "taco-4";
const SOURCE_ID = idForSource(SOURCE_CODE);
const VERIFIED_AT = "2026-08-03";
const FOODS_PER_FILE = 75;
const REVIEW_NOTE = "A fonte informa que as análises deste alimento estão sendo reavaliadas.";

/** `food_type` derivado da categoria da própria fonte. */
const TYPE_BY_CATEGORY = {
  bebidas: "bebida",
  industrializados: "industrializado",
  preparados: "preparacao",
  "gorduras-oleos": "ingrediente",
};

/** Estados sem valor viram uma letra no JSON; a expansão em SQL os traduz de volta. */
const STATE_CODE = { traco: "t", nao_aplicavel: "n", em_revisao: "r" };

const sql = (value) =>
  value === null || value === undefined ? "null" : `'${String(value).replace(/'/g, "''")}'`;

function main() {
  const foods = JSON.parse(readFileSync(resolve(DATA_DIR, "foods.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(resolve(DATA_DIR, "manifest.json"), "utf8"));

  const chunks = [];
  for (let i = 0; i < foods.length; i += FOODS_PER_FILE) {
    chunks.push(foods.slice(i, i + FOODS_PER_FILE));
  }

  let nutrientCount = 0;
  const written = [];

  chunks.forEach((chunk, index) => {
    const part = String(index + 1).padStart(2, "0");
    const file = `2026080313${part}00_nutrition_taco4_seed_${part}.sql`;

    const rows = chunk.map((food) => {
      const emRevisao = Object.values(food.nutrients).some((v) => v.state === "em_revisao");
      const payload = {};
      for (const [code, value] of Object.entries(food.nutrients)) {
        // 6 algarismos significativos: preserva muito mais precisão do que a tabela
        // impressa publica e elimina o ruído de ponto flutuante da média das réplicas.
        payload[code] =
          value.state === "disponivel"
            ? Number.parseFloat(value.amount.toPrecision(6))
            : STATE_CODE[value.state];
      }
      nutrientCount += Object.keys(payload).length;
      return (
        `  (${sql(idForFood(SOURCE_CODE, food.code))},${sql(food.code)},${sql(food.name)},` +
        `${sql(food.categorySlug)},${sql(TYPE_BY_CATEGORY[food.categorySlug] ?? "alimento")},` +
        `${sql(food.preparationState)},${sql(food.baseUnit)},${emRevisao ? "false" : "true"},` +
        `${sql(JSON.stringify(payload))})`
      );
    });

    const header = `-- Fase 16-A — Seed da base TACO 4ª edição · parte ${part} de ${String(chunks.length).padStart(2, "0")} (alimentos ${chunk[0].code}–${chunk[chunk.length - 1].code})
--
-- GERADO por scripts/nutrition/generate-taco-migration.mjs a partir de
-- data/nutrition/taco-4/foods.json. NÃO EDITE À MÃO — regenere.
--
-- Fonte:    ${manifest.source.citation}
-- Licença:  ${manifest.source.licenseNote}
-- SHA-256 do XLSX oficial: ${manifest.file.sha256}
-- Atribuição completa: data/nutrition/taco-4/ATTRIBUTION.md
--
-- COMO LER A COLUNA \`nutrientes\` (jsonb):
--   "proteina": 2.58825   → valor disponível
--   "colesterol": "n"     → não aplicável   (NA na tabela original)
--   "riboflavina": "t"    → traço           (Tr na tabela original)
--   "energia_kcal": "r"   → análises em reavaliação (* na tabela original)
--   nutriente AUSENTE     → análises não solicitadas ⇒ nenhuma linha é gravada, e a leitura
--                           reporta "não disponível". VALOR AUSENTE NUNCA VIRA ZERO.
--
-- Campos derivados (os únicos; o resto é transcrição literal da fonte):
--   • food_type        — deduzido da categoria da própria TACO (bebidas → bebida etc.).
--   • is_verified      — false quando a fonte marca o alimento com "*".
--   • method           — 'calculado' para energia, carboidrato (obtido por diferença) e
--                        vitamina A (RE/RAE), que a própria TACO calcula; 'analitico' no resto.
--   • last_verified_at — data em que o dado foi conferido contra o arquivo oficial.
--
-- Idempotente: os UUIDs são determinísticos (uuid v5 sobre o código do alimento, ver
-- scripts/nutrition/uuid.mjs), então reexecutar ATUALIZA em vez de duplicar.

with dados (id, codigo, nome, categoria, tipo, preparo, unidade, verificado, nutrientes) as (
  values
${rows.join(",\n")}
),
alimentos as (
  insert into public.nutrition_foods
    (id, user_id, name, category_id, food_type, preparation_state, base_quantity, base_unit,
     source_id, source_food_code, source_version, data_quality, is_system_food, is_verified,
     last_verified_at, notes)
  select
    d.id::uuid, null, d.nome, c.id, d.tipo, d.preparo, 100, d.unidade,
    ${sql(SOURCE_ID)}::uuid, d.codigo, ${sql(manifest.source.version)}, 'analitico', true,
    d.verificado::boolean, ${sql(VERIFIED_AT)}::date,
    case when d.verificado::boolean then null else ${sql(REVIEW_NOTE)} end
  from dados d
  join public.nutrition_food_categories c
    on c.slug = d.categoria and c.user_id is null
  on conflict (id) do update set
    name              = excluded.name,
    category_id       = excluded.category_id,
    food_type         = excluded.food_type,
    preparation_state = excluded.preparation_state,
    base_quantity     = excluded.base_quantity,
    base_unit         = excluded.base_unit,
    source_id         = excluded.source_id,
    source_food_code  = excluded.source_food_code,
    source_version    = excluded.source_version,
    data_quality      = excluded.data_quality,
    is_verified       = excluded.is_verified,
    last_verified_at  = excluded.last_verified_at,
    notes             = excluded.notes
  returning id, source_food_code
)
insert into public.nutrition_food_nutrients
  (food_id, user_id, nutrient_code, amount, value_state, method)
select
  a.id,
  null,
  kv.key,
  case when jsonb_typeof(kv.value) = 'number' then (kv.value #>> '{}')::numeric end,
  case jsonb_typeof(kv.value)
    when 'number' then 'disponivel'
    else case kv.value #>> '{}'
      when 't' then 'traco'
      when 'n' then 'nao_aplicavel'
      when 'r' then 'em_revisao'
    end
  end,
  case when kv.key in ('energia_kcal','energia_kj','carboidrato','vitamina_a_re','vitamina_a_rae')
       then 'calculado' else 'analitico' end
from alimentos a
join dados d on d.codigo = a.source_food_code
cross join lateral jsonb_each(d.nutrientes::jsonb) kv
on conflict (food_id, nutrient_code) do update set
  amount      = excluded.amount,
  value_state = excluded.value_state,
  method      = excluded.method;
`;

    writeFileSync(resolve(MIGRATIONS_DIR, file), header);
    written.push({ file, foods: chunk.length });
  });

  // Lote de auditoria: uma linha para a carga inteira.
  const batchFile = "20260803140000_nutrition_taco4_batch.sql";
  writeFileSync(
    resolve(MIGRATIONS_DIR, batchFile),
    `-- Fase 16-A — Registro de auditoria da carga da base TACO 4ª edição.
-- GERADO por scripts/nutrition/generate-taco-migration.mjs. Guarda o checksum do arquivo
-- oficial: se o NEPA republicar a planilha, a divergência fica visível.

insert into public.nutrition_import_batches
  (id, user_id, source_id, source_version, file_name, file_checksum,
   rows_total, rows_imported, rows_skipped, rows_failed, status, report, finished_at)
values
  (${sql(idForBatch(SOURCE_CODE, manifest.source.version))}, null, ${sql(SOURCE_ID)},
   ${sql(manifest.source.version)}, ${sql(manifest.file.name)}, ${sql(manifest.file.sha256)},
   ${manifest.counts.foods}, ${manifest.counts.foods}, 0, 0, 'concluido',
   ${sql(
     JSON.stringify({
       nutrientValues: nutrientCount,
       categories: manifest.counts.categories,
       legend: manifest.legend,
       notes: manifest.notes,
       pipeline: "scripts/nutrition/build-taco-dataset.mjs + generate-taco-migration.mjs",
     }),
   )}::jsonb,
   now())
on conflict (id) do update set
  source_version = excluded.source_version,
  file_name      = excluded.file_name,
  file_checksum  = excluded.file_checksum,
  rows_total     = excluded.rows_total,
  rows_imported  = excluded.rows_imported,
  report         = excluded.report;
`,
  );

  for (const item of written) console.log(`${item.file} — ${item.foods} alimentos`);
  console.log(`${batchFile} — lote de auditoria`);
  console.log(`TOTAL: ${foods.length} alimentos, ${nutrientCount} valores nutricionais.`);
}

main();
