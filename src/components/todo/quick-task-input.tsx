"use client";

/**
 * Fase 15 — Módulo TO-DO · Criação rápida de tarefa.
 *
 * O caminho de captura em poucos segundos: digitar o título e dar Enter. Data,
 * prioridade e projeto ficam à mão em seletores compactos, mas nada é obrigatório.
 *
 * ENTRADA EM LINGUAGEM NATURAL (`src/lib/todo/parse.ts`): "Pagar internet amanhã às
 * 10h #casa @contas p1" já sai com data, hora, projeto, etiqueta e prioridade. Três
 * garantias que valem como contrato desta tela:
 *  • o texto digitado NUNCA é reescrito — o campo continua exatamente como foi digitado;
 *  • tudo que foi reconhecido aparece em chips ANTES de salvar, então nada é aplicado
 *    às escondidas;
 *  • dá para desligar a interpretação num clique e salvar o texto literal.
 *
 * Atalhos: **Enter** salva · **Ctrl/Cmd+Enter** salva e mantém o campo aberto para a
 * próxima · **Esc** fecha. (O atalho global "T" abre este campo — ver `todo-client`.)
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarDays,
  Flag,
  FolderOpen,
  Plus,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  TODO_PRIORITIES,
  TODO_PRIORITY_LABELS,
  type TodoPriority,
} from "@/lib/todo/constants";
import {
  hasParsedAnything,
  parseQuickTask,
  recurrenceToPayload,
} from "@/lib/todo/parse";
import { createTodoTask } from "@/lib/actions/todo";
import { createTodoLabel } from "@/lib/actions/todo-projects";
import { PriorityFlag } from "@/components/todo/badges";
import type { TodoLabel, TodoProject } from "@/lib/todo/types";

/** Ícone/cor de cada tipo de trecho reconhecido. */
const TOKEN_STYLE: Record<string, string> = {
  data: "border-primary/30 bg-primary/10 text-primary",
  hora: "border-primary/30 bg-primary/10 text-primary",
  prazo: "border-destructive/30 bg-destructive/10 text-destructive",
  prioridade: "border-border bg-muted text-foreground",
  etiqueta: "border-border bg-muted text-foreground",
  projeto: "border-border bg-muted text-foreground",
  recorrencia: "border-border bg-muted text-foreground",
};

export function QuickTaskInput({
  projects,
  labels,
  todayIso,
  defaultProjectId,
  defaultSectionId,
  defaultDate,
  defaultParentId,
  autoFocus,
  onDone,
  onCancel,
  compact,
  className,
}: {
  projects: TodoProject[];
  labels: TodoLabel[];
  /** "Hoje" vindo do servidor (`hojeISO()`), base de "amanhã", "sexta" etc. */
  todayIso: string;
  defaultProjectId?: string | null;
  defaultSectionId?: string | null;
  /** Pré-preenche a data (usado ao criar direto num dia do calendário). */
  defaultDate?: string | null;
  defaultParentId?: string | null;
  autoFocus?: boolean;
  onDone?: () => void;
  onCancel?: () => void;
  compact?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [title, setTitle] = React.useState("");
  const [date, setDate] = React.useState(defaultDate ?? "");
  const [priority, setPriority] = React.useState<TodoPriority>(4);
  const [projectId, setProjectId] = React.useState(defaultProjectId ?? "");
  const [showOptions, setShowOptions] = React.useState(false);
  const [interpret, setInterpret] = React.useState(true);

  const activeProjects = React.useMemo(
    () => projects.filter((p) => p.status === "ativo"),
    [projects],
  );

  // Função pura: reinterpretar a cada tecla é barato e mantém os chips em dia.
  const parsed = React.useMemo(
    () =>
      parseQuickTask(title, todayIso, {
        projects: activeProjects.map((p) => ({ id: p.id, name: p.name })),
        labels: labels.map((l) => ({ id: l.id, name: l.name })),
      }),
    [title, todayIso, activeProjects, labels],
  );

  const usingParser = interpret && hasParsedAnything(parsed);
  // Só o que o parser reconheceu tem precedência; o resto continua vindo dos seletores.
  const effectiveTitle = usingParser ? parsed.title : title.trim();
  const missingTitle = title.trim().length > 0 && effectiveTitle.length === 0;
  const canSubmit = effectiveTitle.length > 0 && !pending;

  function submit(keepOpen: boolean) {
    if (!canSubmit) return;

    start(async () => {
      // Etiquetas novas escritas com "@" são criadas antes (a action é idempotente
      // pelo nome, então repetir não duplica).
      const labelIds = [...parsed.labelIds];
      if (usingParser) {
        for (const name of parsed.newLabelNames) {
          const created = await createTodoLabel({ name, color: "gold" });
          if (created.ok) labelIds.push(created.data.id);
        }
      }

      const res = await createTodoTask({
        title: effectiveTitle,
        project_id: (usingParser ? parsed.projectId : null) || projectId || null,
        section_id: defaultSectionId ?? null,
        parent_task_id: defaultParentId ?? null,
        scheduled_date: (usingParser ? parsed.scheduledDate : null) || date || null,
        scheduled_time: usingParser ? parsed.scheduledTime : null,
        deadline_at: usingParser ? parsed.deadlineAt : null,
        priority: (usingParser ? parsed.priority : null) ?? priority,
        label_ids: usingParser ? labelIds : [],
        recurrence:
          usingParser && parsed.recurrence ? recurrenceToPayload(parsed.recurrence) : null,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Não foi possível criar a tarefa.");
        return;
      }
      toast.success("Tarefa criada.");
      setTitle("");
      router.refresh();
      if (keepOpen) inputRef.current?.focus();
      else onDone?.();
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      // Ctrl/Cmd+Enter: salva e continua criando.
      submit(e.metaKey || e.ctrlKey);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel?.();
    }
  }

  return (
    <div
      className={cn(
        "space-y-2 rounded-xl border border-border bg-card p-2.5",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <Input
          ref={inputRef}
          autoFocus={autoFocus}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="O que precisa ser feito?"
          aria-label="Título da nova tarefa"
          aria-describedby={hasParsedAnything(parsed) ? "qt-parsed" : undefined}
          className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
        {!compact && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowOptions((v) => !v)}
            aria-expanded={showOptions}
          >
            {showOptions ? "Menos" : "Mais opções"}
          </Button>
        )}
        <Button size="sm" onClick={() => submit(false)} disabled={!canSubmit}>
          {pending ? "Salvando…" : "Adicionar"}
        </Button>
        {onCancel && (
          <Button variant="ghost" size="icon-sm" aria-label="Cancelar" onClick={onCancel}>
            <X />
          </Button>
        )}
      </div>

      {/* Pré-visualização: o que foi entendido, antes de salvar. */}
      {hasParsedAnything(parsed) && (
        <div id="qt-parsed" className="flex flex-wrap items-center gap-1.5 pl-6">
          <Sparkles
            className={cn("size-3.5 shrink-0", interpret ? "text-primary" : "text-muted-foreground")}
            aria-hidden
          />
          {parsed.tokens.map((token) => (
            <span
              key={`${token.kind}-${token.start}`}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem]",
                interpret
                  ? TOKEN_STYLE[token.kind]
                  : "border-border bg-muted text-muted-foreground line-through",
                token.unresolved && interpret && "border-dashed",
              )}
            >
              {token.label}
            </span>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[0.7rem] text-muted-foreground"
            aria-pressed={!interpret}
            onClick={() => setInterpret((v) => !v)}
          >
            {interpret ? "Usar o texto como está" : "Interpretar de novo"}
          </Button>
        </div>
      )}

      {missingTitle && (
        <p className="flex items-center gap-1.5 pl-6 text-[0.7rem] text-destructive">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          Falta o nome da tarefa — o texto só tem data/etiqueta.
        </p>
      )}

      {(showOptions || compact) && (
        <div className="flex flex-wrap items-center gap-2 pl-6">
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="size-3.5" aria-hidden />
            <span className="sr-only">Data programada</span>
            <Input
              type="date"
              value={usingParser && parsed.scheduledDate ? parsed.scheduledDate : date}
              onChange={(e) => setDate(e.target.value)}
              disabled={usingParser && parsed.scheduledDate !== null}
              aria-label="Data programada"
              className="h-7 w-auto text-xs"
            />
          </label>

          <Select
            value={String(usingParser && parsed.priority ? parsed.priority : priority)}
            onValueChange={(v) => setPriority(Number(v) as TodoPriority)}
            disabled={usingParser && parsed.priority !== null}
          >
            <SelectTrigger className="h-7 w-auto gap-1 text-xs" aria-label="Prioridade">
              <Flag className="size-3.5" aria-hidden />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TODO_PRIORITIES.map((p) => (
                <SelectItem key={p} value={String(p)}>
                  <span className="inline-flex items-center gap-1.5">
                    <PriorityFlag priority={p} />
                    {TODO_PRIORITY_LABELS[p]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={(usingParser && parsed.projectId) || projectId || "__inbox__"}
            onValueChange={(v) => setProjectId(v === "__inbox__" ? "" : v)}
            disabled={usingParser && parsed.projectId !== null}
          >
            <SelectTrigger className="h-7 w-auto gap-1 text-xs" aria-label="Projeto">
              <FolderOpen className="size-3.5" aria-hidden />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__inbox__">Caixa de entrada</SelectItem>
              {activeProjects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="text-[0.7rem] text-muted-foreground">
            Enter salva · Ctrl+Enter salva e continua
          </span>
        </div>
      )}
    </div>
  );
}
