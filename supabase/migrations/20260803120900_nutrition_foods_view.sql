-- Fase 16-A — Dieta e Alimentação · View de pivô dos nutrientes principais
--
-- POR QUE UMA VIEW E NÃO COLUNAS EM nutrition_foods:
-- listar/ordenar/filtrar o catálogo por "faixa de calorias" ou "faixa de proteína" com a
-- tabela normalizada exigiria um join por nutriente ou um N+1. Materializar esses valores em
-- colunas de nutrition_foods criaria uma SEGUNDA FONTE DE VERDADE que dessincroniza no
-- primeiro update esquecido. A view deriva a cada consulta — é sempre coerente por
-- construção.
--
-- `security_invoker = true` (mesmo padrão de card_statements_with_total, Fase 03): a view
-- roda com a RLS de quem consulta, então continua devolvendo só o que é do usuário + o que
-- é global. Sem isso, uma view seria um furo de RLS.
--
-- Os valores expostos aqui são para ORDENAR E FILTRAR. O cálculo de verdade (com estado do
-- valor, traço, indisponível) usa nutrition_food_nutrients direto, via src/lib/nutrition/calc.ts.
-- `nutrients_available` diz quantos nutrientes o alimento tem, para a UI sinalizar cobertura.

create or replace view public.nutrition_foods_view
  with (security_invoker = true)
as
  select
    f.*,
    n.energia_kcal,
    n.proteina,
    n.carboidrato,
    n.lipidios,
    n.fibra,
    n.sodio,
    n.acucares_totais,
    n.ag_saturados,
    coalesce(n.nutrients_available, 0) as nutrients_available
  from public.nutrition_foods f
  left join (
    select
      food_id,
      max(amount) filter (where nutrient_code = 'energia_kcal'    and value_state = 'disponivel') as energia_kcal,
      max(amount) filter (where nutrient_code = 'proteina'        and value_state = 'disponivel') as proteina,
      max(amount) filter (where nutrient_code = 'carboidrato'     and value_state = 'disponivel') as carboidrato,
      max(amount) filter (where nutrient_code = 'lipidios'        and value_state = 'disponivel') as lipidios,
      max(amount) filter (where nutrient_code = 'fibra'           and value_state = 'disponivel') as fibra,
      max(amount) filter (where nutrient_code = 'sodio'           and value_state = 'disponivel') as sodio,
      max(amount) filter (where nutrient_code = 'acucares_totais' and value_state = 'disponivel') as acucares_totais,
      max(amount) filter (where nutrient_code = 'ag_saturados'    and value_state = 'disponivel') as ag_saturados,
      count(*)                                                                                    as nutrients_available
    from public.nutrition_food_nutrients
    group by food_id
  ) n on n.food_id = f.id;

comment on view public.nutrition_foods_view is
  'Pivô DERIVADO dos nutrientes principais para ordenar/filtrar o catálogo. Nunca materializar: a fonte de verdade é nutrition_food_nutrients.';
