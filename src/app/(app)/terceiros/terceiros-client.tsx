"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ExternalLink,
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
import { ReceivableStatusBadge } from "@/components/financeiro/badges";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import { PersonFormDialog } from "./person-form";
import { centavosParaReais, formatCurrency, formatDate, getInitials } from "@/lib/format";
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
  perdoadoCentavos, secoesDaLista, dataDoUltimoRecebimento,
  entradasManuaisDoRecebivel, recebidoDaPessoaNoPeriodo, recebimentoDesfazivel,
  resumoDaPessoa, totalPendenteAte, rotuloTotalPendenteAte, type SecoesDaLista,
} from "@/lib/finance/recebimentos";

const ALL = "all";
const estadoDe = (r: ReceivableWithRelations) => estadoDoRecebivel(resumirRecebivel(r));

type CardOption = { id: string; nome: string };
type ContaOption = { id: string; nome: string };
/** Os valores vêm da leitura em CENTAVOS (o motor de reembolso trabalha neles). */
type SituacaoDaPessoa = { devidoCentavos: number; saldoAFavorCentavos: number };
type PagamentoDaPessoa = { transactionId: string; centavos: number; data: string; contaId: string | null };

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

/** Uma ficha por pessoa. As listas respeitam os filtros; o TOTAL (`resumo`) nunca. */
type Ficha = {
  id: string;
  nome: string;
  ativo: boolean;
  resumo: ReturnType<typeof resumoDaPessoa>;
  secoes: SecoesDaLista<ReceivableWithRelations>;
  pagamentos: PagamentoDaPessoa[];
};

export function TerceirosClient({
  receivables,
  people,
  cards,
  accounts,
  situacoes,
  pagamentos,
  currentMonth,
  hoje,
}: {
  receivables: ReceivableWithRelations[];
  people: PersonWithCounts[];
  cards: CardOption[];
  accounts: ContaOption[];
  situacoes: Record<string, SituacaoDaPessoa>;
  pagamentos: Record<string, PagamentoDaPessoa[]>;
  currentMonth: string; // 'yyyy-MM'
  hoje: string; // 'yyyy-MM-dd', do servidor
}) {
  const router = useRouter();
  const [pessoa, setPessoa] = React.useState(ALL);
  const [mes, setMes] = React.useState("");
  const [cartao, setCartao] = React.useState(ALL);

  // Seleção em massa. Sobrevive à troca de filtro de propósito: o que saiu da tela não é
  // afetado, mas continua contado — a barra declara "N fora do filtro" antes de agir.
  const [selecionados, setSelecionados] = React.useState<Set<string>>(new Set());
  const [acaoConfirmando, setAcaoConfirmando] =
    React.useState<BulkReceivableAction | null>(null);
  const [aplicando, setAplicando] = React.useState(false);

  const nomeDaConta = new Map(accounts.map((c) => [c.id, c.nome] as const));
  const filtrosAtivos = cartao !== ALL || mes !== "";

  // ── Topo: o mesmo "total pendente" do Painel e o que entrou no mês (com o filtro de pessoa) ──
  const doRecorte = pessoa === ALL ? receivables : receivables.filter((r) => r.person_id === pessoa);
  const totalAReceber = totalPendenteAte(receivables, hoje);
  const recebidoNoMes = centavosParaReais(
    recebidoDaPessoaNoPeriodo({
      entradasManuais: doRecorte.flatMap((r) => entradasManuaisDoRecebivel(r)),
      partesDasReceitasVinculadas: Object.entries(pagamentos)
        .filter(([pessoaId]) => pessoa === ALL || pessoaId === pessoa)
        .flatMap(([, lista]) => lista),
      periodo: { de: `${currentMonth}-01`, ate: `${currentMonth}-31` },
    }),
  );

  // ── As fichas: pessoas cadastradas + quem aparece nos recebíveis ou nas receitas vinculadas ──
  const filtered = receivables.filter((r) => {
    if (cartao !== ALL && r.card_id !== cartao) return false;
    if (mes && refMonth(r) !== mes) return false;
    return true;
  });
  const idsDasFichas = new Set<string>([
    ...people.map((p) => p.id),
    ...Object.keys(situacoes),
    ...receivables.map((r) => r.person_id),
  ]);
  const fichas: Ficha[] = [...idsDasFichas]
    .filter((id) => pessoa === ALL || id === pessoa)
    .map((id) => {
      const cadastro = people.find((p) => p.id === id);
      const dela = receivables.filter((r) => r.person_id === id);
      return {
        id,
        nome: cadastro?.nome ?? dela[0]?.person?.nome ?? "Pessoa",
        ativo: cadastro?.ativo ?? true,
        // ⛔ A soma por pessoa sai de `resumoDaPessoa` (RR-D-21), nunca de uma conta aqui.
        resumo: resumoDaPessoa(dela, situacoes[id]?.saldoAFavorCentavos ?? 0),
        secoes: secoesDaLista(
          filtered.filter((r) => r.person_id === id),
          estadoDe,
        ),
        pagamentos: pagamentos[id] ?? [],
      };
    })
    .filter(
      (f) =>
        f.resumo.emAberto + f.resumo.pagos > 0 ||
        f.resumo.saldoAFavorCentavos > 0 ||
        f.pagamentos.length > 0 ||
        f.secoes.naoSeraCobrado.length > 0,
    )
    .sort((a, b) => b.resumo.devidoCentavos - a.resumo.devidoCentavos || a.nome.localeCompare(b.nome, "pt-BR"));

  // ── Seleção em massa ──────────────────────────────────────────────────────────────
  // `visiveis` na mesma ordem em que a tela desenha: é ela que define o recorte de
  // `alcanceDaAcao` (nada fora do filtro é alterado) e a ordem dos ids enviados. Só entra o que
  // tem checkbox: em aberto, "não será cobrado" e pago com recebimento desfazível.
  const selecionaveis = fichas.flatMap((f) => [
    ...f.secoes.emAberto,
    ...f.secoes.naoSeraCobrado,
    ...f.secoes.historico.filter(recebimentoDesfazivel),
  ]);
  const visiveis = selecionaveis.map((r) => {
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

  async function aplicarEmMassa() {
    if (!acaoConfirmando) return;
    const acao = acaoConfirmando;
    const alcance = alcances[acao];
    if (alcance.ids.length === 0) return;

    setAplicando(true);
    try {
      const res = await bulkSetReceivableStatus({ ids: alcance.ids, acao });
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
      <TabsContent value="receber" className="min-w-0 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
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
            hint="pela data do recebimento, inclusive o que virou saldo a favor"
          />
        </div>

        {/* Filtros */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="min-w-0 space-y-1.5">
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
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="rec-mes">Mês</Label>
            <input
              id="rec-mes"
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 text-sm"
            />
          </div>
          <div className="min-w-0 space-y-1.5">
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
        </div>

        {/* Barra de ações em massa. `top-18` e não `top-0`: o Header do app é sticky com
            h-16, e uma barra em top-0 escorregaria para trás dele e sumiria ao rolar. */}
        {selecionados.size > 0 && (
          <div className="sticky top-18 z-20 rounded-xl vidro-casca">
            <Card className="border-0 bg-transparent shadow-none ring-0">
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
                        variant="outline"
                        className="min-w-0"
                        onClick={() => setAcaoConfirmando(acao)}
                      >
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

        {fichas.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title="Nada a receber por enquanto"
            description="Ao lançar uma despesa como compartilhada ou de terceiro, os valores a receber aparecem aqui."
          />
        ) : (
          <div className="space-y-4">
            {fichas.map((f) => (
              <FichaDaPessoa
                key={f.id}
                ficha={f}
                filtrosAtivos={filtrosAtivos}
                nomeDaConta={nomeDaConta}
                selecionados={selecionados}
                onSelecionar={alternarUm}
                onAlternarGrupo={alternarGrupo}
              />
            ))}
          </div>
        )}

        <BulkConfirmDialog
          acao={acaoConfirmando}
          alcance={acaoConfirmando ? alcances[acaoConfirmando] : null}
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

/**
 * A ficha de UMA pessoa (§11.3): o que ela deve (parcelas futuras incluídas), o saldo a favor,
 * e quatro listas — em aberto, pagamentos (as receitas vinculadas), pagos e, se houver, "não
 * será cobrado". Sem chip de parcial e sem saldo por linha: o número que importa é o da pessoa.
 */
function FichaDaPessoa({
  ficha: f,
  filtrosAtivos,
  nomeDaConta,
  selecionados,
  onSelecionar,
  onAlternarGrupo,
}: {
  ficha: Ficha;
  filtrosAtivos: boolean;
  nomeDaConta: Map<string, string>;
  selecionados: Set<string>;
  onSelecionar: (id: string, marcar: boolean) => void;
  onAlternarGrupo: (grupo: ReceivableWithRelations[], marcar: boolean) => void;
}) {
  const { secoes, resumo } = f;
  const pagosSelecionaveis = secoes.historico.filter(recebimentoDesfazivel);

  return (
    <Card className="min-w-0">
      <CardContent className="min-w-0 space-y-4 p-4">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar>
              <AvatarFallback>{getInitials(f.nome)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">{f.nome}</p>
              {!f.ativo && (
                <Badge variant="outline" className="text-muted-foreground">
                  Inativa
                </Badge>
              )}
            </div>
          </div>
          <div className="min-w-0 sm:text-right">
            <p className="text-xs text-muted-foreground">Deve</p>
            <p className="truncate text-2xl font-semibold tabular-nums">
              {formatCurrency(centavosParaReais(resumo.devidoCentavos))}
            </p>
            {resumo.saldoAFavorCentavos > 0 && (
              <p className="truncate text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
                Saldo a favor: {formatCurrency(centavosParaReais(resumo.saldoAFavorCentavos))}
              </p>
            )}
          </div>
        </div>

        <Tabs defaultValue="aberto" className="min-w-0 gap-3">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="aberto" className="flex-none px-2.5">
              Em aberto ({secoes.emAberto.length})
            </TabsTrigger>
            <TabsTrigger value="pagamentos" className="flex-none px-2.5">
              Pagamentos ({f.pagamentos.length})
            </TabsTrigger>
            <TabsTrigger value="pagos" className="flex-none px-2.5">
              Pagos ({secoes.historico.length})
            </TabsTrigger>
            {secoes.naoSeraCobrado.length > 0 && (
              <TabsTrigger value="nao-cobrado" className="flex-none px-2.5">
                Não será cobrado ({secoes.naoSeraCobrado.length})
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="aberto" className="min-w-0 space-y-2">
            {filtrosAtivos && (
              <p className="text-xs text-muted-foreground">
                O total acima é da pessoa inteira; a lista respeita o mês e o cartão escolhidos.
              </p>
            )}
            <SectionHeader
              titulo="Em aberto"
              itens={secoes.emAberto}
              selecionados={selecionados}
              onAlternar={onAlternarGrupo}
            />
            {secoes.emAberto.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                Nada em aberto{filtrosAtivos ? " com os filtros atuais" : ""}.
              </p>
            ) : (
              <div className="grid gap-2">
                {secoes.emAberto.map((r) => (
                  <LinhaDoRecebivel
                    key={r.id}
                    receivable={r}
                    secao="aberto"
                    selecionado={selecionados.has(r.id)}
                    onSelecionar={onSelecionar}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="pagamentos" className="min-w-0 space-y-2">
            {f.pagamentos.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                Nenhum pagamento recebido ainda. Ele aparece aqui quando você lança uma receita
                vinculada a esta pessoa.
              </p>
            ) : (
              <ul className="grid gap-2">
                {f.pagamentos.map((p) => (
                  <PagamentoLinha key={p.transactionId} pagamento={p} conta={p.contaId ? nomeDaConta.get(p.contaId) : undefined} />
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Para desfazer um pagamento, edite ou exclua a receita em Lançamentos: a dívida volta
              sozinha.
            </p>
          </TabsContent>

          <TabsContent value="pagos" className="min-w-0 space-y-2">
            <SectionHeader
              titulo="Pagos"
              itens={pagosSelecionaveis}
              selecionados={selecionados}
              onAlternar={onAlternarGrupo}
            />
            {secoes.historico.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                Nenhuma linha quitada{filtrosAtivos ? " com os filtros atuais" : ""}.
              </p>
            ) : (
              <div className="grid gap-2">
                {secoes.historico.map((r) => (
                  <LinhaDoRecebivel
                    key={r.id}
                    receivable={r}
                    secao="pago"
                    selecionado={selecionados.has(r.id)}
                    onSelecionar={onSelecionar}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {secoes.naoSeraCobrado.length > 0 && (
            <TabsContent value="nao-cobrado" className="min-w-0 space-y-2">
              <SectionHeader
                titulo="Não será cobrado"
                itens={secoes.naoSeraCobrado}
                selecionados={selecionados}
                onAlternar={onAlternarGrupo}
              />
              <p className="text-sm text-muted-foreground">
                Você decidiu não cobrar. O valor conta como despesa sua.
              </p>
              <div className="grid gap-2">
                {secoes.naoSeraCobrado.map((r) => (
                  <LinhaDoRecebivel
                    key={r.id}
                    receivable={r}
                    secao="ignorado"
                    selecionado={selecionados.has(r.id)}
                    onSelecionar={onSelecionar}
                  />
                ))}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}

/** Uma receita vinculada: data de caixa, conta e a parte da pessoa — linkando para o lançamento. */
function PagamentoLinha({ pagamento: p, conta }: { pagamento: PagamentoDaPessoa; conta?: string }) {
  const href =
    `/financeiro/lancamentos?month=${p.data.slice(0, 7)}&type=receita` +
    (p.contaId ? `&account=${p.contaId}` : "");
  return (
    <li className="flex min-w-0 items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium tabular-nums">{formatDate(p.data)}</p>
        <p className="truncate text-xs text-muted-foreground">{conta ?? "Sem conta"}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-base font-semibold tabular-nums">
          {formatCurrency(centavosParaReais(p.centavos))}
        </span>
        <Button asChild variant="ghost" size="icon-sm">
          <Link href={href} aria-label="Ver o lançamento" title="Ver o lançamento">
            <ExternalLink />
          </Link>
        </Button>
      </div>
    </li>
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
  if (itens.length === 0) return null;
  return (
    <label className="flex w-fit max-w-full cursor-pointer items-center gap-2 text-sm font-medium text-muted-foreground">
      <Checkbox
        checked={itens.every((r) => selecionados.has(r.id))}
        onCheckedChange={(checked) => onAlternar(itens, checked === true)}
        aria-label={`Selecionar os ${itens.length} recebíveis em ${titulo.toLowerCase()}`}
        className="shrink-0"
      />
      <span className="min-w-0 truncate">
        Selecionar {itens.length === 1 ? "a linha" : `as ${itens.length} linhas`}
      </span>
    </label>
  );
}

/**
 * Confirmação do lote. Mostra quantidade, VALOR e o que fica de fora antes de agir — alterar
 * 109 recebíveis de uma vez não pode acontecer por um clique distraído.
 */
function BulkConfirmDialog({
  acao,
  alcance,
  aplicando,
  onCancel,
  onConfirm,
}: {
  acao: BulkReceivableAction | null;
  alcance: AlcanceDaAcao | null;
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

/**
 * Uma linha da ficha: a origem (compra, cartão/fatura) e o VALOR ATRIBUÍDO à pessoa. Nenhum
 * chip de parcial e nenhum saldo por linha — quanto falta é o número da pessoa, não o da linha.
 * Ações: cobrar / não cobrar / voltar a pendente, editar, e Desfazer SÓ quando o recebimento foi
 * registrado à mão (ou é o legado): o automático se desfaz editando ou apagando a receita.
 */
function LinhaDoRecebivel({
  receivable: r,
  secao,
  selecionado,
  onSelecionar,
}: {
  receivable: ReceivableWithRelations;
  secao: "aberto" | "pago" | "ignorado";
  selecionado: boolean;
  onSelecionar: (id: string, marcar: boolean) => void;
}) {
  const router = useRouter();
  const resumido = resumirRecebivel(r);
  const desfazivel = recebimentoDesfazivel(r);
  const selecionavel = secao !== "pago" || desfazivel;
  const recebidoEm = r.recebimentos.length > 0 ? dataDoUltimoRecebimento(r.recebimentos) : r.pago_em;

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
    <div
      className={
        selecionado
          ? "min-w-0 rounded-lg border border-primary/50 bg-primary/5 p-3"
          : "min-w-0 rounded-lg border p-3"
      }
    >
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {selecionavel && (
            <Checkbox
              checked={selecionado}
              onCheckedChange={(checked) => onSelecionar(r.id, checked === true)}
              aria-label={`Selecionar recebível de ${r.person?.nome ?? "pessoa"} de ${formatCurrency(r.valor)}`}
              className="shrink-0"
            />
          )}
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate text-sm font-medium">
                {r.transaction?.description || "Despesa"}
              </span>
              {secao === "aberto" && r.status === "cobrado" && (
                <span className="shrink-0">
                  <ReceivableStatusBadge status="cobrado" />
                </span>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {[
                r.card?.nome,
                r.statement?.competencia ? `fatura ${monthYearLabel(r.statement.competencia)}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Sem cartão"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {r.transaction?.purchase_date ? `compra ${formatDate(r.transaction.purchase_date)}` : ""}
              {r.data_prevista ? ` · prev. ${formatDate(r.data_prevista)}` : ""}
              {secao === "pago" && recebidoEm ? ` · recebido em ${formatDate(recebidoEm)}` : ""}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 sm:justify-end">
          <div className="min-w-0 sm:text-right">
            <p className="truncate text-base font-semibold tabular-nums">{formatCurrency(r.valor)}</p>
            {secao === "ignorado" && (
              <p className="truncate text-xs text-muted-foreground">
                não será cobrado: {formatCurrency(perdoadoCentavos(resumido) / 100)}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {desfazivel && secao !== "ignorado" && (
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
            <ReceivableEditDialog receivable={r} />

            {secao !== "pago" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Mais ações">
                    <MoreVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {r.status === "pendente" && secao === "aberto" && (
                    <DropdownMenuItem
                      onClick={() =>
                        run(setReceivableStatus(r.id, "cobrado"), "Marcado como cobrado.")
                      }
                    >
                      Marcar como cobrado
                    </DropdownMenuItem>
                  )}
                  {secao === "aberto" && (
                    <DropdownMenuItem
                      onClick={() =>
                        run(setReceivableStatus(r.id, "ignorado"), "Marcado como não será cobrado.")
                      }
                    >
                      Não cobrar
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
            )}
          </div>
        </div>
      </div>
    </div>
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
