import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  LANGUAGE_SKILL_EMOJI,
  LANGUAGE_SKILL_LABELS,
  STUDY_CATEGORY_EMOJI,
  STUDY_CATEGORY_LABELS,
  STUDY_DIFFICULTY_COLORS,
  STUDY_DIFFICULTY_LABELS,
  STUDY_PRIORITY_COLORS,
  STUDY_PRIORITY_LABELS,
  STUDY_STATUS_COLORS,
  STUDY_STATUS_LABELS,
  VOCAB_MASTERY_COLORS,
  VOCAB_MASTERY_LABELS,
  type LanguageSkill,
  type StudyCategory,
  type StudyDifficulty,
  type StudyPriority,
  type StudyStatus,
  type VocabMastery,
} from "@/lib/studies/constants";

/** Badge com ponto colorido + rótulo (base reutilizada pelos badges de estudos). */
function DotBadge({ color, label }: { color: string; label: string }) {
  return (
    <Badge
      variant="secondary"
      className="gap-1.5 border-0 bg-muted"
      style={{ color }}
    >
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </Badge>
  );
}

export function StudyStatusBadge({ status }: { status: StudyStatus }) {
  return <DotBadge color={STUDY_STATUS_COLORS[status]} label={STUDY_STATUS_LABELS[status]} />;
}

export function StudyCategoryBadge({ category }: { category: StudyCategory }) {
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <span aria-hidden>{STUDY_CATEGORY_EMOJI[category]}</span>
      {STUDY_CATEGORY_LABELS[category]}
    </Badge>
  );
}

export function StudyPriorityBadge({ priority }: { priority: StudyPriority }) {
  if (priority === "media") return null;
  return (
    <DotBadge
      color={STUDY_PRIORITY_COLORS[priority]}
      label={`Prioridade ${STUDY_PRIORITY_LABELS[priority].toLowerCase()}`}
    />
  );
}

export function StudyDifficultyBadge({ difficulty }: { difficulty: StudyDifficulty }) {
  return (
    <DotBadge
      color={STUDY_DIFFICULTY_COLORS[difficulty]}
      label={STUDY_DIFFICULTY_LABELS[difficulty]}
    />
  );
}

export function VocabMasteryBadge({ mastery }: { mastery: VocabMastery }) {
  return <DotBadge color={VOCAB_MASTERY_COLORS[mastery]} label={VOCAB_MASTERY_LABELS[mastery]} />;
}

export function SkillBadge({ skill }: { skill: LanguageSkill }) {
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <span aria-hidden>{LANGUAGE_SKILL_EMOJI[skill]}</span>
      {LANGUAGE_SKILL_LABELS[skill]}
    </Badge>
  );
}

/** Ícone do curso: usa o ícone próprio ou o emoji padrão da categoria. */
export function courseIcon(icon: string | null, category: StudyCategory): string {
  return icon && icon.trim() ? icon : STUDY_CATEGORY_EMOJI[category];
}

/** Barra de progresso do curso (0–100%), com cor opcional da capa. */
export function StudyProgressBar({
  value,
  color,
  className,
}: {
  value: number;
  color?: string | null;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: color ?? "var(--primary)" }}
      />
    </div>
  );
}
