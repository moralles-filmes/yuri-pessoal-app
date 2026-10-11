"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { applyFieldErrors } from "@/components/financeiro/form-utils";
import { createVocabulary, updateVocabulary } from "@/lib/actions/studies";
import {
  VOCAB_MASTERY,
  VOCAB_MASTERY_LABELS,
  type VocabMastery,
} from "@/lib/studies/constants";
import type { StudyVocabularyRow } from "@/types/database";

type VocabValues = {
  term: string;
  translation: string;
  example: string;
  mastery: VocabMastery;
  next_review_date: string;
};

export function VocabFormDialog({
  courseId,
  vocab,
  open,
  onOpenChange,
}: {
  courseId: string;
  vocab?: StudyVocabularyRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(vocab);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<VocabValues>({
    defaultValues: toValues(vocab),
  });

  React.useEffect(() => {
    if (open) reset(toValues(vocab));
  }, [open, vocab, reset]);

  async function onSubmit(values: VocabValues) {
    const res = isEdit
      ? await updateVocabulary(vocab!.id, values)
      : await createVocabulary(courseId, values);
    if (res.ok) {
      toast.success(isEdit ? "Termo atualizado." : "Termo adicionado.");
      onOpenChange(false);
      router.refresh();
    } else {
      applyFieldErrors(setError, res.fieldErrors);
      toast.error(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar termo" : "Novo termo"}</DialogTitle>
          <DialogDescription>
            Termo, tradução, exemplo e nível de domínio.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="vocab-term">Termo</Label>
              <Input
                id="vocab-term"
                aria-invalid={Boolean(errors.term)}
                {...register("term", { required: "Informe o termo" })}
              />
              {errors.term && (
                <p className="text-xs text-destructive">{errors.term.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vocab-translation">Tradução</Label>
              <Input id="vocab-translation" {...register("translation")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vocab-example">Exemplo</Label>
            <Textarea id="vocab-example" rows={2} {...register("example")} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nível de domínio</Label>
              <Controller
                control={control}
                name="mastery"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
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
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vocab-review">Revisar em</Label>
              <Input
                id="vocab-review"
                type="date"
                {...register("next_review_date")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function toValues(vocab?: StudyVocabularyRow): VocabValues {
  return {
    term: vocab?.term ?? "",
    translation: vocab?.translation ?? "",
    example: vocab?.example ?? "",
    mastery: vocab?.mastery ?? "novo",
    next_review_date: vocab?.next_review_date ?? "",
  };
}
