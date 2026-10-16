"use client";

/**
 * REDESIGN-07-D · D4 — Configurações · Trocar o e-mail de acesso, num diálogo sob demanda.
 *
 * Entra por `next/dynamic` + `useLazyDialog` em `security-card.tsx`: `react-hook-form`, o
 * resolver e `zod` só baixam quando o dono abre o formulário (regra 2 do carregamento sob
 * demanda) — eram o que mantinha `/configuracoes` perto do teto próprio.
 *
 * Convenção de auth do projeto (client do navegador, ver `auth-form.tsx`): `updateUser({ email })`
 * manda um link para o e-mail atual e outro para o novo; a troca só vale depois dos dois, e o
 * `/auth/callback` volta para `/configuracoes`. O erro passa por `mensagemDeErroDeAuth` — o texto
 * do Supabase nunca chega cru à tela.
 */

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
import { ariaDoErro, ErroDoCampo } from "@/components/shared/erro-do-campo";
import { mensagemDeErroDeAuth } from "@/components/settings/erros-de-auth";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/config/env";
import { changeEmailSchema, type ChangeEmailValues } from "@/lib/validators/auth";

export function SecurityEmailDialog({
  aberto,
  onAbertoChange,
  email,
  focoDeVolta,
}: {
  readonly aberto: boolean;
  readonly onAbertoChange: (aberto: boolean) => void;
  readonly email?: string | null;
  /** O botão que abriu: sem `DialogTrigger`, o Radix não sabe para onde devolver o foco. */
  readonly focoDeVolta?: React.RefObject<HTMLButtonElement | null>;
}) {
  const form = useForm<ChangeEmailValues>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { email: "" },
  });
  const enviando = form.formState.isSubmitting;
  const erroDoCampo = form.formState.errors.email?.message;
  const [erroGeral, setErroGeral] = React.useState<string | null>(null);

  // Esc, clique fora e o X não fecham no meio do envio: o dono veria o diálogo sumir sem saber
  // se o link saiu.
  function aoMudarAbertura(proximo: boolean) {
    if (enviando) return;
    if (!proximo) {
      form.reset({ email: "" });
      setErroGeral(null);
    }
    onAbertoChange(proximo);
  }

  function mostrarErro(erro: unknown) {
    const { campo, mensagem } = mensagemDeErroDeAuth(erro, "trocar-email");
    if (campo === "email") form.setError("email", { message: mensagem }, { shouldFocus: true });
    else setErroGeral(mensagem);
  }

  async function enviar(values: ChangeEmailValues) {
    setErroGeral(null);
    if (!isSupabaseConfigured) {
      toast.info("Supabase ainda não configurado.", {
        description: "Adicione as chaves em .env.local para ativar a conta.",
      });
      return;
    }
    if (values.email.toLowerCase() === (email ?? "").toLowerCase()) {
      form.setError("email", { message: "Esse já é o seu e-mail atual." }, { shouldFocus: true });
      return;
    }
    try {
      const supabase = createClient();
      const { error: falha } = await supabase.auth.updateUser(
        { email: values.email },
        { emailRedirectTo: `${window.location.origin}/auth/callback?next=/configuracoes` },
      );
      if (falha) {
        mostrarErro(falha);
        return;
      }
    } catch (falha) {
      mostrarErro(falha);
      return;
    }
    toast.success("Confirme a troca nos dois e-mails.", {
      description:
        "Enviamos um link para o e-mail atual e para o novo. A troca só vale após confirmar ambos.",
    });
    form.reset({ email: "" });
    onAbertoChange(false);
  }

  return (
    <Dialog open={aberto} onOpenChange={aoMudarAbertura}>
      <DialogContent
        showCloseButton={!enviando}
        onCloseAutoFocus={(e) => {
          if (!focoDeVolta?.current) return;
          e.preventDefault();
          focoDeVolta.current.focus();
        }}
      >
        <form onSubmit={form.handleSubmit(enviar)} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Alterar e-mail</DialogTitle>
            <DialogDescription>
              Enviamos um link para o e-mail atual e outro para o novo. A troca só vale depois de
              confirmar os dois.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="new_email">Novo e-mail</Label>
            <Input
              id="new_email"
              type="email"
              autoComplete="email"
              placeholder="novo@email.com"
              {...ariaDoErro("new_email-erro", erroDoCampo)}
              {...form.register("email")}
            />
            <ErroDoCampo id="new_email-erro" mensagem={erroDoCampo} />
          </div>

          {erroGeral ? (
            <p role="alert" className="text-sm text-destructive">
              {erroGeral}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={enviando}
              onClick={() => aoMudarAbertura(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando && <Loader2 className="size-4 animate-spin" />}
              {enviando ? "Enviando…" : "Enviar os links"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
