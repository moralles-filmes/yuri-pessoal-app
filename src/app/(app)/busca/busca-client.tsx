"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search, SearchX } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { globalSearch } from "@/lib/actions/search";
import { searchIcon } from "@/components/search/search-meta";
import type { SearchGroup } from "@/lib/search/types";

/**
 * Página de busca global (Fase 13): caixa de busca + resultados agrupados por tipo.
 * Os resultados iniciais vêm do servidor (?q=); ao digitar, refaz a busca (debounce)
 * via Server Action e atualiza a URL para ficar compartilhável.
 */
export function BuscaClient({
  initialQuery,
  initialGroups,
}: {
  initialQuery: string;
  initialGroups: SearchGroup[];
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState(initialQuery);
  const [groups, setGroups] = React.useState<SearchGroup[]>(initialGroups);
  const [loading, setLoading] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqId = React.useRef(0);

  function runSearch(value: string) {
    const id = ++reqId.current;
    setLoading(true);
    globalSearch(value)
      .then((res) => {
        if (id === reqId.current) setGroups(res);
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
    const qs = trimmed.length >= 2 ? `?q=${encodeURIComponent(trimmed)}` : "";
    router.replace(`/busca${qs}`, { scroll: false });
    if (trimmed.length < 2) {
      reqId.current++;
      setGroups([]);
      setLoading(false);
      return;
    }
    timer.current = setTimeout(() => runSearch(trimmed), 220);
  }

  const total = groups.reduce((s, g) => s + g.results.length, 0);
  const showEmpty = !loading && query.trim().length >= 2 && total === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Busca"
        description="Encontre transações, faturas, pessoas, tarefas, hábitos, estudos, eventos e mais."
      />

      <div className="relative max-w-xl">
        {loading ? (
          <Loader2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        )}
        <Input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Buscar em todo o sistema…"
          className="pl-9"
          aria-label="Buscar"
        />
      </div>

      {query.trim().length < 2 ? (
        <p className="text-sm text-muted-foreground">
          Digite ao menos 2 caracteres para buscar.
        </p>
      ) : showEmpty ? (
        <EmptyState
          icon={SearchX}
          title="Nada encontrado"
          description={`Nenhum resultado para “${query.trim()}”. Tente outro termo.`}
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => {
            const Icon = searchIcon(group.type);
            return (
              <section key={group.type} className="space-y-2">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  {group.label}{" "}
                  <span className="font-normal">({group.results.length})</span>
                </h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {group.results.map((r) => (
                    <li key={`${r.type}-${r.id}`}>
                      <Link
                        href={r.link}
                        className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {r.title}
                          </span>
                          {r.subtitle && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {r.subtitle}
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
