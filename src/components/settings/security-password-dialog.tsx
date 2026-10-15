"use client";

/**
 * REDESIGN-07-D · D4 — Configurações · Trocar a senha, num diálogo sob demanda.
 *
 * Entra por `next/dynamic` + `useLazyDialog` em `security-card.tsx` (regra 2 do carregamento sob
 * demanda): `react-hook-form`, o resolver e `zod` só baixam quando o dono abre o formulário.
 *
 * Convenção de auth do projeto: reautentica com a senha atual (`signInWithPassword`) e só então
 * `updateUser({ password })`. ⚠️ Só a reautenticação com `invalid_credentials` culpa a senha
 * atual (`mensagemDeErroDeAuth`): rede fora ou limite de tentativas dizem o que aconteceu.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { mensagemDeErroDeAuth, type EtapaDeAuth } from "@/components/settings/erros-de-auth";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/config/env";
import { changePasswordSchema, type ChangePasswordValues } from "@/lib/validators/auth";

const VAZIO: ChangePasswordValues = { current_password: "", new_password: "", confirm_password: "" };

export function SecurityPasswordDialog({
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
  const router = useRouter();
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: VAZIO,
  });
  const enviando = form.formState.isSubmitting;
  const erros = form.formState.errors;
  const [erroGeral, setErroGeral] = React.useState<string | null>(null);

  // Esc, clique fora e o X não fecham no meio da troca: o dono veria o diálogo sumir sem saber
  // se a senha mudou.
  function aoMudarAbertura(proximo: boolean) {
    if (enviando) return;
    if (!proximo) {
      form.reset(VAZIO);
      setErroGeral(null);
    }
    onAbertoChange(proximo);
  }

  function mostrarErro(erro: unknown, etapa: EtapaDeAuth) {
    const { campo, mensagem } = mensagemDeErroDeAuth(erro, etapa);
    if (campo === "current_password" || campo === "new_password") {
      form.setError(campo, { message: mensagem }, { shouldFocus: true });
    } else {
      setErroGeral(mensagem);
    }
  }

  async function enviar(values: ChangePasswordValues) {
    setErroGeral(null);
    if (!isSupabaseConfigured) {
      toast.info("Supabase ainda não configurado.", {
        description: "Adicione as chaves em .env.local para ativar a conta.",
      });
      return;
    }
    if (!email) {
      setErroGeral("Não foi possível identificar sua conta. Nada foi alterado.");
      return;
    }
    const supabase = createClient();

    // 1) Reautentica com a senha atual antes de permitir a troca.
    try {
      const { error: falha } = await supabase.auth.signInWithPassword({
        email,
        password: values.current_password,
      });
      if (falha) {
        mostrarErro(falha, "reautenticar");
        return;
      }
    } catch (falha) {
      mostrarErro(falha, "reautenticar");
      return;
    }

    // 2) Aplica a nova senha (reflete imediatamente no Supabase Auth).
    try {
      const { error: falha } = await supabase.auth.updateUser({ password: values.new_password });
      if (falha) {
        mostrarErro(falha, "trocar-senha");
        return;
      }
    } catch (falha) {
      mostrarErro(falha, "trocar-senha");
      return;
    }

    toast.success("Senha atualizada.");
    form.reset(VAZIO);
    onAbertoChange(false);
    router.refresh();
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
            <DialogTitle>Alterar senha</DialogTitle>
            <DialogDescription>
              Confirme a senha atual e escolha a nova. A troca vale assim que for salva.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="current_password">Senha atual</Label>
            <Input
              id="current_password"
              type="password"
              autoComplete="current-password"
              {...ariaDoErro("current_password-erro", erros.current_password?.message)}
              {...form.register("current_password")}
            />
            <ErroDoCampo id="current_password-erro" mensagem={erros.current_password?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new_password">Nova senha</Label>
            <Input
              id="new_password"
              type="password"
              autoComplete="new-password"
              {...ariaDoErro("new_password-erro", erros.new_password?.message)}
              {...form.register("new_password")}
            />
            <ErroDoCampo id="new_password-erro" mensagem={erros.new_password?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm_password">Confirmar nova senha</Label>
            <Input
              id="confirm_password"
              type="password"
              autoComplete="new-password"
              {...ariaDoErro("confirm_password-erro", erros.confirm_password?.message)}
              {...form.register("confirm_password")}
            />
            <ErroDoCampo id="confirm_password-erro" mensagem={erros.confirm_password?.message} />
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
              {enviando ? "Atualizando…" : "Atualizar senha"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
