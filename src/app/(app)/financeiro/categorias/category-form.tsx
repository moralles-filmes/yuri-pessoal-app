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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { applyFieldErrors } from "@/components/financeiro/form-utils";
import { createCategory, updateCategory } from "@/lib/actions/categories";
import {
  CATEGORY_KINDS,
  CATEGORY_KIND_LABELS,
  type CategoryKind,
} from "@/lib/finance/constants";
import type { CategoryRow } from "@/types/database";

type FormValues = {
  name: string;
  kind: CategoryKind;
  color: string;
  icon: string;
};

export function CategoryFormDialog({
  category,
  trigger,
}: {
  category?: CategoryRow;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const isEdit = Boolean(category);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      name: category?.name ?? "",
      kind: category?.kind ?? "despesa",
      color: category?.color ?? "#A98438",
      icon: category?.icon ?? "tag",
    },
  });

  React.useEffect(() => {
    if (open) {
      reset({
        name: category?.name ?? "",
        kind: category?.kind ?? "despesa",
        color: category?.color ?? "#A98438",
        icon: category?.icon ?? "tag",
      });
    }
  }, [open, category, reset]);

  async function onSubmit(values: FormValues) {
    const res = isEdit
      ? await updateCategory(category!.id, values)
      : await createCategory(values);
    if (res.ok) {
      toast.success(isEdit ? "Categoria atualizada." : "Categoria criada.");
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
          <DialogTitle>
            {isEdit ? "Editar categoria" : "Nova categoria"}
          </DialogTitle>
          <DialogDescription>
            Organize despesas e receitas por categoria.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Nome</Label>
            <Input
              id="cat-name"
              aria-invalid={Boolean(errors.name)}
              {...register("name", { required: "Informe o nome" })}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Controller
                control={control}
                name="kind"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_KINDS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {CATEGORY_KIND_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-color">Cor</Label>
              <Controller
                control={control}
                name="color"
                render={({ field }) => (
                  <input
                    id="cat-color"
                    type="color"
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    className="h-8 w-full cursor-pointer rounded-lg border border-input bg-transparent px-1"
                  />
                )}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat-icon">Ícone (nome lucide)</Label>
            <Input id="cat-icon" placeholder="tag" {...register("icon")} />
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
