/**
 * Fase 18-A — IA · Parsing e validação do keyring. PURO (não lê `process.env`).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE NUNCA ACONTECE AQUI, POR DECISÃO:                                               ║
 * ║                                                                                       ║
 * ║  • chave curta NÃO é completada com padding;                                          ║
 * ║  • senha humana NÃO vira master key (não há KDF, não há derivação de texto);          ║
 * ║  • versão ausente NÃO é ignorada nem substituída em silêncio por outra;               ║
 * ║  • nada aqui derruba o build nem o import de módulos não relacionados.                ║
 * ║                                                                                       ║
 * ║ Qualquer uma dessas "conveniências" transformaria uma configuração errada em          ║
 * ║ criptografia fraca que ninguém percebe — que é pior que criptografia ausente, porque  ║
 * ║ ausência aparece na tela e fraqueza não.                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Este arquivo NÃO tem `server-only`: ele é pura manipulação de string e byte, sem segredo
 * embutido e sem I/O, e precisa ser testável. Quem lê o ambiente é `crypto-readiness.ts`,
 * esse sim `server-only`.
 */

/** AES-256 exige exatamente 32 bytes. Não 31, não 33, não "o que der". */
export const MASTER_KEY_BYTES = 32;

export type MasterKey = {
  readonly version: number;
  readonly key: Uint8Array;
};

export type Keyring = {
  readonly keys: ReadonlyMap<number, Uint8Array>;
  /** A versão que CIFRA agora. As demais só decifram (rotação controlada). */
  readonly currentVersion: number;
};

export type KeyringParseResult =
  | { readonly ok: true; readonly keyring: Keyring }
  | { readonly ok: false; readonly reason: KeyringProblem; readonly detail: string };

export type KeyringProblem =
  | "ausente"
  | "formato_invalido"
  | "tamanho_invalido"
  | "versao_duplicada"
  | "versao_corrente_ausente"
  | "versao_corrente_invalida";

function decodeBase64(valor: string): Uint8Array | null {
  // Rejeita qualquer coisa que não seja base64 canônico ANTES de decodificar: `Buffer.from`
  // ignora lixo em silêncio e devolveria um buffer curto, que viraria "tamanho inválido"
  // com a mensagem errada.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(valor)) return null;
  try {
    const buf = Buffer.from(valor, "base64");
    // Ida e volta: se não bater, o texto não era base64 válido daquele conteúdo.
    if (buf.toString("base64") !== valor) return null;
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

/**
 * `raw` = "1:<base64>,2:<base64>" · `current` = "2".
 * Devolve problema TIPADO — nunca lança, nunca corrige por conta própria.
 */
export function parseKeyring(
  raw: string | undefined | null,
  current: string | undefined | null,
): KeyringParseResult {
  if (!raw || raw.trim() === "") {
    return {
      ok: false,
      reason: "ausente",
      detail: "AI_MASTER_KEYS não está definida no ambiente do servidor.",
    };
  }

  const keys = new Map<number, Uint8Array>();

  for (const entradaBruta of raw.split(",")) {
    const entrada = entradaBruta.trim();
    if (entrada === "") continue;

    const separador = entrada.indexOf(":");
    if (separador <= 0) {
      return {
        ok: false,
        reason: "formato_invalido",
        detail: "Cada entrada de AI_MASTER_KEYS precisa ser 'versao:base64'.",
      };
    }

    const versaoTexto = entrada.slice(0, separador).trim();
    const chaveTexto = entrada.slice(separador + 1).trim();

    if (!/^[1-9][0-9]*$/.test(versaoTexto)) {
      return {
        ok: false,
        reason: "formato_invalido",
        detail: "A versão da chave precisa ser um inteiro positivo.",
      };
    }
    const versao = Number(versaoTexto);

    const bytes = decodeBase64(chaveTexto);
    if (bytes === null) {
      return {
        ok: false,
        reason: "formato_invalido",
        detail: `A chave da versão ${versao} não está em base64 válido.`,
      };
    }
    if (bytes.length !== MASTER_KEY_BYTES) {
      // Aqui é onde o padding seria "prático" e catastrófico.
      return {
        ok: false,
        reason: "tamanho_invalido",
        detail: `A chave da versão ${versao} tem ${bytes.length} bytes; são necessários exatamente ${MASTER_KEY_BYTES}.`,
      };
    }
    if (keys.has(versao)) {
      return {
        ok: false,
        reason: "versao_duplicada",
        detail: `A versão ${versao} aparece mais de uma vez em AI_MASTER_KEYS.`,
      };
    }

    keys.set(versao, bytes);
  }

  if (keys.size === 0) {
    return {
      ok: false,
      reason: "ausente",
      detail: "AI_MASTER_KEYS não contém nenhuma chave.",
    };
  }

  if (!current || !/^[1-9][0-9]*$/.test(current.trim())) {
    return {
      ok: false,
      reason: "versao_corrente_invalida",
      detail: "AI_MASTER_KEY_CURRENT precisa ser um inteiro positivo.",
    };
  }

  const currentVersion = Number(current.trim());
  if (!keys.has(currentVersion)) {
    // Escolher outra versão aqui seria o "substituir em silêncio" proibido.
    return {
      ok: false,
      reason: "versao_corrente_ausente",
      detail: `AI_MASTER_KEY_CURRENT aponta para a versão ${currentVersion}, que não está em AI_MASTER_KEYS.`,
    };
  }

  return { ok: true, keyring: { keys, currentVersion } };
}

export class UnknownKeyVersionError extends Error {
  readonly version: number;
  constructor(version: number) {
    super(`Versão de chave-mestra desconhecida: ${version}.`);
    this.name = "UnknownKeyVersionError";
    this.version = version;
  }
}

/**
 * Resolve a chave de uma versão. Versão desconhecida é ERRO TIPADO — e não "chave inválida"
 * genérico. A diferença importa no diagnóstico: uma diz "você removeu uma versão que ainda
 * está em uso"; a outra manda o usuário procurar defeito no lugar errado.
 */
export function keyForVersion(keyring: Keyring, version: number): Uint8Array {
  const chave = keyring.keys.get(version);
  if (!chave) throw new UnknownKeyVersionError(version);
  return chave;
}

export function currentKey(keyring: Keyring): MasterKey {
  return {
    version: keyring.currentVersion,
    key: keyForVersion(keyring, keyring.currentVersion),
  };
}
