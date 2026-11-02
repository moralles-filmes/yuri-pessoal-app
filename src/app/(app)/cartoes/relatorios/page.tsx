import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { OlhoDosValores } from "@/components/shared/painel/olho-dos-valores";
import { RelatorioDeCartaoTela } from "@/components/cartoes/relatorio-de-cartao";
import { buttonVariants } from "@/components/ui/button";
import { mesDe, ultimosMeses } from "@/lib/finance/dashboard";
import {
  type BaseDoRelatorio,
  baseDoRelatorio,
  montarRelatorioDeCartao,
  periodoDoRelatorio,
} from "@/lib/finance/relatorio-de-cartao";
import {
  getCreditCards,
  getReceivablesByStatements,
  getStatements,
} from "@/lib/finance/queries";
import { hojeISO } from "@/lib/format";
import { COOKIE_DO_OLHO, valoresOcultos } from "@/lib/painel/olho";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Relatórios de cartão" };
export const dynamic = "force-dynamic";

const BASES: { valor: BaseDoRelatorio; rotulo: string }[] = [
  { valor: "competencia", rotulo: "Por competência" },
  { valor: "vencimento", rotulo: "Por vencimento" },
];
const PERIODOS = [6, 12] as const;

const TEXTO_DA_BASE: Record<BaseDoRelatorio, string> = {
  competencia: "Por competência — o mês em que a fatura fecha.",
  vencimento: "Por vencimento — o mês em que a fatura vence (quando o dinheiro sai).",
};

const CLASSE_DO_SELETOR = "inline-flex shrink-0 overflow-hidden rounded-lg border bg-card";
const CLASSE_DO_LINK =
  "border-r px-3 py-1.5 text-sm whitespace-nowrap last:border-r-0 hover:bg-muted/50";

/**
 * REDESIGN-05-C — Relatórios de cartão da central. Nenhuma regra aqui: as leituras (que lançam se
 * vierem cortadas, e o `error.tsx` herdado responde) alimentam `montarRelatorioDeCartao`, e a tela
 * só formata. `?base=`, `?meses=` e `?cartao=` inválidos caem no padrão — sem filtro fantasma.
 */
export default async function RelatoriosDeCartaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const hoje = hojeISO();
  const base = baseDoRelatorio(texto(sp.base));
  const n = periodoDoRelatorio(texto(sp.meses));

  // O olho dos valores é do aparelho (cookie): só o valor exato "1" oculta (`valoresOcultos`).
  const ocultos = valoresOcultos((await cookies()).get(COOKIE_DO_OLHO)?.value);

  const [cards, statements] = await Promise.all([getCreditCards(), getStatements()]);
  // Só os recebíveis das faturas que o período PODE mostrar, pela chave da base escolhida;
  // mandar o histórico inteiro faria o `in(...)` crescer sem teto com os anos de faturas.
  const meses = ultimosMeses(mesDe(hoje), n);
  const doPeriodo = statements.filter((s) =>
    meses.includes(mesDe(base === "vencimento" ? s.data_vencimento : s.competencia)),
  );
  const receivables = await getReceivablesByStatements(doPeriodo.map((s) => s.id));
  const dados = montarRelatorioDeCartao({
    hoje,
    base,
    n,
    cardId: texto(sp.cartao),
    cards,
    statements,
    receivables,
  });

  // Os links preservam os outros parâmetros (já normalizados).
  const href = (sobre: { base?: BaseDoRelatorio; meses?: number }) => {
    const q = new URLSearchParams({
      base: sobre.base ?? dados.base,
      meses: String(sobre.meses ?? dados.n),
    });
    if (dados.cardId) q.set("cartao", dados.cardId);
    return `/cartoes/relatorios?${q.toString()}`;
  };

  const nomeDoArquivo = `cartoes-mes-a-mes-${dados.base}-${dados.n}m.csv`;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <PageHeader
          title="Relatórios de cartão"
          description="Quanto passou pelas faturas, quanto foi seu e quanto foi de terceiros."
        />
        <p className="border-l-2 border-primary pl-2 text-xs text-muted-foreground">
          {TEXTO_DA_BASE[dados.base]} Total = minha parte + parte dos terceiros, fatura a fatura.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <nav aria-label="Base do relatório" className={CLASSE_DO_SELETOR}>
          {BASES.map((b) => (
            <Link
              key={b.valor}
              href={href({ base: b.valor })}
              aria-current={b.valor === dados.base ? "page" : undefined}
              className={cn(
                CLASSE_DO_LINK,
                b.valor === dados.base && "bg-primary/10 font-semibold text-primary",
              )}
            >
              {b.rotulo}
            </Link>
          ))}
        </nav>
        <nav aria-label="Período" className={CLASSE_DO_SELETOR}>
          {PERIODOS.map((p) => (
            <Link
              key={p}
              href={href({ meses: p })}
              aria-current={p === dados.n ? "page" : undefined}
              className={cn(
                CLASSE_DO_LINK,
                p === dados.n && "bg-primary/10 font-semibold text-primary",
              )}
            >
              {p} meses
            </Link>
          ))}
        </nav>
      </div>

      {/* Filtro de cartão: formulário GET, sem JavaScript e sem campo de texto. */}
      <form
        method="get"
        action="/cartoes/relatorios"
        className="flex flex-wrap items-end gap-2"
      >
        <input type="hidden" name="base" value={dados.base} />
        <input type="hidden" name="meses" value={dados.n} />
        <div className="min-w-0 space-y-1">
          <label htmlFor="cartao-do-relatorio" className="block text-xs text-muted-foreground">
            Cartão
          </label>
          <select
            id="cartao-do-relatorio"
            name="cartao"
            defaultValue={dados.cardId ?? ""}
            className="h-8 w-full max-w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:w-64"
          >
            <option value="">Todos os cartões</option>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
                {c.ativo ? "" : " (desativado)"}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={buttonVariants({ variant: "outline", size: "default" })}>
          Aplicar
        </button>
      </form>

      <OlhoDosValores ocultoInicial={ocultos}>
        <RelatorioDeCartaoTela dados={dados} nomeDoArquivo={nomeDoArquivo} />
      </OlhoDosValores>
    </div>
  );
}
