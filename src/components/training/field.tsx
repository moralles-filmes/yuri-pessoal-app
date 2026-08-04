"use client";

/**
 * Fase 17-B — Treinos · Campo de formulário do módulo.
 *
 * O mesmo desenho que a 17-A usava dentro de `exercise-form-dialog.tsx`, agora compartilhado:
 * a 17-B tem cinco formulários, e cinco cópias do mesmo `<Label> + erro` divergiriam na
 * primeira mudança de espaçamento.
 */
import * as React from "react";
import { Label } from "@/components/ui/label";

export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
      {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
