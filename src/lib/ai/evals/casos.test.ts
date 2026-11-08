/**
 * Fase 18-F · Bloco 5 — IA · A suíte de evals. Os oito casos do briefing.
 *
 * ⚠️ CHAT LIVRE COM COORDENADOR (Task 14): os casos deixaram de afirmar `routeAgent`. O chat
 * não é mais decidido por palavra-chave — o coordenador vê os especialistas OFERECIDOS e o
 * servidor aceita só esses. O que pode regredir continua estrutural, e agora são quatro
 * afirmações por caso roteado, cada uma protegendo um defeito diferente:
 *
 *   (a) COM A CHAVE LIGADA, O ESPECIALISTA É OFERECIDO. Regride quando a oferta deixa de ser
 *       derivada do registry (`catalogoDeEspecialistas`) ou quando uma allowlist perde a
 *       ferramenta de leitura do módulo.
 *   (b) COM AS CHAVES DE LEITURA DELE DESLIGADAS, ELE SAI DA OFERTA E VAI PARA `desligados`.
 *       E o teste liga TODAS AS OUTRAS ao desligar: assim ele prova que são AQUELAS chaves que
 *       barram, e não a ausência geral de permissão.
 *       ⚠️ "As chaves de leitura dele", DERIVADAS do registry, e não só `caso.chave`: Treinos
 *       lê também as medidas (`allow_body`), e com `allow_training` desligada e `allow_body`
 *       ligada o especialista CONTINUA oferecido, só com as medidas (spec §4.2.3). O caso
 *       (b') afirma isso por derivação, em vez de esconder o caso de `body` atrás de um `if`.
 *   (c) O SERVIDOR RECUSA ACIONÁ-LO quando ele não foi oferecido (`NAO_OFERECIDO`). A escolha
 *       do modelo decide a quem perguntar, nunca que permissão usar (spec §4.2.4).
 *   (d) A FERRAMENTA DE DADO CERTA CHEGA AO ESPECIALISTA. Uma allowlist editada sem olhar o
 *       registry deixa o especialista sem a ferramenta do próprio módulo, e o sintoma em
 *       produção é ele responder "não consigo consultar" para sempre.
 *
 * ⛔ O caso destrutivo ("Exclua todas as minhas transações") continua com os dados intactos, e
 * o que o protege continua sendo `destrutivo.test.ts` (invariante 106).
 */

import { describe, expect, it } from "vitest";
import { ASSISTENTE_PESSOAL_ID, findAgent } from "@/lib/ai/agents/registry";
import { catalogoDeEspecialistas, decidirAcionamentos } from "@/lib/ai/agents/especialistas";
import { findTool, toolDefinitionsFor } from "@/lib/ai/tools/registry";
import {
  TOOL_PERMISSIONS,
  TOOL_WRITE_PERMISSIONS,
  type ToolPermission,
  type ToolWritePermission,
} from "@/lib/ai/tools/contracts";
import { CASOS_DO_BRIEFING } from "./casos";

const TODAS_LEITURAS: Partial<Record<ToolPermission, boolean>> = Object.fromEntries(
  TOOL_PERMISSIONS.map((p) => [p, true]),
);
const TODAS_ESCRITAS: Partial<Record<ToolWritePermission, boolean>> = Object.fromEntries(
  TOOL_WRITE_PERMISSIONS.map((p) => [p, true]),
);

function todasMenos(chaves: Iterable<ToolPermission>): Partial<Record<ToolPermission, boolean>> {
  const resultado = { ...TODAS_LEITURAS };
  for (const chave of chaves) resultado[chave] = false;
  return resultado;
}

/**
 * As chaves que fazem o especialista LER, derivadas da allowlist dele no registry — nunca uma
 * lista escrita à mão, que ficaria para trás no dia em que um módulo ganhasse outra fonte.
 */
function chavesDeLeituraDe(agentId: string): Set<ToolPermission> {
  const perfil = findAgent(agentId);
  if (!perfil) throw new Error(`Agente fora do registry: ${agentId}`);
  const chaves = new Set<ToolPermission>();
  for (const nome of perfil.allowedTools) {
    const tool = findTool(nome);
    if (tool?.kind === "leitura") chaves.add(tool.requiredPermission);
  }
  return chaves;
}

describe("evals · os oito casos do briefing da Fase 18", () => {
  it("são oito, e a lista não encolhe", () => {
    // O doc da fase escreveu oito. Remover um para fechar a suíte é o que este teste impede.
    expect(CASOS_DO_BRIEFING).toHaveLength(8);
  });

  for (const caso of CASOS_DO_BRIEFING) {
    if (caso.tipo === "sem-especialista") {
      it(`"${caso.texto}" — o coordenador não tem ferramenta própria — ${caso.porque}`, () => {
        // Com TODAS as chaves ligadas, o coordenador continua sem ferramenta do registry: o que
        // ele faz é acionar especialista, e nenhum especialista recebe arquivo pelo chat (o
        // corpo do chat recusa arquivo: `destrutivo.test.ts`, item 5).
        const perfil = findAgent(ASSISTENTE_PESSOAL_ID);
        expect(perfil).not.toBeNull();
        expect(perfil!.allowedTools).toEqual([]);
        expect(
          toolDefinitionsFor(perfil!.allowedTools, TODAS_LEITURAS, TODAS_ESCRITAS),
        ).toEqual([]);
        // E o coordenador nunca é oferecido a si mesmo.
        const { ofertas } = catalogoDeEspecialistas(TODAS_LEITURAS, TODAS_ESCRITAS);
        expect(ofertas.map((o) => o.agentId)).not.toContain(ASSISTENTE_PESSOAL_ID);
      });
      continue;
    }

    describe(`"${caso.texto}"`, () => {
      const chavesDele = chavesDeLeituraDe(caso.agente);

      it(`a chave do caso, "${caso.chave}", é uma das chaves de leitura de "${caso.agente}"`, () => {
        // Sem isto, (b) desligaria um conjunto que nem contém a chave do caso, e provaria nada.
        expect([...chavesDele]).toContain(caso.chave);
      });

      it(`(a) com todas as chaves ligadas, "${caso.agente}" é oferecido ao coordenador — ${caso.porque}`, () => {
        const { ofertas, desligados } = catalogoDeEspecialistas(TODAS_LEITURAS, TODAS_ESCRITAS);
        expect(ofertas.map((o) => o.agentId)).toContain(caso.agente);
        expect(desligados).not.toContain(findAgent(caso.agente)!.label);
      });

      it(`(b) com as chaves de leitura dele desligadas e todas as outras ligadas, sai da oferta e vai para desligados`, () => {
        const { ofertas, desligados } = catalogoDeEspecialistas(
          todasMenos(chavesDele),
          TODAS_ESCRITAS,
        );
        expect(ofertas.map((o) => o.agentId)).not.toContain(caso.agente);
        expect(desligados).toContain(findAgent(caso.agente)!.label);
      });

      it(`(b') com só "${caso.chave}" desligada, continua oferecido apenas se outra chave de leitura dele estiver ligada`, () => {
        const { ofertas } = catalogoDeEspecialistas(todasMenos([caso.chave]), TODAS_ESCRITAS);
        expect(ofertas.map((o) => o.agentId).includes(caso.agente)).toBe(chavesDele.size > 1);
      });

      it(`(c) acionar "${caso.agente}" com as chaves dele desligadas é recusado como NAO_OFERECIDO`, () => {
        // O nome da ferramenta de acionamento sai da oferta com tudo ligado — nunca escrito à mão.
        const ligado = catalogoDeEspecialistas(TODAS_LEITURAS, TODAS_ESCRITAS);
        const ferramenta = ligado.ofertas.find((o) => o.agentId === caso.agente)!.ferramenta;
        const chamadas = [{ callId: "c1", toolName: ferramenta, input: { tarefa: caso.texto } }];

        // Controle positivo: com a oferta ligada, o mesmo pedido é aceito.
        const aceito = decidirAcionamentos({
          chamadas,
          ofertas: ligado.ofertas,
          allowCrossModule: true,
        });
        expect(aceito.aceitos.map((a) => a.agentId)).toEqual([caso.agente]);

        const desligado = catalogoDeEspecialistas(todasMenos(chavesDele), TODAS_ESCRITAS);
        const decisao = decidirAcionamentos({
          chamadas,
          ofertas: desligado.ofertas,
          allowCrossModule: true,
        });
        expect(decisao.aceitos).toEqual([]);
        expect(decisao.recusados.map((r) => r.motivo)).toEqual(["NAO_OFERECIDO"]);
      });

      it(`(d) "${caso.ferramenta}" chega ao especialista "${caso.agente}"`, () => {
        const perfil = findAgent(caso.agente);
        expect(perfil).not.toBeNull();
        const nomes = toolDefinitionsFor(
          perfil!.allowedTools,
          TODAS_LEITURAS,
          TODAS_ESCRITAS,
        ).map((d) => d.name);
        expect(nomes).toContain(caso.ferramenta);
      });

      it(`(d) "${caso.ferramenta}" NÃO chega ao especialista com "${caso.chave}" desligada`, () => {
        const perfil = findAgent(caso.agente);
        expect(perfil).not.toBeNull();
        const nomes = toolDefinitionsFor(
          perfil!.allowedTools,
          todasMenos([caso.chave]),
          TODAS_ESCRITAS,
        ).map((d) => d.name);
        expect(nomes).not.toContain(caso.ferramenta);
      });
    });
  }
});
