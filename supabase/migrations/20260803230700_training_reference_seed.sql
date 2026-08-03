-- Fase 17-A — Treinos · Seed do vocabulário global (grupos musculares e equipamentos)
--
-- Linhas com `user_id is null` = base do sistema, somente leitura pelo usuário.
-- IDEMPOTENTE: `on conflict` sobre os índices únicos parciais, então reaplicar a migration
-- ATUALIZA em vez de duplicar.
--
-- A hierarquia é resolvida num segundo passo porque o pai e o filho entram no mesmo insert.

-- ─────────────────────────────── Grupos musculares ───────────────────────────────
insert into public.training_muscle_groups (user_id, slug, name, region, position, is_system)
values
  (null, 'peitoral',            'Peitoral',            'superior',      10,  true),
  (null, 'costas',              'Costas',              'superior',      20,  true),
  (null, 'dorsais',             'Dorsais',             'superior',      21,  true),
  (null, 'trapezio',            'Trapézio',            'superior',      22,  true),
  (null, 'ombros',              'Ombros',              'superior',      30,  true),
  (null, 'deltoide_anterior',   'Deltoide anterior',   'superior',      31,  true),
  (null, 'deltoide_lateral',    'Deltoide lateral',    'superior',      32,  true),
  (null, 'deltoide_posterior',  'Deltoide posterior',  'superior',      33,  true),
  (null, 'biceps',              'Bíceps',              'superior',      40,  true),
  (null, 'triceps',             'Tríceps',             'superior',      50,  true),
  (null, 'antebracos',          'Antebraços',          'superior',      60,  true),
  (null, 'abdomen',             'Abdômen',             'tronco',        70,  true),
  (null, 'lombar',              'Lombar',              'tronco',        80,  true),
  (null, 'gluteos',             'Glúteos',             'inferior',      90,  true),
  (null, 'quadriceps',          'Quadríceps',          'inferior',     100,  true),
  (null, 'posteriores_coxa',    'Posteriores de coxa', 'inferior',     110,  true),
  (null, 'adutores',            'Adutores',            'inferior',     120,  true),
  (null, 'abdutores',           'Abdutores',           'inferior',     130,  true),
  (null, 'panturrilhas',        'Panturrilhas',        'inferior',     140,  true),
  (null, 'corpo_inteiro',       'Corpo inteiro',       'corpo_inteiro',150,  true),
  (null, 'cardiorrespiratorio', 'Cardiorrespiratório', 'cardio',       160,  true),
  (null, 'outros',              'Outros',              'outro',        170,  true)
on conflict (slug) where user_id is null do update
  set name     = excluded.name,
      region   = excluded.region,
      position = excluded.position;

-- Hierarquia rasa: as porções do deltoide pertencem a Ombros; dorsais e trapézio, a Costas.
update public.training_muscle_groups child
   set parent_id = parent.id
  from public.training_muscle_groups parent
 where child.user_id is null
   and parent.user_id is null
   and parent.slug = case child.slug
         when 'dorsais'            then 'costas'
         when 'trapezio'           then 'costas'
         when 'deltoide_anterior'  then 'ombros'
         when 'deltoide_lateral'   then 'ombros'
         when 'deltoide_posterior' then 'ombros'
       end
   and child.parent_id is distinct from parent.id;

-- ───────────────────────────────── Equipamentos ─────────────────────────────────
-- `default_increment_kg` = menor salto de carga típico. NULO quando não se aplica.
insert into public.training_equipment (user_id, slug, name, category, default_increment_kg, position, is_system)
values
  (null, 'barra',            'Barra',            'livre',     2.5,  10,  true),
  (null, 'halteres',         'Halteres',         'livre',     2,    20,  true),
  (null, 'anilhas',          'Anilhas',          'livre',     1.25, 30,  true),
  (null, 'maquina',          'Máquina',          'maquina',   5,    40,  true),
  (null, 'smith',            'Smith',            'maquina',   2.5,  50,  true),
  (null, 'cabo',             'Cabo/polia',       'cabo',      2.5,  60,  true),
  (null, 'peso_corporal',    'Peso corporal',    'corporal',  null, 70,  true),
  (null, 'elastico',         'Elástico',         'acessorio', null, 80,  true),
  (null, 'kettlebell',       'Kettlebell',       'livre',     4,    90,  true),
  (null, 'banco',            'Banco',            'acessorio', null, 100, true),
  (null, 'trx',              'TRX',              'acessorio', null, 110, true),
  (null, 'bola',             'Bola',             'acessorio', null, 120, true),
  (null, 'esteira',          'Esteira',          'cardio',    null, 130, true),
  (null, 'bicicleta',        'Bicicleta',        'cardio',    null, 140, true),
  (null, 'eliptico',         'Elíptico',         'cardio',    null, 150, true),
  (null, 'remo_ergometro',   'Remo',             'cardio',    null, 160, true),
  (null, 'escada',           'Escada',           'cardio',    null, 170, true),
  (null, 'corda',            'Corda',            'acessorio', null, 175, true),
  (null, 'sem_equipamento',  'Sem equipamento',  'corporal',  null, 180, true),
  (null, 'outro',            'Outro',            'outro',     null, 190, true)
on conflict (slug) where user_id is null do update
  set name                 = excluded.name,
      category             = excluded.category,
      default_increment_kg = excluded.default_increment_kg,
      position             = excluded.position;
