"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { saveProfile } from "@/lib/actions/settings";
import { getInitials } from "@/lib/format";

/** Card de perfil: nome de exibição + URL de avatar. Validação no servidor (Zod). */
export function ProfileCard({
  email,
  displayName,
  avatarUrl,
}: {
  email?: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(displayName ?? "");
  const [avatar, setAvatar] = React.useState(avatarUrl ?? "");
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [pending, startTransition] = React.useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const res = await saveProfile({ display_name: name, avatar_url: avatar });
      if (res.ok) {
        toast.success("Perfil atualizado.");
        router.refresh();
      } else {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Perfil</CardTitle>
        <CardDescription>
          Como você aparece no sistema. O e-mail vem da sua conta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar size="lg">
              {avatar ? <AvatarImage src={avatar} alt="" /> : null}
              <AvatarFallback className="bg-primary/15 font-semibold text-primary">
                {getInitials(name || email)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {name || "Sem nome definido"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {email ?? "—"}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="display_name">Nome de exibição</Label>
              <Input
                id="display_name"
                value={name}
                maxLength={120}
                placeholder="Seu nome"
                onChange={(e) => setName(e.target.value)}
              />
              {errors.display_name && (
                <p className="text-xs text-destructive">{errors.display_name[0]}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="avatar_url">URL do avatar (opcional)</Label>
              <Input
                id="avatar_url"
                value={avatar}
                inputMode="url"
                placeholder="https://…"
                onChange={(e) => setAvatar(e.target.value)}
              />
              {errors.avatar_url && (
                <p className="text-xs text-destructive">{errors.avatar_url[0]}</p>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              <Save /> {pending ? "Salvando…" : "Salvar perfil"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
