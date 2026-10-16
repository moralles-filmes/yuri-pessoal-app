"use client";

import * as React from "react";
import Link from "next/link";
import { CircleAlert, Loader2, Search, SearchX } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buscaLink } from "@/components/search/busca-links";
import { globalSearch } from "@/lib/actions/search";
import { searchIcon } from "@/components/search/search-meta";
import type { SearchGroup } from "@/lib/search/types";

/**
 * Página de busca global (Fase 13): caixa de busca + resultados agrupados por tipo.
 * Os resultados iniciais vêm do servidor (?q=); ao digitar, refaz a busca (debounce)
 * via Server Action e atualiza a URL para ficar compartilhável.
 *
 * REDESIGN-07-D · D6 — ⛔ DIGITAR NÃO BUSCA O RSC. O `router.replace` a cada tecla fazia o
 * Next refazer a página no servidor (`searchAll` por tecla) e o `value` só voltava com a
 * resposta — a regra do campo de texto do projeto. Agora o texto é LOCAL e alcança a URL depois
 * da pausa (o mesmo debounce da busca) por `window.history.replaceState`, que o Next 16 integra
 * ao roteador sem ir ao servidor. A página monta este componente com `key={q}`: uma navegação de
 * fora (voltar, link colado) remonta com os resultados do servidor — é o que dispensa aqui a
 * reconciliação do `useUrlText` (adotar mudança externa, reconhecer o eco), e o que mantém a
 * rota abaixo da linha de base. Erro ≠ vazio: falha da busca é dita como falha.
 */
export function BuscaClient({
  initialQuery,
  initialGroups,
}: {
  initialQuery: string;
  initialGroups: SearchGroup[];
}) {
  const [query, setQuery] = React.useState(initialQuery);
  const [groups, setGroups] = React.useState<SearchGroup[]>(initialGroups);
  const [loading, setLoading] = React.useState(false);
  const [erro, setErro] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqId = React.useRef(0);

  function runSearch(value: string) {
    const id = ++reqId.current;
    setLoading(true);
    setErro(false);
    globalSearch(value)
      .then((res) => {
        if (id === reqId.current) setGroups(res);
      })
      .catch(() => {
        if (id === reqId.current) {
          setGroups([]);
          setErro(true);
        }
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
      reqId.current++;
      setGroups([]);
      setErro(false);
      setLoading(false);
      window.history.replaceState(null, "", buscaLink());
      return;
    }
    timer.current = setTimeout(() => {
      // A URL acompanha depois da pausa, sem ir ao servidor: link, voltar e recarregar seguem valendo.
      window.history.replaceState(null, "", buscaLink(trimmed));
      runSearch(trimmed);
    }, 220);
  }

  const total = groups.reduce((s, g) => s + g.results.length, 0);
  const showEmpty = !loading && !erro && query.trim().length >= 2 && total === 0;

  return (
    // O cabeçalho é desenhado pela página (servidor): estático, não precisa vir no JS da tela.
    <div className="space-y-6">
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
        <EmptyState
          icon={Search}
          title="Comece a digitar"
          description="Digite ao menos 2 caracteres para buscar."
        />
      ) : erro ? (
        // D6 — falha não é "nada encontrado": a tela não afirma que não existe resultado.
        <div role="alert">
          <EmptyState
            icon={CircleAlert}
            title="Não foi possível buscar agora."
            description="Isso não quer dizer que não haja resultado."
          >
            <Button variant="outline" size="sm" onClick={() => runSearch(query.trim())}>
              Tentar de novo
            </Button>
          </EmptyState>
        </div>
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
