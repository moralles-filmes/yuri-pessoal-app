import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hojeISO } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";
import { getBodyOverview } from "@/lib/body/queries";
import { MeasurementsClient } from "./measurements-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Medidas e evolução · Dieta" };

/**
 * Fase 16-E — Medidas corporais (MÓDULO CENTRAL `body_*`).
 *
 * Server Component. Dois cuidados:
 *
 * • `hoje` é resolvido AQUI, em Brasília (`hojeISO`), e desce como prop. Se o cliente
 *   calculasse, "últimos 30 dias" mudaria conforme o fuso do aparelho.
 *
 * • As FOTOS já chegam com URL assinada de vida curta, gerada nesta requisição
 *   (`getProgressPhotos`). O caminho no Storage não sai do servidor.
 *
 * A rota vive sob `/nutricao` porque é onde a 16-E a entrega, mas os dados são do módulo
 * central: a Fase 17 vai ler as MESMAS tabelas por `src/lib/body/queries.ts`.
 */
export default async function MedidasPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; periodo?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const hoje = hojeISO();

  // Cria os 16 tipos padrão na primeira visita. Idempotente pelo unique (user_id, slug).
  const overview = await getBodyOverview(user.id);

  return (
    <MeasurementsClient
      hoje={hoje}
      types={overview.types}
      measurements={overview.measurements}
      goals={overview.goals}
      photos={overview.photos}
      selectedTypeId={params.tipo ?? null}
      period={params.periodo ?? "90"}
    />
  );
}