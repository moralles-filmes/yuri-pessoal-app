import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import {
  getCategories,
  getCreditCards,
  getInstallmentPurchases,
} from "@/lib/finance/queries";
import { hojeISO } from "@/lib/format";
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

  const [purchases, cards, categories] = await Promise.all([
    getInstallmentPurchases({ cardId, categoryId }),
    getCreditCards(),
    getCategories(),
  ]);

  const today = hojeISO();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parcelamentos"
        description="Compras parceladas e a distribuição das parcelas nas faturas."
      />
      <InstallmentsClient
        purchases={purchases}
        cards={cards.map((c) => ({ id: c.id, name: c.nome }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        today={today}
        selectedCardId={cardId ?? null}
        selectedCategoryId={categoryId ?? null}
        status={str(sp.status) ?? null}
      />
    </div>
  );
}
