"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import {
  createCreditCard,
  updateCreditCard,
} from "@/lib/actions/credit-cards";
import {
  CARD_BRANDS,
  CARD_BRAND_LABELS,
  type CardBrand,
} from "@/lib/finance/constants";
import type { CreditCardRow } from "@/types/database";

type FormValues = {
  nome: string;
  banco: string;
  bandeira: CardBrand;
  limite_total: string;
  dia_fechamento: string;
  dia_vencimento: string;
  cor: string;
  ativo: boolean;
  observacoes: string;
};

function defaults(card?: CreditCardRow): FormValues {
  return {
    nome: card?.nome ?? "",
    banco: card?.banco ?? "",
    bandeira: card?.bandeira ?? "visa",
    limite_total: card
      ? String(card.limite_total).replace(".", ",")
      : "",
    dia_fechamento: card ? String(card.dia_fechamento) : "",
    dia_vencimento: card ? String(card.dia_vencimento) : "",
    cor: card?.cor ?? "#A98438",
    ativo: card?.ativo ?? true,
    observacoes: card?.observacoes ?? "",
  };
}

export function CreditCardFormDialog({
  card,
  trigger,
}: {
  card?: CreditCardRow;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const isEdit = Boolean(card);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: defaults(card) });

  React.useEffect(() => {
    if (open) reset(defaults(card));
  }, [open, card, reset]);

  const fechamento = useWatch({ control, name: "dia_fechamento" });
  const vencimento = useWatch({ control, name: "dia_vencimento" });

  async function onSubmit(values: FormValues) {
    const payload = {
      nome: values.nome,
      banco: values.banco,
      bandeira: values.bandeira,
      limite_total: values.limite_total,
      dia_fechamento: values.dia_fechamento,
      dia_vencimento: values.dia_vencimento,
      cor: values.cor,
      ativo: values.ativo,
      observacoes: values.observacoes,
    };
    const res = isEdit
      ? await updateCreditCard(card!.id, payload)
      : await createCreditCard(payload);

    if (res.ok) {
      toast.success(isEdit ? "Cartão atualizado." : "Cartão criado.");
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
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar cartão" : "Novo cartão"}</DialogTitle>
          <DialogDescription>
            Limite, bandeira e os dias de fechamento e vencimento da fatura.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="card-nome">Nome</Label>
            <Input
              id="card-nome"
              aria-invalid={Boolean(errors.nome)}
              {...register("nome", { required: "Informe o nome" })}
            />
            {errors.nome && (
              <p className="text-xs text-destructive">{errors.nome.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="card-banco">Banco / instituição</Label>
              <Input
                id="card-banco"
                aria-invalid={Boolean(errors.banco)}
                {...register("banco", { required: "Informe o banco" })}
              />
              {errors.banco && (
                <p className="text-xs text-destructive">
                  {errors.banco.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Bandeira</Label>
              <Controller
                control={control}
                name="bandeira"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CARD_BRANDS.map((b) => (
                        <SelectItem key={b} value={b}>
                          {CARD_BRAND_LABELS[b]}
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
              <Label>Limite total</Label>
              <Controller
                control={control}
                name="limite_total"
                render={({ field }) => (
                  <MoneyInput
                    value={field.value}
                    onValueChange={field.onChange}
                  />
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="card-cor">Cor</Label>
              <Controller
                control={control}
                name="cor"
                render={({ field }) => (
                  <input
                    id="card-cor"
                    type="color"
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    className="h-8 w-full cursor-pointer rounded-lg border border-input bg-transparent px-1"
                  />
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="card-fechamento">Dia de fechamento</Label>
              <Input
                id="card-fechamento"
                type="number"
                min={1}
                max={31}
                inputMode="numeric"
                aria-invalid={Boolean(errors.dia_fechamento)}
                {...register("dia_fechamento", {
                  required: "Informe o dia de fechamento",
                })}
              />
              {errors.dia_fechamento && (
                <p className="text-xs text-destructive">
                  {errors.dia_fechamento.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="card-vencimento">Dia de vencimento</Label>
              <Input
                id="card-vencimento"
                type="number"
                min={1}
                max={31}
                inputMode="numeric"
                aria-invalid={Boolean(errors.dia_vencimento)}
                {...register("dia_vencimento", {
                  required: "Informe o dia de vencimento",
                })}
              />
              {errors.dia_vencimento && (
                <p className="text-xs text-destructive">
                  {errors.dia_vencimento.message}
                </p>
              )}
            </div>
          </div>

          {fechamento && vencimento && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              As compras fecham no dia {fechamento} e vencem no dia {vencimento}{" "}
              de cada ciclo.
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="card-obs">Observações</Label>
            <Textarea id="card-obs" {...register("observacoes")} />
          </div>

          <Controller
            control={control}
            name="ativo"
            render={({ field }) => (
              <label className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm font-medium">Cartão ativo</span>
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
