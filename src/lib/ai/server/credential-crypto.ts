import "server-only";

/**
 * Fase 18-A — IA · Envelope AES-256-GCM das credenciais de provedor.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ALLOWLIST: só `src/lib/ai/server/**` importa este arquivo. Garantido por ESLint       ║
 * ║ (`no-restricted-imports`, que pega alias de path), por `server-only` (quebra o build  ║
 * ║ se um módulo client alcançar) e por um teste de fronteira que varre import estático   ║
 * ║ E dinâmico.                                                                            ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ═══════════════════════ POR QUE ENVELOPE, E NÃO CIFRAR DIRETO ═══════════════════════
 *
 * Duas camadas: uma DEK aleatória por credencial cifra o segredo, e a master key do ambiente
 * cifra a DEK. Rotacionar a master key passa a ser RE-EMBRULHAR AS DEKs — operação pequena,
 * reversível e que não precisa tocar no segredo em si. Cifrando direto, toda rotação exigiria
 * decifrar e recifrar cada chave de API, e uma rotação interrompida deixaria credenciais
 * ilegíveis.
 *
 * ═══════════════════════ O AAD É O QUE AMARRA O CIPHERTEXT À LINHA ═══════════════════════
 *
 *   AAD = credential_id | owner_id | provider | key_version
 *
 * Nas DUAS camadas. Consequência prática: mover o ciphertext para outra linha, outro
 * provedor ou outro dono FALHA na verificação em vez de decifrar. Sem AAD, o banco continua
 * cifrado mas as linhas viram peças intercambiáveis.
 *
 * `credential_id` é gerado no SERVIDOR antes de cifrar, justamente porque precisa existir
 * para entrar no AAD.
 *
 * ═══════════════════════ O QUE NUNCA SAI DAQUI ═══════════════════════
 *
 * A chave decifrada é devolvida para UMA chamada e não é guardada em variável de módulo,
 * cache, log, resposta de API ou telemetria. Não existe função neste arquivo que devolva o
 * material do envelope para fora da camada `server/`.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  currentKey,
  keyForVersion,
  MASTER_KEY_BYTES,
  type Keyring,
} from "./keyring";

/** Versão do ALGORITMO (não da chave). Muda se o esquema mudar; hoje é 1. */
export const ALGORITHM_VERSION = 1;

const ALGO = "aes-256-gcm";
/** 12 bytes é o tamanho recomendado de IV para GCM. */
const IV_BYTES = 12;
const DEK_BYTES = 32;
const AUTH_TAG_BYTES = 16;

export type CredentialIdentity = {
  readonly credentialId: string;
  readonly ownerId: string;
  readonly provider: string;
};

/** Exatamente o que vai para as colunas de `ai_provider_credentials`. */
export type EncryptedEnvelope = {
  readonly ciphertext: string;
  readonly iv: string;
  readonly authTag: string;
  readonly wrappedDek: string;
  readonly dekIv: string;
  readonly dekAuthTag: string;
  readonly keyVersion: number;
  readonly algorithmVersion: number;
};

export class CredentialCryptoError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CredentialCryptoError";
    this.code = code;
  }
}

/**
 * O AAD, montado num lugar só. Se cifragem e decifragem montassem cada uma o seu, uma
 * mudança de ordem dos campos quebraria tudo silenciosamente na próxima leitura.
 */
function buildAad(identity: CredentialIdentity, keyVersion: number): Buffer {
  return Buffer.from(
    `${identity.credentialId}|${identity.ownerId}|${identity.provider}|${keyVersion}`,
    "utf8",
  );
}

function sealWithKey(
  key: Uint8Array,
  plaintext: Buffer,
  aad: Buffer,
): { ciphertext: string; iv: string; authTag: string } {
  // IV ALEATÓRIO E EXCLUSIVO por operação. Reusar IV em GCM não "enfraquece um pouco":
  // destrói a confidencialidade e permite forjar a tag.
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_BYTES });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

function openWithKey(
  key: Uint8Array,
  ciphertextB64: string,
  ivB64: string,
  authTagB64: string,
  aad: Buffer,
  contexto: string,
): Buffer {
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");

  if (iv.length !== IV_BYTES) {
    throw new CredentialCryptoError("IV_INVALIDO", `IV inválido em ${contexto}.`);
  }
  if (authTag.length !== AUTH_TAG_BYTES) {
    throw new CredentialCryptoError(
      "TAG_INVALIDA",
      `Tag de autenticação inválida em ${contexto}.`,
    );
  }

  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_BYTES });
  decipher.setAAD(aad);
  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, "base64")),
      decipher.final(),
    ]);
  } catch {
    // Tag adulterada, AAD divergente ou chave errada caem TODOS aqui — e é assim que tem de
    // ser: distinguir os três daria a um atacante um oráculo para descobrir qual das três
    // coisas ele acertou.
    throw new CredentialCryptoError(
      "VERIFICACAO_FALHOU",
      `Não foi possível verificar a integridade em ${contexto}.`,
    );
  }
}

/**
 * Cifra a chave de API. `keyring` é INJETADO — este arquivo não lê `process.env`, o que o
 * torna testável e mantém a leitura do ambiente num lugar só (`crypto-readiness.ts`).
 */
export function encryptCredential(
  keyring: Keyring,
  identity: CredentialIdentity,
  plaintext: string,
): EncryptedEnvelope {
  if (plaintext.length === 0) {
    throw new CredentialCryptoError("SEGREDO_VAZIO", "A chave de API está vazia.");
  }

  const master = currentKey(keyring);
  if (master.key.length !== MASTER_KEY_BYTES) {
    throw new CredentialCryptoError(
      "MASTER_KEY_INVALIDA",
      "A chave-mestra corrente não tem o tamanho exigido.",
    );
  }

  const aad = buildAad(identity, master.version);

  // Camada 1: DEK nova, aleatória, exclusiva desta credencial.
  const dek = randomBytes(DEK_BYTES);
  const segredo = sealWithKey(dek, Buffer.from(plaintext, "utf8"), aad);

  // Camada 2: a DEK embrulhada pela master key corrente, com o MESMO AAD.
  const embrulho = sealWithKey(master.key, dek, aad);

  // A DEK em claro não sobrevive a esta função.
  dek.fill(0);

  return {
    ciphertext: segredo.ciphertext,
    iv: segredo.iv,
    authTag: segredo.authTag,
    wrappedDek: embrulho.ciphertext,
    dekIv: embrulho.iv,
    dekAuthTag: embrulho.authTag,
    keyVersion: master.version,
    algorithmVersion: ALGORITHM_VERSION,
  };
}

/**
 * Decifra pela `key_version` DA LINHA — não pela corrente. É isso que faz a rotação
 * funcionar: durante ela as duas versões coexistem, linhas antigas continuam legíveis, e
 * o re-embrulho acontece quando for conveniente, não como pré-requisito.
 */
export function decryptCredential(
  keyring: Keyring,
  identity: CredentialIdentity,
  envelope: EncryptedEnvelope,
): string {
  if (envelope.algorithmVersion !== ALGORITHM_VERSION) {
    throw new CredentialCryptoError(
      "ALGORITMO_DESCONHECIDO",
      `Versão de algoritmo não suportada: ${envelope.algorithmVersion}.`,
    );
  }

  // `keyForVersion` lança `UnknownKeyVersionError` — erro TIPADO e distinto de "chave
  // inválida", porque as causas e as correções são diferentes.
  const master = keyForVersion(keyring, envelope.keyVersion);
  const aad = buildAad(identity, envelope.keyVersion);

  const dek = openWithKey(
    master,
    envelope.wrappedDek,
    envelope.dekIv,
    envelope.dekAuthTag,
    aad,
    "no embrulho da DEK",
  );

  try {
    const segredo = openWithKey(
      dek,
      envelope.ciphertext,
      envelope.iv,
      envelope.authTag,
      aad,
      "no segredo",
    );
    return segredo.toString("utf8");
  } finally {
    dek.fill(0);
  }
}

/**
 * Rotação: re-embrulha SÓ a DEK, pela versão corrente. O segredo não é decifrado nem
 * recifrado — permanece byte a byte o mesmo, com o mesmo IV e a mesma tag.
 *
 * ⚠️ O AAD carrega a `key_version`, então a camada 1 precisa ser reaberta e reselada com o
 * AAD novo. O que NÃO muda é a DEK: ela continua a mesma, e é ela que o envelope protege.
 */
export function rewrapCredential(
  keyring: Keyring,
  identity: CredentialIdentity,
  envelope: EncryptedEnvelope,
): EncryptedEnvelope {
  const plaintext = decryptCredential(keyring, identity, envelope);
  return encryptCredential(keyring, identity, plaintext);
}

/** Últimos caracteres, só para a tela reconhecer a chave. Nunca reconstrói o segredo. */
export function lastFour(plaintext: string): string {
  return plaintext.length <= 4 ? "" : plaintext.slice(-4);
}

/** Comparação em tempo constante, para quando for preciso comparar segredos. */
export function secretsEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
