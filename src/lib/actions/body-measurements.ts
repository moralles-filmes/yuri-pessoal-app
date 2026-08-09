"use server";

/**
 * Fase 16-E — Módulo central de medidas corporais · Server Actions.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ O UPLOAD DE FOTO É A OPERAÇÃO MAIS SENSÍVEL DE TODO O SISTEMA.                      ║
 * ║                                                                                       ║
 * ║ O BINÁRIO PASSA PELO SERVIDOR — de propósito. Deixar o navegador subir direto para o   ║
 * ║ Storage seria mais rápido, mas o servidor nunca veria o arquivo, e "validar tipo e     ║
 * ║ tamanho no servidor" viraria uma frase sem implementação. Aqui o `File` real é         ║
 * ║ inspecionado ANTES de existir qualquer objeto no bucket.                               ║
 * ║                                                                                       ║
 * ║ Quatro travas, todas necessárias:                                                      ║
 * ║  1. MIME e tamanho conferidos no servidor (`photoFileSchema`), sobre o arquivo real.   ║
 * ║  2. NOME ALEATÓRIO (`crypto.randomUUID`) — o nome enviado pelo cliente é descartado.   ║
 * ║     Nome previsível + bucket privado ainda é um convite; nome aleatório não é adivinhado║
 * ║     nem por quem já viu outro caminho.                                                 ║
 * ║  3. A pasta é SEMPRE `{auth.getUser().id}/…` — nunca um caminho vindo do formulário.   ║
 * ║     A policy de storage.objects (Fase 14) recusaria de qualquer jeito, mas a action    ║
 * ║     não depende disso para estar certa.                                                ║
 * ║  4. Falha ao gravar o metadado REMOVE o arquivo — nada de órfão anônimo no bucket.     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Este arquivo é do MÓDULO CENTRAL: a Fase 17 (Treinos) deve chamar estas actions em vez de
 * criar gravação própria de peso corporal.
 */
import { revalidatePath } from "next/cache";
import { conferirFotoPelosBytes } from "@/lib/files/photo-guard";
import { authContext, dbError, invalid, notAuthed, type AuthContext } from "@/lib/actions/helpers";
import {
  PHOTO_BUCKET,
  PHOTO_ENTITY_TYPE,
  PHOTO_EXTENSION_BY_MIME,
  PHOTO_SIGNED_URL_TTL_SECONDS,
} from "@/lib/body/constants";
import { getPhotoStoragePath } from "@/lib/body/queries";
import { NUTRITION_BASE_PATH } from "@/lib/nutrition/constants";
import {
  deleteMeasurementTypeSchema,
  measurementBatchSchema,
  measurementBulkSchema,
  measurementGoalSchema,
  measurementGoalStatusSchema,
  measurementSchema,
  measurementTypeSchema,
  measurementTypesReorderSchema,
  photoFileSchema,
  progressPhotoSchema,
  progressPhotoUpdateSchema,
} from "@/lib/validators/body";
import type { ActionResult } from "@/types/finance";

const MEASURES_PATH = `${NUTRITION_BASE_PATH}/medidas`;

function revalidateBody() {
  revalidatePath(NUTRITION_BASE_PATH);
  revalidatePath(MEASURES_PATH);
  revalidatePath(`${NUTRITION_BASE_PATH}/relatorios`);
  // O módulo é CENTRAL: quando a Fase 17 consumir `body_*`, as telas de treino também
  // precisam revalidar. O caminho já fica registrado para não ser esquecido lá.
  revalidatePath("/treinos");
}

/**
 * Slug a partir do nome, para o unique (user_id, slug).
 *
 * A normalização tira acento PRESERVANDO o resto — é o mesmo cuidado do parser do TO-DO.
 * Colisão não é resolvida com sufixo numérico de propósito: dois tipos chamados "Cintura"
 * seriam dois gráficos de cintura, e o usuário merece o erro em vez do duplicado silencioso.
 */
function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/* ═══════════════════════════ Tipos de medida ═══════════════════════════ */

export async function saveMeasurementType(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = measurementTypeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const payload = {
    name: d.name,
    unit: d.unit,
    category: d.category,
    side: d.side,
    decimals: d.decimals,
    is_active: d.isActive,
    note: d.note,
  };

  if (d.id) {
    // O slug NÃO é regravado na edição: ele é a identidade estável do tipo, e outros módulos
    // (o peso, lido pela Fase 17) o referenciam. Renomear "Peso" para "Massa" não pode
    // quebrar quem procura por `slug = 'peso'`.
    const { error } = await ctx.supabase
      .from("body_measurement_types")
      .update(payload)
      .eq("id", d.id);
    if (error) return dbError("Não foi possível salvar a medida.");
    revalidateBody();
    return { ok: true, data: { id: d.id } };
  }

  const slug = slugify(d.name) || `medida_${Date.now()}`;

  // Select-then-insert em vez de upsert: o erro de duplicado precisa virar mensagem de campo,
  // e não um 23505 cru na tela.
  const { data: existing } = await ctx.supabase
    .from("body_measurement_types")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existing) {
    return invalid({ name: ["Já existe uma medida com esse nome."] });
  }

  const { count } = await ctx.supabase
    .from("body_measurement_types")
    .select("id", { count: "exact", head: true });

  const { data, error } = await ctx.supabase
    .from("body_measurement_types")
    .insert({ ...payload, user_id: ctx.userId, slug, position: count ?? 0, is_default: false })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível criar a medida.");
  revalidateBody();
  return { ok: true, data: { id: data.id } };
}

export async function reorderMeasurementTypes(input: unknown): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = measurementTypesReorderSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  for (const [index, id] of parsed.data.ids.entries()) {
    const { error } = await ctx.supabase
      .from("body_measurement_types")
      .update({ position: index })
      .eq("id", id);
    if (error) return dbError("Não foi possível reordenar.");
  }

  revalidateBody();
  return { ok: true, data: undefined };
}

/**
 * Exclui um tipo — NUNCA em silêncio.
 *
 * `type_id` em `body_measurements` é `on delete restrict`: o banco recusaria apagar um tipo
 * com histórico. Em vez de devolver o erro do Postgres, a action pergunta antes (o schema não
 * tem default) e faz o que o usuário escolheu.
 */
export async function deleteMeasurementType(input: unknown): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = deleteMeasurementTypeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { id, onMeasurements } = parsed.data;

  if (onMeasurements === "desativar_tipo") {
    const { error } = await ctx.supabase
      .from("body_measurement_types")
      .update({ is_active: false })
      .eq("id", id);
    if (error) return dbError("Não foi possível desativar a medida.");
    revalidateBody();
    return { ok: true, data: undefined };
  }

  // Escolha explícita de apagar o histórico junto. As medições saem primeiro por causa do
  // restrict; as metas caem por cascade.
  const { error: measurementsError } = await ctx.supabase
    .from("body_measurements")
    .delete()
    .eq("type_id", id);
  if (measurementsError) return dbError("Não foi possível excluir o histórico da medida.");

  const { error } = await ctx.supabase.from("body_measurement_types").delete().eq("id", id);
  if (error) return dbError("Não foi possível excluir a medida.");

  revalidateBody();
  return { ok: true, data: undefined };
}

/* ═══════════════════════════ Medições ═══════════════════════════ */

/**
 * A UNIDADE VEM DO TIPO, NO SERVIDOR — nunca do formulário.
 *
 * É o que impede gravar "80 cm" numa linha de peso. E, uma vez gravada, a unidade da linha
 * não muda: trocar a unidade do tipo depois não reescreve o histórico.
 */
async function unitForType(
  supabase: AuthContext["supabase"],
  typeId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("body_measurement_types")
    .select("unit")
    .eq("id", typeId)
    .maybeSingle();
  return data?.unit ?? null;
}

export async function saveMeasurement(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = measurementSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const unit = await unitForType(ctx.supabase, d.typeId);
  // A RLS já garante que o tipo é do usuário; nulo aqui significa "não existe ou não alcança".
  if (!unit) return invalid({ typeId: ["Medida não encontrada."] });

  const payload = {
    type_id: d.typeId,
    measured_on: d.measuredOn,
    measured_at: d.measuredAt,
    value: d.value,
    condition: d.condition,
    note: d.note,
  };

  if (d.id) {
    // A unidade NÃO é regravada na edição: corrigir o valor de uma medição antiga não pode
    // trocar a unidade sob a qual ela foi feita.
    const { error } = await ctx.supabase.from("body_measurements").update(payload).eq("id", d.id);
    if (error) return dbError("Não foi possível salvar a medição.");
    revalidateBody();
    return { ok: true, data: { id: d.id } };
  }

  const { data, error } = await ctx.supabase
    .from("body_measurements")
    .insert({ ...payload, user_id: ctx.userId, unit, source: "manual" })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível registrar a medição.");
  revalidateBody();
  return { ok: true, data: { id: data.id } };
}

/** Registro de várias medidas na mesma sessão (fita métrica na mão). */
export async function saveMeasurementBatch(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = measurementBatchSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const typeIds = [...new Set(d.values.map((item) => item.typeId))];
  const { data: types } = await ctx.supabase
    .from("body_measurement_types")
    .select("id,unit")
    .in("id", typeIds);

  const unitById = new Map((types ?? []).map((type) => [type.id, type.unit]));
  const rows = d.values
    .filter((item) => unitById.has(item.typeId))
    .map((item) => ({
      user_id: ctx.userId,
      type_id: item.typeId,
      measured_on: d.measuredOn,
      measured_at: d.measuredAt,
      value: item.value,
      unit: unitById.get(item.typeId) as string,
      condition: d.condition,
      note: d.note,
      source: "manual",
    }));

  if (rows.length === 0) return invalid({ values: ["Nenhuma medida válida."] });

  const { error } = await ctx.supabase.from("body_measurements").insert(rows);
  if (error) return dbError("Não foi possível registrar as medições.");

  revalidateBody();
  return { ok: true, data: { count: rows.length } };
}

/** Duplica uma medição para hoje — atalho de quem mede sempre as mesmas coisas. */
export async function duplicateMeasurement(
  id: string,
  measuredOn: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: source } = await ctx.supabase
    .from("body_measurements")
    .select("type_id,value,unit,condition,note")
    .eq("id", id)
    .maybeSingle();
  if (!source) return dbError("Medição não encontrada.");

  const { data, error } = await ctx.supabase
    .from("body_measurements")
    .insert({
      user_id: ctx.userId,
      type_id: source.type_id,
      measured_on: measuredOn,
      // A unidade vem da linha ORIGINAL, congelada: a cópia herda a mesma base de comparação.
      unit: source.unit,
      value: source.value,
      condition: source.condition,
      note: source.note,
      source: "manual",
    })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível duplicar a medição.");
  revalidateBody();
  return { ok: true, data: { id: data.id } };
}

export async function deleteMeasurement(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase.from("body_measurements").delete().eq("id", id);
  if (error) return dbError("Não foi possível excluir a medição.");

  revalidateBody();
  return { ok: true, data: undefined };
}

/** Exclusão em massa. A RLS recorta por usuário; o `in` não alcança linha de terceiro. */
export async function deleteMeasurements(input: unknown): Promise<ActionResult<{ count: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = measurementBulkSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { error, count } = await ctx.supabase
    .from("body_measurements")
    .delete({ count: "exact" })
    .in("id", parsed.data.ids);

  if (error) return dbError("Não foi possível excluir as medições.");
  revalidateBody();
  return { ok: true, data: { count: count ?? 0 } };
}

/* ═══════════════════════════ Metas ═══════════════════════════ */

export async function saveMeasurementGoal(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = measurementGoalSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const unit = await unitForType(ctx.supabase, d.typeId);
  if (!unit) return invalid({ typeId: ["Medida não encontrada."] });

  const payload = {
    type_id: d.typeId,
    direction: d.direction,
    // NULO preservado: significa "use a primeira medida do período". Nunca 0.
    start_value: d.startValue,
    target_value: d.targetValue,
    starts_on: d.startsOn,
    target_date: d.targetDate,
    note: d.note,
  };

  if (d.id) {
    const { error } = await ctx.supabase
      .from("body_measurement_goals")
      .update(payload)
      .eq("id", d.id);
    if (error) return dbError("Não foi possível salvar a meta.");
    revalidateBody();
    return { ok: true, data: { id: d.id } };
  }

  const { data, error } = await ctx.supabase
    .from("body_measurement_goals")
    .insert({ ...payload, user_id: ctx.userId, unit, status: "ativa" })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível criar a meta.");
  revalidateBody();
  return { ok: true, data: { id: data.id } };
}

/**
 * Muda o status da meta.
 *
 * Só os quatro graváveis passam pelo schema — `atingida` e `prazo_vencido` são derivados na
 * leitura e nem existem no CHECK do banco.
 */
export async function setMeasurementGoalStatus(input: unknown): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = measurementGoalStatusSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { error } = await ctx.supabase
    .from("body_measurement_goals")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id);

  if (error) return dbError("Não foi possível atualizar a meta.");
  revalidateBody();
  return { ok: true, data: undefined };
}

export async function deleteMeasurementGoal(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase.from("body_measurement_goals").delete().eq("id", id);
  if (error) return dbError("Não foi possível excluir a meta.");

  revalidateBody();
  return { ok: true, data: undefined };
}

/* ═══════════════════════════ Fotos de evolução ═══════════════════════════ */

/**
 * Envia uma foto de evolução.
 *
 * Recebe `FormData` porque o BINÁRIO PRECISA PASSAR PELO SERVIDOR — ver o bloco no topo do
 * arquivo. A ordem das operações não é arbitrária:
 *
 *   valida metadados → valida o ARQUIVO → sobe com nome aleatório → grava `attachments`
 *   → grava `body_progress_photos`
 *
 * e cada passo que falha desfaz o anterior. O pior resultado possível aqui seria um arquivo
 * de corpo no bucket sem dono registrado; a limpeza em cascata existe para isso.
 */
export async function uploadProgressPhoto(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = progressPhotoSchema.safeParse({
    takenOn: formData.get("takenOn"),
    angle: formData.get("angle"),
    weightKg: formData.get("weightKg"),
    note: formData.get("note"),
  });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  // ⛔ TRAVA 1 — o arquivo REAL, no servidor. MIME e bytes, não a extensão do nome.
  const fileResult = photoFileSchema.safeParse(formData.get("file"));
  if (!fileResult.success) {
    return invalid({ file: fileResult.error.issues.map((issue) => issue.message) });
  }
  const file = fileResult.data;

  /**
   * ⛔ TRAVA 1-B — O QUE O ARQUIVO É, PELOS BYTES. (Retroporte da 18-D, 2026-08-09.)
   *
   * `photoFileSchema` confere `file.type`, e `file.type` é DECLARADO PELO CLIENTE: o
   * navegador o deriva da extensão do nome. Renomear qualquer arquivo para `foto.jpg`
   * produzia um `File` com `type: "image/jpeg"` que passava — e o conteúdo ia para o bucket
   * privado com um MIME mentiroso gravado no metadado.
   *
   * Daqui para baixo, o MIME usado é o DETECTADO — nunca mais o declarado.
   */
  const veredito = await conferirFotoPelosBytes(file);
  if (!veredito.ok) return invalid({ file: [veredito.mensagem] });
  const mimeReal = veredito.mime;

  // ⛔ TRAVAS 2 e 3 — nome aleatório, dentro da pasta do próprio usuário. Nada do que o
  // cliente mandou (nem o nome original) entra na composição do caminho.
  const extension = PHOTO_EXTENSION_BY_MIME[mimeReal] ?? "bin";
  const photoId = crypto.randomUUID();
  const storagePath = `${ctx.userId}/${PHOTO_ENTITY_TYPE}/${photoId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await ctx.supabase.storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, file, {
      // O MIME que vai para o Storage é o DETECTADO, nunca o declarado.
      contentType: mimeReal,
      upsert: false,
      // Cache privado: mesmo com URL assinada, nenhum intermediário deve guardar a imagem.
      cacheControl: "private, max-age=0, no-store",
    });
  if (uploadError) return dbError("Não foi possível enviar a foto.");

  const { data: attachment, error: attachmentError } = await ctx.supabase
    .from("attachments")
    .insert({
      user_id: ctx.userId,
      entity_type: PHOTO_ENTITY_TYPE,
      entity_id: photoId,
      bucket_id: PHOTO_BUCKET,
      storage_path: storagePath,
      file_name: file.name.slice(0, 200),
      mime_type: mimeReal,
      size_bytes: file.size,
    })
    .select("id")
    .single();

  if (attachmentError || !attachment) {
    // ⛔ TRAVA 4 — sem metadado, o arquivo não fica no bucket.
    await ctx.supabase.storage.from(PHOTO_BUCKET).remove([storagePath]);
    return dbError("Não foi possível registrar a foto.");
  }

  const { data, error } = await ctx.supabase
    .from("body_progress_photos")
    .insert({
      id: photoId,
      user_id: ctx.userId,
      attachment_id: attachment.id,
      taken_on: d.takenOn,
      angle: d.angle,
      weight_kg: d.weightKg,
      note: d.note,
    })
    .select("id")
    .single();

  if (error || !data) {
    await ctx.supabase.storage.from(PHOTO_BUCKET).remove([storagePath]);
    await ctx.supabase.from("attachments").delete().eq("id", attachment.id);
    return dbError("Não foi possível salvar a foto.");
  }

  revalidateBody();
  return { ok: true, data: { id: data.id } };
}

/** Edita só os metadados. Trocar a imagem é excluir e enviar outra — sem sobrescrita. */
export async function updateProgressPhoto(input: unknown): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = progressPhotoUpdateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const { error } = await ctx.supabase
    .from("body_progress_photos")
    .update({ taken_on: d.takenOn, angle: d.angle, weight_kg: d.weightKg, note: d.note })
    .eq("id", d.id);

  if (error) return dbError("Não foi possível salvar a foto.");
  revalidateBody();
  return { ok: true, data: undefined };
}

/**
 * Exclui a foto: o ARQUIVO primeiro, depois o metadado.
 *
 * Nessa ordem porque um arquivo de corpo que sobrevive ao registro é pior que um registro
 * órfão — o primeiro é dado sensível esquecido no bucket, o segundo é uma linha inútil.
 * `body_progress_photos.attachment_id` é `on delete cascade`, então apagar o anexo apaga o
 * registro junto.
 */
export async function deleteProgressPhoto(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const reference = await getPhotoStoragePath(id);
  if (reference) {
    try {
      await ctx.supabase.storage.from(reference.bucketId).remove([reference.storagePath]);
    } catch {
      // Segue removendo os metadados: o registro apontando para arquivo inexistente é o
      // resultado menos ruim se o Storage falhar.
    }
    const { error } = await ctx.supabase.from("attachments").delete().eq("id", reference.attachmentId);
    if (error) return dbError("Não foi possível excluir a foto.");
  } else {
    const { error } = await ctx.supabase.from("body_progress_photos").delete().eq("id", id);
    if (error) return dbError("Não foi possível excluir a foto.");
  }

  revalidateBody();
  return { ok: true, data: undefined };
}

/**
 * URL assinada de UMA foto, sob demanda (abrir em tamanho cheio).
 *
 * Vale `PHOTO_SIGNED_URL_TTL_SECONDS` (5 min) e é gerada agora — não existe função neste
 * módulo que devolva um link permanente, e é assim que deve continuar.
 */
export async function getProgressPhotoUrl(id: string): Promise<ActionResult<{ url: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const reference = await getPhotoStoragePath(id);
  if (!reference) return dbError("Foto não encontrada.");

  const { data, error } = await ctx.supabase.storage
    .from(reference.bucketId)
    .createSignedUrl(reference.storagePath, PHOTO_SIGNED_URL_TTL_SECONDS);

  if (error || !data) return dbError("Não foi possível abrir a foto.");
  return { ok: true, data: { url: data.signedUrl } };
}