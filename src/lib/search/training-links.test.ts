/**
 * Fase 17-F — contrato dos deep-links de Treinos.
 *
 * O requisito não é "a busca encontra", é "o link ABRE O REGISTRO". Estes testes travam o
 * formato; do outro lado, cada rota existe e cada parâmetro é lido pela página:
 *
 *   /treinos/exercicios/{id}   → detalhe e histórico do exercício
 *   /treinos/treinos/{id}      → construtor do treino-modelo
 *   /treinos/programas         → ?programa=  → destaca o programa
 *   /treinos/historico/{id}    → a sessão registrada (snapshot imutável)
 *   /treinos/metas             → ?meta=      → destaca a meta
 *   /treinos/recordes          → ?recorde=   → destaca o recorde
 *   /treinos/calendario        → ?visao=&data= → abre o dia planejado
 */
import { describe, expect, it } from "vitest";
import {
  evolutionLink,
  exerciseLink,
  goalLink,
  liveSessionLink,
  programLink,
  recordLink,
  scheduleLink,
  sessionLink,
  todayLink,
  trainingReportsLink,
  workoutLink,
} from "./training-links";
import { SEARCH_TYPES, SEARCH_TYPE_LABELS } from "./types";

const ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("deep-links de Treinos", () => {
  it("cada link aponta para a rota certa com o parâmetro certo", () => {
    expect(exerciseLink(ID)).toBe(`/treinos/exercicios/${ID}`);
    expect(workoutLink(ID)).toBe(`/treinos/treinos/${ID}`);
    expect(programLink(ID)).toBe(`/treinos/programas?programa=${ID}`);
    expect(sessionLink(ID)).toBe(`/treinos/historico/${ID}`);
    expect(goalLink(ID)).toBe(`/treinos/metas?meta=${ID}`);
    expect(recordLink(ID)).toBe(`/treinos/recordes?recorde=${ID}`);
    expect(scheduleLink("2026-08-06")).toBe("/treinos/calendario?visao=semana&data=2026-08-06");
    expect(todayLink()).toBe("/treinos/hoje");
    expect(liveSessionLink()).toBe("/treinos/sessao");
    expect(trainingReportsLink()).toBe("/treinos/relatorios");
  });

  it("medida corporal em Treinos é a EVOLUÇÃO — não existe /treinos/medidas", () => {
    // As tabelas são as `body_*` (16-E), compartilhadas com a Dieta. Um link para uma rota
    // inexistente mandaria a notificação de medição pendente para um 404.
    expect(evolutionLink()).toBe("/treinos/evolucao");
    expect(evolutionLink()).not.toContain("/treinos/medidas");
  });

  it("o exercício abre pela ROTA do registro, não por query no catálogo", () => {
    // `/treinos/exercicios?exercicio=` não é lido por página nenhuma — cairia na lista.
    expect(exerciseLink(ID)).not.toContain("?");
  });

  it("todo link é interno e começa em /treinos", () => {
    const links = [
      exerciseLink(ID),
      workoutLink(ID),
      programLink(ID),
      sessionLink(ID),
      goalLink(ID),
      recordLink(ID),
      scheduleLink("2026-08-06"),
      todayLink(),
      liveSessionLink(),
      evolutionLink(),
      trainingReportsLink(),
    ];
    for (const link of links) {
      expect(link.startsWith("/treinos")).toBe(true);
      expect(link).not.toContain("http");
    }
  });
});

describe("tipos novos da busca global (Treinos)", () => {
  const NOVOS = [
    "treino_exercicio",
    "treino_treino",
    "treino_programa",
    "treino_sessao",
    "treino_meta",
    "treino_recorde",
  ] as const;

  it("as 6 entidades do módulo estão registradas", () => {
    for (const type of NOVOS) {
      expect(SEARCH_TYPES).toContain(type);
    }
  });

  it("todo tipo tem rótulo pt-BR — um grupo sem nome quebraria o painel de resultados", () => {
    for (const type of SEARCH_TYPES) {
      expect(SEARCH_TYPE_LABELS[type], type).toBeTruthy();
    }
  });

  it("os grupos de Treinos vêm antes de Notificações (ordem estável de SEARCH_TYPES)", () => {
    const indice = (t: string) => SEARCH_TYPES.indexOf(t as (typeof SEARCH_TYPES)[number]);
    for (const type of NOVOS) {
      expect(indice(type)).toBeLessThan(indice("notificacao"));
    }
  });
});