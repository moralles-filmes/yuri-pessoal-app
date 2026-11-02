/**
 * REDESIGN-06 T11 (D-06-M5) — erro de leitura de notificações nunca vira "Em breve".
 *
 * Só a tabela ausente (42P01) segue indisponível; qualquer outro erro lança ErroDeLeitura, que o
 * card captura e mostra como falha.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErroDeLeitura } from "@/lib/supabase/leitura";

const resposta = vi.hoisted(() => ({ atual: {} as Record<string, unknown> }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: async () => resposta.atual,
        }),
      }),
    }),
  }),
}));

const { getNotificationsCardData } = await import("@/lib/dashboard/queries");

describe("T11 · getNotificationsCardData", () => {
  beforeEach(() => {
    resposta.atual = {};
  });

  it("erro de leitura rejeita com ErroDeLeitura", async () => {
    resposta.atual = { count: null, error: { code: "XX000", message: "x" } };
    const promessa = getNotificationsCardData();
    await expect(promessa).rejects.toBeInstanceOf(ErroDeLeitura);
    await expect(promessa).rejects.toMatchObject({ oQue: "as notificações", codigo: "XX000" });
  });

  it("tabela ausente (42P01) segue indisponível", async () => {
    resposta.atual = { count: null, error: { code: "42P01" } };
    await expect(getNotificationsCardData()).resolves.toEqual({ available: false, unread: 0 });
  });

  it("sucesso devolve a contagem", async () => {
    resposta.atual = { count: 3, error: null };
    await expect(getNotificationsCardData()).resolves.toEqual({ available: true, unread: 3 });
  });
});
