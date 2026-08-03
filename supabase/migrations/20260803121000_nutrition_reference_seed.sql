-- Fase 16-A — Dieta e Alimentação · Seed de referência (nutrientes, fontes, categorias)
--
-- Idempotente: `on conflict do update`. Reexecutar corrige rótulos sem duplicar nada.
-- Os UUIDs são DETERMINÍSTICOS (uuid v5, ver scripts/nutrition/uuid.mjs) para que o mesmo
-- registro tenha o mesmo id em qualquer ambiente e a migration de alimentos possa
-- referenciá-los direto.

-- ───────────────────────────────── Nutrientes ─────────────────────────────────
-- 80 definições. Nenhum alimento precisa ter todas: a ausência de linha em
-- nutrition_food_nutrients é lida como "não disponível".
insert into public.nutrition_nutrients (code, name, short_name, unit, nutrient_group, position, is_core, precision) values
  -- Energia
  ('energia_kcal',          'Energia',                        'kcal',   'kcal', 'energia',     10, true,  0),
  ('energia_kj',            'Energia',                        'kJ',     'kJ',   'energia',     20, false, 0),
  -- Macronutrientes
  ('proteina',              'Proteína',                       'Prot',   'g',    'macro',       10, true,  1),
  ('carboidrato',           'Carboidrato total',              'Carb',   'g',    'macro',       20, true,  1),
  ('lipidios',              'Lipídios totais',                'Gord',   'g',    'macro',       30, true,  1),
  ('fibra',                 'Fibra alimentar',                'Fibra',  'g',    'macro',       40, true,  1),
  -- Outros componentes
  ('umidade',               'Umidade',                        null,     'g',    'outro',       10, false, 1),
  ('cinzas',                'Cinzas',                         null,     'g',    'outro',       20, false, 1),
  ('alcool',                'Álcool',                         null,     'g',    'outro',       30, false, 1),
  -- Carboidratos
  ('carboidrato_disponivel','Carboidrato disponível',         null,     'g',    'carboidrato', 10, false, 1),
  ('acucares_totais',       'Açúcares totais',                'Açúc',   'g',    'carboidrato', 20, true,  1),
  ('acucares_adicionados',  'Açúcares adicionados',           null,     'g',    'carboidrato', 30, false, 1),
  -- Lipídios
  ('ag_saturados',          'Gorduras saturadas',             'Sat',    'g',    'lipidio',     10, true,  1),
  ('ag_monoinsaturados',    'Gorduras monoinsaturadas',       'Mono',   'g',    'lipidio',     20, false, 1),
  ('ag_poliinsaturados',    'Gorduras poli-insaturadas',      'Poli',   'g',    'lipidio',     30, false, 1),
  ('ag_trans',              'Gorduras trans',                 'Trans',  'g',    'lipidio',     40, false, 1),
  ('colesterol',            'Colesterol',                     'Colest', 'mg',   'lipidio',     50, false, 0),
  ('ag_12_0',               'Ácido láurico (12:0)',           null,     'g',    'lipidio',    110, false, 2),
  ('ag_14_0',               'Ácido mirístico (14:0)',         null,     'g',    'lipidio',    120, false, 2),
  ('ag_16_0',               'Ácido palmítico (16:0)',         null,     'g',    'lipidio',    130, false, 2),
  ('ag_18_0',               'Ácido esteárico (18:0)',         null,     'g',    'lipidio',    140, false, 2),
  ('ag_20_0',               'Ácido araquídico (20:0)',        null,     'g',    'lipidio',    150, false, 2),
  ('ag_22_0',               'Ácido behênico (22:0)',          null,     'g',    'lipidio',    160, false, 2),
  ('ag_24_0',               'Ácido lignocérico (24:0)',       null,     'g',    'lipidio',    170, false, 2),
  ('ag_14_1',               'Ácido miristoleico (14:1)',      null,     'g',    'lipidio',    180, false, 2),
  ('ag_16_1',               'Ácido palmitoleico (16:1)',      null,     'g',    'lipidio',    190, false, 2),
  ('ag_18_1',               'Ácido oleico (18:1)',            null,     'g',    'lipidio',    200, false, 2),
  ('ag_20_1',               'Ácido gadoleico (20:1)',         null,     'g',    'lipidio',    210, false, 2),
  ('ag_18_2_n6',            'Ácido linoleico (18:2 n-6)',     null,     'g',    'lipidio',    220, false, 2),
  ('ag_18_3_n3',            'Ácido alfa-linolênico (18:3 n-3)',null,    'g',    'lipidio',    230, false, 2),
  ('ag_20_4',               'Ácido araquidônico (20:4)',      null,     'g',    'lipidio',    240, false, 2),
  ('ag_20_5',               'EPA (20:5)',                     null,     'g',    'lipidio',    250, false, 2),
  ('ag_22_5',               'DPA (22:5)',                     null,     'g',    'lipidio',    260, false, 2),
  ('ag_22_6',               'DHA (22:6)',                     null,     'g',    'lipidio',    270, false, 2),
  ('ag_18_1t',              'Trans 18:1',                     null,     'g',    'lipidio',    280, false, 2),
  ('ag_18_2t',              'Trans 18:2',                     null,     'g',    'lipidio',    290, false, 2),
  -- Minerais
  ('sodio',                 'Sódio',                          'Na',     'mg',   'mineral',     10, true,  0),
  ('calcio',                'Cálcio',                         'Ca',     'mg',   'mineral',     20, false, 0),
  ('ferro',                 'Ferro',                          'Fe',     'mg',   'mineral',     30, false, 1),
  ('potassio',              'Potássio',                       'K',      'mg',   'mineral',     40, false, 0),
  ('magnesio',              'Magnésio',                       'Mg',     'mg',   'mineral',     50, false, 0),
  ('fosforo',               'Fósforo',                        'P',      'mg',   'mineral',     60, false, 0),
  ('zinco',                 'Zinco',                          'Zn',     'mg',   'mineral',     70, false, 1),
  ('manganes',              'Manganês',                       'Mn',     'mg',   'mineral',     80, false, 2),
  ('cobre',                 'Cobre',                          'Cu',     'mg',   'mineral',     90, false, 2),
  ('selenio',               'Selênio',                        'Se',     'mcg',  'mineral',    100, false, 1),
  ('iodo',                  'Iodo',                           'I',      'mcg',  'mineral',    110, false, 1),
  -- Vitaminas
  ('vitamina_a_rae',        'Vitamina A (RAE)',               'Vit A',  'mcg',  'vitamina',    10, false, 0),
  ('vitamina_a_re',         'Vitamina A (RE)',                null,     'mcg',  'vitamina',    20, false, 0),
  ('retinol',               'Retinol',                        null,     'mcg',  'vitamina',    30, false, 0),
  ('vitamina_c',            'Vitamina C',                     'Vit C',  'mg',   'vitamina',    40, false, 1),
  ('vitamina_d',            'Vitamina D',                     'Vit D',  'mcg',  'vitamina',    50, false, 1),
  ('vitamina_e',            'Vitamina E',                     'Vit E',  'mg',   'vitamina',    60, false, 1),
  ('vitamina_k',            'Vitamina K',                     'Vit K',  'mcg',  'vitamina',    70, false, 1),
  ('tiamina',               'Tiamina (B1)',                   'B1',     'mg',   'vitamina',    80, false, 2),
  ('riboflavina',           'Riboflavina (B2)',               'B2',     'mg',   'vitamina',    90, false, 2),
  ('niacina',               'Niacina (B3)',                   'B3',     'mg',   'vitamina',   100, false, 2),
  ('acido_pantotenico',     'Ácido pantotênico (B5)',         'B5',     'mg',   'vitamina',   110, false, 2),
  ('piridoxina',            'Piridoxina (B6)',                'B6',     'mg',   'vitamina',   120, false, 2),
  ('biotina',               'Biotina (B7)',                   'B7',     'mcg',  'vitamina',   130, false, 1),
  ('folato',                'Folato (B9)',                    'B9',     'mcg',  'vitamina',   140, false, 0),
  ('vitamina_b12',          'Cobalamina (B12)',               'B12',    'mcg',  'vitamina',   150, false, 2),
  -- Aminoácidos
  ('triptofano',            'Triptofano',                     null,     'g',    'aminoacido',  10, false, 3),
  ('treonina',              'Treonina',                       null,     'g',    'aminoacido',  20, false, 3),
  ('isoleucina',            'Isoleucina',                     null,     'g',    'aminoacido',  30, false, 3),
  ('leucina',               'Leucina',                        null,     'g',    'aminoacido',  40, false, 3),
  ('lisina',                'Lisina',                         null,     'g',    'aminoacido',  50, false, 3),
  ('metionina',             'Metionina',                      null,     'g',    'aminoacido',  60, false, 3),
  ('cistina',               'Cistina',                        null,     'g',    'aminoacido',  70, false, 3),
  ('fenilalanina',          'Fenilalanina',                   null,     'g',    'aminoacido',  80, false, 3),
  ('tirosina',              'Tirosina',                       null,     'g',    'aminoacido',  90, false, 3),
  ('valina',                'Valina',                         null,     'g',    'aminoacido', 100, false, 3),
  ('arginina',              'Arginina',                       null,     'g',    'aminoacido', 110, false, 3),
  ('histidina',             'Histidina',                      null,     'g',    'aminoacido', 120, false, 3),
  ('alanina',               'Alanina',                        null,     'g',    'aminoacido', 130, false, 3),
  ('acido_aspartico',       'Ácido aspártico',                null,     'g',    'aminoacido', 140, false, 3),
  ('acido_glutamico',       'Ácido glutâmico',                null,     'g',    'aminoacido', 150, false, 3),
  ('glicina',               'Glicina',                        null,     'g',    'aminoacido', 160, false, 3),
  ('prolina',               'Prolina',                        null,     'g',    'aminoacido', 170, false, 3),
  ('serina',                'Serina',                         null,     'g',    'aminoacido', 180, false, 3)
on conflict (code) do update set
  name           = excluded.name,
  short_name     = excluded.short_name,
  unit           = excluded.unit,
  nutrient_group = excluded.nutrient_group,
  position       = excluded.position,
  is_core        = excluded.is_core,
  precision      = excluded.precision;


-- ─────────────────────────────────── Fontes ───────────────────────────────────
-- A licença da TACO está transcrita porque é ela que autoriza a redistribuição do dado.
-- Ver data/nutrition/taco-4/ATTRIBUTION.md.
insert into public.nutrition_food_sources
  (id, user_id, code, name, publisher, edition, version, reference_url, license_note, citation, obtained_at, is_official, notes)
values
  ('840ac1ba-bb4d-53e6-a85f-660fa9d4426c', null, 'taco-4',
   'Tabela Brasileira de Composição de Alimentos (TACO)',
   'NEPA — Núcleo de Estudos e Pesquisas em Alimentação / UNICAMP',
   '4ª edição revista e ampliada', '2011',
   'https://nepa.unicamp.br/publicacoes/tabela-taco-excel/',
   '© 2011 NEPA/UNICAMP. A obra declara: "É permitida a reprodução parcial ou total desta obra, desde que citada a fonte."',
   'NEPA/UNICAMP. Tabela brasileira de composição de alimentos — TACO. 4. ed. rev. e ampl. Campinas: NEPA-UNICAMP, 2011. 161 p.',
   '2026-08-03', true,
   'Valores por 100 g de parte comestível. Marcadores da fonte preservados: Tr = traço, NA = não aplicável, * = análises em reavaliação, em branco = análises não solicitadas.'),
  ('dfe8490c-f2a1-5c86-b924-54f76d67736e', null, 'rotulo-fabricante',
   'Rótulo do fabricante', null, null, null, null,
   'Informação nutricional declarada na embalagem do produto.',
   'Informação nutricional do rótulo do produto (declarada pelo fabricante).',
   null, false,
   'Usar para produto industrializado. Registrar marca e data de verificação: rótulo muda sem aviso.'),
  ('262f9046-0452-5a90-8345-bd7fcacc92d3', null, 'usuario',
   'Cadastro próprio', null, null, null, null, null,
   'Valores informados pelo próprio usuário.',
   null, false,
   'Alimento criado manualmente. A qualidade do dado é a que o usuário informar.')
on conflict (id) do update set
  name          = excluded.name,
  publisher     = excluded.publisher,
  edition       = excluded.edition,
  version       = excluded.version,
  reference_url = excluded.reference_url,
  license_note  = excluded.license_note,
  citation      = excluded.citation,
  is_official   = excluded.is_official,
  notes         = excluded.notes;


-- ───────────────────────────────── Categorias ─────────────────────────────────
-- As 15 seções da TACO + 2 do sistema (suplementos e outros), que a TACO não cobre.
insert into public.nutrition_food_categories (id, user_id, name, slug, position, icon) values
  ('54d9503a-5fcb-5aec-9758-2fd97a9649ce', null, 'Cereais e derivados',                    'cereais',             10, 'wheat'),
  ('a2e19c66-3bcd-52c2-8323-3a299a2bfb86', null, 'Leguminosas e derivados',                'leguminosas',         20, 'bean'),
  ('8b395b59-9385-5ef1-8f42-9958d23c1251', null, 'Verduras, hortaliças e derivados',       'verduras-hortalicas', 30, 'carrot'),
  ('46ee2fd1-b995-5b3b-9fbf-96da31c2f97b', null, 'Frutas e derivados',                     'frutas',              40, 'apple'),
  ('d46423a6-451e-5e6a-9262-6eadf7a91dc2', null, 'Carnes e derivados',                     'carnes',              50, 'beef'),
  ('a4172283-1bbf-53fc-ae4d-b8965de327a9', null, 'Pescados e frutos do mar',               'pescados',            60, 'fish'),
  ('5b4dc626-ade3-53ae-a12a-10844ae2248e', null, 'Ovos e derivados',                       'ovos',                70, 'egg'),
  ('0b467207-2ef2-5ca8-ba80-8a14f19d48d8', null, 'Leite e derivados',                      'leite-derivados',     80, 'milk'),
  ('6023c147-154e-526c-8903-06de0a3c74ad', null, 'Gorduras e óleos',                       'gorduras-oleos',      90, 'droplet'),
  ('20f1809c-37f0-51f9-bffd-bbc8874a14dd', null, 'Nozes e sementes',                       'nozes-sementes',     100, 'nut'),
  ('553294a7-cca4-581d-baa5-cdae58600900', null, 'Bebidas (alcoólicas e não alcoólicas)',  'bebidas',            110, 'cup-soda'),
  ('59e804aa-a31c-526e-8062-66c705e74bb5', null, 'Produtos açucarados',                    'produtos-acucarados',120, 'candy'),
  ('c578ebac-36ca-5e78-ae89-766112ebca01', null, 'Alimentos preparados',                   'preparados',         130, 'cooking-pot'),
  ('2447547e-545f-5c82-affa-5647804af64b', null, 'Outros alimentos industrializados',      'industrializados',   140, 'package'),
  ('67fe25e5-1707-5ccd-8609-0abcfe14fe34', null, 'Miscelâneas',                            'miscelaneas',        150, 'shapes'),
  ('3cf8cd9b-e54d-58a0-9eaf-b36d4285cd0a', null, 'Suplementos',                            'suplementos',        160, 'pill'),
  ('28a1dbe7-872b-56fc-bfa3-f85fff3314b8', null, 'Outros',                                 'outros',             170, 'ellipsis')
on conflict (id) do update set
  name     = excluded.name,
  slug     = excluded.slug,
  position = excluded.position,
  icon     = excluded.icon;
