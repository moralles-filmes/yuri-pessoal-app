"use client";

/**
 * Fase 17-A — Treinos · Painel de detalhe de um exercício.
 *
 * Três abas, na ordem em que a informação é procurada:
 *  • **Detalhes** — como o exercício é medido, que músculos envolve, como está configurado.
 *  • **Alternativas** — "quando o aparelho estiver ocupado, faço…". Organização do usuário,
 *    e a tela diz isso: não afirmamos equivalência biomecânica.
 *  • **Personalizar** — apelido, descanso e incremento SEUS, gravados em
 *    `training_exercise_prefs`. É como se ajusta um exercício da base sem nunca editá-lo.
 */
import * as React from "react";
import Link from "next/link";
import { History, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExerciseSearchPicker } from "@/components/training/exercise-search-picker";
import { Textarea } from "@/components/ui/textarea";
import {
  EXERCISE_SOURCE_LABELS,
  EXERCISE_TYPE_LABELS,
  LATERALITY_LABELS,
  MOVEMENT_PATTERN_LABELS,
  MUSCLE_ROLE_LABELS,
  TRACKING_TYPE_HINTS,
  TRACKING_TYPE_LABELS,
  TRAINING_BASE_PATH,
} from "@/lib/training/constants";
import { METRIC_FIELD_LABELS, fieldsForTracking } from "@/lib/training/tracking";
import {
  addTrainingAlternative,
  removeTrainingAlternative,
  setTrainingExercisePref,
} from "@/lib/actions/training-exercises";
import type { ExerciseAlternative, ExerciseListItem } from "@/lib/training/types";

export function ExerciseDetailSheet({
  open,
  onOpenChange,
  exercise,
  allExercises,
  alternatives,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercise: ExerciseListItem | null;
  allExercises: ExerciseListItem[];
  alternatives: ExerciseAlternative[];
  onChanged: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {exercise ? (
          <DetailBody
            exercise={exercise}
            allExercises={allExercises}
            alternatives={alternatives}
            onChanged={onChanged}
          />
        ) : (
          <SheetHeader>
            <SheetTitle>Carregando…</SheetTitle>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({
  exercise,
  allExercises,
  alternatives,
  onChanged,
}: {
  exercise: ExerciseListItem;
  allExercises: ExerciseListItem[];
  alternatives: ExerciseAlternative[];
  onChanged: () => void;
}) {
  const measurement = fieldsForTracking(exercise.trackingType, exercise.laterality);

  return (
    <>
      <SheetHeader>
        <SheetTitle className="pr-6 text-left text-base">{exercise.displayName}</SheetTitle>
        <SheetDescription className="text-left">
          {exercise.primaryMuscleGroupName}
          {exercise.equipmentName ? ` · ${exercise.equipmentName}` : ""}
        </SheetDescription>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Badge variant={exercise.isSystemExercise ? "secondary" : "default"}>
            {EXERCISE_SOURCE_LABELS[exercise.source]}
          </Badge>
          {exercise.isFavorite && <Badge variant="outline">Favorito</Badge>}
          {exercise.isArchived && <Badge variant="outline">Arquivado</Badge>}
          {!exercise.isEditable && <Badge variant="outline">Somente leitura</Badge>}
        </div>
        {/* 17-D — o histórico completo (melhores marcas, gráficos e todas as séries) tem
            página própria: aqui o painel continua sendo sobre o exercício, não sobre o passado. */}
        <Button variant="outline" size="sm" asChild className="mt-2 w-fit">
          <Link href={`${TRAINING_BASE_PATH}/exercicios/${exercise.id}`}>
            <History className="size-4" />
            Ver histórico e melhores marcas
          </Link>
        </Button>
      </SheetHeader>

      <div className="px-4 pb-8">
        <Tabs defaultValue="detalhes">
          <TabsList className="w-full">
            <TabsTrigger value="detalhes" className="flex-1">
              Detalhes
            </TabsTrigger>
            <TabsTrigger value="alternativas" className="flex-1">
              Alternativas
            </TabsTrigger>
            <TabsTrigger value="personalizar" className="flex-1">
              Personalizar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="detalhes" className="space-y-5 pt-4">
            <section className="rounded-lg border bg-muted/40 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Como é medido
              </p>
              <p className="mt-1 text-sm font-medium">
                {TRACKING_TYPE_LABELS[exercise.trackingType]}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {TRACKING_TYPE_HINTS[exercise.trackingType]}
              </p>
              <p className="mt-2 text-xs">
                Cada série pede:{" "}
                <strong>
                  {measurement.required.map((f) => METRIC_FIELD_LABELS[f]).join(", ") || "—"}
                </strong>
                {measurement.optional.length > 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    · opcional: {measurement.optional.map((f) => METRIC_FIELD_LABELS[f]).join(", ")}
                  </span>
                )}
              </p>
            </section>

            <section className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Músculos
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Badge>{exercise.primaryMuscleGroupName} · principal</Badge>
                {exercise.secondaryMuscles.map((muscle) => (
                  <Badge key={muscle.muscleGroupId} variant="outline">
                    {muscle.muscleGroupName} · {MUSCLE_ROLE_LABELS[muscle.role].toLowerCase()}
                  </Badge>
                ))}
              </div>
            </section>

            <section className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Configuração
              </p>
              <InfoRow label="Padrão de movimento" value={MOVEMENT_PATTERN_LABELS[exercise.movementPattern]} />
              <InfoRow label="Tipo" value={EXERCISE_TYPE_LABELS[exercise.exerciseType]} />
              <InfoRow label="Lateralidade" value={LATERALITY_LABELS[exercise.laterality]} />
              <InfoRow
                label="Descanso padrão"
                value={exercise.restSeconds !== null ? `${exercise.restSeconds}s` : "—"}
              />
              <InfoRow
                label="Incremento de carga"
                value={exercise.incrementKg !== null ? `${exercise.incrementKg} kg` : "—"}
              />
              {exercise.alternativeName && (
                <InfoRow label="Também chamado de" value={exercise.alternativeName} />
              )}
            </section>

            {(exercise.instructions || exercise.tips || exercise.commonMistakes || exercise.notes) && (
              <section className="space-y-3">
                <Separator />
                {exercise.instructions && (
                  <TextBlock title="Execução" text={exercise.instructions} />
                )}
                {exercise.tips && <TextBlock title="Dicas" text={exercise.tips} />}
                {exercise.commonMistakes && (
                  <TextBlock title="Erros comuns" text={exercise.commonMistakes} />
                )}
                {exercise.notes && <TextBlock title="Observações" text={exercise.notes} />}
              </section>
            )}

            {exercise.videoUrl && (
              <a
                href={exercise.videoUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-sm text-primary underline underline-offset-4"
              >
                Abrir vídeo de referência
              </a>
            )}

            {exercise.isSystemExercise && (
              <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                Exercício da base do sistema — conteúdo autoral do projeto, somente leitura. Use
                <strong className="text-foreground"> Duplicar</strong> para criar uma cópia sua e
                editar tudo. A classificação é uma aproximação para organizar treino, não um laudo
                biomecânico.
              </p>
            )}
          </TabsContent>

          <TabsContent value="alternativas" className="space-y-4 pt-4">
            <AlternativesTab
              exercise={exercise}
              allExercises={allExercises}
              alternatives={alternatives}
              onChanged={onChanged}
            />
          </TabsContent>

          <TabsContent value="personalizar" className="space-y-4 pt-4">
            <PersonalizeTab exercise={exercise} onChanged={onChanged} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function TextBlock({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{text}</p>
    </div>
  );
}

function AlternativesTab({
  exercise,
  allExercises,
  alternatives,
  onChanged,
}: {
  exercise: ExerciseListItem;
  allExercises: ExerciseListItem[];
  alternatives: ExerciseAlternative[];
  onChanged: () => void;
}) {
  const mine = alternatives.filter((item) => item.exerciseId === exercise.id);
  const [selected, setSelected] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const alreadyUsed = new Set(mine.map((item) => item.alternativeExerciseId));
  const candidates = allExercises
    .filter((item) => item.id !== exercise.id && !alreadyUsed.has(item.id) && !item.isArchived)
    // Mesmo padrão de movimento primeiro: é o que mais costuma servir de troca.
    .sort((a, b) => {
      const score = (item: ExerciseListItem) =>
        (item.movementPattern === exercise.movementPattern ? 0 : 1) +
        (item.primaryMuscleGroupId === exercise.primaryMuscleGroupId ? 0 : 2);
      return score(a) - score(b) || a.displayName.localeCompare(b.displayName, "pt-BR");
    });

  const chosen = candidates.find((item) => item.id === selected) ?? null;

  async function add() {
    if (!selected) return;
    setBusy(true);
    const result = await addTrainingAlternative({
      exercise_id: exercise.id,
      alternative_exercise_id: selected,
      note,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setSelected("");
    setNote("");
    toast.success("Alternativa cadastrada.");
    onChanged();
  }

  async function remove(id: string) {
    setBusy(true);
    const result = await removeTrainingAlternative(id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Alternativa removida.");
    onChanged();
  }

  return (
    <>
      <p className="text-xs text-muted-foreground">
        Alternativas são a <strong>sua</strong> organização — o que você faz quando o aparelho
        está ocupado. O sistema não afirma que os exercícios são biomecanicamente equivalentes.
      </p>

      {mine.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma alternativa cadastrada.</p>
      ) : (
        <ul className="space-y-2">
          {mine.map((item) => (
            <li key={item.id} className="flex items-start gap-2 rounded-lg border p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.alternativeName}</p>
                {item.note && <p className="text-xs text-muted-foreground">{item.note}</p>}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove(item.id)}
                disabled={busy}
                aria-label={`Remover alternativa ${item.alternativeName}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Adicionar alternativa</Label>
        <ExerciseSearchPicker
          exercises={candidates}
          onSelect={setSelected}
          className="w-full justify-start"
          triggerLabel={chosen ? chosen.displayName : "Escolha um exercício"}
          title="Escolher exercício alternativo"
          description="A ordem sugerida é a sua prioridade — a busca alcança o catálogo inteiro."
        />
        <Input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Motivo (opcional): aparelho costuma estar ocupado"
        />
        <Button onClick={add} disabled={!selected || busy} size="sm">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Adicionar
        </Button>
      </div>
    </>
  );
}

function PersonalizeTab({
  exercise,
  onChanged,
}: {
  exercise: ExerciseListItem;
  onChanged: () => void;
}) {
  const [customName, setCustomName] = React.useState(exercise.customName ?? "");
  const [rest, setRest] = React.useState(
    exercise.restSeconds !== null ? String(exercise.restSeconds) : "",
  );
  const [increment, setIncrement] = React.useState(
    exercise.incrementKg !== null ? String(exercise.incrementKg) : "",
  );
  const [notes, setNotes] = React.useState(exercise.prefNotes ?? "");
  const [saving, setSaving] = React.useState(false);

  // Trocar de exercício com o painel aberto precisa recarregar os campos.
  const [lastId, setLastId] = React.useState(exercise.id);
  if (lastId !== exercise.id) {
    setLastId(exercise.id);
    setCustomName(exercise.customName ?? "");
    setRest(exercise.restSeconds !== null ? String(exercise.restSeconds) : "");
    setIncrement(exercise.incrementKg !== null ? String(exercise.incrementKg) : "");
    setNotes(exercise.prefNotes ?? "");
  }

  async function save() {
    setSaving(true);
    const result = await setTrainingExercisePref({
      exercise_id: exercise.id,
      custom_name: customName,
      custom_rest_seconds: rest,
      custom_increment_kg: increment,
      notes,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Preferência salva.");
    onChanged();
  }

  return (
    <>
      <p className="text-xs text-muted-foreground">
        Estes ajustes são <strong>seus</strong> e ficam separados do exercício. Funcionam
        inclusive nos exercícios da base do sistema, que nunca são alterados.
      </p>

      <div className="space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground">Apelido</Label>
          <Input
            value={customName}
            onChange={(event) => setCustomName(event.target.value)}
            placeholder={exercise.name}
            className="mt-1.5"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs text-muted-foreground">Descanso (segundos)</Label>
            <Input
              value={rest}
              onChange={(event) => setRest(event.target.value)}
              inputMode="numeric"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Incremento (kg)</Label>
            <Input
              value={increment}
              onChange={(event) => setIncrement(event.target.value)}
              inputMode="decimal"
              className="mt-1.5"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Notas pessoais</Label>
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="mt-1.5"
            placeholder="Pegada, altura do banco, número do aparelho…"
          />
        </div>
      </div>

      <Button onClick={save} disabled={saving} size="sm">
        {saving && <Loader2 className="size-4 animate-spin" />}
        Salvar preferências
      </Button>
    </>
  );
}
