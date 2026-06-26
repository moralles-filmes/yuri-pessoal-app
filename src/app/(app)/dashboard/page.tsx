import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { getDashboardLayout } from "@/lib/dashboard/settings";
import { asPeriod, asView, resolveWindow } from "@/lib/dashboard/period";
import { type DashCardId } from "@/lib/dashboard/cards";
import { toDateInputValue } from "@/lib/format";
import { GeneralDashboard } from "./general-dashboard-client";
import { CardBodySkeleton } from "@/components/dashboard/general/card-skeleton";
import { FinanceCard } from "@/components/dashboard/general/finance-card";
import { InvoicesCard } from "@/components/dashboard/general/invoices-card";
import { AgendaCard } from "@/components/dashboard/general/agenda-card";
import { TasksCard } from "@/components/dashboard/general/tasks-card";
import { HabitsCard } from "@/components/dashboard/general/habits-card";
import { StudiesCard } from "@/components/dashboard/general/studies-card";
import { NotificationsCard } from "@/components/dashboard/general/notifications-card";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function str(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const layout = await getDashboardLayout();

  const now = new Date();
  const todayIso = toDateInputValue(now);

  const period = asPeriod(str(sp.periodo) ?? layout.period);
  const view = asView(str(sp.visao) ?? layout.view);
  const customFrom = str(sp.de) ?? "";
  const customTo = str(sp.ate) ?? "";
  const window = resolveWindow({
    period,
    today: todayIso,
    from: customFrom || null,
    to: customTo || null,
  });

  // Cada card renderiza no servidor com seu próprio Suspense/skeleton (stream por card).
  const contentById: Record<DashCardId, React.ReactNode> = {
    financeiro: (
      <Suspense fallback={<CardBodySkeleton lines={5} />}>
        <FinanceCard window={window} todayIso={todayIso} />
      </Suspense>
    ),
    faturas: (
      <Suspense fallback={<CardBodySkeleton lines={4} />}>
        <InvoicesCard todayIso={todayIso} />
      </Suspense>
    ),
    agenda: (
      <Suspense fallback={<CardBodySkeleton lines={4} />}>
        <AgendaCard window={window} now={now} />
      </Suspense>
    ),
    tarefas: (
      <Suspense fallback={<CardBodySkeleton lines={4} />}>
        <TasksCard todayIso={todayIso} />
      </Suspense>
    ),
    habitos: (
      <Suspense fallback={<CardBodySkeleton lines={4} />}>
        <HabitsCard window={window} todayIso={todayIso} />
      </Suspense>
    ),
    estudos: (
      <Suspense fallback={<CardBodySkeleton lines={4} />}>
        <StudiesCard window={window} todayIso={todayIso} />
      </Suspense>
    ),
    notificacoes: (
      <Suspense fallback={<CardBodySkeleton lines={3} />}>
        <NotificationsCard />
      </Suspense>
    ),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Sua vida em um só lugar — finanças, agenda, tarefas, hábitos e estudos."
      />
      <GeneralDashboard
        layout={layout}
        contentById={contentById}
        window={window}
        period={period}
        view={view}
        customFrom={customFrom}
        customTo={customTo}
      />
    </div>
  );
}
