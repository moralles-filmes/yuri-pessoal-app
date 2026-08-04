/**
 * Fase 18-A — IA · Criptografia das credenciais.
 *
 * Estes são os oito casos que o arquivo da fase exige (critérios 18 a 25). Cada um existe
 * porque a falha correspondente é silenciosa: o sistema continuaria "funcionando" e o
 * segredo é que estaria desprotegido.
 */

import { describe, expect, it } from "vitest";
import {
  CredentialCryptoError,
  decryptCredential,
  encryptCredential,
  lastFour,
  rewrapCredential,
  secretsEqual,
} from "./credential-crypto";
import {
  MASTER_KEY_BYTES,
  UnknownKeyVersionError,
  parseKeyring,
  type Keyring,
} from "./keyring";

function chaveDeTeste(preenchimento: number): Uint8Array {
  return new Uint8Array(MASTER_KEY_BYTES).fill(preenchimento);
}

function keyringCom(versoes: Record<number, number>, corrente: number): Keyring {
  const keys = new Map<number, Uint8Array>();
  for (const [v, preenchimento] of Object.entries(versoes)) {
    keys.set(Number(v), chaveDeTeste(preenchimento));
  }
  return { keys, currentVersion: corrente };
}

const IDENTIDADE = {
  credentialId: "11111111-2222-4333-8444-555555555555",
  ownerId: "99999999-8888-4777-8666-555555555555",
  provider: "openai",
};

const SEGREDO = "sk-uma-chave-de-api-de-mentirinha-para-teste";

describe("credential-crypto — envelope AES-256-GCM", () => {
  it("18. o ciclo cifrar/decifrar devolve exatamente o segredo original", () => {
    const keyring = keyringCom({ 1: 0xa1 }, 1);
    const envelope = encryptCredential(keyring, IDENTIDADE, SEGREDO);
    expect(decryptCredential(keyring, IDENTIDADE, envelope)).toBe(SEGREDO);
  });

  it("19. o IV é distinto a cada operação sobre o MESMO segredo", () => {
    const keyring = keyringCom({ 1: 0xa1 }, 1);
    const a = encryptCredential(keyring, IDENTIDADE, SEGREDO);
    const b = encryptCredential(keyring, IDENTIDADE, SEGREDO);

    // Reusar IV em GCM não "enfraquece um pouco": destrói a confidencialidade.
    expect(a.iv).not.toBe(b.iv);
    expect(a.dekIv).not.toBe(b.dekIv);
    // E o ciphertext também muda, porque a DEK é nova a cada credencial.
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("20. authentication tag adulterada FALHA", () => {
    const keyring = keyringCom({ 1: 0xa1 }, 1);
    const envelope = encryptCredential(keyring, IDENTIDADE, SEGREDO);

    const adulterado = { ...envelope, authTag: trocarPrimeiroByte(envelope.authTag) };
    expect(() => decryptCredential(keyring, IDENTIDADE, adulterado)).toThrow(
      CredentialCryptoError,
    );

    const dekAdulterada = {
      ...envelope,
      dekAuthTag: trocarPrimeiroByte(envelope.dekAuthTag),
    };
    expect(() => decryptCredential(keyring, IDENTIDADE, dekAdulterada)).toThrow(
      CredentialCryptoError,
    );
  });

  it("21. AAD inválido FALHA (id da credencial diferente)", () => {
    const keyring = keyringCom({ 1: 0xa1 }, 1);
    const envelope = encryptCredential(keyring, IDENTIDADE, SEGREDO);

    expect(() =>
      decryptCredential(
        keyring,
        { ...IDENTIDADE, credentialId: "00000000-0000-4000-8000-000000000000" },
        envelope,
      ),
    ).toThrow(CredentialCryptoError);
  });

  it("22. ciphertext movido para outro PROVEDOR ou outro DONO falha", () => {
    const keyring = keyringCom({ 1: 0xa1 }, 1);
    const envelope = encryptCredential(keyring, IDENTIDADE, SEGREDO);

    // É esta amarra que impede as linhas do banco de virarem peças intercambiáveis.
    expect(() =>
      decryptCredential(keyring, { ...IDENTIDADE, provider: "anthropic" }, envelope),
    ).toThrow(CredentialCryptoError);

    expect(() =>
      decryptCredential(
        keyring,
        { ...IDENTIDADE, ownerId: "00000000-1111-4222-8333-444444444444" },
        envelope,
      ),
    ).toThrow(CredentialCryptoError);
  });

  it("23. key_version desconhecida devolve erro TIPADO, não 'chave inválida' genérico", () => {
    const keyring = keyringCom({ 1: 0xa1 }, 1);
    const envelope = encryptCredential(keyring, IDENTIDADE, SEGREDO);

    // A diferença importa no diagnóstico: uma diz "você removeu uma versão ainda em uso";
    // a outra mandaria o usuário procurar defeito no lugar errado.
    expect(() =>
      decryptCredential(keyring, IDENTIDADE, { ...envelope, keyVersion: 7 }),
    ).toThrow(UnknownKeyVersionError);
  });

  it("24. chave-mestra errada FALHA", () => {
    const original = keyringCom({ 1: 0xa1 }, 1);
    const impostor = keyringCom({ 1: 0xb2 }, 1);
    const envelope = encryptCredential(original, IDENTIDADE, SEGREDO);

    expect(() => decryptCredential(impostor, IDENTIDADE, envelope)).toThrow(
      CredentialCryptoError,
    );
  });

  it("25. o keyring resolve DUAS versões durante uma rotação controlada", () => {
    const antes = keyringCom({ 1: 0xa1 }, 1);
    const envelopeAntigo = encryptCredential(antes, IDENTIDADE, SEGREDO);

    // Durante a rotação as duas versões coexistem: a linha antiga continua legível.
    const durante = keyringCom({ 1: 0xa1, 2: 0xc3 }, 2);
    expect(decryptCredential(durante, IDENTIDADE, envelopeAntigo)).toBe(SEGREDO);

    // O re-embrulho passa a linha para a versão corrente, sem tocar no segredo.
    const reembrulhado = rewrapCredential(durante, IDENTIDADE, envelopeAntigo);
    expect(reembrulhado.keyVersion).toBe(2);
    expect(decryptCredential(durante, IDENTIDADE, reembrulhado)).toBe(SEGREDO);

    // E, terminada a rotação, a versão 1 pode sair do keyring sem quebrar nada.
    const depois = keyringCom({ 2: 0xc3 }, 2);
    expect(decryptCredential(depois, IDENTIDADE, reembrulhado)).toBe(SEGREDO);
  });

  it("o envelope NÃO carrega o segredo em claro em nenhum campo", () => {
    const keyring = keyringCom({ 1: 0xa1 }, 1);
    const envelope = encryptCredential(keyring, IDENTIDADE, SEGREDO);
    const serializado = JSON.stringify(envelope);

    expect(serializado).not.toContain(SEGREDO);
    expect(serializado).not.toContain("sk-uma-chave");
  });

  it("versão de algoritmo desconhecida é recusada", () => {
    const keyring = keyringCom({ 1: 0xa1 }, 1);
    const envelope = encryptCredential(keyring, IDENTIDADE, SEGREDO);
    expect(() =>
      decryptCredential(keyring, IDENTIDADE, { ...envelope, algorithmVersion: 99 }),
    ).toThrow(CredentialCryptoError);
  });

  it("lastFour nunca reconstrói o segredo", () => {
    expect(lastFour(SEGREDO)).toBe(SEGREDO.slice(-4));
    expect(lastFour("abc")).toBe("");
  });

  it("secretsEqual compara sem vazar o comprimento por exceção", () => {
    expect(secretsEqual("abc", "abc")).toBe(true);
    expect(secretsEqual("abc", "abd")).toBe(false);
    expect(secretsEqual("abc", "abcd")).toBe(false);
  });
});

describe("keyring — validação do ambiente", () => {
  const CHAVE_OK = Buffer.alloc(MASTER_KEY_BYTES, 7).toString("base64");
  const CHAVE_OK_2 = Buffer.alloc(MASTER_KEY_BYTES, 9).toString("base64");

  it("aceita uma configuração válida", () => {
    const r = parseKeyring(`1:${CHAVE_OK},2:${CHAVE_OK_2}`, "2");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.keyring.currentVersion).toBe(2);
      expect(r.keyring.keys.size).toBe(2);
    }
  });

  it("32. chave CURTA não é completada com padding", () => {
    const curta = Buffer.alloc(16, 7).toString("base64");
    const r = parseKeyring(`1:${curta}`, "1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("tamanho_invalido");
  });

  it("32. senha humana NÃO vira master key", () => {
    const r = parseKeyring("1:minha-senha-secreta", "1");
    expect(r.ok).toBe(false);
    // Não há derivação de texto: ou é base64 de 32 bytes, ou não serve.
    if (!r.ok) expect(["formato_invalido", "tamanho_invalido"]).toContain(r.reason);
  });

  it("32. versão corrente ausente NÃO é substituída em silêncio", () => {
    const r = parseKeyring(`1:${CHAVE_OK}`, "3");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("versao_corrente_ausente");
  });

  it("versão duplicada é recusada", () => {
    const r = parseKeyring(`1:${CHAVE_OK},1:${CHAVE_OK_2}`, "1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("versao_duplicada");
  });

  it("ausência é ausência — não é erro de formato", () => {
    expect(parseKeyring(undefined, "1")).toMatchObject({ ok: false, reason: "ausente" });
    expect(parseKeyring("", "1")).toMatchObject({ ok: false, reason: "ausente" });
  });

  it("versão corrente não numérica é recusada", () => {
    const r = parseKeyring(`1:${CHAVE_OK}`, "atual");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("versao_corrente_invalida");
  });

  it("a mensagem de erro NUNCA ecoa o valor da chave", () => {
    const curta = Buffer.alloc(16, 7).toString("base64");
    const r = parseKeyring(`1:${curta}`, "1");
    if (!r.ok) expect(r.detail).not.toContain(curta);
  });
});

function trocarPrimeiroByte(base64: string): string {
  const buf = Buffer.from(base64, "base64");
  buf[0] = buf[0] ^ 0xff;
  return buf.toString("base64");
}
