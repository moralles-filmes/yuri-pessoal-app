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

/* ═════════════════════════ Fase 16-B — Diário, metas e planejamento ═════════════════════════ */

/* ───────────────────────────── Status da refeição ─────────────────────────────
 * Só estes seis são GRAVADOS: cada um é um fato que aconteceu e que o usuário declarou.
 * "pendente" e o atraso NÃO estão aqui de propósito — são DERIVADOS de `planned_time` +
 * hora atual na leitura (ver `effectiveMealStatus` em diary.ts), exatamente como 'atrasada'
 * no TO-DO (Fase 15) e o status da fatura (Fase 03). Persistir estado derivado obrigaria a
 * reprocessar o banco de hora em hora só para ele continuar verdadeiro.
 */
export const MEAL_STATUSES = [
  "planejada",
  "consumida",
  "parcialmente_consumida",
  "substituida",
  "nao_consumida",
  "fora_do_planejamento",
] as const;
export type MealStatus = (typeof MEAL_STATUSES)[number];

export const MEAL_STATUS_LABELS: Record<MealStatus, string> = {
  planejada: "Planejada",
  consumida: "Consumida",
  parcialmente_consumida: "Parcialmente consumida",
  substituida: "Substituída",
  nao_consumida: "Não consumida",
  fora_do_planejamento: "Fora do planejamento",
};

/** Status como a tela vê: os gravados mais o "pendente", que é derivado. */
export type EffectiveMealStatus = MealStatus | "pendente";

export const EFFECTIVE_MEAL_STATUS_LABELS: Record<EffectiveMealStatus, string> = {
  ...MEAL_STATUS_LABELS,
  pendente: "Pendente",
};

export const EFFECTIVE_MEAL_STATUS_HINTS: Record<EffectiveMealStatus, string> = {
  planejada: "Ainda vai acontecer.",
  pendente: "O horário já chegou e nada foi registrado.",
  consumida: "Registrada como consumida.",
  parcialmente_consumida: "Consumida em parte.",
  substituida: "Você comeu outra coisa no lugar.",
  nao_consumida: "Você decidiu não fazer esta refeição.",
  fora_do_planejamento: "Não estava prevista e aconteceu.",
};

/**
 * Minutos de folga antes de uma refeição pendente ser considerada atrasada.
 * Fica explícito (e não escondido numa comparação) porque é uma escolha de produto: comer o
 * almoço 20 minutos depois do previsto não é "atraso" para ninguém.
 */
export const MEAL_LATE_TOLERANCE_MINUTES = 45;

/* ───────────────────────────── Planejado × consumido ─────────────────────────────
 * Como o item consumido se relaciona com o que estava planejado. O planejamento NUNCA é
 * reescrito: é esta classificação, gravada no item do diário, que conta a história.
 */
export const CHANGE_KINDS = [
  "igual",
  "quantidade_ajustada",
  "substituido",
  "removido",
  "extra",
] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

export const CHANGE_KIND_LABELS: Record<ChangeKind, string> = {
  igual: "Conforme o planejado",
  quantidade_ajustada: "Quantidade ajustada",
  substituido: "Substituído",
  removido: "Removido do plano",
  extra: "Extra",
};

/** Item planejado que não gerou registro nenhum — nem consumo, nem remoção explícita. */
export const NOT_REGISTERED = "nao_registrado" as const;

/* ───────────────────────────── Tipo de dia ───────────────────────────── */
export const DAY_KINDS = ["treino", "descanso"] as const;
export type DayKind = (typeof DAY_KINDS)[number];

export const DAY_KIND_LABELS: Record<DayKind, string> = {
  treino: "Dia de treino",
  descanso: "Dia de descanso",
};

/* ───────────────────────────── Metas ───────────────────────────── */
export const GOAL_TYPES = ["fixa", "por_dia_semana", "treino_descanso", "periodo"] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  fixa: "Igual todos os dias",
  por_dia_semana: "Por dia da semana",
  treino_descanso: "Treino e descanso",
  periodo: "Do período inteiro",
};

export const GOAL_TYPE_HINTS: Record<GoalType, string> = {
  fixa: "Um conjunto de valores que vale para qualquer dia do período.",
  por_dia_semana: "Valores diferentes para cada dia da semana.",
  treino_descanso: "Um conjunto para dias de treino e outro para dias de descanso.",
  periodo: "Valores de referência do período, sem variação por dia.",
};

/** Nutrientes oferecidos na tela de metas. Micronutrientes entram pelo seletor "adicionar". */
export const GOAL_DEFAULT_NUTRIENTS = [
  CORE_NUTRIENTS.energia,
  CORE_NUTRIENTS.proteina,
  CORE_NUTRIENTS.carboidrato,
  CORE_NUTRIENTS.lipidios,
  CORE_NUTRIENTS.fibra,
  CORE_NUTRIENTS.sodio,
  CORE_NUTRIENTS.acucares,
] as const;

/* ───────────────────────────── Perfil ───────────────────────────── */
export const PROFILE_SEXES = ["feminino", "masculino", "nao_informado"] as const;
export type ProfileSex = (typeof PROFILE_SEXES)[number];

export const PROFILE_SEX_LABELS: Record<ProfileSex, string> = {
  feminino: "Feminino",
  masculino: "Masculino",
  nao_informado: "Prefiro não informar",
};

export const ACTIVITY_LEVELS = [
  "nao_informado",
  "sedentario",
  "leve",
  "moderado",
  "intenso",
  "muito_intenso",
] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export const ACTIVITY_LEVEL_LABELS: Record<ActivityLevel, string> = {
  nao_informado: "Não informado",
  sedentario: "Sedentário",
  leve: "Levemente ativo",
  moderado: "Moderadamente ativo",
  intenso: "Muito ativo",
  muito_intenso: "Extremamente ativo",
};

export const ACTIVITY_LEVEL_HINTS: Record<ActivityLevel, string> = {
  nao_informado: "Sem estimativa de gasto energético.",
  sedentario: "Pouco ou nenhum exercício.",
  leve: "Exercício leve 1 a 3 dias por semana.",
  moderado: "Exercício moderado 3 a 5 dias por semana.",
  intenso: "Exercício intenso 6 a 7 dias por semana.",
  muito_intenso: "Exercício muito intenso ou trabalho físico pesado.",
};

export const GOAL_DIRECTIONS = ["nao_informado", "perder", "manter", "ganhar"] as const;
export type GoalDirection = (typeof GOAL_DIRECTIONS)[number];

export const GOAL_DIRECTION_LABELS: Record<GoalDirection, string> = {
  nao_informado: "Não informado",
  perder: "Perder peso",
  manter: "Manter peso",
  ganhar: "Ganhar peso",
};

/* ───────────────────────────── Tipos de refeição ─────────────────────────────
 * O seed padrão. NÃO entra por migration: é criado na primeira leitura do módulo, de forma
 * idempotente pelo unique (user_id, slug) — ver `ensureMealTypes` em diary-queries.ts. São
 * dado do usuário, e ele pode renomear, reordenar, desativar e criar os seus.
 */
export const DEFAULT_MEAL_TYPES: {
  slug: string;
  name: string;
  defaultTime: string | null;
  icon: string;
}[] = [
  { slug: "cafe_da_manha", name: "Café da manhã", defaultTime: "07:00", icon: "☕" },
  { slug: "lanche_da_manha", name: "Lanche da manhã", defaultTime: "10:00", icon: "🍎" },
  { slug: "almoco", name: "Almoço", defaultTime: "12:30", icon: "🍽️" },
  { slug: "lanche_da_tarde", name: "Lanche da tarde", defaultTime: "16:00", icon: "🥪" },
  { slug: "jantar", name: "Jantar", defaultTime: "19:30", icon: "🍲" },
  { slug: "ceia", name: "Ceia", defaultTime: "22:00", icon: "🥛" },
  { slug: "refeicao_livre", name: "Refeição livre", defaultTime: null, icon: "🎉" },
  { slug: "outros", name: "Outros", defaultTime: null, icon: "🍴" },
];

/* ───────────────────────────── Dias da semana ─────────────────────────────
 * 0 = domingo … 6 = sábado — mesma convenção de `habits.weekdays` (Fase 10) e de
 * `Date.getUTCDay()`, para a aritmética pura não precisar de tradução.
 */
export const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;

export const WEEKDAY_SHORT_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

/* ───────────────────────────── Visões do diário ───────────────────────────── */
export const DIARY_VIEWS = ["dia", "semana", "mes"] as const;
export type DiaryView = (typeof DIARY_VIEWS)[number];

export const DIARY_VIEW_LABELS: Record<DiaryView, string> = {
  dia: "Dia",
  semana: "Semana",
  mes: "Mês",
};

export const PLANNING_VIEWS = ["dia", "semana", "modelos"] as const;
export type PlanningView = (typeof PLANNING_VIEWS)[number];

export const PLANNING_VIEW_LABELS: Record<PlanningView, string> = {
  dia: "Dia",
  semana: "Semana",
  modelos: "Modelos",
};

/** Escopo de uma edição no planejamento. A UI SEMPRE pergunta — nunca decide sozinha. */
export const PLAN_EDIT_SCOPES = ["somente_este_dia", "este_e_proximos", "todo_o_modelo"] as const;
export type PlanEditScope = (typeof PLAN_EDIT_SCOPES)[number];

export const PLAN_EDIT_SCOPE_LABELS: Record<PlanEditScope, string> = {
  somente_este_dia: "Somente este dia",
  este_e_proximos: "Este dia e os próximos",
  todo_o_modelo: "Todo o modelo",
};

export const PLAN_EDIT_SCOPE_HINTS: Record<PlanEditScope, string> = {
  somente_este_dia: "Altera apenas a data escolhida. O modelo e os outros dias ficam como estão.",
  este_e_proximos:
    "Altera esta data e as futuras que vieram do mesmo dia do modelo. O passado não é tocado.",
  todo_o_modelo:
    "Altera o modelo e reaplica nas datas futuras. Dias já passados continuam como foram planejados.",
};

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
    status: "pronto",
    phase: "Subfase 16-B",
  },
  {
    slug: "planejamento",
    title: "Planejamento",
    description: "Refeições planejadas por dia e por semana.",
    href: `${NUTRITION_BASE_PATH}/planejamento`,
    icon: "calendar-range",
    status: "pronto",
    phase: "Subfase 16-B",
  },
  {
    slug: "metas",
    title: "Metas nutricionais",
    description: "Calorias, macros e distribuição por refeição.",
    href: `${NUTRITION_BASE_PATH}/metas`,
    icon: "target",
    status: "pronto",
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

/* Fase 16-B */
export const asMealStatus = (v: unknown): MealStatus =>
  includes(MEAL_STATUSES, v) ? v : "planejada";
export const asChangeKind = (v: unknown): ChangeKind => (includes(CHANGE_KINDS, v) ? v : "extra");
export const asDayKind = (v: unknown): DayKind | null => (includes(DAY_KINDS, v) ? v : null);
export const asGoalType = (v: unknown): GoalType => (includes(GOAL_TYPES, v) ? v : "fixa");
export const asProfileSex = (v: unknown): ProfileSex =>
  includes(PROFILE_SEXES, v) ? v : "nao_informado";
export const asActivityLevel = (v: unknown): ActivityLevel =>
  includes(ACTIVITY_LEVELS, v) ? v : "nao_informado";
export const asGoalDirection = (v: unknown): GoalDirection =>
  includes(GOAL_DIRECTIONS, v) ? v : "nao_informado";
export const asDiaryView = (v: unknown): DiaryView => (includes(DIARY_VIEWS, v) ? v : "dia");
export const asPlanningView = (v: unknown): PlanningView =>
  includes(PLANNING_VIEWS, v) ? v : "dia";
export const asPlanEditScope = (v: unknown): PlanEditScope =>
  includes(PLAN_EDIT_SCOPES, v) ? v : "somente_este_dia";
