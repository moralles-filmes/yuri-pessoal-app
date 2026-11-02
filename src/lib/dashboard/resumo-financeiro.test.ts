import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ErroDeLeitura } from "@/lib/supabase/leitura";
import { lerFinanceiro, lerSaldoAte } from "@/lib/finance/queries";
import {
  ESCOPO_CARD_FINANCEIRO,
  ESCOPO_HISTORICO_DO_DASHBOARD,
} from "@/lib/finance/pipeline";

// Um memoizador por argumentos, no lugar do `cache` do React (que só existe dentro de uma
// requisição do Next). O `vi.hoisted` é necessário porque o `vi.mock` sobe acima dos imports.
const { memoizarPorArgumentos } = vi.hoisted(() => ({
  memoizarPorArgumentos: <A extends unknown[], R>(fn: (...args: A) => R) => {
    const memo = new Map<string, R>();
    return (...args: A): R => {
      const chave = JSON.stringify(args);
      if (!memo.has(chave)) memo.set(chave, fn(...args));
      return memo.get(chave) as R;
    };
  },
}));

vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  cache: memoizarPorArgumentos,
}));

vi.mock("@/lib/finance/queries", () => ({
  lerFinanceiro: vi.fn(),
  lerSaldoAte: vi.fn(),
}));

import { lerResumoDoDashboard } from "./resumo-financeiro";

const LEITURA_VAZIA = {
  entradas: { txs: [], sts: [], recs: [], bills: [] },
  contas: [],
  completude: { estado: "exato" },
};

const LEITURA_HISTORICO_VAZIA = {
  entradas: { txs: [] },
  completude: { estado: "exato" },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(lerFinanceiro).mockImplementation(async (params) => {
    if (params.escopo === ESCOPO_HISTORICO_DO_DASHBOARD) {
      return LEITURA_HISTORICO_VAZIA as never;
    }
    return LEITURA_VAZIA as never;
  });
  vi.mocked(lerSaldoAte).mockResolvedValue(1000);
});

describe("lerResumoDoDashboard", () => {
  it("duas chamadas com os mesmos argumentos leem o banco uma vez só", async () => {
    // Argumentos exclusivos deste teste: o memoizador vive o módulo inteiro.
    await lerResumoDoDashboard("2026-11", "2026-11-18");
    await lerResumoDoDashboard("2026-11", "2026-11-18");

    expect(lerFinanceiro).toHaveBeenCalledTimes(2);
    expect(lerSaldoAte).toHaveBeenCalledTimes(1);
    expect(lerSaldoAte).toHaveBeenCalledWith("2026-11-19");
    expect(vi.mocked(lerFinanceiro).mock.calls).toEqual(
      expect.arrayContaining([
        [
          {
            janela: { from: "2026-11-01", to: "2026-11-30" },
            escopo: ESCOPO_CARD_FINANCEIRO,
          },
        ],
        [
          {
            janela: { from: "2026-06-01", to: "2026-10-31" },
            escopo: ESCOPO_HISTORICO_DO_DASHBOARD,
          },
        ],
      ]),
    );
  });

  it("está embrulhada em cache( na fonte, sem comentários", () => {
    const fonte = readFileSync(new URL("./resumo-financeiro.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    expect(fonte).toContain("cache(async");
  });

  it("um erro de leitura sobe sem ser capturado", async () => {
    const erro = new ErroDeLeitura("os lançamentos");
    vi.mocked(lerFinanceiro).mockRejectedValue(erro);

    await expect(lerResumoDoDashboard("2026-10", "2026-10-15")).rejects.toBe(erro);
  });
});
