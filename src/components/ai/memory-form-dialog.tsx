"use client";

/**
 * Fase 18-F · Bloco 3 — IA · Escrever ou editar uma preferência.
 *
 * ⚠️ ESTE ARQUIVO É O QUE ARRASTA `zod` + `react-hook-form` (~62 KB gz), e por isso ele entra
 * por `next/dynamic` a partir de `memory-client.tsx`: antes do primeiro clique em "Nova
 * preferência", nada disso é baixado.
 *
 * ⛔ `MAX_MEMORIA` VEM DE `@/lib/ai/memory/contracts`, NUNCA de `@/lib/validators/ai` — regra 3
 * do carregamento sob demanda. O primeiro é um módulo puro sem um único import; o segundo
 * começa com `import { z } from "zod"`. Aqui o zod já veio junto de qualquer forma, mas a
 * disciplina vale: o dia em que o contador for para a fachada, ele não arrasta nada.
 */

import * as React from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { mapServerFieldErrors, serverErrorMessage } from "@/lib/forms/server-errors";
import { memoriaSchema } from "@/lib/validators/ai";
import { salvarMemoria } from "@/lib/actions/ai-memory";
import { MAX_MEMORIA, MODULOS_DE_MEMORIA } from "@/lib/ai/memory/contracts";
import { ROTULO_DA_PERMISSAO } from "@/lib/ai/constants";
import { cn } from "@/lib/utils";
import type { MemoriaNaLista } from "./memory-types";

/** Sentinela do Select: Radix não aceita `value=""` num item. */
const TODAS = "__todas__";

/** Os campos que ESTA tela mostra. Erro de campo fora daqui vai para o toast, não some. */
const FORM_FIELDS = ["conteudo", "modulo", "expiraEm"] as const;

type FormValues = {
  conteudo: string;
  modulo: string;
  expiraEm: string;
};

function toDefaults(memoria: MemoriaNaLista | null): FormValues {
  return {
    conteudo: memoria?.conteudo ?? "",
    modulo: memoria?.modulo ?? TODAS,
    // ⚠️ O campo de data guarda a DATA pura ('yyyy-MM-dd'). Quem a transforma em instante do
    // FIM daquele dia em Brasília é a Server Action — aqui ela é texto, e só.
    expiraEm: memoria?.prazo ?? memoria?.expirouEm ?? "",
  };
}

export function MemoryFormDialog({
  aberto,
  onAbertoChange,
  memoria,
  onSalvo,
}: {
  readonly aberto: boolean;
  readonly onAbertoChange: (aberto: boolean) => void;
  readonly memoria: MemoriaNaLista | null;
  readonly onSalvo: () => void;
}) {
  const editando = Boolean(memoria);
  const [salvando, setSalvando] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(memoriaSchema) as unknown as Resolver<FormValues>,
    defaultValues: toDefaults(memoria),
  });

  // Reabrir com outra memória recarrega o formulário. Ajuste DURANTE o render (padrão do
  // projeto com o React Compiler ligado) — nada de setState em useEffect.
  const chave = `${memoria?.id ?? "nova"}:${aberto}`;
  const [ultimaChave, setUltimaChave] = React.useState(chave);
  if (chave !== ultimaChave) {
    setUltimaChave(chave);
    form.reset(toDefaults(memoria));
  }

  // `useWatch` em vez de `form.watch()`: o React Compiler não consegue memoizar o `watch`.
  const valores = useWatch({ control: form.control });
  const escrito = [...(valores.conteudo ?? "")].length;

  async function onSubmit(values: FormValues) {
    setSalvando(true);
    const r = await salvarMemoria({
      id: memoria?.id ?? null,
      conteudo: values.conteudo,
      modulo: values.modulo === TODAS ? null : values.modulo,
      expiraEm: values.expiraEm || null,
    });
    setSalvando(false);

    if (!r.ok) {
      // ⛔ "Verifique os campos destacados" só vale se algum campo for destacado. Erro de
      // campo que esta tela não tem sobe para o toast, com o nome — nunca é descartado.
      const mapeado = mapServerFieldErrors(r.fieldErrors, FORM_FIELDS);
      for (const { name, message } of mapeado.toSet) {
        form.setError(name as keyof FormValues, { type: "server", message });
      }
      toast.error(serverErrorMessage(r.error, mapeado));
      return;
    }

    toast.success(editando ? "Preferência atualizada." : "Preferência salva.");
    onAbertoChange(false);
    onSalvo();
  }

  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      {/* ⚠️ `sm:max-w-lg` para crescer no desktop: o limite do celular já vem da primitiva. */}
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editando ? "Editar preferência" : "Nova preferência"}
          </DialogTitle>
          <DialogDescription>
            Uma frase curta, na sua voz, dizendo como você quer ser atendido. O assistente a
            leva para as conversas como preferência — ela não altera nada nos seus módulos.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="conteudo">Preferência</Label>
            <Textarea
              id="conteudo"
              rows={3}
              placeholder="Ex.: Prefiro respostas curtas, com a conclusão primeiro."
              aria-invalid={Boolean(form.formState.errors.conteudo)}
              {...form.register("conteudo")}
            />
            <div className="flex items-start justify-between gap-2 text-xs">
              <p className="min-w-0 text-muted-foreground">
                Uma frase só, sem endereço de site e sem chave de acesso.
              </p>
              {/*
                O contador conta PONTOS DE CÓDIGO, como o `char_length` do Postgres — não
                `.length`, que é UTF-16 e contaria um emoji como dois. Com `.length`, o
                contador diria 298 e o banco recusaria por passar de 300.
              */}
              <span
                className={cn(
                  "shrink-0 tabular-nums text-muted-foreground",
                  escrito > MAX_MEMORIA && "font-medium text-destructive",
                )}
              >
                {escrito}/{MAX_MEMORIA}
              </span>
            </div>
            {form.formState.errors.conteudo ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.conteudo.message}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="modulo">Vale para</Label>
              <Select
                value={valores.modulo ?? TODAS}
                onValueChange={(v) => form.setValue("modulo", v)}
              >
                <SelectTrigger id="modulo" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS}>Todas as conversas</SelectItem>
                  {MODULOS_DE_MEMORIA.map((m) => (
                    <SelectItem key={m} value={m}>
                      {ROTULO_DA_PERMISSAO[`allow_${m}` as keyof typeof ROTULO_DA_PERMISSAO]
                        ?.titulo ?? m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/*
                ⚠️ A ressalva que o dono precisa ler ANTES de escolher: memória de módulo ANDa
                com a chave daquele módulo. Sem isso, ele amarraria a preferência a Treinos e
                não entenderia por que ela sumiu ao desligar a leitura de Treinos.
              */}
              <p className="text-xs text-muted-foreground">
                Amarrada a um módulo, ela só entra nas conversas dele — e só enquanto a leitura
                daquele módulo estiver autorizada.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expiraEm">Prazo (opcional)</Label>
              <Input
                id="expiraEm"
                type="date"
                aria-invalid={Boolean(form.formState.errors.expiraEm)}
                {...form.register("expiraEm")}
              />
              <p className="text-xs text-muted-foreground">
                Vale até o fim desse dia. Sem prazo, ela vale até você desativá-la.
              </p>
              {form.formState.errors.expiraEm ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.expiraEm.message}
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={salvando}
              onClick={() => onAbertoChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? <Loader2 className="size-4 animate-spin" /> : null}
              {editando ? "Salvar" : "Salvar preferência"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
