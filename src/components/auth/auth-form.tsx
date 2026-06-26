"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/config/env";
import { cn } from "@/lib/utils";

const schema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  password: z.string().min(6, "A senha deve ter ao menos 6 caracteres."),
});
type Values = z.infer<typeof schema>;

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1a6.2 6.2 0 0 1 0-12.4c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 2.6 14.7 1.7 12 1.7a10.3 10.3 0 0 0 0 20.6c5.9 0 9.8-4.1 9.8-9.9 0-.7-.1-1.2-.2-1.7H12z"
      />
    </svg>
  );
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const isLogin = mode === "login";
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [loading, setLoading] = React.useState(false);
  const [googleLoading, setGoogleLoading] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const notConfigured = () =>
    toast.info("Supabase ainda não configurado.", {
      description: "Adicione as chaves em .env.local para ativar o login.",
    });

  async function onSubmit(values: Values) {
    if (!isSupabaseConfigured) return notConfigured();
    setLoading(true);
    const supabase = createClient();
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword(values);
        if (error) throw error;
        toast.success("Bem-vindo de volta!");
      } else {
        const { error } = await supabase.auth.signUp({
          ...values,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${next}`,
          },
        });
        if (error) throw error;
        toast.success("Conta criada com sucesso!", {
          description: "Se a confirmação de e-mail estiver ativa, verifique sua caixa de entrada.",
        });
      }
      router.push(next);
      router.refresh();
    } catch (error) {
      toast.error("Não foi possível continuar.", {
        description:
          error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function signInWithGoogle() {
    if (!isSupabaseConfigured) return notConfigured();
    setGoogleLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${next}`,
      },
    });
    if (error) {
      toast.error("Erro ao entrar com Google.", { description: error.message });
      setGoogleLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isLogin ? "Entrar" : "Criar conta"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isLogin
            ? "Acesse seu sistema pessoal."
            : "Comece a organizar sua vida pessoal."}
        </p>
      </div>

      {!isSupabaseConfigured && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Modo prévia:</span>{" "}
          o login ativa quando as chaves do Supabase forem adicionadas em{" "}
          <code className="rounded bg-muted px-1">.env.local</code>.
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        className="w-full gap-2"
        onClick={signInWithGoogle}
        disabled={googleLoading || loading}
      >
        {googleLoading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <GoogleIcon className="size-4" />
        )}
        Continuar com Google
      </Button>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">ou</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="voce@email.com"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            placeholder="••••••••"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
          {errors.password && (
            <p className="text-xs text-destructive">
              {errors.password.message}
            </p>
          )}
        </div>

        <Button type="submit" className="w-full gap-2" disabled={loading}>
          {loading && <Loader2 className="size-4 animate-spin" />}
          {isLogin ? "Entrar" : "Criar conta"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {isLogin ? (
          <>
            Não tem conta?{" "}
            <Link
              href="/cadastro"
              className="font-medium text-primary hover:underline"
            >
              Criar conta
            </Link>
          </>
        ) : (
          <>
            Já tem conta?{" "}
            <Link
              href="/login"
              className="font-medium text-primary hover:underline"
            >
              Entrar
            </Link>
          </>
        )}
      </p>

      {!isSupabaseConfigured && (
        <Link
          href="/dashboard"
          className={cn(
            "block text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline",
          )}
        >
          Explorar o sistema sem login →
        </Link>
      )}
    </div>
  );
}
