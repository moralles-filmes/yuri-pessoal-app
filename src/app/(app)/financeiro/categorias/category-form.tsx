"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch, type Path } from "react-hook-form";
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
import { mapServerFieldErrors, serverErrorMessage } from "@/lib/forms/server-errors";
import {
  MARCACAO_DE_TERCEIROS,
  marcacaoParaGravar,
  sugereTerceiros,
  tipoDeCategoriaSugere,
} from "@/lib/finance/marcacao-da-categoria";
import { createCategory, updateCategory } from "@/lib/actions/categories";
import {
  CATEGORY_KINDS,
  CATEGORY_KIND_LABELS,
  type CategoryKind,
} from "@/lib/finance/constants";
import type { CategoryRow } from "@/types/database";

const SEM_SUGESTAO = "nenhuma";

type FormValues = {
  name: string;
  kind: CategoryKind;
  color: string;
  icon: string;
  classificacao_padrao: typeof MARCACAO_DE_TERCEIROS | typeof SEM_SUGESTAO;
};

const CAMPOS = ["name", "kind", "color", "icon"] as const;

function valoresIniciais(category?: CategoryRow): FormValues {
  return {
    name: category?.name ?? "",
    kind: category?.kind ?? "despesa",
    color: category?.color ?? "#A98438",
    icon: category?.icon ?? "tag",
    classificacao_padrao: sugereTerceiros(category?.classificacao_padrao)
      ? MARCACAO_DE_TERCEIROS
      : SEM_SUGESTAO,
  };
}

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
    defaultValues: valoresIniciais(category),
  });

  const kind = useWatch({ control, name: "kind" });
  const sugere = tipoDeCategoriaSugere(kind);
  const perdeMarcacao = !sugere && sugereTerceiros(category?.classificacao_padrao);

  React.useEffect(() => {
    if (open) {
      reset(valoresIniciais(category));
    }
  }, [open, category, reset]);

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name,
      kind: values.kind,
      color: values.color,
      icon: values.icon,
      // P2: categoria de despesa nunca leva marcação.
      classificacao_padrao: marcacaoParaGravar(values.kind, values.classificacao_padrao),
    };
    const res = isEdit ? await updateCategory(category!.id, payload) : await createCategory(payload);
    if (res.ok) {
      toast.success(isEdit ? "Categoria atualizada." : "Categoria criada.");
      setOpen(false);
      router.refresh();
    } else {
      // O campo da marcação só existe na tela para receita/ambos: escondido, o erro sobe ao toast.
      const naTela = tipoDeCategoriaSugere(values.kind) ? [...CAMPOS, "classificacao_padrao"] : CAMPOS;
      const mapeado = mapServerFieldErrors(res.fieldErrors, naTela);
      for (const { name, message } of mapeado.toSet) setError(name as Path<FormValues>, { message });
      toast.error(serverErrorMessage(res.error, mapeado));
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

          {sugere ? (
            <div className="space-y-1.5">
              <Label htmlFor="cat-sugestao">Ao lançar uma receita nesta categoria</Label>
              <Controller
                control={control}
                name="classificacao_padrao"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="cat-sugestao"
                      className="w-full"
                      aria-invalid={Boolean(errors.classificacao_padrao)}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM_SUGESTAO}>Sem sugestão</SelectItem>
                      <SelectItem value={MARCACAO_DE_TERCEIROS}>Sugerir &quot;de terceiros&quot;</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-xs text-muted-foreground">
                Só preenche o formulário de um lançamento novo. Você pode trocar antes de salvar, e
                nenhum lançamento existente muda.
              </p>
              {errors.classificacao_padrao && (
                <p className="text-xs text-destructive">{errors.classificacao_padrao.message}</p>
              )}
            </div>
          ) : perdeMarcacao ? (
            <p className="text-xs text-muted-foreground">
              Ao salvar como despesa, a sugestão de terceiros desta categoria é removida.
            </p>
          ) : null}

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
