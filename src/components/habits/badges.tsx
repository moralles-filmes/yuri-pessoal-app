import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  HABIT_CATEGORY_COLORS,
  HABIT_CATEGORY_EMOJI,
  HABIT_CATEGORY_LABELS,
  HABIT_FREQUENCY_LABELS,
  type HabitCategory,
  type HabitFrequency,
} from "@/lib/habits/constants";

const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Badge da categoria do hábito (cor por categoria, legível em dark/light). */
export function HabitCategoryBadge({ category }: { category: HabitCategory }) {
  return (
    <Badge
      variant="secondary"
      className="gap-1.5 border-0 bg-muted"
      style={{ color: HABIT_CATEGORY_COLORS[category] }}
    >
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ backgroundColor: HABIT_CATEGORY_COLORS[category] }}
      />
      {HABIT_CATEGORY_LABELS[category]}
    </Badge>
  );
}

/** Sequência em destaque dourado (chama com o número). */
export function StreakFlame({
  count,
  className,
  label,
}: {
  count: number;
  className?: string;
  label?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-sm font-medium text-primary",
        className,
      )}
      title={label ?? `Sequência: ${count} dia(s)`}
    >
      <Flame className="size-3.5 fill-primary/20" />
      {count}
    </span>
  );
}

/** Ícone do hábito: usa o ícone próprio ou o emoji padrão da categoria. */
export function habitIcon(
  icon: string | null,
  category: HabitCategory,
): string {
  return icon && icon.trim() ? icon : HABIT_CATEGORY_EMOJI[category];
}

/** Resumo textual da frequência ("Todos os dias", "seg, qua, sex"). */
export function frequencySummary(
  frequency: HabitFrequency,
  weekdays: number[] | null,
): string {
  if (frequency === "diaria") return HABIT_FREQUENCY_LABELS.diaria;
  const days = (weekdays ?? []).map((d) => WEEKDAY_SHORT[d]).join(", ");
  return days || HABIT_FREQUENCY_LABELS[frequency];
}

/** Barra de progresso (feito x meta), com cor opcional do hábito. */
export function HabitProgressBar({
  value,
  target,
  color,
  className,
}: {
  value: number;
  target: number;
  color?: string | null;
  className?: string;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={target}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: color ?? "var(--primary)" }}
      />
    </div>
  );
}
