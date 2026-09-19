-- Auditoria de performance · P4 — `auth.uid()` avaliado UMA VEZ, não por linha.
--
-- ═══════════ O QUE ESTA MIGRATION FAZ, E POR QUE SÓ NESTAS DUAS TABELAS ═══════════
--
-- `auth.uid()` é uma função SQL que o planner INLINA na expressão da policy. Sem um
-- subselect em volta, ela vira isto, avaliado **a cada linha varrida**:
--
--   coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
--            (nullif(current_setting('request.jwt.claims', true), ''))::jsonb ->> 'sub')::uuid
--
-- Dois `current_setting`, um parse de jsonb e um cast — 21.147 vezes na varredura de
-- `nutrition_food_nutrients`. Envolver em `(select auth.uid())` transforma isso num
-- **InitPlan**: o Postgres a avalia uma vez e compara o escalar. É a correção que o próprio
-- advisor do Supabase recomenda (`auth_rls_initplan`), e é **semanticamente idêntica** —
-- `auth.uid()` é estável dentro de uma instrução, então uma avaliação e 21 mil dão o mesmo
-- valor por construção.
--
-- MEDIDO em 2026-09-19, com `EXPLAIN (analyze, timing off)` e o papel `authenticated`
-- (`timing on` mente aqui: já acusou 150 ms onde o real eram 3 ms):
--
--   varredura de `nutrition_food_nutrients` ....... 34,8 ms → 2,8 ms   (−92%)
--   `nutrition_foods_view` inteira, com RLS ....... 49,2 ms → 14,6 ms  (−70%)
--
-- Os 14,6 ms que sobram são exatamente o tempo da view SEM RLS (14,4 ms medidos como service
-- role): a sobrecarga da policy foi a zero.
--
-- ⚠️ **SÓ ESTAS DUAS TABELAS, de propósito.** O advisor aponta 187 policies no banco, mas o
-- custo é proporcional ao número de linhas varridas, e só três tabelas do `public` passam de
-- 500 linhas: `nutrition_food_nutrients` (21.147), `notifications` (794) e `nutrition_foods`
-- (597). Nas outras 181 o ganho é ruído, e mexer em objeto de segurança sem ganho medido é
-- risco sem contrapartida. Elas voltam à mesa quando alguma tabela crescer.
--
-- ⛔ **A INVARIANTE 3 DO MÓDULO DIETA CONTINUA DE PÉ**: as policies seguem SEPARADAS POR
-- COMANDO, e só a de SELECT alcança a base do sistema (`user_id is null`). As de escrita não
-- ganharam o `OR user_id is null` — a base global continua imutável. A única coisa que mudou
-- em cada expressão foi o parêntese em volta de `auth.uid()`.
--
-- Idempotente: `alter policy` reescreve a expressão; rodar de novo não muda nada.

-- ── nutrition_foods ─────────────────────────────────────────────────────────────────────

alter policy "select own or global" on public.nutrition_foods
  using ((user_id = (select auth.uid())) or (user_id is null));

alter policy "insert own" on public.nutrition_foods
  with check (user_id = (select auth.uid()));

alter policy "update own" on public.nutrition_foods
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "delete own" on public.nutrition_foods
  using (user_id = (select auth.uid()));

-- ── nutrition_food_nutrients ────────────────────────────────────────────────────────────

alter policy "select own or global" on public.nutrition_food_nutrients
  using ((user_id = (select auth.uid())) or (user_id is null));

alter policy "insert own" on public.nutrition_food_nutrients
  with check (user_id = (select auth.uid()));

alter policy "update own" on public.nutrition_food_nutrients
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "delete own" on public.nutrition_food_nutrients
  using (user_id = (select auth.uid()));
