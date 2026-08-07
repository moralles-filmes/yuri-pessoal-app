"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  Ban,
  CalendarClock,
  Check,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RotateCcw,
  Settings2,
  Undo2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { cn } from "@/lib/utils";
import { ImportBatchStatusBadge, ImportRowStatusBadge } from "./import-badges";
import { ImportRowSplitDialog } from "./import-split-dialog";
import { InstallmentBadge } from "@/components/financeiro/badges";
import { CLASSIFICACAO_LABELS } from "@/lib/finance/constants";
import { centavosParaReais, formatCurrency, formatDate } from "@/lib/format";
import {
  IMPORT_FORMAT_LABELS,
  IMPORT_ORIGEM_LABELS,
  MAPPING_FIELD_LABELS,
  MAPPING_FIELDS,
  type MappingField,
} from "@/lib/import/constants";
import { totaisPorStatus } from "@/lib/import/totals";
import {
  divisaoDaLinha,
  divisaoPorStatus,
  type DivisaoDoLote,
} from "@/lib/import/split-totals";
import {
  coberturaDaFatura,
  type CoberturaFatura,
} from "@/lib/import/cobertura";
import {
  cancelImportBatch,
  commitImport,
  remapImportBatch,
  setImportBatchCompetencia,
  undoImportBatch,
  updateImportRow,
} from "@/lib/actions/imports";
import type {
  ImportBatchWithTarget,
  ImportRowWithRelations,
} from "@/types/database";

const NONE = "none";

type Categoria = { id: string; name: string; color: string | null };
type PersonOption = { id: string; nome: string };

export function ImportReview({
  batch,
  rows,
  categories,
  people,
  today,
}: {
  batch: ImportBatchWithTarget;
  rows: ImportRowWithRelations[];
  categories: Categoria[];
  people: PersonOption[];
  /** 'yyyy-MM-dd' de hoje, vindo do servidor (o fuso do aparelho não decide nada aqui). */
  today: string;
}) {
  const router = useRouter();
  const isCancelado = batch.status === "cancelado";
  const isImportado = batch.status === "importado";
  const isDone = isImportado || isCancelado;

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const paraImportar = counts["para_importar"] ?? 0;

  // Total monetário do que será criado: enquanto revisa, soma das linhas "para importar"
  // (ignoradas e duplicadas fora); depois de importado, soma do que de fato entrou.
  const totais = totaisPorStatus(rows, isDone ? "importada" : "para_importar");
  // Lote já importado pode ter linha destravada depois ("não é duplicidade"): ela ainda não
  // está na fatura, e o total acima — que soma as importadas — não a conta. Mostrar o pendente
  // ao lado é o que impede o usuário de achar que a fatura já fechou.
  const pendentes = isImportado ? totaisPorStatus(rows, "para_importar") : null;
  // Quanto do total acima é meu e quanto é de cada pessoa. Mesmo status do total: a quebra
  // sempre descreve o número que está do lado dela, nunca outro conjunto de linhas.
  const divisao = divisaoPorStatus(rows, isDone ? "importada" : "para_importar");
  const temReceitas = totais.receitas > 0;
  // Em fatura de cartão, "receita" significa estorno/crédito (reduz a fatura).
  const creditoLabel = batch.origem === "cartao" ? "Estornos" : "Receitas";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/importar">
            <ArrowLeft /> Voltar
          </Link>
        </Button>
        <ImportBatchStatusBadge status={batch.status} />
      </div>

      {/* Resumo do lote */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">{batch.file_name}</span>
            <span className="text-xs text-muted-foreground">
              {IMPORT_FORMAT_LABELS[batch.formato]} ·{" "}
              {IMPORT_ORIGEM_LABELS[batch.origem]} ·{" "}
              {batch.card?.nome ?? batch.account?.name ?? "—"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Chip label="Total" value={rows.length} />
            <Chip label="Para importar" value={counts["para_importar"] ?? 0} tone="emerald" />
            <Chip label="Duplicadas" value={counts["duplicada"] ?? 0} tone="amber" />
            <Chip label="Ignoradas" value={counts["ignorada"] ?? 0} tone="muted" />
            <Chip label="Erros" value={counts["erro"] ?? 0} tone="destructive" />
            {isDone && (
              <Chip label="Importadas" value={counts["importada"] ?? 0} tone="sky" />
            )}
          </div>

          {/* Total monetário — para conferir contra o valor da fatura/extrato. */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-border pt-3">
            <div className="flex flex-col">
              <span className="text-sm font-medium">
                {isDone ? "Total importado" : "Total a importar"}
              </span>
              <span className="text-xs text-muted-foreground">
                {isDone
                  ? "Soma das linhas efetivamente importadas."
                  : "Soma das linhas marcadas para importar — ignoradas e duplicadas fora."}
                {temReceitas &&
                  ` Líquido (despesas − ${creditoLabel.toLowerCase()}).`}
              </span>
            </div>
            <span className="text-lg font-semibold tabular-nums">
              {formatCurrency(totais.liquido)}
            </span>
          </div>

          {temReceitas && (
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
              <span>
                Despesas{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {formatCurrency(totais.despesas)}
                </span>
              </span>
              <span>
                {creditoLabel}{" "}
                <span className="font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
                  −{formatCurrency(totais.receitas)}
                </span>
              </span>
            </div>
          )}

          <DivisaoDoLoteLinha divisao={divisao} people={people} />

          {pendentes && pendentes.count > 0 && (
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg bg-amber-500/10 px-3 py-2 text-xs ring-1 ring-amber-500/20">
              <span className="text-amber-700 dark:text-amber-400">
                {pendentes.count} linha(s) marcada(s) para importar ainda{" "}
                <strong>não entraram</strong> nesta fatura.
              </span>
              <span className="font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                {formatCurrency(pendentes.liquido)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {batch.origem === "cartao" && (
        <FaturaCompetencia
          batch={batch}
          isDone={isDone}
          cobertura={coberturaDaFatura({
            datas: rows.map((r) => r.data_norm),
            competencia: batch.competencia_fatura,
            diaFechamento: batch.card?.dia_fechamento,
            diaVencimento: batch.card?.dia_vencimento,
            hoje: today,
          })}
        />
      )}

      {isDone ? (
        <>
          <ResultBanner status={batch.status} importadas={counts["importada"] ?? 0} />
          {/* Lote importado ainda aceita uma segunda rodada: só as linhas `para_importar`
              entram, então destravar uma duplicada depois do commit tem para onde ir. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {isImportado && paraImportar > 0 ? (
              <p className="text-sm text-muted-foreground">
                {paraImportar} linha(s) foram marcadas para importar depois desta
                importação. Importe-as para entrarem na fatura.
              </p>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              {(counts["importada"] ?? 0) > 0 && (
                <UndoButton
                  batchId={batch.id}
                  importadas={counts["importada"] ?? 0}
                  onDone={() => router.refresh()}
                />
              )}
              {isImportado && paraImportar > 0 && (
                <ImportButton
                  batchId={batch.id}
                  paraImportar={paraImportar}
                  onDone={() => router.refresh()}
                  label="Importar pendentes"
                />
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <MappingEditor batch={batch} />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {paraImportar} lançamento(s) prontos para importar. Duplicatas não
              entram por padrão.
            </p>
            <div className="flex items-center gap-2">
              <CancelButton
                batchId={batch.id}
                onDone={() => router.refresh()}
              />
              <ImportButton
                batchId={batch.id}
                paraImportar={paraImportar}
                onDone={() => router.refresh()}
              />
            </div>
          </div>
        </>
      )}

      {/* Tabela de revisão */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Descrição</th>
                <th className="px-3 py-2 text-right font-medium">Valor</th>
                <th className="px-3 py-2 font-medium">Categoria</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">
                  {isCancelado ? "Lançamento" : "Ações"}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <RowLine
                  key={r.id}
                  row={r}
                  categories={categories}
                  people={people}
                  loteCancelado={isCancelado}
                  origem={batch.origem}
                  onChanged={() => router.refresh()}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/** Nome da pessoa pelo id; sem cadastro casado, um rótulo neutro em vez do uuid cru. */
function nomeDaPessoa(people: PersonOption[], personId: string): string {
  return people.find((p) => p.id === personId)?.nome ?? "Pessoa";
}

/**
 * Quebra do total do lote em "meu × cada pessoa". Só aparece havendo terceiro — num lote
 * inteiramente pessoal a linha repetiria o total logo acima dela.
 */
function DivisaoDoLoteLinha({
  divisao,
  people,
}: {
  divisao: DivisaoDoLote;
  people: PersonOption[];
}) {
  if (!divisao.temTerceiros && !divisao.parcial) return null;
  return (
    <div className="space-y-1">
      {divisao.temTerceiros && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="min-w-0">
            meu{" "}
            <span className="font-medium tabular-nums text-foreground">
              {formatCurrency(divisao.meu)}
            </span>
          </span>
          {divisao.porPessoa.map((p) => (
            <span key={p.personId} className="min-w-0">
              <span className="truncate">{nomeDaPessoa(people, p.personId)}</span>{" "}
              <span className="font-medium tabular-nums text-foreground">
                {formatCurrency(p.valor)}
              </span>
            </span>
          ))}
        </div>
      )}
      {divisao.parcial && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {divisao.naoResolvidas} linha(s) com divisão que não fecha com o próprio
          valor ficaram <strong>fora desta conta</strong>. Abra a divisão da linha
          para corrigir.
        </p>
      )}
    </div>
  );
}

/**
 * Divisão de UMA linha, ao lado da badge de classificação. Fica na coluna Descrição, e não na
 * de Valor: aquela é estreita e alinhada à direita, e nome de pessoa ali empurra a tabela na
 * horizontal (regra 3 de responsividade). Em "de terceiro" o "meu R$ 0,00" é omitido — a badge
 * já disse, e o zero só ocuparia espaço.
 */
function DivisaoDaLinhaResumo({
  row,
  people,
}: {
  row: ImportRowWithRelations;
  people: PersonOption[];
}) {
  const d = divisaoDaLinha({
    status: row.status,
    valor: row.valor,
    tipo: row.tipo,
    classificacao: row.classificacao,
    split_parts: row.split_parts,
  });

  if (!d.ok) {
    return (
      <span className="text-[11px] text-amber-700 dark:text-amber-400">
        Divisão não fecha com o valor da linha.
      </span>
    );
  }
  if (d.partes.length === 0) return null;

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
      {d.meuCentavos !== 0 && (
        <span className="min-w-0">
          meu{" "}
          <span className="font-medium tabular-nums text-foreground">
            {formatCurrency(centavosParaReais(d.meuCentavos))}
          </span>
        </span>
      )}
      {d.partes.map((p) => (
        <span key={p.personId} className="min-w-0">
          <span className="truncate">{nomeDaPessoa(people, p.personId)}</span>{" "}
          <span className="font-medium tabular-nums text-foreground">
            {formatCurrency(centavosParaReais(p.valorCentavos))}
          </span>
        </span>
      ))}
    </span>
  );
}

function Chip({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number;
  tone?: "muted" | "emerald" | "amber" | "destructive" | "sky";
}) {
  const toneClass = {
    muted: "bg-muted text-muted-foreground ring-border",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20",
    destructive: "bg-destructive/10 text-destructive ring-destructive/20",
    sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-sky-500/20",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ring-1",
        toneClass,
      )}
    >
      <span className="font-semibold tabular-nums">{value}</span>
      {label}
    </span>
  );
}

const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** 'yyyy-MM-01' → "Junho de 2026". Aceita 'yyyy-MM' também. */
function formatCompetencia(competencia: string): string {
  const [y, m] = competencia.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return competencia;
  return `${MESES_PT[m - 1]} de ${y}`;
}

/**
 * Fatura de destino (cartão): mês ao qual TODAS as linhas pertencem. Âncora das parcelas — a
 * parcela "k" entra nessa fatura e "k+1, k+2…" nos meses seguintes; última parcela e à vista
 * também. Detectada na importação a partir das compras à vista; editável aqui antes de importar.
 */
function FaturaCompetencia({
  batch,
  isDone,
  cobertura,
}: {
  batch: ImportBatchWithTarget;
  isDone: boolean;
  cobertura: CoberturaFatura | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const value = batch.competencia_fatura
    ? batch.competencia_fatura.slice(0, 7) // 'yyyy-MM'
    : "";

  async function change(mes: string) {
    setSaving(true);
    try {
      const res = await setImportBatchCompetencia(
        batch.id,
        mes ? `${mes}-01` : null,
      );
      if (res.ok) {
        toast.success("Mês da fatura atualizado.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        {/* Arquivo que termina antes do fechamento importa fatura incompleta — e isso não
            aparece em nenhum outro lugar, porque a revisão só consegue conferir o que ESTÁ
            no arquivo. Foi assim que uma fatura entrou R$ 7,96 menor que a do banco. */}
        {cobertura && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs ring-1 ring-amber-500/20">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 text-amber-700 dark:text-amber-400">
              O arquivo vai até <strong>{formatDate(cobertura.ultimaData)}</strong>,
              mas esta fatura só fecha em{" "}
              <strong>{formatDate(cobertura.dataFechamento)}</strong> —{" "}
              {cobertura.diasDescobertos} dia(s) sem cobertura. Compras desse período
              não estão no arquivo e{" "}
              {isDone ? "podem não ter entrado" : "não vão entrar"} na fatura. Se o
              total não bater com o do banco, exporte o arquivo de novo depois do
              fechamento.
            </div>
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2">
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">Fatura de destino</span>
              <span className="text-xs text-muted-foreground">
                {isDone
                  ? "Mês em que as linhas (incl. parcelas) entraram."
                  : "Mês desta fatura. As parcelas entram a partir dele — confira antes de importar."}
              </span>
              {!isDone && !batch.competencia_fatura && (
                <span className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  Não detectamos o mês automaticamente — selecione para as
                  parcelas caírem na fatura certa.
                </span>
              )}
            </div>
          </div>
          {isDone ? (
            <span className="text-sm font-semibold">
              {batch.competencia_fatura
                ? formatCompetencia(batch.competencia_fatura)
                : "—"}
            </span>
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              {saving && (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
              <input
                type="month"
                aria-label="Mês da fatura"
                value={value}
                disabled={saving}
                onChange={(e) => change(e.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 [color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ResultBanner({
  status,
  importadas,
}: {
  status: string;
  importadas: number;
}) {
  if (status === "cancelado") {
    return (
      <div className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground ring-1 ring-border">
        Este lote foi cancelado. As transações eventualmente já importadas
        continuam no sistema.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-400">
      <CheckCircle2 className="size-4 shrink-0" />
      <span>
        Importação concluída: <strong>{importadas}</strong> lançamento(s) criados.
        Veja-os em{" "}
        <Link href="/financeiro/lancamentos" className="underline">
          Lançamentos
        </Link>{" "}
        e nas faturas.
      </span>
    </div>
  );
}

function MappingEditor({ batch }: { batch: ImportBatchWithTarget }) {
  const router = useRouter();
  const headers = batch.column_mapping.headers ?? [];
  const [open, setOpen] = React.useState(false);
  const [fields, setFields] = React.useState<Record<string, string>>(() => {
    const f = batch.column_mapping.fields ?? {};
    const init: Record<string, string> = {};
    for (const key of MAPPING_FIELDS) {
      const v = (f as Record<string, number | undefined>)[key];
      init[key] = v != null ? String(v) : NONE;
    }
    return init;
  });
  const [sinal, setSinal] = React.useState(batch.sinal_negativo_despesa);
  const [saving, setSaving] = React.useState(false);

  async function apply() {
    setSaving(true);
    try {
      const out: Record<string, number> = {};
      for (const key of MAPPING_FIELDS) {
        if (fields[key] !== NONE) out[key] = Number(fields[key]);
      }
      const res = await remapImportBatch(batch.id, {
        fields: out,
        sinal_negativo_despesa: sinal,
      });
      if (res.ok) {
        toast.success("Mapeamento aplicado.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <Settings2 className="size-4 text-primary" /> Mapeamento de colunas
          </span>
          <span className="text-xs text-muted-foreground">
            {open ? "Ocultar" : "Ajustar"}
          </span>
        </button>

        {open && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {MAPPING_FIELDS.map((field: MappingField) => (
                <div key={field} className="space-y-1.5">
                  <Label className="text-xs">{MAPPING_FIELD_LABELS[field]}</Label>
                  <Select
                    value={fields[field]}
                    onValueChange={(v) =>
                      setFields((prev) => ({ ...prev, [field]: v }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Não mapear</SelectItem>
                      {headers.map((h, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {h || `Coluna ${i + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {/* Convenção de sinal do arquivo. Em fatura ela é detectada na importação (OFX traz
                compra negativa; planilha traz compra positiva) e fica aqui para corrigir se a
                detecção errar — com a convenção invertida a fatura inteira vira estorno. */}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/40 p-3">
              <div className="flex min-w-0 flex-col">
                <Label htmlFor="map-sinal" className="text-xs">
                  {batch.origem === "cartao"
                    ? "Valores negativos são compras"
                    : "Valores negativos são despesas"}
                </Label>
                {batch.origem === "cartao" && (
                  <span className="text-xs text-muted-foreground">
                    Detectado do arquivo. Ligado para OFX (compra negativa); desligado
                    para planilha de fatura (compra positiva, estorno negativo).
                  </span>
                )}
              </div>
              <Switch
                id="map-sinal"
                checked={sinal}
                onCheckedChange={setSinal}
                className="shrink-0"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Reaplicar o mapeamento recalcula valores, categorias e duplicados —
              ajustes manuais por linha são refeitos.
            </p>
            <div className="flex justify-end">
              <Button size="sm" onClick={apply} disabled={saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Check />}
                Aplicar mapeamento
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Diálogo de confirmação genérico (importar/cancelar exigem confirmação explícita). */
function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  loadingLabel,
  variant = "default",
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  loadingLabel: string;
  variant?: "default" | "outline" | "destructive";
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  async function handle() {
    setLoading(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Voltar
          </Button>
          <Button variant={variant} onClick={handle} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : null}
            {loading ? loadingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportButton({
  batchId,
  paraImportar,
  onDone,
  label = "Importar",
}: {
  batchId: string;
  paraImportar: number;
  onDone: () => void;
  label?: string;
}) {
  async function run() {
    const res = await commitImport(batchId);
    if (res.ok) {
      toast.success(
        `${res.data.importadas} importado(s)` +
          (res.data.falhas ? ` · ${res.data.falhas} com erro` : ""),
      );
      onDone();
    } else {
      toast.error(res.error);
    }
  }
  return (
    <ConfirmDialog
      title="Importar lançamentos"
      description={`Criar ${paraImportar} lançamento(s) a partir das linhas marcadas para importar. Duplicatas e linhas ignoradas não entram, e o que já foi importado não é recriado.`}
      confirmLabel={label}
      loadingLabel="Importando…"
      onConfirm={run}
      trigger={
        <Button disabled={paraImportar === 0}>
          <Upload /> {label}
        </Button>
      }
    />
  );
}

/**
 * Desfaz a importação: apaga os lançamentos criados por este lote e devolve as linhas para
 * revisão. Existe porque, sem ele, corrigir uma importação errada exigia caçar lançamento por
 * lançamento — e reimportar acusava os próprios lançamentos como duplicata.
 */
function UndoButton({
  batchId,
  importadas,
  onDone,
}: {
  batchId: string;
  importadas: number;
  onDone: () => void;
}) {
  async function run() {
    const res = await undoImportBatch(batchId);
    if (res.ok) {
      toast.success(
        `${res.data.removidas} lançamento(s) removido(s). O lote voltou para revisão.`,
      );
      onDone();
    } else {
      toast.error(res.error);
    }
  }
  return (
    <ConfirmDialog
      title="Desfazer importação"
      description={`Os ${importadas} lançamento(s) criados por este lote serão APAGADOS (com parcelas, divisões e recebíveis pendentes), e as linhas voltam para revisão. Edições feitas neles depois da importação também se perdem. Fatura já paga ou recebível já cobrado bloqueiam a operação.`}
      confirmLabel="Desfazer importação"
      loadingLabel="Desfazendo…"
      variant="destructive"
      onConfirm={run}
      trigger={
        <Button variant="outline">
          <Undo2 /> Desfazer importação
        </Button>
      }
    />
  );
}

function CancelButton({
  batchId,
  onDone,
}: {
  batchId: string;
  onDone: () => void;
}) {
  async function run() {
    const res = await cancelImportBatch(batchId);
    if (res.ok) {
      toast.success("Lote cancelado.");
      onDone();
    } else {
      toast.error(res.error);
    }
  }
  return (
    <ConfirmDialog
      title="Cancelar lote"
      description="O lote será marcado como cancelado. Transações já importadas continuam no sistema."
      confirmLabel="Cancelar lote"
      loadingLabel="Cancelando…"
      variant="destructive"
      onConfirm={run}
      trigger={
        <Button variant="outline">
          <Ban /> Cancelar lote
        </Button>
      }
    />
  );
}

/**
 * Rótulo do sentido da linha (compra/estorno em fatura; despesa/receita em extrato) com um
 * clique para inverter enquanto a linha é editável. `tipo` é o que decide o caminho de gravação
 * no commit — estorno vai para a fatura como crédito, sem parcelamento e sem divisão.
 */
function SentidoLinha({
  tipo,
  origem,
  editavel,
  disabled,
  onToggle,
}: {
  tipo: "despesa" | "receita";
  origem: "cartao" | "conta";
  editavel: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const labels =
    origem === "cartao"
      ? { despesa: "Compra", receita: "Estorno" }
      : { despesa: "Despesa", receita: "Receita" };
  const label = labels[tipo];
  const outro = labels[tipo === "despesa" ? "receita" : "despesa"];

  if (!editavel) {
    return <span className="text-[11px] text-muted-foreground">{label}</span>;
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      title={`Trocar para ${outro.toLowerCase()}`}
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] text-muted-foreground ring-1 ring-border transition-colors hover:bg-muted disabled:opacity-50"
    >
      <ArrowLeftRight className="size-3" /> {label}
    </button>
  );
}

function RowLine({
  row,
  categories,
  people,
  loteCancelado,
  origem,
  onChanged,
}: {
  row: ImportRowWithRelations;
  categories: Categoria[];
  people: PersonOption[];
  loteCancelado: boolean;
  origem: "cartao" | "conta";
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState(false);

  async function patch(input: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await updateImportRow(row.id, input);
      if (res.ok) onChanged();
      else toast.error(res.error);
    } finally {
      setBusy(false);
    }
  }

  // A linha que virou lançamento é imutável; as demais continuam editáveis mesmo com o lote já
  // importado — é o que dá saída para "isto não é duplicidade" descoberto depois do commit.
  const jaImportada = row.status === "importada" || row.transaction != null;
  const editavel = !loteCancelado && !jaImportada;

  // Só oferece "importar parcelado" quando há parcela FUTURA a gerar: cartão, DESPESA (estorno
  // não é parcelável — o commit manda crédito direto para a fatura), total > 1 e a linha não é
  // a última (k < N). Numa 3/3 não há o que parcelar — já é a última parcela.
  const podeParcelar =
    origem === "cartao" &&
    row.tipo === "despesa" &&
    (row.parcelas_total ?? 0) > 1 &&
    (row.parcela ?? 0) < (row.parcelas_total ?? 0);
  const isOpenForEdit =
    editavel && (row.status === "para_importar" || row.status === "duplicada");
  // Divisão na importação (Fase 05+06): só despesa com valor, enquanto editável.
  const podeDividir = isOpenForEdit && row.tipo === "despesa" && row.valor != null;
  const isShared = row.classificacao !== "pessoal";

  return (
    <tr
      className={cn(
        "border-b border-border/60 align-top",
        (row.status === "ignorada" || row.status === "duplicada") &&
          "opacity-60",
        row.status === "erro" && "bg-destructive/5",
      )}
    >
      <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
        {row.linha_index}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {row.data_norm ? formatDate(row.data_norm) : "—"}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1">
          <span className="line-clamp-2 max-w-[22rem]">
            {row.descricao || "—"}
          </span>
          {row.parcela != null && row.parcelas_total != null && (
            <span className="flex items-center gap-1">
              <InstallmentBadge
                numero={row.parcela}
                total={row.parcelas_total}
              />
              {podeParcelar &&
                editavel &&
                (row.import_as === "parcelamento" ? (
                  // Marcado como parcelamento: chip com "×" para cancelar fácil (reverte p/ avulso).
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pr-1 pl-2 text-[11px] text-primary ring-1 ring-primary/20">
                    Como parcelamento
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => patch({ import_as: "single" })}
                      aria-label="Cancelar parcelamento"
                      title="Cancelar parcelamento"
                      className="rounded-full p-0.5 transition-colors hover:bg-primary/20 disabled:opacity-50"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => patch({ import_as: "parcelamento" })}
                    className="rounded-full px-2 py-0.5 text-[11px] text-muted-foreground ring-1 ring-border transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    Importar parcelado?
                  </button>
                ))}
            </span>
          )}
          {isShared && (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary ring-1 ring-primary/20">
                <Users className="size-3" />{" "}
                {CLASSIFICACAO_LABELS[row.classificacao]}
              </span>
              <DivisaoDaLinhaResumo row={row} people={people} />
            </span>
          )}
          {row.motivo && (
            <span className="text-xs text-muted-foreground">{row.motivo}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <div className="flex flex-col items-end gap-0.5">
          <span
            className={cn(
              "tabular-nums",
              row.tipo === "receita"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-foreground",
            )}
          >
            {row.tipo === "receita" ? "−" : ""}
            {row.valor != null ? formatCurrency(row.valor) : "—"}
          </span>
          {/* Sentido da linha, sempre visível e corrigível: um arquivo com convenção de sinal
              fora do padrão fazia compra virar estorno sem que a tela desse saída. Estorno não
              é parcelável nem divisível — por isso trocar aqui reabre as duas opções. */}
          {row.tipo && (
            <SentidoLinha
              tipo={row.tipo}
              origem={origem}
              editavel={isOpenForEdit}
              disabled={busy}
              onToggle={() =>
                patch({ tipo: row.tipo === "despesa" ? "receita" : "despesa" })
              }
            />
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        {!editavel ? (
          <span className="text-xs text-muted-foreground">
            {row.categoria?.name ?? "—"}
          </span>
        ) : (
          <Select
            value={row.categoria_sugerida_id ?? NONE}
            onValueChange={(v) =>
              patch({ categoria_sugerida_id: v === NONE ? "" : v })
            }
          >
            <SelectTrigger className="h-8 w-full min-w-[10rem]" disabled={busy}>
              <SelectValue placeholder="Sem categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sem categoria</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </td>
      <td className="px-3 py-2">
        <ImportRowStatusBadge status={row.status} />
      </td>
      {editavel ? (
        <td className="px-3 py-2">
          <div className="flex items-center gap-1">
            {podeDividir && (
              <ImportRowSplitDialog
                rowId={row.id}
                descricao={row.descricao ?? ""}
                valor={row.valor ?? 0}
                classificacao={row.classificacao}
                splitParts={row.split_parts}
                people={people}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Dividir com terceiros"
                    className={cn(isShared && "text-primary")}
                  >
                    <Users />
                  </Button>
                }
              />
            )}
            {row.status === "duplicada" && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => patch({ status: "para_importar" })}
                className="text-emerald-600 hover:text-emerald-700"
              >
                Importar
              </Button>
            )}
            {isOpenForEdit && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Ignorar linha"
                disabled={busy}
                onClick={() => patch({ status: "ignorada" })}
              >
                <Ban />
              </Button>
            )}
            {row.status === "ignorada" && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Incluir linha"
                disabled={busy}
                onClick={() => patch({ status: "para_importar" })}
              >
                <RotateCcw />
              </Button>
            )}
            {row.status === "erro" && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Ignorar linha"
                disabled={busy}
                onClick={() => patch({ status: "ignorada" })}
              >
                <Ban />
              </Button>
            )}
          </div>
        </td>
      ) : (
        <td className="px-3 py-2">
          {row.transaction ? (
            <Link
              href="/financeiro/lancamentos"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="size-3" /> Ver
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
      )}
    </tr>
  );
}
