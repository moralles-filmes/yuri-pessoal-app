import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { OlhoDosValores } from "@/components/shared/painel/olho-dos-valores";
import { ProximosMesesTela, mesPorExtenso } from "@/components/cartoes/proximos-meses";
import { mesDe, proximosMeses } from "@/lib/finance/dashboard";
import {
  HORIZONTES,
  horizonteDeMeses,
  montarProximosMeses,
} from "@/lib/finance/proximos-meses";
import {
  getCreditCards,
  getReceivablesByStatements,
  getStatements,
} from "@/lib/finance/queries";
import { hojeISO } from "@/lib/format";
import { COOKIE_DO_OLHO, valoresOcultos } from "@/lib/painel/olho";
import { cn } from "@/lib/utils";
import { MATERIAL_PILULA } from "@/components/ui/materiais";

export const metadata: Metadata = { title: "Próximos meses" };
export const dynamic = "force-dynamic";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * REDESIGN-05-C — Próximos meses da central de cartões. Nenhuma regra aqui: as leituras (que lançam
 * se vierem cortadas, e o `error.tsx` herdado responde) alimentam a função pura
 * `montarProximosMeses`, e a tela só formata. `?meses=` inválido vale 6.
 */
export default async function ProximosMesesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const hoje = hojeISO();
  const n = horizonteDeMeses(typeof sp.meses === "string" ? sp.meses : undefined);
  const mesAtual = mesDe(hoje);
  const meses = proximosMeses(mesAtual, n);

  // O olho dos valores é do aparelho (cookie): só o valor exato "1" oculta (`valoresOcultos`).
  const ocultos = valoresOcultos((await cookies()).get(COOKIE_DO_OLHO)?.value);

  const [cards, statements] = await Promise.all([getCreditCards(), getStatements()]);
  // Só os recebíveis das faturas que a grade PODE mostrar (competência dentro do horizonte);
  // mandar o histórico inteiro faria o `in(...)` crescer sem teto com os anos de faturas.
  const doHorizonte = statements.filter((s) => meses.includes(mesDe(s.competencia)));
  const receivables = await getReceivablesByStatements(doHorizonte.map((s) => s.id));
  const dados = montarProximosMeses({ hoje, n, cards, statements, receivables });

  const atrasadas = dados.atrasadasAntes;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <PageHeader
          title="Próximos meses"
          description={`As faturas de cada cartão nos próximos ${n} meses, das que já existem às que ainda não têm compra.`}
        />
        <p className="border-l-2 border-primary pl-2 text-xs text-muted-foreground">
          Por competência — o mês em que a fatura fecha. Clique numa fatura para abri-la em Faturas
          e pagamentos; nada é pago daqui.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <nav
          aria-label="Horizonte"
          className={`${MATERIAL_PILULA} inline-flex shrink-0 overflow-hidden rounded-full`}
        >
          {HORIZONTES.map((h) => (
            <Link
              key={h}
              href={`/cartoes/proximos-meses?meses=${h}`}
              aria-current={h === n ? "page" : undefined}
              className={cn(
                "border-r px-3 py-1.5 text-sm whitespace-nowrap last:border-r-0 hover:bg-muted/50",
                h === n && "bg-primary/10 font-semibold text-foreground",
              )}
            >
              {h} meses
            </Link>
          ))}
        </nav>
        <span className="min-w-0 text-xs text-muted-foreground">
          {mesPorExtenso(meses[0])} a {mesPorExtenso(meses[meses.length - 1])} ·{" "}
          {plural(dados.cartoes.length, "cartão", "cartões")}
        </span>
      </div>

      {atrasadas.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2.5 text-sm"
        >
          <span className="min-w-0">
            <b>
              {atrasadas.length === 1
                ? "1 fatura atrasada fica"
                : `${atrasadas.length} faturas atrasadas ficam`}
            </b>{" "}
            antes deste horizonte:{" "}
            {atrasadas.map((a) => `${a.cardNome} · ${mesPorExtenso(a.competencia)}`).join("; ")}.
          </span>
          <Link href="/cartoes" className="shrink-0 whitespace-nowrap text-primary hover:underline">
            Ver na Visão geral ›
          </Link>
        </div>
      )}

      <OlhoDosValores ocultoInicial={ocultos}>
        <ProximosMesesTela dados={dados} mesAtual={mesAtual} />
      </OlhoDosValores>
    </div>
  );
}
