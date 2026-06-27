"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ArrowLeftRight,
  ReceiptText,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import {
  CategoryPill,
  InstallmentBadge,
  StatementStatusBadge,
} from "@/components/financeiro/badges";
import { formatCurrency, formatDate, toDateInputValue } from "@/lib/format";
import { resolverFatura, statusEfetivo } from "@/lib/finance/invoice";
import {
  STATEMENT_STATUSES,
  STATEMENT_STATUS_LABELS,
} from "@/lib/finance/constants";
import {
  markStatementPaid,
  markStatementUnpaid,
  moveTransactionToStatement,
} from "@/lib/actions/statements";
import { toast } from "sonner";
import type {
  CardStatementWithTotal,
  ReceivableWithPerson,
  StatementInstallmentItem,
  TransactionWithRelations,
} from "@/types/database";

const ALL = "all";

type CardOption = {
  id: string;
  nome: string;
  cor: string | null;
  dia_fechamento: number;
  dia_vencimento: number;
};

type Display = {
  id: string | null;
  competencia: string;
  data_fechamento: string;
  data_vencimento: string;
  pago_em: string | null;
  total_atual: number;
  itens: number;
};

function monthYearLabel(competencia: string): string {
  const [y, m] = competencia.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, 1));
}

/** Próximo dia (local) de uma data 'yyyy-MM-dd'. */
function nextDayISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toDateInputValue(new Date(y, m - 1, d + 1));
}

export function StatementsClient({
  cards,
  statements,
  transactions,
  installmentItems,
  receivables,
  accounts,
  today,
  selectedCardId,
  month,
  status,
}: {
  cards: CardOption[];
  statements: CardStatementWithTotal[];
  transactions: TransactionWithRelations[];
  installmentItems: StatementInstallmentItem[];
  receivables: ReceivableWithPerson[];
  accounts: { id: string; name: string }[];
  today: string;
  selectedCardId: string | null;
  month: string | null;
  status: string | null;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const selectedCard = cards.find((c) => c.id === selectedCardId) ?? null;

  function navigate(updates: Record<string, string | null>) {
    const base: Record<string, string | null> = {
      card: selectedCardId,
      month,
      status,
      ...updates,
    };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(base)) {
      if (v) params.set(k, v);
    }
    router.push(`/faturas?${params.toString()}`);
  }

  const eff = React.useCallback(
    (s: Display) =>
      statusEfetivo(
        {
          data_fechamento: s.data_fechamento,
          data_vencimento: s.data_vencimento,
          pago_em: s.pago_em,
        },
        today,
      ),
    [today],
  );

  // Lançamentos agrupados por fatura.
  const txByStatement = React.useMemo(() => {
    const map = new Map<string, TransactionWithRelations[]>();
    for (const t of transactions) {
      if (!t.statement_id) continue;
      const arr = map.get(t.statement_id) ?? [];
      arr.push(t);
      map.set(t.statement_id, arr);
    }
    return map;
  }, [transactions]);

  // Parcelas agrupadas por fatura (cada parcela é um item "i/N" da fatura).
  const instByStatement = React.useMemo(() => {
    const map = new Map<string, StatementInstallmentItem[]>();
    for (const it of installmentItems) {
      if (!it.statement_id) continue;
      const arr = map.get(it.statement_id) ?? [];
      arr.push(it);
      map.set(it.statement_id, arr);
    }
    return map;
  }, [installmentItems]);

  // Recebíveis (parte de terceiros) agrupados por fatura: total de terceiros e "quem paga".
  const recByStatement = React.useMemo(() => {
    const map = new Map<string, ReceivableWithPerson[]>();
    for (const r of receivables) {
      if (!r.statement_id) continue;
      const arr = map.get(r.statement_id) ?? [];
      arr.push(r);
      map.set(r.statement_id, arr);
    }
    return map;
  }, [receivables]);

  // Monta a lista de faturas a exibir: faturas reais + ciclos atual/próximo (virtuais
  // quando ainda não têm lançamentos), depois aplica filtros de mês e status.
  const { list, atualComp, proximaComp } = React.useMemo(() => {
    const byComp = new Map<string, Display>();
    for (const s of statements) {
      byComp.set(s.competencia, {
        id: s.id,
        competencia: s.competencia,
        data_fechamento: s.data_fechamento,
        data_vencimento: s.data_vencimento,
        pago_em: s.pago_em,
        total_atual: s.total_atual ?? 0,
        itens: s.itens ?? 0,
      });
    }

    let atual: string | null = null;
    let proxima: string | null = null;
    if (selectedCard && !month) {
      const a = resolverFatura(
        today,
        selectedCard.dia_fechamento,
        selectedCard.dia_vencimento,
      );
      atual = a.competencia;
      if (!byComp.has(a.competencia)) {
        byComp.set(a.competencia, {
          id: null,
          competencia: a.competencia,
          data_fechamento: a.dataFechamento,
          data_vencimento: a.dataVencimento,
          pago_em: null,
          total_atual: 0,
          itens: 0,
        });
      }
      const p = resolverFatura(
        nextDayISO(a.dataFechamento),
        selectedCard.dia_fechamento,
        selectedCard.dia_vencimento,
      );
      proxima = p.competencia;
      if (!byComp.has(p.competencia)) {
        byComp.set(p.competencia, {
          id: null,
          competencia: p.competencia,
          data_fechamento: p.dataFechamento,
          data_vencimento: p.dataVencimento,
          pago_em: null,
          total_atual: 0,
          itens: 0,
        });
      }
    }

    let arr = [...byComp.values()];
    if (month) arr = arr.filter((s) => s.competencia.slice(0, 7) === month);
    if (status) arr = arr.filter((s) => eff(s) === status);
    arr.sort((a, b) => b.competencia.localeCompare(a.competencia));
    return { list: arr, atualComp: atual, proximaComp: proxima };
  }, [statements, selectedCard, month, status, today, eff]);

  // Alvos de movimentação manual: faturas reais (com id) do cartão selecionado.
  const moveTargets = React.useMemo(
    () =>
      statements
        .filter((s) => s.id)
        .map((s) => ({ id: s.id as string, label: monthYearLabel(s.competencia) })),
    [statements],
  );

  const faturaAtual = atualComp
    ? list.find((s) => s.competencia === atualComp)
    : undefined;

  async function handleUnpay(id: string) {
    const res = await markStatementUnpaid(id);
    if (res.ok) {
      toast.success("Pagamento desfeito.");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={ReceiptText}
        title="Nenhum cartão cadastrado"
        description="Cadastre um cartão de crédito para começar a acompanhar as faturas."
      >
        <Button asChild size="sm">
          <Link href="/cartoes">Ir para Cartões</Link>
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Cartão</Label>
          <Select
            value={selectedCardId ?? undefined}
            onValueChange={(v) => navigate({ card: v, month: null, status: null })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione o cartão" />
            </SelectTrigger>
            <SelectContent>
              {cards.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fatura-mes">Mês (competência)</Label>
          <input
            id="fatura-mes"
            type="month"
            value={month ?? ""}
            onChange={(e) => navigate({ month: e.target.value || null })}
            className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select
            value={status ?? ALL}
            onValueChange={(v) => navigate({ status: v === ALL ? null : v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {STATEMENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATEMENT_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Resumo da fatura atual */}
      {faturaAtual && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard
            label={`Fatura atual · ${monthYearLabel(faturaAtual.competencia)}`}
            value={formatCurrency(faturaAtual.total_atual)}
            icon={ReceiptText}
            hint={`${faturaAtual.itens} lançamento(s)`}
          />
          <StatCard
            label="Vencimento"
            value={formatDate(faturaAtual.data_vencimento)}
            icon={CalendarClock}
            hint={`Fecha em ${formatDate(faturaAtual.data_fechamento)}`}
          />
        </div>
      )}

      {/* Lista de faturas */}
      {list.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="Nenhuma fatura encontrada"
          description="Lance compras no cartão para gerar faturas, ou ajuste os filtros de mês e status."
        />
      ) : (
        <div className="grid gap-3">
          {list.map((s) => {
            const efetivo = eff(s);
            const tx = s.id ? txByStatement.get(s.id) ?? [] : [];
            const inst = s.id ? instByStatement.get(s.id) ?? [] : [];
            const rec = s.id ? recByStatement.get(s.id) ?? [] : [];
            const terceiros = rec.reduce((sum, r) => sum + r.valor, 0);
            const meu = s.total_atual - terceiros;
            const hasItems = tx.length > 0 || inst.length > 0;
            const isOpen = s.id != null && expanded === s.id;
            const isAtual = s.competencia === atualComp;
            const isProxima = s.competencia === proximaComp;
            return (
              <Card key={s.competencia} className="overflow-hidden">
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium capitalize">
                          {monthYearLabel(s.competencia)}
                        </span>
                        <StatementStatusBadge status={efetivo} />
                        {isAtual && (
                          <Badge variant="outline" className="text-primary">
                            Atual
                          </Badge>
                        )}
                        {isProxima && (
                          <Badge
                            variant="outline"
                            className="text-muted-foreground"
                          >
                            Próxima
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Fecha {formatDate(s.data_fechamento)} · vence{" "}
                        {formatDate(s.data_vencimento)} · {s.itens} lançamento(s)
                      </p>
                      {terceiros > 0 && (
                        <p className="text-xs text-muted-foreground">
                          meu{" "}
                          <span className="font-medium text-foreground">
                            {formatCurrency(meu)}
                          </span>{" "}
                          · terceiros{" "}
                          <span className="font-medium text-foreground">
                            {formatCurrency(terceiros)}
                          </span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <span className="text-base font-semibold tabular-nums">
                        {formatCurrency(s.total_atual)}
                      </span>
                      <div className="flex items-center gap-1">
                        {s.id && efetivo === "paga" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUnpay(s.id as string)}
                          >
                            <RotateCcw /> Desfazer
                          </Button>
                        ) : s.id && s.total_atual > 0 ? (
                          <PayStatementDialog
                            statementId={s.id}
                            total={s.total_atual}
                            accounts={accounts}
                            onPaid={() => router.refresh()}
                          />
                        ) : null}
                        {s.id && hasItems && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={isOpen ? "Recolher" : "Ver lançamentos"}
                            onClick={() =>
                              setExpanded(isOpen ? null : (s.id as string))
                            }
                          >
                            {isOpen ? <ChevronUp /> : <ChevronDown />}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="space-y-2 border-t pt-3">
                      {tx.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <p className="truncate text-sm font-medium">
                              {t.description || "Lançamento"}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                              <span>{formatDate(t.purchase_date)}</span>
                              {t.type === "receita" && (
                                <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                                  Estorno
                                </span>
                              )}
                              {t.category && (
                                <CategoryPill
                                  name={t.category.name}
                                  color={t.category.color}
                                />
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={
                                t.type === "receita"
                                  ? "text-sm font-medium tabular-nums text-emerald-600 dark:text-emerald-400"
                                  : "text-sm font-medium tabular-nums"
                              }
                            >
                              {t.type === "receita" ? "−" : ""}
                              {formatCurrency(t.amount)}
                            </span>
                            <MoveTransactionDialog
                              txId={t.id}
                              currentStatementId={s.id as string}
                              targets={moveTargets}
                              onMoved={() => router.refresh()}
                            />
                          </div>
                        </div>
                      ))}

                      {inst.map((it) => (
                        <div
                          key={it.id}
                          className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <p className="flex items-center gap-2 truncate text-sm font-medium">
                              <InstallmentBadge
                                numero={it.numero}
                                total={it.total_parcelas}
                              />
                              {it.parent?.description || "Compra parcelada"}
                            </p>
                            {it.parent?.category && (
                              <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                                <CategoryPill
                                  name={it.parent.category.name}
                                  color={it.parent.category.color}
                                />
                              </div>
                            )}
                          </div>
                          <span className="text-sm font-medium tabular-nums">
                            {formatCurrency(it.valor)}
                          </span>
                        </div>
                      ))}

                      {rec.length > 0 &&
                        (() => {
                          const byPerson = new Map<
                            string,
                            { nome: string; valor: number }
                          >();
                          for (const r of rec) {
                            const cur = byPerson.get(r.person_id) ?? {
                              nome: r.person?.nome ?? "Pessoa",
                              valor: 0,
                            };
                            cur.valor += r.valor;
                            byPerson.set(r.person_id, cur);
                          }
                          return (
                            <div className="rounded-lg border border-dashed p-3">
                              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                                Quem paga esta fatura · terceiros{" "}
                                {formatCurrency(terceiros)}
                              </p>
                              <div className="space-y-1">
                                {[...byPerson.entries()].map(([id, p]) => (
                                  <div
                                    key={id}
                                    className="flex items-center justify-between text-xs"
                                  >
                                    <span className="truncate text-muted-foreground">
                                      {p.nome}
                                    </span>
                                    <span className="font-medium tabular-nums">
                                      {formatCurrency(p.valor)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MoveTransactionDialog({
  txId,
  currentStatementId,
  targets,
  onMoved,
}: {
  txId: string;
  currentStatementId: string;
  targets: { id: string; label: string }[];
  onMoved: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [target, setTarget] = React.useState<string | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);

  const options = targets.filter((t) => t.id !== currentStatementId);

  async function handleConfirm() {
    if (!target) return;
    setLoading(true);
    try {
      const res = await moveTransactionToStatement(txId, target);
      if (res.ok) {
        toast.success("Lançamento movido de fatura.");
        setOpen(false);
        onMoved();
      } else {
        toast.error(res.error);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Mover de fatura">
          <ArrowLeftRight />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mover para outra fatura</DialogTitle>
          <DialogDescription>
            Ajuste manual: realoca este lançamento para outra fatura do mesmo
            cartão. Use apenas em exceções.
          </DialogDescription>
        </DialogHeader>
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Não há outra fatura deste cartão para mover.
          </p>
        ) : (
          <div className="space-y-1.5">
            <Label>Fatura de destino</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione a fatura" />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id} className="capitalize">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || !target || options.length === 0}
          >
            {loading ? "Movendo…" : "Mover"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayStatementDialog({
  statementId,
  total,
  accounts,
  onPaid,
}: {
  statementId: string;
  total: number;
  accounts: { id: string; name: string }[];
  onPaid: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [contaId, setContaId] = React.useState<string | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);

  async function handleConfirm() {
    if (!contaId) return;
    setLoading(true);
    try {
      const res = await markStatementPaid(statementId, contaId);
      if (res.ok) {
        toast.success("Fatura paga e debitada da conta.");
        setOpen(false);
        onPaid();
      } else {
        toast.error(res.error);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-emerald-600 hover:text-emerald-700"
        >
          <CheckCircle2 /> Pagar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pagar fatura</DialogTitle>
          <DialogDescription>
            Debita {formatCurrency(total)} da conta escolhida. O pagamento entra
            como transferência (não conta como nova despesa).
          </DialogDescription>
        </DialogHeader>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma conta cadastrada.{" "}
            <Link href="/financeiro/contas" className="underline">
              Cadastre uma conta
            </Link>{" "}
            para pagar a fatura.
          </p>
        ) : (
          <div className="space-y-1.5">
            <Label>Debitar da conta</Label>
            <Select value={contaId} onValueChange={setContaId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || !contaId || accounts.length === 0}
          >
            {loading ? "Pagando…" : `Pagar ${formatCurrency(total)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
