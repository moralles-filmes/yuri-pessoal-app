"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Alternar tema claro/escuro"
      title="Alternar tema"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {/* Ícone controlado por CSS (classe `dark` no <html>): correto já no
          primeiro paint, sem flash e sem setState em efeito. */}
      <Sun className="hidden size-5 dark:block" />
      <Moon className="size-5 dark:hidden" />
    </Button>
  );
}
