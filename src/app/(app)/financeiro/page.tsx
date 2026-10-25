import Link from "next/link";
import {
  ArrowRightLeft,
  Layers,
  PiggyBank,
  Repeat,
  Tag,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAccounts, getTransactions } from "@/lib/finance/queries";
import {
  AVISO_DE_RECORRENCIAS_INTERROMPIDAS,
  catchUpRecurrences,
} from "@/lib/finance/generation";
import { formatCurrency, hojeISO } from "@/lib/format";
import { SETTLED_STATUSES } from "@/lib/finance/constants";
import { saldoDasContas } from "@/lib/finance/saldo-das-contas";

export const dynamic = "force-dynamic";

const QUICK_LINKS = [
  {
    href: "/financeiro/lancamentos",
    label: "Lançamentos",
    description: "Despesas, receitas, transferências e ajustes.",
    icon: ArrowRightLeft,
  },
  {
    href: "/financeiro/contas",
    label: "Contas",
    description: "Carteiras, bancos e saldos.",
    icon: Wallet,
  },
  {
    href: "/financeiro/categorias",
    label: "Categorias",
    description: "Organize seus gastos e receitas.",
    icon: Tag,
  },
  {
    href: "/financeiro/contas-fixas",
    label: "Contas fixas",
    description: "Despesas recorrentes mensais.",
    icon: Layers,
  },
  {
    href: "/financeiro/recorrencias",
    label: "Recorrências",
    description: "Geração automática de lançamentos.",
    icon: Repeat,
  },
];

export default async function FinanceiroOverviewPage() {
  // Catch-up de recorrências vencidas (idempotente, seguro no render). 03-G: a leitura das
  // recorrências LANÇA (vai ao `financeiro/error.tsx`, nada foi gravado); um erro no meio da
  // geração volta `interrompida` e a tela o declara — aí já pode haver lançamento gravado.
  const { interrompida } = await catchUpRecurrences();

  // Mês corrente em Brasília. Derivar de `new Date()` aqui daria o mês seguinte na
  // virada do mês entre 21h e 00h (BRT), zerando os cards de entradas/saídas.
  const month = hojeISO().slice(0, 7);

  const [accounts, monthTx] = await Promise.all([
    getAccounts(),
    getTransactions({ month }).then((l) => l.linhas),
  ]);

  const totalBalance = saldoDasContas(accounts);
  // Fluxo de caixa à vista: compras no cartão de crédito entram nas faturas, não no
  // caixa do mês (o dinheiro só sai quando a fatura é paga). Excluímos aqui para não
  // distorcer entradas/saídas — a consolidação de cartão vem no dashboard (Fase 07).
  const settled = monthTx.filter(
    (t) =>
      SETTLED_STATUSES.includes(t.status) &&
      t.payment_method !== "cartao_credito",
  );
  const entradas = settled
    .filter((t) => t.type === "receita")
    .reduce((s, t) => s + t.amount, 0);
  const saidas = settled
    .filter((t) => t.type === "despesa")
    .reduce((s, t) => s + t.amount, 0);
  const [anoMes, mesMes] = month.split("-").map(Number);
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(anoMes, mesMes - 1, 1));

  return (
    <div className="space-y-6">
      {interrompida && (
        <p
          role="status"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
        >
          {AVISO_DE_RECORRENCIAS_INTERROMPIDAS}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Saldo total"
          value={formatCurrency(totalBalance)}
          icon={PiggyBank}
          hint={`${accounts.length} conta(s)`}
        />
        <StatCard
          label={`Entradas · ${monthLabel}`}
          value={formatCurrency(entradas)}
          icon={TrendingUp}
        />
        <StatCard
          label={`Saídas · ${monthLabel}`}
          value={formatCurrency(saidas)}
          icon={TrendingDown}
        />
        <StatCard
          label={`Resultado · ${monthLabel}`}
          value={formatCurrency(entradas - saidas)}
          icon={ArrowRightLeft}
          trend={{
            value: entradas - saidas >= 0 ? "Positivo" : "Negativo",
            direction: entradas - saidas >= 0 ? "up" : "down",
          }}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {QUICK_LINKS.map((link) => (
          <Card key={link.href} className="transition-colors hover:border-primary/40">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
                  <link.icon className="size-5" />
                </div>
                <div className="space-y-0.5">
                  <CardTitle className="text-base">{link.label}</CardTitle>
                  <CardDescription>{link.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" size="sm">
                <Link href={link.href}>Abrir</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
