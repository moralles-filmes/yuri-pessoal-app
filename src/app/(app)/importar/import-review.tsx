"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  Check,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RotateCcw,
  Settings2,
  Upload,
  Users,
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
import { formatCurrency, formatDate } from "@/lib/format";
import {
  IMPORT_FORMAT_LABELS,
  IMPORT_ORIGEM_LABELS,
  MAPPING_FIELD_LABELS,
  MAPPING_FIELDS,
  type MappingField,
} from "@/lib/import/constants";
import { totaisPorStatus } from "@/lib/import/totals";
import {
  cancelImportBatch,
  commitImport,
  remapImportBatch,
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
}: {
  batch: ImportBatchWithTarget;
  rows: ImportRowWithRelations[];
  categories: Categoria[];
  people: PersonOption[];
}) {
  const router = useRouter();
  const isDone = batch.status === "importado" || batch.status === "cancelado";

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const paraImportar = counts["para_importar"] ?? 0;

  // Total monetário do que será criado: enquanto revisa, soma das linhas "para importar"
  // (ignoradas e duplicadas fora); depois de importado, soma do que de fato entrou.
  const totais = totaisPorStatus(rows, isDone ? "importada" : "para_importar");
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
        </CardContent>
      </Card>

      {isDone ? (
        <ResultBanner status={batch.status} importadas={counts["importada"] ?? 0} />
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
                {!isDone && <th className="px-3 py-2 font-medium">Ações</th>}
                {isDone && <th className="px-3 py-2 font-medium">Lançamento</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <RowLine
                  key={r.id}
                  row={r}
                  categories={categories}
                  people={people}
                  isDone={isDone}
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

            {batch.origem === "conta" && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/40 p-3">
                <Label htmlFor="map-sinal" className="text-xs">
                  Valores negativos são despesas
                </Label>
                <Switch
                  id="map-sinal"
                  checked={sinal}
                  onCheckedChange={setSinal}
                />
              </div>
            )}

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
}: {
  batchId: string;
  paraImportar: number;
  onDone: () => void;
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
      description={`Criar ${paraImportar} lançamento(s) a partir das linhas marcadas para importar. Duplicatas e linhas ignoradas não entram.`}
      confirmLabel="Importar"
      loadingLabel="Importando…"
      onConfirm={run}
      trigger={
        <Button disabled={paraImportar === 0}>
          <Upload /> Importar
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

function RowLine({
  row,
  categories,
  people,
  isDone,
  origem,
  onChanged,
}: {
  row: ImportRowWithRelations;
  categories: Categoria[];
  people: PersonOption[];
  isDone: boolean;
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

  const podeParcelar =
    origem === "cartao" && (row.parcelas_total ?? 0) > 1;
  const isOpenForEdit =
    !isDone && (row.status === "para_importar" || row.status === "duplicada");
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
              {podeParcelar && !isDone && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    patch({
                      import_as:
                        row.import_as === "parcelamento"
                          ? "single"
                          : "parcelamento",
                    })
                  }
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] ring-1 transition-colors",
                    row.import_as === "parcelamento"
                      ? "bg-primary/10 text-primary ring-primary/20"
                      : "text-muted-foreground ring-border hover:bg-muted",
                  )}
                >
                  {row.import_as === "parcelamento"
                    ? "Como parcelamento"
                    : "Importar parcelado?"}
                </button>
              )}
            </span>
          )}
          {isShared && (
            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary ring-1 ring-primary/20">
              <Users className="size-3" /> {CLASSIFICACAO_LABELS[row.classificacao]}
            </span>
          )}
          {row.motivo && (
            <span className="text-xs text-muted-foreground">{row.motivo}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
        <span
          className={cn(
            row.tipo === "receita"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-foreground",
          )}
        >
          {row.valor != null ? formatCurrency(row.valor) : "—"}
        </span>
      </td>
      <td className="px-3 py-2">
        {isDone ? (
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
      {!isDone ? (
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
