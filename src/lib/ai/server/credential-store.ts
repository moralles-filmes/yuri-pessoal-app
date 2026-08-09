import "server-only";

/**
 * Fase 18-A — IA · Guarda e resolve credenciais. O CIPHERTEXT NÃO SAI DAQUI.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ AS QUERIES DA TELA PEDEM COLUNAS EXPLÍCITAS, NUNCA `select('*')`.                     ║
 * ║                                                                                       ║
 * ║ Um `*` hoje traz `ciphertext`, `wrapped_dek`, `iv` e `auth_tag` para dentro de um     ║
 * ║ objeto que alguém, algum dia, vai serializar num `props` de componente. O material    ║
 * ║ criptográfico só é lido no caminho que decifra — e esse caminho devolve a chave para  ║
 * ║ UMA chamada, sem guardar em variável de módulo, cache, log ou telemetria.             ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ═══════════════════════ A ORDEM ENTRE CIFRAR, TESTAR E PERSISTIR ═══════════════════════
 *
 * Primeira credencial do provedor:  gerar id → cifrar → persistir como `nao_validada`
 * Substituindo uma existente:       cifrar em memória → TESTAR → só gravar se passar
 *
 * A credencial antiga NÃO é sobrescrita por uma que não funciona. Trocar uma chave válida
 * por uma inválida e ficar sem acesso é o pior resultado possível — e é justamente o momento
 * em que o usuário está mexendo em algo que funcionava.
 */

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import type { ClienteDaIa } from "./client";
import type { AiProviderId } from "@/lib/ai/core/contracts";
import { aiError, type AiError } from "@/lib/ai/core/errors";
import { err, ok, type Result } from "@/lib/ai/core/result";
import { createProviderClient } from "@/lib/ai/providers/provider-factory";
import {
  connectionTestCode,
  CONNECTION_TEST_MESSAGE,
  type ConnectionTestCode,
} from "@/lib/ai/providers/ai-sdk/error-map";
import { JANELA_TESTE_CONEXAO } from "@/lib/ai/security/rate-limit";
import {
  decryptCredential,
  encryptCredential,
  lastFour,
  type EncryptedEnvelope,
} from "./credential-crypto";
import { AI_CRYPTO_NOT_CONFIGURED, getCryptoReadiness } from "./crypto-readiness";

/** Colunas que a TELA pode ver. Nenhuma delas é material criptográfico. */
const COLUNAS_PUBLICAS =
  "provider, status, last_four, last_validated_at, updated_at" as const;

export type CredentialSummary = {
  readonly provider: AiProviderId;
  readonly status: "nao_validada" | "valida" | "invalida";
  readonly lastFour: string | null;
  readonly lastValidatedAt: string | null;
  readonly updatedAt: string;
};

export type ConnectionTestResult =
  | { readonly ok: true; readonly modelosVistos: number }
  | { readonly ok: false; readonly code: ConnectionTestCode; readonly message: string };

/** Timeout do teste de conexão. 10 s: é uma listagem, não uma geração. */
const TESTE_TIMEOUT_MS = 10_000;

// ─────────────────────────── Leitura para a tela ───────────────────────────

export async function getCredentialSummaries(
  userId: string,
): Promise<CredentialSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_provider_credentials")
    .select(COLUNAS_PUBLICAS)
    .eq("user_id", userId)
    .order("provider");

  if (error || !data) return [];

  return data.map((linha) => ({
    provider: linha.provider as AiProviderId,
    status: linha.status as CredentialSummary["status"],
    lastFour: linha.last_four,
    lastValidatedAt: linha.last_validated_at,
    updatedAt: linha.updated_at,
  }));
}

// ─────────────────────────── Escrita ───────────────────────────

export type SaveCredentialInput = {
  readonly userId: string;
  readonly provider: AiProviderId;
  readonly apiKey: string;
};

/**
 * Grava a credencial. Duas rotas, deliberadamente diferentes:
 *
 *  • NÃO existe credencial → cifra e persiste como `nao_validada`. O usuário testa quando
 *    quiser. Exigir teste aqui impediria salvar uma chave num momento de instabilidade do
 *    provedor.
 *  • JÁ existe            → cifra em memória, TESTA, e só grava se passar.
 */
export async function saveCredential(
  input: SaveCredentialInput,
): Promise<Result<{ substituiu: boolean }, AiError>> {
  const readiness = getCryptoReadiness();
  if (!readiness.ready) {
    return err(aiError("ERRO_PERMANENTE", AI_CRYPTO_NOT_CONFIGURED, readiness.message));
  }

  const supabase = await createClient();

  const { data: existente } = await supabase
    .from("ai_provider_credentials")
    .select("id")
    .eq("user_id", input.userId)
    .eq("provider", input.provider)
    .maybeSingle();

  const substituindo = existente !== null && existente !== undefined;

  if (substituindo) {
    // A chave nova é provada ANTES de tocar na linha que funciona.
    const teste = await runConnectionTest(input.provider, input.apiKey);
    if (!teste.ok) {
      return err(aiError("AUTENTICACAO_INVALIDA", teste.code, teste.message));
    }
  }

  // `credential_id` é gerado AQUI, antes de cifrar, porque entra no AAD.
  const credentialId = substituindo ? existente.id : randomUUID();

  const envelope = encryptCredential(
    readiness.keyring,
    {
      credentialId,
      ownerId: input.userId,
      provider: input.provider,
    },
    input.apiKey,
  );

  const linha = {
    id: credentialId,
    user_id: input.userId,
    provider: input.provider,
    ciphertext: envelope.ciphertext,
    iv: envelope.iv,
    auth_tag: envelope.authTag,
    wrapped_dek: envelope.wrappedDek,
    dek_iv: envelope.dekIv,
    dek_auth_tag: envelope.dekAuthTag,
    key_version: envelope.keyVersion,
    algorithm_version: envelope.algorithmVersion,
    last_four: lastFour(input.apiKey),
    status: substituindo ? ("valida" as const) : ("nao_validada" as const),
    last_validated_at: substituindo ? new Date().toISOString() : null,
  };

  const { error } = substituindo
    ? await supabase
        .from("ai_provider_credentials")
        .update(linha)
        .eq("id", credentialId)
        .eq("user_id", input.userId)
    : await supabase.from("ai_provider_credentials").insert(linha);

  if (error) {
    return err(
      aiError(
        "ERRO_PERMANENTE",
        "CREDENTIAL_WRITE_FAILED",
        "Não foi possível salvar a credencial.",
      ),
    );
  }

  return ok({ substituiu: substituindo });
}

export async function deleteCredential(
  userId: string,
  provider: AiProviderId,
): Promise<Result<true, AiError>> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_provider_credentials")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);

  if (error) {
    return err(
      aiError(
        "ERRO_PERMANENTE",
        "CREDENTIAL_DELETE_FAILED",
        "Não foi possível remover a credencial.",
      ),
    );
  }
  return ok(true);
}

// ─────────────────────────── Resolução (para UMA chamada) ───────────────────────────

/**
 * Devolve a chave decifrada. Chamada uma vez por tentativa, imediatamente antes de falar
 * com o provedor — nunca antes disso, e o valor não é guardado em lugar nenhum.
 *
 * ⚠️ Quem chama NÃO deve logar, serializar nem devolver o retorno desta função.
 */
export async function resolveApiKey(
  userId: string,
  provider: AiProviderId,
  /** 18-E Bloco 4 — sem sessão (Cron). `userId` já era explícito; falta só o client. */
  client?: ClienteDaIa,
): Promise<Result<string, AiError>> {
  const readiness = getCryptoReadiness();
  if (!readiness.ready) {
    return err(aiError("ERRO_PERMANENTE", AI_CRYPTO_NOT_CONFIGURED, readiness.message));
  }

  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("ai_provider_credentials")
    .select(
      "id, ciphertext, iv, auth_tag, wrapped_dek, dek_iv, dek_auth_tag, key_version, algorithm_version, status",
    )
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();

  if (error || !data) {
    return err(
      aiError(
        "AUTENTICACAO_INVALIDA",
        "CREDENTIAL_NOT_FOUND",
        `Nenhuma credencial cadastrada para ${provider}.`,
      ),
    );
  }
  if (data.status === "invalida") {
    return err(
      aiError(
        "AUTENTICACAO_INVALIDA",
        "CREDENTIAL_MARKED_INVALID",
        `A credencial de ${provider} está marcada como inválida. Atualize-a em Configurações.`,
      ),
    );
  }

  const envelope: EncryptedEnvelope = {
    ciphertext: data.ciphertext,
    iv: data.iv,
    authTag: data.auth_tag,
    wrappedDek: data.wrapped_dek,
    dekIv: data.dek_iv,
    dekAuthTag: data.dek_auth_tag,
    keyVersion: data.key_version,
    algorithmVersion: data.algorithm_version,
  };

  try {
    const chave = decryptCredential(
      readiness.keyring,
      { credentialId: data.id, ownerId: userId, provider },
      envelope,
    );
    return ok(chave);
  } catch (e) {
    // O detalhe da falha (tag adulterada, AAD divergente, versão desconhecida) fica no
    // código; a mensagem é a mesma para o usuário — ele não tem o que fazer com a diferença,
    // e um atacante teria.
    const code =
      e instanceof Error && e.name === "UnknownKeyVersionError"
        ? "UNKNOWN_KEY_VERSION"
        : "DECRYPT_FAILED";
    return err(
      aiError(
        "AUTENTICACAO_INVALIDA",
        code,
        "Não foi possível abrir a credencial guardada. Cadastre a chave novamente.",
      ),
    );
  }
}

// ─────────────────────────── Teste de conexão ───────────────────────────

/**
 * A chamada real do teste. Vai ao endpoint de LISTAGEM DE MODELOS do provedor — que custa
 * ZERO tokens. É exatamente por isso que ele foi escolhido em vez de uma geração mínima:
 * valida a chave sem consumir nada, sem criar `ai_run`, sem gerar `ai_usage_event` e sem
 * tocar no orçamento.
 */
async function runConnectionTest(
  provider: AiProviderId,
  apiKey: string,
): Promise<ConnectionTestResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TESTE_TIMEOUT_MS);

  try {
    const client = createProviderClient(provider, apiKey);
    const resultado = await client.listModels(controller.signal);

    if (!resultado.ok) {
      const code = connectionTestCode(resultado.error);
      return { ok: false, code, message: CONNECTION_TEST_MESSAGE[code] };
    }
    return { ok: true, modelosVistos: resultado.value.length };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Testa a credencial JÁ GUARDADA e grava `last_validated_at`. Sem revelar nada: o retorno
 * tem código fechado e mensagem nossa — nunca corpo de resposta, header ou eco da chave.
 */
export async function testStoredCredential(
  userId: string,
  provider: AiProviderId,
): Promise<ConnectionTestResult> {
  const supabase = await createClient();

  // ── Rate limit próprio: 6/h por provedor, separado do rate limit do chat ────────────
  const { data: janela } = await supabase
    .from("ai_provider_credentials")
    .select("test_window_started_at, test_count")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();

  const agora = Date.now();
  const inicioJanela = janela?.test_window_started_at
    ? Date.parse(janela.test_window_started_at)
    : null;
  const janelaViva =
    inicioJanela !== null && agora - inicioJanela < JANELA_TESTE_CONEXAO.seconds * 1000;

  if (janelaViva && (janela?.test_count ?? 0) >= JANELA_TESTE_CONEXAO.limit) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      message: `Limite de ${JANELA_TESTE_CONEXAO.limit} testes por hora atingido para este provedor.`,
    };
  }

  const chave = await resolveApiKey(userId, provider);
  if (!chave.ok) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message: chave.error.message,
    };
  }

  const resultado = await runConnectionTest(provider, chave.value);

  await supabase
    .from("ai_provider_credentials")
    .update({
      status: resultado.ok ? "valida" : marcaStatus(resultado.code),
      last_validated_at: resultado.ok ? new Date().toISOString() : null,
      test_window_started_at: janelaViva
        ? (janela?.test_window_started_at ?? new Date().toISOString())
        : new Date().toISOString(),
      test_count: janelaViva ? (janela?.test_count ?? 0) + 1 : 1,
    })
    .eq("user_id", userId)
    .eq("provider", provider);

  return resultado;
}

/**
 * Só `INVALID_KEY` marca a credencial como inválida. Rede instável ou provedor fora do ar
 * NÃO tornam a chave ruim — marcar aqui faria o usuário sair trocando uma chave que estava
 * perfeita por causa de um timeout.
 */
function marcaStatus(code: ConnectionTestCode): "invalida" | "nao_validada" {
  return code === "INVALID_KEY" ? "invalida" : "nao_validada";
}
