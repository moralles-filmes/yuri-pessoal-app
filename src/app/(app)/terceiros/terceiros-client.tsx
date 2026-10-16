"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useLazyDialog } from "@/components/shared/use-lazy-dialog";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  HandCoins,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  UserRound,
  Users,
  Wallet2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { EstadoDoRecebivelBadge, ReceivableStatusBadge } from "@/components/financeiro/badges";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import { PersonFormDialog } from "./person-form";
import { formatCurrency, formatDate, getInitials, hojeISO } from "@/lib/format";
import {
  BULK_ACTION_LABELS,
  BULK_ACTION_TITLES,
  BULK_RECEIVABLE_ACTIONS,
  alcanceDaAcao,
  type AlcanceDaAcao,
  type BulkReceivableAction,
} from "@/lib/finance/receivables-bulk";
import {
  deletePerson,
  togglePersonActive,
} from "@/lib/actions/people";
import {
  bulkSetReceivableStatus,
  markReceivableReceived,
  desfazerRecebimentoAction,
  setReceivableStatus,
  updateReceivable,
} from "@/lib/actions/receivables";
import { toast } from "sonner";
import type {
  PersonWithCounts,
  ReceivableWithRelations,
} from "@/types/database";

import {
  resumirRecebivel, estadoDoRecebivel, emAberto, saldoCentavos,
  perdoadoCentavos, secoesDaLista, ultimoRecebimento, reembolsosRecebidosNoPeriodo,
  totalPendenteAte, rotuloTotalPendenteAte, pendenteDoPeriodo,
  ESTADO_LABELS, ESTADOS_DO_RECEBIVEL,
} from "@/lib/finance/recebimentos";

const ALL = "all";
const RegistrarRecebimentoDialog = dynamic(() => import("./registrar-recebimento-dialog").then((m) => m.RegistrarRecebimentoDialog), { ssr: false });
const estadoDe = (r: ReceivableWithRelations) => estadoDoRecebivel(resumirRecebivel(r));

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
  hoje,
}: {
  receivables: ReceivableWithRelations[];
  people: PersonWithCounts[];
  cards: CardOption[];
  currentMonth: string; // 'yyyy-MM'
  hoje: string; // 'yyyy-MM-dd', do servidor
}) {
  const router = useRouter();
  const [pessoa, setPessoa] = React.useState(ALL);
  const [mes, setMes] = React.useState("");
  const [cartao, setCartao] = React.useState(ALL);
  const [status, setStatus] = React.useState(ALL);
  const [alvo, setAlvo] = React.useState<{
    id: string; saldo: number; pessoa: string; dataPadrao: string;
  } | null>(null);
  const [aberto, setAberto] = React.useState(false);
  const montado = useLazyDialog(aberto);

  function abrirRegistro(r: ReceivableWithRelations) {
    setAlvo({
      id: r.id,
      saldo: saldoCentavos(resumirRecebivel(r)) / 100,
      pessoa: r.person?.nome ?? "Pessoa",
      dataPadrao: hojeISO(),
    });
    setAberto(true);
  }

  // Seleção em massa. Sobrevive à troca de filtro de propósito: o que saiu da tela não é
  // afetado, mas continua contado — a barra declara "N fora do filtro" antes de agir.
  const [selecionados, setSelecionados] = React.useState<Set<string>>(new Set());
  const [acaoConfirmando, setAcaoConfirmando] =
    React.useState<BulkReceivableAction | null>(null);
  const [dataRecebimento, setDataRecebimento] = React.useState("");
  const [aplicando, setAplicando] = React.useState(false);

  // KPIs gerais (não filtrados): total ainda a receber e total recebido no mês corrente.
  const totalAReceber = totalPendenteAte(receivables, hoje);
  const recebidoNoMes = reembolsosRecebidosNoPeriodo(receivables, {
    de: `${currentMonth}-01`,
    ate: `${currentMonth}-31`,
  });

  const filtered = receivables.filter((r) => {
    if (pessoa !== ALL && r.person_id !== pessoa) return false;
    if (cartao !== ALL && r.card_id !== cartao) return false;
    if (status !== ALL && estadoDe(r) !== status) return false;
    if (mes && refMonth(r) !== mes) return false;
    return true;
  });
  const secoes = secoesDaLista(filtered, estadoDe);

  // O KPI por pessoa soma o saldo dos em aberto pelo estado derivado, respeitando os filtros.
  const pessoaSel = pessoa !== ALL ? people.find((p) => p.id === pessoa) ?? null : null;
  const aReceberPessoa = pendenteDoPeriodo(secoes.emAberto.map(resumirRecebivel));

  // ── Seleção em massa ──────────────────────────────────────────────────────────────
  // `visiveis` na mesma ordem em que a tela desenha: é ela que define o recorte de
  // `alcanceDaAcao` (nada fora do filtro é alterado) e a ordem dos ids enviados.
  const visiveis = [...secoes.emAberto, ...secoes.naoSeraCobrado, ...secoes.historico].map((r) => {
    const res = resumirRecebivel(r);
    return { ...r, valor: emAberto(res) ? saldoCentavos(res) / 100 : r.valor };
  });
  const selecionadosVisiveis = visiveis.filter((r) => selecionados.has(r.id));
  const valorSelecionado = selecionadosVisiveis.reduce((s, r) => s + r.valor, 0);
  const foraDoFiltro = selecionados.size - selecionadosVisiveis.length;

  const alcances = Object.fromEntries(
    BULK_RECEIVABLE_ACTIONS.map((acao) => [
      acao,
      alcanceDaAcao(selecionados, visiveis, acao),
    ]),
  ) as Record<BulkReceivableAction, AlcanceDaAcao>;

  function alternarUm(id: string, marcar: boolean) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (marcar) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function alternarGrupo(grupo: ReceivableWithRelations[], marcar: boolean) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      for (const r of grupo) {
        if (marcar) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });
  }

  // A data nasce no handler, não na renderização: `hojeISO()` no corpo do componente
  // divergiria entre o HTML do servidor e o do cliente perto da virada do dia.
  function abrirConfirmacao(acao: BulkReceivableAction) {
    setDataRecebimento(hojeISO());
    setAcaoConfirmando(acao);
  }

  async function aplicarEmMassa() {
    if (!acaoConfirmando) return;
    const acao = acaoConfirmando;
    const alcance = alcances[acao];
    if (alcance.ids.length === 0) return;

    setAplicando(true);
    try {
      const res = await bulkSetReceivableStatus({
        ids: alcance.ids,
        acao,
        ...(acao === "receber" ? { pago_em: dataRecebimento } : {}),
      });
      if (res.ok) {
        // O número do toast é o que o BANCO devolveu, não o que a tela estimou.
        toast.success(
          res.data.afetados === 1
            ? "1 recebível atualizado."
            : `${res.data.afetados} recebíveis atualizados.`,
        );
        setSelecionados(new Set());
        setAcaoConfirmando(null);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setAplicando(false);
    }
  }

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
            label={rotuloTotalPendenteAte(hoje)}
            value={formatCurrency(totalAReceber)}
            icon={HandCoins}
            hint="Pendente + cobrado, descontado o que já foi recebido"
          />
          <StatCard
            label={`Reembolsos recebidos em ${monthYearLabel(`${currentMonth}-01`)}`}
            value={formatCurrency(recebidoNoMes)}
            icon={Wallet2}
            hint="pela data do recebimento"
          />
          {pessoaSel && (
            <StatCard
              label={`Pendente de ${pessoaSel.nome}`}
              value={formatCurrency(aReceberPessoa)}
              icon={UserRound}
              hint={`${secoes.emAberto.length} em aberto`}
            />
          )}
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
                {ESTADOS_DO_RECEBIVEL.map((s) => (
                  <SelectItem key={s} value={s}>
                    {ESTADO_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Barra de ações em massa. `top-18` e não `top-0`: o Header do app é sticky com
            h-16, e uma barra em top-0 escorregaria para trás dele e sumiria ao rolar. */}
        {selecionados.size > 0 && (
          <div className="sticky top-18 z-20">
            <Card className="border-primary/40 bg-card/95 shadow-md backdrop-blur">
              <CardContent className="space-y-2 p-3">
                <p className="text-sm font-medium">
                  {selecionadosVisiveis.length}{" "}
                  {selecionadosVisiveis.length === 1
                    ? "selecionado"
                    : "selecionados"}{" "}
                  <span className="tabular-nums">
                    · {formatCurrency(valorSelecionado)}
                  </span>
                  {foraDoFiltro > 0 && (
                    <span className="ms-1 font-normal text-muted-foreground">
                      ({foraDoFiltro} fora do filtro não será afetado)
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {BULK_RECEIVABLE_ACTIONS.map((acao) => {
                    const alcance = alcances[acao];
                    // Alcance zero some da barra: botão desabilitado sem motivo visível
                    // só faz o usuário clicar e não entender por que nada aconteceu.
                    if (alcance.ids.length === 0) return null;
                    return (
                      <Button
                        key={acao}
                        size="sm"
                        variant={acao === "receber" ? "default" : "outline"}
                        className="min-w-0"
                        onClick={() => abrirConfirmacao(acao)}
                      >
                        {acao === "receber" && <CheckCircle2 />}
                        {acao === "desfazer" && <RotateCcw />}
                        <span className="truncate">
                          {BULK_ACTION_LABELS[acao]} ({alcance.ids.length})
                        </span>
                      </Button>
                    );
                  })}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelecionados(new Set())}
                  >
                    Limpar seleção
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {receivables.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title="Nada a receber por enquanto"
            description="Ao lançar uma despesa como compartilhada ou de terceiro, os valores a receber aparecem aqui."
          />
        ) : (
          <div className="space-y-5">
            <section className="space-y-2">
              <SectionHeader
                titulo="Em aberto"
                itens={secoes.emAberto}
                selecionados={selecionados}
                onAlternar={alternarGrupo}
              />
              {secoes.emAberto.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  Nenhum recebível em aberto com os filtros atuais.
                </p>
              ) : (
                <div className="grid gap-2">
                  {secoes.emAberto.map((r) => (
                    <ReceivableCard
                      key={r.id}
                      receivable={r}
                      selecionado={selecionados.has(r.id)}
                      onSelecionar={alternarUm}
                      onRegistrar={abrirRegistro}
                    />
                  ))}
                </div>
              )}
            </section>

            {secoes.naoSeraCobrado.length > 0 && (
              <section className="space-y-2">
                <SectionHeader
                  titulo="Não será cobrado"
                  itens={secoes.naoSeraCobrado}
                  selecionados={selecionados}
                  onAlternar={alternarGrupo}
                />
                <p className="text-sm text-muted-foreground">
                  Você decidiu não cobrar. O valor conta como despesa sua.
                </p>
                <div className="grid gap-2">
                  {secoes.naoSeraCobrado.map((r) => (
                    <ReceivableCard
                      key={r.id}
                      receivable={r}
                      selecionado={selecionados.has(r.id)}
                      onSelecionar={alternarUm}
                      onRegistrar={abrirRegistro}
                    />
                  ))}
                </div>
              </section>
            )}

            {secoes.historico.length > 0 && (
              <section className="space-y-2">
                <SectionHeader
                  titulo="Histórico"
                  itens={secoes.historico}
                  selecionados={selecionados}
                  onAlternar={alternarGrupo}
                />
                <div className="grid gap-2">
                  {secoes.historico.map((r) => (
                    <ReceivableCard
                      key={r.id}
                      receivable={r}
                      selecionado={selecionados.has(r.id)}
                      onSelecionar={alternarUm}
                      onRegistrar={abrirRegistro}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {montado && alvo && (
          <RegistrarRecebimentoDialog
            open={aberto}
            onOpenChange={setAberto}
            receivableId={alvo.id}
            saldo={alvo.saldo}
            pessoa={alvo.pessoa}
            dataPadrao={alvo.dataPadrao}
          />
        )}

        <BulkConfirmDialog
          acao={acaoConfirmando}
          alcance={acaoConfirmando ? alcances[acaoConfirmando] : null}
          data={dataRecebimento}
          onDataChange={setDataRecebimento}
          aplicando={aplicando}
          onCancel={() => setAcaoConfirmando(null)}
          onConfirm={aplicarEmMassa}
        />
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

/** Título da seção com o "selecionar todos" dela — sempre recortado pelos filtros ativos. */
function SectionHeader({
  titulo,
  itens,
  selecionados,
  onAlternar,
}: {
  titulo: string;
  itens: ReceivableWithRelations[];
  selecionados: Set<string>;
  onAlternar: (grupo: ReceivableWithRelations[], marcar: boolean) => void;
}) {
  const rotulo = `${titulo} (${itens.length})`;
  if (itens.length === 0) {
    return (
      <h2 className="text-sm font-medium text-muted-foreground">{rotulo}</h2>
    );
  }
  return (
    <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium text-muted-foreground">
      <Checkbox
        checked={itens.every((r) => selecionados.has(r.id))}
        onCheckedChange={(checked) => onAlternar(itens, checked === true)}
        aria-label={`Selecionar os ${itens.length} recebíveis em ${titulo.toLowerCase()}`}
      />
      {rotulo}
    </label>
  );
}

/**
 * Confirmação do lote. Mostra quantidade, VALOR e o que fica de fora antes de agir — dar
 * baixa em 109 recebíveis de uma vez não pode acontecer por um clique distraído.
 */
function BulkConfirmDialog({
  acao,
  alcance,
  data,
  onDataChange,
  aplicando,
  onCancel,
  onConfirm,
}: {
  acao: BulkReceivableAction | null;
  alcance: AlcanceDaAcao | null;
  data: string;
  onDataChange: (v: string) => void;
  aplicando: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const aberto = acao !== null && alcance !== null;

  return (
    <Dialog open={aberto} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-md">
        {acao && alcance && (
          <>
            <DialogHeader>
              <DialogTitle>{BULK_ACTION_TITLES[acao]}</DialogTitle>
              <DialogDescription>
                {alcance.ids.length === 1
                  ? "1 recebível"
                  : `${alcance.ids.length} recebíveis`}{" "}
                · {formatCurrency(alcance.valorTotal)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {(alcance.naoAlcancados > 0 || alcance.foraDoFiltro > 0) && (
                <ul className="space-y-1 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  {alcance.naoAlcancados > 0 && (
                    <li>
                      {alcance.naoAlcancados} selecionado(s) não serão alterados —
                      o status atual deles não é alcançado por esta ação.
                    </li>
                  )}
                  {alcance.foraDoFiltro > 0 && (
                    <li>
                      {alcance.foraDoFiltro} selecionado(s) estão fora do filtro
                      atual e não serão tocados.
                    </li>
                  )}
                </ul>
              )}

              {acao === "receber" && (
                <div className="space-y-1.5">
                  <Label htmlFor="bulk-pago-em">Data do recebimento</Label>
                  <Input
                    id="bulk-pago-em"
                    type="date"
                    value={data}
                    onChange={(e) => onDataChange(e.target.value)}
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onCancel} disabled={aplicando}>
                Cancelar
              </Button>
              <Button onClick={onConfirm} disabled={aplicando}>
                {aplicando
                  ? "Aplicando…"
                  : `${BULK_ACTION_LABELS[acao]} ${alcance.ids.length}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReceivableCard({
  receivable: r,
  selecionado,
  onSelecionar,
  onRegistrar,
}: {
  receivable: ReceivableWithRelations;
  selecionado: boolean;
  onSelecionar: (id: string, marcar: boolean) => void;
  onRegistrar: (r: ReceivableWithRelations) => void;
}) {
  const router = useRouter();
  const resumido = resumirRecebivel(r);
  const estado = estadoDoRecebivel(resumido);
  const aberto = emAberto(resumido);
  const saldo = saldoCentavos(resumido) / 100;
  const ultimo = ultimoRecebimento(r.recebimentos);
  const legado = r.status === "pago" && r.recebimentos.length === 0;

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
    <Card className={selecionado ? "min-w-0 border-primary/50 bg-primary/5" : "min-w-0"}>
      <CardContent className="flex min-w-0 flex-col gap-3 p-4">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Checkbox
              checked={selecionado}
              onCheckedChange={(checked) => onSelecionar(r.id, checked === true)}
              aria-label={`Selecionar recebível de ${r.person?.nome ?? "pessoa"} de ${formatCurrency(r.valor)}`}
              className="shrink-0"
            />
            <Avatar size="sm">
              <AvatarFallback>{getInitials(r.person?.nome)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 truncate font-medium">
                  {r.person?.nome ?? "Pessoa"}
                </span>
                <EstadoDoRecebivelBadge estado={estado} />
                {estado === "parcial" && r.status === "cobrado" && (
                  <ReceivableStatusBadge status="cobrado" />
                )}
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
              </p>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 sm:justify-end">
            <div className="min-w-0 sm:text-right">
              <p className="truncate text-base font-semibold tabular-nums">{formatCurrency(r.valor)}</p>
              {r.recebimentos.length > 0 && aberto && (
                <p className="truncate text-xs text-muted-foreground">restam {formatCurrency(saldo)}</p>
              )}
              {estado === "ignorado" && (
                <p className="truncate text-xs text-muted-foreground">
                  não será cobrado: {formatCurrency(perdoadoCentavos(resumido) / 100)}
                </p>
              )}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              {aberto && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-w-0 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                  onClick={() =>
                    run(markReceivableReceived(r.id), "Marcado como recebido.")
                  }
                >
                  <CheckCircle2 /> <span className="truncate">Receber</span>
                </Button>
              )}
              {(r.recebimentos.length > 0 || r.status === "pago") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-w-0"
                  onClick={() =>
                    run(desfazerRecebimentoAction(r.id), "Último recebimento desfeito.")
                  }
                >
                  <RotateCcw /> <span className="truncate">Desfazer</span>
                </Button>
              )}

              {aberto && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Registrar recebimento"
                  title="Registrar recebimento"
                  onClick={() => onRegistrar(r)}
                >
                  <HandCoins />
                </Button>
              )}
              <ReceivableEditDialog receivable={r} />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Mais ações">
                    <MoreVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {aberto && (
                    <DropdownMenuItem onClick={() => onRegistrar(r)}>
                      Registrar recebimento
                    </DropdownMenuItem>
                  )}
                  {r.status === "pendente" && aberto && (
                    <DropdownMenuItem
                      onClick={() =>
                        run(setReceivableStatus(r.id, "cobrado"), "Marcado como cobrado.")
                      }
                    >
                      Marcar como cobrado
                    </DropdownMenuItem>
                  )}
                  {aberto && (
                    <DropdownMenuItem
                      onClick={() =>
                        run(setReceivableStatus(r.id, "ignorado"), "Recebível ignorado.")
                      }
                    >
                      Ignorar
                    </DropdownMenuItem>
                  )}
                  {(r.status === "cobrado" || r.status === "ignorado") && (
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
        </div>
        {r.recebimentos.length > 0 && (
          <details className="min-w-0 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Recebimentos ({r.recebimentos.length})</summary>
            <ul className="mt-2 space-y-2">
              {[...r.recebimentos]
                .sort((a, b) => a.recebido_em.localeCompare(b.recebido_em))
                .map((recebimento) => (
                  <li key={recebimento.id} className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="min-w-0 truncate">
                      {formatDate(recebimento.recebido_em)} · {formatCurrency(recebimento.valor)}
                      {recebimento.observacoes ? ` · ${recebimento.observacoes}` : ""}
                    </span>
                    {recebimento.id === ultimo?.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-w-0"
                        onClick={() => run(desfazerRecebimentoAction(r.id), "Último recebimento desfeito.")}
                      >
                        <RotateCcw /> <span className="truncate">Desfazer o último</span>
                      </Button>
                    )}
                  </li>
                ))}
            </ul>
          </details>
        )}
        {legado && r.pago_em && (
          <p className="text-xs text-muted-foreground">
            Recebido em {formatDate(r.pago_em)} (registro anterior ao histórico)
          </p>
        )}
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
