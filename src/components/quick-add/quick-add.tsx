"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowLeftRight,
  CalendarPlus,
  CreditCard,
  GraduationCap,
  ListChecks,
  Plus,
  Target,
  TrendingDown,
  TrendingUp,
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
import { toDateInputValue } from "@/lib/format";
import { createTransaction } from "@/lib/actions/transactions";
import { createTask } from "@/lib/actions/tasks";
import { createEvent } from "@/lib/actions/calendar";
import { createSession } from "@/lib/actions/studies";
import { setHabitValue } from "@/lib/actions/habits";
import { loadQuickAddOptions, type QuickAddOptions } from "@/lib/actions/quick-add";
import { PAYMENT_METHOD_LABELS } from "@/lib/finance/constants";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from "@/lib/tasks/constants";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/calendar/constants";
import { STUDY_DIFFICULTIES, STUDY_DIFFICULTY_LABELS } from "@/lib/studies/constants";

type Actionish = { ok: boolean; error?: string };
type QuickType =
  | "despesa"
  | "cartao"
  | "receita"
  | "transferencia"
  | "tarefa"
  | "evento"
  | "habito"
  | "estudo";

const TYPES: { id: QuickType; label: string; icon: LucideIcon }[] = [
  { id: "despesa", label: "Despesa", icon: TrendingDown },
  { id: "cartao", label: "Gasto no cartão", icon: CreditCard },
  { id: "receita", label: "Receita", icon: TrendingUp },
  { id: "transferencia", label: "Transferência", icon: ArrowLeftRight },
  { id: "tarefa", label: "Tarefa", icon: ListChecks },
  { id: "evento", label: "Evento", icon: CalendarPlus },
  { id: "habito", label: "Check-in de hábito", icon: Target },
  { id: "estudo", label: "Sessão de estudo", icon: GraduationCap },
];

const today = () => toDateInputValue(new Date());

/** Lançamento rápido: triggers no header + modal com seletor de tipo e mini-forms. */
export function QuickAdd() {
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<QuickType | null>(null);
  const [options, setOptions] = React.useState<QuickAddOptions | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setType(null);
      if (!options) {
        loadQuickAddOptions()
          .then(setOptions)
          .catch(() => setOptions(null));
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
            <QuickForm type={type} options={options} onDone={close} />
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

function QuickForm({
  type,
  options,
  onDone,
}: {
  type: QuickType;
  options: QuickAddOptions | null;
  onDone: () => void;
}) {
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
    case "tarefa":
      return <TaskForm onDone={onDone} />;
    case "evento":
      return <EventForm onDone={onDone} />;
    case "habito":
      return <HabitForm options={options} onDone={onDone} />;
    case "estudo":
      return <StudyForm options={options} onDone={onDone} />;
  }
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
    const startAt = new Date(`${date}T${start}`);
    const endAt = new Date(`${date}T${end}`);
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
