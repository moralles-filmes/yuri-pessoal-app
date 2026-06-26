import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  ACCOUNT_TYPE_LABELS,
  CARD_BRAND_LABELS,
  CLASSIFICACAO_LABELS,
  INSTALLMENT_PURCHASE_STATUS_LABELS,
  INSTALLMENT_STATUS_LABELS,
  RECEIVABLE_STATUS_LABELS,
  STATEMENT_STATUS_LABELS,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
  type AccountType,
  type CardBrand,
  type Classificacao,
  type InstallmentPurchaseStatus,
  type InstallmentStatus,
  type ReceivableStatus,
  type StatementStatus,
  type TransactionStatus,
  type TransactionType,
} from "@/lib/finance/constants";

const STATUS_CLASSES: Record<TransactionStatus, string> = {
  pendente:
    "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20",
  pago: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20",
  recebido:
    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20",
  cancelado:
    "bg-muted text-muted-foreground ring-1 ring-border line-through decoration-1",
};

export function StatusBadge({ status }: { status: TransactionStatus }) {
  return (
    <Badge variant="secondary" className={cn("border-0", STATUS_CLASSES[status])}>
      {TRANSACTION_STATUS_LABELS[status]}
    </Badge>
  );
}

const TYPE_CLASSES: Record<TransactionType, string> = {
  receita: "text-emerald-600 dark:text-emerald-400",
  despesa: "text-destructive",
  transferencia: "text-sky-600 dark:text-sky-400",
  ajuste: "text-muted-foreground",
};

export function TransactionTypeBadge({ type }: { type: TransactionType }) {
  return (
    <Badge variant="outline" className={cn("gap-1", TYPE_CLASSES[type])}>
      {TRANSACTION_TYPE_LABELS[type]}
    </Badge>
  );
}

export function AccountTypeBadge({ type }: { type: AccountType }) {
  return (
    <Badge variant="secondary" className="font-normal">
      {ACCOUNT_TYPE_LABELS[type]}
    </Badge>
  );
}

export function CardBrandBadge({ brand }: { brand: CardBrand }) {
  return (
    <Badge variant="secondary" className="font-normal">
      {CARD_BRAND_LABELS[brand]}
    </Badge>
  );
}

const STATEMENT_STATUS_CLASSES: Record<StatementStatus, string> = {
  aberta:
    "bg-muted text-muted-foreground ring-1 ring-border",
  fechada:
    "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20",
  paga: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20",
  atrasada:
    "bg-destructive/10 text-destructive ring-1 ring-destructive/20",
};

/** Badge do status efetivo da fatura (aberta/fechada/paga/atrasada). */
export function StatementStatusBadge({ status }: { status: StatementStatus }) {
  return (
    <Badge
      variant="secondary"
      className={cn("border-0", STATEMENT_STATUS_CLASSES[status])}
    >
      {STATEMENT_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Badge "i/N" de uma parcela (ex.: "3/12"). Reutilizável em lançamentos/faturas/parcelamentos. */
export function InstallmentBadge({
  numero,
  total,
  className,
}: {
  numero: number;
  total: number;
  className?: string;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "border-0 bg-primary/10 text-primary tabular-nums",
        className,
      )}
    >
      {numero}/{total}
    </Badge>
  );
}

const INSTALLMENT_STATUS_CLASSES: Record<InstallmentStatus, string> = {
  ativa: "bg-muted text-muted-foreground ring-1 ring-border",
  paga: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20",
  cancelada:
    "bg-muted text-muted-foreground ring-1 ring-border line-through decoration-1",
};

/** Badge do status de uma PARCELA (ativa/paga/cancelada). */
export function InstallmentStatusBadge({
  status,
}: {
  status: InstallmentStatus;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn("border-0", INSTALLMENT_STATUS_CLASSES[status])}
    >
      {INSTALLMENT_STATUS_LABELS[status]}
    </Badge>
  );
}

const INSTALLMENT_PURCHASE_STATUS_CLASSES: Record<
  InstallmentPurchaseStatus,
  string
> = {
  ativo: "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/20",
  finalizado:
    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20",
  cancelado:
    "bg-muted text-muted-foreground ring-1 ring-border line-through decoration-1",
};

/** Badge do status agregado de um PARCELAMENTO (ativo/finalizado/cancelado). */
export function InstallmentPurchaseStatusBadge({
  status,
}: {
  status: InstallmentPurchaseStatus;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn("border-0", INSTALLMENT_PURCHASE_STATUS_CLASSES[status])}
    >
      {INSTALLMENT_PURCHASE_STATUS_LABELS[status]}
    </Badge>
  );
}

const RECEIVABLE_STATUS_CLASSES: Record<ReceivableStatus, string> = {
  pendente:
    "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20",
  cobrado: "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/20",
  pago: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20",
  ignorado:
    "bg-muted text-muted-foreground ring-1 ring-border line-through decoration-1",
};

/** Badge do status de um recebível (pendente/cobrado/recebido/ignorado). */
export function ReceivableStatusBadge({ status }: { status: ReceivableStatus }) {
  return (
    <Badge
      variant="secondary"
      className={cn("border-0", RECEIVABLE_STATUS_CLASSES[status])}
    >
      {RECEIVABLE_STATUS_LABELS[status]}
    </Badge>
  );
}

const CLASSIFICACAO_CLASSES: Record<Classificacao, string> = {
  pessoal: "bg-muted text-muted-foreground ring-1 ring-border",
  terceiro:
    "bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-1 ring-violet-500/20",
  compartilhada:
    "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/20",
};

/** Badge da classificação de uma despesa (pessoal/de terceiro/compartilhada). */
export function ClassificacaoBadge({ value }: { value: Classificacao }) {
  return (
    <Badge
      variant="secondary"
      className={cn("border-0", CLASSIFICACAO_CLASSES[value])}
    >
      {CLASSIFICACAO_LABELS[value]}
    </Badge>
  );
}

/** Pílula de categoria: ponto colorido + nome. */
export function CategoryPill({
  name,
  color,
  className,
}: {
  name: string;
  color?: string | null;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full ring-1 ring-foreground/10"
        style={{ backgroundColor: color ?? "var(--muted-foreground)" }}
      />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Valor monetário com cor por sentido (entrada verde, saída vermelha). */
export function SignedAmount({
  value,
  formatted,
  className,
}: {
  value: number;
  formatted: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        value > 0 && "text-emerald-600 dark:text-emerald-400",
        value < 0 && "text-destructive",
        className,
      )}
    >
      {formatted}
    </span>
  );
}
