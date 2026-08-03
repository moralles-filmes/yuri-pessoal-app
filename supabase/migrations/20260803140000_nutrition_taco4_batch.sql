-- Fase 16-A — Registro de auditoria da carga da base TACO 4ª edição.
-- GERADO por scripts/nutrition/generate-taco-migration.mjs. Guarda o checksum do arquivo
-- oficial: se o NEPA republicar a planilha, a divergência fica visível.

insert into public.nutrition_import_batches
  (id, user_id, source_id, source_version, file_name, file_checksum,
   rows_total, rows_imported, rows_skipped, rows_failed, status, report, finished_at)
values
  ('8d1aaeaa-c39d-5b3c-b1b4-ccf59b895cc1', null, '840ac1ba-bb4d-53e6-a85f-660fa9d4426c',
   '2011', 'taco.xlsx', 'a66b8ec528daeabc63bc2b015fc9bd8c6d76b941c2fc0ed93a4311d449302d14',
   597, 597, 0, 0, 'concluido',
   '{"nutrientValues":21147,"categories":15,"legend":{"(em branco)":"análises não solicitadas → nenhum registro é gravado (lido como não disponível)","Tr":"traço → estado ''traco'' (conta como 0 no cálculo, mas marca o total como aproximado)","NA":"não aplicável → estado ''nao_aplicavel'' (ignorado no cálculo)","*":"as análises estão sendo reavaliadas → estado ''em_revisao'' (o alimento fica is_verified = false)"},"notes":["Nenhum marcador da fonte vira zero. Zero só existe quando a fonte publica zero.","Energia, carboidrato (obtido por diferença) e vitamina A (RE/RAE) são marcados como ''calculado'' porque a própria TACO os calcula.","Carboidrato levemente negativo em carnes/pescados magros é valor real da fonte (cálculo por diferença) e foi preservado.","O estado de preparo é derivado do nome oficial por casamento exato de token; sem token conhecido fica ''nao_informado''.","A TACO 4 não publica medidas caseiras por alimento — nenhuma foi inventada."],"pipeline":"scripts/nutrition/build-taco-dataset.mjs + generate-taco-migration.mjs"}'::jsonb,
   now())
on conflict (id) do update set
  source_version = excluded.source_version,
  file_name      = excluded.file_name,
  file_checksum  = excluded.file_checksum,
  rows_total     = excluded.rows_total,
  rows_imported  = excluded.rows_imported,
  report         = excluded.report;
