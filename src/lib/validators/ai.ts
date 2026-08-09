import { z } from "zod";
import { optionalText } from "@/lib/validators/shared";
import { AI_PROVIDERS } from "@/lib/ai/core/contracts";
import {
  TOOL_PERMISSIONS,
  TOOL_WRITE_PERMISSIONS,
  type ToolPermission,
  type ToolWritePermission,
} from "@/lib/ai/tools/contracts";

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

/** A mensagem em pt-BR fica AQUI para valer em todo schema que reusar o enum. */
export const aiProviderEnum = z.enum(AI_PROVIDERS, { error: "Provedor não reconhecido." });

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
  // 18-C · Lote 1. Cada uma destas é a tela ÚNICA do seu módulo — não há rota por registro
  // aqui, pela mesma razão registrada acima.
  "/todo",
  "/habitos",
  "/estudos",
  // 18-C · Lote 2
  "/agenda",
  "/tarefas",
  "/rotinas",
  // ⚠️ `/nutricao/medidas` mapeia para o módulo `body`, não para `nutrition`: a tela mora
  // dentro de Dieta, mas o dado é do módulo central `body_*` e a permissão é `allow_body`.
  "/nutricao/medidas",
  // 18-C · Lote 3
  "/financeiro",
  "/faturas",
  "/nutricao",
  "/nutricao/diario",
] as const;

export type RotaComContexto = (typeof ROTAS_COM_CONTEXTO)[number];

/** Mesmo vocabulário de `ToolDescriptor.module` — quem entra aqui tem ferramenta lá. */
export const MODULOS_COM_CONTEXTO = [
  "training",
  "todo",
  "habits",
  "studies",
  "calendar",
  "tasks",
  "body",
  "finance",
  "nutrition",
] as const;

export type ModuloComContexto = (typeof MODULOS_COM_CONTEXTO)[number];

/**
 * `satisfies Record<…>` é a trava: uma rota nova em `ROTAS_COM_CONTEXTO` sem entrada aqui
 * é erro de compilação, não uma rota que silenciosamente não roteia para lugar nenhum.
 */
const MODULO_DA_ROTA = {
  "/treinos": "training",
  "/treinos/historico": "training",
  "/treinos/recordes": "training",
  "/todo": "todo",
  "/habitos": "habits",
  "/estudos": "studies",
  "/agenda": "calendar",
  "/tarefas": "tasks",
  "/rotinas": "tasks",
  "/nutricao/medidas": "body",
  "/financeiro": "finance",
  "/faturas": "finance",
  // ⚠️ `/nutricao` e `/nutricao/diario` são `nutrition`; só `/nutricao/medidas` é `body`.
  // A tela mora dentro de Dieta, mas o dado é do módulo central.
  "/nutricao": "nutrition",
  "/nutricao/diario": "nutrition",
} as const satisfies Record<RotaComContexto, ModuloComContexto>;

/** O contexto como o runner o consome. Montado NO SERVIDOR, a partir da rota validada. */
export function contextoDaRota(rota: RotaComContexto): {
  readonly rota: RotaComContexto;
  readonly modulo: ModuloComContexto;
} {
  return { rota, modulo: MODULO_DA_ROTA[rota] };
}

/*
 * ⛔ NÃO há um `isRotaComContexto` aqui, e a ausência é a mesma decisão que deixou
 * `registroId` de fora: ele existiu por um commit, prometendo no docblock servir para
 * "validar um parâmetro de URL", e nenhuma rota do projeto lê rota de query string. Era
 * função fantasma — e `pageContextSchema.safeParse({ rota }).success` já responde a mesma
 * pergunta. Ele volta JUNTO do link "Perguntar à IA" que o justificar.
 */

export const pageContextSchema = z
  .object({
    // A mensagem em pt-BR é obrigatória, não decorativa: o `error` do Zod chega CRU ao
    // `toast` da tela (`route.ts` devolve `issues[0].message`, `chat-client.tsx` mostra).
    // Sem ela o usuário leria `Invalid option: expected one of "/treinos"|…` em inglês —
    // e este é o primeiro campo que a interface de fato envia, então é o primeiro que pode
    // ficar defasado (aba antiga aberta depois de a lista de rotas mudar).
    rota: z.enum(ROTAS_COM_CONTEXTO, { error: "Página de contexto não reconhecida." }),
  })
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
    agentId: z
      .string()
      .trim()
      .min(1, "Assistente inválido.")
      .max(60, "Assistente inválido.")
      .optional(),
    /** Ausente = a tela não mandou contexto. Ver `pageContextSchema`. */
    pageContext: pageContextSchema.optional(),
    providerPreference: aiProviderEnum.optional(),
    modelPreference: z
      .string()
      .trim()
      .min(1, "Modelo inválido.")
      .max(120, "Modelo inválido.")
      .optional(),
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

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ AS FLAGS `allow_*` — A AUTORIZAÇÃO DE LEITURA POR MÓDULO.                             ║
 * ║                                                                                       ║
 * ║ A forma sai de `TOOL_PERMISSIONS`, a MESMA lista que `guardToolCall` consulta e que    ║
 * ║ `getAiPreferences` devolve. Escrever as nove chaves à mão aqui criaria uma segunda     ║
 * ║ lista: uma permissão nova entraria no registry, o guard passaria a exigi-la e este     ║
 * ║ schema continuaria recusando o campo — só em runtime, ao salvar.                       ║
 * ║                                                                                       ║
 * ║ Todas são OBRIGATÓRIAS: a tela manda o estado completo. Campo ausente seria "não sei"  ║
 * ║ num lugar onde a única resposta segura é "não", e o `upsert` gravaria o padrão da       ║
 * ║ coluna por cima de uma autorização que o usuário já tinha dado.                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
const permissionShape = Object.fromEntries(
  TOOL_PERMISSIONS.map((chave) => [
    chave,
    z.boolean({ error: "Autorização de leitura inválida." }),
  ]),
) as { [K in ToolPermission]: z.ZodBoolean };

export const aiPermissionsSchema = z.object(permissionShape).strict();

export type AiPermissionsInput = z.infer<typeof aiPermissionsSchema>;

/**
 * As cinco flags `allow_write_*` (18-C · Bloco 4), pela MESMA derivação e pelos mesmos
 * motivos. Objeto separado porque a decisão é separada: nenhuma leitura consulta este objeto,
 * e nenhuma escrita passa só com o outro.
 */
const writePermissionShape = Object.fromEntries(
  TOOL_WRITE_PERMISSIONS.map((chave) => [
    chave,
    z.boolean({ error: "Autorização de alteração inválida." }),
  ]),
) as { [K in ToolWritePermission]: z.ZodBoolean };

export const aiWritePermissionsSchema = z.object(writePermissionShape).strict();

export type AiWritePermissionsInput = z.infer<typeof aiWritePermissionsSchema>;

export const aiPreferencesSchema = z
  .object({
    permissions: aiPermissionsSchema,
    writePermissions: aiWritePermissionsSchema,
    /**
     * Fase 18-D. Campo solto, e não uma entrada de `aiPermissionsSchema`: `allow_vision`
     * não é um módulo, e `TOOL_PERMISSIONS` é a lista de módulos que o guard consulta.
     * Ver o comentário em `AiPreferencesView.allowVision`.
     */
    allowVision: z.boolean({ error: "Autorização de envio de arquivo inválida." }),
    /**
     * Fase 18-E Bloco 4. Campo solto pela MESMA razão de `allowVision`: a varredura
     * automática não é um módulo, e `TOOL_PERMISSIONS` é a lista de módulos que o guard
     * consulta. Ver o comentário em `AiPreferencesView.allowInsightJobs`.
     */
    allowInsightJobs: z.boolean({ error: "Autorização de análise automática inválida." }),
    /**
     * O teto próprio do job. `nonnegative` e NÃO `nullish`: a coluna é NOT NULL, e "sem
     * teto" não é um estado que a varredura possa ter (ver a nota da migration).
     */
    jobMonthlyBudget: z.coerce
      .number()
      .nonnegative("Não pode ser negativo")
      .max(1000, "O teto do job não pode passar de US$ 1.000 por mês"),
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

// ─────────────────────────── Comprovantes (18-D) ───────────────────────────

/**
 * O que o dono escreve ao enviar ("foi no PIX", "metade é do João").
 *
 * ⛔ **É DADO, NUNCA INSTRUÇÃO.** Entra na extração dentro do mesmo bloco `wrapUntrusted`
 * que o conteúdo do arquivo — texto de humano não vira mensagem de sistema só porque foi
 * digitado num campo nosso. O limite curto é parte disso: 500 caracteres não comportam um
 * prompt, e cortam a superfície sem atrapalhar o uso real.
 */
export const MAX_OBSERVACAO_DOCUMENTO = 500;

export const documentoRefSchema = z
  .object({ documentoId: z.uuid("Comprovante inválido") })
  .strict();

/**
 * A observação, validada à parte porque chega por `FormData` (o envio é upload, e
 * `FormData` é o único caminho que carrega bytes).
 *
 * `null` e `""` são a MESMA coisa aqui — "não escreveu nada" —, e o schema aceita a própria
 * saída (`parse(parse(x))`), como manda a regra de round-trip do projeto.
 */
export const observacaoDocumentoSchema = z
  .string()
  .trim()
  .max(MAX_OBSERVACAO_DOCUMENTO, `Máximo de ${MAX_OBSERVACAO_DOCUMENTO} caracteres`)
  .nullish()
  .transform((v) => (v && v.length ? v : null));

/**
 * ⛔ AS CORREÇÕES DO DONO — e só as dele. Nenhum campo aqui vem do modelo.
 *
 * `null` e ausente são COISAS DIFERENTES, e o `.optional()` sem `.nullish()` é o que as
 * separa: ausente = "não mexi neste campo"; `null` = "eu digitei que não dá para
 * identificar". A segunda é uma correção legítima, e `aplicarCorrecoes` a transforma em
 * `nao_identificado` — nunca em `alta`, senão o bloqueio de campo essencial passaria por cima
 * de um campo que o próprio dono disse não saber.
 *
 * ⚠️ `totalCentavos` é INTEIRO em centavos, como todo o financeiro do projeto. A conversão
 * para reais acontece num ponto só (`approval/document.ts`), na fronteira com o command.
 */
const correcoesDoComprovanteSchema = z
  .object({
    estabelecimento: z.string().trim().max(200).nullable().optional(),
    cnpj: z.string().trim().max(20).nullable().optional(),
    data: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
      .nullable()
      .optional(),
    hora: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Hora no formato HH:mm")
      .nullable()
      .optional(),
    totalCentavos: z
      .number()
      .int("O valor precisa ser um número inteiro de centavos")
      .nullable()
      .optional(),
    formaPagamento: z.string().trim().max(60).nullable().optional(),
    numeroDocumento: z.string().trim().max(60).nullable().optional(),
  })
  .strict();

/**
 * A escolha de onde o lançamento entra. Vem do dono na revisão, NUNCA da imagem: o
 * comprovante diz "PIX" ou "crédito", mas ele não sabe de qual conta nem de qual cartão
 * DESTE sistema se trata — deduzir isso seria o sistema desempatando sozinho, que é
 * exatamente o que `EfeitoImpossivel` recusa em `finance-preview.ts`.
 */
export const prepararLancamentoDoComprovanteSchema = z
  .object({
    extractionId: z.uuid("Leitura inválida"),
    correcoes: correcoesDoComprovanteSchema,
    conta: z.string().trim().max(120).nullable().optional(),
    cartao: z.string().trim().max(120).nullable().optional(),
    categoria: z.string().trim().max(120).nullable().optional(),
  })
  .strict();

export const anexarComprovanteSchema = z
  .object({
    documentoId: z.uuid("Comprovante inválido"),
    transacaoId: z.uuid("Lançamento inválido"),
  })
  .strict();

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

/* ══════════════════════════════ 18-E · Insights ══════════════════════════════ */

/**
 * ⚠️ `.strict()` nos dois, como em todo schema deste módulo: campo a mais é ERRO, e é por
 * aqui que um `userId` vindo do cliente seria barrado. `user_id` sempre de `authContext()`.
 */
export const gerarInsightSchema = z
  .object({
    modulo: z.enum(["financeiro", "treinos", "dieta"]),
    /**
     * A janela em períodos (meses no Financeiro e em Treinos, dias na Dieta). Opcional: cada
     * coletor tem o próprio padrão e o próprio TETO, e os dois moram lá — pôr o teto aqui
     * daria dois lugares para mudá-lo, e um deles ficaria para trás.
     */
    janela: z.number().int().min(2).max(60).optional(),
  })
  .strict();

export const feedbackDeInsightSchema = z
  .object({
    insightId: z.uuid("Insight inválido"),
    decisao: z.enum(["util", "inutil", "dispensado", "adiado", "nao_mostrar"]),
    /**
     * Só em `adiado`, e obrigatório nele — o CHECK do banco exige a mesma coerência. Adiar
     * sem data seria dispensar com outro nome.
     */
    adiadoAte: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data válida")
      .optional(),
  })
  .strict()
  .refine((v) => (v.decisao === "adiado") === (v.adiadoAte !== undefined), {
    message: "Adiar exige uma data, e as outras decisões não a aceitam",
    path: ["adiadoAte"],
  });

/**
 * ⛔ 18-E — transformar insight em tarefa. RESTRITO a `criarTarefaTodo`: não há campo
 * `command` neste schema, e a ausência é a trava. Com um `command` livre, a tela poderia
 * pedir qualquer command do registry — inclusive `lancarTransacao`, que é risco 3 com
 * sensibilidade `dinheiro` e está declarado FORA da subfase.
 *
 * ⚠️ O TÍTULO É DIGITADO PELO DONO. O texto do insight não vira título automaticamente: ele
 * pode conter token `{{ind:…}}`, e no TO-DO não há quem o resolva.
 */
export const tarefaDeInsightSchema = z
  .object({
    insightId: z.uuid("Insight inválido"),
    titulo: z
      .string()
      .trim()
      .min(1, "Escreva o que você quer fazer")
      .max(300, "Máximo de 300 caracteres"),
    data: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data válida")
      .optional(),
    projeto: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
