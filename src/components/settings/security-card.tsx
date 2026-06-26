"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { KeyRound, Loader2, Mail, ShieldCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/config/env";
import {
  changeEmailSchema,
  changePasswordSchema,
  type ChangeEmailValues,
  type ChangePasswordValues,
} from "@/lib/validators/auth";

/**
 * Card de Segurança: trocar e-mail e trocar senha.
 *
 * Segue a convenção de auth do projeto (client do navegador, ver `auth-form.tsx`):
 * - E-mail: `updateUser({ email })` → Supabase envia confirmação para o e-mail antigo e o
 *   novo; só efetiva após o usuário clicar nos dois links (o `/auth/callback` já existente
 *   troca o `code` por sessão e volta para `/configuracoes`).
 * - Senha: reautentica com a senha atual (`signInWithPassword`) e então `updateUser({ password })`.
 */
export function SecurityCard({ email }: { email?: string | null }) {
  const router = useRouter();

  const notConfigured = () =>
    toast.info("Supabase ainda não configurado.", {
      description: "Adicione as chaves em .env.local para ativar a conta.",
    });

  // --- Trocar e-mail ---------------------------------------------------------
  const emailForm = useForm<ChangeEmailValues>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { email: "" },
  });

  async function onChangeEmail(values: ChangeEmailValues) {
    if (!isSupabaseConfigured) return notConfigured();
    if (values.email.toLowerCase() === (email ?? "").toLowerCase()) {
      emailForm.setError("email", {
        message: "Esse já é o seu e-mail atual.",
      });
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser(
      { email: values.email },
      {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/configuracoes`,
      },
    );
    if (error) {
      toast.error("Não foi possível trocar o e-mail.", {
        description: error.message,
      });
      return;
    }
    toast.success("Confirme a troca nos dois e-mails.", {
      description:
        "Enviamos um link para o e-mail atual e para o novo. A troca só vale após confirmar ambos.",
    });
    emailForm.reset({ email: "" });
  }

  // --- Trocar senha ----------------------------------------------------------
  const passwordForm = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      current_password: "",
      new_password: "",
      confirm_password: "",
    },
  });

  async function onChangePassword(values: ChangePasswordValues) {
    if (!isSupabaseConfigured) return notConfigured();
    if (!email) {
      toast.error("Não foi possível identificar sua conta.");
      return;
    }
    const supabase = createClient();

    // 1) Reautentica com a senha atual antes de permitir a troca.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: values.current_password,
    });
    if (signInError) {
      passwordForm.setError("current_password", {
        message: "Senha atual incorreta.",
      });
      return;
    }

    // 2) Aplica a nova senha (reflete imediatamente no Supabase Auth).
    const { error: updateError } = await supabase.auth.updateUser({
      password: values.new_password,
    });
    if (updateError) {
      toast.error("Não foi possível atualizar a senha.", {
        description: updateError.message,
      });
      return;
    }

    toast.success("Senha atualizada.");
    passwordForm.reset({
      current_password: "",
      new_password: "",
      confirm_password: "",
    });
    router.refresh();
  }

  const emailSubmitting = emailForm.formState.isSubmitting;
  const passwordSubmitting = passwordForm.formState.isSubmitting;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" /> Segurança
        </CardTitle>
        <CardDescription>
          Troque o e-mail e a senha de acesso da sua conta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Trocar e-mail */}
        <form
          onSubmit={emailForm.handleSubmit(onChangeEmail)}
          className="space-y-4"
          noValidate
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <Mail className="size-4 text-muted-foreground" /> Trocar e-mail
          </div>
          <p className="text-xs text-muted-foreground">
            E-mail atual:{" "}
            <span className="font-medium text-foreground">{email ?? "—"}</span>.
            A troca exige confirmação no e-mail atual e no novo.
          </p>
          <div className="space-y-1.5 sm:max-w-sm">
            <Label htmlFor="new_email">Novo e-mail</Label>
            <Input
              id="new_email"
              type="email"
              autoComplete="email"
              placeholder="novo@email.com"
              aria-invalid={!!emailForm.formState.errors.email}
              {...emailForm.register("email")}
            />
            {emailForm.formState.errors.email && (
              <p className="text-xs text-destructive">
                {emailForm.formState.errors.email.message}
              </p>
            )}
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={emailSubmitting} className="gap-2">
              {emailSubmitting && <Loader2 className="size-4 animate-spin" />}
              {emailSubmitting ? "Enviando…" : "Trocar e-mail"}
            </Button>
          </div>
        </form>

        <Separator />

        {/* Trocar senha */}
        <form
          onSubmit={passwordForm.handleSubmit(onChangePassword)}
          className="space-y-4"
          noValidate
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="size-4 text-muted-foreground" /> Trocar senha
          </div>
          <div className="space-y-1.5 sm:max-w-sm">
            <Label htmlFor="current_password">Senha atual</Label>
            <Input
              id="current_password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              aria-invalid={!!passwordForm.formState.errors.current_password}
              {...passwordForm.register("current_password")}
            />
            {passwordForm.formState.errors.current_password && (
              <p className="text-xs text-destructive">
                {passwordForm.formState.errors.current_password.message}
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:max-w-md sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new_password">Nova senha</Label>
              <Input
                id="new_password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                aria-invalid={!!passwordForm.formState.errors.new_password}
                {...passwordForm.register("new_password")}
              />
              {passwordForm.formState.errors.new_password && (
                <p className="text-xs text-destructive">
                  {passwordForm.formState.errors.new_password.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm_password">Confirmar nova senha</Label>
              <Input
                id="confirm_password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                aria-invalid={!!passwordForm.formState.errors.confirm_password}
                {...passwordForm.register("confirm_password")}
              />
              {passwordForm.formState.errors.confirm_password && (
                <p className="text-xs text-destructive">
                  {passwordForm.formState.errors.confirm_password.message}
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={passwordSubmitting} className="gap-2">
              {passwordSubmitting && <Loader2 className="size-4 animate-spin" />}
              {passwordSubmitting ? "Atualizando…" : "Atualizar senha"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
