import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const store = vi.hoisted(() => vi.fn((assinar: (f: () => void) => () => void, snapshot: () => number | null, servidor: () => null) => ({ assinar, snapshot, servidor })));
vi.mock("react", () => ({ useSyncExternalStore: store }));
// O hook de React foi substituído por captura; aqui exercitamos os callbacks do store.
let lerStore: typeof import("./use-agora").useAgora;
const relogio = (ativo = true) => { lerStore(ativo); return store.mock.results.at(-1)!.value; };
beforeEach(async () => {
  vi.resetModules(); store.mockClear(); vi.useFakeTimers(); vi.setSystemTime(100_000);
  ({ useAgora: lerStore } = await import("./use-agora"));
});
afterEach(() => { vi.useRealTimers(); });
describe("Task 27 — relógio hidratável", () => {
  it("servidor e primeira leitura são null; o snapshot fica estável entre tiques", () => {
    const r = relogio();
    expect(r.servidor()).toBeNull(); expect(r.snapshot()).toBeNull();
    const avisar = vi.fn(); const sair = r.assinar(avisar);
    expect(r.snapshot()).toBe(100_000); expect(avisar).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(29_999); expect(r.snapshot()).toBe(100_000);
    vi.advanceTimersByTime(1); expect(r.snapshot()).toBe(130_000);
    expect(avisar).toHaveBeenCalledTimes(2);
    expect(r.servidor()).toBeNull(); sair();
  });
  it("compartilha um intervalo e só para quando o último cartão sai", () => {
    const r = relogio(); const a = vi.fn(); const b = vi.fn();
    const sairA = r.assinar(a); const sairB = r.assinar(b);
    expect(vi.getTimerCount()).toBe(1);
    sairA(); a.mockClear(); b.mockClear();
    vi.advanceTimersByTime(30_000);
    expect(a).not.toHaveBeenCalled(); expect(b).toHaveBeenCalledTimes(1);
    sairB(); expect(vi.getTimerCount()).toBe(0); expect(r.snapshot()).toBeNull();
  });
  it("não cria relógio para cartão decidido e se recupera numa nova assinatura", () => {
    const parado = relogio(false); const aviso = vi.fn(); const sairParado = parado.assinar(aviso);
    expect(vi.getTimerCount()).toBe(0); expect(aviso).not.toHaveBeenCalled(); sairParado();
    const r = relogio(); const sair = r.assinar(aviso); sair();
    vi.setSystemTime(900_000); const sairDeNovo = r.assinar(aviso);
    expect(r.snapshot()).toBe(900_000); sairDeNovo();
  });
});
