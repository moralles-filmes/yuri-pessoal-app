"use client";

/**
 * Fase 17-C — Revisão e finalização da sessão.
 *
 * ═══════════ NADA É ENCERRADO EM SILÊNCIO ═══════════
 *
 * • Finalizar com série em andamento exige confirmação explícita (o servidor recusa sem ela).
 * • **Descartar apaga a sessão inteira** e exige confirmação reforçada: digitar a palavra.
 * • Abandonar preserva tudo o que foi registrado — é a saída para "não terminei, mas foi isso".
 *
 * ═══════════ O QUE ESTA TELA NÃO FAZ ═══════════
 *
 * Não avalia, não elogia, não cobra e não sugere carga para a próxima vez. Ela mostra o que
 * aconteceu. Quando há dor registrada, o aviso é neutro, preserva o registro e não vira
 * diagnóstico — e nenhuma sugestão de aumento de carga é feita.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Check, Flag, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { StatCard } from "@/components/shared/stat-card";
import { cn } from "@/lib/utils";
import { formatDate, timeInSaoPaulo } from "@/lib/format";
import {
  DERIVED_EXERCISE_STATUS_LABELS,
  SESSION_EVENT_LABELS,
  SESSION_STATUS_LABELS,
  TRAINING_BASE_PATH,
  type SessionEventKind,
} from "@/lib/training/constants";
import { isSetDone } from "@/lib/training/session-machine";
import { summarizeFlow } from "@/lib/training/session-flow";
import { formatDuration, sessionTimes } from "@/lib/training/timers";
import { effectiveLoadKg } from "@/lib/training/tracking";
import type { TrainingSession } from "@/lib/training/types";
import {
  abandonSession,
  finishSession,
  reopenSession,
} from "@/lib/actions/training-sessions";
import { clearSessionQueue } from "./use-session-queue";
import { useNow } from "./use-now";

type SessionEventItem = {
  id: string;
  kind: SessionEventKind;
  occurredAt: string;
  description: string | null;
};

export function SessionReviewClient({
  session,
  events,
}: {
  session: TrainingSession;
  events: SessionEventItem[];
}) {
  const router = useRouter();
  const isClosed = session.status === "concluida" || session.status === "abandonada";
  const now = useNow(!isClosed, 5000);

  const [rating, setRating] = React.useState<number | null>(session.rating);
  const [effort, setEffort] = React.useState<number | null>(session.perceivedEffort);
  const [notes, setNotes] = React.useState(session.notes ?? "");
  const [feltPain, setFeltPain] = React.useState(session.feltPain);
  const [painNotes, setPainNotes] = React.useState(session.painNotes ?? "");
  const [busy, setBusy] = React.useState(false);
  const [confirmActive, setConfirmActive] = React.useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const [discardWord, setDiscardWord] = React.useState("");

  const flow = session.exercises.map((exercise) => ({
    id: exercise.id,
    executedPosition: exercise.executedPosition,
    status: exercise.status,
    supersetGroup: exercise.supersetGroup,
    sets: exercise.sets.map((set) => ({
      id: set.id,
      setNumber: set.setNumber,
      status: set.status,
      isWarmup: set.isWarmup,
    })),
  }));

  const progress = summarizeFlow(flow);

  // Sessão encerrada usa os tempos CONGELADOS; em andamento, deriva de timestamps.
  const times = isClosed
    ? {
        totalSeconds: session.totalSeconds ?? 0,
        activeSeconds: session.activeSeconds ?? 0,
        restSeconds: session.restTotalSeconds ?? 0,
        pausedSeconds: session.pauseTotalSeconds ?? 0,
      }
    : sessionTimes(
        {
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          pauses: session.pauses.map((pause) => ({
            startedAt: pause.startedAt,
            endedAt: pause.endedAt,
          })),
          rests: session.rests.map((rest) => ({
            startedAt: rest.startedAt,
            endedAt: rest.endedAt,
          })),
        },
        now,
      );

  /* ───────────── Volume: o que dá para somar, e o que não dá ─────────────
   * Séries de tipos com unidades diferentes NUNCA se somam. Aqui somamos só a tonelagem
   * (kg × reps) das séries que contam no volume e cuja carga efetiva é conhecida — e dizemos
   * quantas ficaram de fora, em vez de fingir um total completo.
   */
  let tonnage = 0;
  let ignoredSets = 0;
  for (const exercise of session.exercises) {
    for (const set of exercise.sets) {
      if (!isSetDone(set.status) || !set.countsInVolume) continue;
      const load = effectiveLoadKg({
        trackingType: exercise.trackingType,
        weightKg: set.weightKg,
        additionalWeightKg: set.additionalWeightKg,
        assistanceWeightKg: set.assistanceWeightKg,
        bodyWeightKg: session.bodyWeightKg,
      });
      if (!load.ok || set.reps === null) {
        ignoredSets += 1;
        continue;
      }
      tonnage += load.kg * set.reps;
    }
  }

  /* ───────────── Ações ───────────── */

  const handleFinish = async (confirmActiveSets = false) => {
    setBusy(true);
    const result = await finishSession({
      id: session.id,
      rating,
      perceived_effort: effort,
      notes: notes.trim() || null,
      felt_pain: feltPain,
      pain_notes: painNotes.trim() || null,
      confirm_active_sets: confirmActiveSets,
    });
    setBusy(false);

    if (!result.ok) {
      if (result.error.includes("andamento")) {
        setConfirmActive(result.error);
        return;
      }
      toast.error(result.error);
      return;
    }

    clearSessionQueue(session.id);
    toast.success("Treino registrado.");
    router.push(`${TRAINING_BASE_PATH}/hoje`);
  };

  const handleAbandon = async () => {
    setBusy(true);
    const result = await abandonSession({
      id: session.id,
      mode: "abandonar",
      confirm: true,
      reason: notes.trim() || null,
    });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    clearSessionQueue(session.id);
    toast.success("Treino encerrado. O que você registrou continua guardado.");
    router.push(`${TRAINING_BASE_PATH}/hoje`);
  };

  const handleDiscard = async () => {
    setBusy(true);
    const result = await abandonSession({ id: session.id, mode: "descartar", confirm: true });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    clearSessionQueue(session.id);
    toast.success("Treino descartado.");
    router.push(`${TRAINING_BASE_PATH}/hoje`);
  };

  const handleReopen = async () => {
    setBusy(true);
    const result = await reopenSession({ id: session.id, confirm: true });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.push(`${TRAINING_BASE_PATH}/sessao`);
  };

  return (
    <div className="space-y-4 pb-24">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{session.workoutName}</CardTitle>
              <CardDescription>
                {formatDate(session.sessionDate)}
                {session.startedAt ? ` · início ${timeInSaoPaulo(new Date(session.startedAt))}` : ""}
                {session.endedAt ? ` · fim ${timeInSaoPaulo(new Date(session.endedAt))}` : ""}
                {session.locationName ? ` · ${session.locationName}` : ""}
              </CardDescription>
            </div>
            <Badge variant="secondary">{SESSION_STATUS_LABELS[session.status]}</Badge>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tempo total" value={formatDuration(times.totalSeconds)} />
        <StatCard
          label="Tempo ativo"
          value={formatDuration(times.activeSeconds)}
          hint="Sem pausas e sem descansos"
        />
        <StatCard
          label="Séries feitas"
          value={`${progress.setsDone}`}
          hint={`de ${progress.setsTotal} previstas`}
        />
        <StatCard
          label="Carga movimentada"
          value={tonnage > 0 ? `${Math.round(tonnage).toLocaleString("pt-BR")} kg` : "—"}
          hint={
            ignoredSets > 0
              ? `Parcial: ${ignoredSets} ${ignoredSets === 1 ? "série ficou" : "séries ficaram"} de fora por não ter carga calculável`
              : "kg × repetições das séries de trabalho"
          }
        />
      </div>

      {times.pausedSeconds > 0 && (
        <p className="text-xs text-muted-foreground">
          Pausado por {formatDuration(times.pausedSeconds)} · descansando por{" "}
          {formatDuration(times.restSeconds)}. O tempo pausado não entra no tempo ativo.
        </p>
      )}

      {/* ───────── Por exercício ───────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">O que foi feito</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {session.exercises.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum exercício registrado.</p>
          )}
          {session.exercises.map((exercise) => {
            const done = exercise.sets.filter((set) => isSetDone(set.status));
            return (
              <div key={exercise.id} className="rounded-xl border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{exercise.exerciseName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {done.length} de {exercise.sets.length}{" "}
                      {exercise.sets.length === 1 ? "série" : "séries"}
                      {exercise.isExtra ? " · adicionado durante o treino" : ""}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {DERIVED_EXERCISE_STATUS_LABELS[exercise.derivedStatus]}
                  </Badge>
                </div>

                {done.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {done.map((set) => (
                      <span
                        key={set.id}
                        className="rounded-lg bg-muted px-2 py-1 text-xs tabular-nums"
                      >
                        {set.weightKg !== null ? `${set.weightKg} kg` : ""}
                        {set.weightKg !== null && set.reps !== null ? " × " : ""}
                        {set.reps !== null ? `${set.reps}` : ""}
                        {set.durationSeconds !== null ? `${set.durationSeconds}s` : ""}
                        {set.distanceM !== null ? ` ${set.distanceM} m` : ""}
                        {set.status === "falhou" ? " · falha" : ""}
                        {set.isWarmup ? " · aq" : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ───────── Substituições ───────── */}
      {session.substitutions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Substituições</CardTitle>
            <CardDescription>
              Registro do que você trocou e por quê. O sistema não afirma equivalência entre os
              exercícios.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {session.substitutions.map((item) => (
              <p key={item.id} className="text-sm">
                <span className="text-muted-foreground">{item.originalName}</span> →{" "}
                <strong>{item.substituteName}</strong>
                {item.reasonNotes ? ` · ${item.reasonNotes}` : ""}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ───────── Avaliação ───────── */}
      {!isClosed && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Como foi o treino</CardTitle>
            <CardDescription>Tudo opcional. Nada aqui vira recomendação.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Avaliação (1 a 5)</Label>
              <div className="mt-1.5 flex gap-1.5">
                {[1, 2, 3, 4, 5].map((level) => (
                  <Button
                    key={level}
                    type="button"
                    variant={rating === level ? "default" : "outline"}
                    className="size-12 p-0 text-base"
                    onClick={() => setRating(rating === level ? null : level)}
                    aria-label={`Avaliação ${level}`}
                    aria-pressed={rating === level}
                  >
                    {level}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">
                Esforço percebido no treino todo (1 a 10)
              </Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {Array.from({ length: 10 }, (_, index) => index + 1).map((level) => (
                  <Button
                    key={level}
                    type="button"
                    variant={effort === level ? "default" : "outline"}
                    className="size-11 p-0"
                    onClick={() => setEffort(effort === level ? null : level)}
                    aria-label={`Esforço ${level}`}
                    aria-pressed={effort === level}
                  >
                    {level}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-start justify-between gap-3 rounded-xl border p-3">
              <div className="min-w-0">
                <p className="text-sm">Senti dor ou desconforto</p>
                <p className="text-xs text-muted-foreground">
                  Fica registrado como você anotou.
                </p>
              </div>
              <Switch
                checked={feltPain}
                onCheckedChange={setFeltPain}
                aria-label="Senti dor ou desconforto"
              />
            </div>

            {feltPain && (
              <div className="space-y-2">
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                  <p className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>
                      O registro é preservado exatamente como você escreveu. Este aplicativo não
                      avalia lesão, não diagnostica e não indica tratamento — e não vai sugerir
                      aumento de carga a partir daqui. Se a dor persistir ou piorar, procure
                      orientação de um profissional de saúde.
                    </span>
                  </p>
                </div>
                <Textarea
                  value={painNotes}
                  onChange={(event) => setPainNotes(event.target.value)}
                  rows={2}
                  placeholder="Onde, quando e em qual exercício"
                />
              </div>
            )}

            <div>
              <Label className="text-xs text-muted-foreground">Observações do treino</Label>
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                className="mt-1.5"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ───────── Linha do tempo ───────── */}
      {events.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Linha do tempo</CardTitle>
            <CardDescription>
              O que aconteceu, na ordem. Registro append-only — não é reescrito.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {events.map((event) => (
                <li key={event.id} className="flex gap-2 text-sm">
                  <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                    {timeInSaoPaulo(new Date(event.occurredAt))}
                  </span>
                  <span className="min-w-0 flex-1">
                    {SESSION_EVENT_LABELS[event.kind]}
                    {event.description ? (
                      <span className="text-muted-foreground"> · {event.description}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ───────── Barra fixa ───────── */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
          {isClosed ? (
            <>
              <Button asChild variant="outline" className="h-12">
                <Link href={`${TRAINING_BASE_PATH}/hoje`}>Voltar</Link>
              </Button>
              <Button
                variant="ghost"
                className="h-12"
                onClick={handleReopen}
                disabled={busy}
              >
                <RotateCcw className="size-4" />
                Reabrir treino
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" className="h-12 shrink-0">
                <Link href={`${TRAINING_BASE_PATH}/sessao`}>Voltar ao treino</Link>
              </Button>
              <Button
                variant="ghost"
                className="h-12 shrink-0 text-destructive"
                onClick={() => setConfirmDiscard(true)}
                disabled={busy}
              >
                <Trash2 className="size-4" />
                Descartar
              </Button>
              <Button
                className="h-12 min-w-0 flex-1 text-base"
                onClick={() => handleFinish(false)}
                disabled={busy}
              >
                {busy ? <Loader2 className="size-5 animate-spin" /> : <Flag className="size-5" />}
                Finalizar e salvar
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Série em andamento: confirmação explícita, como o servidor exige. */}
      <Dialog open={confirmActive !== null} onOpenChange={() => setConfirmActive(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar com série em andamento?</DialogTitle>
            <DialogDescription>{confirmActive}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmActive(null)}>
              Voltar
            </Button>
            <Button
              onClick={() => {
                setConfirmActive(null);
                void handleFinish(true);
              }}
              disabled={busy}
            >
              <Check className="size-4" />
              Finalizar assim mesmo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Descartar: confirmação REFORÇADA — é a única ação que apaga execução. */}
      <Dialog
        open={confirmDiscard}
        onOpenChange={(open) => {
          setConfirmDiscard(open);
          if (!open) setDiscardWord("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Descartar o treino inteiro?</DialogTitle>
            <DialogDescription>
              Isto apaga <strong>{progress.setsDone}</strong>{" "}
              {progress.setsDone === 1 ? "série registrada" : "séries registradas"}, os
              descansos, as substituições e a linha do tempo. Não dá para desfazer.
              <br />
              <br />
              Se você só não terminou o treino, prefira <strong>encerrar</strong> — o que foi
              feito continua guardado.
            </DialogDescription>
          </DialogHeader>

          <div>
            <Label className="text-xs text-muted-foreground" htmlFor="confirmar-descarte">
              Digite <strong>DESCARTAR</strong> para confirmar
            </Label>
            <Input
              id="confirmar-descarte"
              value={discardWord}
              onChange={(event) => setDiscardWord(event.target.value)}
              className="mt-1.5 h-11"
              autoComplete="off"
            />
          </div>

          <DialogFooter className={cn("gap-2 sm:justify-between")}>
            <Button variant="outline" onClick={handleAbandon} disabled={busy}>
              Encerrar guardando o que foi feito
            </Button>
            <Button
              variant="destructive"
              onClick={handleDiscard}
              disabled={busy || discardWord.trim().toUpperCase() !== "DESCARTAR"}
            >
              <Trash2 className="size-4" />
              Descartar tudo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
