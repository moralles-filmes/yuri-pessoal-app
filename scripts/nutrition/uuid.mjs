/**
 * Fase 16-A — UUID v5 determinístico para o seed da base nutricional.
 *
 * Por que determinístico: a migration de seed precisa ser REEXECUTÁVEL e igual em qualquer
 * ambiente. Com `gen_random_uuid()` cada execução criaria ids novos e o `on conflict` teria
 * de casar por (source_id, source_food_code) em duas passadas. Derivando o id do código do
 * alimento, o mesmo alimento tem sempre o mesmo id — em dev, em produção e numa reimportação.
 *
 * Namespace fixo do módulo (gerado uma vez e congelado aqui):
 *   f6a1c0de-7b3e-5c9a-9f2d-4e8b1a0c7d51
 */
import { createHash } from "node:crypto";

const NAMESPACE = "f6a1c0de-7b3e-5c9a-9f2d-4e8b1a0c7d51";

function namespaceBytes() {
  const hex = NAMESPACE.replace(/-/g, "");
  return Buffer.from(hex, "hex");
}

/** UUID v5 (SHA-1) conforme RFC 4122. */
export function uuidv5(name) {
  const hash = createHash("sha1").update(namespaceBytes()).update(Buffer.from(name, "utf8")).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // versão 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export const idForSource = (code) => uuidv5(`source:${code}`);
export const idForCategory = (slug) => uuidv5(`category:${slug}`);
export const idForFood = (sourceCode, foodCode) => uuidv5(`food:${sourceCode}:${foodCode}`);
export const idForBatch = (sourceCode, version) => uuidv5(`batch:${sourceCode}:${version}`);
