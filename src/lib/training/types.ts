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
  TrackingType,
  UnilateralVolumeRule,
  WeightUnit,
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
