import { z } from "zod";
import { optionalText } from "@/lib/validators/shared";
import { AI_PROVIDERS } from "@/lib/ai/core/contracts";
// 18-F Bloco 2. `@/lib/ai/painel` é puro e não importa NADA — não há ciclo, e o vocabulário
// do canto fica declarado uma vez só, para a tela (que não pode arrastar zod) e para o schema.
import { CANTOS_DO_BOTAO } from "@/lib/ai/painel";
import {
  TOOL_PERMISSIONS,
  TOOL_WRITE_PERMISSIONS,
  type ToolPermission,
  type ToolWritePermission,
} from "@/lib/ai/tools/contracts";
// ⚠️ Estas constantes moram em `@/lib/ai/constants` (módulo PURO, sem um único import de runtime) e
// são REEXPORTADAS daqui para não quebrar nenhum import existente. Elas saíram deste arquivo
// porque a TELA precisa delas, e importá-las de um módulo que começa com `import { z } from
// "zod"` arrastava 62,7 KB gz de zod para o primeiro byte das rotas de /ia. Ver `.turbo/REPORT.md`.
//
// ⛔ Ao usá-las num componente client, importe de `@/lib/ai/constants` — não daqui.
import {
  MAX_CHAT_TEXT,
  MAX_OBSERVACAO_DOCUMENTO,
} from "@/lib/ai/constants";
// 18-F Bloco 3. Mesma razão: os dois módulos da memória não têm um único import, e a TELA os
// lê (o contador de caracteres e a mensagem de recusa). Ver `memory/forma.ts`.
/**
 * 18-F Bloco 4 — módulo PURO, sem imports de runtime, como `@/lib/ai/constants`. O enum do
 * panorama sai da mesma união que o catálogo e a allowlist do SQL usam, e há teste amarrando
 * as três.
 */
import { EXPERIENCIA_IDS } from "@/lib/ai/experiences/contracts";
import { MODULOS_DE_MEMORIA } from "@/lib/ai/memory/contracts";
import { formaDaMemoria, MOTIVO_DA_RECUSA } from "@/lib/ai/memory/forma";

export {
  MAX_CHAT_TEXT,
  MAX_OBSERVACAO_DOCUMENTO,
};

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

/** Limite do CORPO HTTP inteiro. Bem acima do texto, para caber JSON e acentuação. */
export const MAX_CHAT_BODY_BYTES = 64 * 1024;

// ─────────────────────────── Chat ───────────────────────────

/** Preferências de rota que as DUAS formas do payload aceitam, escritas uma vez só. */
const preferenciaDeProvedor = {
  providerPreference: aiProviderEnum.optional(),
  modelPreference: z
    .string()
    .trim()
    .min(1, "Modelo inválido.")
    .max(120, "Modelo inválido.")
    .optional(),
};

/** Uma MENSAGEM do dono. `conversationId` ausente = conversa nova. */
export const chatMensagemSchema = z
  .object({
    conversationId: z.uuid("Conversa inválida").optional(),
    text: z
      .string()
      .trim()
      .min(1, "Escreva alguma coisa antes de enviar.")
      .max(MAX_CHAT_TEXT, `Máximo de ${MAX_CHAT_TEXT} caracteres`),
    ...preferenciaDeProvedor,
  })
  .strict();

/**
 * Um PANORAMA. Só o id de um roteiro do servidor — e mais nada.
 *
 * ⛔ SEM `text` E SEM `conversationId`, e a ausência é a garantia, não um `if`. O título e o
 * prompt saem do CATÁLOGO, no servidor; a experiência sempre abre conversa nova (§7.3).
 */
export const chatExperienciaSchema = z
  .object({
    experiencia: z.enum(EXPERIENCIA_IDS, { error: "Panorama não reconhecido." }),
    ...preferenciaDeProvedor,
  })
  .strict();

/**
 * O payload aceito por `/api/ia/chat`, E NADA ALÉM DISTO.
 *
 * ⛔ DUAS FORMAS, e a separação é a garantia. Um schema único com `text` opcional deixaria
 * representável um panorama com texto injetado pelo cliente — e o servidor teria de recusá-lo
 * num `if`. Duas formas `.strict()` fazem isso não existir (invariantes 67 e 79).
 *
 * ⚠️ `z.union` tenta na ordem e devolve o primeiro sucesso. Como as duas são `.strict()` e não
 * compartilham campo OBRIGATÓRIO, não há ambiguidade: um corpo com `text` falha na segunda
 * (campo a mais), um com `experiencia` falha na primeira (campo a mais + `text` ausente).
 */
export const chatRequestSchema = z.union([chatMensagemSchema, chatExperienciaSchema]);

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

/**
 * 18-F Bloco 2 — onde o botão flutuante fica, e se ele aparece.
 *
 * Schema PRÓPRIO, e não dois campos soltos, porque há dois caminhos de gravação para as
 * MESMAS duas colunas: o formulário grande de `/ia/configuracoes` (que salva tudo de uma vez)
 * e o menu do próprio painel (que salva só isto, de onde o dono está). Um schema só é o que
 * impede os dois de divergirem — o vocabulário do canto é declarado uma vez, em
 * `@/lib/ai/painel`, e o CHECK do banco o repete como trava final.
 */
export const botaoFlutuanteSchema = z
  .object({
    floatingCorner: z.enum(CANTOS_DO_BOTAO, { error: "Canto inválido." }),
    floatingHidden: z.boolean({ error: "Preferência de exibição do botão inválida." }),
  })
  .strict();

export type BotaoFlutuanteInput = z.infer<typeof botaoFlutuanteSchema>;

export const aiPreferencesSchema = z
  .object({
    // 18-F Bloco 2 — a MESMA forma do menu do painel, espalhada. Redeclarar os dois campos
    // aqui criaria a segunda definição que este arquivo existe para evitar.
    ...botaoFlutuanteSchema.shape,
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
     * 18-F Bloco 4. Campo solto pela MESMA razão das duas acima — e aqui o nome engana mais
     * que nos outros dois casos: "cross_module" SOA como permissão de módulo. Há teste em
     * `validators/ai.test.ts` que usa exatamente esta chave como o exemplo do que
     * `aiPermissionsSchema` recusa. Ver o comentário em `AiPreferencesView.allowCrossModule`.
     */
    allowCrossModule: z.boolean({ error: "Autorização de panorama inválida." }),
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

/**
 * 18-F Bloco 3 — a memória escrita PELO DONO, na tela `/ia/memoria`.
 *
 * ⚠️ A validação de FORMA não é reimplementada aqui: `formaDaMemoria` (puro, sem um único
 * import) é a fonte, e o `superRefine` a chama. Uma segunda regra de forma divergiria da do
 * servidor no primeiro ajuste, e a tela aceitaria o que a gravação recusa — ou o contrário,
 * que é pior: o dono lendo "salvo" sobre algo que o banco rejeitou.
 *
 * ⛔ Não há campo `origem`: quem escreve por aqui é sempre o dono, e a coluna é preenchida
 * pelo serviço. Aceitá-la do cliente deixaria a tela declarar uma memória como "proposta pelo
 * assistente" — um selo que a própria tela exibe.
 */
export const memoriaSchema = z
  .object({
    id: z.uuid().nullish(),
    conteudo: z.string(),
    modulo: z.preprocess(
      (v) => v === "__todas__" ? null : v,
      z.enum(MODULOS_DE_MEMORIA, { error: "Módulo de memória não reconhecido." })
        .nullish()
        .transform((v) => v ?? null),
    ),
    /**
     * ⚠️ O REGEX ACEITA A STRING VAZIA, e isso não é folga — é o que um `<input type="date">`
     * vazio de fato manda. `.regex()` roda ANTES do `.transform()`, então um padrão
     * `^\d{4}-\d{2}-\d{2}$` recusaria `""` com "Use uma data válida" num campo que o dono
     * deixou em branco de propósito, e o formulário nunca salvaria.
     */
    expiraEm: z
      .string()
      .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Use uma data válida")
      .nullish()
      .transform((v) => (v === undefined || v === "" ? null : v)),
  })
  .strict()
  .superRefine((valor, ctx) => {
    const r = formaDaMemoria(valor.conteudo);
    if (!r.ok) {
      ctx.addIssue({
        code: "custom",
        path: ["conteudo"],
        message: MOTIVO_DA_RECUSA[r.motivo],
      });
    }
  });

/** As três ações que só precisam do alvo: desativar/reativar, esquecer e apagar. */
export const memoriaIdSchema = z.object({ id: z.uuid("Memória inválida") }).strict();

/** Desativar e reativar são a MESMA ação com sentido oposto — um schema, não dois. */
export const alternarMemoriaSchema = z
  .object({ id: z.uuid("Memória inválida"), ligar: z.boolean() })
  .strict();
