/**
 * Fase 17-A — Treinos · Tipos de domínio.
 *
 * Puro: sem I/O, sem React. As `queries.ts` convertem a linha do banco nestes tipos, e a UI
 * nunca vê o shape cru do Supabase — é o que permite mudar coluna sem mexer em componente.
 */
import type {
  DerivedExerciseStatus,
  DifficultyLevel,
  DifficultyScale,
  EquipmentCategory,
  ExerciseSource,
  ExerciseType,
  Laterality,
  MovementPattern,
  MuscleRegion,
  MuscleRole,
  OneRmFormula,
  PlateKind,
  ProgramStatus,
  RestEndKind,
  ScheduleEntryKind,
  ScheduleSource,
  ScheduleStatus,
  SessionEventKind,
  SessionExerciseStatus,
  SessionOrigin,
  SessionSetStatus,
  SessionStatus,
  SetTechnique,
  SetType,
  SubstitutionReason,
  TrackingType,
  TrainingGoal,
  TrainingLevel,
  UnilateralVolumeRule,
  WeightUnit,
  WorkoutStatus,
} from "./constants";
import type { WorkoutSnapshot } from "./session-snapshot";

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

/* ═══════════════════════ Fase 17-C — Sessão ao vivo ═══════════════════════
 *
 * ⛔ TUDO AQUI É EXECUÇÃO, e execução é IMUTÁVEL. Os campos `*Snapshot` são cópias congeladas
 * no ato do início — nenhuma tela lê o modelo (17-B) para renderizar uma sessão.
 */

export type TrainingLocation = {
  id: string;
  name: string;
  notes: string | null;
  isDefault: boolean;
  isArchived: boolean;
  plates: LocationPlate[];
};

export type LocationPlate = {
  id: string;
  locationId: string;
  kind: PlateKind;
  weightKg: number;
  /** Unidades no local (não pares). A calculadora divide por dois. */
  quantity: number;
  notes: string | null;
};

/** Uma série executada, já tipada. Os campos `planned*` são o congelamento do previsto. */
export type SessionSet = {
  id: string;
  sessionId: string;
  sessionExerciseId: string;
  setNumber: number;
  setType: SetType;
  status: SessionSetStatus;

  plannedRepsMin: number | null;
  plannedRepsMax: number | null;
  plannedWeightKg: number | null;
  plannedAdditionalWeightKg: number | null;
  plannedAssistanceWeightKg: number | null;
  plannedDurationSeconds: number | null;
  plannedDistanceM: number | null;
  plannedRestSeconds: number | null;
  plannedRir: number | null;
  plannedRpe: number | null;

  reps: number | null;
  weightKg: number | null;
  /** SOMA à carga efetiva. */
  additionalWeightKg: number | null;
  /** SUBTRAI da carga efetiva. Nunca somar. */
  assistanceWeightKg: number | null;
  durationSeconds: number | null;
  distanceM: number | null;
  /** Estimativa do painel do aparelho — a UI é obrigada a rotular. */
  calories: number | null;
  inclinePercent: number | null;
  resistanceLevel: number | null;

  repsLeft: number | null;
  repsRight: number | null;
  weightLeftKg: number | null;
  weightRightKg: number | null;

  rir: number | null;
  rpe: number | null;
  difficulty: DifficultyLevel | null;

  isWarmup: boolean;
  countsInVolume: boolean;
  /** MARCADOR de candidato a recorde. A consolidação é da 17-D. */
  isPersonalRecord: boolean;

  notes: string | null;
  completedAt: string | null;
  clientMutationId: string;
};

export type SessionExercise = {
  id: string;
  sessionId: string;
  /** Referência informativa (`set null`). Nunca fonte de leitura. */
  exerciseId: string | null;
  workoutExerciseId: string | null;

  plannedPosition: number;
  executedPosition: number;
  /** O GRAVADO. `parcial`/`concluido` saem de `deriveExerciseStatus`. */
  status: SessionExerciseStatus;
  /** O APRESENTADO, já derivado das séries. */
  derivedStatus: DerivedExerciseStatus;

  exerciseName: string;
  trackingType: TrackingType;
  laterality: Laterality;
  muscleGroup: string | null;
  equipment: string | null;
  movementPattern: string | null;

  supersetGroup: string | null;
  technique: SetTechnique | null;
  isWarmup: boolean;
  countsInVolume: boolean;
  restSeconds: number | null;
  incrementKg: number | null;
  notes: string | null;
  skipReason: string | null;

  replacedSessionExerciseId: string | null;
  isExtra: boolean;

  startedAt: string | null;
  endedAt: string | null;

  sets: SessionSet[];
};

export type SessionRest = {
  id: string;
  sessionId: string;
  sessionExerciseId: string | null;
  sessionSetId: string | null;
  plannedSeconds: number;
  adjustmentSeconds: number;
  startedAt: string;
  endedAt: string | null;
  actualSeconds: number | null;
  endKind: RestEndKind | null;
};

export type SessionPause = {
  id: string;
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
  reason: string | null;
};

export type SessionEvent = {
  id: string;
  kind: SessionEventKind;
  occurredAt: string;
  sessionExerciseId: string | null;
  sessionSetId: string | null;
  description: string | null;
};

export type SessionSubstitution = {
  id: string;
  originalSessionExerciseId: string | null;
  newSessionExerciseId: string | null;
  originalName: string;
  substituteName: string;
  reason: SubstitutionReason;
  reasonNotes: string | null;
  occurredAt: string;
};

export type TrainingSession = {
  id: string;
  status: SessionStatus;
  origin: SessionOrigin;

  /** Referências INFORMATIVAS. */
  workoutId: string | null;
  programId: string | null;
  scheduledWorkoutId: string | null;
  locationId: string | null;
  locationName: string | null;

  /** Data PURA. Sessão que atravessa a meia-noite fica no dia em que começou. */
  sessionDate: string;
  startedAt: string | null;
  endedAt: string | null;

  workoutName: string;
  workoutShortName: string | null;
  workoutVersion: number | null;
  programName: string | null;
  /**
   * O congelamento lido de volta. Na PREPARAÇÃO ele é a única fonte (as linhas filhas só
   * nascem ao iniciar); depois de iniciada, as linhas são a forma consultável do mesmo
   * congelamento. Em nenhum dos dois casos o treino-modelo é consultado.
   */
  snapshot: WorkoutSnapshot | null;

  defaultRestSeconds: number;
  autoAdvance: "automatico" | "avisar" | "nunca";
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  keepScreenAwake: boolean;
  weightUnit: WeightUnit;

  /** Sem ele, carga efetiva de peso corporal é INDISPONÍVEL — nunca zero. */
  bodyWeightKg: number | null;
  energyLevel: number | null;
  moodLevel: number | null;
  sleepQuality: number | null;
  sorenessLevel: number | null;
  preNotes: string | null;

  rating: number | null;
  perceivedEffort: number | null;
  notes: string | null;
  feltPain: boolean;
  painNotes: string | null;

  /** Congelados na finalização. A tela ao vivo deriva de timestamps. */
  totalSeconds: number | null;
  activeSeconds: number | null;
  restTotalSeconds: number | null;
  pauseTotalSeconds: number | null;

  exercises: SessionExercise[];
  rests: SessionRest[];
  pauses: SessionPause[];
  substitutions: SessionSubstitution[];

  createdAt: string;
  updatedAt: string;
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
