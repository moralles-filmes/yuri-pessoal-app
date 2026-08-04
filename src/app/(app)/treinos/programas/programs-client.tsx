"use client";

/**
 * Fase 17-B — Treinos · Programas (cliente).
 *
 * Filtros na URL (padrão do projeto), lista filtrada em memória, ações em massa e composição
 * do programa por arrastar-e-soltar com alternativa por teclado.
 *
 * DUAS REGRAS QUE A TELA CUMPRE À RISCA:
 *
 * • **Excluir sempre pergunta o destino** dos treinos (diálogo dedicado, sem opção marcada).
 * • **Mais de um programa ativo AVISA, não bloqueia.** A rotina é do usuário; o sistema
 *   informa que já havia outro em uso e segue.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarRange,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Layers,
  MoreHorizontal,
  Pause,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SortableList } from "@/components/shared/sortable-list";
import { cn } from "@/lib/utils";
import { normalizeText } from "@/lib/training/filters";
import {
  PROGRAM_STATUSES,
  PROGRAM_STATUS_LABELS,
  TRAINING_BASE_PATH,
  TRAINING_GOALS,
  TRAINING_GOAL_LABELS,
  TRAINING_LEVEL_LABELS,
  WEEKDAY_SHORT_LABELS,
  type ProgramStatus,
  type TrainingGoal,
} from "@/lib/training/constants";
import type { TrainingProgram, TrainingWorkout } from "@/lib/training/types";
import {
  activateTrainingProgram,
  addWorkoutToProgram,
  deleteTrainingProgram,
  duplicateTrainingProgram,
  getTrainingProgramDependencies,
  removeWorkoutFromProgram,
  reorderProgramWorkouts,
  setTrainingProgramStatus,
  updateProgramWorkout,
} from "@/lib/actions/training-programs";
import { ProgramFormDialog } from "@/components/training/program-form-dialog";
import {
  DeleteWithDestinationDialog,
  type DependencyLine,
} from "@/components/training/delete-with-destination-dialog";

const ALL = "__todos__";

export function ProgramsClient({
  programs,
  workouts,
  hoje,
}: {
  programs: TrainingProgram[];
  workouts: TrainingWorkout[];
  hoje: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const search = searchParams.get("q") ?? "";
  const statusFilter = (searchParams.get("situacao") as ProgramStatus | null) ?? null;
  const goalFilter = (searchParams.get("objetivo") as TrainingGoal | null) ?? null;
  const showArchived = searchParams.get("arquivados") === "1";

  const visible = React.useMemo(() => {
    const terms = normalizeText(search).split(/\s+/).filter(Boolean);
    return programs.filter((program) => {
      if (program.isArchived !== showArchived) return false;
      if (statusFilter && program.status !== statusFilter) return false;
      if (goalFilter && program.goal !== goalFilter) return false;
      if (terms.length === 0) return true;
      const haystack = normalizeText(`${program.name} ${program.description ?? ""}`);
      return terms.every((term) => haystack.includes(term));
    });
  }, [programs, search, statusFilter, goalFilter, showArchived]);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TrainingProgram | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<TrainingProgram | null>(null);
  const [dependencies, setDependencies] = React.useState<DependencyLine[] | null>(null);
  const [busy, setBusy] = React.useState(false);

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(params.toString() ? `?${params}` : "?", { scroll: false });
  }

  async function openDelete(program: TrainingProgram) {
    setDeleting(program);
    setDependencies(null);
    const result = await getTrainingProgramDependencies(program.id, hoje);
    if (result.ok) {
      setDependencies([
        { label: "treino(s) neste programa", count: result.data.workouts },
        { label: "dia(s) planejados a partir de hoje", count: result.data.scheduledFuture },
      ]);
    } else {
      setDependencies([]);
    }
  }

  async function confirmDelete(destination: string, targetId: string | null) {
    if (!deleting) return;
    const result = await deleteTrainingProgram({
      id: deleting.id,
      workouts_destination: destination,
      target_program_id: targetId,
    });

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      result.data.workoutsAffected > 0
        ? `Programa excluído. ${result.data.workoutsAffected} treino(s) tratados como você escolheu.`
        : "Programa excluído.",
    );
    setDeleting(null);
    router.refresh();
  }

  async function changeStatus(program: TrainingProgram, status: ProgramStatus) {
    setBusy(true);
    const result = await setTrainingProgramStatus({ id: program.id, status });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Programa ${PROGRAM_STATUS_LABELS[status].toLowerCase()}.`);
    router.refresh();
  }

  async function activate(program: TrainingProgram) {
    setBusy(true);
    const result = await activateTrainingProgram(program.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    // Avisa, não bloqueia: ter mais de um programa em uso é escolha legítima do usuário.
    toast.success(
      result.data.otherActive > 0
        ? `Programa ativado. Você tem outros ${result.data.otherActive} programa(s) em uso ao mesmo tempo.`
        : "Programa ativado.",
    );
    router.refresh();
  }

  async function duplicate(program: TrainingProgram) {
    setBusy(true);
    const result = await duplicateTrainingProgram(program.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Cópia criada como rascunho. Ajuste antes de usar.");
    router.refresh();
  }

  const activeWorkouts = workouts.filter((workout) => !workout.isArchived && !workout.isSuperseded);
  const activeCount = programs.filter((p) => p.isActive && !p.isArchived).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Programas"
        description="Agrupe treinos num programa (ABC, Push/Pull/Legs, Upper/Lower) e defina a ordem e os dias sugeridos."
      >
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" />
          Novo programa
        </Button>
      </PageHeader>

      {activeCount > 1 && (
        <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          Você tem <strong>{activeCount} programas em uso</strong> ao mesmo tempo. Isso é
          permitido — só confira se é o que você quer.
        </p>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <Input
          value={search}
          onChange={(event) => setParam("q", event.target.value || null)}
          placeholder="Buscar programa…"
          className="h-9 w-full sm:w-56"
          aria-label="Buscar programa"
        />
        <Select
          value={statusFilter ?? ALL}
          onValueChange={(value) => setParam("situacao", value === ALL ? null : value)}
        >
          <SelectTrigger className="h-9 w-full sm:w-44" aria-label="Filtrar por situação">
            <SelectValue placeholder="Situação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as situações</SelectItem>
            {PROGRAM_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {PROGRAM_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={goalFilter ?? ALL}
          onValueChange={(value) => setParam("objetivo", value === ALL ? null : value)}
        >
          <SelectTrigger className="h-9 w-full sm:w-48" aria-label="Filtrar por objetivo">
            <SelectValue placeholder="Objetivo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os objetivos</SelectItem>
            {TRAINING_GOALS.map((goal) => (
              <SelectItem key={goal} value={goal}>
                {TRAINING_GOAL_LABELS[goal]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={showArchived ? "default" : "outline"}
          size="sm"
          onClick={() => setParam("arquivados", showArchived ? null : "1")}
        >
          Arquivados
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {visible.length} de {programs.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={showArchived ? "Nenhum programa arquivado" : "Nenhum programa ainda"}
          description="Um programa organiza seus treinos numa rotina — ABC, Push/Pull/Legs, Upper/Lower ou o seu."
        >
          {!showArchived && (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" />
              Novo programa
            </Button>
          )}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {visible.map((program) => (
            <li key={program.id}>
              <ProgramCard
                program={program}
                workouts={activeWorkouts}
                expanded={expandedId === program.id}
                busy={busy}
                onToggle={() =>
                  setExpandedId((current) => (current === program.id ? null : program.id))
                }
                onEdit={() => {
                  setEditing(program);
                  setFormOpen(true);
                }}
                onActivate={() => activate(program)}
                onStatus={(status) => changeStatus(program, status)}
                onDuplicate={() => duplicate(program)}
                onDelete={() => openDelete(program)}
                onChanged={() => router.refresh()}
              />
            </li>
          ))}
        </ul>
      )}

      <ProgramFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        program={editing}
        onSaved={() => router.refresh()}
      />

      {deleting && (
        <DeleteWithDestinationDialog
          open
          onOpenChange={(open) => !open && setDeleting(null)}
          title="Excluir programa"
          itemName={deleting.name}
          dependencies={dependencies ?? []}
          loadingDependencies={dependencies === null}
          options={[
            {
              value: "manter_avulsos",
              label: "Manter os treinos como avulsos",
              description: "Os treinos continuam existindo, fora de qualquer programa.",
            },
            {
              value: "mover",
              label: "Mover os treinos para outro programa",
              description: "Os treinos passam a compor o programa que você escolher.",
              requiresTarget: true,
            },
            {
              value: "excluir",
              label: "Excluir os treinos junto",
              description: "Os treinos deste programa também são excluídos. Não dá para desfazer.",
              tone: "destructive",
            },
          ]}
          targetLabel="Programa de destino"
          targets={programs
            .filter((item) => item.id !== deleting.id && !item.isArchived)
            .map((item) => ({ id: item.id, name: item.name }))}
          confirmLabel="Excluir programa"
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

/* ───────────────────────────── Card do programa ───────────────────────────── */

function ProgramCard({
  program,
  workouts,
  expanded,
  busy,
  onToggle,
  onEdit,
  onActivate,
  onStatus,
  onDuplicate,
  onDelete,
  onChanged,
}: {
  program: TrainingProgram;
  workouts: TrainingWorkout[];
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onActivate: () => void;
  onStatus: (status: ProgramStatus) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const [adding, setAdding] = React.useState<string>("");
  const [working, setWorking] = React.useState(false);

  const linked = program.workouts;
  const available = workouts.filter(
    (workout) => !linked.some((link) => link.workoutId === workout.id),
  );

  async function addWorkout(workoutId: string) {
    setWorking(true);
    const result = await addWorkoutToProgram({
      program_id: program.id,
      workout_id: workoutId,
      suggested_weekdays: [],
    });
    setWorking(false);
    setAdding("");
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onChanged();
  }

  async function reorder(orderedIds: string[]) {
    const result = await reorderProgramWorkouts({ ids: orderedIds });
    if (!result.ok) toast.error(result.error);
    else onChanged();
  }

  async function moveBy(id: string, offset: number) {
    const ids = linked.map((link) => link.id);
    const from = ids.indexOf(id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    next.splice(to, 0, next.splice(from, 1)[0]);
    await reorder(next);
  }

  async function remove(linkId: string) {
    const result = await removeWorkoutFromProgram(linkId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Treino tirado do programa. Ele continua existindo como avulso.");
    onChanged();
  }

  async function toggleWeekday(linkId: string, current: number[], weekday: number) {
    const next = current.includes(weekday)
      ? current.filter((day) => day !== weekday)
      : [...current, weekday];
    const result = await updateProgramWorkout({ id: linkId, suggested_weekdays: next });
    if (!result.ok) toast.error(result.error);
    else onChanged();
  }

  return (
    <Card className={cn(program.isActive && "ring-1 ring-primary/30")}>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <span className="truncate">{program.name}</span>
              {program.isActive && <Badge className="shrink-0">Em uso</Badge>}
              <Badge variant="secondary" className="shrink-0">
                {PROGRAM_STATUS_LABELS[program.status]}
              </Badge>
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {TRAINING_GOAL_LABELS[program.goal]} · {TRAINING_LEVEL_LABELS[program.level]} ·{" "}
              {linked.length} {linked.length === 1 ? "treino" : "treinos"}
              {program.weeklyFrequency ? ` · ${program.weeklyFrequency}×/semana` : ""}
            </p>
          </button>

          <div className="flex shrink-0 items-center gap-1">
            {!program.isActive && !program.isArchived && (
              <Button size="sm" variant="outline" disabled={busy} onClick={onActivate}>
                <Check className="size-4" />
                Usar
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`Ações de ${program.name}`}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="size-4" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDuplicate}>
                  <Copy className="size-4" />
                  Duplicar
                </DropdownMenuItem>
                {program.status !== "pausado" && (
                  <DropdownMenuItem onClick={() => onStatus("pausado")}>
                    <Pause className="size-4" />
                    Pausar
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onStatus("finalizado")}>
                  Finalizar
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onStatus(program.isArchived ? "ativo" : "arquivado")}
                >
                  {program.isArchived ? "Restaurar" : "Arquivar"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  <Trash2 className="size-4" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4 border-t pt-4">
          {program.description && (
            <p className="text-sm text-muted-foreground">{program.description}</p>
          )}

          {linked.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum treino neste programa ainda. Adicione abaixo — os treinos continuam
              reutilizáveis em outros programas.
            </p>
          ) : (
            <SortableList
              items={linked}
              getId={(link) => link.id}
              onReorder={reorder}
              className="space-y-2"
              renderItem={(link, handle) => (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5">
                  {handle}
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`${TRAINING_BASE_PATH}/treinos/${link.workoutId}`}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {link.workoutName}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {WEEKDAY_SHORT_LABELS.map((label, weekday) => {
                        const on = link.suggestedWeekdays.includes(weekday);
                        return (
                          <button
                            key={weekday}
                            type="button"
                            onClick={() => toggleWeekday(link.id, link.suggestedWeekdays, weekday)}
                            aria-pressed={on}
                            aria-label={`${label} — dia sugerido para ${link.workoutName}`}
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              on
                                ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                                : "bg-muted text-muted-foreground hover:bg-accent",
                            )}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Alternativa por teclado ao arrastar (acessibilidade). */}
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => moveBy(link.id, -1)}
                      aria-label={`Mover ${link.workoutName} para cima`}
                    >
                      <ChevronUp className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => moveBy(link.id, 1)}
                      aria-label={`Mover ${link.workoutName} para baixo`}
                    >
                      <ChevronDown className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => remove(link.id)}
                      aria-label={`Tirar ${link.workoutName} do programa`}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
              )}
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={adding}
              onValueChange={(value) => {
                setAdding(value);
                addWorkout(value);
              }}
              disabled={working || available.length === 0}
            >
              <SelectTrigger className="h-9 w-full sm:w-72" aria-label="Adicionar treino ao programa">
                <SelectValue
                  placeholder={
                    available.length === 0
                      ? "Todos os seus treinos já estão neste programa"
                      : "Adicionar treino ao programa…"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {available.map((workout) => (
                  <SelectItem key={workout.id} value={workout.id}>
                    {workout.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button asChild variant="outline" size="sm">
              <Link href={`${TRAINING_BASE_PATH}/calendario?programa=${program.id}`}>
                <CalendarRange className="size-4" />
                Planejar no calendário
              </Link>
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Os dias marcados acima são <strong>sugestão do programa</strong>. O planejamento com
            data acontece no calendário, e é lá que ele pode ser reagendado.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
