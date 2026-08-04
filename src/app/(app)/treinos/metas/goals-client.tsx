"use client";

/**
 * Fase 17-E — Treinos · Metas (cliente).
 *
 * ═══════════ O QUE ESTA TELA GARANTE ═══════════
 *
 * 1. **O número não vem daqui.** Cada meta chega com o valor já resolvido por `metrics.ts`
 *    (17-D) e pelo módulo central `body_*` (16-E). A tela desenha; não calcula.
 * 2. **Indisponível é indisponível.** Meta sem medição mostra "—" e o motivo por extenso, em
 *    vez de uma barra em 0% que pareceria fracasso.
 * 3. **Alterar não apaga.** Toda mudança de alvo, prazo ou situação fica no histórico da meta,
 *    visível no próprio card.
 * 4. **Sem prescrição e sem cobrança.** Nenhum texto sugere alvo, carga ou culpa.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Info,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Field } from "@/components/training/field";
import { GoalFormDialog } from "@/components/training/goal-form-dialog";
import { cn } from "@/lib/utils";
import {
  GOAL_KIND_LABELS,
  GOAL_METRIC_LABELS,
  GOAL_PERIOD_LABELS,
  GOAL_PROGRESS_KIND_LABELS,
  GOAL_STATUS_LABELS,
  formatGoalValue,
  isGoalOpen,
  paceLabel,
  remainingLabel,
  sortGoalsForDisplay,
  type DerivedGoalStatus,
  type GoalKind,
} from "@/lib/training/goals";
import { shortDateLabelIso } from "@/lib/training/history";
import type { ResolvedGoal } from "@/lib/training/goal-queries";
import type { MeasurementType } from "@/lib/body/types";
import {
  deleteTrainingGoal,
  recordGoalProgress,
  setTrainingGoalStatus,
} from "@/lib/actions/training-goals";

const ALL = "__todas__";

/** Cores de estado. Nada de vermelho de alarme para "atrás do ritmo": é informação, não erro. */
const STATUS_TONE: Record<DerivedGoalStatus, string> = {
  ativa: "bg-primary/10 text-primary ring-primary/20",
  em_atraso: "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300",
  atingida: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300",
  planejada: "bg-muted text-muted-foreground ring-border",
  pausada: "bg-muted text-muted-foreground ring-border",
  concluida: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300",
  expirada: "bg-muted text-muted-foreground ring-border",
  cancelada: "bg-muted text-muted-foreground ring-border",
};

export function GoalsClient({
  goals,
  hoje,
  exercises,
  muscleGroups,
  programs,
  measurementTypes,
}: {
  goals: ResolvedGoal[];
  hoje: string;
  exercises: { id: string; name: string }[];
  muscleGroups: { id: string; name: string }[];
  programs: { id: string; name: string }[];
  measurementTypes: MeasurementType[];
}) {
  const router = useRouter();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ResolvedGoal | null>(null);
  const [deleting, setDeleting] = React.useState<ResolvedGoal | null>(null);
  const [recording, setRecording] = React.useState<ResolvedGoal | null>(null);
  const [kindFilter, setKindFilter] = React.useState<string>(ALL);
  const [showClosed, setShowClosed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const visible = sortGoalsForDisplay(
    goals
      .filter((item) => kindFilter === ALL || item.goal.kind === kindFilter)
      .filter((item) => showClosed || isGoalOpen(item.progress.status))
      .map((item) => ({
        ...item,
        status: item.progress.status,
        endsOn: item.goal.endsOn,
        position: item.goal.position,
        name: item.goal.name,
      })),
  );

  const open = goals.filter((item) => isGoalOpen(item.progress.status));
  const reached = goals.filter((item) => item.progress.status === "atingida");
  const unavailable = goals.filter((item) => item.value.value === null);

  async function changeStatus(goal: ResolvedGoal, status: "ativa" | "pausada" | "concluida" | "cancelada") {
    setBusy(true);
    const result = await setTrainingGoalStatus({ id: goal.goal.id, status });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Situação atualizada. A alteração ficou no histórico da meta.");
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    const result = await deleteTrainingGoal({ id: deleting.goal.id, confirm: true });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Meta excluída.");
    setDeleting(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Metas"
        description="Frequência, desempenho, corpo e organização. Você define o alvo — o sistema só compara com o que foi registrado."
      >
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" />
          Nova meta
        </Button>
      </PageHeader>

      {goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Nenhuma meta cadastrada"
          description="Uma meta diz o que VOCÊ quer acompanhar: treinos por semana, carga num exercício, peso corporal ou qualquer número seu. O sistema não sugere alvo nenhum."
        >
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" />
            Criar a primeira meta
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Em andamento" value={String(open.length)} icon={Target} />
            <StatCard
              label="Alvo alcançado"
              value={String(reached.length)}
              icon={CheckCircle2}
              hint="continuam acompanhando"
            />
            <StatCard label="Cadastradas" value={String(goals.length)} icon={Target} />
            <StatCard
              label="Sem dado no período"
              value={String(unavailable.length)}
              icon={Info}
              hint={unavailable.length > 0 ? "veja o motivo no card" : "todas com valor"}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className="h-9 w-[200px]" aria-label="Filtrar por tipo de meta">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os tipos</SelectItem>
                {(Object.keys(GOAL_KIND_LABELS) as GoalKind[]).map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {GOAL_KIND_LABELS[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant={showClosed ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowClosed((value) => !value)}
            >
              {showClosed ? "Escondendo nada" : "Mostrar encerradas"}
            </Button>
          </div>

          {visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhuma meta neste filtro.
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {visible.map((item) => (
                <GoalCard
                  key={item.goal.id}
                  item={item}
                  busy={busy}
                  onEdit={() => {
                    setEditing(item);
                    setFormOpen(true);
                  }}
                  onDelete={() => setDeleting(item)}
                  onRecord={() => setRecording(item)}
                  onStatus={(status) => changeStatus(item, status)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <GoalFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        goal={editing?.goal ?? null}
        hoje={hoje}
        exercises={exercises}
        muscleGroups={muscleGroups}
        programs={programs}
        measurementTypes={measurementTypes}
        onSaved={() => router.refresh()}
      />

      <RecordProgressDialog
        goal={recording}
        hoje={hoje}
        onClose={() => setRecording(null)}
        onSaved={() => {
          setRecording(null);
          router.refresh();
        }}
      />

      <Dialog open={Boolean(deleting)} onOpenChange={(value) => !value && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir esta meta?</DialogTitle>
            <DialogDescription>
              O histórico de alterações e de progresso <strong>desta meta</strong> vai junto. Os
              treinos registrados e as medidas corporais não são afetados — eles vivem em outro
              lugar. Se você só quer parar de acompanhar, use <strong>pausar</strong> ou{" "}
              <strong>cancelar</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={busy}>
              Manter a meta
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Excluir meta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════ Card de uma meta ═══════════════════════════ */

function GoalCard({
  item,
  busy,
  onEdit,
  onDelete,
  onRecord,
  onStatus,
}: {
  item: ResolvedGoal;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRecord: () => void;
  onStatus: (status: "ativa" | "pausada" | "concluida" | "cancelada") => void;
}) {
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const { goal, progress, value, range, milestones, unit } = item;
  const status = progress.status;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{goal.name}</p>
            <p className="text-xs text-muted-foreground">
              {GOAL_KIND_LABELS[goal.kind]} · {GOAL_METRIC_LABELS[goal.metric]}
              {item.targetLabel ? ` · ${item.targetLabel}` : ""}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1",
              STATUS_TONE[status],
            )}
          >
            {GOAL_STATUS_LABELS[status]}
          </span>
        </div>

        {/* ── O número ── */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-2xl font-semibold tabular-nums">
            {formatGoalValue(value.value, unit)}
          </span>
          <span className="text-sm text-muted-foreground">
            de {formatGoalValue(goal.targetValue, unit)}
          </span>
          {progress.percent !== null && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {progress.percent.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% do caminho
            </span>
          )}
        </div>

        {/* Barra com os marcos marcados. Sem valor, a barra não aparece — 0% mentiria. */}
        {progress.percent !== null ? (
          <div className="relative h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full",
                status === "atingida" || status === "concluida" ? "bg-emerald-500" : "bg-primary",
              )}
              style={{ width: `${progress.percent}%` }}
            />
            {milestones
              .filter((milestone) => milestone.percentOfPath !== null)
              .map((milestone, index) => (
                <span
                  key={`${milestone.value}-${index}`}
                  className="absolute top-0 h-full w-px bg-background/80"
                  style={{ left: `${milestone.percentOfPath}%` }}
                  aria-hidden="true"
                />
              ))}
          </div>
        ) : (
          <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              <strong className="text-foreground">Sem dado no período.</strong> {value.reason}
            </span>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{remainingLabel(progress, goal.direction, unit)}</span>
          <span aria-hidden="true">·</span>
          <span>
            {GOAL_PERIOD_LABELS[goal.period]}: {range.label}
          </span>
          {progress.pace.daysLeft !== null && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {progress.pace.daysLeft >= 0
                  ? `${progress.pace.daysLeft} dia(s) até o prazo`
                  : `prazo encerrado há ${Math.abs(progress.pace.daysLeft)} dia(s)`}
              </span>
            </>
          )}
        </div>

        {paceLabel(progress.pace) && (
          <p className="text-xs text-muted-foreground">{paceLabel(progress.pace)}</p>
        )}

        {/* Qualidade do número — a mesma disciplina do volume parcial (17-D). */}
        {value.value !== null && value.quality === "parcial" && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>{value.reason}</span>
          </p>
        )}

        {/* ── Marcos ── */}
        {milestones.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {milestones.map((milestone, index) => (
              <li key={`${milestone.value}-${index}`}>
                <Badge
                  variant={milestone.state === "atingido" ? "default" : "outline"}
                  className="text-[10px] font-normal"
                >
                  {milestone.state === "atingido" && <CheckCircle2 className="size-3" />}
                  {milestone.label ?? formatGoalValue(milestone.value, unit)}
                  {milestone.label ? ` · ${formatGoalValue(milestone.value, unit)}` : ""}
                  {milestone.state === "prazo_vencido" ? " · prazo passou" : ""}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        {/* ── Ações ── */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {goal.metric === "personalizada" && (
            <Button variant="outline" size="sm" onClick={onRecord} disabled={busy}>
              <Plus className="size-4" />
              Registrar valor
            </Button>
          )}

          {goal.status === "pausada" ? (
            <Button variant="ghost" size="sm" onClick={() => onStatus("ativa")} disabled={busy}>
              <Play className="size-4" />
              Retomar
            </Button>
          ) : goal.status === "ativa" || goal.status === "planejada" ? (
            <Button variant="ghost" size="sm" onClick={() => onStatus("pausada")} disabled={busy}>
              <Pause className="size-4" />
              Pausar
            </Button>
          ) : null}

          {goal.status !== "concluida" && goal.status !== "cancelada" && (
            <Button variant="ghost" size="sm" onClick={() => onStatus("concluida")} disabled={busy}>
              <CheckCircle2 className="size-4" />
              Concluir
            </Button>
          )}

          {goal.status !== "cancelada" && goal.status !== "concluida" && (
            <Button variant="ghost" size="sm" onClick={() => onStatus("cancelada")} disabled={busy}>
              <X className="size-4" />
              Cancelar
            </Button>
          )}

          <span className="flex-1" />

          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onEdit}
            aria-label={`Editar a meta ${goal.name}`}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            aria-label={`Excluir a meta ${goal.name}`}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>

        {/* ── Histórico: alterar a meta NÃO apaga o que já aconteceu ── */}
        {item.history.length > 0 && (
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => setHistoryOpen((value) => !value)}
              aria-expanded={historyOpen}
            >
              {historyOpen ? "Esconder o histórico" : `Ver histórico (${item.history.length})`}
            </Button>

            {historyOpen && (
              <ul className="mt-2 space-y-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                {item.history.slice(0, 20).map((entry) => (
                  <li key={entry.id}>
                    {shortDateLabelIso(entry.recordedOn)} ·{" "}
                    {GOAL_PROGRESS_KIND_LABELS[entry.entryKind]}
                    {entry.field ? ` · ${entry.field.replace(/_/g, " ")}` : ""}
                    {entry.previousText !== null && entry.newText !== null
                      ? `: ${entry.previousText} → ${entry.newText}`
                      : entry.newText !== null
                        ? `: ${entry.newText}`
                        : entry.value !== null
                          ? `: ${formatGoalValue(entry.value, unit)}`
                          : ""}
                    {entry.note ? ` — ${entry.note}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════ Registro manual ═══════════════════════════ */

/**
 * Só aparece na meta PERSONALIZADA.
 *
 * Numa meta de volume ou de frequência o valor vem dos treinos registrados — digitar o número
 * ali permitiria "atingir" a meta sem treinar, e a action recusa mesmo que a tela deixasse.
 */
function RecordProgressDialog({
  goal,
  hoje,
  onClose,
  onSaved,
}: {
  goal: ResolvedGoal | null;
  hoje: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = React.useState("");
  const [date, setDate] = React.useState(hoje);
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Ajuste durante o render (React Compiler ligado) — sem setState em useEffect.
  const key = goal?.goal.id ?? "";
  const [lastKey, setLastKey] = React.useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setValue("");
    setDate(hoje);
    setNote("");
  }

  async function submit() {
    if (!goal) return;
    setSaving(true);
    const result = await recordGoalProgress({
      goal_id: goal.goal.id,
      recorded_on: date,
      value,
      note,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Progresso registrado.");
    onSaved();
  }

  return (
    <Dialog open={Boolean(goal)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar progresso</DialogTitle>
          <DialogDescription>
            {goal?.goal.name}. O valor entra no histórico da meta com a data informada — nada é
            sobrescrito.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label={`Valor (${goal?.unit ?? ""})`}>
            <Input
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="0"
              autoFocus
            />
          </Field>
          <Field label="Data">
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Observação (opcional)">
            <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || value.trim() === ""}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
