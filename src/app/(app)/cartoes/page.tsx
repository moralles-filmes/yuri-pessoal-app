import type { Metadata } from "next";
import { CreditCard, Wallet } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { getCreditCards } from "@/lib/finance/queries";
import { formatCurrency } from "@/lib/format";
import { CardsClient } from "./cards-client";

export const metadata: Metadata = { title: "Cartões" };
export const dynamic = "force-dynamic";

export default async function CartoesPage() {
  const cards = await getCreditCards();
  const ativos = cards.filter((c) => c.ativo);
  const limiteTotal = ativos.reduce((s, c) => s + (c.limite_total ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cartões"
        description="Cartões de crédito: limites, fechamento e vencimento."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Cartões ativos"
          value={String(ativos.length)}
          icon={CreditCard}
          hint={`${cards.length} no total`}
        />
        <StatCard
          label="Limite total (ativos)"
          value={formatCurrency(limiteTotal)}
          icon={Wallet}
        />
      </div>

      <CardsClient cards={cards} />
    </div>
  );
}
