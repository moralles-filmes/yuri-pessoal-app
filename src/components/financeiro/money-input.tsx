"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Campo de moeda BRL. Mantém o texto digitado e expõe o valor numérico via
 * onValueChange. Aceita vírgula ou ponto; o servidor revalida com Zod.
 */
export function MoneyInput({
  value,
  onValueChange,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  value: string;
  onValueChange: (raw: string) => void;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
        R$
      </span>
      <Input
        inputMode="decimal"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn("pl-9 tabular-nums", className)}
        placeholder="0,00"
        {...props}
      />
    </div>
  );
}
