"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
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
import { applyFieldErrors } from "@/components/financeiro/form-utils";
import { createModule, updateModule } from "@/lib/actions/studies";
import type { StudyModuleWithLessons } from "@/types/database";

type ModuleValues = { title: string; notes: string };

export function ModuleFormDialog({
  courseId,
  module,
  open,
  onOpenChange,
}: {
  courseId: string;
  module?: StudyModuleWithLessons;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(module);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ModuleValues>({
    defaultValues: { title: module?.title ?? "", notes: module?.notes ?? "" },
  });

  React.useEffect(() => {
    if (open) reset({ title: module?.title ?? "", notes: module?.notes ?? "" });
  }, [open, module, reset]);

  async function onSubmit(values: ModuleValues) {
    const res = isEdit
      ? await updateModule(module!.id, values)
      : await createModule(courseId, values);
    if (res.ok) {
      toast.success(isEdit ? "Módulo atualizado." : "Módulo criado.");
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
          <DialogTitle>{isEdit ? "Editar módulo" : "Novo módulo"}</DialogTitle>
          <DialogDescription>Um agrupamento de aulas do curso.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mod-title">Título</Label>
            <Input
              id="mod-title"
              aria-invalid={Boolean(errors.title)}
              {...register("title", { required: "Informe um título" })}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mod-notes">Notas</Label>
            <Textarea id="mod-notes" rows={2} {...register("notes")} />
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
