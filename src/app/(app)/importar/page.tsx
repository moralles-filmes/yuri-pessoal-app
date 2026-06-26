import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import {
  getAccounts,
  getCategories,
  getCreditCards,
  getImportBatch,
  getImportBatches,
  getImportRows,
} from "@/lib/finance/queries";
import { ImportUpload } from "./import-upload";
import { ImportHistory } from "./import-history";
import { ImportReview } from "./import-review";

export const metadata: Metadata = { title: "Importar" };
export const dynamic = "force-dynamic";

export default async function ImportarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const batchId = typeof sp.batch === "string" ? sp.batch : undefined;

  if (batchId) {
    const batch = await getImportBatch(batchId);
    if (batch) {
      const [rows, categories] = await Promise.all([
        getImportRows(batchId),
        getCategories(),
      ]);
      return (
        <div className="space-y-6">
          <PageHeader
            title="Importar"
            description="Revise as linhas detectadas antes de criar os lançamentos."
          />
          <ImportReview
            key={batch.id}
            batch={batch}
            rows={rows}
            categories={categories.map((c) => ({
              id: c.id,
              name: c.name,
              color: c.color,
            }))}
          />
        </div>
      );
    }
  }

  const [batches, cards, accounts] = await Promise.all([
    getImportBatches(),
    getCreditCards(),
    getAccounts(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar"
        description="Importe faturas de cartão e extratos de conta em Excel, CSV e OFX. Cada linha vira um lançamento normal — com categoria, fatura e edição completa."
      />
      <ImportUpload
        cards={cards
          .filter((c) => c.ativo)
          .map((c) => ({ id: c.id, nome: c.nome }))}
        accounts={accounts
          .filter((a) => a.is_active)
          .map((a) => ({ id: a.id, name: a.name }))}
      />
      <ImportHistory batches={batches} />
    </div>
  );
}
