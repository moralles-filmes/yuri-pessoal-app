"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { globalSearch } from "@/lib/actions/search";
import type { SearchGroup, SearchResult } from "@/lib/search/types";
import { searchIcon } from "./search-meta";

/**
 * Busca global (Fase 13): triggers no header (caixa no desktop, ícone no mobile) +
 * command palette em Dialog. Abre com Ctrl/Cmd+K. Busca server-side (RLS) com debounce
 * e navegação por teclado (↑/↓/Enter). Resultados agrupados por tipo.
 */
export function SearchCommand() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [groups, setGroups] = React.useState<SearchGroup[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState(0);

  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqId = React.useRef(0);

  // Lista plana (na ordem visual) para a navegação por teclado.
  const flat = React.useMemo<SearchResult[]>(
    () => groups.flatMap((g) => g.results),
    [groups],
  );

  // Atalho global Ctrl/Cmd+K.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function runSearch(value: string) {
    const id = ++reqId.current;
    setLoading(true);
    globalSearch(value)
      .then((res) => {
        if (id !== reqId.current) return; // descarta respostas obsoletas
        setGroups(res);
        setActive(0);
      })
      .catch(() => {
        if (id === reqId.current) setGroups([]);
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  }

  function handleChange(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      reqId.current++; // invalida buscas em voo
      setGroups([]);
      setLoading(false);
      return;
    }
    timer.current = setTimeout(() => runSearch(trimmed), 220);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setGroups([]);
      setActive(0);
      setLoading(false);
    }
  }

  function go(result: SearchResult) {
    handleOpenChange(false);
    router.push(result.link);
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (flat.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = flat[active];
      if (r) go(r);
    }
  }

  const showEmpty = !loading && query.trim().length >= 2 && flat.length === 0;
  let runningIndex = -1;

  return (
    <>
      {/* Trigger desktop (caixa de busca) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-full max-w-sm items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 sm:flex"
      >
        <Search className="size-4" />
        <span>Buscar transações, faturas, tarefas...</span>
        <kbd className="ml-auto rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium">
          Ctrl K
        </kbd>
      </button>
      {/* Trigger mobile (ícone) */}
      <Button
        variant="ghost"
        size="icon"
        className="sm:hidden"
        aria-label="Buscar"
        onClick={() => setOpen(true)}
      >
        <Search className="size-5" />
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="top-[12%] max-h-[76vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        >
          <DialogTitle className="sr-only">Busca global</DialogTitle>

          <div className="flex items-center gap-2 border-b border-border px-3">
            {loading ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <Search className="size-4 shrink-0 text-muted-foreground" />
            )}
            <input
              autoFocus
              value={query}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Buscar em todo o sistema…"
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Buscar"
            />
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-1.5">
            {query.trim().length < 2 ? (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                Digite ao menos 2 caracteres para buscar.
              </p>
            ) : showEmpty ? (
              <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
                <SearchX className="size-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Nada encontrado para “{query.trim()}”.
                </p>
              </div>
            ) : (
              groups.map((group) => {
                const Icon = searchIcon(group.type);
                return (
                  <div key={group.type} className="mb-1">
                    <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      {group.label}
                    </p>
                    <ul>
                      {group.results.map((r) => {
                        runningIndex += 1;
                        const idx = runningIndex;
                        return (
                          <li key={`${r.type}-${r.id}`}>
                            <button
                              type="button"
                              onClick={() => go(r)}
                              onMouseEnter={() => setActive(idx)}
                              className={cn(
                                "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                                idx === active ? "bg-muted" : "hover:bg-muted/60",
                              )}
                            >
                              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                                <Icon className="size-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm">{r.title}</span>
                                {r.subtitle && (
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {r.subtitle}
                                  </span>
                                )}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
