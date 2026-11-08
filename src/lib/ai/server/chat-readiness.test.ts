import { beforeEach, describe, expect, it, vi } from "vitest";
const estado = vi.hoisted(() => ({ cruzar: false, provedor: true, cripto: null as string | null }));
vi.mock("@/lib/ai/queries", () => ({
  getRouterConfigs: vi.fn(async () => []),
  getAiPreferences: vi.fn(async () => ({ allowCrossModule: estado.cruzar })),
}));
vi.mock("@/lib/ai/core/router", () => ({ usableProviders: () => estado.provedor ? [{}] : [] }));
vi.mock("@/lib/ai/server/crypto-readiness", () => ({ cryptoProblemMessage: () => estado.cripto }));
import { prontidaoDoChat } from "./chat-readiness";

describe("prontidão do chat e dos panoramas", () => {
  beforeEach(() => { estado.cruzar = false; estado.provedor = true; estado.cripto = null; });
  it.each([false, true])("podeCruzarModulos reflete allow_cross_module = %s", async (ligada) => {
    estado.cruzar = ligada;
    expect(await prontidaoDoChat("dono")).toEqual({ podeConversar: true, motivoBloqueio: null, podeCruzarModulos: ligada });
  });
  it("sem provedor impede conversar mesmo com cruzamento ligado", async () => {
    estado.cruzar = true;
    estado.provedor = false;
    expect(await prontidaoDoChat("dono")).toMatchObject({ podeConversar: false, podeCruzarModulos: true });
  });
  it("problema de cripto tem precedência sobre provedor ausente", async () => {
    estado.cripto = "Cripto indisponível.";
    estado.provedor = false;
    expect(await prontidaoDoChat("dono")).toMatchObject({ podeConversar: false, motivoBloqueio: estado.cripto });
  });
});
