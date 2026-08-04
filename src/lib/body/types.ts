/**
 * Fase 16-E — Módulo central de medidas corporais · Tipos de domínio.
 *
 * O shape que a leitura entrega e que a UI e as funções puras consomem. Consumido por Dieta
 * (16-E) e, quando chegar, por Treinos (17-E) — sem cópia, sem tipo paralelo.
 */
import type {
  BodyGoalDirection,
  BodyGoalStatus,
  MeasurementCategory,
  MeasurementCondition,
  MeasurementSide,
  MeasurementSource,
  PhotoAngle,
} from "./constants";

/** Tipo de medida. Depois da semente, é dado do usuário: ele renomeia, reordena, desativa. */
export type MeasurementType = {
  id: string;
  slug: string;
  name: string;
  unit: string;
  category: MeasurementCategory;
  side: MeasurementSide | null;
  /** Casas decimais NA APRESENTAÇÃO. O cálculo não arredonda. */
  decimals: number;
  position: number;
  isActive: boolean;
  /** Veio da semente dos 16 padrão. Só informativo — o usuário edita todos igualmente. */
  isDefault: boolean;
  note: string | null;
};

/** Uma medição registrada. */
export type Measurement = {
  id: string;
  typeId: string;
  /** DATA PURA 'yyyy-MM-dd'. Não é instante e não se converte para `Date` para formatar. */
  measuredOn: string;
  /** 'HH:mm' quando informado. */
  measuredAt: string | null;
  value: number;
  /** CONGELADA na gravação: trocar a unidade do tipo não reescreve o histórico. */
  unit: string;
  condition: MeasurementCondition | null;
  note: string | null;
  source: MeasurementSource;
  createdAt: string;
};

/** Medição já resolvida com o tipo — o formato que a tela e os relatórios consomem. */
export type MeasurementWithType = Measurement & {
  typeName: string;
  typeSlug: string;
  typeCategory: MeasurementCategory;
  typeDecimals: number;
};

/** Meta corporal. Direção e alvo são do usuário; o sistema nunca sugere. */
export type MeasurementGoal = {
  id: string;
  typeId: string;
  direction: BodyGoalDirection;
  /** NULO = "use a primeira medida a partir de `startsOn`". Nunca zero. */
  startValue: number | null;
  targetValue: number;
  unit: string;
  startsOn: string;
  /** Prazo opcional: meta sem data acompanha, não vence. */
  targetDate: string | null;
  /** Status GRAVADO. O exibido é o derivado — ver `effectiveGoalStatus`. */
  status: BodyGoalStatus;
  note: string | null;
  createdAt: string;
};

/**
 * Foto de evolução.
 *
 * ⛔ NÃO existe campo de URL aqui, e isso é proposital: uma URL guardada é uma URL que
 * sobrevive à sessão. O caminho no Storage só é assinado no servidor, na hora da leitura,
 * com validade de minutos (`PHOTO_SIGNED_URL_TTL_SECONDS`).
 */
export type ProgressPhoto = {
  id: string;
  attachmentId: string;
  /** Caminho no bucket privado. NUNCA vai para o cliente sem estar assinado. */
  storagePath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  takenOn: string;
  angle: PhotoAngle;
  /** Peso do dia como CONTEXTO. O histórico de peso continua em `body_measurements`. */
  weightKg: number | null;
  note: string | null;
  position: number;
  createdAt: string;
};

/** Foto pronta para a tela: a URL vem assinada e expira. */
export type SignedProgressPhoto = Omit<ProgressPhoto, "storagePath"> & {
  /** URL de vida curta gerada no servidor. `null` quando a assinatura falhou. */
  url: string | null;
};