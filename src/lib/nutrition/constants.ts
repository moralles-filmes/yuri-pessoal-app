/**
 * Fase 16-A — Dieta e Alimentação · Enums, rótulos pt-BR e tokens visuais.
 *
 * Arquivo PURO (sem I/O, sem React): serve tanto ao servidor quanto ao cliente e é a única
 * fonte dos rótulos exibidos. Os valores batem exatamente com os CHECKs das migrations.
 */

/* ───────────────────────────── Estado do valor ─────────────────────────────
 * A distinção que sustenta a honestidade do módulo inteiro. Cada estado tem efeito
 * DIFERENTE no cálculo (ver calc.ts) — nenhum deles é "zero".
 */
export const NUTRIENT_VALUE_STATES = [
  "disponivel",
  "traco",
  "nao_disponivel",
  "nao_aplicavel",
  "em_revisao",
] as const;
export type NutrientValueState = (typeof NUTRIENT_VALUE_STATES)[number];

export const NUTRIENT_VALUE_STATE_LABELS: Record<NutrientValueState, string> = {
  disponivel: "Disponível",
  traco: "Traço",
  nao_disponivel: "Não disponível",
  nao_aplicavel: "Não aplicável",
  em_revisao: "Em reavaliação",
};

/** Texto curto exibido no lugar do número quando não há valor. */
export const NUTRIENT_VALUE_STATE_SHORT: Record<NutrientValueState, string> = {
  disponivel: "",
  traco: "traço",
  nao_disponivel: "—",
  nao_aplicavel: "n/a",
  em_revisao: "em revisão",
};

export const NUTRIENT_VALUE_STATE_HINTS: Record<NutrientValueState, string> = {
  disponivel: "Valor publicado pela fonte.",
  traco: "Presente abaixo do limite de quantificação da fonte. Conta como zero, mas o total fica aproximado.",
  nao_disponivel: "A fonte não analisou este nutriente. Não é zero — o total fica parcial.",
  nao_aplicavel: "Não faz sentido para este alimento.",
  em_revisao: "A fonte informa que as análises deste alimento estão sendo reavaliadas.",
};

/* ───────────────────────────── Método / qualidade ───────────────────────────── */
export const NUTRIENT_METHODS = [
  "analitico",
  "calculado",
  "estimado",
  "rotulo",
  "desconhecido",
] as const;
export type NutrientMethod = (typeof NUTRIENT_METHODS)[number];

export const NUTRIENT_METHOD_LABELS: Record<NutrientMethod, string> = {
  analitico: "Analítico",
  calculado: "Calculado",
  estimado: "Estimado",
  rotulo: "Rótulo",
  desconhecido: "Não informado",
};

export const DATA_QUALITIES = NUTRIENT_METHODS;
export type DataQuality = NutrientMethod;
export const DATA_QUALITY_LABELS = NUTRIENT_METHOD_LABELS;

/* ───────────────────────────── Grupos de nutriente ───────────────────────────── */
export const NUTRIENT_GROUPS = [
  "energia",
  "macro",
  "carboidrato",
  "lipidio",
  "mineral",
  "vitamina",
  "aminoacido",
  "outro",
] as const;
export type NutrientGroup = (typeof NUTRIENT_GROUPS)[number];

export const NUTRIENT_GROUP_LABELS: Record<NutrientGroup, string> = {
  energia: "Energia",
  macro: "Macronutrientes",
  carboidrato: "Carboidratos",
  lipidio: "Lipídios",
  mineral: "Minerais",
  vitamina: "Vitaminas",
  aminoacido: "Aminoácidos",
  outro: "Outros componentes",
};

/** Ordem de exibição dos grupos no detalhe do alimento. */
export const NUTRIENT_GROUP_ORDER: NutrientGroup[] = [
  "energia",
  "macro",
  "carboidrato",
  "lipidio",
  "mineral",
  "vitamina",
  "aminoacido",
  "outro",
];

export const NUTRIENT_UNITS = ["kcal", "kJ", "g", "mg", "mcg"] as const;
export type NutrientUnit = (typeof NUTRIENT_UNITS)[number];

/**
 * Códigos usados o tempo todo pelo app. Manter como constantes evita string mágica e
 * quebra o build se um código sumir do seed.
 */
export const CORE_NUTRIENTS = {
  energia: "energia_kcal",
  proteina: "proteina",
  carboidrato: "carboidrato",
  lipidios: "lipidios",
  fibra: "fibra",
  sodio: "sodio",
  acucares: "acucares_totais",
  saturadas: "ag_saturados",
} as const;

/** Ordem dos macros nos resumos (cards, listas, metas). */
export const MACRO_ORDER = [
  CORE_NUTRIENTS.energia,
  CORE_NUTRIENTS.proteina,
  CORE_NUTRIENTS.carboidrato,
  CORE_NUTRIENTS.lipidios,
  CORE_NUTRIENTS.fibra,
] as const;

/* ───────────────────────────── Alimento ───────────────────────────── */
export const FOOD_TYPES = [
  "alimento",
  "industrializado",
  "suplemento",
  "bebida",
  "ingrediente",
  "preparacao",
] as const;
export type FoodType = (typeof FOOD_TYPES)[number];

export const FOOD_TYPE_LABELS: Record<FoodType, string> = {
  alimento: "Alimento",
  industrializado: "Industrializado",
  suplemento: "Suplemento",
  bebida: "Bebida",
  ingrediente: "Ingrediente",
  preparacao: "Preparação pronta",
};

/**
 * Estado/preparo. "Arroz cru" e "arroz cozido" são registros DIFERENTES — o estado é parte
 * da identidade do alimento e a UI sempre o exibe junto do nome.
 */
export const PREPARATION_STATES = [
  "nao_informado",
  "cru",
  "cozido",
  "assado",
  "grelhado",
  "frito",
  "refogado",
  "drenado",
  "pronto",
  "congelado",
  "desidratado",
  "enlatado",
  "defumado",
] as const;
export type PreparationState = (typeof PREPARATION_STATES)[number];

export const PREPARATION_STATE_LABELS: Record<PreparationState, string> = {
  nao_informado: "Não informado",
  cru: "Cru",
  cozido: "Cozido",
  assado: "Assado",
  grelhado: "Grelhado",
  frito: "Frito",
  refogado: "Refogado",
  drenado: "Drenado",
  pronto: "Pronto para consumo",
  congelado: "Congelado",
  desidratado: "Desidratado",
  enlatado: "Enlatado",
  defumado: "Defumado",
};

export const BASE_UNITS = ["g", "ml"] as const;
export type BaseUnit = (typeof BASE_UNITS)[number];

export const BASE_UNIT_LABELS: Record<BaseUnit, string> = { g: "gramas", ml: "mililitros" };

/* ───────────────────────────── Medidas caseiras ───────────────────────────── */
export const MEASURE_UNIT_TYPES = ["peso", "volume", "unidade"] as const;
export type MeasureUnitType = (typeof MEASURE_UNIT_TYPES)[number];

export const MEASURE_UNIT_TYPE_LABELS: Record<MeasureUnitType, string> = {
  peso: "Peso",
  volume: "Volume",
  unidade: "Unidade",
};

/**
 * Sugestões de rótulo no formulário de medida caseira. São apenas NOMES — a conversão em
 * gramas/ml é sempre digitada pelo usuário, por alimento. Nenhuma conversão genérica é
 * assumida: uma colher de arroz e uma de azeite não pesam o mesmo.
 */
export const MEASURE_LABEL_SUGGESTIONS = [
  "Unidade",
  "Unidade pequena",
  "Unidade média",
  "Unidade grande",
  "Fatia",
  "Colher de sopa",
  "Colher de sobremesa",
  "Colher de chá",
  "Xícara",
  "Xícara de chá",
  "Copo",
  "Copo americano",
  "Concha",
  "Escumadeira",
  "Pegador",
  "Scoop",
  "Porção",
  "Pacote",
  "Lata",
  "Garrafa",
  "Filé",
  "Pedaço",
] as const;

/* ───────────────────────────── Navegação interna ───────────────────────────── */
export const NUTRITION_BASE_PATH = "/nutricao";

export type NutritionSectionStatus = "pronto" | "proxima" | "planejada";

export type NutritionSection = {
  slug: string;
  title: string;
  description: string;
  href: string;
  icon: string;
  status: NutritionSectionStatus;
  /** Subfase que entrega a seção (usado no aviso das telas ainda não implementadas). */
  phase: string;
};

/**
 * Os 12 submódulos do módulo. Os que ainda não existem aparecem na navegação com a subfase
 * em que chegam — nada de link morto nem de tela fingindo funcionar.
 */
export const NUTRITION_SECTIONS: NutritionSection[] = [
  {
    slug: "visao-geral",
    title: "Visão geral",
    description: "Resumo do dia, metas e atalhos.",
    href: NUTRITION_BASE_PATH,
    icon: "layout-dashboard",
    status: "pronto",
    phase: "Subfase 16-A",
  },
  {
    slug: "alimentos",
    title: "Alimentos",
    description: "Catálogo com base brasileira, medidas caseiras e alimentos próprios.",
    href: `${NUTRITION_BASE_PATH}/alimentos`,
    icon: "apple",
    status: "pronto",
    phase: "Subfase 16-A",
  },
  {
    slug: "diario",
    title: "Diário alimentar",
    description: "O que foi realmente consumido, dia a dia.",
    href: `${NUTRITION_BASE_PATH}/diario`,
    icon: "notebook-pen",
    status: "proxima",
    phase: "Subfase 16-B",
  },
  {
    slug: "planejamento",
    title: "Planejamento",
    description: "Refeições planejadas por dia e por semana.",
    href: `${NUTRITION_BASE_PATH}/planejamento`,
    icon: "calendar-range",
    status: "proxima",
    phase: "Subfase 16-B",
  },
  {
    slug: "metas",
    title: "Metas nutricionais",
    description: "Calorias, macros e distribuição por refeição.",
    href: `${NUTRITION_BASE_PATH}/metas`,
    icon: "target",
    status: "proxima",
    phase: "Subfase 16-B",
  },
  {
    slug: "refeicoes",
    title: "Refeições",
    description: "Refeições-modelo reutilizáveis.",
    href: `${NUTRITION_BASE_PATH}/refeicoes`,
    icon: "utensils",
    status: "planejada",
    phase: "Subfase 16-C",
  },
  {
    slug: "receitas",
    title: "Receitas",
    description: "Preparações com rendimento e cálculo por porção.",
    href: `${NUTRITION_BASE_PATH}/receitas`,
    icon: "chef-hat",
    status: "planejada",
    phase: "Subfase 16-C",
  },
  {
    slug: "substituicoes",
    title: "Substituições",
    description: "Alternativas com comparação nutricional.",
    href: `${NUTRITION_BASE_PATH}/substituicoes`,
    icon: "repeat",
    status: "planejada",
    phase: "Subfase 16-C",
  },
  {
    slug: "compras",
    title: "Lista de compras",
    description: "Gerada do planejamento, com despensa.",
    href: `${NUTRITION_BASE_PATH}/compras`,
    icon: "shopping-cart",
    status: "planejada",
    phase: "Subfase 16-D",
  },
  {
    slug: "medidas",
    title: "Medidas e evolução",
    description: "Peso, medidas corporais e fotos privadas.",
    href: `${NUTRITION_BASE_PATH}/medidas`,
    icon: "ruler",
    status: "planejada",
    phase: "Subfase 16-E",
  },
  {
    slug: "relatorios",
    title: "Relatórios",
    description: "Consumo por período e evolução.",
    href: `${NUTRITION_BASE_PATH}/relatorios`,
    icon: "bar-chart-3",
    status: "planejada",
    phase: "Subfase 16-E",
  },
  {
    slug: "configuracoes",
    title: "Configurações",
    description: "Preferências do módulo e fontes nutricionais.",
    href: `${NUTRITION_BASE_PATH}/configuracoes`,
    icon: "settings",
    status: "planejada",
    phase: "Subfase 16-F",
  },
];

export const NUTRITION_SECTION_STATUS_LABELS: Record<NutritionSectionStatus, string> = {
  pronto: "Disponível",
  proxima: "Próxima subfase",
  planejada: "Planejada",
};

/* ───────────────────────────── Ordenação do catálogo ───────────────────────────── */
export const FOOD_SORTS = [
  "nome",
  "recentes",
  "mais_usados",
  "calorias_desc",
  "calorias_asc",
  "proteina_desc",
] as const;
export type FoodSort = (typeof FOOD_SORTS)[number];

export const FOOD_SORT_LABELS: Record<FoodSort, string> = {
  nome: "Nome (A–Z)",
  recentes: "Usados recentemente",
  mais_usados: "Mais usados",
  calorias_desc: "Mais calóricos",
  calorias_asc: "Menos calóricos",
  proteina_desc: "Mais proteicos",
};

/** Origem do alimento, do ponto de vista do usuário. */
export const FOOD_ORIGINS = ["todos", "sistema", "proprios"] as const;
export type FoodOrigin = (typeof FOOD_ORIGINS)[number];

export const FOOD_ORIGIN_LABELS: Record<FoodOrigin, string> = {
  todos: "Todos",
  sistema: "Base do sistema",
  proprios: "Meus alimentos",
};

/* ───────────────────────────── Helpers de coerção ───────────────────────────── */
const includes = <T extends readonly string[]>(list: T, value: unknown): value is T[number] =>
  typeof value === "string" && (list as readonly string[]).includes(value);

export const asFoodType = (v: unknown): FoodType => (includes(FOOD_TYPES, v) ? v : "alimento");
export const asPreparationState = (v: unknown): PreparationState =>
  includes(PREPARATION_STATES, v) ? v : "nao_informado";
export const asBaseUnit = (v: unknown): BaseUnit => (includes(BASE_UNITS, v) ? v : "g");
export const asValueState = (v: unknown): NutrientValueState =>
  includes(NUTRIENT_VALUE_STATES, v) ? v : "nao_disponivel";
export const asMethod = (v: unknown): NutrientMethod =>
  includes(NUTRIENT_METHODS, v) ? v : "desconhecido";
export const asNutrientGroup = (v: unknown): NutrientGroup =>
  includes(NUTRIENT_GROUPS, v) ? v : "outro";
export const asNutrientUnit = (v: unknown): NutrientUnit =>
  includes(NUTRIENT_UNITS, v) ? v : "g";
export const asMeasureUnitType = (v: unknown): MeasureUnitType =>
  includes(MEASURE_UNIT_TYPES, v) ? v : "peso";
export const asFoodSort = (v: unknown): FoodSort => (includes(FOOD_SORTS, v) ? v : "nome");
export const asFoodOrigin = (v: unknown): FoodOrigin => (includes(FOOD_ORIGINS, v) ? v : "todos");
