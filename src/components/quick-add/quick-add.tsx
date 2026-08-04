"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Apple,
  ArrowLeft,
  ArrowLeftRight,
  CalendarPlus,
  CreditCard,
  Dumbbell,
  GraduationCap,
  ListChecks,
  ListTodo,
  Plus,
  Ruler,
  ShoppingCart,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoneyInput } from "@/components/financeiro/money-input";
import {
  centavosParaReais,
  formatCurrency,
  parseCurrencyToNumber,
  reaisParaCentavos,
  hojeISO,
  saoPauloWallClockToInstant,
} from "@/lib/format";
import { createTransaction } from "@/lib/actions/transactions";
import { createTask } from "@/lib/actions/tasks";
import { createTodoTask } from "@/lib/actions/todo";
import { createEvent } from "@/lib/actions/calendar";
import { createSession } from "@/lib/actions/studies";
import { setHabitValue } from "@/lib/actions/habits";
import { loadQuickAddOptions, type QuickAddOptions } from "@/lib/actions/quick-add";
import {
  loadNutritionQuickAddOptions,
  quickAddDiaryEntry,
  quickAddMealTemplate,
  searchQuickAddFoods,
  type NutritionQuickAddOptions,
  type QuickAddFood,
} from "@/lib/actions/nutrition-quick-add";
import { saveMeasurement } from "@/lib/actions/body-measurements";
import { saveShoppingItem } from "@/lib/actions/nutrition-shopping";
import {
  loadTrainingQuickAddOptions,
  quickStartTraining,
  type TrainingQuickAddOptions,
} from "@/lib/actions/training-quick-add";
import { dividirDespesa, type ParteDivisao } from "@/lib/finance/split";
import {
  CLASSIFICACAO_LABELS,
  CLASSIFICACOES,
  PAYMENT_METHOD_LABELS,
  SPLIT_TYPE_LABELS,
  SPLIT_TYPES,
  type Classificacao,
  type SplitType,
} from "@/lib/finance/constants";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from "@/lib/tasks/constants";
import { TODO_PRIORITIES, TODO_PRIORITY_LABELS } from "@/lib/todo/constants";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/calendar/constants";
import { STUDY_DIFFICULTIES, STUDY_DIFFICULTY_LABELS } from "@/lib/studies/constants";

type Actionish = { ok: boolean; error?: string };
type QuickType =
  | "despesa"
  | "cartao"
  | "receita"
  | "transferencia"
  | "todo"
  | "tarefa"
  | "evento"
  | "habito"
  | "estudo"
  // Fase 16-F — módulo Dieta e Alimentação.
  | "alimento"
  | "refeicao"
  | "medida"
  | "compra"
  // Fase 17-F — módulo Treinos.
  | "treino";

const TYPES: { id: QuickType; label: string; icon: LucideIcon }[] = [
  { id: "despesa", label: "Despesa", icon: TrendingDown },
  { id: "cartao", label: "Gasto no cartão", icon: CreditCard },
  { id: "receita", label: "Receita", icon: TrendingUp },
  { id: "transferencia", label: "Transferência", icon: ArrowLeftRight },
  // TO-DO (Fase 15) é o caminho principal para criar tarefa; "Tarefa (lista)" segue
  // criando na estrutura da Fase 09, que ainda alimenta rotinas e agenda.
  { id: "todo", label: "Nova tarefa", icon: ListTodo },
  { id: "evento", label: "Evento", icon: CalendarPlus },
  { id: "treino", label: "Iniciar treino", icon: Dumbbell },
  { id: "alimento", label: "Registrar alimento", icon: Apple },
  { id: "refeicao", label: "Registrar refeição", icon: UtensilsCrossed },
  // Peso e circunferências são o módulo central `body_*` (16-E): o mesmo registro serve a
  // Dieta e a Treinos — não existem duas telas de peso, existem duas portas para a mesma.
  { id: "medida", label: "Peso e medidas", icon: Ruler },
  { id: "compra", label: "Item na lista", icon: ShoppingCart },
  { id: "habito", label: "Check-in de hábito", icon: Target },
  { id: "estudo", label: "Sessão de estudo", icon: GraduationCap },
  { id: "tarefa", label: "Tarefa (lista antiga)", icon: ListChecks },
];

/** Tipos que dependem das opções do módulo Dieta (carregadas junto do modal). */
const NUTRITION_TYPES: QuickType[] = ["alimento", "refeicao", "medida", "compra"];

// Hoje em Brasília — não a data do fuso do aparelho.
const today = () => hojeISO();

/** Lançamento rápido: triggers no header + modal com seletor de tipo e mini-forms. */
export function QuickAdd() {
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<QuickType | null>(null);
  const [options, setOptions] = React.useState<QuickAddOptions | null>(null);
  const [nutriOptions, setNutriOptions] =
    React.useState<NutritionQuickAddOptions | null>(null);
  const [trainingOptions, setTrainingOptions] =
    React.useState<TrainingQuickAddOptions | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setType(null);
      if (!options) {
        loadQuickAddOptions()
          .then(setOptions)
          .catch(() => setOptions(null));
      }
      if (!nutriOptions) {
        loadNutritionQuickAddOptions()
          .then(setNutriOptions)
          .catch(() => setNutriOptions(null));
      }
      if (!trainingOptions) {
        loadTrainingQuickAddOptions()
          .then(setTrainingOptions)
          .catch(() => setTrainingOptions(null));
      }
    }
  }

  const close = React.useCallback(() => setOpen(false), []);
  const current = TYPES.find((t) => t.id === type);

  return (
    <>
      <Button className="hidden gap-2 sm:inline-flex" onClick={() => handleOpenChange(true)}>
        <Plus className="size-4" />
        Lançar
      </Button>
      <Button
        size="icon"
        className="sm:hidden"
        aria-label="Lançamento rápido"
        onClick={() => handleOpenChange(true)}
      >
        <Plus className="size-5" />
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {type && (
                <button
                  type="button"
                  onClick={() => setType(null)}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Voltar"
                >
                  <ArrowLeft className="size-4" />
                </button>
              )}
              {current ? current.label : "Lançamento rápido"}
            </DialogTitle>
          </DialogHeader>

          {!type ? (
            <div className="grid grid-cols-2 gap-2 pt-1">
              {TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setType(t.id)}
                  className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-center transition-colors hover:border-primary/40 hover:bg-muted"
                >
                  <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                    <t.icon className="size-5" />
                  </span>
                  <span className="text-xs font-medium leading-tight">{t.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <QuickForm
              type={type}
              options={options}
              nutriOptions={nutriOptions}
              trainingOptions={trainingOptions}
              onDone={close}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ───────────────────────────── Mini-forms ───────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function NoData({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function useSubmitter(onDone: () => void) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  function run(promise: Promise<Actionish>, successMsg: string) {
    start(async () => {
      const res = await promise;
      if (res.ok) {
        toast.success(successMsg);
        router.refresh();
        onDone();
      } else {
        toast.error(res.error ?? "Não foi possível salvar.");
      }
    });
  }
  return { pending, run };
}

function SubmitBar({ pending }: { pending: boolean }) {
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Salvando…" : "Salvar"}
    </Button>
  );
}

const CASH_METHODS = ["pix", "debito", "dinheiro", "boleto", "conta_corrente"] as const;

/* ─────────────────── Divisão com terceiros (Fase 05) ─────────────────── */

type PartValue = {
  person_id: string;
  tipo: SplitType;
  valor: string;
  percentual: string;
};

const EMPTY_PART: PartValue = { person_id: "", tipo: "valor", valor: "", percentual: "" };

/**
 * Editor compacto de divisão de despesa para o lançamento rápido (plain state, igual ao
 * `import-split-dialog.tsx`). A autoridade final é o servidor (`createTransaction` → splitSchema).
 */
function SplitFields({
  people,
  amount,
  classificacao,
  parts,
  onClassificacaoChange,
  onPartsChange,
}: {
  people: QuickAddOptions["people"];
  amount: string;
  classificacao: Classificacao;
  parts: PartValue[];
  onClassificacaoChange: (v: Classificacao) => void;
  onPartsChange: (parts: PartValue[]) => void;
}) {
  const isShared = classificacao !== "pessoal";
  const nomePessoa = (id: string) => people.find((p) => p.id === id)?.nome ?? "Pessoa";

  function setClassif(v: Classificacao) {
    onClassificacaoChange(v);
    if (v === "pessoal") onPartsChange([]);
    else if (parts.length === 0) onPartsChange([EMPTY_PART]);
  }

  function updatePart(idx: number, patch: Partial<PartValue>) {
    onPartsChange(parts.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  // Preview reativo (lógica pura, idêntica ao servidor).
  let preview: {
    minhaParteCentavos: number;
    partesTerceiros: { personId: string; valorCentavos: number }[];
  } | null = null;
  let previewError = false;
  if (isShared) {
    const totalCentavos = reaisParaCentavos(parseCurrencyToNumber(amount));
    const partes: ParteDivisao[] = parts
      .filter((p) => p.person_id)
      .map((p) =>
        p.tipo === "valor"
          ? {
              personId: p.person_id,
              tipo: "valor",
              valorCentavos: reaisParaCentavos(parseCurrencyToNumber(p.valor)),
            }
          : {
              personId: p.person_id,
              tipo: "percentual",
              percentual: parseCurrencyToNumber(p.percentual),
            },
      );
    if (totalCentavos > 0 && partes.length > 0) {
      try {
        preview = dividirDespesa(totalCentavos, partes);
      } catch {
        previewError = true;
      }
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/40 p-3">
      <Field label="Classificação">
        <Select value={classificacao} onValueChange={(v) => setClassif(v as Classificacao)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CLASSIFICACOES.map((c) => (
              <SelectItem key={c} value={c}>{CLASSIFICACAO_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {isShared &&
        (people.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma pessoa cadastrada. Cadastre em A Receber → Pessoas.
          </p>
        ) : (
          <div className="space-y-3">
            {parts.map((p, idx) => (
              <div key={idx} className="space-y-2 rounded-lg border border-border/60 p-2">
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Pessoa</Label>
                    <Select value={p.person_id} onValueChange={(v) => updatePart(idx, { person_id: v })}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {people.map((person) => (
                          <SelectItem key={person.id} value={person.id}>{person.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remover pessoa"
                    onClick={() => onPartsChange(parts.filter((_, i) => i !== idx))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo</Label>
                    <Select value={p.tipo} onValueChange={(v) => updatePart(idx, { tipo: v as SplitType })}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SPLIT_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{SPLIT_TYPE_LABELS[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{p.tipo === "valor" ? "Valor" : "%"}</Label>
                    {p.tipo === "valor" ? (
                      <MoneyInput value={p.valor} onValueChange={(v) => updatePart(idx, { valor: v })} />
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        inputMode="decimal"
                        value={p.percentual}
                        onChange={(e) => updatePart(idx, { percentual: e.target.value })}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPartsChange([...parts, EMPTY_PART])}
            >
              <Plus /> Adicionar pessoa
            </Button>

            {previewError && (
              <p className="text-xs text-destructive">
                A divisão não fecha: a soma dos terceiros passou do total ou os percentuais somam mais de 100%.
              </p>
            )}

            {preview && (
              <div className="space-y-1 rounded-lg bg-muted/40 p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Minha parte</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {formatCurrency(centavosParaReais(preview.minhaParteCentavos))}
                  </span>
                </div>
                {preview.partesTerceiros.map((t) => (
                  <div key={t.personId} className="flex items-center justify-between text-muted-foreground">
                    <span className="truncate">{nomePessoa(t.personId)}</span>
                    <span className="tabular-nums">
                      {formatCurrency(centavosParaReais(t.valorCentavos))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
    </div>
  );
}

/** Monta as `parts` a enviar ao servidor (vazio quando pessoal). */
function buildSplitParts(classificacao: Classificacao, parts: PartValue[]) {
  if (classificacao === "pessoal") return [];
  return parts
    .filter((p) => p.person_id)
    .map((p) => ({
      person_id: p.person_id,
      tipo: p.tipo,
      valor: p.tipo === "valor" ? p.valor : "",
      percentual: p.tipo === "percentual" ? p.percentual : "",
    }));
}

function QuickForm({
  type,
  options,
  nutriOptions,
  trainingOptions,
  onDone,
}: {
  type: QuickType;
  options: QuickAddOptions | null;
  nutriOptions: NutritionQuickAddOptions | null;
  trainingOptions: TrainingQuickAddOptions | null;
  onDone: () => void;
}) {
  // Treinos tem leitura própria (17-F) — espera a dele, não a do financeiro.
  if (type === "treino") {
    if (!trainingOptions) {
      return <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>;
    }
    return <TrainingStartForm options={trainingOptions} onDone={onDone} />;
  }

  // Os tipos da Dieta dependem de outra leitura: esperam a própria, não a do financeiro.
  if (NUTRITION_TYPES.includes(type)) {
    if (!nutriOptions) {
      return <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>;
    }
    switch (type) {
      case "alimento":
        return <FoodEntryForm options={nutriOptions} onDone={onDone} />;
      case "refeicao":
        return <MealTemplateForm options={nutriOptions} onDone={onDone} />;
      case "medida":
        return <MeasurementForm options={nutriOptions} onDone={onDone} />;
      case "compra":
        return <ShoppingItemForm options={nutriOptions} onDone={onDone} />;
      default:
        break;
    }
  }

  if (!options) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>;
  }
  switch (type) {
    case "despesa":
      return <ExpenseForm options={options} onDone={onDone} mode="account" />;
    case "cartao":
      return <ExpenseForm options={options} onDone={onDone} mode="card" />;
    case "receita":
      return <IncomeForm options={options} onDone={onDone} />;
    case "transferencia":
      return <TransferForm options={options} onDone={onDone} />;
    case "todo":
      return <TodoTaskForm options={options} onDone={onDone} />;
    case "tarefa":
      return <TaskForm onDone={onDone} />;
    case "evento":
      return <EventForm onDone={onDone} />;
    case "habito":
      return <HabitForm options={options} onDone={onDone} />;
    case "estudo":
      return <StudyForm options={options} onDone={onDone} />;
    default:
      return null;
  }
}

/* ═══════════════════ Fase 17-F — Treinos ═══════════════════ */

/**
 * Iniciar treino em dois toques: escolher o treino → começar.
 *
 * ⛔ A gravação é `quickStartTraining`, que só resolve QUAL treino e delega para
 * `createSession` + `startSession` (17-C). O snapshot congelado, a máquina de estados e a
 * trava de "uma sessão em execução" são exatamente os do fluxo normal — não existe um segundo
 * caminho de criação de sessão.
 */
function TrainingStartForm({
  options,
  onDone,
}: {
  options: TrainingQuickAddOptions;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [workoutId, setWorkoutId] = React.useState(options.workouts[0]?.id ?? "");

  // Já existe treino em andamento: a saída honesta é continuar, não abrir outro.
  if (options.runningSessionId) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          Você já tem um treino em andamento. Dá para continuar de onde parou — o que já foi
          registrado está salvo.
        </p>
        <Button
          className="w-full"
          onClick={() => {
            router.push("/treinos/sessao");
            onDone();
          }}
        >
          Continuar treino
        </Button>
      </div>
    );
  }

  if (options.workouts.length === 0) {
    return <NoData>Monte um treino em Treinos → Treinos para começar por aqui.</NoData>;
  }

  const selected = options.workouts.find((w) => w.id === workoutId);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workoutId) {
      toast.error("Selecione o treino.");
      return;
    }
    start(async () => {
      const res = await quickStartTraining({
        workout_id: workoutId,
        scheduled_workout_id: selected?.scheduledId ?? null,
      });
      if (res.ok) {
        toast.success("Treino iniciado.");
        router.push("/treinos/sessao");
        router.refresh();
        onDone();
      } else {
        toast.error(res.error ?? "Não foi possível iniciar o treino.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Treino">
        <Select value={workoutId} onValueChange={setWorkoutId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {options.workouts.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
                {w.scheduledId ? " · planejado para hoje" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {selected?.plannedTime && (
        <p className="text-[0.7rem] leading-snug text-muted-foreground">
          Planejado para hoje às {selected.plannedTime}.
        </p>
      )}
      <p className="text-[0.7rem] leading-snug text-muted-foreground">
        A sessão abre com os valores do treino e a revisão continua disponível na tela do
        treino. Nada é sugerido como carga máxima.
      </p>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Iniciando…" : "Iniciar treino"}
      </Button>
    </form>
  );
}

/* ═══════════════════ Fase 16-F — Dieta e Alimentação ═══════════════════ */

/**
 * Registrar alimento: buscar → medida → quantidade → refeição → data → salvar.
 *
 * ⛔ A gravação é `quickAddDiaryEntry`, que só resolve a refeição do dia e delega para
 * `addDiaryEntry` (16-B). O SNAPSHOT é montado no servidor, a partir do catálogo, pelo mesmo
 * caminho do registro normal — nenhum nutriente sobe do navegador.
 */
function FoodEntryForm({
  options,
  onDone,
}: {
  options: NutritionQuickAddOptions;
  onDone: () => void;
}) {
  const { pending, run } = useSubmitter(onDone);
  const [term, setTerm] = React.useState("");
  const [results, setResults] = React.useState<QuickAddFood[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [food, setFood] = React.useState<QuickAddFood | null>(null);
  const [measureId, setMeasureId] = React.useState("");
  const [quantity, setQuantity] = React.useState("100");
  const [mealTypeId, setMealTypeId] = React.useState(options.mealTypes[0]?.id ?? "");
  const [date, setDate] = React.useState(today());

  if (options.mealTypes.length === 0) {
    return <NoData>Abra Dieta e Alimentação uma vez para criar os tipos de refeição.</NoData>;
  }

  async function doSearch() {
    if (term.trim().length < 2) {
      toast.error("Digite ao menos 2 letras para buscar.");
      return;
    }
    setSearching(true);
    try {
      setResults(await searchQuickAddFoods(term));
    } catch {
      toast.error("Não foi possível buscar alimentos agora.");
    } finally {
      setSearching(false);
    }
  }

  function choose(item: QuickAddFood) {
    setFood(item);
    setResults([]);
    // Sem medida caseira escolhida, a quantidade é na unidade-base do alimento.
    setMeasureId("");
    setQuantity(String(item.baseQuantity || 100));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!food) {
      toast.error("Escolha um alimento.");
      return;
    }
    run(
      quickAddDiaryEntry({
        date,
        meal_type_id: mealTypeId,
        food_id: food.id,
        quantity,
        measure_id: measureId || null,
      }),
      "Consumo registrado.",
    );
  }

  const unidade = measureId
    ? (food?.measures.find((m) => m.id === measureId)?.label ?? "")
    : (food?.baseUnit ?? "");

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {!food ? (
        <>
          <Field label="Buscar alimento">
            <div className="flex gap-2">
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void doSearch();
                  }
                }}
                placeholder="Ex.: arroz, frango, banana"
                autoFocus
              />
              <Button type="button" variant="outline" onClick={() => void doSearch()}>
                Buscar
              </Button>
            </div>
          </Field>

          {searching && <p className="text-xs text-muted-foreground">Buscando…</p>}

          {results.length > 0 && (
            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => choose(item)}
                    className="w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <span className="block truncate font-medium">{item.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[item.brand, item.isSystemFood ? "Base do sistema" : "Alimento próprio"]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!searching && results.length === 0 && term.trim().length >= 2 && (
            <p className="text-xs text-muted-foreground">
              Nenhum alimento encontrado. Você pode cadastrar em{" "}
              <a href="/nutricao/alimentos" className="underline underline-offset-2">
                Alimentos
              </a>
              .
            </p>
          )}
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2 rounded-lg bg-muted/50 p-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{food.name}</p>
              {food.brand && (
                <p className="truncate text-xs text-muted-foreground">{food.brand}</p>
              )}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setFood(null)}>
              Trocar
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Medida">
              <Select
                value={measureId || "__base__"}
                onValueChange={(v) => setMeasureId(v === "__base__" ? "" : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__base__">Em {food.baseUnit}</SelectItem>
                  {food.measures.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={`Quantidade${unidade ? ` (${unidade})` : ""}`}>
              <Input
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Refeição">
            <Select value={mealTypeId} onValueChange={setMealTypeId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {options.mealTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Data">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>

          <SubmitBar pending={pending} />
        </>
      )}
    </form>
  );
}

/** Registrar uma refeição-modelo inteira (16-C) numa refeição do dia. */
function MealTemplateForm({
  options,
  onDone,
}: {
  options: NutritionQuickAddOptions;
  onDone: () => void;
}) {
  const router = useRouter();
  const [submitting, startSubmit] = React.useTransition();
  const [templateId, setTemplateId] = React.useState("");
  const [mealTypeId, setMealTypeId] = React.useState(options.mealTypes[0]?.id ?? "");
  const [date, setDate] = React.useState(today());

  if (options.mealTemplates.length === 0) {
    return (
      <NoData>
        Nenhuma refeição-modelo criada ainda. Monte uma em Dieta → Refeições-modelo.
      </NoData>
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!templateId) {
      toast.error("Escolha a refeição-modelo.");
      return;
    }
    startSubmit(async () => {
      const res = await quickAddMealTemplate({
        date,
        meal_type_id: mealTypeId,
        template_id: templateId,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Não foi possível registrar.");
        return;
      }
      // A idempotência é de leitura (16-C): adicionar o mesmo modelo 2× não duplica. Quando
      // nada foi registrado por já estar lá, a tela DIZ isso em vez de fingir sucesso.
      if (res.data.registrados === 0 && res.data.jaRegistrado) {
        toast.info("Esta refeição-modelo já estava registrada nesta refeição.");
      } else {
        toast.success(
          `${res.data.registrados} ${res.data.registrados === 1 ? "item registrado" : "itens registrados"}.`,
        );
      }
      if (res.data.falhas.length > 0) {
        toast.warning(
          `${res.data.falhas.length} item(ns) não puderam ser convertidos: ${res.data.falhas.join("; ")}`,
        );
      }
      router.refresh();
      onDone();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Refeição-modelo">
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {options.mealTemplates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Refeição do dia">
        <Select value={mealTypeId} onValueChange={setMealTypeId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {options.mealTypes.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Data">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <SubmitBar pending={submitting} />
    </form>
  );
}

/**
 * Adicionar uma medida corporal. Chama `saveMeasurement` (16-E) direto — o módulo `body_*` é
 * central e compartilhado com Treinos; não existe um segundo caminho de gravação.
 */
function MeasurementForm({
  options,
  onDone,
}: {
  options: NutritionQuickAddOptions;
  onDone: () => void;
}) {
  const { pending, run } = useSubmitter(onDone);
  const [typeId, setTypeId] = React.useState(options.measurementTypes[0]?.id ?? "");
  const [value, setValue] = React.useState("");
  const [date, setDate] = React.useState(today());

  if (options.measurementTypes.length === 0) {
    // As medidas são o módulo central `body_*` (16-E): abrir qualquer uma das duas telas cria
    // os tipos padrão, e o registro aparece nos dois módulos.
    return (
      <NoData>
        Abra Dieta → Medidas ou Treinos → Evolução uma vez para criar os tipos de medida.
      </NoData>
    );
  }

  const selected = options.measurementTypes.find((t) => t.id === typeId);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) {
      toast.error("Informe o valor medido.");
      return;
    }
    run(
      saveMeasurement({
        typeId,
        measuredOn: date,
        measuredAt: null,
        value,
        condition: null,
        note: null,
      }),
      "Medida registrada.",
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Medida">
        <Select value={typeId} onValueChange={setTypeId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {options.measurementTypes.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label={`Valor${selected ? ` (${selected.unit})` : ""}`}>
        <Input
          type="number"
          inputMode="decimal"
          step="any"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
      </Field>
      <Field label="Data">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <p className="text-[0.7rem] leading-snug text-muted-foreground">
        Medida é registro, não avaliação — o sistema não sugere valor ideal nem classifica o
        resultado.
      </p>
      <SubmitBar pending={pending} />
    </form>
  );
}

/** Adicionar um item digitado à mão numa lista de compras ativa (16-D). */
function ShoppingItemForm({
  options,
  onDone,
}: {
  options: NutritionQuickAddOptions;
  onDone: () => void;
}) {
  const { pending, run } = useSubmitter(onDone);
  const [listId, setListId] = React.useState(options.shoppingLists[0]?.id ?? "");
  const [label, setLabel] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [unit, setUnit] = React.useState("un");

  if (options.shoppingLists.length === 0) {
    return <NoData>Nenhuma lista de compras ativa. Crie uma em Dieta → Compras.</NoData>;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) {
      toast.error("Escreva o que precisa comprar.");
      return;
    }
    run(
      // Item digitado à mão: `is_manual` é decidido no servidor, e a regeração do
      // planejamento nunca o toca (invariante 18 do módulo).
      saveShoppingItem({
        list_id: listId,
        label,
        // Quantidade em branco continua NULA ("a gosto"), nunca zero.
        quantity: quantity.trim() === "" ? null : quantity,
        unit,
      }),
      "Item adicionado à lista.",
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Lista">
        <Select value={listId} onValueChange={setListId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {options.shoppingLists.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="O que comprar">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ex.: Papel toalha"
          autoFocus
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Quantidade (opcional)">
          <Input
            type="number"
            inputMode="decimal"
            step="any"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="a gosto"
          />
        </Field>
        <Field label="Unidade">
          <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="un" />
        </Field>
      </div>
      <SubmitBar pending={pending} />
    </form>
  );
}

function ExpenseForm({
  options,
  onDone,
  mode,
}: {
  options: QuickAddOptions;
  onDone: () => void;
  mode: "account" | "card";
}) {
  const { pending, run } = useSubmitter(onDone);
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [cardId, setCardId] = React.useState("");
  const [method, setMethod] = React.useState<string>("pix");
  const [categoryId, setCategoryId] = React.useState("");
  const [date, setDate] = React.useState(today());
  const [classificacao, setClassificacao] = React.useState<Classificacao>("pessoal");
  const [parts, setParts] = React.useState<PartValue[]>([]);

  if (mode === "account" && options.accounts.length === 0)
    return <NoData>Cadastre uma conta no Financeiro para lançar despesas à vista.</NoData>;
  if (mode === "card" && options.cards.length === 0)
    return <NoData>Cadastre um cartão para lançar gastos no cartão.</NoData>;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    run(
      createTransaction({
        type: "despesa",
        payment_method: mode === "card" ? "cartao_credito" : method,
        account_id: mode === "account" ? accountId : null,
        card_id: mode === "card" ? cardId : null,
        category_id: categoryId || null,
        amount,
        purchase_date: date,
        competence_date: date,
        description,
        classificacao,
        parts: buildSplitParts(classificacao, parts),
      }),
      "Despesa lançada.",
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Descrição">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Mercado" />
      </Field>
      <Field label="Valor">
        <MoneyInput value={amount} onValueChange={setAmount} />
      </Field>
      {mode === "account" ? (
        <>
          <Field label="Conta">
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {options.accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Forma de pagamento">
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CASH_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </>
      ) : (
        <Field label="Cartão">
          <Select value={cardId} onValueChange={setCardId}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {options.cards.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <Field label="Categoria (opcional)">
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
          <SelectContent>
            {options.categories
              .filter((c) => c.kind !== "receita")
              .map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Data">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <SplitFields
        people={options.people}
        amount={amount}
        classificacao={classificacao}
        parts={parts}
        onClassificacaoChange={setClassificacao}
        onPartsChange={setParts}
      />
      <SubmitBar pending={pending} />
    </form>
  );
}

function IncomeForm({ options, onDone }: { options: QuickAddOptions; onDone: () => void }) {
  const { pending, run } = useSubmitter(onDone);
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [date, setDate] = React.useState(today());

  if (options.accounts.length === 0)
    return <NoData>Cadastre uma conta no Financeiro para lançar receitas.</NoData>;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    run(
      createTransaction({
        type: "receita",
        payment_method: null,
        account_id: accountId,
        category_id: categoryId || null,
        amount,
        purchase_date: date,
        competence_date: date,
        description,
        status: "recebido",
      }),
      "Receita lançada.",
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Descrição">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Salário" />
      </Field>
      <Field label="Valor">
        <MoneyInput value={amount} onValueChange={setAmount} />
      </Field>
      <Field label="Conta">
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {options.accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Categoria (opcional)">
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
          <SelectContent>
            {options.categories
              .filter((c) => c.kind !== "despesa")
              .map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Data">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <SubmitBar pending={pending} />
    </form>
  );
}

function TransferForm({ options, onDone }: { options: QuickAddOptions; onDone: () => void }) {
  const { pending, run } = useSubmitter(onDone);
  const [amount, setAmount] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [date, setDate] = React.useState(today());
  const [description, setDescription] = React.useState("");

  if (options.accounts.length < 2)
    return <NoData>Você precisa de pelo menos duas contas para transferir.</NoData>;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (from && to && from === to) {
      toast.error("Escolha contas de origem e destino diferentes.");
      return;
    }
    run(
      createTransaction({
        type: "transferencia",
        payment_method: "transferencia",
        account_id: from,
        transfer_account_id: to,
        amount,
        purchase_date: date,
        competence_date: date,
        description,
      }),
      "Transferência registrada.",
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Valor">
        <MoneyInput value={amount} onValueChange={setAmount} />
      </Field>
      <Field label="De (origem)">
        <Select value={from} onValueChange={setFrom}>
          <SelectTrigger><SelectValue placeholder="Conta de origem" /></SelectTrigger>
          <SelectContent>
            {options.accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Para (destino)">
        <Select value={to} onValueChange={setTo}>
          <SelectTrigger><SelectValue placeholder="Conta de destino" /></SelectTrigger>
          <SelectContent>
            {options.accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Descrição (opcional)">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Reserva" />
      </Field>
      <Field label="Data">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <SubmitBar pending={pending} />
    </form>
  );
}

/**
 * Nova tarefa no módulo TO-DO (Fase 15). Campos rápidos: título, projeto, data,
 * horário, prioridade e repetição básica — o resto se preenche abrindo a tarefa.
 */
function TodoTaskForm({
  options,
  onDone,
}: {
  options: QuickAddOptions;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [title, setTitle] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [date, setDate] = React.useState("");
  const [time, setTime] = React.useState("");
  const [priority, setPriority] = React.useState("4");
  const [repeat, setRepeat] = React.useState("nao");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Informe um título.");
      return;
    }
    // A repetição rápida cobre os casos comuns; a personalizada fica no painel da tarefa.
    const recurrence =
      repeat === "nao"
        ? null
        : {
            frequency: repeat === "uteis" ? "diaria" : repeat,
            interval_count: 1,
            business_day_rule: repeat === "uteis" ? "apenas_dias_uteis" : null,
            recurrence_mode: "fixo",
          };

    start(async () => {
      const res = await createTodoTask({
        title,
        project_id: projectId || null,
        scheduled_date: date || null,
        scheduled_time: time || null,
        priority,
        recurrence,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Não foi possível criar a tarefa.");
        return;
      }
      toast.success("Tarefa criada.", {
        action: {
          label: "Abrir",
          onClick: () => router.push(`/todo?v=todas&task=${res.data.id}`),
        },
      });
      router.refresh();
      onDone();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Título">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="O que precisa ser feito?"
        />
      </Field>
      <Field label="Projeto">
        <Select
          value={projectId || "__inbox__"}
          onValueChange={(v) => setProjectId(v === "__inbox__" ? "" : v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__inbox__">Caixa de entrada</SelectItem>
            {options.todoProjects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Data (opcional)">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Horário (opcional)">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Prioridade">
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TODO_PRIORITIES.map((p) => (
                <SelectItem key={p} value={String(p)}>
                  {TODO_PRIORITY_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Repetir">
          <Select value={repeat} onValueChange={setRepeat}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nao">Não repetir</SelectItem>
              <SelectItem value="diaria">Todos os dias</SelectItem>
              <SelectItem value="uteis">Dias úteis</SelectItem>
              <SelectItem value="semanal">Toda semana</SelectItem>
              <SelectItem value="mensal">Todo mês</SelectItem>
              <SelectItem value="anual">Todo ano</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      {repeat !== "nao" && !date && (
        <p className="text-xs text-muted-foreground">
          Defina uma data para a repetição valer.
        </p>
      )}
      <SubmitBar pending={pending} />
    </form>
  );
}

function TaskForm({ onDone }: { onDone: () => void }) {
  const { pending, run } = useSubmitter(onDone);
  const [title, setTitle] = React.useState("");
  const [priority, setPriority] = React.useState<string>("media");
  const [due, setDue] = React.useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    run(createTask({ title, priority, due_date: due || null }), "Tarefa criada.");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Título">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="O que precisa ser feito?" />
      </Field>
      <Field label="Prioridade">
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {TASK_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Vencimento (opcional)">
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </Field>
      <SubmitBar pending={pending} />
    </form>
  );
}

function EventForm({ onDone }: { onDone: () => void }) {
  const { pending, run } = useSubmitter(onDone);
  const [title, setTitle] = React.useState("");
  const [tipo, setTipo] = React.useState<string>("pessoal");
  const [date, setDate] = React.useState(today());
  const [start, setStart] = React.useState("09:00");
  const [end, setEnd] = React.useState("10:00");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Horários digitados são hora de parede de Brasília (ver saoPauloWallClockToInstant).
    const startAt = saoPauloWallClockToInstant(date, start);
    const endAt = saoPauloWallClockToInstant(date, end);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      toast.error("Informe data e horários válidos.");
      return;
    }
    run(
      createEvent({
        title,
        tipo,
        all_day: false,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
      }),
      "Evento criado.",
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Título">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Reunião" />
      </Field>
      <Field label="Tipo">
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {EVENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{EVENT_TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Data">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Início">
          <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Fim">
          <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <SubmitBar pending={pending} />
    </form>
  );
}

function HabitForm({ options, onDone }: { options: QuickAddOptions; onDone: () => void }) {
  const { pending, run } = useSubmitter(onDone);
  const [habitId, setHabitId] = React.useState("");
  const selected = options.habits.find((h) => h.id === habitId);
  const [value, setValue] = React.useState("");

  if (options.habits.length === 0)
    return <NoData>Cadastre um hábito para fazer check-in rápido.</NoData>;

  // Estado derivado: ao trocar de hábito, sugere a meta como valor (ajuste em render).
  const suggested = selected ? String(selected.target) : "";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!habitId) {
      toast.error("Selecione um hábito.");
      return;
    }
    const v = Number(value || suggested);
    run(setHabitValue(habitId, today(), Number.isFinite(v) ? v : 0), "Check-in registrado.");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Hábito">
        <Select
          value={habitId}
          onValueChange={(v) => {
            setHabitId(v);
            const h = options.habits.find((x) => x.id === v);
            setValue(h ? String(h.target) : "");
          }}
        >
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {options.habits.map((h) => (
              <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {selected && (
        <Field label={`Valor de hoje (${selected.unit})`}>
          <Input
            type="number"
            inputMode="decimal"
            step="any"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
      )}
      <SubmitBar pending={pending} />
    </form>
  );
}

function StudyForm({ options, onDone }: { options: QuickAddOptions; onDone: () => void }) {
  const { pending, run } = useSubmitter(onDone);
  const [courseId, setCourseId] = React.useState("");
  const [duration, setDuration] = React.useState("30");
  const [difficulty, setDifficulty] = React.useState<string>("media");
  const [date, setDate] = React.useState(today());

  if (options.courses.length === 0)
    return <NoData>Cadastre um curso em Estudos para registrar sessões.</NoData>;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId) {
      toast.error("Selecione um curso.");
      return;
    }
    run(
      createSession({
        course_id: courseId,
        session_date: date,
        duration_minutes: duration,
        difficulty,
      }),
      "Sessão registrada.",
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Curso">
        <Select value={courseId} onValueChange={setCourseId}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {options.courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Duração (minutos)">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
        />
      </Field>
      <Field label="Dificuldade">
        <Select value={difficulty} onValueChange={setDifficulty}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {STUDY_DIFFICULTIES.map((d) => (
              <SelectItem key={d} value={d}>{STUDY_DIFFICULTY_LABELS[d]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Data">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <SubmitBar pending={pending} />
    </form>
  );
}
