"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLazyDialog } from "@/components/shared/use-lazy-dialog";

/**
 * Card de Segurança: trocar e-mail e trocar senha.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ REDESIGN-07-D · D4 — RECOLHIDO: O CARTÃO MOSTRA O E-MAIL E DOIS BOTÕES.               ║
 * ║                                                                                       ║
 * ║ Os dois formulários viviam sempre montados aqui, e com eles `react-hook-form`, o      ║
 * ║ resolver e `zod` entravam no primeiro carregamento de `/configuracoes` — o único card ║
 * ║ da rota que os importava, e o que a mantinha a 3 KB do teto próprio. Agora cada um    ║
 * ║ abre num diálogo carregado por `next/dynamic` (objeto literal) + `useLazyDialog`.     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * O resumo não afirma nada sobre a senha: não há como o cliente saber se ela é forte ou de
 * quando é, e um "Senha: definida" seria uma afirmação que ninguém conferiu.
 */
const SecurityEmailDialog = dynamic(
  () => import("@/components/settings/security-email-dialog").then((m) => m.SecurityEmailDialog),
  { ssr: false, loading: () => null },
);

const SecurityPasswordDialog = dynamic(
  () =>
    import("@/components/settings/security-password-dialog").then((m) => m.SecurityPasswordDialog),
  { ssr: false, loading: () => null },
);

export function SecurityCard({ email }: { email?: string | null }) {
  const [aberto, setAberto] = React.useState<"email" | "senha" | null>(null);
  const emailMontado = useLazyDialog(aberto === "email");
  const senhaMontada = useLazyDialog(aberto === "senha");
  const botaoDoEmail = React.useRef<HTMLButtonElement | null>(null);
  const botaoDaSenha = React.useRef<HTMLButtonElement | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" /> Segurança
        </CardTitle>
        <CardDescription>Troque o e-mail e a senha de acesso da sua conta.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 text-sm">
          <div className="min-w-0 rounded-lg border p-3">
            <dt className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="size-3.5" aria-hidden="true" /> E-mail de acesso
            </dt>
            <dd className="mt-1 truncate font-medium">{email ?? "não identificado"}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            ref={botaoDoEmail}
            type="button"
            variant="outline"
            aria-haspopup="dialog"
            onClick={() => setAberto("email")}
          >
            <Mail /> Alterar e-mail
          </Button>
          <Button
            ref={botaoDaSenha}
            type="button"
            variant="outline"
            aria-haspopup="dialog"
            onClick={() => setAberto("senha")}
          >
            <KeyRound /> Alterar senha
          </Button>
        </div>
      </CardContent>

      {emailMontado && (
        <SecurityEmailDialog
          aberto={aberto === "email"}
          onAbertoChange={(v) => setAberto(v ? "email" : null)}
          email={email}
          focoDeVolta={botaoDoEmail}
        />
      )}
      {senhaMontada && (
        <SecurityPasswordDialog
          aberto={aberto === "senha"}
          onAbertoChange={(v) => setAberto(v ? "senha" : null)}
          email={email}
          focoDeVolta={botaoDaSenha}
        />
      )}
    </Card>
  );
}
