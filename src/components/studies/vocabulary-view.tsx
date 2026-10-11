"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Languages, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import { useLazyDialog } from "@/components/shared/use-lazy-dialog";
import { cn } from "@/lib/utils";
import { deleteVocabulary, setVocabMastery } from "@/lib/actions/studies";
import {
  VOCAB_MASTERY,
  VOCAB_MASTERY_COLORS,
  VOCAB_MASTERY_LABELS,
  type VocabMastery,
} from "@/lib/studies/constants";
import type { StudyVocabularyRow } from "@/types/database";

// ⛔ objeto literal escrito ali mesmo — o compilador o lê estaticamente (regra 4 do carregamento sob demanda)
const VocabFormDialog = dynamic(
  () => import("./vocab-form-dialog").then((m) => m.VocabFormDialog),
  { ssr: false },
);

const FILTERS = ["todos", ...VOCAB_MASTERY] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABELS: Record<Filter, string> = {
  todos: "Todos",
  novo: VOCAB_MASTERY_LABELS.novo,
  aprendendo: VOCAB_MASTERY_LABELS.aprendendo,
  dominado: VOCAB_MASTERY_LABELS.dominado,
};

export function VocabularyView({
  courseId,
  vocabulary,
}: {
  courseId: string;
  vocabulary: StudyVocabularyRow[];
}) {
  const [filter, setFilter] = React.useState<Filter>("todos");
  const [formOpen, setFormOpen] = React.useState(false);
  const formMontado = useLazyDialog(formOpen);
  const [editing, setEditing] = React.useState<StudyVocabularyRow>();

  const counts = React.useMemo(() => {
    const c: Record<VocabMastery, number> = { novo: 0, aprendendo: 0, dominado: 0 };
    for (const v of vocabulary) c[v.mastery]++;
    return c;
  }, [vocabulary]);

  const shown =
    filter === "todos"
      ? vocabulary
      : vocabulary.filter((v) => v.mastery === filter);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Vocabulário ({vocabulary.length})
        </h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        >
          <Plus /> Termo
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              // Foco visível: o anel do sistema (o mesmo de `Button`), não o `outline: auto`.
              "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
              filter === f
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {FILTER_LABELS[f]}
            {f !== "todos" && ` (${counts[f as VocabMastery]})`}
          </button>
        ))}
      </div>

      {vocabulary.length === 0 ? (
        <EmptyState
          icon={Languages}
          title="Sem vocabulário"
          description="Adicione termos com tradução, exemplo e nível de domínio."
        >
          <Button
            size="sm"
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus /> Adicionar termo
          </Button>
        </EmptyState>
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhum termo neste nível.
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((v) => (
            <VocabRow
              key={v.id}
              vocab={v}
              onEdit={() => {
                setEditing(v);
                setFormOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {formMontado && (
        <VocabFormDialog
          courseId={courseId}
          vocab={editing}
          open={formOpen}
          onOpenChange={setFormOpen}
        />
      )}
    </div>
  );
}

function VocabRow({
  vocab,
  onEdit,
}: {
  vocab: StudyVocabularyRow;
  onEdit: () => void;
}) {
  const router = useRouter();

  async function changeMastery(value: VocabMastery) {
    const res = await setVocabMastery(vocab.id, value);
    if (res.ok) router.refresh();
    else toast.error(res.error ?? "Não foi possível atualizar.");
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <span
        aria-hidden
        className="mt-1.5 size-2 shrink-0 rounded-full"
        style={{ backgroundColor: VOCAB_MASTERY_COLORS[vocab.mastery] }}
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {vocab.term}
          {vocab.translation && (
            <span className="text-muted-foreground"> — {vocab.translation}</span>
          )}
        </p>
        {vocab.example && (
          <p className="text-xs italic text-muted-foreground">“{vocab.example}”</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Select value={vocab.mastery} onValueChange={changeMastery}>
          <SelectTrigger size="sm" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VOCAB_MASTERY.map((m) => (
              <SelectItem key={m} value={m}>
                {VOCAB_MASTERY_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Editar termo"
          onClick={onEdit}
        >
          <Pencil />
        </Button>
        <DeleteConfirmDialog
          title="Excluir termo"
          description={`Excluir "${vocab.term}"?`}
          successMessage="Termo excluído."
          onConfirm={() => deleteVocabulary(vocab.id)}
          trigger={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Excluir termo"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 />
            </Button>
          }
        />
      </div>
    </div>
  );
}
