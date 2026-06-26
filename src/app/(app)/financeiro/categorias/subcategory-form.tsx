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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { applyFieldErrors } from "@/components/financeiro/form-utils";
import { createSubcategory } from "@/lib/actions/categories";

type FormValues = { name: string };

export function SubcategoryFormDialog({
  categoryId,
  trigger,
}: {
  categoryId: string;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: { name: "" } });

  React.useEffect(() => {
    if (open) reset({ name: "" });
  }, [open, reset]);

  async function onSubmit(values: FormValues) {
    const res = await createSubcategory({
      category_id: categoryId,
      name: values.name,
    });
    if (res.ok) {
      toast.success("Subcategoria criada.");
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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nova subcategoria</DialogTitle>
          <DialogDescription>Detalhe melhor esta categoria.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sub-name">Nome</Label>
            <Input
              id="sub-name"
              aria-invalid={Boolean(errors.name)}
              {...register("name", { required: "Informe o nome" })}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
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
