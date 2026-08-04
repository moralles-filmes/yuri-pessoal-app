import "server-only";

/**
 * Fase 16-E — Módulo central de medidas corporais · Leitura (server-only).
 *
 * Padrão do projeto: poucas consultas amplas + derivação em memória. A RLS faz o recorte por
 * usuário — nenhuma query aqui filtra `user_id` na mão, e nem deve.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ AS FOTOS SÓ SAEM DAQUI ASSINADAS.                                                   ║
 * ║ `storage_path` é lido, usado para assinar e NÃO É DEVOLVIDO ao cliente. A URL vale     ║
 * ║ minutos e é gerada a cada leitura — não existe caminho que produza link permanente.    ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Este arquivo é do MÓDULO CENTRAL: a Fase 17 (Treinos) deve consumi-lo tal como está, em vez
 * de criar leitura própria de peso corporal.
 */
import { createClient } from "@/lib/supabase/server";
import {
  asGoalDirection,
  asGoalStatus,
  asMeasurementCategory,
  asMeasurementCondition,
  asMeasurementSide,
  asMeasurementSource,
  asPhotoAngle,
  DEFAULT_MEASUREMENT_TYPES,
  PHOTO_BUCKET,
  PHOTO_SIGNED_URL_TTL_SECONDS,
  WEIGHT_SLUG,
} from "./constants";
import type {
  Measurement,
  MeasurementGoal,
  MeasurementType,
  MeasurementWithType,
  SignedProgressPhoto,
} from "./types";

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/* ═══════════════════════════ Tipos de medida ═══════════════════════════ */

/**
 * Cria os 16 tipos padrão na primeira vez que o módulo é aberto.
 *
 * POR QUE AQUI E NÃO NUMA MIGRATION: os tipos são dado do usuário (ele renomeia, reordena e
 * desativa), e uma migration não sabe quais usuários existem nem os que vão existir. Mesmo
 * padrão de `ensureMealTypes` (16-B) e `ensureMarketCategories` (16-D).
 *
 * O `onConflict` no unique (user_id, slug) — que é um índice TOTAL, não parcial — torna a
 * chamada idempotente: rodar mil vezes cria no máximo os 16. Falhar o seed não pode impedir a
 * tela de abrir, então o erro é silencioso e a próxima leitura tenta de novo.
 */
export async function ensureMeasurementTypes(userId: string): Promise<void> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("body_measurement_types")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return;

  await supabase.from("body_measurement_types").upsert(
    DEFAULT_MEASUREMENT_TYPES.map((type, index) => ({
      user_id: userId,
      slug: type.slug,
      name: type.name,
      unit: type.unit,
      category: type.category,
      side: type.side,
      decimals: type.decimals,
      position: index,
      is_active: true,
      is_default: true,
    })),
    { onConflict: "user_id,slug", ignoreDuplicates: true },
  );
}

export async function getMeasurementTypes(): Promise<MeasurementType[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("body_measurement_types")
    .select("id,slug,name,unit,category,side,decimals,position,is_active,is_default,note")
    .order("position")
    .order("name");

  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    unit: row.unit,
    category: asMeasurementCategory(row.category),
    side: asMeasurementSide(row.side),
    decimals: row.decimals,
    position: row.position,
    isActive: row.is_active,
    isDefault: row.is_default,
    note: row.note,
  }));
}

/* ═══════════════════════════ Medições ═══════════════════════════ */

const MEASUREMENT_SELECT =
  "id,type_id,measured_on,measured_at,value,unit,condition,note,source,created_at";

type MeasurementRow = {
  id: string;
  type_id: string;
  measured_on: string;
  measured_at: string | null;
  value: number | string;
  unit: string;
  condition: string | null;
  note: string | null;
  source: string;
  created_at: string;
};

function mapMeasurement(row: MeasurementRow): Measurement {
  return {
    id: row.id,
    typeId: row.type_id,
    measuredOn: row.measured_on,
    // O Postgres devolve 'HH:mm:ss'; a UI usa 'HH:mm'. O corte é de APRESENTAÇÃO — a coluna
    // é `time`, não um instante, então não há fuso envolvido.
    measuredAt: row.measured_at ? row.measured_at.slice(0, 5) : null,
    value: num(row.value) ?? 0,
    unit: row.unit,
    condition: asMeasurementCondition(row.condition),
    note: row.note,
    source: asMeasurementSource(row.source),
    createdAt: row.created_at,
  };
}

/**
 * Medições de um intervalo, já resolvidas com o tipo.
 *
 * `from`/`to` são datas puras. Sem intervalo, traz o histórico inteiro — que numa base de uso
 * pessoal cabe folgado numa consulta (uma medição por dia por tipo, na casa dos milhares).
 */
export async function getMeasurements(options: {
  from?: string;
  to?: string;
  typeIds?: string[];
} = {}): Promise<MeasurementWithType[]> {
  const supabase = await createClient();

  let query = supabase.from("body_measurements").select(MEASUREMENT_SELECT);
  if (options.from) query = query.gte("measured_on", options.from);
  if (options.to) query = query.lte("measured_on", options.to);
  if (options.typeIds && options.typeIds.length > 0) query = query.in("type_id", options.typeIds);

  const [{ data }, types] = await Promise.all([
    query.order("measured_on", { ascending: false }).order("measured_at", { nullsFirst: false }),
    getMeasurementTypes(),
  ]);

  const typeById = new Map(types.map((type) => [type.id, type]));

  return ((data ?? []) as unknown as MeasurementRow[]).map((row) => {
    const measurement = mapMeasurement(row);
    const type = typeById.get(row.type_id);
    return {
      ...measurement,
      typeName: type?.name ?? "Medida",
      typeSlug: type?.slug ?? "",
      typeCategory: type?.category ?? "outro",
      typeDecimals: type?.decimals ?? 1,
    } satisfies MeasurementWithType;
  });
}

/**
 * O peso mais recente até uma data — o que a Fase 17 vai consumir para pré-preencher o peso
 * corporal da sessão de treino (hoje `training_sessions.body_weight_kg` é digitado na hora).
 *
 * Devolve `null` quando não há registro: SEM PESO CORPORAL, A CARGA EFETIVA É INDISPONÍVEL,
 * NUNCA ZERO — invariante 3 do módulo Treinos.
 */
export async function getLatestWeight(upTo?: string): Promise<MeasurementWithType | null> {
  const types = await getMeasurementTypes();
  const weightType = types.find((type) => type.slug === WEIGHT_SLUG);
  if (!weightType) return null;

  const supabase = await createClient();
  let query = supabase
    .from("body_measurements")
    .select(MEASUREMENT_SELECT)
    .eq("type_id", weightType.id);
  if (upTo) query = query.lte("measured_on", upTo);

  const { data } = await query
    .order("measured_on", { ascending: false })
    .order("measured_at", { nullsFirst: false })
    .limit(1);

  const row = (data ?? [])[0] as unknown as MeasurementRow | undefined;
  if (!row) return null;

  return {
    ...mapMeasurement(row),
    typeName: weightType.name,
    typeSlug: weightType.slug,
    typeCategory: weightType.category,
    typeDecimals: weightType.decimals,
  };
}

/* ═══════════════════════════ Metas ═══════════════════════════ */

export async function getMeasurementGoals(): Promise<MeasurementGoal[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("body_measurement_goals")
    .select(
      "id,type_id,direction,start_value,target_value,unit,starts_on,target_date,status,note,created_at",
    )
    .order("starts_on", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    typeId: row.type_id,
    direction: asGoalDirection(row.direction),
    // NULO é preservado: significa "use a primeira medida". Um 0 aqui viraria um ponto de
    // partida inventado, e todo percentual de progresso sairia errado.
    startValue: num(row.start_value),
    targetValue: num(row.target_value) ?? 0,
    unit: row.unit,
    startsOn: row.starts_on,
    targetDate: row.target_date,
    status: asGoalStatus(row.status),
    note: row.note,
    createdAt: row.created_at,
  }));
}

/* ═══════════════════════════ Fotos ═══════════════════════════ */

type PhotoRow = {
  id: string;
  attachment_id: string;
  taken_on: string;
  angle: string;
  weight_kg: number | string | null;
  note: string | null;
  position: number;
  created_at: string;
};

type AttachmentRow = {
  id: string;
  bucket_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
};

/**
 * Fotos de evolução, com a URL ASSINADA na hora.
 *
 * ⛔ O `storage_path` NÃO sai desta função. Ele é lido, usado para assinar e descartado — o
 * tipo `SignedProgressPhoto` sequer tem o campo. Assim não existe caminho pelo qual um
 * caminho de Storage chegue ao HTML e sobreviva à sessão.
 *
 * `createSignedUrls` assina o lote inteiro numa chamada. A assinatura roda sob a sessão do
 * usuário, então a policy de `storage.objects` por pasta `{user_id}/…` (Fase 14) continua
 * valendo: pedir a assinatura do arquivo de outra pessoa não produz URL nenhuma.
 */
export async function getProgressPhotos(options: { from?: string; to?: string } = {}): Promise<
  SignedProgressPhoto[]
> {
  const supabase = await createClient();

  let query = supabase
    .from("body_progress_photos")
    .select("id,attachment_id,taken_on,angle,weight_kg,note,position,created_at");
  if (options.from) query = query.gte("taken_on", options.from);
  if (options.to) query = query.lte("taken_on", options.to);

  const { data } = await query.order("taken_on", { ascending: false }).order("position");

  const rows = (data ?? []) as unknown as PhotoRow[];
  if (rows.length === 0) return [];

  // ⚠️ DUAS CONSULTAS, DE PROPÓSITO — não é falta de embed.
  //
  // A FK de `attachment_id` é COMPOSTA (attachment_id, user_id) desde
  // `20260805100400_body_progress_photos_owner_fk.sql`, e um `select` com embed
  // (`attachments(...)`) passaria a depender de como o PostgREST resolve uma FK composta —
  // o tipo de coisa que compila, passa no lint e quebra só em runtime. É a mesma família de
  // armadilha do `ON CONFLICT` com índice parcial (42P10) que a 16-B documentou.
  //
  // Duas consultas amplas + junção em memória é o padrão dominante do projeto e não depende
  // de inferência nenhuma. Não é N+1: são duas idas ao banco, independentemente do número
  // de fotos.
  const { data: attachmentsData } = await supabase
    .from("attachments")
    .select("id,bucket_id,storage_path,file_name,mime_type,size_bytes")
    .in(
      "id",
      rows.map((row) => row.attachment_id),
    );

  const attachmentById = new Map<string, AttachmentRow>();
  for (const row of (attachmentsData ?? []) as unknown as AttachmentRow[]) {
    attachmentById.set(row.id, row);
  }

  // Foto sem anexo alcançável é DESCARTADA: sem arquivo não há o que mostrar, e a RLS de
  // `attachments` é a segunda barreira (a primeira é a FK composta acima).
  const withFile = rows
    .map((row) => ({ row, attachment: attachmentById.get(row.attachment_id) }))
    .filter((item): item is { row: PhotoRow; attachment: AttachmentRow } => Boolean(item.attachment));
  if (withFile.length === 0) return [];

  const paths = withFile.map((item) => item.attachment.storage_path);
  const { data: signed } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(paths, PHOTO_SIGNED_URL_TTL_SECONDS);

  const urlByPath = new Map<string, string>();
  for (const item of signed ?? []) {
    if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
  }

  return withFile.map(({ row, attachment }) => ({
    id: row.id,
    attachmentId: row.attachment_id,
    fileName: attachment.file_name,
    mimeType: attachment.mime_type,
    sizeBytes: attachment.size_bytes,
    takenOn: row.taken_on,
    angle: asPhotoAngle(row.angle),
    weightKg: num(row.weight_kg),
    note: row.note,
    position: row.position,
    createdAt: row.created_at,
    // `null` quando a assinatura falhou: a tela mostra um aviso em vez de uma imagem quebrada.
    url: urlByPath.get(attachment.storage_path) ?? null,
  }));
}

/**
 * Caminho no Storage de UMA foto — uso interno das actions (para remover o arquivo).
 * Não é exportado para a UI de propósito.
 */
export async function getPhotoStoragePath(
  photoId: string,
): Promise<{ attachmentId: string; bucketId: string; storagePath: string } | null> {
  const supabase = await createClient();

  // Duas consultas em vez de embed — mesma razão de `getProgressPhotos`: a FK é composta e o
  // embed dependeria de inferência do PostgREST, que falharia só em runtime.
  const { data: photo } = await supabase
    .from("body_progress_photos")
    .select("attachment_id")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return null;

  const { data: attachment } = await supabase
    .from("attachments")
    .select("bucket_id,storage_path")
    .eq("id", photo.attachment_id)
    .maybeSingle();
  if (!attachment) return null;

  return {
    attachmentId: photo.attachment_id,
    bucketId: attachment.bucket_id,
    storagePath: attachment.storage_path,
  };
}

/* ═══════════════════════════ Pacote da tela ═══════════════════════════ */

export type BodyOverview = {
  types: MeasurementType[];
  measurements: MeasurementWithType[];
  goals: MeasurementGoal[];
  photos: SignedProgressPhoto[];
};

/**
 * Tudo que a tela de medidas precisa, em quatro consultas paralelas.
 *
 * As medições vêm SEM recorte de data: os gráficos de evolução comparam o valor atual com o
 * inicial, e cortar o histórico faria "valor inicial" significar "o mais antigo que coube na
 * tela" — que é uma resposta diferente da pergunta.
 */
export async function getBodyOverview(userId: string): Promise<BodyOverview> {
  await ensureMeasurementTypes(userId);

  const [types, measurements, goals, photos] = await Promise.all([
    getMeasurementTypes(),
    getMeasurements(),
    getMeasurementGoals(),
    getProgressPhotos(),
  ]);

  return { types, measurements, goals, photos };
}