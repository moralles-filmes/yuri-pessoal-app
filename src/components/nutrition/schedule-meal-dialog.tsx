"use client";

/**
 * Fase 16-F — criar UM bloco na agenda a partir de uma refeição planejada.
 *
 * ⛔ AÇÃO EXPLÍCITA, SEMPRE. Nenhuma refeição vira evento automaticamente — nem ao planejar,
 * nem ao aplicar um modelo de semana, nem por cron. Este diálogo só abre quando o usuário
 * clica, e cria UM evento para UMA data. Não existe "agendar a semana inteira": encher a
 * agenda com 21 blocos que ninguém pediu é a forma mais rápida de o usuário desligar tudo.
 *
 * O horário digitado é hora de parede de BRASÍLIA — a conversão fica no servidor
 * (`saoPauloWallClockToInstant`), não aqui.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
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
import { createNutritionEvent } from "@/lib/actions/nutrition-integrations";
import { shortTime } from "@/lib/nutrition/calendar";

export function ScheduleMealDialog({
  open,
  onOpenChange,
  defaultTitle,
  defaultDate,
  defaultTime,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTitle: string;
  /** Data pura 'yyyy-MM-dd'. */
  defaultDate: string;
  /** 'HH:mm[:ss]' da refeição planejada, quando houver. */
  defaultTime: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [title, setTitle] = React.useState(defaultTitle);
  const [date, setDate] = React.useState(defaultDate);
  const [time, setTime] = React.useState(shortTime(defaultTime) || "12:00");
  const [duration, setDuration] = React.useState("45");

  // Reabriu com outra refeição → recarrega os padrões (ajuste durante o render, o padrão
  // adotado no projeto: `setState` em `useEffect` é proibido com o React Compiler ativo).
  const key = `${open}:${defaultTitle}:${defaultDate}:${defaultTime ?? ""}`;
  const [lastKey, setLastKey] = React.useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    if (open) {
      setTitle(defaultTitle);
      setDate(defaultDate);
      setTime(shortTime(defaultTime) || "12:00");
      setDuration("45");
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createNutritionEvent({
        title,
        date,
        start_time: time,
        duration_minutes: duration,
        notes: "Bloco criado a partir do planejamento alimentar.",
      });
      if (result.ok) {
        toast.success("Bloco criado na agenda.", {
          action: { label: "Ver", onClick: () => router.push(`/agenda?view=dia&date=${date}`) },
        });
        router.refresh();
        onOpenChange(false);
      } else {
        toast.error(result.error ?? "Não foi possível criar o bloco.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Criar bloco na agenda</DialogTitle>
          <DialogDescription>
            Um evento, para esta data. O planejamento continua independente da agenda — mudar
            um não altera o outro.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="agenda-titulo">Título</Label>
            <Input
              id="agenda-titulo"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="agenda-data">Data</Label>
              <Input
                id="agenda-data"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agenda-hora">Início</Label>
              <Input
                id="agenda-hora"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agenda-duracao">Duração (minutos)</Label>
            <Input
              id="agenda-duracao"
              type="number"
              inputMode="numeric"
              min={5}
              max={600}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            O horário é de Brasília, como em todo o sistema.
          </p>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !title.trim()}>
              {pending ? "Criando…" : "Criar bloco"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
