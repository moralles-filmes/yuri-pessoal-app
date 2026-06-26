import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCourseDetail } from "@/lib/studies/queries";
import { toDateInputValue } from "@/lib/format";
import { CourseDetailClient } from "./course-detail-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Curso" };

export default async function CoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const todayIso = toDateInputValue(new Date());
  const detail = await getCourseDetail(id, todayIso);
  if (!detail) notFound();

  return <CourseDetailClient detail={detail} todayIso={todayIso} />;
}
