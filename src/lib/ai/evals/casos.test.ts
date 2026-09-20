/**
 * Fase 18-F · Bloco 5 — IA · A suíte de evals. Os oito casos do briefing.
 *
 * Três afirmações por caso roteado, e cada uma protege um defeito diferente:
 *
 *   1. O ROTEADOR ESCOLHE O AGENTE CERTO. Regride quando alguém mexe num vocabulário —
 *      acrescentar "meta" a um módulo empata três e joga tudo no orquestrador.
 *   2. A CHAVE DESLIGADA BLOQUEIA. E o teste liga TODAS AS OUTRAS ao desligar uma: assim ele
 *      prova que é AQUELA chave que barra, e não a ausência geral de permissão. Com `{}`, um
 *      bug que passasse a exigir a chave errada continuaria verde.
 *   3. A FERRAMENTA CERTA É OFERECIDA. Uma allowlist de agente editada sem olhar o registry
 *      deixa o especialista sem a ferramenta do próprio módulo, e o sintoma em produção é o
 *      modelo respondendo "não consigo consultar" para sempre.
 *
 * ⚠️ `ASSISTENTE_PESSOAL_ID` vem de `agents/registry` — `agents/routing` reexporta os OITO
 * ids de especialista, mas não o do orquestrador.
 */

import { describe, expect, it } from "vitest";
import { ROUTING_MOTIVOS, routeAgent } from "@/lib/ai/agents/routing";
import { ASSISTENTE_PESSOAL_ID, findAgent } from "@/lib/ai/agents/registry";
import { toolDefinitionsFor } from "@/lib/ai/tools/registry";
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

function todasMenos(chave: ToolPermission): Partial<Record<ToolPermission, boolean>> {
  return { ...TODAS_LEITURAS, [chave]: false };
}

describe("evals · os oito casos do briefing da Fase 18", () => {
  it("são oito, e a lista não encolhe", () => {
    // O doc da fase escreveu oito. Remover um para fechar a suíte é o que este teste impede.
    expect(CASOS_DO_BRIEFING).toHaveLength(8);
  });

  for (const caso of CASOS_DO_BRIEFING) {
    if (caso.tipo === "sem-especialista") {
      it(`"${caso.texto}" cai no orquestrador, que não tem ferramenta — ${caso.porque}`, () => {
        const decisao = routeAgent({
          texto: caso.texto,
          pageContext: null,
          permissions: TODAS_LEITURAS,
        });
        expect(decisao.agentId).toBe(ASSISTENTE_PESSOAL_ID);

        // A parte que importa: com TODAS as chaves ligadas, ele continua sem ferramenta.
        const perfil = findAgent(decisao.agentId);
        expect(perfil).not.toBeNull();
        expect(perfil!.allowedTools).toEqual([]);
        expect(
          toolDefinitionsFor(perfil!.allowedTools, TODAS_LEITURAS, TODAS_ESCRITAS),
        ).toEqual([]);
      });
      continue;
    }

    describe(`"${caso.texto}"`, () => {
      it(`chega ao agente "${caso.agente}" — ${caso.porque}`, () => {
        const decisao = routeAgent({
          texto: caso.texto,
          pageContext: null,
          permissions: TODAS_LEITURAS,
        });
        expect(decisao.agentId).toBe(caso.agente);
        expect(decisao.motivo).toBe(ROUTING_MOTIVOS.PELO_TEXTO);
      });

      it(`com "${caso.chave}" DESLIGADA e todas as outras ligadas, cai no orquestrador`, () => {
        const decisao = routeAgent({
          texto: caso.texto,
          pageContext: null,
          permissions: todasMenos(caso.chave),
        });
        expect(decisao.agentId).toBe(ASSISTENTE_PESSOAL_ID);
        expect(decisao.motivo).toBe(ROUTING_MOTIVOS.SEM_PERMISSAO);
      });

      it(`oferece "${caso.ferramenta}" ao modelo`, () => {
        const perfil = findAgent(caso.agente);
        expect(perfil).not.toBeNull();
        const nomes = toolDefinitionsFor(
          perfil!.allowedTools,
          TODAS_LEITURAS,
          TODAS_ESCRITAS,
        ).map((d) => d.name);
        expect(nomes).toContain(caso.ferramenta);
      });

      it(`NÃO oferece "${caso.ferramenta}" com "${caso.chave}" desligada`, () => {
        const perfil = findAgent(caso.agente);
        expect(perfil).not.toBeNull();
        const nomes = toolDefinitionsFor(
          perfil!.allowedTools,
          todasMenos(caso.chave),
          TODAS_ESCRITAS,
        ).map((d) => d.name);
        expect(nomes).not.toContain(caso.ferramenta);
      });
    });
  }
});
