"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { applyFieldErrors } from "@/components/financeiro/form-utils";
import { createProject, updateProject } from "@/lib/actions/projects";
import { ENTITY_COLOR_PALETTE } from "@/lib/tasks/constants";
import type { ProjectRow } from "@/types/database";

type FormValues = {
  name: string;
  description: string;
  color: string;
  icon: string;
};

function defaults(project?: ProjectRow): FormValues {
  return {
    name: project?.name ?? "",
    description: project?.description ?? "",
    color: project?.color ?? "",
    icon: project?.icon ?? "",
  };
}

export function ProjectFormDialog({
  project,
  trigger,
}: {
  project?: ProjectRow;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const isEdit = Boolean(project);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: defaults(project) });

  React.useEffect(() => {
    if (open) reset(defaults(project));
  }, [open, project, reset]);

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name,
      description: values.description,
      color: values.color,
      icon: values.icon,
    };
    const res = isEdit
      ? await updateProject(project!.id, payload)
      : await createProject(payload);

    if (res.ok) {
      toast.success(isEdit ? "Projeto atualizado." : "Projeto criado.");
      setOpen(false);
      router.refresh();
    } else {
      applyFieldErrors(setError, res.fieldErrors);
      toast.error(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar projeto" : "Novo projeto"}</DialogTitle>
          <DialogDescription>
            Listas para organizar suas tarefas (ex.: Pessoal, Trabalho, Casa).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="proj-icon">Ícone</Label>
              <Input
                id="proj-icon"
                maxLength={2}
                placeholder="📁"
                className="w-14 text-center text-lg"
                {...register("icon")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-name">Nome</Label>
              <Input
                id="proj-name"
                aria-invalid={Boolean(errors.name)}
                {...register("name", { required: "Informe um nome" })}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="proj-desc">Descrição</Label>
            <Textarea id="proj-desc" rows={2} {...register("description")} />
          </div>

          <div className="space-y-1.5">
            <Label>Cor</Label>
            <Controller
              control={control}
              name="color"
              render={({ field }) => (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => field.onChange("")}
                    className={cn(
                      "grid size-7 place-items-center rounded-full border text-xs text-muted-foreground",
                      !field.value && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                    )}
                    aria-label="Sem cor"
                  >
                    —
                  </button>
                  {ENTITY_COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => field.onChange(c)}
                      className={cn(
                        "grid size-7 place-items-center rounded-full ring-offset-background transition",
                        field.value === c && "ring-2 ring-primary ring-offset-1",
                      )}
                      style={{ backgroundColor: c }}
                      aria-label={`Cor ${c}`}
                    >
                      {field.value === c && (
                        <Check className="size-3.5 text-white" strokeWidth={3} />
                      )}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
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
