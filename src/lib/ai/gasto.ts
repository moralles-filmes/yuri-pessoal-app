/**
 * REDESIGN-07-D · D2 — IA · A frase de gasto, dita ANTES do clique.
 *
 * Panoramas, compositor, "Gerar análise" e o comprovante disparam uma chamada paga ao
 * provedor do dono. Cada um diz isso ao lado do gatilho, com as MESMAS palavras — e as
 * palavras moram aqui, uma vez.
 *
 * ⚠️ Fora de `@/lib/ai/constants` de propósito: aquele módulo entra em toda tela da IA, e
 * duas strings que só quatro telas leem custariam bytes também a `/ia/consumo`, `/ia/acoes` e
 * `/ia/memoria` (a lição do D1, medida). Puro e sem import, como ele.
 */

export const CUSTO_DA_IA = "o custo estimado entra no seu orçamento e aparece em Consumo";

export const AVISO_DE_GASTO = `Usa o provedor de IA que você configurou: ${CUSTO_DA_IA}.`;
