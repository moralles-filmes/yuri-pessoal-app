"use client";

/**
 * Fase 15 — Módulo TO-DO · Indicadores visuais (prioridade, status, etiqueta, data).
 *
 * ACESSIBILIDADE: nenhum indicador depende SÓ da cor. Prioridade sempre mostra o
 * rótulo "P1..P4"; status sempre mostra o texto; datas atrasadas ganham ícone além do
 * vermelho. Todos legíveis em dark e light.
 */
import * as React from "react";
import { AlarmClock, CalendarClock, Flag, Repeat, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TODO_COLOR_CHIP,
  TODO_COLOR_DOT,
  TODO_PRIORITY_BADGE,
  TODO_PRIORITY_FLAG,
  TODO_PRIORITY_LABELS,
  TODO_PRIORITY_SHORT,
  TODO_STATUS_BADGE,
  TODO_EFFECTIVE_STATUS_LABELS,
  type TodoColor,
  type TodoEffectiveStatus,
  type TodoPriority,
} from "@/lib/todo/constants";
import { describeRule, type TodoRecurrenceRule } from "@/lib/todo/recurrence";
import { daysBetween } from "@/lib/todo/status";
import { formatDate } from "@/lib/format";
import type { TodoLabelRef } from "@/lib/todo/types";

const chipBase =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-medium leading-none";

/** Badge de prioridade. O texto "P1".."P4" acompanha sempre a cor. */
export function PriorityBadge({
  priority,
  compact = false,
  className,
}: {
  priority: TodoPriority;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(chipBase, TODO_PRIORITY_BADGE[priority], className)}
      title={TODO_PRIORITY_LABELS[priority]}
    >
      <Flag className="size-3" aria-hidden />
      {compact ? TODO_PRIORITY_SHORT[priority] : TODO_PRIORITY_LABELS[priority]}
    </span>
  );
}

/** Bandeira só-ícone para o botão de troca rápida de prioridade (tem aria-label próprio). */
export function PriorityFlag({
  priority,
  className,
}: {
  priority: TodoPriority;
  className?: string;
}) {
  return <Flag className={cn("size-4", TODO_PRIORITY_FLAG[priority], className)} aria-hidden />;
}

export function StatusBadge({
  status,
  className,
}: {
  status: TodoEffectiveStatus;
  className?: string;
}) {
  return (
    <span className={cn(chipBase, TODO_STATUS_BADGE[status], className)}>
      {status === "atrasada" && <TriangleAlert className="size-3" aria-hidden />}
      {TODO_EFFECTIVE_STATUS_LABELS[status]}
    </span>
  );
}

export function LabelChip({
  label,
  onRemove,
  className,
}: {
  label: TodoLabelRef;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span className={cn(chipBase, TODO_COLOR_CHIP[label.color], className)}>
      <span className="opacity-60">@</span>
      {label.name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover etiqueta ${label.name}`}
          className="ml-0.5 rounded-full opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          ×
        </button>
      )}
    </span>
  );
}

/** Bolinha de cor de projeto/etiqueta. Decorativa — sempre acompanhada do nome. */
export function ColorDot({ color, className }: { color: TodoColor; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full", TODO_COLOR_DOT[color], className)}
    />
  );
}

/**
 * Data programada, com linguagem natural em pt-BR ("Hoje", "Amanhã", "Atrasada 3 dias").
 * `todayIso` vem do servidor (fuso America/Sao_Paulo) — nunca calculado no cliente.
 */
export function ScheduleChip({
  dateIso,
  time,
  todayIso,
  overdue,
  className,
}: {
  dateIso: string | null;
  time?: string | null;
  todayIso: string;
  overdue?: boolean;
  className?: string;
}) {
  if (!dateIso) return null;
  const diff = daysBetween(todayIso, dateIso);

  let text: string;
  if (diff === 0) text = "Hoje";
  else if (diff === 1) text = "Amanhã";
  else if (diff === -1) text = "Ontem";
  else if (diff < -1) text = `${Math.abs(diff)} dias atrás`;
  else if (diff <= 7) text = `Em ${diff} dias`;
  else text = formatDate(dateIso);

  return (
    <span
      className={cn(
        chipBase,
        overdue
          ? "bg-destructive/15 text-destructive"
          : diff === 0
            ? "bg-primary/15 text-primary"
            : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {overdue ? (
        <TriangleAlert className="size-3" aria-hidden />
      ) : (
        <CalendarClock className="size-3" aria-hidden />
      )}
      {text}
      {time && <span className="tabular-nums">· {time}</span>}
    </span>
  );
}

/** Prazo final — visualmente distinto da data programada (são coisas diferentes). */
export function DeadlineChip({
  deadlineIso,
  todayIso,
  className,
}: {
  deadlineIso: string | null;
  todayIso: string;
  className?: string;
}) {
  if (!deadlineIso) return null;
  const diff = daysBetween(todayIso, deadlineIso);
  const vencido = diff < 0;
  const proximo = diff >= 0 && diff <= 3;

  return (
    <span
      className={cn(
        chipBase,
        vencido
          ? "bg-destructive/15 text-destructive"
          : proximo
            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
            : "bg-muted text-muted-foreground",
        className,
      )}
      title={`Prazo final: ${formatDate(deadlineIso)}`}
    >
      <AlarmClock className="size-3" aria-hidden />
      Prazo {vencido ? "vencido" : formatDate(deadlineIso)}
    </span>
  );
}

/** Indicador de recorrência, com a regra descrita por extenso no title. */
export function RecurrenceChip({
  rule,
  className,
}: {
  rule: TodoRecurrenceRule | null;
  className?: string;
}) {
  if (!rule) return null;
  const description = describeRule(rule);
  return (
    <span
      className={cn(chipBase, "bg-muted text-muted-foreground", className)}
      title={description}
    >
      <Repeat className="size-3" aria-hidden />
      <span className="max-w-[12rem] truncate">{description}</span>
    </span>
  );
}
