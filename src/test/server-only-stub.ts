/**
 * Stub de `server-only` para o Vitest.
 *
 * O pacote real exporta, na condição padrão do Node, um módulo que LANÇA — é assim que ele
 * quebra o build quando um componente client alcança código de servidor. Isso é exatamente
 * o que queremos em produção e exatamente o que impediria testar `credential-crypto` e
 * `keyring`, que precisam de teste unitário (critérios 18 a 25).
 *
 * ⚠️ O alias vale SÓ no Vitest (`vitest.config.ts`). O `next build` continua resolvendo o
 * pacote real, então a proteção segue intacta — e há teste de fronteira conferindo que todo
 * arquivo de `src/lib/ai/server/` importa `server-only`.
 */
export {};
