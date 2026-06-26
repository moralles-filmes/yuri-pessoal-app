import { describe, expect, it } from "vitest";
import {
  asPeriod,
  asView,
  isIsoDate,
  resolveWindow,
  windowLabel,
} from "@/lib/dashboard/period";
import {
  DEFAULT_DASHBOARD_LAYOUT,
  normalizeLayout,
  visibleCards,
  type DashboardLayout,
} from "@/lib/dashboard/cards";

// 2026-06-26 é uma SEXTA (semana segunda 22 → domingo 28).
const HOJE = "2026-06-26";

describe("isIsoDate", () => {
  it("aceita datas válidas e rejeita inválidas", () => {
    expect(isIsoDate("2026-06-26")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false); // 2026 não é bissexto
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("26/06/2026")).toBe(false);
    expect(isIsoDate("")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });
});

describe("resolveWindow", () => {
  it("hoje → janela de um dia, visão dia, mês atual", () => {
    const w = resolveWindow({ period: "hoje", today: HOJE });
    expect(w).toMatchObject({ period: "hoje", view: "dia", from: HOJE, to: HOJE, mes: "2026-06" });
  });

  it("semana → segunda a domingo (weekStartsOn 1)", () => {
    const w = resolveWindow({ period: "semana", today: HOJE });
    expect(w).toMatchObject({
      period: "semana",
      view: "semana",
      from: "2026-06-22",
      to: "2026-06-28",
      mes: "2026-06",
    });
  });

  it("semana que cruza o mês mantém o mês atual de referência", () => {
    // 2026-07-01 é quarta → segunda 2026-06-29, domingo 2026-07-05.
    const w = resolveWindow({ period: "semana", today: "2026-07-01" });
    expect(w.from).toBe("2026-06-29");
    expect(w.to).toBe("2026-07-05");
    expect(w.mes).toBe("2026-07");
  });

  it("mes → primeiro ao último dia do mês", () => {
    const w = resolveWindow({ period: "mes", today: HOJE });
    expect(w).toMatchObject({
      period: "mes",
      view: "mes",
      from: "2026-06-01",
      to: "2026-06-30",
      mes: "2026-06",
    });
  });

  it("mes_anterior → mês anterior completo, mês de referência anterior", () => {
    const w = resolveWindow({ period: "mes_anterior", today: HOJE });
    expect(w).toMatchObject({
      period: "mes_anterior",
      view: "mes",
      from: "2026-05-01",
      to: "2026-05-31",
      mes: "2026-05",
    });
  });

  it("mes_anterior trata virada de ano (janeiro → dezembro)", () => {
    const w = resolveWindow({ period: "mes_anterior", today: "2026-01-15" });
    expect(w.from).toBe("2025-12-01");
    expect(w.to).toBe("2025-12-31");
    expect(w.mes).toBe("2025-12");
  });

  it("custom válido preserva a janela e deriva a visão pelo tamanho", () => {
    const dia = resolveWindow({ period: "custom", today: HOJE, from: "2026-06-10", to: "2026-06-10" });
    expect(dia).toMatchObject({ view: "dia", from: "2026-06-10", to: "2026-06-10", mes: "2026-06" });

    const semana = resolveWindow({ period: "custom", today: HOJE, from: "2026-06-01", to: "2026-06-07" });
    expect(semana.view).toBe("semana");

    const mes = resolveWindow({ period: "custom", today: HOJE, from: "2026-06-01", to: "2026-06-30" });
    expect(mes.view).toBe("mes");
  });

  it("custom com datas trocadas inverte from/to", () => {
    const w = resolveWindow({ period: "custom", today: HOJE, from: "2026-06-30", to: "2026-06-01" });
    expect(w.from).toBe("2026-06-01");
    expect(w.to).toBe("2026-06-30");
  });

  it("custom inválido/incompleto cai para o mês atual", () => {
    const semFim = resolveWindow({ period: "custom", today: HOJE, from: "2026-06-01", to: null });
    expect(semFim).toMatchObject({ period: "mes", from: "2026-06-01", to: "2026-06-30" });

    const lixo = resolveWindow({ period: "custom", today: HOJE, from: "abc", to: "def" });
    expect(lixo.period).toBe("mes");
  });

  it("today inválido não quebra (usa um fallback determinístico de janela)", () => {
    const w = resolveWindow({ period: "mes", today: "lixo" });
    expect(w.from.endsWith("-01")).toBe(true);
    expect(/^\d{4}-\d{2}-\d{2}$/.test(w.to)).toBe(true);
  });
});

describe("windowLabel", () => {
  it("gera rótulos pt-BR coerentes por período", () => {
    expect(windowLabel(resolveWindow({ period: "hoje", today: HOJE }))).toContain("Hoje");
    expect(windowLabel(resolveWindow({ period: "semana", today: HOJE }))).toContain("22/06");
    expect(windowLabel(resolveWindow({ period: "mes", today: HOJE }))).toMatch(/junho de 2026/i);
    expect(windowLabel(resolveWindow({ period: "custom", today: HOJE, from: "2026-06-03", to: "2026-06-09" }))).toContain("–");
  });
});

describe("asPeriod / asView", () => {
  it("normaliza valores desconhecidos para defaults", () => {
    expect(asPeriod("semana")).toBe("semana");
    expect(asPeriod("xxx")).toBe("mes");
    expect(asPeriod(undefined)).toBe("mes");
    expect(asView("dia")).toBe("dia");
    expect(asView("xxx")).toBe("mes");
  });
});

describe("normalizeLayout", () => {
  it("vazio → layout padrão (todos os cards, nada oculto)", () => {
    const l = normalizeLayout({});
    expect(l.order).toEqual(DEFAULT_DASHBOARD_LAYOUT.order);
    expect(l.hidden).toEqual([]);
    expect(l.period).toBe("mes");
    expect(l.view).toBe("mes");
  });

  it("anexa cards conhecidos ausentes preservando a ordem salva", () => {
    const l = normalizeLayout({ order: ["estudos", "financeiro"], hidden: ["agenda"], period: "semana", view: "semana" });
    expect(l.order.slice(0, 2)).toEqual(["estudos", "financeiro"]);
    // todos os ids presentes, sem duplicar
    expect(new Set(l.order).size).toBe(l.order.length);
    expect(l.order).toContain("notificacoes");
    expect(l.hidden).toEqual(["agenda"]);
    expect(l.period).toBe("semana");
  });

  it("descarta ids desconhecidos e oculto fora da ordem", () => {
    const l = normalizeLayout({ order: ["financeiro", "lixo"], hidden: ["lixo", "habitos"] });
    expect(l.order).not.toContain("lixo" as never);
    expect(l.hidden).toEqual(["habitos"]);
  });

  it("não lança com entradas malformadas", () => {
    expect(() => normalizeLayout(null)).not.toThrow();
    expect(() => normalizeLayout("string")).not.toThrow();
    expect(() => normalizeLayout({ order: 42, hidden: {}, period: 1 })).not.toThrow();
  });
});

describe("visibleCards", () => {
  it("exclui os ocultos preservando a ordem", () => {
    const layout: DashboardLayout = {
      order: ["financeiro", "faturas", "agenda", "tarefas", "habitos", "estudos", "notificacoes"],
      hidden: ["faturas", "notificacoes"],
      period: "mes",
      view: "mes",
    };
    expect(visibleCards(layout)).toEqual(["financeiro", "agenda", "tarefas", "habitos", "estudos"]);
  });
});
