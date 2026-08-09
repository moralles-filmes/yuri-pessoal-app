import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  ImageIcon,
  Info,
  Lock,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { ReceiptUpload } from "@/components/ai/receipt-upload";
import { ReceiptExtractButton } from "@/components/ai/receipt-extract-button";
import { ReceiptReview } from "@/components/ai/receipt-review";
import { getCurrentUser } from "@/lib/supabase/server";
import { getAiPreferences } from "@/lib/ai/queries";
import { getComprovante, getComprovantes } from "@/lib/ai/server/document-queries";
import { alertasDeDuplicidade } from "@/lib/ai/vision/duplicates";
import {
  getAccounts,
  getCategories,
  getCreditCards,
  getPeopleForSelect,
  getTransactionsForReceiptMatch,
} from "@/lib/finance/queries";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Comprovantes · IA" };
export const dynamic = "force-dynamic";

/**
 * Fase 18-D · Bloco 5 — IA · Comprovantes. Os três processos, numa tela.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║  ENVIAR  →  LER  →  REVISAR  →  PROPOR  →  CONFIRMAR                                  ║
 * ║  ⛔ e nenhum lançamento definitivo nasce de nenhuma das quatro primeiras.              ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ **ESTA PÁGINA É QUEM COMPÕE `src/lib/ai/` COM `src/lib/finance/`.** Ela está FORA de
 * `src/lib/ai/`, e é por isso que pode: o teste de fronteira só abre duas portas para query
 * de módulo dentro do módulo de IA (`tools/adapters/` e `approval/commands/`), e
 * `document-queries.ts` não é nenhuma delas. As candidatas do alerta de duplicidade são
 * lidas pelo Financeiro e o cruzamento acontece aqui, com uma função PURA.
 *
 * ⚠️ `searchParams` é Promise no Next 16.
 */
export default async function ComprovantesPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { doc } = await searchParams;

  const [prefs, lista] = await Promise.all([
    getAiPreferences(user.id),
    getComprovantes(user.id),
  ]);

  /**
   * ⛔ AS TRÊS CHAVES, ANDadas — e a tela diz QUAL falta.
   *
   * `allow_vision` sozinha não basta: um comprovante extraído precisa resolver conta e
   * categoria (leitura do Financeiro) e virar uma proposta de lançamento (escrita do
   * Financeiro). Sem as duas, o arquivo sairia do sistema para uma leitura que não teria
   * para onde ir. A mesma checagem roda na Server Action e dentro do RPC.
   */
  const faltando: string[] = [];
  if (!prefs.permissions.allow_finance) faltando.push("leitura do Financeiro");
  if (!prefs.writePermissions.allow_write_finance) faltando.push("alterações no Financeiro");
  if (!prefs.allowVision) faltando.push("envio de arquivos para a IA");

  const selecionado = doc ? await getComprovante(user.id, doc) : null;

  /**
   * O TRIO (valor + data + estabelecimento) só é procurado quando há os três. Comparar com
   * um campo faltando produziria alerta para toda compra de mesmo valor do mês — ruído que
   * treina o dono a não ler nenhum.
   *
   * ⚠️ Ele sai da leitura GRAVADA, não das correções que o dono está digitando agora: a
   * página é `force-dynamic` e recalcular a cada tecla faria o campo esperar o servidor.
   * Consequência declarada: corrigir a data aqui não refaz o alerta até recarregar — e o
   * alerta nunca bloqueou nada, então o pior caso é ele estar desatualizado, nunca errado
   * sobre o que impede.
   */
  const extracao = selecionado?.documento.leitura?.extracao ?? null;
  const candidatas =
    extracao && extracao.totalCentavos.valor !== null && extracao.data.valor !== null
      ? await getTransactionsForReceiptMatch({
          dataISO: extracao.data.valor,
          valorCentavos: extracao.totalCentavos.valor,
        })
      : [];

  const alertas =
    selecionado && extracao
      ? alertasDeDuplicidade({
          extracao,
          enviosAnteriores: selecionado.enviosAnteriores,
          transacoesCandidatas: candidatas.map((t) => ({
            transacaoId: t.id,
            descricao: t.description ?? "",
            dataISO: t.purchase_date,
            // `transactions.amount` é `numeric(14,2)` em REAIS; a extração é em centavos.
            valorCentavos: Math.round(Number(t.amount) * 100),
          })),
        })
      : [];

  const opcoes = extracao
    ? await (async () => {
        const [contas, cartoes, categorias, pessoas] = await Promise.all([
          getAccounts(),
          getCreditCards(),
          getCategories(),
          getPeopleForSelect(),
        ]);
        return {
          contas: contas.map((c) => ({ id: c.id, nome: c.name })),
          cartoes: cartoes.map((c) => ({ id: c.id, nome: c.nome })),
          // Só categorias que aceitam despesa: um comprovante de compra é sempre saída.
          categorias: categorias
            .filter((c) => c.kind === "despesa" || c.kind === "ambos")
            .map((c) => ({ id: c.id, nome: c.name })),
          // `getPeopleForSelect` já devolve `{ id, nome }` — o schema mistura `name` e `nome`
          // desde a Fase 02, e ler a coluna errada aqui daria `undefined` no seletor.
          pessoas: pessoas.map((p) => ({ id: p.id, nome: p.nome })),
        };
      })()
    : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Comprovantes"
        description="Envie uma nota ou comprovante, confira campo a campo o que foi lido e decida se ele vira um lançamento."
      />

      {/* ⛔ A frase mais importante da tela, e ela vem primeiro. */}
      <div className="flex items-start gap-2 rounded-xl border bg-muted/30 p-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 text-muted-foreground">
          O arquivo fica guardado aqui e <strong>só sai deste sistema</strong> quando você
          pedir a leitura — aí ele vai para o provedor de IA que você configurou, e não volta.
          Nenhum lançamento é criado sem você confirmar a previsão, uma de cada vez.
        </p>
      </div>

      {faltando.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <p className="min-w-0">
            Faltam autorizações para usar esta tela: <strong>{faltando.join(", ")}</strong>.
            Ligue em{" "}
            <Link href="/ia/configuracoes" className="font-medium text-primary hover:underline">
              Configurações da IA
            </Link>
            .
          </p>
        </div>
      )}

      <ReceiptUpload desligado={faltando.length > 0} />

      {/* ── A revisão do comprovante aberto ── */}
      {selecionado && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 flex-1 text-base font-semibold">
              {selecionado.documento.nomeArquivo}
            </h2>
            <Link
              href="/ia/comprovantes"
              className="shrink-0 text-xs font-medium text-primary hover:underline"
            >
              Fechar
            </Link>
          </div>

          {selecionado.documento.leitura?.status === "falhou" && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="min-w-0">
                <p className="font-medium text-destructive">A leitura não deu certo.</p>
                <p className="text-muted-foreground">
                  {selecionado.documento.leitura.erroMensagem ??
                    "O provedor não conseguiu ler este comprovante."}{" "}
                  Nenhum registro seu foi tocado. Você pode pedir a leitura de novo.
                </p>
              </div>
            </div>
          )}

          {extracao && opcoes ? (
            <ReceiptReview
              documentoId={selecionado.documento.id}
              extractionId={selecionado.documento.leitura!.id}
              extracao={extracao}
              urlAssinada={selecionado.urlAssinada}
              mime={selecionado.documento.mime}
              alertas={alertas}
              opcoes={opcoes}
            />
          ) : (
            <div className="rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">
                Este comprovante ainda não foi lido. Pedir a leitura envia o arquivo ao
                provedor de IA configurado.
              </p>
              <div className="mt-3">
                <ReceiptExtractButton
                  documentoId={selecionado.documento.id}
                  desligado={faltando.length > 0}
                />
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── A lista ── */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Enviados</h2>

        {lista.itens.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nenhum comprovante enviado"
            description="Envie uma foto ou um PDF acima. Ele fica guardado aqui, e nada sai do sistema até você pedir a leitura."
          />
        ) : (
          <ul className="space-y-2">
            {lista.itens.map((d) => (
              <li key={d.id} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {d.mime === "application/pdf" ? (
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  {/* `min-w-0` + `truncate`: nome longo não empurra os selos para fora. */}
                  <Link
                    href={`/ia/comprovantes?doc=${d.id}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                  >
                    {d.nomeArquivo}
                  </Link>
                  <EstadoDoComprovante
                    virouLancamento={d.virouLancamento}
                    status={d.leitura?.status ?? null}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Enviado em {formatDate(d.enviadoEm)} ·{" "}
                  {(d.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                  {d.observacao ? ` · "${d.observacao}"` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}

        {/*
          ⚠️ O TETO É VISÍVEL (invariante 29 da 18-C). Uma lista cortada em silêncio faz a tela
          dizer "estes são todos" quando não são.
        */}
        {lista.saturado && (
          <p className="text-xs text-muted-foreground">
            Mostrando os {lista.teto} envios mais recentes. Há mais no histórico.
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * ⛔ Três estados, e nenhum deles é inventado a partir de uma coluna de status: "virou
 * lançamento" sai do `entity_type` do anexo, e a leitura sai da última linha de
 * `ai_document_extractions`. Uma segunda coluna dizendo o mesmo divergiria.
 */
function EstadoDoComprovante({
  virouLancamento,
  status,
}: {
  readonly virouLancamento: boolean;
  readonly status: "extraida" | "falhou" | null;
}) {
  if (virouLancamento) {
    return (
      <Badge variant="outline" className="shrink-0 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-3" />
        Virou lançamento
      </Badge>
    );
  }
  if (status === "falhou") {
    return (
      <Badge variant="outline" className="shrink-0 border-destructive/40 text-destructive">
        A leitura falhou
      </Badge>
    );
  }
  if (status === "extraida") {
    return (
      <Badge variant="outline" className="shrink-0">
        Lido — falta revisar
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="shrink-0 text-muted-foreground">
      Guardado, ainda não lido
    </Badge>
  );
}
