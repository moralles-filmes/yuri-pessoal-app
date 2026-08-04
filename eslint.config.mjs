import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * ═══════════════════════ FRONTEIRAS DO MÓDULO DE IA (Fase 18-A) ═══════════════════════
 *
 * A regra "só `providers/` importa o AI SDK" não é convenção nem comentário: é regra
 * ESTÁTICA, porque convenção não sobrevive ao terceiro arquivo. São três mecanismos
 * independentes, e cada um pega o que os outros não pegam:
 *
 *   1. ESLint (aqui)  → import estático, inclusive por alias de path (`@/lib/...`).
 *   2. `server-only`  → QUEBRA O BUILD se um módulo client alcançar `src/lib/ai/server/`.
 *   3. Teste de rede  → varre import ESTÁTICO **e DINÂMICO** (`await import(...)`),
 *      que `no-restricted-imports` não enxerga.
 *
 * ⚠️ DUAS ARMADILHAS que custaram uma rodada de lint vermelho:
 *
 *   • As opções de uma regra NÃO se somam entre blocos do flat config: o último bloco que
 *     casar com o arquivo SUBSTITUI a configuração inteira. Por isso cada override abaixo
 *     reescreve a lista completa em vez de acrescentar um item.
 *
 *   • `patterns.group` usa semântica de **.gitignore**, não de minimatch de caminho: um
 *     padrão sem barra casa com QUALQUER componente do caminho. Ou seja, o grupo `"ai"`
 *     bloquearia `@/lib/ai/core/pricing` — todo o próprio módulo. Por isso o pacote `ai`
 *     entra em `paths` (casamento EXATO) e não em `patterns`.
 */

const VENDOR_MSG =
  "Somente src/lib/ai/providers/** pode importar o AI SDK. Use os contratos internos de src/lib/ai/core/.";
const CRYPTO_MSG =
  "credential-crypto só pode ser importado por src/lib/ai/server/**.";
const PURE_MSG =
  "Camada pura (core/agents/tools/usage/security/context/approval) não alcança providers/ nem server/.";

/** Casamento EXATO do pacote `ai` — em `patterns` ele pegaria o módulo inteiro. */
const VENDOR_PATHS = [{ name: "ai", message: VENDOR_MSG }];
/** `@ai-sdk/*` é seguro como padrão: o escopo `@ai-sdk` não aparece em caminho interno. */
const VENDOR_PATTERNS = [{ group: ["@ai-sdk/*"], message: VENDOR_MSG }];

/**
 * Sem barra de propósito: assim pega `./credential-crypto`, `../server/credential-crypto`
 * e `@/lib/ai/server/credential-crypto` de uma vez.
 */
const CRYPTO_PATTERN = {
  group: ["credential-crypto", "credential-crypto.*"],
  message: CRYPTO_MSG,
};

const PURE_PATTERN = {
  group: ["**/ai/providers/**", "**/ai/server/**"],
  message: PURE_MSG,
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // 1) Padrão do repositório inteiro: ninguém importa AI SDK nem credential-crypto.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: VENDOR_PATHS, patterns: [...VENDOR_PATTERNS, CRYPTO_PATTERN] },
      ],
    },
  },

  // 2) Camadas PURAS de IA: além do SDK, não alcançam providers/ nem server/.
  {
    files: [
      "src/lib/ai/core/**/*.ts",
      "src/lib/ai/agents/**/*.ts",
      "src/lib/ai/tools/**/*.ts",
      "src/lib/ai/usage/**/*.ts",
      "src/lib/ai/security/**/*.ts",
      "src/lib/ai/context/**/*.ts",
      "src/lib/ai/approval/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: VENDOR_PATHS,
          patterns: [...VENDOR_PATTERNS, CRYPTO_PATTERN, PURE_PATTERN],
        },
      ],
    },
  },

  // 3) providers/: ÚNICA camada autorizada a importar o AI SDK.
  {
    files: ["src/lib/ai/providers/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [CRYPTO_PATTERN] }],
    },
  },

  // 4) server/: allowlist de credential-crypto (mas o SDK continua fora).
  {
    files: ["src/lib/ai/server/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: VENDOR_PATHS, patterns: VENDOR_PATTERNS },
      ],
    },
  },
]);

export default eslintConfig;
