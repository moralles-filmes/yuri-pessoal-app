import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PageHeader } from "@/components/shared/page-header";
import {
  getCategories,
  getCreditCards,
  getInstallmentPurchases,
  getPeopleForSelect,
} from "@/lib/finance/queries";
import { hojeISO } from "@/lib/format";
import { COOKIE_DO_OLHO, valoresOcultos } from "@/lib/painel/olho";
import { exigirCompleta } from "@/lib/supabase/leitura";
import { ROTULOS_DE_LEITURA } from "@/lib/finance/rotulos-de-leitura";
import { InstallmentsClient } from "./installments-client";

export const metadata: Metadata = { title: "Parcelamentos" };
export const dynamic = "force-dynamic";

function str(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}

export default async function ParcelamentosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const cardId = str(sp.card);
  const categoryId = str(sp.category);

  const [purchases, cards, categories, people] = await Promise.all([
    // A tela SOMA as compras (indicadores): lista cortada é erro, não total parcial (D-G5).
    getInstallmentPurchases({ cardId, categoryId }).then((l) =>
      exigirCompleta(l, ROTULOS_DE_LEITURA.comprasParceladas),
    ),
    getCreditCards(),
    getCategories(),
    getPeopleForSelect(),
  ]);

  const today = hojeISO();
  // O olho dos valores é do aparelho (cookie): só o valor exato "1" oculta (`valoresOcultos`).
  const ocultoInicial = valoresOcultos((await cookies()).get(COOKIE_DO_OLHO)?.value);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parcelamentos"
        description="Compras parceladas e a distribuição das parcelas nas faturas."
      />
      <p className="border-l-2 border-primary pl-2 text-xs text-muted-foreground">
        Valores das parcelas ainda ativas. Parcela cancelada sai da conta e leva a cobrança do
        terceiro junto.
      </p>
      <InstallmentsClient
        purchases={purchases}
        cards={cards.map((c) => ({ id: c.id, name: c.nome }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        people={people}
        today={today}
        selectedCardId={cardId ?? null}
        selectedCategoryId={categoryId ?? null}
        status={str(sp.status) ?? null}
        ocultoInicial={ocultoInicial}
      />
    </div>
  );
}
