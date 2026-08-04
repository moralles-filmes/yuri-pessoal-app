"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Dumbbell, Link2, ListTodo, RefreshCw, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import {
  disconnectGoogle,
  setTodoGoogleSync,
  syncGoogleCalendar,
  syncTodoToGoogle,
} from "@/lib/actions/calendar";
import {
  setTrainingGoogleSync,
  syncTrainingToGoogle,
} from "@/lib/actions/training-integrations";
import { formatDate } from "@/lib/format";
import type { GoogleConnectionStatus } from "@/types/database";

const NOTICES: Record<string, { type: "success" | "error" | "info"; msg: string }> = {
  connected: { type: "success", msg: "Google Agenda conectado." },
  error: { type: "error", msg: "Não foi possível conectar o Google Agenda." },
  denied: { type: "info", msg: "Conexão com o Google cancelada." },
  unconfigured: {
    type: "error",
    msg: "Integração do Google não configurada no servidor.",
  },
};

export function GoogleConnectCard({
  status,
  configured,
  notice,
}: {
  status: GoogleConnectionStatus;
  configured: boolean;
  notice?: string | null;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = React.useState(false);
  const [todoBusy, setTodoBusy] = React.useState(false);
  const [trainingBusy, setTrainingBusy] = React.useState(false);

  async function handleTrainingToggle(enabled: boolean) {
    setTrainingBusy(true);
    try {
      const res = await setTrainingGoogleSync(enabled);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        enabled
          ? "Envio ligado. Use “Enviar treinos” para preencher o calendário."
          : "Envio desligado. Os eventos já criados continuam no Google.",
      );
      router.refresh();
    } finally {
      setTrainingBusy(false);
    }
  }

  async function handleTrainingSync() {
    setTrainingBusy(true);
    try {
      const res = await syncTrainingToGoogle();
      if (res.ok) {
        toast.success(
          `Treinos enviados: ${res.data.synced}${
            res.data.failed > 0 ? ` · ${res.data.failed} com falha` : ""
          }.`,
        );
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setTrainingBusy(false);
    }
  }

  async function handleTodoToggle(enabled: boolean) {
    setTodoBusy(true);
    try {
      const res = await setTodoGoogleSync(enabled);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        enabled
          ? "Envio ligado. Use “Enviar tarefas” para preencher o calendário."
          : "Envio desligado. Os eventos já criados continuam no Google.",
      );
      router.refresh();
    } finally {
      setTodoBusy(false);
    }
  }

  async function handleTodoSync() {
    setTodoBusy(true);
    try {
      const res = await syncTodoToGoogle();
      if (res.ok) {
        toast.success(
          `Tarefas enviadas: ${res.data.synced}${
            res.data.failed > 0 ? ` · ${res.data.failed} com falha` : ""
          }.`,
        );
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setTodoBusy(false);
    }
  }

  React.useEffect(() => {
    if (!notice) return;
    const n = NOTICES[notice];
    if (n) toast[n.type](n.msg);
    // Limpa o parâmetro da URL após exibir.
    router.replace("/agenda");
  }, [notice, router]);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await syncGoogleCalendar();
      if (res.ok) {
        const { pulled, pushed, deleted } = res.data;
        toast.success(
          `Sincronizado: ${pulled} recebido(s), ${pushed} enviado(s), ${deleted} removido(s).`,
        );
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setSyncing(false);
    }
  }

  // Conectado: mostra a conta + ações de sincronizar/desconectar.
  if (status.connected) {
    return (
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
              <CalendarCheck className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {status.email ?? "Conta Google conectada"}
              </p>
              <p className="text-xs text-muted-foreground">
                {status.lastSyncedAt
                  ? `Última sincronização: ${formatDate(status.lastSyncedAt)}`
                  : "Ainda não sincronizado"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={syncing ? "animate-spin" : ""} />
              {syncing ? "Sincronizando…" : "Sincronizar"}
            </Button>
            <DeleteConfirmDialog
              title="Desconectar Google"
              description="Os eventos já sincronizados permanecem na sua agenda. Você pode reconectar quando quiser."
              confirmLabel="Desconectar"
              loadingLabel="Desconectando…"
              successMessage="Google Agenda desconectado."
              onConfirm={async () => {
                const res = await disconnectGoogle();
                if (res.ok) router.refresh();
                return res;
              }}
              trigger={
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  <Unlink /> Desconectar
                </Button>
              }
            />
          </div>
          </div>

          {/* Envio das tarefas do TO-DO (opt-in, Fase 15). */}
          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <ListTodo className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <Label htmlFor="todo-sync" className="text-sm font-medium">
                    Enviar tarefas do TO-DO
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Tarefas com data programada viram eventos no Google. Recorrentes
                    enviam só a próxima ocorrência, que se move a cada conclusão.
                  </p>
                </div>
              </div>
              <Switch
                id="todo-sync"
                checked={status.todoSyncEnabled}
                onCheckedChange={handleTodoToggle}
                disabled={todoBusy}
              />
            </div>
            {status.todoSyncEnabled && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleTodoSync}
                disabled={todoBusy}
                className="w-full sm:w-auto"
              >
                <RefreshCw className={todoBusy ? "animate-spin" : ""} />
                {todoBusy ? "Enviando…" : "Enviar tarefas agora"}
              </Button>
            )}
          </div>

          {/* Espelho dos treinos planejados (opt-in, Fase 17-F). */}
          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <Dumbbell className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <Label htmlFor="training-sync" className="text-sm font-medium">
                    Enviar treinos planejados
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Dias planejados com treino viram eventos no Google. Dia de descanso não vira
                    evento, e o que já foi treinado continua morando no histórico do módulo.
                  </p>
                </div>
              </div>
              <Switch
                id="training-sync"
                checked={status.trainingSyncEnabled}
                onCheckedChange={handleTrainingToggle}
                disabled={trainingBusy}
              />
            </div>
            {status.trainingSyncEnabled && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleTrainingSync}
                disabled={trainingBusy}
                className="w-full sm:w-auto"
              >
                <RefreshCw className={trainingBusy ? "animate-spin" : ""} />
                {trainingBusy ? "Enviando…" : "Enviar treinos agora"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Não conectado.
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Link2 className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">Google Agenda</p>
            <p className="text-xs text-muted-foreground">
              {configured
                ? "Conecte para sincronizar seus eventos nos dois sentidos."
                : "Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET para habilitar."}
            </p>
          </div>
        </div>
        {configured ? (
          <Button asChild size="sm">
            <a href="/api/google/connect">
              <Link2 /> Conectar Google Agenda
            </a>
          </Button>
        ) : (
          <Button size="sm" disabled>
            <Link2 /> Conectar Google Agenda
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
