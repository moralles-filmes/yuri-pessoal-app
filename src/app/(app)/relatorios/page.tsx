import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PageHeader } from "@/components/shared/page-header";
import { getReportsData } from "@/lib/reports/queries";
import { mesDe } from "@/lib/finance/dashboard";
import { baseDaUrl } from "@/lib/finance/base";
import { responsabilidadeDaUrl } from "@/lib/finance/responsabilidade";
import { hojeISO } from "@/lib/format";
import { mesDaUrl } from "@/lib/painel/detalhe-url";
import { COOKIE_DO_OLHO, valoresOcultos } from "@/lib/painel/olho";
import { RelatoriosClient } from "./relatorios-client";

export const metadata: Metadata = { title: "Relatórios" };
export const dynamic = "force-dynamic";

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const hoje = hojeISO();
  const mesAtual = mesDe(hoje);
  const mesSel = mesDaUrl(sp.mes, mesAtual);

  const base = baseDaUrl(sp.base);
  // O caixa é montado dentro do relatório (`data.financeiro.caixa`), onde as entradas do motor já foram lidas.
  // 04-A2: a responsabilidade e os recortes (conta, cartão, pessoa, categoria) vêm da URL; quem os
  // valida contra a lista do dono é a leitura (`recorteDaUrl`), não a página.
  const data = await getReportsData(mesSel, base, { resp: responsabilidadeDaUrl(sp.resp), sp });

  // O olho dos valores é do aparelho (cookie), o MESMO do painel (D-A2-8): só o valor exato "1"
  // oculta (`valoresOcultos`). Lido aqui, no servidor, para a primeira pintura já vir certa.
  const ocultos = valoresOcultos((await cookies()).get(COOKIE_DO_OLHO)?.value);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios e análises"
        description="Visão consolidada de finanças, cartões, hábitos, estudos e tarefas — com gráficos, filtros e exportação."
      />
      <RelatoriosClient data={data} valoresOcultos={ocultos} />
    </div>
  );
}
