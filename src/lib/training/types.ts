/**
 * Fase 17-A — Treinos · Tipos de domínio.
 *
 * Puro: sem I/O, sem React. As `queries.ts` convertem a linha do banco nestes tipos, e a UI
 * nunca vê o shape cru do Supabase — é o que permite mudar coluna sem mexer em componente.
 */
import type {
  DifficultyScale,
  EquipmentCategory,
  ExerciseSource,
  ExerciseType,
  Laterality,
  MovementPattern,
  MuscleRegion,
  MuscleRole,
  OneRmFormula,
  ProgramStatus,
  ScheduleEntryKind,
  ScheduleSource,
  ScheduleStatus,
  SetTechnique,
  SetType,
  TrackingType,
  TrainingGoal,
  TrainingLevel,
  UnilateralVolumeRule,
  WeightUnit,
  WorkoutStatus,
} from "./constants";

/* ─────────────────────────────── Vocabulário ─────────────────────────────── */

export type MuscleGroup = {
  id: string;
  slug: string;
  name: string;
  region: MuscleRegion;
  parentId: string | null;
  color: string | null;
  position: number;
  isSystem: boolean;
  isArchived: boolean;
};

export type Equipment = {
  id: string;
  slug: string;
  name: string;
  category: EquipmentCategory;
  defaultIncrementKg: number | null;
  position: number;
  isSystem: boolean;
  isArchived: boolean;
};

export type ExerciseMuscleLink = {
  muscleGroupId: string;
  muscleGroupName: string;
  role: MuscleRole;
  position: number;
};

/* ─────────────────────────────── Exercício ─────────────────────────────── */

/**
 * Item da lista do catálogo. Já traz a **preferência do usuário aplicada** (nome exibido,
 * favorito, arquivado, descanso e incremento efetivos) — a UI não precisa saber que existem
 * duas tabelas, e a base global continua intocada.
 */
export type ExerciseListItem = {
  id: string;
  userId: string | null;

  /** Nome exibido: apelido do usuário quando existir, senão o nome do exercício. */
  displayName: string;
  name: string;
  alternativeName: string | null;
  description: string | null;

  primaryMuscleGroupId: string;
  primaryMuscleGroupName: string;
  primaryMuscleRegion: MuscleRegion;
  secondaryMuscles: ExerciseMuscleLink[];
  /** Todos os grupos envolvidos (principal + secundários). Usado pelo filtro. */
  muscleGroupIds: string[];

  equipmentId: string | null;
  equipmentName: string | null;
  equipmentCategory: EquipmentCategory | null;

  movementPattern: MovementPattern;
  exerciseType: ExerciseType;
  trackingType: TrackingType;
  laterality: Laterality;

  instructions: string | null;
  tips: string | null;
  commonMistakes: string | null;
  notes: string | null;
  imageUrl: string | null;
  videoUrl: string | null;

  /** Descanso/incremento já resolvidos: preferência do usuário > exercício > preferência do módulo. */
  restSeconds: number | null;
  incrementKg: number | null;

  isSystemExercise: boolean;
  isVerified: boolean;
  source: ExerciseSource;
  systemCode: string | null;
  originExerciseId: string | null;

  isFavorite: boolean;
  isArchived: boolean;
  /** Só exercício próprio é editável. Global é somente leitura, garantido também no banco. */
  isEditable: boolean;

  customName: string | null;
  prefNotes: string | null;

  createdAt: string;
  updatedAt: string;
};

export type ExerciseAlternative = {
  id: string;
  exerciseId: string;
  alternativeExerciseId: string;
  alternativeName: string;
  note: string | null;
  position: number;
};

/* ─────────────────────────────── Preferências ─────────────────────────────── */

export type TrainingPreferences = {
  weightUnit: WeightUnit;
  difficultyScale: DifficultyScale;
  defaultRestSeconds: number;
  defaultIncrementKg: number;
  weekStartsOn: number;
  weeklyWorkoutGoal: number | null;
  autoAdvance: "automatico" | "avisar" | "nunca";
  restSoundEnabled: boolean;
  restVibrationEnabled: boolean;
  keepScreenAwake: boolean;
  unilateralVolumeRule: UnilateralVolumeRule;
  countWarmupInVolume: boolean;
  oneRmFormula: OneRmFormula;
  progressionEnabled: boolean;
};

export const DEFAULT_TRAINING_PREFERENCES: TrainingPreferences = {
  weightUnit: "kg",
  difficultyScale: "simples",
  defaultRestSeconds: 90,
  defaultIncrementKg: 2.5,
  weekStartsOn: 1,
  weeklyWorkoutGoal: null,
  autoAdvance: "avisar",
  restSoundEnabled: true,
  restVibrationEnabled: true,
  keepScreenAwake: true,
  unilateralVolumeRule: "soma_dos_lados",
  countWarmupInVolume: false,
  oneRmFormula: "epley",
  progressionEnabled: true,
};

/* ─────────────────────────────── Filtros ─────────────────────────────── */

export type ExerciseOriginFilter = "todos" | "sistema" | "proprios";
export type ExerciseSort = "nome" | "grupo" | "equipamento" | "recentes" | "antigos";

export type ExerciseFilterState = {
  search: string;
  muscleGroupId: string | null;
  /** Quando ligado, o filtro de grupo também alcança quem tem o grupo como secundário. */
  includeSecondary: boolean;
  equipmentId: string | null;
  equipmentCategory: EquipmentCategory | null;
  movementPattern: MovementPattern | null;
  trackingType: TrackingType | null;
  exerciseType: ExerciseType | null;
  laterality: Laterality | null;
  origin: ExerciseOriginFilter;
  onlyFavorites: boolean;
  showArchived: boolean;
  sort: ExerciseSort;
};

export const EMPTY_EXERCISE_FILTERS: ExerciseFilterState = {
  search: "",
  muscleGroupId: null,
  includeSecondary: true,
  equipmentId: null,
  equipmentCategory: null,
  movementPattern: null,
  trackingType: null,
  exerciseType: null,
  laterality: null,
  origin: "todos",
  onlyFavorites: false,
  showArchived: false,
  sort: "nome",
};

/* ─────────────────────────────── Resumo do módulo ─────────────────────────────── */

export type TrainingCatalogSummary = {
  totalExercises: number;
  systemExercises: number;
  ownExercises: number;
  favorites: number;
  archived: number;
  muscleGroups: number;
  equipment: number;
  /** Quantos exercícios existem por grupo muscular principal (id → total). */
  byMuscleGroup: Record<string, number>;
};

/* ═══════════════════ Fase 17-B — Programa, treino-modelo e planejamento ═══════════════════
 *
 * MODELO É MUTÁVEL; EXECUÇÃO É IMUTÁVEL. Tudo abaixo descreve INTENÇÃO. A sessão ao vivo
 * (17-C) congela um snapshot destes valores e nunca mais lê estas estruturas para renderizar
 * o que já aconteceu.
 */

/* ─────────────────────────────── Programa ─────────────────────────────── */

export type TrainingProgram = {
  id: string;
  name: string;
  description: string | null;
  goal: TrainingGoal;
  level: TrainingLevel;
  status: ProgramStatus;
  startsOn: string | null;
  endsOn: string | null;
  durationWeeks: number | null;
  weeklyFrequency: number | null;
  color: string | null;
  icon: string | null;
  notes: string | null;
  position: number;
  isActive: boolean;
  isArchived: boolean;
  /** Treinos que compõem o programa, já na ordem. */
  workouts: ProgramWorkoutLink[];
  createdAt: string;
  updatedAt: string;
};

export type ProgramWorkoutLink = {
  id: string;
  programId: string;
  workoutId: string;
  workoutName: string;
  workoutShortName: string | null;
  position: number;
  label: string | null;
  /** 0 = domingo … 6 = sábado. Sugestão do programa, NÃO planejamento com data. */
  suggestedWeekdays: number[];
  notes: string | null;
};

/* ─────────────────────────── Treino-modelo ─────────────────────────── */

/**
 * Exercício configurado dentro do treino. `null` em qualquer campo alvo significa
 * "não definido" — nunca zero. Quem transforma isto em séries concretas é
 * `expandPlannedSets` (workout.ts), e é o ÚNICO caminho.
 */
export type WorkoutExercise = {
  id: string;
  workoutId: string;
  exerciseId: string;

  /** Denormalizado na leitura para a UI não precisar cruzar catálogo a cada render. */
  exerciseName: string;
  trackingType: TrackingType;
  laterality: Laterality;
  primaryMuscleGroupId: string;
  primaryMuscleGroupName: string;
  secondaryMuscleGroupIds: string[];
  equipmentName: string | null;

  position: number;
  defaultSets: number;

  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetDurationSeconds: number | null;
  targetDistanceM: number | null;

  plannedWeightKg: number | null;
  /** SOMA à carga efetiva (cinto, colete). */
  plannedAdditionalWeightKg: number | null;
  /** SUBTRAI da carga efetiva (barra assistida). Nunca somar. */
  plannedAssistanceWeightKg: number | null;

  restSeconds: number | null;
  targetRir: number | null;
  targetRpe: number | null;

  setType: SetType;
  technique: SetTechnique | null;
  supersetGroup: string | null;

  isWarmup: boolean;
  countsInVolume: boolean;

  incrementKg: number | null;
  tempo: string | null;
  notes: string | null;

  /** Configuração série a série. Vazio = séries uniformes por `defaultSets`. */
  sets: WorkoutSetConfig[];
  /** Alternativas daquele exercício NAQUELE treino. */
  alternatives: WorkoutExerciseAlternative[];
};

export type WorkoutSetConfig = {
  id: string;
  workoutExerciseId: string;
  setNumber: number;
  setType: SetType;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetDurationSeconds: number | null;
  targetDistanceM: number | null;
  plannedWeightKg: number | null;
  plannedAdditionalWeightKg: number | null;
  plannedAssistanceWeightKg: number | null;
  restSeconds: number | null;
  targetRir: number | null;
  targetRpe: number | null;
  isWarmup: boolean;
  countsInVolume: boolean;
  notes: string | null;
};

export type WorkoutExerciseAlternative = {
  id: string;
  workoutExerciseId: string;
  alternativeExerciseId: string;
  alternativeName: string;
  note: string | null;
  position: number;
};

export type TrainingWorkout = {
  id: string;
  name: string;
  shortName: string | null;
  description: string | null;
  goal: TrainingGoal;
  status: WorkoutStatus;
  programId: string | null;
  programName: string | null;
  estimatedMinutes: number | null;
  color: string | null;
  icon: string | null;
  notes: string | null;
  version: number;
  versionGroupId: string;
  supersededBy: string | null;
  /** Derivado: esta versão foi substituída por outra. Continua legível. */
  isSuperseded: boolean;
  isFavorite: boolean;
  position: number;
  isArchived: boolean;
  exercises: WorkoutExercise[];
  createdAt: string;
  updatedAt: string;
};

/* ─────────────────────────── Planejamento ─────────────────────────── */

/** Uma linha de `training_scheduled_workouts`, já tipada. Status aqui é o GRAVADO. */
export type ScheduledWorkout = {
  id: string;
  /** Data PURA 'yyyy-MM-dd'. Nunca converter para Date só para exibir. */
  scheduledDate: string;
  plannedTime: string | null;
  plannedDurationMinutes: number | null;
  entryKind: ScheduleEntryKind;
  workoutId: string | null;
  workoutName: string | null;
  programId: string | null;
  programName: string | null;
  title: string | null;
  status: ScheduleStatus;
  position: number;
  originalDate: string | null;
  rescheduleReason: string | null;
  skipReason: string | null;
  notes: string | null;
  source: ScheduleSource;
  createdAt: string;
  updatedAt: string;
};

/* ─────────────────────────── Filtros das telas ─────────────────────────── */

export type ProgramFilterState = {
  search: string;
  status: ProgramStatus | null;
  goal: TrainingGoal | null;
  level: TrainingLevel | null;
  onlyActive: boolean;
  showArchived: boolean;
};

export const EMPTY_PROGRAM_FILTERS: ProgramFilterState = {
  search: "",
  status: null,
  goal: null,
  level: null,
  onlyActive: false,
  showArchived: false,
};

export type WorkoutSort = "nome" | "recentes" | "exercicios";

export type WorkoutFilterState = {
  search: string;
  programId: string | null;
  goal: TrainingGoal | null;
  muscleGroupId: string | null;
  onlyFavorites: boolean;
  /** Versões substituídas ficam escondidas por padrão — continuam legíveis quando pedidas. */
  showSuperseded: boolean;
  showArchived: boolean;
  sort: WorkoutSort;
};

export const EMPTY_WORKOUT_FILTERS: WorkoutFilterState = {
  search: "",
  programId: null,
  goal: null,
  muscleGroupId: null,
  onlyFavorites: false,
  showSuperseded: false,
  showArchived: false,
  sort: "nome",
};
