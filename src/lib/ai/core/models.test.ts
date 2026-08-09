/**
 * Fase 18-D — IA · O catálogo, e a honestidade sobre o que foi conferido.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ POR QUE UMA LISTA ESCRITA À MÃO, E NÃO UM `filter` SOBRE O CATÁLOGO                   ║
 * ║                                                                                       ║
 * ║ Um teste que perguntasse "quais modelos têm visão?" ao próprio catálogo passaria com  ║
 * ║ QUALQUER resposta — inclusive com alguém marcando `visao` num modelo por engano numa  ║
 * ║ terça-feira. É a armadilha nº 1 da 18-B (teste que espelha a implementação), e a       ║
 * ║ solução é a mesma que o Bloco 4 da 18-C usou no registry de commands: uma LISTA        ║
 * ║ NOMEADA, que só muda se alguém a editar de propósito.                                  ║
 * ║                                                                                       ║
 * ║ Marcar um modelo como capaz de visão é uma afirmação sobre a documentação de um        ║
 * ║ terceiro. Deve doer um pouco.                                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { describe, expect, it } from "vitest";
import { AI_MODEL_CATALOG } from "./models";
import { hasRate } from "./pricing";

/** Conferido em 2026-08-08. Ver os comentários de procedência em `models.ts`. */
const COM_VISAO = [
  "anthropic/claude-sonnet-5",
  "anthropic/claude-haiku-4-5-20251001",
  "anthropic/claude-opus-5",
  "gemini/gemini-3.6-flash",
] as const;

/** PDF. Só a Anthropic afirma ("All active models support PDF processing"). */
const COM_ARQUIVO = [
  "anthropic/claude-sonnet-5",
  "anthropic/claude-haiku-4-5-20251001",
  "anthropic/claude-opus-5",
] as const;

const chave = (m: { provider: string; id: string }) => `${m.provider}/${m.id}`;

describe("capacidades declaradas", () => {
  it("os modelos com visão são EXATAMENTE os quatro conferidos", () => {
    const declarados = AI_MODEL_CATALOG.filter((m) =>
      m.capabilities.includes("visao"),
    ).map(chave);
    expect(declarados.sort()).toEqual([...COM_VISAO].sort());
  });

  it("os modelos com leitura de arquivo são EXATAMENTE os três da Anthropic", () => {
    const declarados = AI_MODEL_CATALOG.filter((m) =>
      m.capabilities.includes("arquivo"),
    ).map(chave);
    expect(declarados.sort()).toEqual([...COM_ARQUIVO].sort());
  });

  it("⛔ NENHUM modelo da OpenAI ou da xAI tem visão — a doc não nomeia os ids do catálogo", () => {
    const infratores = AI_MODEL_CATALOG.filter(
      (m) =>
        (m.provider === "openai" || m.provider === "xai") &&
        (m.capabilities.includes("visao") || m.capabilities.includes("arquivo")),
    ).map(chave);
    expect(infratores).toEqual([]);
  });
});

describe("honestidade da procedência", () => {
  it("quem declara visão ou arquivo declara TAMBÉM quando e onde isso foi conferido", () => {
    const semProcedencia = AI_MODEL_CATALOG.filter(
      (m) =>
        (m.capabilities.includes("visao") || m.capabilities.includes("arquivo")) &&
        !(m.capabilitiesVerifiedAt && m.capabilitiesSource),
    ).map(chave);
    expect(semProcedencia).toEqual([]);
  });

  it("a data da conferência de capacidade é data pura 'yyyy-MM-dd'", () => {
    for (const m of AI_MODEL_CATALOG) {
      if (m.capabilitiesVerifiedAt) {
        expect(m.capabilitiesVerifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("a fonte da capacidade é uma URL, não uma frase", () => {
    for (const m of AI_MODEL_CATALOG) {
      if (m.capabilitiesSource) {
        expect(m.capabilitiesSource.startsWith("https://")).toBe(true);
      }
    }
  });
});

describe("coerência com o resto do módulo", () => {
  it("⛔ MODELO SEM TARIFA NÃO É SELECIONÁVEL — vale para visão também", () => {
    // Sem preço não há reserva, e sem reserva o orçamento não protege nada. Um modelo de
    // visão sem tarifa seria exatamente o buraco que a 18-A fechou para texto.
    const semTarifa = AI_MODEL_CATALOG.filter(
      (m) =>
        m.status === "ativo" &&
        m.capabilities.includes("visao") &&
        !hasRate(m.provider, m.id, "2026-08-08"),
    ).map(chave);
    expect(semTarifa).toEqual([]);
  });

  it("visão vem sempre acompanhada de saída estruturada", () => {
    // O Processo 2 precisa das duas juntas: enxergar a nota e devolver objeto validável.
    // Um modelo com `visao` e sem `saida_estruturada` seria oferecido para extração e
    // falharia na chamada — depois de paga.
    const incoerentes = AI_MODEL_CATALOG.filter(
      (m) =>
        m.capabilities.includes("visao") && !m.capabilities.includes("saida_estruturada"),
    ).map(chave);
    expect(incoerentes).toEqual([]);
  });

  it("quem lê arquivo também enxerga imagem", () => {
    // O contrário existe (o Gemini tem visão sem PDF). Este sentido não: um modelo que
    // interpretasse PDF sem aceitar imagem não é um caso real, e o pipeline não o prevê.
    const incoerentes = AI_MODEL_CATALOG.filter(
      (m) => m.capabilities.includes("arquivo") && !m.capabilities.includes("visao"),
    ).map(chave);
    expect(incoerentes).toEqual([]);
  });
});
