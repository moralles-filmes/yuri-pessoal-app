"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  HandCoins,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Users,
  Wallet2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { ReceivableStatusBadge } from "@/components/financeiro/badges";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import { PersonFormDialog } from "./person-form";
import { formatCurrency, formatDate, getInitials } from "@/lib/format";
import {
  RECEIVABLE_STATUSES,
  RECEIVABLE_STATUS_LABELS,
  type ReceivableStatus,
} from "@/lib/finance/constants";
import {
  deletePerson,
  togglePersonActive,
} from "@/lib/actions/people";
import {
  markReceivableReceived,
  setReceivableStatus,
  updateReceivable,
} from "@/lib/actions/receivables";
import { toast } from "sonner";
import type {
  PersonWithCounts,
  ReceivableWithRelations,
} from "@/types/database";

const ALL = "all";
const OPEN_STATUSES: ReceivableStatus[] = ["pendente", "cobrado"];

type CardOption = { id: string; nome: string };

function monthYearLabel(competencia: string): string {
  const [y, m] = competencia.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, 1));
}

/** Mês de referência do recebível: competência da fatura ou data da compra. */
function refMonth(r: ReceivableWithRelations): string | null {
  if (r.statement?.competencia) return r.statement.competencia.slice(0, 7);
  if (r.transaction?.purchase_date) return r.transaction.purchase_date.slice(0, 7);
  return null;
}

export function TerceirosClient({
  receivables,
  people,
  cards,
  currentMonth,
}: {
  receivables: ReceivableWithRelations[];
  people: PersonWithCounts[];
  cards: CardOption[];
  currentMonth: string; // 'yyyy-MM'
}) {
  const [pessoa, setPessoa] = React.useState(ALL);
  const [mes, setMes] = React.useState("");
  const [cartao, setCartao] = React.useState(ALL);
  const [status, setStatus] = React.useState(ALL);

  // KPIs gerais (não filtrados): total ainda a receber e total recebido no mês corrente.
  const totalAReceber = receivables
    .filter((r) => OPEN_STATUSES.includes(r.status))
    .reduce((s, r) => s + r.valor, 0);
  const recebidoNoMes = receivables
    .filter((r) => r.status === "pago" && r.pago_em?.slice(0, 7) === currentMonth)
    .reduce((s, r) => s + r.valor, 0);

  const filtered = receivables.filter((r) => {
    if (pessoa !== ALL && r.person_id !== pessoa) return false;
    if (cartao !== ALL && r.card_id !== cartao) return false;
    if (status !== ALL && r.status !== status) return false;
    if (mes && refMonth(r) !== mes) return false;
    return true;
  });
  const abertos = filtered.filter((r) => OPEN_STATUSES.includes(r.status));
  const historico = filtered.filter((r) => !OPEN_STATUSES.includes(r.status));

  return (
    <Tabs defaultValue="receber" className="gap-4">
      <TabsList>
        <TabsTrigger value="receber">
          <HandCoins /> A Receber
        </TabsTrigger>
        <TabsTrigger value="pessoas">
          <Users /> Pessoas
        </TabsTrigger>
      </TabsList>

      {/* ───────────────────────── A Receber ───────────────────────── */}
      <TabsContent value="receber" className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard
            label="Total a receber"
            value={formatCurrency(totalAReceber)}
            icon={HandCoins}
            hint="Pendente + cobrado"
          />
          <StatCard
            label="Recebido no mês"
            value={formatCurrency(recebidoNoMes)}
            icon={Wallet2}
            hint={monthYearLabel(`${currentMonth}-01`)}
          />
        </div>

        {/* Filtros */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Pessoa</Label>
            <Select value={pessoa} onValueChange={setPessoa}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rec-mes">Mês</Label>
            <input
              id="rec-mes"
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Cartão</Label>
            <Select value={cartao} onValueChange={setCartao}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {cards.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {RECEIVABLE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {RECEIVABLE_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {receivables.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title="Nada a receber por enquanto"
            description="Ao lançar uma despesa como compartilhada ou de terceiro, os valores a receber aparecem aqui."
          />
        ) : (
          <div className="space-y-5">
            <section className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">
                Em aberto ({abertos.length})
              </h2>
              {abertos.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  Nenhum recebível em aberto com os filtros atuais.
                </p>
              ) : (
                <div className="grid gap-2">
                  {abertos.map((r) => (
                    <ReceivableCard key={r.id} receivable={r} />
                  ))}
                </div>
              )}
            </section>

            {historico.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-medium text-muted-foreground">
                  Histórico ({historico.length})
                </h2>
                <div className="grid gap-2">
                  {historico.map((r) => (
                    <ReceivableCard key={r.id} receivable={r} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </TabsContent>

      {/* ───────────────────────── Pessoas ───────────────────────── */}
      <TabsContent value="pessoas" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {people.length} pessoa(s)
          </p>
          <PersonFormDialog
            trigger={
              <Button size="sm">
                <Plus /> Nova pessoa
              </Button>
            }
          />
        </div>

        {people.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nenhuma pessoa cadastrada"
            description="Cadastre as pessoas com quem você divide gastos para registrar quem te deve."
          >
            <PersonFormDialog
              trigger={
                <Button size="sm">
                  <Plus /> Nova pessoa
                </Button>
              }
            />
          </EmptyState>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {people.map((p) => (
              <PersonCard key={p.id} person={p} />
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

function ReceivableCard({
  receivable: r,
}: {
  receivable: ReceivableWithRelations;
}) {
  const router = useRouter();
  const isOpen = OPEN_STATUSES.includes(r.status);

  async function run(action: Promise<{ ok: boolean; error?: string }>, ok: string) {
    const res = await action;
    if (res.ok) {
      toast.success(ok);
      router.refresh();
    } else {
      toast.error(res.error ?? "Não foi possível concluir.");
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar size="sm">
            <AvatarFallback>{getInitials(r.person?.nome)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium">
                {r.person?.nome ?? "Pessoa"}
              </span>
              <ReceivableStatusBadge status={r.status} />
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {r.transaction?.description || "Despesa"}
              {r.card?.nome ? ` · ${r.card.nome}` : ""}
              {r.statement?.competencia
                ? ` · fatura ${monthYearLabel(r.statement.competencia)}`
                : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              {r.transaction?.purchase_date
                ? `compra ${formatDate(r.transaction.purchase_date)}`
                : ""}
              {r.data_prevista
                ? ` · prev. ${formatDate(r.data_prevista)}`
                : ""}
              {r.pago_em ? ` · recebido ${formatDate(r.pago_em)}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="text-base font-semibold tabular-nums">
            {formatCurrency(r.valor)}
          </span>
          <div className="flex items-center gap-1">
            {isOpen ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-emerald-600 hover:text-emerald-700"
                onClick={() =>
                  run(markReceivableReceived(r.id), "Marcado como recebido.")
                }
              >
                <CheckCircle2 /> Receber
              </Button>
            ) : r.status === "pago" ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  run(setReceivableStatus(r.id, "pendente"), "Pagamento desfeito.")
                }
              >
                <RotateCcw /> Desfazer
              </Button>
            ) : null}

            <ReceivableEditDialog receivable={r} />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Mais ações">
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {r.status !== "cobrado" && isOpen && (
                  <DropdownMenuItem
                    onClick={() =>
                      run(setReceivableStatus(r.id, "cobrado"), "Marcado como cobrado.")
                    }
                  >
                    Marcar como cobrado
                  </DropdownMenuItem>
                )}
                {r.status !== "ignorado" && (
                  <DropdownMenuItem
                    onClick={() =>
                      run(setReceivableStatus(r.id, "ignorado"), "Recebível ignorado.")
                    }
                  >
                    Ignorar
                  </DropdownMenuItem>
                )}
                {r.status !== "pendente" && (
                  <DropdownMenuItem
                    onClick={() =>
                      run(setReceivableStatus(r.id, "pendente"), "Voltou para pendente.")
                    }
                  >
                    Voltar para pendente
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReceivableEditDialog({
  receivable: r,
}: {
  receivable: ReceivableWithRelations;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [dataPrevista, setDataPrevista] = React.useState(r.data_prevista ?? "");
  const [observacoes, setObservacoes] = React.useState(r.observacoes ?? "");
  const [saving, setSaving] = React.useState(false);

  // Reseta os campos ao abrir (em handler, não em effect) para refletir o recebível atual.
  function handleOpenChange(next: boolean) {
    if (next) {
      setDataPrevista(r.data_prevista ?? "");
      setObservacoes(r.observacoes ?? "");
    }
    setOpen(next);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await updateReceivable(r.id, {
        data_prevista: dataPrevista || null,
        observacoes: observacoes || null,
      });
      if (res.ok) {
        toast.success("Recebível atualizado.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Editar recebível"
        onClick={() => handleOpenChange(true)}
      >
        <Pencil />
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar recebível</DialogTitle>
          <DialogDescription>
            {r.person?.nome ?? "Pessoa"} · {formatCurrency(r.valor)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rec-data">Data prevista</Label>
            <Input
              id="rec-data"
              type="date"
              value={dataPrevista}
              onChange={(e) => setDataPrevista(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rec-obs">Observações</Label>
            <Textarea
              id="rec-obs"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PersonCard({ person: p }: { person: PersonWithCounts }) {
  const router = useRouter();

  async function handleToggle() {
    const res = await togglePersonActive(p.id, !p.ativo);
    if (res.ok) {
      toast.success(p.ativo ? "Pessoa inativada." : "Pessoa reativada.");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar>
            <AvatarFallback>{getInitials(p.nome)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium">{p.nome}</span>
              {!p.ativo && (
                <Badge variant="outline" className="text-muted-foreground">
                  Inativa
                </Badge>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {[p.telefone, p.email].filter(Boolean).join(" · ") ||
                "Sem contato"}
            </p>
            {p.receivables_count > 0 && (
              <p className="text-xs text-muted-foreground">
                {p.receivables_count} recebível(is) vinculado(s)
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={p.ativo ? "Inativar" : "Reativar"}
            onClick={handleToggle}
          >
            {p.ativo ? <RotateCcw /> : <CheckCircle2 />}
          </Button>
          <PersonFormDialog
            person={p}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="Editar">
                <Pencil />
              </Button>
            }
          />
          <DeleteConfirmDialog
            title="Excluir pessoa"
            description={`Excluir "${p.nome}"? Só é possível se não houver gastos/recebíveis vinculados.`}
            successMessage="Pessoa excluída."
            onConfirm={async () => {
              const res = await deletePerson(p.id);
              if (res.ok) router.refresh();
              return res;
            }}
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Excluir"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 />
              </Button>
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
