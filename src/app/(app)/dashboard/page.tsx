import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { getDashboardLayout } from "@/lib/dashboard/settings";
import { asPeriod, asView, resolveWindow, urlDoDashboard } from "@/lib/dashboard/period";
import { type DashCardId } from "@/lib/dashboard/cards";
import { horaDeBrasiliaAgora, hojeISO } from "@/lib/format";
import { getDisplayName } from "@/lib/settings/queries";
import { rotuloDeHoje } from "@/lib/dashboard/rotulos";
import { COOKIE_DO_OLHO, valoresOcultos } from "@/lib/painel/olho";
import { FRASES_DO_BANNER, fraseDoDia, saudacaoPara } from "@/lib/painel/saudacao";
import { BannerDeBoasVindas } from "@/components/shared/painel/banner-de-boas-vindas";
import { LimiteDoBloco } from "@/components/dashboard/general/limite-do-bloco";
import { ResumoFinanceiro } from "@/components/dashboard/general/resumo-financeiro";
import { GeneralDashboard } from "./general-dashboard-client";
import { CardBodySkeleton } from "@/components/dashboard/general/card-skeleton";
import { FinanceCard } from "@/components/dashboard/general/finance-card";
import { InvoicesCard } from "@/components/dashboard/general/invoices-card";
import { AgendaCard } from "@/components/dashboard/general/agenda-card";
import { TasksCard } from "@/components/dashboard/general/tasks-card";
import { TodoCard } from "@/components/dashboard/general/todo-card";
import { HabitsCard } from "@/components/dashboard/general/habits-card";
import { StudiesCard } from "@/components/dashboard/general/studies-card";
import { NutritionCard } from "@/components/dashboard/general/nutrition-card";
import { TrainingCard } from "@/components/dashboard/general/training-card";
import { NotificationsCard } from "@/components/dashboard/general/notifications-card";
// ⛔ 18-E — o card SÓ LÊ. Ele importa `insight-queries` (a metade leitura) e não alcança o
// runner nem a Server Action: "o dashboard não chama a IA no carregamento" é teste de import.
import { InsightsCard } from "@/components/dashboard/general/insights-card";
import { timeInSaoPaulo } from "@/lib/format";

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
  // O olho dos valores é do aparelho (cookie); o nome do banner nunca lança.
  const [layout, nome, cookieDoOlho] = await Promise.all([
    getDashboardLayout(),
    getDisplayName(),
    cookies().then((c) => c.get(COOKIE_DO_OLHO)?.value),
  ]);
  const ocultos = valoresOcultos(cookieDoOlho);

  const now = new Date();
  const todayIso = hojeISO();
  // Minutos desde a meia-noite EM BRASÍLIA (o status "pendente" da refeição é derivado da
  // hora). `now.getHours()` devolveria a hora do processo — em UTC, o almoço "atrasaria" às 9h.
  const [horaSp, minutoSp] = timeInSaoPaulo(now).split(":").map(Number);
  const minutosAgora = (horaSp || 0) * 60 + (minutoSp || 0);

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

  // C3: o "Tentar de novo" dos cards volta para a MESMA URL (com o período da URL), não /dashboard puro.
  const hrefDeNovo = urlDoDashboard({
    periodo: str(sp.periodo),
    visao: str(sp.visao),
    de: str(sp.de),
    ate: str(sp.ate),
  });

  // Cada card renderiza no servidor com seu próprio Suspense/skeleton (stream por card).
  const contentById: Record<DashCardId, React.ReactNode> = {
    financeiro: (
      <LimiteDoBloco nome="os dados de Financeiro">
        <Suspense fallback={<CardBodySkeleton lines={5} />}>
          <FinanceCard window={window} todayIso={todayIso} hrefDeNovo={hrefDeNovo} />
        </Suspense>
      </LimiteDoBloco>
    ),
    todo: (
      <LimiteDoBloco nome="os dados de TO-DO">
        <Suspense fallback={<CardBodySkeleton lines={5} />}>
          <TodoCard todayIso={todayIso} />
        </Suspense>
      </LimiteDoBloco>
    ),
    faturas: (
      <LimiteDoBloco nome="os dados de Cartões & Faturas">
        <Suspense fallback={<CardBodySkeleton lines={4} />}>
          <InvoicesCard todayIso={todayIso} hrefDeNovo={hrefDeNovo} />
        </Suspense>
      </LimiteDoBloco>
    ),
    agenda: (
      <LimiteDoBloco nome="os dados de Agenda">
        <Suspense fallback={<CardBodySkeleton lines={4} />}>
          <AgendaCard window={window} now={now} />
        </Suspense>
      </LimiteDoBloco>
    ),
    dieta: (
      <LimiteDoBloco nome="os dados de Dieta e Alimentação">
        <Suspense fallback={<CardBodySkeleton lines={5} />}>
          <NutritionCard todayIso={todayIso} minutosAgora={minutosAgora} />
        </Suspense>
      </LimiteDoBloco>
    ),
    tarefas: (
      <LimiteDoBloco nome="os dados de Tarefas & Rotinas">
        <Suspense fallback={<CardBodySkeleton lines={4} />}>
          <TasksCard todayIso={todayIso} />
        </Suspense>
      </LimiteDoBloco>
    ),
    habitos: (
      <LimiteDoBloco nome="os dados de Hábitos">
        <Suspense fallback={<CardBodySkeleton lines={4} />}>
          <HabitsCard window={window} todayIso={todayIso} />
        </Suspense>
      </LimiteDoBloco>
    ),
    estudos: (
      <LimiteDoBloco nome="os dados de Estudos">
        <Suspense fallback={<CardBodySkeleton lines={4} />}>
          <StudiesCard window={window} todayIso={todayIso} />
        </Suspense>
      </LimiteDoBloco>
    ),
    notificacoes: (
      <LimiteDoBloco nome="os dados de Notificações">
        <Suspense fallback={<CardBodySkeleton lines={3} />}>
          <NotificationsCard hrefDeNovo={hrefDeNovo} />
        </Suspense>
      </LimiteDoBloco>
    ),
    treinos: (
      <LimiteDoBloco nome="os dados de Treinos">
        <Suspense fallback={<CardBodySkeleton lines={5} />}>
          <TrainingCard todayIso={todayIso} />
        </Suspense>
      </LimiteDoBloco>
    ),
    insights: (
      <LimiteDoBloco nome="os dados de Insights da IA">
        <Suspense fallback={<CardBodySkeleton lines={4} />}>
          <InsightsCard />
        </Suspense>
      </LimiteDoBloco>
    ),
  };

  const banner = (
    <BannerDeBoasVindas
      saudacao={saudacaoPara(horaDeBrasiliaAgora())}
      nome={nome}
      linha="Aqui está um resumo da sua vida em um só lugar."
      frase={fraseDoDia(todayIso, FRASES_DO_BANNER)}
    />
  );

  const faixa = (
    <LimiteDoBloco nome="o resumo financeiro">
      <Suspense fallback={<CardBodySkeleton lines={3} />}>
        <ResumoFinanceiro mes={window.mes} hoje={todayIso} ocultos={ocultos} hrefDeNovo={hrefDeNovo} />
      </Suspense>
    </LimiteDoBloco>
  );

  const [anoRef, mesRef] = window.mes.split("-").map(Number);
  const mesPorExtenso = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(anoRef, mesRef - 1, 1),
  );
  const subtituloById: Partial<Record<DashCardId, string>> = {
    todo: rotuloDeHoje(todayIso),
    dieta: rotuloDeHoje(todayIso),
    tarefas: rotuloDeHoje(todayIso),
    habitos: rotuloDeHoje(todayIso),
    financeiro: `${mesPorExtenso} · competência`,
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
        banner={banner}
        faixa={faixa}
        subtituloById={subtituloById}
      />
    </div>
  );
}
