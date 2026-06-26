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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoneyInput } from "@/components/financeiro/money-input";
import { applyFieldErrors } from "@/components/financeiro/form-utils";
import { createAccount, updateAccount } from "@/lib/actions/accounts";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  type AccountType,
} from "@/lib/finance/constants";
import type { AccountRow } from "@/types/database";

type FormValues = {
  name: string;
  bank: string;
  type: AccountType;
  initial_balance: string;
  is_active: boolean;
  color: string;
  notes: string;
};

export function AccountFormDialog({
  account,
  trigger,
}: {
  account?: AccountRow;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const isEdit = Boolean(account);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      name: account?.name ?? "",
      bank: account?.bank ?? "",
      type: account?.type ?? "corrente",
      initial_balance: account
        ? String(account.initial_balance).replace(".", ",")
        : "",
      is_active: account?.is_active ?? true,
      color: account?.color ?? "#A98438",
      notes: account?.notes ?? "",
    },
  });

  React.useEffect(() => {
    if (open) {
      reset({
        name: account?.name ?? "",
        bank: account?.bank ?? "",
        type: account?.type ?? "corrente",
        initial_balance: account
          ? String(account.initial_balance).replace(".", ",")
          : "",
        is_active: account?.is_active ?? true,
        color: account?.color ?? "#A98438",
        notes: account?.notes ?? "",
      });
    }
  }, [open, account, reset]);

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name,
      bank: values.bank,
      type: values.type,
      initial_balance: values.initial_balance,
      is_active: values.is_active,
      color: values.color,
      notes: values.notes,
    };
    const res = isEdit
      ? await updateAccount(account!.id, payload)
      : await createAccount(payload);

    if (res.ok) {
      toast.success(isEdit ? "Conta atualizada." : "Conta criada.");
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
          <DialogTitle>{isEdit ? "Editar conta" : "Nova conta"}</DialogTitle>
          <DialogDescription>
            Carteiras, bancos e saldos iniciais.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="acc-name">Nome</Label>
            <Input
              id="acc-name"
              aria-invalid={Boolean(errors.name)}
              {...register("name", { required: "Informe o nome" })}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="acc-bank">Banco / instituição</Label>
              <Input id="acc-bank" {...register("bank")} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {ACCOUNT_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Saldo inicial</Label>
              <Controller
                control={control}
                name="initial_balance"
                render={({ field }) => (
                  <MoneyInput
                    value={field.value}
                    onValueChange={field.onChange}
                  />
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-color">Cor</Label>
              <Controller
                control={control}
                name="color"
                render={({ field }) => (
                  <input
                    id="acc-color"
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
            <Label htmlFor="acc-notes">Observações</Label>
            <Textarea id="acc-notes" {...register("notes")} />
          </div>

          <Controller
            control={control}
            name="is_active"
            render={({ field }) => (
              <label className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm font-medium">Conta ativa</span>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
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
