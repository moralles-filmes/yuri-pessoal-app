import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { getReportsData } from "@/lib/reports/queries";
import { mesDe } from "@/lib/finance/dashboard";
import { estadoDoCaixa } from "@/lib/finance/caixa-leitura";
import { baseDaUrl } from "@/lib/finance/base";
import { hojeISO } from "@/lib/format";
import { RelatoriosClient } from "./relatorios-client";

export const metadata: Metadata = { title: "Relatórios" };
export const dynamic = "force-dynamic";

function str(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const hoje = hojeISO();
  const mesAtual = mesDe(hoje);
  const mesSel = (() => {
    const v = str(sp.mes);
    return v && /^\d{4}-\d{2}$/.test(v) ? v : mesAtual;
  })();

  const base = baseDaUrl(sp.base);
  const caixa = base === "caixa" ? await estadoDoCaixa(mesSel, hoje) : null;

  const data = await getReportsData(mesSel);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios e análises"
        description="Visão consolidada de finanças, cartões, hábitos, estudos e tarefas — com gráficos, filtros e exportação."
      />
      <RelatoriosClient data={data} base={base} caixa={caixa} />
    </div>
  );
}
