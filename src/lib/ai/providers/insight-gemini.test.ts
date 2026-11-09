/**
 * Task 22b — SDK real, HTTP sintético. Nenhuma chamada sai para a rede.
 * O teste observa o pedido serializado pelo Gemini, depois da conversão do schema.
 */
import { describe, expect, it, vi } from "vitest";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAdapter } from "./ai-sdk/adapter";
import { INSIGHT_SYSTEM_PROMPT } from "@/lib/ai/insights/prompt";
import {
  DESCRICAO_DO_SCHEMA, INSIGHT_JSON_SCHEMA, NOME_DO_SCHEMA, insightDoModeloSchema,
} from "@/lib/ai/insights/schema";

type SchemaNoPedido = {
  description?: string;
  properties?: Record<string, SchemaNoPedido>;
  items?: SchemaNoPedido;
};
type PedidoGemini = {
  generationConfig: { responseSchema: SchemaNoPedido };
  systemInstruction: { parts: { text: string }[] };
};
const evidencia = { afirmacao: "Gasto medido", indicador_id: "financeiro.gasto_mes" };
const valido = {
  tipo: "observacao", prioridade: "baixa", titulo: "Gasto medido",
  resumo: "O gasto foi {{ind:financeiro.gasto_mes}}.", explicacao: "O gasto foi medido.",
  evidencias: [evidencia],
};

async function gerarSintetico(valor: unknown = valido) {
  let pedido: PedidoGemini | undefined;
  const fetchSintetico = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    pedido = JSON.parse(String(init?.body)) as PedidoGemini;
    return new Response(JSON.stringify({
      candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(valor) }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120 },
    }), { headers: { "Content-Type": "application/json" } });
  });
  const google = createGoogleGenerativeAI({ apiKey: "chave-sintetica", fetch: fetchSintetico });
  const client = createAdapter({ provider: "gemini", buildModel: id => google(id), apiKey: "chave-sintetica" });
  const resposta = await client.generateObject({
    model: "gemini-3.6-flash", system: INSIGHT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: "Indicadores sintéticos para o teste." }],
    schema: INSIGHT_JSON_SCHEMA, schemaName: NOME_DO_SCHEMA, schemaDescription: DESCRICAO_DO_SCHEMA,
    maxOutputTokens: 1000, temperature: 0, timeoutMs: 5000,
  });
  expect(fetchSintetico).toHaveBeenCalledTimes(1);
  if (!pedido) throw new Error("O SDK não serializou o pedido");
  return { pedido, resposta };
}

describe("insight no contrato efetivamente recebido pelo Gemini", () => {
  it("a quantidade de evidências continua explícita depois da conversão do SDK", async () => {
    const { pedido } = await gerarSintetico();
    const descricao = pedido.generationConfig.responseSchema.properties?.evidencias.description;
    expect(descricao).toContain("1 a 6");
    expect(descricao).toContain("evidências");
  });

  it.each([["titulo", 80], ["resumo", 240], ["explicacao", 900]] as const)(
    "o limite de %s chega como instrução de %i caracteres", async (campo, limite) => {
      const { pedido } = await gerarSintetico();
      const descricao = pedido.generationConfig.responseSchema.properties?.[campo].description;
      expect(descricao).toContain("1 a " + limite + " caracteres");
    },
  );

  it.each([["afirmacao", 160], ["indicador_id", 80]] as const)(
    "o limite de %s da evidência sobrevive no pedido", async (campo, limite) => {
      const { pedido } = await gerarSintetico();
      const descricao = pedido.generationConfig.responseSchema.properties?.evidencias.items?.properties?.[campo].description;
      expect(descricao).toContain("1 a " + limite + " caracteres");
    },
  );

  it("o sistema instrui a selecionar evidências dentro do teto, sem cobrir todos os indicadores", async () => {
    const { pedido } = await gerarSintetico();
    const sistema = pedido.systemInstruction.parts.map(parte => parte.text).join("\n");
    expect(sistema).toContain("1 a 6 evidências");
    expect(sistema).toContain("Não é necessário citar todos os indicadores");
    for (const regra of [
      /titulo:.*1 a 80 caracteres/, /resumo:.*1 a 240 caracteres/,
      /explicacao:.*1 a 900 caracteres/, /afirmacao \(de 1 a 160 caracteres\)/,
      /indicador_id .*1 a 80 caracteres/,
    ]) expect(sistema).toMatch(regra);
  });

  it("a resposta sintética válida passa por SDK e Zod", async () => {
    const { resposta } = await gerarSintetico();
    expect(resposta.ok).toBe(true);
    if (!resposta.ok) throw new Error("O SDK recusou a resposta sintética válida");
    expect(insightDoModeloSchema.parse(resposta.value)).toEqual(valido);
  });

  it("sete evidências continuam recusadas pelo Zod depois do adapter", async () => {
    const { resposta } = await gerarSintetico({ ...valido, evidencias: Array.from({ length: 7 }, () => evidencia) });
    expect(resposta.ok).toBe(true);
    if (!resposta.ok) throw new Error("O SDK recusou antes da nossa validação");
    const validada = insightDoModeloSchema.safeParse(resposta.value);
    expect(validada.success).toBe(false);
    if (validada.success) throw new Error("O teto de evidências foi afrouxado");
    expect(validada.error.issues).toEqual([expect.objectContaining({ path: ["evidencias"], code: "too_big", maximum: 6 })]);
  });
});
