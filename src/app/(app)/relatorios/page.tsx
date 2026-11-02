import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { getReportsData } from "@/lib/reports/queries";
import { mesDe } from "@/lib/finance/dashboard";
import { baseDaUrl } from "@/lib/finance/base";
import { responsabilidadeDaUrl } from "@/lib/finance/responsabilidade";
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
  // O caixa é montado dentro do relatório, onde as entradas do motor já foram lidas.
  // 04-A2: a responsabilidade e os recortes (conta, cartão, pessoa, categoria) vêm da URL; quem os
  // valida contra a lista do dono é a leitura (`recorteDaUrl`), não a página.
  const data = await getReportsData(mesSel, base, { resp: responsabilidadeDaUrl(sp.resp), sp });
  const caixa = data.caixa;

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
