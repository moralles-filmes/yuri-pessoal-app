#!/usr/bin/env node
/**
 * Fase 17-A — Treinos · Gera a migration de seed da base de exercícios.
 *
 *   node scripts/training/generate-exercise-base-migration.mjs
 *
 * Lê `data/training/exercise-base/exercises.json` (conteúdo autoral — ver ATTRIBUTION.md) e
 * escreve uma migration IDEMPOTENTE. Reaplicar atualiza em vez de duplicar, porque o conflito
 * é resolvido pelo índice único parcial em `system_code` das linhas globais.
 *
 * O script é DETERMINÍSTICO: mesma entrada, mesma saída byte a byte. É o que permite
 * versionar a migration no Git e conferir que ninguém a editou à mão.
 *
 * Mesmo espírito do pipeline de `scripts/nutrition/`: o dado mora num arquivo legível e
 * revisável; o SQL é gerado, não escrito à mão.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const INPUT = join(ROOT, "data", "training", "exercise-base", "exercises.json");
const OUTPUT = join(ROOT, "supabase", "migrations", "20260803231000_training_exercise_base_seed.sql");

/** Escapa um literal de texto para SQL. `null`/vazio vira NULL — nunca string vazia. */
const lit = (value) => {
  if (value === null || value === undefined || value === "") return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
};

const { exercises, version } = JSON.parse(readFileSync(INPUT, "utf8"));

if (!Array.isArray(exercises) || exercises.length === 0) {
  throw new Error("exercises.json não tem exercícios.");
}

const codes = new Set();
for (const ex of exercises) {
  for (const field of ["code", "name", "primary", "equipment", "movement", "type", "tracking", "laterality"]) {
    if (!ex[field]) throw new Error(`Exercício "${ex.code ?? "?"}" sem campo obrigatório: ${field}`);
  }
  if (codes.has(ex.code)) throw new Error(`Código duplicado em exercises.json: ${ex.code}`);
  codes.add(ex.code);
  if ((ex.secondary ?? []).includes(ex.primary)) {
    throw new Error(`"${ex.code}": grupo principal também listado como secundário.`);
  }
}

const exerciseRows = exercises
  .map(
    (ex) =>
      `    (${lit(ex.code)}, ${lit(ex.name)}, ${lit(ex.alternativeName)}, ${lit(ex.primary)}, ` +
      `${lit(ex.equipment)}, ${lit(ex.movement)}, ${lit(ex.type)}, ${lit(ex.tracking)}, ${lit(ex.laterality)})`,
  )
  .join(",\n");

const linkRows = exercises
  .flatMap((ex) =>
    (ex.secondary ?? []).map(
      (slug, index) => `    (${lit(ex.code)}, ${lit(slug)}, ${index})`,
    ),
  )
  .join(",\n");

const totalLinks = exercises.reduce((sum, ex) => sum + (ex.secondary ?? []).length, 0);

const sql = `-- Fase 17-A — Treinos · Seed da base de exercícios (GERADO — não editar à mão)
--
--   Origem : data/training/exercise-base/exercises.json (versão ${version})
--   Gerador: scripts/training/generate-exercise-base-migration.mjs
--   Conteúdo AUTORAL. Procedência e licença: data/training/exercise-base/ATTRIBUTION.md
--   Nenhuma imagem, vídeo, texto de instrução ou dado de terceiro entra aqui.
--
--   ${exercises.length} exercícios · ${totalLinks} vínculos de músculo secundário
--
-- IDEMPOTENTE: o conflito é resolvido pelo índice único parcial em \`system_code\` das linhas
-- globais, então reaplicar ATUALIZA em vez de duplicar. As linhas entram com user_id nulo,
-- is_system_exercise = true e source = 'sistema' — base do sistema, somente leitura.

-- ─────────────────────────────────── Exercícios ───────────────────────────────────
with base(code, name, alt, primary_slug, equipment_slug, movement, etype, tracking, laterality) as (
  values
${exerciseRows}
)
insert into public.training_exercises (
  user_id, name, alternative_name,
  primary_muscle_group_id, equipment_id,
  movement_pattern, exercise_type, tracking_type, laterality,
  is_system_exercise, is_verified, system_code, source
)
select
  null, b.name, b.alt,
  mg.id, eq.id,
  b.movement, b.etype, b.tracking, b.laterality,
  true, true, b.code, 'sistema'
from base b
join public.training_muscle_groups mg
  on mg.user_id is null and mg.slug = b.primary_slug
left join public.training_equipment eq
  on eq.user_id is null and eq.slug = b.equipment_slug
on conflict (system_code) where user_id is null and system_code is not null do update
  set name                    = excluded.name,
      alternative_name        = excluded.alternative_name,
      primary_muscle_group_id = excluded.primary_muscle_group_id,
      equipment_id            = excluded.equipment_id,
      movement_pattern        = excluded.movement_pattern,
      exercise_type           = excluded.exercise_type,
      tracking_type           = excluded.tracking_type,
      laterality              = excluded.laterality;

-- ───────────────────────────── Músculos secundários ─────────────────────────────
-- Primeiro remove o que saiu da base (para a reexecução refletir edições no JSON)...
with links(code, group_slug) as (
  values
${exercises
  .flatMap((ex) => (ex.secondary ?? []).map((slug) => `    (${lit(ex.code)}, ${lit(slug)})`))
  .join(",\n")}
)
delete from public.training_exercise_muscles m
using public.training_exercises e
where m.exercise_id = e.id
  and m.user_id is null
  and e.user_id is null
  and e.system_code is not null
  and not exists (
    select 1
      from links l
      join public.training_muscle_groups mg
        on mg.user_id is null and mg.slug = l.group_slug
     where l.code = e.system_code
       and mg.id = m.muscle_group_id
  );

-- ...e então insere/atualiza os vínculos atuais.
with links(code, group_slug, position) as (
  values
${linkRows}
)
insert into public.training_exercise_muscles (user_id, exercise_id, muscle_group_id, role, position)
select null, e.id, mg.id, 'secundario', l.position
from links l
join public.training_exercises e
  on e.user_id is null and e.system_code = l.code
join public.training_muscle_groups mg
  on mg.user_id is null and mg.slug = l.group_slug
on conflict (exercise_id, muscle_group_id) do update
  set role     = excluded.role,
      position = excluded.position;
`;

writeFileSync(OUTPUT, sql, "utf8");
console.log(
  `OK — ${exercises.length} exercícios e ${totalLinks} vínculos escritos em ${OUTPUT.replace(ROOT + "/", "")}`,
);
