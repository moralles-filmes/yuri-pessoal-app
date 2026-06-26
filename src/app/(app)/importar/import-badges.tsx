import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  IMPORT_BATCH_STATUS_LABELS,
  IMPORT_ROW_STATUS_LABELS,
  type ImportBatchStatus,
  type ImportRowStatus,
} from "@/lib/import/constants";

const ROW_STATUS_CLASSES: Record<ImportRowStatus, string> = {
  pendente: "bg-muted text-muted-foreground ring-1 ring-border",
  para_importar:
    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20",
  duplicada:
    "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20",
  ignorada:
    "bg-muted text-muted-foreground ring-1 ring-border line-through decoration-1",
  importada:
    "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/20",
  erro: "bg-destructive/10 text-destructive ring-1 ring-destructive/20",
};

/** Badge do status de uma linha de importação. */
export function ImportRowStatusBadge({ status }: { status: ImportRowStatus }) {
  return (
    <Badge variant="secondary" className={cn("border-0", ROW_STATUS_CLASSES[status])}>
      {IMPORT_ROW_STATUS_LABELS[status]}
    </Badge>
  );
}

const BATCH_STATUS_CLASSES: Record<ImportBatchStatus, string> = {
  pendente: "bg-muted text-muted-foreground ring-1 ring-border",
  mapeando:
    "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20",
  revisando:
    "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/20",
  importado:
    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20",
  cancelado:
    "bg-muted text-muted-foreground ring-1 ring-border line-through decoration-1",
};

/** Badge do status de um lote de importação. */
export function ImportBatchStatusBadge({
  status,
}: {
  status: ImportBatchStatus;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn("border-0", BATCH_STATUS_CLASSES[status])}
    >
      {IMPORT_BATCH_STATUS_LABELS[status]}
    </Badge>
  );
}
