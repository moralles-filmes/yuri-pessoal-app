import { describe, expect, it, vi } from "vitest";
import {
  desfechoDesconhecido,
  gravadoEmParte,
  nadaGravado,
  traduzirErroDaRpc,
} from "@/lib/actions/helpers";

// `helpers.ts` importa o client do servidor (cookies); a lógica testada aqui não o usa.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

describe("as três formas de falha de escrita (D-G2-16)", () => {
  it("nadaGravado afirma que nada mudou", () => {
    expect(nadaGravado("salvar o lançamento")).toEqual({
      ok: false,
      error: "Não foi possível salvar o lançamento. Nada foi alterado.",
    });
  });

  it("gravadoEmParte devolve a frase de quem chama, sem acrescentar nada", () => {
    expect(gravadoEmParte("O lançamento foi salvo, mas a divisão não.")).toEqual({
      ok: false,
      error: "O lançamento foi salvo, mas a divisão não.",
    });
  });

  it("desfechoDesconhecido erra para 'pode ter acontecido'", () => {
    expect(desfechoDesconhecido("sido lançado", "Lançamentos")).toEqual({
      ok: false,
      error:
        "Não foi possível confirmar o resultado: pode ter sido lançado. Confira em Lançamentos antes de tentar de novo.",
    });
  });
});

describe("traduzirErroDaRpc", () => {
  it("sem code (fetch falho, timeout): desfecho desconhecido, nunca 'Nada foi alterado'", () => {
    const r = traduzirErroDaRpc({ message: "fetch failed" }, "salvar o lançamento");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("pode ter sido salvo");
    expect(r.error).toContain("Confira em Lançamentos");
    expect(r.error).not.toContain("Nada foi alterado");
    expect(r.error).not.toContain("fetch failed");
  });

  it("erro nulo também é desfecho desconhecido", () => {
    const r = traduzirErroDaRpc(null, "salvar o lançamento");
    expect(!r.ok && r.error).toContain("pode ter sido salvo");
  });

  it("code com tamanho que não é de SQLSTATE é tratado como sem code", () => {
    const r = traduzirErroDaRpc({ code: "FETCH_ERROR", message: "x" }, "salvar o lançamento");
    expect(!r.ok && r.error).toContain("pode ter sido salvo");
  });

  it("P0001 DIVISAO_PROTEGIDA: frase própria, termina em 'Nada foi alterado.' e não vaza a mensagem", () => {
    const r = traduzirErroDaRpc(
      { code: "P0001", message: "DIVISAO_PROTEGIDA: recebivel 123" },
      "salvar o lançamento",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.endsWith("Nada foi alterado.")).toBe(true);
    expect(r.error).not.toContain("DIVISAO_PROTEGIDA");
    expect(r.error).not.toContain("123");
    expect(r.error).toContain("A Receber");
  });

  it("PARCELADO_NAO_MUDA_DE_TIPO e LANCAMENTO_NAO_ENCONTRADO têm frase própria", () => {
    const parcelado = traduzirErroDaRpc(
      { code: "P0001", message: "PARCELADO_NAO_MUDA_DE_TIPO" },
      "salvar o lançamento",
    );
    expect(!parcelado.ok && parcelado.error).toBe(
      "Compra parcelada muda em Parcelamentos. Nada foi alterado.",
    );
    const faltando = traduzirErroDaRpc(
      { code: "P0001", message: "LANCAMENTO_NAO_ENCONTRADO" },
      "salvar o lançamento",
    );
    expect(!faltando.ok && faltando.error).toBe("Lançamento não encontrado. Nada foi alterado.");
  });

  it("outro código SQLSTATE (ex.: violação de CHECK): nadaGravado(oQue), sem repassar a mensagem", () => {
    const r = traduzirErroDaRpc(
      { code: "23514", message: 'new row violates check constraint "transactions_x"' },
      "salvar o lançamento",
    );
    expect(r).toEqual({
      ok: false,
      error: "Não foi possível salvar o lançamento. Nada foi alterado.",
    });
  });
});
