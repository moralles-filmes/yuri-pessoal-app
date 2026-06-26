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
import { createBill, updateBill } from "@/lib/actions/bills";
import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  type Frequency,
} from "@/lib/finance/constants";
import type { BillRow } from "@/types/database";

const NONE = "none";

type Option = { id: string; name: string };

type FormValues = {
  name: string;
  amount: string;
  due_day: string;
  frequency: Frequency;
  category_id: string;
  account_id: string;
  notify_days_before: string;
  is_active: boolean;
  notes: string;
};

function defaults(bill?: BillRow): FormValues {
  return {
    name: bill?.name ?? "",
    amount: bill ? String(bill.amount).replace(".", ",") : "",
    due_day: bill ? String(bill.due_day) : "5",
    frequency: bill?.frequency ?? "mensal",
    category_id: bill?.category_id ?? NONE,
    account_id: bill?.account_id ?? NONE,
    notify_days_before: bill ? String(bill.notify_days_before) : "3",
    is_active: bill?.is_active ?? true,
    notes: bill?.notes ?? "",
  };
}

export function BillFormDialog({
  bill,
  categories,
  accounts,
  trigger,
}: {
  bill?: BillRow;
  categories: Option[];
  accounts: Option[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const isEdit = Boolean(bill);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: defaults(bill) });

  React.useEffect(() => {
    if (open) reset(defaults(bill));
  }, [open, bill, reset]);

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name,
      amount: values.amount,
      due_day: values.due_day,
      frequency: values.frequency,
      category_id: values.category_id === NONE ? "" : values.category_id,
      account_id: values.account_id === NONE ? "" : values.account_id,
      notify_days_before: values.notify_days_before,
      is_active: values.is_active,
      notes: values.notes,
    };
    const res = isEdit
      ? await updateBill(bill!.id, payload)
      : await createBill(payload);
    if (res.ok) {
      toast.success(isEdit ? "Conta fixa atualizada." : "Conta fixa criada.");
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
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar conta fixa" : "Nova conta fixa"}
          </DialogTitle>
          <DialogDescription>
            Despesas recorrentes com dia de vencimento.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bill-name">Nome</Label>
            <Input
              id="bill-name"
              aria-invalid={Boolean(errors.name)}
              {...register("name", { required: "Informe o nome" })}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Valor</Label>
              <Controller
                control={control}
                name="amount"
                render={({ field }) => (
                  <MoneyInput
                    value={field.value}
                    onValueChange={field.onChange}
                  />
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bill-day">Dia de vencimento</Label>
              <Input
                id="bill-day"
                type="number"
                min={1}
                max={31}
                aria-invalid={Boolean(errors.due_day)}
                {...register("due_day", { required: true })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Frequência</Label>
              <Controller
                control={control}
                name="frequency"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((f) => (
                        <SelectItem key={f} value={f}>
                          {FREQUENCY_LABELS[f]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bill-notify">Avisar (dias antes)</Label>
              <Input
                id="bill-notify"
                type="number"
                min={0}
                {...register("notify_days_before")}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Controller
                control={control}
                name="category_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sem categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem categoria</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Conta</Label>
              <Controller
                control={control}
                name="account_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sem conta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem conta</SelectItem>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bill-notes">Observações</Label>
            <Textarea id="bill-notes" {...register("notes")} />
          </div>

          <Controller
            control={control}
            name="is_active"
            render={({ field }) => (
              <label className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm font-medium">Ativa</span>
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
