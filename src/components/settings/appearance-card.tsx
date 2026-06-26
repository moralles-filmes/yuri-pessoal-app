"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { saveThemePreference } from "@/lib/actions/settings";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
] as const;

/** Card de tema (dark/light/sistema). Aplica via next-themes (sem flash) e persiste a
 *  preferência em `settings` best-effort (consolida a store da Fase 14). */
export function AppearanceCard() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  // next-themes retorna undefined no servidor e no 1º render do cliente
  // (sem mismatch de hidratação); o destaque ativo aparece após montar.
  const current = theme ?? resolvedTheme;

  function choose(value: "light" | "dark" | "system") {
    setTheme(value);
    // Best-effort: mantém settings.theme em sincronia (não bloqueia a UI).
    void saveThemePreference({ theme: value }).catch(() => {});
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aparência</CardTitle>
        <CardDescription>
          Escolha entre o tema claro, escuro ou acompanhar o sistema.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = current === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => choose(option.value)}
              aria-pressed={active}
              className={cn(
                "flex flex-1 items-center gap-3 rounded-xl border p-4 text-sm font-medium transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-lg",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                <Icon className="size-4" />
              </span>
              {option.label}
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
