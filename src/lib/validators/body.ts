/**
 * Fase 16-E — Módulo central de medidas corporais · Schemas Zod (validação de SERVIDOR).
 *
 * `user_id` não aparece em schema nenhum: vem sempre de `auth.getUser()` na action. É a
 * proteção contra mass assignment que o projeto adota desde a Fase 02.
 *
 * ══ O QUE FICA DE FORA DE PROPÓSITO ══
 * • A UNIDADE da medição. Ela é copiada do TIPO no servidor, não digitada pelo cliente — se
 *   viesse do formulário, daria para gravar "80 cm" numa linha de peso e o histórico ficaria
 *   incomparável para sempre.
 * • O `storage_path` da foto. É gerado no servidor, com nome aleatório, dentro da pasta do
 *   próprio usuário. Aceitá-lo do cliente permitiria reivindicar arquivo alheio.
 * • O status derivado da meta (`atingida`, `prazo_vencido`): não é gravável.
 */
import { z } from "zod";
import {
  GOAL_DIRECTIONS,
  GOAL_STATUSES,
  MEASUREMENT_CATEGORIES,
  MEASUREMENT_CONDITIONS,
  MEASUREMENT_SIDES,
  MEASUREMENT_UNITS,
  PHOTO_ALLOWED_MIME,
  PHOTO_ANGLES,
  PHOTO_MAX_BYTES,
} from "@/lib/body/constants";
import {
  dateString,
  normalizeBRMoney,
  optionalDate,
  optionalText,
  optionalTime,
} from "@/lib/validators/shared";

/**
 * Valor de medida. Aceita vírgula (o usuário digita "72,4") e recusa negativo.
 *
 * O limite de 1000 cobre peso em kg, circunferência em cm e percentual — e impede que um
 * dedo escorregado grave 7240 kg num gráfico que nunca mais fecha a escala.
 */
const measurementValue = z.preprocess(
  normalizeBRMoney,
  z.coerce
    .number({ message: "Informe o valor" })
    .finite("Valor inválido")
    .nonnegative("O valor não pode ser negativo")
    .max(1000, "Valor muito alto"),
);

/** Igual ao anterior, mas opcional: vazio vira null — NUNCA 0. */
const optionalMeasurementValue = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? null : normalizeBRMoney(v)),
  z.coerce.number().finite("Valor inválido").nonnegative().max(1000).nullable(),
);

/* ───────────────────────────── Tipo de medida ───────────────────────────── */

export const measurementTypeSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Informe o nome").max(60, "Máximo de 60 caracteres"),
  unit: z.enum(MEASUREMENT_UNITS, { message: "Unidade inválida" }),
  category: z.enum(MEASUREMENT_CATEGORIES, { message: "Categoria inválida" }),
  side: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.enum(MEASUREMENT_SIDES).nullable(),
  ),
  decimals: z.coerce.number().int().min(0).max(3).default(1),
  isActive: z.coerce.boolean().default(true),
  note: optionalText(300),
});

export type MeasurementTypeInput = z.infer<typeof measurementTypeSchema>;

/** Reordenação: a lista completa de ids, na ordem nova. */
export const measurementTypesReorderSchema = z.object({
  ids: z.array(z.uuid()).min(1, "Nada para reordenar"),
});

/**
 * Exclusão de tipo. `onMeasurements` NÃO TEM VALOR PADRÃO de propósito.
 *
 * Invariante do projeto: nenhuma exclusão silenciosa. Se o tipo tem histórico, o usuário
 * escolhe explicitamente entre desativar (guardando tudo) e apagar as medições junto. Um
 * default aqui escolheria por ele — e uma das opções é irreversível.
 */
export const deleteMeasurementTypeSchema = z.object({
  id: z.uuid(),
  onMeasurements: z.enum(["desativar_tipo", "excluir_medicoes"], {
    message: "Escolha o que fazer com o histórico",
  }),
});

/* ───────────────────────────── Medição ───────────────────────────── */

export const measurementSchema = z.object({
  id: z.uuid().optional(),
  typeId: z.uuid("Escolha a medida"),
  measuredOn: dateString,
  measuredAt: optionalTime,
  value: measurementValue,
  condition: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.enum(MEASUREMENT_CONDITIONS).nullable(),
  ),
  note: optionalText(500),
});

export type MeasurementInput = z.infer<typeof measurementSchema>;

/**
 * Registro de várias medidas de uma vez — o caso real de quem senta com a fita métrica e
 * anota oito circunferências na mesma sessão.
 */
export const measurementBatchSchema = z.object({
  measuredOn: dateString,
  measuredAt: optionalTime,
  condition: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.enum(MEASUREMENT_CONDITIONS).nullable(),
  ),
  note: optionalText(500),
  values: z
    .array(z.object({ typeId: z.uuid(), value: measurementValue }))
    .min(1, "Informe ao menos uma medida"),
});

/** Exclusão em massa. A action ainda confere que todo id pertence ao usuário. */
export const measurementBulkSchema = z.object({
  ids: z.array(z.uuid()).min(1, "Selecione ao menos um registro"),
});

/* ───────────────────────────── Meta ───────────────────────────── */

export const measurementGoalSchema = z
  .object({
    id: z.uuid().optional(),
    typeId: z.uuid("Escolha a medida"),
    direction: z.enum(GOAL_DIRECTIONS, { message: "Escolha a direção" }),
    startValue: optionalMeasurementValue,
    targetValue: measurementValue,
    startsOn: dateString,
    targetDate: optionalDate,
    note: optionalText(500),
  })
  .refine((data) => !data.targetDate || data.targetDate >= data.startsOn, {
    message: "O prazo não pode ser anterior ao início",
    path: ["targetDate"],
  });

export type MeasurementGoalInput = z.infer<typeof measurementGoalSchema>;

/**
 * Mudança de status. Só os quatro GRAVÁVEIS entram — `atingida` e `prazo_vencido` são
 * derivados na leitura e não existem no CHECK do banco.
 */
export const measurementGoalStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(GOAL_STATUSES, { message: "Status inválido" }),
});

/* ───────────────────────────── Foto de evolução ─────────────────────────────
 * ⛔ AQUI MORA A VALIDAÇÃO QUE NÃO PODE FALHAR.
 *
 * O `accept` do input e a checagem no navegador são conveniência: qualquer requisição pode
 * ignorá-los. Estes schemas rodam NO SERVIDOR, sobre o arquivo real, ANTES de encostar no
 * Storage.
 */

const MIME_LIST = PHOTO_ALLOWED_MIME as readonly string[];

/** Metadados da foto (o arquivo em si vai no FormData e é validado à parte). */
export const progressPhotoSchema = z.object({
  id: z.uuid().optional(),
  takenOn: dateString,
  angle: z.enum(PHOTO_ANGLES, { message: "Ângulo inválido" }),
  weightKg: optionalMeasurementValue,
  note: optionalText(500),
});

export type ProgressPhotoInput = z.infer<typeof progressPhotoSchema>;

/**
 * O ARQUIVO. Tipo e tamanho conferidos sobre o objeto `File` real recebido pela action.
 *
 * `size === 0` é recusado à parte: um arquivo vazio passa em qualquer checagem de "tamanho
 * máximo" e depois vira uma foto quebrada no bucket.
 */
export const photoFileSchema = z
  .instanceof(File, { message: "Selecione uma imagem" })
  .refine((file) => file.size > 0, "O arquivo está vazio")
  .refine(
    (file) => file.size <= PHOTO_MAX_BYTES,
    `A imagem deve ter no máximo ${Math.round(PHOTO_MAX_BYTES / (1024 * 1024))} MB`,
  )
  .refine(
    (file) => MIME_LIST.includes(file.type),
    "Formato não aceito. Envie JPG, PNG, WEBP ou HEIC.",
  );

/** Edição só dos metadados (a foto em si não é substituída — apaga e envia outra). */
export const progressPhotoUpdateSchema = progressPhotoSchema.extend({ id: z.uuid() });

/** Comparação antes × depois: duas fotos escolhidas pelo usuário. */
export const photoComparisonSchema = z.object({
  beforeId: z.uuid("Escolha a primeira foto"),
  afterId: z.uuid("Escolha a segunda foto"),
});