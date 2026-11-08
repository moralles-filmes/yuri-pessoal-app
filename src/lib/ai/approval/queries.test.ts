import { beforeEach, describe, expect, it, vi } from "vitest";
const d = vi.hoisted(() => ({ status: "falhou", filtros: [] as unknown[][] }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => {
  let aceitos: readonly string[] | undefined;
  const q = { select: () => q, eq: (k: string,v: unknown) => { d.filtros.push([k,v]); return q; },
    in: (k: string,v: readonly string[]) => { d.filtros.push([k,v]); aceitos=v; return q; },
    maybeSingle: async () => ({ data: !aceitos || aceitos.includes(d.status) ? { id: "inverso" } : null, error: null }) };
  return q;
} }) }));
import { jaFoiDesfeita } from "./queries";
beforeEach(() => { d.status="falhou";d.filtros=[]; });
describe("desfazer existente por dono e desfecho", () => {
  it.each(["falhou","desconhecido"])("%s não bloqueia novo pedido", async status => {
    d.status=status;expect(await jaFoiDesfeita("dono","alvo")).toBe(false);
  });
  it.each(["executando","sucesso","parcial"])("%s reserva o desfazer", async status => {
    d.status=status;expect(await jaFoiDesfeita("dono","alvo")).toBe(true);
    expect(d.filtros).toContainEqual(["user_id","dono"]);
    expect(d.filtros).toContainEqual(["undoes_execution_id","alvo"]);
    expect(d.filtros).toContainEqual(["status",["executando","sucesso","parcial"]]);
  });
});
