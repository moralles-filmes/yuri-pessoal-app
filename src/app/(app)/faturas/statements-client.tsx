"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  ArrowLeftRight,
  CreditCard,
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
import { Bloco } from "@/components/shared/painel/bloco";
import { Indicador } from "@/components/shared/painel/indicador";
import {
  CategoryPill,
  ClassificacaoBadge,
  InstallmentBadge,
} from "@/components/financeiro/badges";
import { CLASSE_DO_TOM, rotuloDoEstado } from "@/components/cartoes/estado-da-fatura";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  organizarFaturasDoCartao,
  type FaturaDaTela,
} from "@/lib/finance/faturas-do-cartao";
import { estadoDoBloco } from "@/lib/painel/bloco";
import {
  fraseDoPerdoado,
  parteDoTerceiroCentavos,
  perdoadoCentavos,
  resumirRecebivel,
} from "@/lib/finance/recebimentos";
import {
  STATEMENT_STATUSES,
  STATEMENT_STATUS_LABELS,
  type Classificacao,
} from "@/lib/finance/constants";
import { moveTransactionToStatement } from "@/lib/actions/statements";
import { useLazyDialog } from "@/components/shared/use-lazy-dialog";
import { cn } from "@/lib/utils";
import type { FaturaAPagar } from "./pagar-fatura-dialog";
import { toast } from "sonner";
import type {
  CardStatementWithTotal,
  ReceivableWithPerson,
  StatementInstallmentItem,
  TransactionWithRelations,
} from "@/types/database";

const ALL = "all";

// ⛔ objeto literal escrito ali mesmo — o compilador o lê estaticamente (regra 4 do carregamento sob demanda)
const DesfazerPagamentoDialog = dynamic(() => import("./desfazer-pagamento-dialog"), {
  ssr: false,
});
const PagarFaturaDialog = dynamic(() => import("./pagar-fatura-dialog"), {
  ssr: false,
});

type CardOption = {
  id: string;
  nome: string;
  cor: string | null;
  dia_fechamento: number;
  dia_vencimento: number;
};

/** 'yyyy-MM' ou 'yyyy-MM-dd' → "outubro de 2026" (minúsculo, para frase corrida). */
function monthYearLabel(competencia: string): string {
  const [y, m] = competencia.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, 1));
}

/** "Outubro de 2026": a inicial maiúscula é feita aqui, em JS — nunca por CSS. */
function tituloDaCompetencia(competencia: string): string {
  const t = monthYearLabel(competencia);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** 'yyyy-MM' → "novembro". */
function mesPorExtenso(competencia: string): string {
  const [y, m] = competencia.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(y, m - 1, 1));
}

/** 'yyyy-MM-dd' → 'dd/MM'. Data pura: manipulada como texto. */
function diaMes(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

const SEM_LANCAMENTOS = "sem lançamentos conhecidos";
const moeda = (cent: number) => formatCurrency(cent / 100);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Quem paga uma parte de um item da fatura. */
type ParteDoItem = { personId: string; nome: string; valor: number; perdoado: number };

/**
 * "Compartilhada · meu X · Fulano Y" de UM item da fatura. O rodapé da fatura já dizia quem
 * paga o total; isto responde a pergunta que faltava — de quem é ESTA compra.
 *
 * A classificação é LIDA da transação (da compra-pai, no caso da parcela), nunca deduzida do
 * valor: minha parte zero não prova que a compra é toda de terceiro, e resto de centavo numa
 * compra de terceiro não a torna compartilhada.
 *
 * Sendo 100% de terceiro, o "meu R$ 0,00" é omitido — a badge já disse.
 */
function PartesDoItem({
  total,
  partes,
  classificacao,
}: {
  total: number;
  partes: ParteDoItem[];
  classificacao: Classificacao | null;
}) {
  const isShared = classificacao != null && classificacao !== "pessoal";
  if (partes.length === 0 && !isShared) return null;
  const terceiros = partes.reduce((acc, p) => acc + p.valor, 0);
  const meu = total - terceiros;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {isShared && <ClassificacaoBadge value={classificacao} />}
      {meu !== 0 && partes.length > 0 && (
        <span>
          meu{" "}
          <span className="font-medium tabular-nums text-foreground">
            {formatCurrency(meu)}
          </span>
        </span>
      )}
      {partes.map((p) => (
        <span key={p.personId} className="min-w-0">
          <span className="truncate">{p.nome}</span>{" "}
          <span className="font-medium tabular-nums text-foreground">
            {formatCurrency(p.valor)}
          </span>
          {p.perdoado > 0 && (
            <span> · não será cobrado {formatCurrency(p.perdoado)}</span>
          )}
        </span>
      ))}
    </div>
  );
}

/** Agrupa recebíveis por uma chave do item (transação ou parcela), somando por pessoa. */
function partesPorItem(
  receivables: ReceivableWithPerson[],
  chave: (r: ReceivableWithPerson) => string | null,
): Map<string, ParteDoItem[]> {
  const porItem = new Map<string, Map<string, ParteDoItem>>();
  for (const r of receivables) {
    const k = chave(r);
    if (!k) continue;
    const pessoas = porItem.get(k) ?? new Map<string, ParteDoItem>();
    const atual = pessoas.get(r.person_id) ?? {
      personId: r.person_id,
      nome: r.person?.nome ?? "Pessoa",
      valor: 0,
      perdoado: 0,
    };
    const resumo = resumirRecebivel(r);
    atual.valor += parteDoTerceiroCentavos(resumo) / 100;
    atual.perdoado += perdoadoCentavos(resumo) / 100;
    pessoas.set(r.person_id, atual);
    porItem.set(k, pessoas);
  }
  return new Map(
    [...porItem.entries()].map(([k, pessoas]) => [
      k,
      [...pessoas.values()].sort((a, b) => b.valor - a.valor),
    ]),
  );
}

/** Tudo que o detalhamento de UMA fatura precisa, já agrupado pela tela. */
type DadosDaFatura = {
  tx: TransactionWithRelations[];
  inst: StatementInstallmentItem[];
  rec: ReceivableWithPerson[];
};

type DetalheProps = {
  f: FaturaDaTela;
  dados: DadosDaFatura;
  moveTargets: { id: string; label: string }[];
  partesPorTransacao: Map<string, ParteDoItem[]>;
  partesPorParcela: Map<string, ParteDoItem[]>;
  onMoved: () => void;
};

/** O detalhamento de uma fatura REAL: lançamentos, parcelas e "Quem paga esta fatura". */
function DetalheDaFatura({
  f,
  dados,
  moveTargets,
  partesPorTransacao,
  partesPorParcela,
  onMoved,
}: DetalheProps) {
  const { tx, inst, rec } = dados;
  const totalReais = (f.valores?.totalCent ?? 0) / 100;
  const meu = (f.valores?.meuCent ?? 0) / 100;
  return (
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
                <CategoryPill name={t.category.name} color={t.category.color} />
              )}
            </div>
            <PartesDoItem
              total={t.amount}
              partes={partesPorTransacao.get(t.id) ?? []}
              classificacao={t.classificacao}
            />
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
              currentStatementId={f.statementId as string}
              targets={moveTargets}
              onMoved={onMoved}
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
              <InstallmentBadge numero={it.numero} total={it.total_parcelas} />
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
            <PartesDoItem
              total={it.valor}
              partes={partesPorParcela.get(it.id) ?? []}
              classificacao={it.parent?.classificacao ?? null}
            />
          </div>
          <span className="shrink-0 text-sm font-medium tabular-nums">
            {formatCurrency(it.valor)}
          </span>
        </div>
      ))}

      {rec.length > 0 &&
        (() => {
          const byPerson = new Map<
            string,
            { nome: string; valor: number; perdoado: number }
          >();
          for (const r of rec) {
            const cur = byPerson.get(r.person_id) ?? {
              nome: r.person?.nome ?? "Pessoa",
              valor: 0,
              perdoado: 0,
            };
            const resumo = resumirRecebivel(r);
            cur.valor += parteDoTerceiroCentavos(resumo) / 100;
            cur.perdoado += perdoadoCentavos(resumo) / 100;
            byPerson.set(r.person_id, cur);
          }
          return (
            <div className="rounded-lg border border-dashed p-3">
              {/* O valor do título é o TOTAL da fatura: com a minha parte listada
                  junto dos terceiros, as linhas somam o cabeçalho e a conta fecha
                  na tela. O total só de terceiros continua na linha resumida do
                  card, acima. */}
              <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
                <span className="min-w-0 truncate">Quem paga esta fatura</span>
                <span className="shrink-0 tabular-nums">
                  {formatCurrency(totalReais)}
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate">Minha parte</span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatCurrency(meu)}
                  </span>
                </div>
                {[...byPerson.entries()].map(([id, p]) => (
                  <div
                    key={id}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="min-w-0 text-muted-foreground">
                      <span className="block truncate">{p.nome}</span>
                      {p.perdoado > 0 && (
                        <span className="block">não será cobrado {formatCurrency(p.perdoado)}</span>
                      )}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {formatCurrency(p.valor)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
    </div>
  );
}

/**
 * Uma fatura na lista priorizada. O selo vem de `rotuloDoEstado` (a MESMA palavra e cor da Visão
 * geral); a ação, de `f.acao` (decidida por `organizarFaturasDoCartao`, nunca aqui). Fatura prevista
 * tem data e NUNCA valor: "sem lançamentos conhecidos", jamais R$ 0,00.
 */
function CartaoDaFatura({
  f,
  hoje,
  dados,
  expandido,
  onToggle,
  onPagar,
  onDesfazer,
  detalhe,
}: {
  f: FaturaDaTela;
  hoje: string;
  dados: DadosDaFatura;
  expandido: boolean;
  onToggle: () => void;
  onPagar: () => void;
  onDesfazer: () => void;
  detalhe: Omit<DetalheProps, "f" | "dados">;
}) {
  const { texto, tom } = rotuloDoEstado(f, f.tabela);
  const v = f.valores;
  const temItens = dados.tx.length > 0 || dados.inst.length > 0;
  const mostraTerceiros = v !== null && (v.terceirosCent > 0 || v.perdoadoCent > 0);
  const frasePerdoado = v ? fraseDoPerdoado(v.perdoadoCent / 100) : null;
  const fechamento = hoje < f.dataFechamento ? "fecha" : "fechou";
  const vencimento = f.dataVencimento < hoje ? "venceu" : "vence";
  const lancamentos = `${plural(f.itens, "lançamento", "lançamentos")}${
    f.estado === "aberta" ? " até agora" : ""
  }`;

  return (
    <Card
      className={cn(
        "overflow-hidden shadow-none",
        f.estado === "atrasada" && "border-l-4 border-l-destructive",
        v === null && "border border-dashed bg-transparent ring-0",
      )}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{tituloDaCompetencia(f.competencia)}</span>
              <Badge variant="outline" className={CLASSE_DO_TOM[tom]}>
                {texto}
              </Badge>
              {f.marca === "atual" && (
                <Badge variant="outline" className="text-primary">
                  Atual
                </Badge>
              )}
              {f.marca === "proxima" && (
                <Badge variant="outline" className="text-muted-foreground">
                  Próxima
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {fechamento} {diaMes(f.dataFechamento)} · {vencimento}{" "}
              {diaMes(f.dataVencimento)}
              {v === null ? "" : ` · ${lancamentos}`}
            </p>
            {mostraTerceiros && v && (
              <p className="text-xs text-muted-foreground">
                meu{" "}
                <span className="font-medium text-foreground">{moeda(v.meuCent)}</span>{" "}
                · terceiros{" "}
                <span className="font-medium text-foreground">
                  {moeda(v.terceirosCent)}
                </span>
                {frasePerdoado && ` · ${frasePerdoado}`}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <div className="min-w-0 sm:text-right">
              {v === null ? (
                <span className="italic text-muted-foreground">{SEM_LANCAMENTOS}</span>
              ) : (
                <span
                  className={cn(
                    "text-base font-semibold tabular-nums",
                    f.estado === "paga" && "line-through text-muted-foreground",
                  )}
                >
                  {moeda(v.totalCent)}
                </span>
              )}
              {v !== null && f.acao === null && v.totalCent <= 0 && (
                <p className="text-[11px] text-muted-foreground">nada a pagar</p>
              )}
            </div>
            <div className="flex items-center gap-1">
              {f.acao === "pagar" && (
                <Button size="sm" onClick={onPagar}>
                  Pagar
                </Button>
              )}
              {f.acao === "pagar-antes" && (
                <Button variant="outline" size="sm" onClick={onPagar}>
                  Pagar antes de fechar
                </Button>
              )}
              {f.acao === "desfazer" && (
                <Button variant="ghost" size="sm" onClick={onDesfazer}>
                  <RotateCcw /> Desfazer
                </Button>
              )}
              {f.statementId && temItens && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={expandido ? "Recolher" : "Ver lançamentos"}
                  onClick={onToggle}
                >
                  {expandido ? <ChevronUp /> : <ChevronDown />}
                </Button>
              )}
            </div>
          </div>
        </div>

        {expandido && f.statementId && (
          <DetalheDaFatura f={f} dados={dados} {...detalhe} />
        )}
      </CardContent>
    </Card>
  );
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
  // Fatura cujo pagamento está sendo desfeito (nulo = diálogo fechado).
  const [desfazendo, setDesfazendo] = React.useState<string | null>(null);
  const desfazerMontado = useLazyDialog(desfazendo !== null);
  // Fatura em pagamento (nulo = diálogo fechado).
  const [pagando, setPagando] = React.useState<FaturaAPagar | null>(null);
  const pagarMontado = useLazyDialog(pagando !== null);

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

  // Recebíveis (parte de terceiros) agrupados por fatura: "quem paga" no detalhamento.
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

  // ...e agrupados por ITEM, para dizer de quem é cada compra da fatura. Uma parcela tem
  // `installment_id`; um lançamento à vista, só `transaction_id` — por isso duas chaves.
  const partesPorParcela = React.useMemo(
    () => partesPorItem(receivables, (r) => r.installment_id),
    [receivables],
  );
  const partesPorTransacao = React.useMemo(
    () =>
      partesPorItem(receivables, (r) =>
        r.installment_id ? null : r.transaction_id,
      ),
    [receivables],
  );

  // A lista de faturas, os grupos e os indicadores saem de UMA função pura (a regra não mora
  // aqui). Sem cartão selecionado não há o que organizar.
  const organizado = React.useMemo(
    () =>
      selectedCard
        ? organizarFaturasDoCartao({
            hoje: today,
            card: selectedCard,
            statements,
            receivables,
            month,
            status,
          })
        : null,
    [selectedCard, today, statements, receivables, month, status],
  );

  // Alvos de movimentação manual: faturas reais (com id) do cartão selecionado.
  const moveTargets = React.useMemo(
    () =>
      statements
        .filter((s) => s.id)
        .map((s) => ({ id: s.id as string, label: tituloDaCompetencia(s.competencia) })),
    [statements],
  );

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={ReceiptText}
        title="Nenhum cartão cadastrado"
        description="Cadastre um cartão de crédito para começar a acompanhar as faturas."
      >
        <Button asChild size="sm">
          <Link href="/cartoes/meus">Ir para Cartões</Link>
        </Button>
      </EmptyState>
    );
  }

  const detalhe = {
    moveTargets,
    partesPorTransacao,
    partesPorParcela,
    onMoved: () => router.refresh(),
  };

  function renderFatura(f: FaturaDaTela) {
    const id = f.statementId;
    return (
      <CartaoDaFatura
        key={f.chave}
        f={f}
        hoje={today}
        dados={{
          tx: id ? (txByStatement.get(id) ?? []) : [],
          inst: id ? (instByStatement.get(id) ?? []) : [],
          rec: id ? (recByStatement.get(id) ?? []) : [],
        }}
        expandido={id != null && expanded === id}
        onToggle={() => setExpanded(expanded === id ? null : id)}
        onPagar={() => {
          if (!id || !f.valores) return;
          setPagando({
            statementId: id,
            titulo: `Pagar fatura de ${monthYearLabel(f.competencia)} — ${selectedCard?.nome ?? "cartão"}`,
            totalReais: f.valores.totalCent / 100,
            meuReais: f.valores.meuCent / 100,
            terceirosReais: f.valores.terceirosCent / 100,
            vencimento: f.dataVencimento,
          });
        }}
        onDesfazer={() => {
          if (id) setDesfazendo(id);
        }}
        detalhe={detalhe}
      />
    );
  }

  const grupos = organizado?.grupos;
  const ind = organizado?.indicadores;
  const aPagar = ind?.aPagar;
  const atual = ind?.atual ?? null;
  const proximo = ind?.proximoVencimento ?? null;

  const gruposComLinhas: {
    chave: string;
    titulo: string;
    subtitulo: string;
    linhas: FaturaDaTela[];
  }[] = grupos
    ? [
        {
          chave: "abertas",
          titulo: "Em aberto — acumulando compras",
          subtitulo: "o valor muda até o fechamento",
          linhas: grupos.emAberto,
        },
        {
          chave: "proximas",
          titulo: "Próximas",
          subtitulo: "ciclos que ainda não fecharam",
          linhas: grupos.proximas,
        },
        {
          chave: "anteriores",
          titulo: "Pagas e anteriores",
          subtitulo: "mais recentes primeiro",
          linhas: grupos.anteriores,
        },
      ]
    : [];

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

      {/* Indicadores: sempre sobre TODAS as faturas do cartão, não sobre o filtro. */}
      {aPagar && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Indicador
            tom="saida"
            icone={ReceiptText}
            rotulo="A pagar neste cartão"
            dica="Soma das faturas fechadas ainda não pagas, as atrasadas inclusive. Fatura em aberto e prevista não entram."
            valor={moeda(aPagar.totalCent)}
            linhaDeBase={
              aPagar.qtd > 0
                ? `${plural(aPagar.qtd, "fatura a pagar", "faturas a pagar")} · ${
                    aPagar.qtdAtrasadas === 0
                      ? "nenhuma atrasada"
                      : plural(aPagar.qtdAtrasadas, "atrasada", "atrasadas")
                  }`
                : "nenhuma fatura fechada a pagar"
            }
            detalheComValor={aPagar.qtd > 0 ? `minha parte: ${moeda(aPagar.meuCent)}` : null}
          />
          <Indicador
            tom="terceiros"
            icone={CreditCard}
            rotulo={
              atual
                ? `Fatura atual · ${mesPorExtenso(atual.competencia)}`
                : "Fatura atual"
            }
            dica="Total já lançado no ciclo que ainda está acumulando compras. Muda até o fechamento."
            valor={
              atual?.valores
                ? moeda(atual.valores.totalCent)
                : { ausente: SEM_LANCAMENTOS }
            }
            linhaDeBase={
              atual
                ? `acumulando até ${diaMes(atual.dataFechamento)} · vence ${diaMes(atual.dataVencimento)}`
                : "nenhum ciclo em aberto"
            }
          />
          <Indicador
            tom="saldo"
            icone={CalendarClock}
            rotulo="Próximo vencimento"
            dica="Vencimento da próxima fatura fechada a pagar que ainda não venceu; sem nenhuma, o da fatura atual (se ainda não foi paga). As atrasadas estão em A pagar."
            valor={proximo ? diaMes(proximo.data) : { ausente: "nenhum vencimento conhecido" }}
            linhaDeBase={
              proximo
                ? `fatura de ${mesPorExtenso(proximo.fatura.competencia)} · ${
                    proximo.fatura.valores
                      ? moeda(proximo.fatura.valores.totalCent)
                      : SEM_LANCAMENTOS
                  }`
                : "sem faturas conhecidas"
            }
          />
        </div>
      )}

      {/* Faturas por prioridade */}
      {organizado && grupos && (
        organizado.vazio ? (
          <EmptyState
            icon={ReceiptText}
            title="Nenhuma fatura encontrada"
            description="Lance compras no cartão para gerar faturas, ou ajuste os filtros de mês e status."
          />
        ) : (
          <div className="space-y-4">
            <Bloco
              titulo="Precisam de pagamento"
              subtitulo="atrasadas primeiro, depois por vencimento"
              estado={estadoDoBloco({ ok: true, itens: grupos.pagar })}
              vazio={{
                frase:
                  month || status
                    ? "Nenhuma fatura a pagar neste filtro."
                    : "Nenhuma fatura fechada a pagar.",
              }}
            >
              <div className="grid gap-3">{grupos.pagar.map(renderFatura)}</div>
            </Bloco>
            {gruposComLinhas
              .filter((g) => g.linhas.length > 0)
              .map((g) => (
                <Bloco
                  key={g.chave}
                  titulo={g.titulo}
                  subtitulo={g.subtitulo}
                  estado={estadoDoBloco({ ok: true, itens: g.linhas })}
                >
                  <div className="grid gap-3">{g.linhas.map(renderFatura)}</div>
                </Bloco>
              ))}
          </div>
        )
      )}

      {pagarMontado && (
        <PagarFaturaDialog
          fatura={pagando}
          accounts={accounts}
          today={today}
          onOpenChange={(aberto) => {
            if (!aberto) setPagando(null);
          }}
        />
      )}

      {desfazerMontado && (
        <DesfazerPagamentoDialog
          statementId={desfazendo}
          onOpenChange={(aberto) => {
            if (!aberto) setDesfazendo(null);
          }}
        />
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
                  <SelectItem key={o.id} value={o.id}>
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
