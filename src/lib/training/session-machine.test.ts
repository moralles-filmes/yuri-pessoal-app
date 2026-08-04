/**
 * Fase 17-C — Treinos · Testes da máquina de estados.
 *
 * O teste que mais importa aqui não é o das transições válidas — é o das INVÁLIDAS. A fila
 * local pode reenviar uma mutação minutos depois, quando a sessão já foi concluída; a resposta
 * certa é recusar com motivo, não aplicar por cima do fato consumado.
 */
import { describe, expect, it } from "vitest";
import {
  SESSION_TRANSITIONS,
  acceptsSetWrites,
  canFinishSession,
  canStartNewSession,
  canStartRest,
  canTransitionExercise,
  canTransitionSession,
  canTransitionSet,
  deriveExerciseStatus,
  hasPendingSets,
  isSessionDraft,
  isSessionFinal,
  isSessionRunning,
  isSetDone,
  isSetPending,
  transitionExercise,
  transitionSession,
  transitionSet,
} from "./session-machine";
import { SESSION_STATUSES, type SessionSetStatus } from "./constants";

const sets = (...statuses: SessionSetStatus[]) => statuses.map((status) => ({ status }));

/* ═══════════════════════════ Sessão ═══════════════════════════ */

describe("transições da sessão", () => {
  it("percorre o caminho feliz inteiro", () => {
    expect(canTransitionSession("rascunho", "pronta")).toBe(true);
    expect(canTransitionSession("pronta", "ativa")).toBe(true);
    expect(canTransitionSession("ativa", "descansando")).toBe(true);
    expect(canTransitionSession("descansando", "ativa")).toBe(true);
    expect(canTransitionSession("ativa", "pausada")).toBe(true);
    expect(canTransitionSession("pausada", "ativa")).toBe(true);
    expect(canTransitionSession("ativa", "concluida")).toBe(true);
  });

  it("permite iniciar direto de rascunho (quem só aperta Começar)", () => {
    expect(canTransitionSession("rascunho", "ativa")).toBe(true);
  });

  it("permite abandonar e cancelar a partir de qualquer estado em execução", () => {
    for (const from of ["ativa", "descansando", "pausada"] as const) {
      expect(canTransitionSession(from, "abandonada")).toBe(true);
      expect(canTransitionSession(from, "cancelada")).toBe(true);
    }
  });

  it("recusa TODA transição a partir de um estado final", () => {
    for (const from of ["concluida", "abandonada", "cancelada"] as const) {
      for (const to of SESSION_STATUSES) {
        if (to === from) continue;
        expect(canTransitionSession(from, to)).toBe(false);
      }
    }
  });

  it("não deixa uma sessão concluída voltar a ativa sem confirmação explícita", () => {
    const semConfirmar = transitionSession("concluida", "ativa");
    expect(semConfirmar.ok).toBe(false);
    if (!semConfirmar.ok) expect(semConfirmar.reason).toBe("exige_confirmacao");

    const confirmado = transitionSession("concluida", "ativa", { explicit: true });
    expect(confirmado.ok).toBe(true);
    if (confirmado.ok) expect(confirmado.state).toBe("ativa");
  });

  it("cancelada é definitiva — nem com confirmação volta", () => {
    expect(transitionSession("cancelada", "ativa", { explicit: true }).ok).toBe(false);
  });

  it("abandonada pode ser reaberta com confirmação (treino interrompido que o usuário retoma)", () => {
    expect(transitionSession("abandonada", "ativa", { explicit: true }).ok).toBe(true);
    expect(transitionSession("abandonada", "ativa").ok).toBe(false);
  });

  it("transição para o mesmo estado é aceita mas não muda nada (idempotência da fila)", () => {
    const result = transitionSession("pausada", "pausada");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changed).toBe(false);
  });

  it("recusa pular de rascunho direto para concluída", () => {
    const result = transitionSession("rascunho", "concluida");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("transicao_invalida");
  });

  it("classifica os estados em execução, finais e de preparação", () => {
    expect(isSessionRunning("descansando")).toBe(true);
    expect(isSessionRunning("pronta")).toBe(false);
    expect(isSessionFinal("abandonada")).toBe(true);
    expect(isSessionFinal("ativa")).toBe(false);
    expect(isSessionDraft("rascunho")).toBe(true);
    expect(isSessionDraft("ativa")).toBe(false);
  });

  it("aceita gravar série durante descanso e pausa, mas não depois de encerrada", () => {
    expect(acceptsSetWrites("descansando")).toBe(true);
    expect(acceptsSetWrites("pausada")).toBe(true);
    expect(acceptsSetWrites("concluida")).toBe(false);
  });

  it("nenhum estado transita para si mesmo no mapa (evita laço silencioso)", () => {
    for (const status of SESSION_STATUSES) {
      expect(SESSION_TRANSITIONS[status]).not.toContain(status);
    }
  });
});

/* ═══════════════════════════ Exercício ═══════════════════════════ */

describe("transições do exercício", () => {
  it("pula e volta depois", () => {
    expect(canTransitionExercise("pendente", "pulado")).toBe(true);
    expect(canTransitionExercise("pulado", "ativo")).toBe(true);
    expect(canTransitionExercise("pulado", "pendente")).toBe(true);
  });

  it("substituído é o fim da linha daquela linha", () => {
    expect(canTransitionExercise("substituido", "ativo")).toBe(false);
    const result = transitionExercise("substituido", "pendente");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("estado_final");
  });
});

/* ═══════════════════════════ Série ═══════════════════════════ */

describe("transições da série", () => {
  it("registra direto de pendente para concluída (o caminho comum)", () => {
    expect(canTransitionSet("pendente", "concluida")).toBe(true);
  });

  it("desfaz uma série concluída", () => {
    expect(canTransitionSet("concluida", "pendente")).toBe(true);
  });

  it("recusa transição inexistente", () => {
    const result = transitionSet("cancelada", "concluida");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("transicao_invalida");
  });

  it("trata 'falhou' como série FEITA e 'pulada' como resolvida sem execução", () => {
    expect(isSetDone("falhou")).toBe(true);
    expect(isSetDone("pulada")).toBe(false);
    expect(isSetPending("pulada")).toBe(false);
    expect(isSetPending("ativa")).toBe(true);
  });
});

/* ═══════════════════════════ Status derivado ═══════════════════════════ */

describe("deriveExerciseStatus", () => {
  it("sem série feita devolve o status gravado", () => {
    expect(deriveExerciseStatus("pendente", sets("pendente", "pendente"))).toBe("pendente");
    expect(deriveExerciseStatus("ativo", sets("pendente"))).toBe("ativo");
  });

  it("com todas as séries resolvidas devolve concluído", () => {
    expect(deriveExerciseStatus("ativo", sets("concluida", "concluida", "falhou"))).toBe(
      "concluido",
    );
  });

  it("conta série pulada como resolvida — o exercício não fica parcial para sempre", () => {
    expect(deriveExerciseStatus("ativo", sets("concluida", "concluida", "pulada"))).toBe(
      "concluido",
    );
  });

  it("com parte feita devolve parcial", () => {
    expect(deriveExerciseStatus("ativo", sets("concluida", "pendente", "pendente"))).toBe(
      "parcial",
    );
  });

  it("decisão do usuário vence a contagem", () => {
    expect(deriveExerciseStatus("pulado", sets("concluida", "concluida"))).toBe("pulado");
    expect(deriveExerciseStatus("substituido", sets("concluida"))).toBe("substituido");
  });

  it("exercício sem série nenhuma devolve o gravado", () => {
    expect(deriveExerciseStatus("pendente", [])).toBe("pendente");
  });

  it("hasPendingSets ignora exercício pulado ou substituído", () => {
    expect(hasPendingSets("pendente", sets("concluida", "pendente"))).toBe(true);
    expect(hasPendingSets("pulado", sets("pendente"))).toBe(false);
    expect(hasPendingSets("substituido", sets("pendente"))).toBe(false);
    expect(hasPendingSets("ativo", sets("concluida", "pulada"))).toBe(false);
  });
});

/* ═══════════════════════════ Guardas ═══════════════════════════ */

describe("guardas de fluxo", () => {
  it("não inicia descanso para série não concluída, salvo comando explícito", () => {
    expect(canStartRest("pendente").allowed).toBe(false);
    expect(canStartRest("pendente", { explicit: true }).allowed).toBe(true);
    expect(canStartRest("concluida").allowed).toBe(true);
    expect(canStartRest(null).allowed).toBe(false);
    expect(canStartRest(null, { explicit: true }).allowed).toBe(true);
  });

  it("não finaliza sessão com série ativa sem confirmação", () => {
    const comAtiva = canFinishSession(sets("concluida", "ativa"));
    expect(comAtiva.allowed).toBe(false);
    expect(comAtiva.message).toContain("Confirme");

    expect(canFinishSession(sets("concluida", "ativa"), { confirmed: true }).allowed).toBe(true);
    expect(canFinishSession(sets("concluida", "pendente")).allowed).toBe(true);
  });

  it("pluraliza a mensagem de séries em andamento", () => {
    expect(canFinishSession(sets("ativa")).message).toContain("uma série");
    expect(canFinishSession(sets("ativa", "ativa")).message).toContain("2 séries");
  });

  it("bloqueia iniciar uma segunda sessão em execução", () => {
    expect(canStartNewSession(0).allowed).toBe(true);
    const bloqueado = canStartNewSession(1);
    expect(bloqueado.allowed).toBe(false);
    expect(bloqueado.message).toContain("em andamento");
  });
});
