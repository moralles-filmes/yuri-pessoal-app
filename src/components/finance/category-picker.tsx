"use client";

import * as React from "react";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  filtrarOpcoesDeCategoria,
  rotuloDaCategoria,
  type CategoryPickerCategory,
  type CategoryPickerSubcategory,
  type CategoryPickerValue,
} from "@/lib/finance/category-search";
import { cn } from "@/lib/utils";

export type { CategoryPickerValue } from "@/lib/finance/category-search";

/**
 * Seletor de categoria do Financeiro com pesquisa. Uma lista só: cada categoria com as suas
 * subcategorias recuadas embaixo; escolher a subcategoria escolhe a categoria junto.
 *
 * Sem `subcategories` (ou com a lista vazia) ele é um seletor de categoria com busca — é o caso
 * das telas cujo registro não tem subcategoria (conta fixa, filtros).
 *
 * `modal`: dentro de um Dialog, o popover vai para um portal FORA do RemoveScroll do diálogo, e
 * sem um RemoveScroll próprio a rolagem da lista ficaria travada.
 */
export function CategoryPicker({
  categories,
  subcategories = [],
  value,
  onChange,
  placeholder = "Sem categoria",
  noneLabel = "Sem categoria",
  allowNone = true,
  disabled,
  id,
  className,
  size = "default",
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
}: {
  categories: readonly CategoryPickerCategory[];
  subcategories?: readonly CategoryPickerSubcategory[];
  value: CategoryPickerValue;
  onChange: (value: CategoryPickerValue) => void;
  placeholder?: string;
  /** Rótulo da opção que limpa a escolha (ex.: "Todas" num filtro). */
  noneLabel?: string;
  allowNone?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  size?: "sm" | "default";
  "aria-invalid"?: boolean;
  "aria-label"?: string;
}) {
  const [aberto, setAberto] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const [ativo, setAtivo] = React.useState(0);
  const listaRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  const opcoes = React.useMemo(
    () => filtrarOpcoesDeCategoria(categories, subcategories, busca),
    [categories, subcategories, busca],
  );
  // "Sem categoria" só aparece sem busca: com texto digitado, quem procura quer uma categoria.
  const mostraNenhuma = allowNone && busca.trim() === "";
  const total = opcoes.length + (mostraNenhuma ? 1 : 0);
  const rotulo = rotuloDaCategoria(categories, subcategories, value);

  function abrirOuFechar(next: boolean) {
    setAberto(next);
    if (next) {
      setBusca("");
      setAtivo(0);
    }
  }

  function escolher(v: CategoryPickerValue) {
    onChange(v);
    setAberto(false);
  }

  function escolherIndice(i: number) {
    if (mostraNenhuma && i === 0) {
      escolher({ categoryId: null, subcategoryId: null });
      return;
    }
    const o = opcoes[i - (mostraNenhuma ? 1 : 0)];
    if (o) escolher({ categoryId: o.categoryId, subcategoryId: o.subcategoryId });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtivo((i) => Math.min(i + 1, Math.max(total - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (total > 0) escolherIndice(ativo);
    }
  }

  React.useEffect(() => {
    listaRef.current
      ?.querySelector<HTMLElement>(`[data-index="${ativo}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [ativo]);

  const selecionada = (categoryId: string | null, subcategoryId: string | null) =>
    value.categoryId === categoryId && (value.subcategoryId ?? null) === subcategoryId;

  return (
    <Popover open={aberto} onOpenChange={abrirOuFechar} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          role="combobox"
          aria-expanded={aberto}
          aria-controls={listId}
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel}
          data-size={size}
          className={cn(
            "flex w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-left text-sm transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-8 data-[size=sm]:h-7 dark:bg-input/30 dark:hover:bg-input/50",
            className,
          )}
        >
          <span className={cn("min-w-0 truncate", !rotulo && "text-muted-foreground")}>
            {rotulo ?? placeholder}
          </span>
          <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-64 p-0"
        onOpenAutoFocus={(e) => {
          // O foco vai para a busca, não para a primeira opção.
          e.preventDefault();
          (e.currentTarget as HTMLElement).querySelector("input")?.focus();
        }}
      >
        <div className="flex items-center gap-2 border-b border-border px-2.5">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setAtivo(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Pesquisar categoria…"
            aria-label="Pesquisar categoria"
            aria-controls={listId}
            className="h-9 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div
          ref={listaRef}
          id={listId}
          role="listbox"
          className="max-h-72 overflow-y-auto overscroll-contain p-1"
        >
          {mostraNenhuma && (
            <Opcao
              index={0}
              ativo={ativo === 0}
              selecionada={value.categoryId === null}
              onHover={setAtivo}
              onSelect={() => escolherIndice(0)}
            >
              <span className="text-muted-foreground">{noneLabel}</span>
            </Opcao>
          )}
          {opcoes.map((o, i) => {
            const index = i + (mostraNenhuma ? 1 : 0);
            const ehSub = o.subcategoryId !== null;
            return (
              <Opcao
                key={o.key}
                index={index}
                ativo={ativo === index}
                selecionada={selecionada(o.categoryId, o.subcategoryId)}
                onHover={setAtivo}
                onSelect={() => escolherIndice(index)}
                recuo={ehSub}
              >
                {ehSub ? (
                  <span className="text-muted-foreground" aria-hidden>
                    ›
                  </span>
                ) : (
                  <span
                    className="size-2 shrink-0 rounded-full bg-muted-foreground/40"
                    style={o.color ? { backgroundColor: o.color } : undefined}
                    aria-hidden
                  />
                )}
                <span className={cn("min-w-0 truncate", !ehSub && "font-medium")}>
                  {o.label}
                </span>
              </Opcao>
            );
          })}
          {opcoes.length === 0 && busca.trim() !== "" && (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">
              Nenhuma categoria encontrada.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Opcao({
  index,
  ativo,
  selecionada,
  recuo,
  onHover,
  onSelect,
  children,
}: {
  index: number;
  ativo: boolean;
  selecionada: boolean;
  recuo?: boolean;
  onHover: (i: number) => void;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="option"
      aria-selected={selecionada}
      data-index={index}
      onMouseMove={() => onHover(index)}
      // pointerdown + preventDefault: mantém o foco na busca enquanto o clique escolhe.
      onPointerDown={(e) => e.preventDefault()}
      onClick={onSelect}
      className={cn(
        "flex cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm relative select-none",
        recuo && "pl-6",
        ativo && "bg-accent text-accent-foreground",
      )}
    >
      {children}
      {selecionada && (
        <CheckIcon className="absolute right-2 size-4 text-foreground" aria-hidden />
      )}
    </div>
  );
}
