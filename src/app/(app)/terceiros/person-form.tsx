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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { applyFieldErrors } from "@/components/financeiro/form-utils";
import { createPerson, updatePerson } from "@/lib/actions/people";
import type { PersonRow } from "@/types/database";

type FormValues = {
  nome: string;
  telefone: string;
  email: string;
  observacoes: string;
  ativo: boolean;
};

function defaults(person?: PersonRow): FormValues {
  return {
    nome: person?.nome ?? "",
    telefone: person?.telefone ?? "",
    email: person?.email ?? "",
    observacoes: person?.observacoes ?? "",
    ativo: person?.ativo ?? true,
  };
}

export function PersonFormDialog({
  person,
  trigger,
}: {
  person?: PersonRow;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const isEdit = Boolean(person);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: defaults(person) });

  React.useEffect(() => {
    if (open) reset(defaults(person));
  }, [open, person, reset]);

  async function onSubmit(values: FormValues) {
    const res = isEdit
      ? await updatePerson(person!.id, values)
      : await createPerson(values);

    if (res.ok) {
      toast.success(isEdit ? "Pessoa atualizada." : "Pessoa cadastrada.");
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
          <DialogTitle>{isEdit ? "Editar pessoa" : "Nova pessoa"}</DialogTitle>
          <DialogDescription>
            Pessoas com quem você divide gastos e que te devem valores.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="person-nome">Nome</Label>
            <Input
              id="person-nome"
              aria-invalid={Boolean(errors.nome)}
              {...register("nome", { required: "Informe o nome" })}
            />
            {errors.nome && (
              <p className="text-xs text-destructive">{errors.nome.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="person-telefone">Telefone</Label>
              <Input
                id="person-telefone"
                inputMode="tel"
                {...register("telefone")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="person-email">E-mail</Label>
              <Input
                id="person-email"
                type="email"
                aria-invalid={Boolean(errors.email)}
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="person-obs">Observações</Label>
            <Textarea id="person-obs" {...register("observacoes")} />
          </div>

          <Controller
            control={control}
            name="ativo"
            render={({ field }) => (
              <label className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm font-medium">Pessoa ativa</span>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </label>
            )}
          />

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
