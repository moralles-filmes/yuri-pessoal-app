import fs from "node:fs";
import { describe, expect, it } from "vitest";
const arquivos=fs.readdirSync("supabase/migrations").filter(p=>p.endsWith(".sql")).sort();
const sql=arquivos.map(p=>fs.readFileSync("supabase/migrations/"+p,"utf8")).filter(s=>/create unique index[\s\S]*ai_action_executions_undoes_user_uidx/i.test(s)).at(-1)!.replace(/--[^\n]*/g,"").toLowerCase();
describe("índice do desfazer que falhou",()=>{
  it("mantém unicidade por alvo e dono, exceto em falha",()=>{
    expect(sql).toMatch(/create unique index ai_action_executions_undoes_user_uidx\s+on public.ai_action_executions\s*\(undoes_execution_id, user_id\)\s+where undoes_execution_id is not null and status <> 'falhou'/);
  });
  it("substitui só o índice de desfazer e não modifica tabelas nem RLS",()=>{
    expect(sql).toContain("drop index if exists public.ai_action_executions_undoes_user_uidx;");
    expect(sql.match(/drop index/g)).toHaveLength(1);
    expect(sql).not.toMatch(/alter table|delete from|drop table/);
  });
});
