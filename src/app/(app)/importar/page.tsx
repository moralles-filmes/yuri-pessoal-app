import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import {
  getAccounts,
  getCategories,
  getCreditCards,
  getImportBatch,
  getImportBatches,
  getImportRows,
  getPeopleForSelect,
  getSubcategories,
} from "@/lib/finance/queries";
import { AvisoDeTeto } from "@/components/shared/aviso-de-teto";
import { hojeISO } from "@/lib/format";
import { lerSituacoesDoReembolso } from "@/lib/finance/recebimentos-leitura";
import { ehErroDeLeitura } from "@/lib/supabase/leitura";
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
      // `accounts` só é usado no extrato (marcar linha como transferência), mas é buscado
      // sempre: a consulta é pequena e um `if` aqui ramificaria o Promise.all sem ganho.
      const [rows, categories, subcategories, people, contas, situacoesDoReembolso] =
        await Promise.all([
          getImportRows(batchId),
          getCategories(),
          getSubcategories(),
          getPeopleForSelect(),
          getAccounts(),
          // 04-C · T7 — o que cada pessoa deve, para a prévia do reembolso na revisão. Só o extrato
          // tem reembolso (estorno de cartão nunca abate dívida), então lote de cartão não lê nada.
          batch.origem === "cartao" ? Promise.resolve({}) : situacoesDasPessoas(),
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
              kind: c.kind,
            }))}
            // A inativa continua quando já está escolhida numa linha — senão o rótulo sumiria.
            subcategories={subcategories
              .filter(
                (s) =>
                  s.is_active ||
                  rows.some((r) => r.subcategoria_sugerida_id === s.id),
              )
              .map((s) => ({ id: s.id, name: s.name, category_id: s.category_id }))}
            people={people}
            situacoesDoReembolso={situacoesDoReembolso}
            // A conta ARQUIVADA continua na lista quando já é o destino de alguma linha: tirá-la
            // faria o chip da linha perder o nome e virar "outra conta".
            accounts={contas
              .filter(
                (a) =>
                  a.is_active ||
                  rows.some((r) => r.transfer_account_id === a.id),
              )
              .map((a) => ({ id: a.id, name: a.name }))}
            today={hojeISO()}
          />
        </div>
      );
    }
  }

  const [leituraDosLotes, cards, accounts] = await Promise.all([
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
      {/* Histórico é lista pura: o teto de 100 lotes vira aviso, não erro (K2, D-G5). */}
      <AvisoDeTeto leitura={leituraDosLotes} oQue="importações" />
      <ImportHistory batches={leituraDosLotes.linhas} />
    </div>
  );
}

/**
 * Quanto cada pessoa deve (e de saldo a favor), como objeto simples para cruzar a fronteira do
 * Server Component. Leitura que falha devolve `null`: a revisão escreve que não conseguiu ler no
 * lugar da prévia, e o resto da tela continua de pé — nunca "a pessoa não deve nada".
 */
async function situacoesDasPessoas(): Promise<Record<
  string,
  { devidoCentavos: number; saldoAFavorCentavos: number }
> | null> {
  try {
    return Object.fromEntries(await lerSituacoesDoReembolso());
  } catch (e) {
    if (!ehErroDeLeitura(e)) throw e;
    return null;
  }
}
