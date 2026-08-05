import { describe, expect, it } from "vitest";
import type { ToolPermission } from "@/lib/ai/tools/contracts";
import { ASSISTENTE_PESSOAL_ID } from "./registry";
import { routeAgent, TREINOS_AGENT_ID } from "./routing";

const LIGADO: Partial<Record<ToolPermission, boolean>> = { allow_training: true };
const DESLIGADO: Partial<Record<ToolPermission, boolean>> = { allow_training: false };

describe("routeAgent", () => {
  it("manda para Treinos quando o texto fala de treino", () => {
    const r = routeAgent({
      texto: "quanto volume eu fiz de treino essa semana?",
      pageContext: null,
      permissions: LIGADO,
    });
    expect(r.agentId).toBe(TREINOS_AGENT_ID);
  });

  it("reconhece palavra acentuada e maiúscula", () => {
    const r = routeAgent({
      texto: "Meu RECORDE de AGACHAMENTO subiu?",
      pageContext: null,
      permissions: LIGADO,
    });
    expect(r.agentId).toBe(TREINOS_AGENT_ID);
  });

  it("o contexto da página vence o texto ambíguo", () => {
    const r = routeAgent({
      texto: "e aí, como estou indo?",
      pageContext: { modulo: "training" },
      permissions: LIGADO,
    });
    expect(r.agentId).toBe(TREINOS_AGENT_ID);
    expect(r.motivo).toContain("página");
  });

  it("texto explícito vence o contexto da página", () => {
    const r = routeAgent({
      texto: "quanto eu gastei no cartão?",
      pageContext: { modulo: "training" },
      permissions: { ...LIGADO, allow_finance: false },
    });
    expect(r.agentId).toBe(ASSISTENTE_PESSOAL_ID);
  });

  // A trava que importa: flag desligada NUNCA vira agente especializado.
  it("com a flag desligada, cai no orquestrador mesmo com texto claríssimo", () => {
    const r = routeAgent({
      texto: "qual foi meu último treino de supino?",
      pageContext: { modulo: "training" },
      permissions: DESLIGADO,
    });
    expect(r.agentId).toBe(ASSISTENTE_PESSOAL_ID);
    expect(r.motivo).toContain("não autorizada");
  });

  it("sem sinal nenhum, orquestrador", () => {
    const r = routeAgent({
      texto: "me ajuda a organizar minha semana",
      pageContext: null,
      permissions: LIGADO,
    });
    expect(r.agentId).toBe(ASSISTENTE_PESSOAL_ID);
  });

  it("é puro: a mesma entrada devolve sempre a mesma saída", () => {
    const entrada = {
      texto: "volume de treino",
      pageContext: null,
      permissions: LIGADO,
    };
    expect(routeAgent(entrada)).toEqual(routeAgent(entrada));
  });

  it("normaliza acento, caixa alta e caixa mista da mesma forma", () => {
    const base = routeAgent({
      texto: "agachamento",
      pageContext: null,
      permissions: LIGADO,
    });
    const maiuscula = routeAgent({
      texto: "AGACHAMENTO",
      pageContext: null,
      permissions: LIGADO,
    });
    const acentuada = routeAgent({
      texto: "agachaménto",
      pageContext: null,
      permissions: LIGADO,
    });
    expect(maiuscula.agentId).toBe(base.agentId);
    expect(acentuada.agentId).toBe(base.agentId);
    expect(base.agentId).toBe(TREINOS_AGENT_ID);
  });

  // Regressão: "rm" isolado (2 letras) casava como token solto em qualquer texto —
  // "rm -rf", "RM" de empresa/pessoa, "rm de matrícula" — nada disso é sobre treino.
  it("gatilho curto e ambíguo não captura texto fora do domínio de treino", () => {
    const frases = [
      "vou rodar rm -rf no servidor",
      "qual o RM dela?",
      "empresa RM Sistemas",
      "preciso saber meu rm de matricula",
    ];
    for (const texto of frases) {
      const r = routeAgent({ texto, pageContext: null, permissions: LIGADO });
      expect(r.agentId).toBe(ASSISTENTE_PESSOAL_ID);
    }
  });

  it("1RM continua reconhecido como treino, mesmo depois de remover o 'rm' isolado", () => {
    const r = routeAgent({
      texto: "meu 1rm de supino subiu",
      pageContext: null,
      permissions: LIGADO,
    });
    expect(r.agentId).toBe(TREINOS_AGENT_ID);
  });
});
