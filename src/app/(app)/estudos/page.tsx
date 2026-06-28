import type { Metadata } from "next";
import { getStudyDashboard } from "@/lib/studies/queries";
import { STUDY_VIEWS, type StudyView } from "@/lib/studies/constants";
import { hojeISO } from "@/lib/format";
import { StudiesClient } from "./studies-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Estudos" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function EstudosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const viewRaw = first(sp.view);
  const view: StudyView = (STUDY_VIEWS as readonly string[]).includes(
    viewRaw ?? "",
  )
    ? (viewRaw as StudyView)
    : "painel";

  const todayIso = hojeISO();
  const dashboard = await getStudyDashboard(todayIso);

  return <StudiesClient dashboard={dashboard} view={view} todayIso={todayIso} />;
}
