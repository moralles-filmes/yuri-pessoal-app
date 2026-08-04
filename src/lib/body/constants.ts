/**
 * Fase 16-E — MÓDULO CENTRAL DE MEDIDAS CORPORAIS · Vocabulário.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ Este módulo NÃO pertence a Dieta nem a Treinos. Os dois consomem daqui.               ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Peso, percentual de gordura e circunferências interessam à Fase 16 e à Fase 17 ao mesmo
 * tempo. Duas tabelas para o mesmo dado seriam dois gráficos discordando sobre quanto o
 * usuário pesa — por isso `body_*` + `src/lib/body/`, e nunca `nutrition_measurement_*`.
 *
 * ⛔ SEM PRESCRIÇÃO, SEM DIAGNÓSTICO. Não há "peso ideal", não há faixa de IMC com juízo de
 * valor e não há meta sugerida pelo sistema. Medida é REGISTRO, não avaliação.
 */

/* ───────────────────────────── Categorias e unidades ───────────────────────────── */

export const MEASUREMENT_CATEGORIES = ["peso", "composicao", "circunferencia", "outro"] as const;
export type MeasurementCategory = (typeof MEASUREMENT_CATEGORIES)[number];

export const MEASUREMENT_CATEGORY_LABELS: Record<MeasurementCategory, string> = {
  peso: "Peso",
  composicao: "Composição corporal",
  circunferencia: "Circunferências",
  outro: "Outras",
};

/** Ordem de exibição dos grupos na tela. */
export const MEASUREMENT_CATEGORY_ORDER: MeasurementCategory[] = [
  "peso",
  "composicao",
  "circunferencia",
  "outro",
];

export const MEASUREMENT_UNITS = ["kg", "cm", "%", "mm", "kcal", "l"] as const;
export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number];

export const MEASUREMENT_SIDES = ["esquerdo", "direito"] as const;
export type MeasurementSide = (typeof MEASUREMENT_SIDES)[number];

export const MEASUREMENT_SIDE_LABELS: Record<MeasurementSide, string> = {
  esquerdo: "Esquerdo",
  direito: "Direito",
};

/* ───────────────────────────── Condição da medição ─────────────────────────────
 * Comparar uma medida feita em jejum com outra pós-treino e chamar a diferença de
 * "evolução" é comparar contextos, não corpos. Por isso a condição é registrada — e a
 * comparação avisa quando os dois lados foram medidos em condições diferentes.
 */

export const MEASUREMENT_CONDITIONS = [
  "jejum",
  "manha",
  "noite",
  "pre_treino",
  "pos_treino",
  "outro",
] as const;
export type MeasurementCondition = (typeof MEASUREMENT_CONDITIONS)[number];

export const MEASUREMENT_CONDITION_LABELS: Record<MeasurementCondition, string> = {
  jejum: "Em jejum",
  manha: "De manhã",
  noite: "À noite",
  pre_treino: "Antes do treino",
  pos_treino: "Depois do treino",
  outro: "Outra condição",
};

export const MEASUREMENT_SOURCES = ["manual", "integracao"] as const;
export type MeasurementSource = (typeof MEASUREMENT_SOURCES)[number];

export const MEASUREMENT_SOURCE_LABELS: Record<MeasurementSource, string> = {
  manual: "Registrada por você",
  integracao: "Importada de um aparelho",
};

/* ───────────────────────────── Metas ───────────────────────────── */

/**
 * Direção da meta. É ESCOLHA DO USUÁRIO — o sistema não deduz que "reduzir" é o objetivo
 * de ninguém, e não sugere direção nenhuma a partir do valor atual.
 */
export const GOAL_DIRECTIONS = ["reduzir", "aumentar", "manter"] as const;
export type BodyGoalDirection = (typeof GOAL_DIRECTIONS)[number];

export const GOAL_DIRECTION_LABELS: Record<BodyGoalDirection, string> = {
  reduzir: "Reduzir",
  aumentar: "Aumentar",
  manter: "Manter",
};

/** Status GRAVADO — os quatro são decisão explícita do usuário. */
export const GOAL_STATUSES = ["ativa", "pausada", "concluida", "cancelada"] as const;
export type BodyGoalStatus = (typeof GOAL_STATUSES)[number];

export const GOAL_STATUS_LABELS: Record<BodyGoalStatus, string> = {
  ativa: "Ativa",
  pausada: "Pausada",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

/**
 * Status como a TELA vê. `atingida` e `prazo_vencido` nunca são gravados: saem de valor
 * atual × alvo × prazo, com `hoje` injetado — a mesma disciplina de `atrasada` no TO-DO e de
 * `pendente` no diário (que nem existe no CHECK do banco).
 */
export type EffectiveGoalStatus = BodyGoalStatus | "atingida" | "prazo_vencido";

export const EFFECTIVE_GOAL_STATUS_LABELS: Record<EffectiveGoalStatus, string> = {
  ...GOAL_STATUS_LABELS,
  atingida: "Alvo alcançado",
  prazo_vencido: "Prazo encerrado",
};

/* ───────────────────────────── Fotos de evolução ───────────────────────────── */

export const PHOTO_ANGLES = [
  "frontal",
  "lateral_esquerda",
  "lateral_direita",
  "traseira",
  "outro",
] as const;
export type PhotoAngle = (typeof PHOTO_ANGLES)[number];

export const PHOTO_ANGLE_LABELS: Record<PhotoAngle, string> = {
  frontal: "Frente",
  lateral_esquerda: "Lateral esquerda",
  lateral_direita: "Lateral direita",
  traseira: "Costas",
  outro: "Outro ângulo",
};

/**
 * ⛔ VALIDAÇÃO DE UPLOAD — REPETIDA NO SERVIDOR, SEMPRE.
 *
 * O `accept` do input e o tamanho conferido no navegador são conveniência, não segurança:
 * qualquer requisição pode ignorar os dois. A Server Action revalida MIME e bytes com estas
 * mesmas constantes antes de encostar no Storage.
 */
export const PHOTO_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const PHOTO_MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export const PHOTO_ACCEPT_ATTRIBUTE = PHOTO_ALLOWED_MIME.join(",");

/** Extensão a partir do MIME. Nunca reaproveitamos o nome enviado pelo cliente. */
export const PHOTO_EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/**
 * Vida da URL assinada: 5 minutos.
 *
 * Mais curto que os 10 min dos anexos de tarefa (Fase 14) de propósito — aqui o dano de um
 * link que escapa do navegador é maior. A URL é gerada a cada leitura e nunca é persistida.
 */
export const PHOTO_SIGNED_URL_TTL_SECONDS = 300;

/** `entity_type` usado na tabela genérica `attachments`. Define a pasta no Storage. */
export const PHOTO_ENTITY_TYPE = "body_progress_photo";
export const PHOTO_BUCKET = "attachments";

/* ───────────────────────────── Tipos padrão (semente) ─────────────────────────────
 * Semeados na PRIMEIRA LEITURA por usuário (`ensureMeasurementTypes`), e não em migration:
 * uma migration não sabe quais usuários existem nem os que vão existir. Mesmo padrão de
 * `ensureMealTypes` (16-B) e `ensureMarketCategories` (16-D).
 *
 * Depois de semeados são dado do usuário: ele renomeia, reordena, desativa e cria os dele.
 */
export type DefaultMeasurementType = {
  slug: string;
  name: string;
  unit: MeasurementUnit;
  category: MeasurementCategory;
  side: MeasurementSide | null;
  decimals: number;
};

export const DEFAULT_MEASUREMENT_TYPES: DefaultMeasurementType[] = [
  { slug: "peso", name: "Peso", unit: "kg", category: "peso", side: null, decimals: 1 },
  {
    slug: "percentual_gordura",
    name: "Percentual de gordura",
    unit: "%",
    category: "composicao",
    side: null,
    decimals: 1,
  },
  {
    slug: "massa_muscular",
    name: "Massa muscular",
    unit: "kg",
    category: "composicao",
    side: null,
    decimals: 1,
  },
  { slug: "cintura", name: "Cintura", unit: "cm", category: "circunferencia", side: null, decimals: 1 },
  { slug: "abdomen", name: "Abdômen", unit: "cm", category: "circunferencia", side: null, decimals: 1 },
  { slug: "quadril", name: "Quadril", unit: "cm", category: "circunferencia", side: null, decimals: 1 },
  { slug: "peitoral", name: "Peitoral", unit: "cm", category: "circunferencia", side: null, decimals: 1 },
  { slug: "pescoco", name: "Pescoço", unit: "cm", category: "circunferencia", side: null, decimals: 1 },
  {
    slug: "braco_direito",
    name: "Braço direito",
    unit: "cm",
    category: "circunferencia",
    side: "direito",
    decimals: 1,
  },
  {
    slug: "braco_esquerdo",
    name: "Braço esquerdo",
    unit: "cm",
    category: "circunferencia",
    side: "esquerdo",
    decimals: 1,
  },
  {
    slug: "antebraco_direito",
    name: "Antebraço direito",
    unit: "cm",
    category: "circunferencia",
    side: "direito",
    decimals: 1,
  },
  {
    slug: "antebraco_esquerdo",
    name: "Antebraço esquerdo",
    unit: "cm",
    category: "circunferencia",
    side: "esquerdo",
    decimals: 1,
  },
  {
    slug: "coxa_direita",
    name: "Coxa direita",
    unit: "cm",
    category: "circunferencia",
    side: "direito",
    decimals: 1,
  },
  {
    slug: "coxa_esquerda",
    name: "Coxa esquerda",
    unit: "cm",
    category: "circunferencia",
    side: "esquerdo",
    decimals: 1,
  },
  {
    slug: "panturrilha_direita",
    name: "Panturrilha direita",
    unit: "cm",
    category: "circunferencia",
    side: "direito",
    decimals: 1,
  },
  {
    slug: "panturrilha_esquerda",
    name: "Panturrilha esquerda",
    unit: "cm",
    category: "circunferencia",
    side: "esquerdo",
    decimals: 1,
  },
];

/** Slug do peso — o único que outros módulos referenciam por nome. */
export const WEIGHT_SLUG = "peso";

/* ───────────────────────────── Normalizadores ─────────────────────────────
 * O banco devolve `string`; estes helpers estreitam para a união, com um padrão seguro em vez
 * de `as`. Mesmo padrão de `asValueState`/`asMealStatus` da Dieta.
 */

const asMember = <T extends string>(list: readonly T[], value: unknown, fallback: T): T =>
  typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : fallback;

export const asMeasurementCategory = (v: unknown): MeasurementCategory =>
  asMember(MEASUREMENT_CATEGORIES, v, "outro");

export const asMeasurementSide = (v: unknown): MeasurementSide | null =>
  typeof v === "string" && (MEASUREMENT_SIDES as readonly string[]).includes(v)
    ? (v as MeasurementSide)
    : null;

export const asMeasurementCondition = (v: unknown): MeasurementCondition | null =>
  typeof v === "string" && (MEASUREMENT_CONDITIONS as readonly string[]).includes(v)
    ? (v as MeasurementCondition)
    : null;

export const asMeasurementSource = (v: unknown): MeasurementSource =>
  asMember(MEASUREMENT_SOURCES, v, "manual");

export const asGoalDirection = (v: unknown): BodyGoalDirection =>
  asMember(GOAL_DIRECTIONS, v, "manter");

export const asGoalStatus = (v: unknown): BodyGoalStatus => asMember(GOAL_STATUSES, v, "ativa");

export const asPhotoAngle = (v: unknown): PhotoAngle => asMember(PHOTO_ANGLES, v, "outro");

/* ───────────────────────────── Avisos de texto ─────────────────────────────
 * Ficam aqui para serem SEMPRE o mesmo texto, em qualquer tela que mostre estas séries.
 */

/**
 * Exibido em toda tela que põe consumo e corpo lado a lado.
 * A regra 2 da subfase: nenhuma afirmação de causalidade entre um alimento e uma alteração
 * corporal. As séries aparecem juntas; a leitura é do usuário.
 */
export const CORRELATION_DISCLAIMER =
  "As séries são mostradas lado a lado apenas para você comparar os períodos. Elas não estabelecem causa e efeito: variação de peso e de medidas depende de muitos fatores além do que foi registrado aqui.";

/** Exibido na tela de medidas. Deixa explícito que o sistema não avalia ninguém. */
export const MEASUREMENT_DISCLAIMER =
  "Estes são os valores que você registrou, do jeito que registrou. O sistema não avalia, não classifica e não define alvo — quem decide o que acompanhar e aonde quer chegar é você.";

/** Exibido junto de qualquer média móvel. */
export const MOVING_AVERAGE_HINT =
  "A média móvel suaviza a oscilação do dia a dia (água, horário, roupa). Ela só aparece quando há medições suficientes na janela — abaixo disso, o gráfico mostra apenas os valores registrados.";
