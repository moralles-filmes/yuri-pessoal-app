import { describe, expect, it } from "vitest";
import {
  VOCABULARIO_DE_COBRANCA,
  VOCABULARIO_DE_PRESCRICAO,
  termosProibidosEm,
} from "@/lib/tone/vocabulary";
import { isOptInNotification } from "./constants";
import { generateAiNotifications, segundaDaSemana, type AiGenInput } from "./ai";

const VAZIO: AiGenInput = {
  hoje: "2026-09-19",
  budgets: [],
  providerProblems: [],
  stuckActions: [],
  insights: [],
};

describe("segundaDaSemana", () => {
  it("devolve a segunda da semana de uma sexta", () => {
    expect(segundaDaSemana("2026-09-19")).toBe("2026-09-14");
  });

  it("devolve a própria data quando já é segunda", () => {
    expect(segundaDaSemana("2026-09-14")).toBe("2026-09-14");
  });

  it("atravessa a virada de mês", () => {
    expect(segundaDaSemana("2026-10-01")).toBe("2026-09-28");
  });

  it("trata domingo como fim da semana que começou na segunda anterior", () => {
    expect(segundaDaSemana("2026-09-20")).toBe("2026-09-14");
  });
});

describe("orçamento", () => {
  const base: AiGenInput = {
    ...VAZIO,
    budgets: [
      { escopo: "mensal", competencia: "2026-09", totalUsd: 9.1, limiteUsd: 10, nivelJaAvisado: 0 },
    ],
  };

  it("avisa quando o nível sobe", () => {
    const [c] = generateAiNotifications(base);
    expect(c.type).toBe("ai_budget_threshold");
    expect(c.title).toContain("90%");
    expect(c.link).toBe("/ia/consumo");
  });

  it("NÃO avisa de novo o nível já avisado", () => {
    const input = {
      ...base,
      budgets: [{ ...base.budgets[0], nivelJaAvisado: 90 }],
    };
    expect(generateAiNotifications(input)).toHaveLength(0);
  });

  it("não avisa sem limite configurado", () => {
    const input = {
      ...base,
      budgets: [{ ...base.budgets[0], limiteUsd: null }],
    };
    expect(generateAiNotifications(input)).toHaveLength(0);
  });

  it("só o 100% é medium; os demais são low", () => {
    const cem = generateAiNotifications({
      ...base,
      budgets: [{ ...base.budgets[0], totalUsd: 10 }],
    });
    expect(cem[0].priority).toBe("medium");
    expect(generateAiNotifications(base)[0].priority).toBe("low");
  });

  it("a chave inclui o nível, para 70 e 90 não colidirem", () => {
    const noventa = generateAiNotifications(base)[0].dedupe_key;
    const cem = generateAiNotifications({
      ...base,
      budgets: [{ ...base.budgets[0], totalUsd: 10 }],
    })[0].dedupe_key;
    expect(noventa).not.toBe(cem);
  });
});

describe("ação sem desfecho", () => {
  const input: AiGenInput = {
    ...VAZIO,
    stuckActions: [
      { executionId: "exec-1", command: "lancarTransacao", iniciadaEm: "2026-09-18T14:00:00.000Z" },
    ],
  };

  it("aponta para o filtro de problemas", () => {
    const [c] = generateAiNotifications(input);
    expect(c.type).toBe("ai_action_stuck");
    expect(c.link).toBe("/ia/acoes?filtro=problemas");
    expect(c.entity_id).toBe("exec-1");
  });

  // Invariante 52: `executando` erra para "pode não ter acontecido", NUNCA para "aconteceu".
  it("não afirma que a ação aconteceu nem que falhou", () => {
    const [c] = generateAiNotifications(input);
    const texto = `${c.title} ${c.description ?? ""}`.toLocaleLowerCase("pt-BR");
    expect(texto).not.toContain("falhou");
    expect(texto).not.toContain("foi aplicada");
    expect(texto).not.toContain("concluída");
  });
});

describe("provedor", () => {
  it("gera um aviso por provedor com problema", () => {
    const [c] = generateAiNotifications({
      ...VAZIO,
      providerProblems: [{ provider: "anthropic", motivo: "credencial", desde: "2026-09-19" }],
    });
    expect(c.type).toBe("ai_provider_problem");
    expect(c.link).toBe("/ia/configuracoes");
  });
});

describe("insight disponível", () => {
  const input: AiGenInput = {
    ...VAZIO,
    insights: [
      { insightId: "i-1", titulo: "Gasto com mercado", geradoEm: "2026-09-19" },
      { insightId: "i-2", titulo: "Volume de treino", geradoEm: "2026-09-19" },
    ],
  };

  // A chave é SEMANAL de propósito: um aviso por dia sobre análise vira cobrança.
  it("gera UM aviso por semana, mesmo com vários insights", () => {
    const saida = generateAiNotifications(input);
    expect(saida).toHaveLength(1);
    expect(saida[0].dedupe_key).toBe("ai-insight-semana:2026-09-14");
  });

  it("nasce desligada", () => {
    expect(isOptInNotification("ai_insight_available")).toBe(true);
  });

  it("as outras três nascem ligadas", () => {
    expect(isOptInNotification("ai_budget_threshold")).toBe(false);
    expect(isOptInNotification("ai_provider_problem")).toBe(false);
    expect(isOptInNotification("ai_action_stuck")).toBe(false);
  });
});

describe("tom e forma", () => {
  const cheio: AiGenInput = {
    hoje: "2026-09-19",
    budgets: [
      { escopo: "mensal", competencia: "2026-09", totalUsd: 9.1, limiteUsd: 10, nivelJaAvisado: 0 },
      { escopo: "diario", competencia: "2026-09-19", totalUsd: 0.8, limiteUsd: 1, nivelJaAvisado: 0 },
    ],
    providerProblems: [{ provider: "openai", motivo: "indisponivel", desde: "2026-09-19" }],
    stuckActions: [
      { executionId: "exec-1", command: "criarTarefaTodo", iniciadaEm: "2026-09-18T14:00:00.000Z" },
    ],
    insights: [{ insightId: "i-1", titulo: "Proteína na semana", geradoEm: "2026-09-19" }],
  };

  it("nenhuma é high nem urgent", () => {
    for (const c of generateAiNotifications(cheio)) {
      expect(["low", "medium"]).toContain(c.priority);
    }
  });

  it("toda notificação tem link", () => {
    for (const c of generateAiNotifications(cheio)) {
      expect(c.link).toBeTruthy();
    }
  });

  it("as chaves de dedupe são únicas no lote", () => {
    const chaves = generateAiNotifications(cheio).map((c) => c.dedupe_key);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("rodar três vezes produz exatamente as mesmas chaves", () => {
    const uma = generateAiNotifications(cheio)
      .map((c) => c.dedupe_key)
      .sort();
    const duas = generateAiNotifications(cheio)
      .map((c) => c.dedupe_key)
      .sort();
    const tres = generateAiNotifications(cheio)
      .map((c) => c.dedupe_key)
      .sort();
    expect(duas).toEqual(uma);
    expect(tres).toEqual(uma);
  });

  it("sem linguagem de cobrança nem de prescrição", () => {
    for (const c of generateAiNotifications(cheio)) {
      const texto = `${c.title} ${c.description ?? ""}`;
      expect(termosProibidosEm(texto, VOCABULARIO_DE_COBRANCA)).toEqual([]);
      expect(termosProibidosEm(texto, VOCABULARIO_DE_PRESCRICAO)).toEqual([]);
    }
  });

  it("entrada vazia não gera nada", () => {
    expect(generateAiNotifications(VAZIO)).toEqual([]);
  });
});
