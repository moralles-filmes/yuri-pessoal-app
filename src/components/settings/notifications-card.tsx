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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { saveNotificationPrefs } from "@/lib/actions/settings";
import {
  NOTIFICATION_PREF_GROUPS,
  NOTIFICATION_TYPE_HINTS,
  NOTIFICATION_TYPE_LABELS,
  notificationEnabled,
  type NotificationPrefs,
} from "@/lib/settings/constants";
import type { NotificationType } from "@/lib/notifications/constants";
import { mensagemDaAction } from "@/lib/forms/mensagem-da-action";

/** Card de notificações: liga/desliga cada tipo de alerta in-app, por área. */
export function NotificationsCard({ prefs }: { prefs: NotificationPrefs }) {
  const router = useRouter();
  const [state, setState] = React.useState<Record<NotificationType, boolean>>(() => {
    const init = {} as Record<NotificationType, boolean>;
    for (const g of NOTIFICATION_PREF_GROUPS) {
      for (const t of g.types) init[t] = notificationEnabled(prefs, t);
    }
    return init;
  });
  const [pending, startTransition] = React.useTransition();

  function onSave() {
    startTransition(async () => {
      const res = await saveNotificationPrefs(state);
      if (res.ok) {
        toast.success("Preferências de notificação salvas.");
        router.refresh();
      } else {
        toast.error(mensagemDaAction(res));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notificações</CardTitle>
        <CardDescription>
          Escolha quais alertas in-app o sistema gera (sino e central de notificações).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {NOTIFICATION_PREF_GROUPS.map((group) => (
          <div key={group.title} className="space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.title}
            </p>
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {group.types.map((type) => {
                // D5 — a dica existia (`NOTIFICATION_TYPE_HINTS`) e ninguém a lia. Ela fica sob o
                // rótulo e descreve o interruptor para o leitor de tela.
                const dica = NOTIFICATION_TYPE_HINTS[type];
                const idDaDica = `notif-${type}-dica`;
                return (
                  <div key={type} className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <Label
                        htmlFor={`notif-${type}`}
                        className="cursor-pointer text-sm font-normal"
                      >
                        {NOTIFICATION_TYPE_LABELS[type]}
                      </Label>
                      {dica ? (
                        <p id={idDaDica} className="text-xs text-muted-foreground">
                          {dica}
                        </p>
                      ) : null}
                    </div>
                    <Switch
                      id={`notif-${type}`}
                      checked={state[type]}
                      aria-describedby={dica ? idDaDica : undefined}
                      onCheckedChange={(v) => setState((s) => ({ ...s, [type]: v }))}
                      className="shrink-0"
                    />
                  </div>
                );
              })}
            </div>
            {group.nota ? (
              <p className="text-xs text-muted-foreground">{group.nota}</p>
            ) : null}
          </div>
        ))}

        <div className="flex justify-end">
          <Button onClick={onSave} disabled={pending}>
            <Save /> {pending ? "Salvando…" : "Salvar notificações"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
