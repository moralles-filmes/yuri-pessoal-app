import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
const dir = path.resolve("supabase/migrations");
const sql = fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort().map(f => fs.readFileSync(path.join(dir, f), "utf8")).filter(s => /create or replace function public.ai_begin_insight_run\(/i.test(s)).at(-1)!.replace(/--[^\n]*/g, "").toLowerCase();
describe("admissão de insight sem sessão", () => {
  it("reconcilia por sessão só quando auth.uid existe", () => {
    expect(sql).toMatch(/if auth\.uid\(\) is not null then\s+perform public\.ai_reconcile_abandoned_runs\(20\);\s+end if;/);
    expect(sql.match(/perform public\.ai_reconcile_abandoned_runs\(20\);/g)).toHaveLength(1);
  });
  it("preserva invoker, search_path vazio, grants mínimos e lock por dono", () => {
    expect(sql).toMatch(/security invoker/);
    expect(sql).toMatch(/(?:set search_path to|set search_path =) ''/);
    expect(sql).toMatch(/revoke all on function public\.ai_begin_insight_run\([^;]+from public, anon;/);
    expect(sql).toMatch(/grant execute on function public\.ai_begin_insight_run\([^;]+to authenticated, service_role;/);
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('ai:begin_run:' || v_user::text, 0))");
  });
});
