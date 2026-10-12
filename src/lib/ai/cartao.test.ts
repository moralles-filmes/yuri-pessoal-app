import { describe, expect, it } from "vitest";
import {
  DESFECHO_INICIAL,
  desfechoDaConfirmacao,
  estadoDoCartao,
  type DesfechoDoCartao,
} from "./cartao";

/**
 * REDESIGN-07-D · D1 — o cartão de proposta fala o vocabulário do Approval Engine.
 *
 * Até aqui o cartão guardava um desfecho próprio (`pendente | confirmando | feita(parcial) |
 * recusada | erro`): vencido continuava com cara de pendente e com Recusar habilitado, `falhou`
 * aparecia no verde da aplicada, e uma promise rejeitada deixava o cartão girando para sempre.
 * Os estados agora são os de `approval/state.ts`, com os rótulos de `ROTULO_DO_ESTADO_DA_ACAO`
 * (o mesmo de `/ia/acoes`), mais UM estado local — `nao_aplicada`, a recusa do servidor —, que
 * não é estado da proposta: é o desfecho da tentativa.
 */

const AGORA = Date.parse("2026-10-12T12:00:00.000Z");
const NO_PRAZO = "2026-10-12T12:07:00.000Z";
const VENCIDA = "2026-10-12T11:59:00.000Z";

const vista = (d: DesfechoDoCartao, expira = NO_PRAZO) => estadoDoCartao(d, expira, AGORA);

describe("estadoDoCartao", () => {
  it("pendente no prazo oferece os dois botões", () => {
    expect(vista(DESFECHO_INICIAL)).toEqual({
      estado: "pendente",
      rotulo: "aguardando você",
      final: false,
      podeConfirmar: true,
      podeRecusar: true,
      girando: null,
    });
  });

  it("vencida: prazo encerrado, final, e NENHUM botão — nem Recusar", () => {
    expect(vista(DESFECHO_INICIAL, VENCIDA)).toEqual({
      estado: "expirada",
      rotulo: "prazo encerrado",
      final: true,
      podeConfirmar: false,
      podeRecusar: false,
      girando: null,
    });
  });

  it("o prazo vence exatamente no instante de expires_at", () => {
    expect(estadoDoCartao(DESFECHO_INICIAL, "2026-10-12T12:00:00.000Z", AGORA).estado).toBe(
      "expirada",
    );
  });

  it("expires_at ilegível não vira 'pendente para sempre': conta como vencido", () => {
    expect(estadoDoCartao(DESFECHO_INICIAL, "não é data", AGORA).estado).toBe("expirada");
  });

  it("confirmando: os dois travados e o spinner no Confirmar", () => {
    expect(vista({ tipo: "enviando", acao: "confirmar" })).toMatchObject({
      estado: "pendente",
      final: false,
      podeConfirmar: false,
      podeRecusar: false,
      girando: "confirmar",
    });
  });

  it("recusando: o spinner fica no Recusar, não no Confirmar", () => {
    expect(vista({ tipo: "enviando", acao: "recusar" })).toMatchObject({
      podeConfirmar: false,
      podeRecusar: false,
      girando: "recusar",
    });
  });

  it("um envio no ar não vira 'prazo encerrado' no meio do caminho", () => {
    expect(vista({ tipo: "enviando", acao: "confirmar" }, VENCIDA).estado).toBe("pendente");
  });

  it("aplicada, aplicada em parte e falhou são três estados distintos", () => {
    expect(vista({ tipo: "executada", rota: "/x" })).toMatchObject({
      estado: "executada",
      rotulo: "aplicada",
      final: true,
    });
    expect(vista({ tipo: "parcial", rota: null })).toMatchObject({
      estado: "parcial",
      rotulo: "aplicada em parte",
      final: true,
    });
    expect(vista({ tipo: "falhou", rota: null })).toMatchObject({
      estado: "falhou",
      rotulo: "falhou",
      final: true,
    });
  });

  it("recusada é final e não oferece nada", () => {
    expect(vista({ tipo: "recusada" })).toMatchObject({
      estado: "recusada",
      rotulo: "recusada por você",
      final: true,
      podeConfirmar: false,
      podeRecusar: false,
    });
  });

  it("a resposta que não voltou é 'sem desfecho registrado' — nem sucesso nem falha", () => {
    expect(vista({ tipo: "sem_desfecho" })).toMatchObject({
      estado: "executando",
      rotulo: "sem desfecho registrado",
      final: true,
      podeConfirmar: false,
      podeRecusar: false,
    });
  });

  it("a recusa do servidor é final, mesmo dentro do prazo", () => {
    expect(vista({ tipo: "nao_aplicada", mensagem: "Os dados mudaram." })).toEqual({
      estado: "nao_aplicada",
      rotulo: "nada foi feito agora",
      final: true,
      podeConfirmar: false,
      podeRecusar: false,
      girando: null,
    });
  });

  it("um desfecho final não volta a ser 'prazo encerrado' quando o prazo passa", () => {
    expect(vista({ tipo: "executada", rota: null }, VENCIDA).estado).toBe("executada");
    expect(vista({ tipo: "recusada" }, VENCIDA).estado).toBe("recusada");
  });
});

describe("desfechoDaConfirmacao", () => {
  it("cada status vira o seu desfecho — `falhou` nunca vira 'aplicada em parte'", () => {
    expect(desfechoDaConfirmacao({ ok: true, status: "sucesso", rota: "/r" })).toEqual({
      tipo: "executada",
      rota: "/r",
    });
    expect(desfechoDaConfirmacao({ ok: true, status: "parcial", rota: "/r" })).toEqual({
      tipo: "parcial",
      rota: "/r",
    });
    expect(desfechoDaConfirmacao({ ok: true, status: "falhou", rota: null })).toEqual({
      tipo: "falhou",
      rota: null,
    });
  });

  it("'executando' (que o tipo permite) vira 'sem desfecho', nunca sucesso", () => {
    expect(desfechoDaConfirmacao({ ok: true, status: "executando", rota: null })).toEqual({
      tipo: "sem_desfecho",
    });
  });

  it("ok:false vira 'não aplicada' com a frase do servidor", () => {
    expect(desfechoDaConfirmacao({ ok: false, mensagem: "A proposta expirou." })).toEqual({
      tipo: "nao_aplicada",
      mensagem: "A proposta expirou.",
    });
  });

  it("o servidor recusa por prazo aos 9:59 do relógio local: o cartão diz o que o servidor disse", () => {
    const d = desfechoDaConfirmacao({ ok: false, mensagem: "A proposta expirou." });
    expect(estadoDoCartao(d, NO_PRAZO, AGORA)).toMatchObject({
      estado: "nao_aplicada",
      final: true,
      podeConfirmar: false,
    });
  });
});
