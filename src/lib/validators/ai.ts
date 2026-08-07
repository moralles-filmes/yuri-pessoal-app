import { z } from "zod";
import { optionalText } from "@/lib/validators/shared";
import { AI_PROVIDERS } from "@/lib/ai/core/contracts";

/**
 * Fase 18-A — IA · Schemas Zod.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ TODOS SÃO `.strict()`. Campo a mais é ERRO, não é ignorado.                           ║
 * ║                                                                                       ║
 * ║ É isso que faz `user_id`, `owner_id`, `attachments`, `image`, `file` e `document`     ║
 * ║ serem REJEITADOS com 400 em `/api/ia/chat` — sem precisar de uma lista de proibidos   ║
 * ║ que alguém esqueceria de atualizar. Anexo é 18-D; até lá, o que não está no schema     ║
 * ║ não entra.                                                                             ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⛔ E todos aceitam a PRÓPRIA SAÍDA (`parse(parse(x))` funciona). Ver
 * `src/lib/validators/round-trip.test.ts` — os schemas usados com `zodResolver` estão lá.
 */

export const aiProviderEnum = z.enum(AI_PROVIDERS);

/** Modelo: id do catálogo. O texto livre é limitado, mas quem VALIDA é o catálogo. */
const modelId = z
  .string()
  .trim()
  .max(120, "Identificador de modelo muito longo")
  .nullish()
  .transform((v) => (v && v.length ? v : null));

/**
 * Limite do texto da mensagem no ROUTE HANDLER. O banco tem um backstop de 32.000 — maior
 * de propósito, porque ele protege o caminho que não passa por aqui (RPC direto).
 */
export const MAX_CHAT_TEXT = 16_000;
/** Limite do CORPO HTTP inteiro. Bem acima do texto, para caber JSON e acentuação. */
export const MAX_CHAT_BODY_BYTES = 64 * 1024;

// ─────────────────────────── Contexto da página (18-B) ───────────────────────────

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A LISTA DE ROTAS É ESTÁTICA: UMA ROTA QUE NÃO ESTÁ AQUI NÃO EXISTE PARA A IA.         ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⛔ **A PÁGINA NÃO MANDA CONTEÚDO.** Nem HTML, nem título, nem estado, nem texto de
 * registro. O único campo que atravessa o transporte é `rota`, e ele é um valor de uma
 * lista fechada escrita AQUI — não é texto do usuário. É a regra 5 do projeto ("dado é
 * dado, nunca instrução") aplicada à borda: se a página pudesse mandar texto, o conteúdo
 * da tela viraria entrada do modelo sem passar por bloco não confiável.
 *
 * ⛔ **O MÓDULO É RESOLVIDO PELO SERVIDOR**, por `MODULO_DA_ROTA`, e NÃO é aceito no
 * payload. O módulo é o que decide o agente (`routeAgent`) e, por tabela, a allowlist de
 * ferramentas — deixar a tela declará-lo seria deixar o cliente escolher o que a IA pode
 * ler. Recusar é melhor que aceitar-e-ignorar: um contexto que o roteador ignora em
 * silêncio é pior que um 400.
 *
 * ⛔ **NÃO HÁ `registroId` NEM `tipoRegistro`** nesta subfase, e a ausência é deliberada:
 *   1. nenhuma das rotas da lista é a de um registro (`/treinos/historico/[id]` **não**
 *      está aqui), então não há de onde sair um id; e
 *   2. nada na 18-B consome um id de registro — as três ferramentas de Treinos recebem os
 *      próprios argumentos do modelo (`dias`, `exercicio`), nenhuma recebe id.
 * Aceitar o campo agora seria campo fantasma: entraria validado, não seria lido por
 * ninguém, e o comentário que promete "a query do módulo confere sob RLS" descreveria
 * código que não existe. Ele entra JUNTO do consumidor que o resolver.
 *
 * `user_id` não existe aqui — como em todo schema deste arquivo, ele vem só de
 * `authContext()`. E entrada e saída têm a MESMA forma: `parse(parse(x))` funciona.
 */
export const ROTAS_COM_CONTEXTO = [
  "/treinos",
  "/treinos/historico",
  "/treinos/recordes",
] as const;

export type RotaComContexto = (typeof ROTAS_COM_CONTEXTO)[number];

/** Mesmo vocabulário de `ToolDescriptor.module` — quem entra aqui tem ferramenta lá. */
export const MODULOS_COM_CONTEXTO = ["training"] as const;

export type ModuloComContexto = (typeof MODULOS_COM_CONTEXTO)[number];

/**
 * `satisfies Record<…>` é a trava: uma rota nova em `ROTAS_COM_CONTEXTO` sem entrada aqui
 * é erro de compilação, não uma rota que silenciosamente não roteia para lugar nenhum.
 */
const MODULO_DA_ROTA = {
  "/treinos": "training",
  "/treinos/historico": "training",
  "/treinos/recordes": "training",
} as const satisfies Record<RotaComContexto, ModuloComContexto>;

/** O contexto como o runner o consome. Montado NO SERVIDOR, a partir da rota validada. */
export function contextoDaRota(rota: RotaComContexto): {
  readonly rota: RotaComContexto;
  readonly modulo: ModuloComContexto;
} {
  return { rota, modulo: MODULO_DA_ROTA[rota] };
}

/** Para validar um valor de origem desconhecida (parâmetro de URL, por exemplo). */
export function isRotaComContexto(valor: unknown): valor is RotaComContexto {
  return (
    typeof valor === "string" && (ROTAS_COM_CONTEXTO as readonly string[]).includes(valor)
  );
}

export const pageContextSchema = z
  .object({ rota: z.enum(ROTAS_COM_CONTEXTO) })
  .strict();

export type PageContextInput = z.infer<typeof pageContextSchema>;

// ─────────────────────────── Chat ───────────────────────────

/**
 * O payload aceito por `/api/ia/chat`, E NADA ALÉM DISTO.
 * `conversationId` ausente = conversa nova.
 */
export const chatRequestSchema = z
  .object({
    conversationId: z.uuid("Conversa inválida").optional(),
    text: z
      .string()
      .trim()
      .min(1, "Escreva alguma coisa antes de enviar.")
      .max(MAX_CHAT_TEXT, `Máximo de ${MAX_CHAT_TEXT} caracteres`),
    agentId: z.string().trim().min(1).max(60).optional(),
    /** Ausente = a tela não mandou contexto. Ver `pageContextSchema`. */
    pageContext: pageContextSchema.optional(),
    providerPreference: aiProviderEnum.optional(),
    modelPreference: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;

// ─────────────────────────── Configuração de provedor ───────────────────────────

export const aiProviderConfigSchema = z
  .object({
    provider: aiProviderEnum,
    enabled: z.boolean(),
    displayName: optionalText(80),
    defaultModel: modelId,
    economyModel: modelId,
    advancedModel: modelId,
    visionModel: modelId,
    timeoutMs: z.coerce
      .number()
      .int("Use um número inteiro")
      .min(1000, "Mínimo de 1000 ms")
      .max(300_000, "Máximo de 300000 ms"),
    maxRetries: z.coerce
      .number()
      .int("Use um número inteiro")
      .min(0, "Não pode ser negativo")
      .max(3, "Máximo de 3"),
    // Limites em USD. `null` = sem limite próprio deste provedor — NÃO é zero.
    dailyLimit: z.coerce
      .number()
      .nonnegative("Não pode ser negativo")
      .nullish()
      .transform((v) => (v === undefined ? null : v)),
    monthlyLimit: z.coerce
      .number()
      .nonnegative("Não pode ser negativo")
      .nullish()
      .transform((v) => (v === undefined ? null : v)),
    fallbackAllowed: z.boolean(),
    fallbackOrder: z
      .array(aiProviderEnum)
      .max(4)
      .nullish()
      .transform((v) => v ?? []),
  })
  .strict();

export type AiProviderConfigInput = z.infer<typeof aiProviderConfigSchema>;

// ─────────────────────────── Credencial ───────────────────────────

/**
 * A chave em si. NÃO validamos formato por provedor: um regex "sk-…" recusaria uma chave
 * legítima no dia em que o provedor mudar o prefixo, e não impede nada — quem diz se a
 * chave vale é o provedor, no teste de conexão.
 */
export const aiCredentialSchema = z
  .object({
    provider: aiProviderEnum,
    apiKey: z
      .string()
      .trim()
      .min(8, "A chave parece curta demais")
      .max(500, "A chave parece longa demais"),
  })
  .strict();

export const aiProviderRefSchema = z.object({ provider: aiProviderEnum }).strict();

// ─────────────────────────── Preferências ───────────────────────────

export const aiPreferencesSchema = z
  .object({
    defaultProvider: aiProviderEnum
      .nullish()
      .transform((v) => (v === undefined ? null : v)),
    defaultModel: modelId,
    confirmationMode: z.enum(["seguro", "equilibrado", "rapido"]),
    allowFallback: z.boolean(),
    dailyBudget: z.coerce
      .number()
      .nonnegative("Não pode ser negativo")
      .nullish()
      .transform((v) => (v === undefined ? null : v)),
    monthlyBudget: z.coerce
      .number()
      .nonnegative("Não pode ser negativo")
      .nullish()
      .transform((v) => (v === undefined ? null : v)),
    budgetBlockOnLimit: z.boolean(),
    reservationMargin: z.coerce
      .number()
      .min(1, "A margem não pode ser menor que 1,00")
      .max(3, "A margem não pode passar de 3,00"),
    rateLimitPerMinute: z.coerce.number().int().min(1).max(120),
    rateLimitPerHour: z.coerce.number().int().min(1).max(2000),
  })
  .strict();

export type AiPreferencesInput = z.infer<typeof aiPreferencesSchema>;

// ─────────────────────────── Conversas ───────────────────────────

export const conversationRefSchema = z
  .object({ conversationId: z.uuid("Conversa inválida") })
  .strict();

export const renameConversationSchema = z
  .object({
    conversationId: z.uuid("Conversa inválida"),
    title: z
      .string()
      .trim()
      .min(1, "Dê um nome à conversa")
      .max(120, "Máximo de 120 caracteres"),
  })
  .strict();

export const setConversationStatusSchema = z
  .object({
    conversationId: z.uuid("Conversa inválida"),
    status: z.enum(["ativa", "arquivada"]),
  })
  .strict();

export const setConversationFavoriteSchema = z
  .object({
    conversationId: z.uuid("Conversa inválida"),
    isFavorite: z.boolean(),
  })
  .strict();
