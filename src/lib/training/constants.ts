/**
 * Fase 17-A — Treinos · Enums, rótulos pt-BR e seções da navegação.
 *
 * Arquivo PURO (sem I/O, sem React): serve tanto ao servidor quanto ao cliente e é a única
 * fonte dos rótulos exibidos. Os valores batem exatamente com os CHECKs das migrations —
 * quando um valor sai do banco, tem de sair daqui também, senão a UI mostra a chave crua.
 */

export const TRAINING_BASE_PATH = "/treinos";

/* ─────────────────────────── Grupos musculares (região) ─────────────────────────── */
export const MUSCLE_REGIONS = [
  "superior",
  "inferior",
  "tronco",
  "corpo_inteiro",
  "cardio",
  "outro",
] as const;
export type MuscleRegion = (typeof MUSCLE_REGIONS)[number];

export const MUSCLE_REGION_LABELS: Record<MuscleRegion, string> = {
  superior: "Membros superiores",
  inferior: "Membros inferiores",
  tronco: "Tronco",
  corpo_inteiro: "Corpo inteiro",
  cardio: "Cardiorrespiratório",
  outro: "Outros",
};

/* ──────────────────────────── Equipamento (categoria) ──────────────────────────── */
export const EQUIPMENT_CATEGORIES = [
  "livre",
  "maquina",
  "cabo",
  "corporal",
  "acessorio",
  "cardio",
  "outro",
] as const;
export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];

export const EQUIPMENT_CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  livre: "Peso livre",
  maquina: "Máquina",
  cabo: "Cabo/polia",
  corporal: "Peso corporal",
  acessorio: "Acessório",
  cardio: "Cardio",
  outro: "Outro",
};

/* ───────────────────────────── Padrão de movimento ─────────────────────────────
 * Vocabulário fechado, definido no briefing do módulo. Serve para achar substituto pelo
 * padrão ("outro empurrar horizontal") na Subfase 17-C.
 */
export const MOVEMENT_PATTERNS = [
  "empurrar_horizontal",
  "empurrar_vertical",
  "puxar_horizontal",
  "puxar_vertical",
  "agachamento",
  "dobradica_quadril",
  "extensao_joelho",
  "flexao_joelho",
  "abducao",
  "aducao",
  "flexao_cotovelo",
  "extensao_cotovelo",
  "elevacao",
  "rotacao",
  "anti_rotacao",
  "estabilizacao",
  "locomocao",
  "outros",
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export const MOVEMENT_PATTERN_LABELS: Record<MovementPattern, string> = {
  empurrar_horizontal: "Empurrar horizontal",
  empurrar_vertical: "Empurrar vertical",
  puxar_horizontal: "Puxar horizontal",
  puxar_vertical: "Puxar vertical",
  agachamento: "Agachamento",
  dobradica_quadril: "Dobradiça de quadril",
  extensao_joelho: "Extensão de joelho",
  flexao_joelho: "Flexão de joelho",
  abducao: "Abdução",
  aducao: "Adução",
  flexao_cotovelo: "Flexão de cotovelo",
  extensao_cotovelo: "Extensão de cotovelo",
  elevacao: "Elevação",
  rotacao: "Rotação",
  anti_rotacao: "Anti-rotação",
  estabilizacao: "Estabilização",
  locomocao: "Locomoção",
  outros: "Outros",
};

/* ─────────────────────────────── Tipo de exercício ─────────────────────────────── */
export const EXERCISE_TYPES = [
  "forca",
  "cardio",
  "mobilidade",
  "alongamento",
  "pliometrico",
  "isometrico",
  "outro",
] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const EXERCISE_TYPE_LABELS: Record<ExerciseType, string> = {
  forca: "Força",
  cardio: "Cardio",
  mobilidade: "Mobilidade",
  alongamento: "Alongamento",
  pliometrico: "Pliométrico",
  isometrico: "Isométrico",
  outro: "Outro",
};

/* ───────────────────────── Tipo de acompanhamento (o contrato) ─────────────────────────
 * É O CAMPO MAIS IMPORTANTE DO EXERCÍCIO. Ele diz o que aquele movimento MEDE, e é o que
 * impede o módulo de somar quilos com segundos na Subfase 17-D. A matriz de campos por tipo
 * vive em `tracking.ts` — aqui ficam só os valores e os rótulos.
 */
export const TRACKING_TYPES = [
  "peso_reps",
  "peso_corporal_reps",
  "peso_corporal_adicional",
  "peso_corporal_assistido",
  "duracao",
  "distancia_duracao",
  "calorias",
  "reps_sem_carga",
  "isometria",
  "lado_a_lado",
  "personalizado",
] as const;
export type TrackingType = (typeof TRACKING_TYPES)[number];

export const TRACKING_TYPE_LABELS: Record<TrackingType, string> = {
  peso_reps: "Peso e repetições",
  peso_corporal_reps: "Peso corporal e repetições",
  peso_corporal_adicional: "Peso corporal com carga adicional",
  peso_corporal_assistido: "Peso corporal com assistência",
  duracao: "Duração",
  distancia_duracao: "Distância e duração",
  calorias: "Calorias do equipamento",
  reps_sem_carga: "Repetições sem carga",
  isometria: "Tempo isométrico",
  lado_a_lado: "Lado direito e esquerdo",
  personalizado: "Personalizado",
};

export const TRACKING_TYPE_HINTS: Record<TrackingType, string> = {
  peso_reps: "O padrão da musculação: registra a carga e quantas repetições você fez.",
  peso_corporal_reps: "Só repetições. A carga é o seu próprio corpo.",
  peso_corporal_adicional: "Repetições mais a carga extra (cinto, colete, halter entre os pés).",
  peso_corporal_assistido:
    "Repetições com peso de assistência — que SUBTRAI carga, não soma. É o caso da barra assistida.",
  duracao: "Registra o tempo de execução, sem repetições.",
  distancia_duracao: "Distância e tempo, com inclinação e resistência opcionais.",
  calorias: "As calorias exibidas pelo painel do aparelho. Sempre tratadas como estimativa.",
  reps_sem_carga: "Repetições sem nenhuma carga registrada.",
  isometria: "Tempo sob tensão, com carga opcional.",
  lado_a_lado: "Valores independentes para o lado direito e o esquerdo.",
  personalizado: "Campos livres, quando nenhum dos anteriores serve.",
};

/* ──────────────────────────────── Lateralidade ──────────────────────────────── */
export const LATERALITIES = [
  "bilateral",
  "unilateral_alternado",
  "unilateral_simultaneo",
] as const;
export type Laterality = (typeof LATERALITIES)[number];

export const LATERALITY_LABELS: Record<Laterality, string> = {
  bilateral: "Bilateral",
  unilateral_alternado: "Unilateral (lados alternados)",
  unilateral_simultaneo: "Unilateral (lados simultâneos)",
};

/* ─────────────────────────────────── Origem ─────────────────────────────────── */
export const EXERCISE_SOURCES = ["sistema", "usuario", "duplicado", "importado"] as const;
export type ExerciseSource = (typeof EXERCISE_SOURCES)[number];

export const EXERCISE_SOURCE_LABELS: Record<ExerciseSource, string> = {
  sistema: "Base do sistema",
  usuario: "Criado por você",
  duplicado: "Cópia sua",
  importado: "Importado",
};

/* ─────────────────────────── Papel do músculo secundário ─────────────────────────── */
export const MUSCLE_ROLES = ["secundario", "estabilizador"] as const;
export type MuscleRole = (typeof MUSCLE_ROLES)[number];

export const MUSCLE_ROLE_LABELS: Record<MuscleRole, string> = {
  secundario: "Secundário",
  estabilizador: "Estabilizador",
};

/* ───────────────────────────────── Preferências ───────────────────────────────── */
export const WEIGHT_UNITS = ["kg", "lb"] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

export const DIFFICULTY_SCALES = ["simples", "rir", "rpe"] as const;
export type DifficultyScale = (typeof DIFFICULTY_SCALES)[number];

export const DIFFICULTY_SCALE_LABELS: Record<DifficultyScale, string> = {
  simples: "Simples (fácil → falha)",
  rir: "RIR (repetições em reserva)",
  rpe: "RPE (percepção de esforço)",
};

/** Escala simples de dificuldade. A avançada (RIR/RPE) é numérica e não precisa de rótulo. */
export const DIFFICULTY_LEVELS = ["facil", "adequada", "dificil", "muito_dificil", "falha"] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

export const DIFFICULTY_LEVEL_LABELS: Record<DifficultyLevel, string> = {
  facil: "Fácil",
  adequada: "Adequada",
  dificil: "Difícil",
  muito_dificil: "Muito difícil",
  falha: "Falha",
};

export const AUTO_ADVANCE_MODES = ["automatico", "avisar", "nunca"] as const;
export type AutoAdvanceMode = (typeof AUTO_ADVANCE_MODES)[number];

export const AUTO_ADVANCE_LABELS: Record<AutoAdvanceMode, string> = {
  automatico: "Avançar automaticamente após o descanso",
  avisar: "Apenas avisar quando o descanso acabar",
  nunca: "Nunca avançar automaticamente",
};

export const UNILATERAL_VOLUME_RULES = ["por_lado", "soma_dos_lados", "serie_completa"] as const;
export type UnilateralVolumeRule = (typeof UNILATERAL_VOLUME_RULES)[number];

export const UNILATERAL_VOLUME_RULE_LABELS: Record<UnilateralVolumeRule, string> = {
  por_lado: "Contar cada lado como uma série",
  soma_dos_lados: "Somar os dois lados numa série",
  serie_completa: "Contar a série completa uma vez",
};

export const ONE_RM_FORMULAS = ["epley", "brzycki", "lombardi", "lander"] as const;
export type OneRmFormula = (typeof ONE_RM_FORMULAS)[number];

export const ONE_RM_FORMULA_LABELS: Record<OneRmFormula, string> = {
  epley: "Epley",
  brzycki: "Brzycki",
  lombardi: "Lombardi",
  lander: "Lander",
};

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

/* ═══════════════════════ Fase 17-B — Programas, treinos e planejamento ═══════════════════════ */

/* ─────────────────────────── Objetivo (ORGANIZACIONAL) ───────────────────────────
 * ATENÇÃO: objetivo e nível servem para o usuário ACHAR e ORGANIZAR o que é dele. Não são
 * prescrição, não são recomendação profissional e não prometem resultado — nenhuma tela pode
 * apresentá-los como tal.
 */
export const TRAINING_GOALS = [
  "hipertrofia",
  "forca",
  "resistencia_muscular",
  "condicionamento",
  "manutencao",
  "retorno",
  "personalizado",
] as const;
export type TrainingGoal = (typeof TRAINING_GOALS)[number];

export const TRAINING_GOAL_LABELS: Record<TrainingGoal, string> = {
  hipertrofia: "Hipertrofia",
  forca: "Força",
  resistencia_muscular: "Resistência muscular",
  condicionamento: "Condicionamento",
  manutencao: "Manutenção",
  retorno: "Retorno ao treino",
  personalizado: "Personalizado",
};

export const TRAINING_LEVELS = [
  "iniciante",
  "intermediario",
  "avancado",
  "nao_informado",
] as const;
export type TrainingLevel = (typeof TRAINING_LEVELS)[number];

export const TRAINING_LEVEL_LABELS: Record<TrainingLevel, string> = {
  iniciante: "Iniciante",
  intermediario: "Intermediário",
  avancado: "Avançado",
  nao_informado: "Não informado",
};

/* ─────────────────────────────── Status do programa ─────────────────────────────── */
export const PROGRAM_STATUSES = [
  "rascunho",
  "ativo",
  "pausado",
  "finalizado",
  "arquivado",
] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

export const PROGRAM_STATUS_LABELS: Record<ProgramStatus, string> = {
  rascunho: "Rascunho",
  ativo: "Ativo",
  pausado: "Pausado",
  finalizado: "Finalizado",
  arquivado: "Arquivado",
};

/* ────────────────────────────── Status do treino-modelo ────────────────────────────── */
export const WORKOUT_STATUSES = ["rascunho", "ativo", "arquivado"] as const;
export type WorkoutStatus = (typeof WORKOUT_STATUSES)[number];

export const WORKOUT_STATUS_LABELS: Record<WorkoutStatus, string> = {
  rascunho: "Rascunho",
  ativo: "Ativo",
  arquivado: "Arquivado",
};

/* ───────────────────────────────── Tipo de série (11) ─────────────────────────────────
 * Descreve a INTENÇÃO daquela série. A sessão (17-C) congela isto no snapshot e o volume
 * (17-D) usa para separar aquecimento de série de trabalho.
 */
export const SET_TYPES = [
  "aquecimento",
  "preparatoria",
  "trabalho",
  "top_set",
  "back_off",
  "drop_set",
  "falha",
  "amrap",
  "isometrica",
  "assistida",
  "personalizada",
] as const;
export type SetType = (typeof SET_TYPES)[number];

export const SET_TYPE_LABELS: Record<SetType, string> = {
  aquecimento: "Aquecimento",
  preparatoria: "Preparatória",
  trabalho: "Trabalho",
  top_set: "Top set",
  back_off: "Back-off",
  drop_set: "Drop set",
  falha: "Até a falha",
  amrap: "AMRAP",
  isometrica: "Isométrica",
  assistida: "Assistida",
  personalizada: "Personalizada",
};

/* ─────────────────────────────────── Técnica (11) ─────────────────────────────────── */
export const SET_TECHNIQUES = [
  "superset",
  "bi_set",
  "tri_set",
  "circuito",
  "drop_set",
  "rest_pause",
  "cluster",
  "piramide_crescente",
  "piramide_decrescente",
  "serie_unilateral",
  "personalizada",
] as const;
export type SetTechnique = (typeof SET_TECHNIQUES)[number];

export const SET_TECHNIQUE_LABELS: Record<SetTechnique, string> = {
  superset: "Superset",
  bi_set: "Bi-set",
  tri_set: "Tri-set",
  circuito: "Circuito",
  drop_set: "Drop set",
  rest_pause: "Rest-pause",
  cluster: "Cluster",
  piramide_crescente: "Pirâmide crescente",
  piramide_decrescente: "Pirâmide decrescente",
  serie_unilateral: "Série unilateral",
  personalizada: "Personalizada",
};

/* ─────────────────────────── Planejamento: status GRAVADO ───────────────────────────
 * Só FATO entra aqui. "Atrasado" e "em andamento" NÃO existem no banco — são derivados de
 * data + agora na leitura (`derivePlannedStatus`, em schedule.ts), exatamente como `atrasada`
 * no TO-DO e o status da fatura de cartão.
 */
export const SCHEDULE_STATUSES = [
  "planejado",
  "concluido",
  "nao_realizado",
  "reagendado",
  "cancelado",
] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  planejado: "Planejado",
  concluido: "Concluído",
  nao_realizado: "Não realizado",
  reagendado: "Reagendado",
  cancelado: "Cancelado",
};

/** Status APRESENTADO. Acrescenta o que é derivado e nunca gravado. */
export const DERIVED_SCHEDULE_STATUSES = [
  ...SCHEDULE_STATUSES,
  "hoje",
  "atrasado",
] as const;
export type DerivedScheduleStatus = (typeof DERIVED_SCHEDULE_STATUSES)[number];

export const DERIVED_SCHEDULE_STATUS_LABELS: Record<DerivedScheduleStatus, string> = {
  ...SCHEDULE_STATUS_LABELS,
  hoje: "Hoje",
  atrasado: "Atrasado",
};

export const SCHEDULE_ENTRY_KINDS = ["treino", "descanso"] as const;
export type ScheduleEntryKind = (typeof SCHEDULE_ENTRY_KINDS)[number];

export const SCHEDULE_ENTRY_KIND_LABELS: Record<ScheduleEntryKind, string> = {
  treino: "Treino",
  descanso: "Descanso",
};

export const SCHEDULE_SOURCES = ["manual", "recorrencia", "duplicacao", "programa"] as const;
export type ScheduleSource = (typeof SCHEDULE_SOURCES)[number];

export const SCHEDULE_SOURCE_LABELS: Record<ScheduleSource, string> = {
  manual: "Criado à mão",
  recorrencia: "Gerado por recorrência",
  duplicacao: "Semana duplicada",
  programa: "Aplicado de um programa",
};

/* ─────────────────────────── Navegação interna do módulo ───────────────────────────
 * 13 submódulos. Os que ainda não existem aparecem com a subfase em que chegam — o link
 * funciona e abre uma tela honesta, em vez de sumir do menu ou fingir que funciona.
 */
export type TrainingSectionStatus = "pronto" | "proxima" | "planejada";

export type TrainingSection = {
  slug: string;
  title: string;
  description: string;
  href: string;
  icon: string;
  status: TrainingSectionStatus;
  phase: string;
};

export const TRAINING_SECTIONS: TrainingSection[] = [
  {
    slug: "visao-geral",
    title: "Visão geral",
    description: "Resumo do dia, da semana e atalhos.",
    href: TRAINING_BASE_PATH,
    icon: "layout-dashboard",
    status: "pronto",
    phase: "Subfase 17-A",
  },
  {
    slug: "exercicios",
    title: "Exercícios",
    description: "Catálogo com base própria, alternativas e exercícios seus.",
    href: `${TRAINING_BASE_PATH}/exercicios`,
    icon: "dumbbell",
    status: "pronto",
    phase: "Subfase 17-A",
  },
  {
    slug: "configuracoes",
    title: "Configurações",
    description: "Unidade de peso, escala de dificuldade, descanso e incremento padrão.",
    href: `${TRAINING_BASE_PATH}/configuracoes`,
    icon: "settings",
    status: "pronto",
    phase: "Subfase 17-A",
  },
  {
    slug: "hoje",
    title: "Treino de hoje",
    description: "O treino programado para hoje e o próximo.",
    href: `${TRAINING_BASE_PATH}/hoje`,
    icon: "calendar-check",
    status: "pronto",
    phase: "Subfase 17-B",
  },
  {
    slug: "treinos",
    title: "Treinos",
    description: "Modelos reutilizáveis com exercícios, séries e descansos.",
    href: `${TRAINING_BASE_PATH}/treinos`,
    icon: "clipboard-list",
    status: "pronto",
    phase: "Subfase 17-B",
  },
  {
    slug: "programas",
    title: "Programas",
    description: "ABC, Push/Pull/Legs, Upper/Lower e os seus.",
    href: `${TRAINING_BASE_PATH}/programas`,
    icon: "layers",
    status: "pronto",
    phase: "Subfase 17-B",
  },
  {
    slug: "calendario",
    title: "Calendário",
    description: "Planejamento semanal, mensal e consistência.",
    href: `${TRAINING_BASE_PATH}/calendario`,
    icon: "calendar-range",
    status: "pronto",
    phase: "Subfase 17-B",
  },
  {
    slug: "sessao",
    title: "Sessão ativa",
    description: "O treino acontecendo, série por série.",
    href: `${TRAINING_BASE_PATH}/sessao`,
    icon: "timer",
    status: "proxima",
    phase: "Subfase 17-C",
  },
  {
    slug: "historico",
    title: "Histórico",
    description: "Tudo o que já foi treinado, com detalhe de cada sessão.",
    href: `${TRAINING_BASE_PATH}/historico`,
    icon: "history",
    status: "planejada",
    phase: "Subfase 17-D",
  },
  {
    slug: "recordes",
    title: "Recordes",
    description: "Melhores marcas por exercício e por métrica.",
    href: `${TRAINING_BASE_PATH}/recordes`,
    icon: "trophy",
    status: "planejada",
    phase: "Subfase 17-D",
  },
  {
    slug: "evolucao",
    title: "Evolução",
    description: "Progressão de carga, volume e evolução corporal.",
    href: `${TRAINING_BASE_PATH}/evolucao`,
    icon: "trending-up",
    status: "planejada",
    phase: "Subfases 17-D e 17-E",
  },
  {
    slug: "metas",
    title: "Metas",
    description: "Frequência, desempenho, corporais e personalizadas.",
    href: `${TRAINING_BASE_PATH}/metas`,
    icon: "target",
    status: "planejada",
    phase: "Subfase 17-E",
  },
  {
    slug: "relatorios",
    title: "Relatórios",
    description: "Consumo de tempo, volume e aderência por período.",
    href: `${TRAINING_BASE_PATH}/relatorios`,
    icon: "bar-chart-3",
    status: "planejada",
    phase: "Subfase 17-E",
  },
];

/* ───────────────────── Conversores seguros (linha do banco → enum) ─────────────────────
 * O banco devolve `string`. Estas funções trazem para o tipo, com fallback — nenhuma tela
 * quebra se um valor novo aparecer antes de o código conhecer.
 */
const asEnum =
  <T extends string>(values: readonly T[], fallback: T) =>
  (value: string | null | undefined): T =>
    values.includes(value as T) ? (value as T) : fallback;

export const asMuscleRegion = asEnum(MUSCLE_REGIONS, "outro");
export const asEquipmentCategory = asEnum(EQUIPMENT_CATEGORIES, "outro");
export const asMovementPattern = asEnum(MOVEMENT_PATTERNS, "outros");
export const asExerciseType = asEnum(EXERCISE_TYPES, "outro");
export const asTrackingType = asEnum(TRACKING_TYPES, "peso_reps");
export const asLaterality = asEnum(LATERALITIES, "bilateral");
export const asExerciseSource = asEnum(EXERCISE_SOURCES, "usuario");
export const asMuscleRole = asEnum(MUSCLE_ROLES, "secundario");
export const asWeightUnit = asEnum(WEIGHT_UNITS, "kg");
export const asDifficultyScale = asEnum(DIFFICULTY_SCALES, "simples");
export const asAutoAdvanceMode = asEnum(AUTO_ADVANCE_MODES, "avisar");
export const asUnilateralVolumeRule = asEnum(UNILATERAL_VOLUME_RULES, "soma_dos_lados");
export const asOneRmFormula = asEnum(ONE_RM_FORMULAS, "epley");

/* Fase 17-B */
export const asTrainingGoal = asEnum(TRAINING_GOALS, "personalizado");
export const asTrainingLevel = asEnum(TRAINING_LEVELS, "nao_informado");
export const asProgramStatus = asEnum(PROGRAM_STATUSES, "rascunho");
export const asWorkoutStatus = asEnum(WORKOUT_STATUSES, "ativo");
export const asSetType = asEnum(SET_TYPES, "trabalho");
export const asScheduleStatus = asEnum(SCHEDULE_STATUSES, "planejado");
export const asScheduleEntryKind = asEnum(SCHEDULE_ENTRY_KINDS, "treino");
export const asScheduleSource = asEnum(SCHEDULE_SOURCES, "manual");

/** Técnica é opcional: `null` continua `null` em vez de virar um valor inventado. */
export const asSetTechnique = (value: string | null | undefined): SetTechnique | null =>
  SET_TECHNIQUES.includes(value as SetTechnique) ? (value as SetTechnique) : null;
