"use client";

/**
 * Fase 15 — Módulo TO-DO · Editor de recorrência.
 *
 * Dois níveis: predefinições de um clique (o caso comum) e um painel "Personalizada"
 * com o modelo completo. O usuário SEMPRE vê, em texto, a regra montada e as próximas
 * datas — nada de recorrência que só existe como ícone.
 *
 * O componente é controlado e trabalha no shape do formulário (snake_case), que é
 * exatamente o que `todoRecurrenceSchema` valida no servidor.
 */
import * as React from "react";
import { Repeat, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  TODO_FREQUENCIES,
  TODO_FREQUENCY_LABELS,
  TODO_RECURRENCE_MODE_LABELS,
  TODO_RECURRENCE_MODES,
  WEEKDAYS,
  WEEKDAY_SHORT,
} from "@/lib/todo/constants";
import { describeRule, previewOccurrences, normalizeRule } from "@/lib/todo/recurrence";
import { formatDate } from "@/lib/format";

/** Shape do formulário (igual ao que o Zod do servidor espera). */
export interface RecurrenceFormValue {
  frequency: "diaria" | "semanal" | "mensal" | "anual";
  interval_count: number;
  days_of_week: number[] | null;
  day_of_month: number | null;
  month_of_year: number | null;
  week_of_month: number | null;
  business_day_rule: "primeiro_dia_util" | "ultimo_dia_util" | "apenas_dias_uteis" | null;
  recurrence_mode: "fixo" | "apos_conclusao";
  starts_on: string | null;
  ends_on: string | null;
  max_occurrences: number | null;
  is_paused: boolean;
}

const EMPTY: RecurrenceFormValue = {
  frequency: "diaria",
  interval_count: 1,
  days_of_week: null,
  day_of_month: null,
  month_of_year: null,
  week_of_month: null,
  business_day_rule: null,
  recurrence_mode: "fixo",
  starts_on: null,
  ends_on: null,
  max_occurrences: null,
  is_paused: false,
};

/** Predefinições de um clique — cobrem a esmagadora maioria dos casos reais. */
const PRESETS: { id: string; label: string; value: RecurrenceFormValue }[] = [
  { id: "diario", label: "Todos os dias", value: { ...EMPTY } },
  {
    id: "uteis",
    label: "Todos os dias úteis",
    value: { ...EMPTY, business_day_rule: "apenas_dias_uteis" },
  },
  { id: "semanal", label: "Toda semana", value: { ...EMPTY, frequency: "semanal" } },
  { id: "mensal", label: "Todo mês", value: { ...EMPTY, frequency: "mensal" } },
  { id: "anual", label: "Todo ano", value: { ...EMPTY, frequency: "anual" } },
  {
    id: "ultimo_dia",
    label: "Último dia do mês",
    value: { ...EMPTY, frequency: "mensal", day_of_month: -1 },
  },
  {
    id: "primeiro_util",
    label: "1º dia útil do mês",
    value: { ...EMPTY, frequency: "mensal", business_day_rule: "primeiro_dia_util" },
  },
  {
    id: "ultimo_util",
    label: "Último dia útil do mês",
    value: { ...EMPTY, frequency: "mensal", business_day_rule: "ultimo_dia_util" },
  },
];

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const WEEK_ORDINALS: { value: number; label: string }[] = [
  { value: 1, label: "Primeira" },
  { value: 2, label: "Segunda" },
  { value: 3, label: "Terceira" },
  { value: 4, label: "Quarta" },
  { value: -1, label: "Última" },
];

export function RecurrenceEditor({
  value,
  onChange,
  anchorDate,
  className,
}: {
  value: RecurrenceFormValue | null;
  onChange: (next: RecurrenceFormValue | null) => void;
  /** Data programada da tarefa — âncora da pré-visualização ('yyyy-MM-dd'). */
  anchorDate: string | null;
  className?: string;
}) {
  const [custom, setCustom] = React.useState(false);
  const enabled = value !== null;

  const patch = (changes: Partial<RecurrenceFormValue>) => {
    onChange({ ...(value ?? EMPTY), ...changes });
  };

  // Descrição e próximas datas derivadas da regra normalizada (mesma função do servidor).
  const rule = value
    ? normalizeRule({
        frequency: value.frequency,
        intervalCount: value.interval_count,
        daysOfWeek: value.days_of_week,
        dayOfMonth: value.day_of_month,
        monthOfYear: value.month_of_year,
        weekOfMonth: value.week_of_month,
        businessDayRule: value.business_day_rule,
        mode: value.recurrence_mode,
        startsOn: value.starts_on,
        endsOn: value.ends_on,
        maxOccurrences: value.max_occurrences,
        occurrencesCreated: 0,
        isPaused: value.is_paused,
      })
    : null;

  const preview = rule && anchorDate ? previewOccurrences(rule, anchorDate, 3) : [];

  if (!enabled) {
    return (
      <div className={className}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onChange({ ...EMPTY });
            setCustom(false);
          }}
        >
          <Repeat /> Repetir tarefa
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3 rounded-xl border border-border bg-card/40 p-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Repetição</p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Remover repetição"
          onClick={() => onChange(null)}
        >
          <X />
        </Button>
      </div>

      {/* Predefinições */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => {
          const active =
            !custom &&
            value.frequency === preset.value.frequency &&
            value.interval_count === preset.value.interval_count &&
            value.day_of_month === preset.value.day_of_month &&
            value.business_day_rule === preset.value.business_day_rule &&
            !value.days_of_week &&
            !value.week_of_month;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                onChange({
                  ...preset.value,
                  // Preserva o que o usuário já configurou de encerramento/modo.
                  recurrence_mode: value.recurrence_mode,
                  ends_on: value.ends_on,
                  max_occurrences: value.max_occurrences,
                  starts_on: value.starts_on,
                  is_paused: value.is_paused,
                });
                setCustom(false);
              }}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                active
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {preset.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={custom}
          onClick={() => setCustom((v) => !v)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs transition-colors",
            custom
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          Personalizada
        </button>
      </div>

      {custom && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Frequência</Label>
              <Select
                value={value.frequency}
                onValueChange={(v) =>
                  patch({
                    frequency: v as RecurrenceFormValue["frequency"],
                    // Padrões de outro tipo de frequência deixam de fazer sentido.
                    days_of_week: null,
                    day_of_month: null,
                    week_of_month: null,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TODO_FREQUENCIES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {TODO_FREQUENCY_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="rec-interval">
                A cada
              </Label>
              <Input
                id="rec-interval"
                type="number"
                min={1}
                max={999}
                inputMode="numeric"
                value={value.interval_count}
                onChange={(e) =>
                  patch({ interval_count: Math.max(1, Number(e.target.value) || 1) })
                }
              />
            </div>
          </div>

          {value.frequency === "semanal" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Dias da semana</Label>
              <div className="flex flex-wrap gap-1">
                {WEEKDAYS.map((day) => {
                  const active = (value.days_of_week ?? []).includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={active}
                      aria-label={WEEKDAY_SHORT[day]}
                      onClick={() => {
                        const current = new Set(value.days_of_week ?? []);
                        if (current.has(day)) current.delete(day);
                        else current.add(day);
                        const next = [...current].sort((a, b) => a - b);
                        patch({ days_of_week: next.length ? next : null });
                      }}
                      className={cn(
                        "h-8 w-10 rounded-lg border text-xs transition-colors",
                        active
                          ? "border-primary/40 bg-primary/15 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {WEEKDAY_SHORT[day]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {value.frequency === "mensal" && (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">Padrão do mês</Label>
                <Select
                  value={
                    value.week_of_month != null
                      ? "semana"
                      : value.day_of_month === -1
                        ? "ultimo"
                        : value.day_of_month != null
                          ? "dia"
                          : "mesmo"
                  }
                  onValueChange={(v) => {
                    if (v === "semana") patch({ week_of_month: 1, days_of_week: [1], day_of_month: null });
                    else if (v === "ultimo") patch({ day_of_month: -1, week_of_month: null, days_of_week: null });
                    else if (v === "dia") patch({ day_of_month: 1, week_of_month: null, days_of_week: null });
                    else patch({ day_of_month: null, week_of_month: null, days_of_week: null });
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mesmo">No mesmo dia da tarefa</SelectItem>
                    <SelectItem value="dia">Num dia específico do mês</SelectItem>
                    <SelectItem value="ultimo">No último dia do mês</SelectItem>
                    <SelectItem value="semana">Numa semana específica (ex.: 1ª segunda)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {value.day_of_month != null && value.day_of_month > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="rec-dom">
                    Dia do mês
                  </Label>
                  <Input
                    id="rec-dom"
                    type="number"
                    min={1}
                    max={31}
                    inputMode="numeric"
                    value={value.day_of_month}
                    onChange={(e) =>
                      patch({
                        day_of_month: Math.min(31, Math.max(1, Number(e.target.value) || 1)),
                      })
                    }
                  />
                  <p className="text-[0.7rem] text-muted-foreground">
                    Em meses mais curtos, cai no último dia disponível.
                  </p>
                </div>
              )}

              {value.week_of_month != null && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Semana</Label>
                    <Select
                      value={String(value.week_of_month)}
                      onValueChange={(v) => patch({ week_of_month: Number(v) })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEK_ORDINALS.map((o) => (
                          <SelectItem key={o.value} value={String(o.value)}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Dia da semana</Label>
                    <Select
                      value={String((value.days_of_week ?? [1])[0])}
                      onValueChange={(v) => patch({ days_of_week: [Number(v)] })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEKDAYS.map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {WEEKDAY_SHORT[d]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}

          {value.frequency === "anual" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Mês</Label>
                <Select
                  value={String(value.month_of_year ?? 1)}
                  onValueChange={(v) => patch({ month_of_year: Number(v) })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="rec-yearday">
                  Dia
                </Label>
                <Input
                  id="rec-yearday"
                  type="number"
                  min={1}
                  max={31}
                  inputMode="numeric"
                  value={value.day_of_month ?? 1}
                  onChange={(e) =>
                    patch({
                      day_of_month: Math.min(31, Math.max(1, Number(e.target.value) || 1)),
                    })
                  }
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Como calcular a próxima data</Label>
            <Select
              value={value.recurrence_mode}
              onValueChange={(v) =>
                patch({ recurrence_mode: v as RecurrenceFormValue["recurrence_mode"] })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TODO_RECURRENCE_MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {TODO_RECURRENCE_MODE_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[0.7rem] text-muted-foreground">
              {value.recurrence_mode === "fixo"
                ? "A próxima data segue o calendário, mesmo que você conclua atrasado."
                : "A próxima data conta a partir do dia em que você concluir."}
            </p>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
            <Label className="text-xs" htmlFor="rec-uteis">
              Somente em dias úteis
            </Label>
            <Switch
              id="rec-uteis"
              checked={value.business_day_rule === "apenas_dias_uteis"}
              onCheckedChange={(checked) =>
                patch({ business_day_rule: checked ? "apenas_dias_uteis" : null })
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="rec-ends">
                Repetir até
              </Label>
              <Input
                id="rec-ends"
                type="date"
                value={value.ends_on ?? ""}
                onChange={(e) => patch({ ends_on: e.target.value || null })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="rec-max">
                Nº de vezes
              </Label>
              <Input
                id="rec-max"
                type="number"
                min={1}
                max={9999}
                inputMode="numeric"
                placeholder="Sem limite"
                value={value.max_occurrences ?? ""}
                onChange={(e) =>
                  patch({ max_occurrences: e.target.value ? Number(e.target.value) : null })
                }
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
            <Label className="text-xs" htmlFor="rec-pause">
              Pausar repetição
            </Label>
            <Switch
              id="rec-pause"
              checked={value.is_paused}
              onCheckedChange={(checked) => patch({ is_paused: checked })}
            />
          </div>
        </div>
      )}

      {/* O usuário SEMPRE vê o que foi configurado, em texto e com as próximas datas. */}
      {rule && (
        <div className="space-y-1 rounded-lg bg-muted/50 p-2.5">
          <p className="text-xs font-medium">{describeRule(rule)}</p>
          {anchorDate ? (
            preview.length > 0 ? (
              <p className="text-[0.7rem] text-muted-foreground">
                Próximas: {preview.map((d) => formatDate(d)).join(" · ")}
              </p>
            ) : (
              <p className="text-[0.7rem] text-muted-foreground">
                Sem próximas ocorrências — a repetição já encerrou.
              </p>
            )
          ) : (
            <p className="text-[0.7rem] text-muted-foreground">
              Defina uma data programada para ver as próximas ocorrências.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
