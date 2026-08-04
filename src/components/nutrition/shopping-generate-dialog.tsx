"use client";

/**
 * Fase 16-D — Dieta e Alimentação · Gerar lista a partir do planejamento e de receitas.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ NADA ACONTECE ANTES DA PRÉVIA.                                                        ║
 * ║ O botão "Ver o que vai entrar" chama a prévia no servidor e mostra, ANTES de gravar:  ║
 * ║  • quantos itens vão entrar;                                                          ║
 * ║  • quais ficaram em LINHAS SEPARADAS por unidade incompatível, e por quê;             ║
 * ║  • o que a despensa cobriria (regra 3: desconto opt-in, mostrado antes de aplicar);   ║
 * ║  • o que deixaria de ser pedido (regra 4: nada some sozinho — a remoção é uma caixa). ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
import * as React from "react";
import { CalendarRange, ChefHat, Info, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDaysIso, startOfWeekIso } from "@/lib/nutrition/calendar";
import {
  PANTRY_COVERAGE_LABELS,
  formatShoppingQuantity,
  type PantryDiscountLine,
} from "@/lib/nutrition/shopping";
import {
  SHOPPING_RECURRENCE_HINTS,
  SHOPPING_RECURRENCE_LABELS,
  SHOPPING_RECURRENCES,
} from "@/lib/nutrition/constants";
import type { ShoppingGenerationPreview } from "@/lib/actions/nutrition-shopping";

export type GenerateSource = "dia" | "semana" | "periodo" | "receitas";

const selectClass =
  "h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const SOURCE_LABELS: Record<GenerateSource, string> = {
  dia: "Um dia",
  semana: "Uma semana",
  periodo: "Um período",
  receitas: "Receitas escolhidas",
};

export function ShoppingGenerateDialog({
  open,
  onOpenChange,
  hoje,
  recipes,
  /** Lista existente que será REGERADA. Nulo = criar uma nova. */
  listId,
  listName,
  onPreview,
  onGenerate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hoje: string;
  recipes: { id: string; name: string }[];
  listId: string | null;
  listName: string | null;
  onPreview: (input: Record<string, unknown>) => Promise<ShoppingGenerationPreview | null>;
  onGenerate: (input: Record<string, unknown>) => Promise<boolean>;
}) {
  const [source, setSource] = React.useState<GenerateSource>("semana");
  const [from, setFrom] = React.useState(startOfWeekIso(hoje));
  const [to, setTo] = React.useState(addDaysIso(startOfWeekIso(hoje), 6));
  const [recurrence, setRecurrence] = React.useState<(typeof SHOPPING_RECURRENCES)[number]>("nenhuma");
  const [name, setName] = React.useState("");
  // 16-F: a quantidade de PORÇÕES de cada receita passou a ser escolhida aqui. Antes toda
  // receita entrava com 1 e o usuário corrigia item a item — o que, numa receita de 4
  // porções, subestimava a compra inteira.
  const [selectedRecipes, setSelectedRecipes] = React.useState<Map<string, number>>(
    new Map(),
  );
  const [discountPantry, setDiscountPantry] = React.useState(false);
  const [removeObsolete, setRemoveObsolete] = React.useState(false);
  const [preview, setPreview] = React.useState<ShoppingGenerationPreview | null>(null);
  const [busy, setBusy] = React.useState(false);

  const seen = `${open}:${listId ?? "novo"}`;
  const [lastSeen, setLastSeen] = React.useState(seen);
  if (seen !== lastSeen) {
    setLastSeen(seen);
    if (open) {
      setSource("semana");
      setFrom(startOfWeekIso(hoje));
      setTo(addDaysIso(startOfWeekIso(hoje), 6));
      setRecurrence("nenhuma");
      setName("");
      setSelectedRecipes(new Map());
      setDiscountPantry(false);
      setRemoveObsolete(false);
      setPreview(null);
      setBusy(false);
    }
  }

  /** Muda a fonte e ajusta o período de acordo, sem inventar datas fora do que foi pedido. */
  function changeSource(next: GenerateSource) {
    setSource(next);
    setPreview(null);
    if (next === "dia") {
      setFrom(hoje);
      setTo(hoje);
    } else if (next === "semana") {
      setFrom(startOfWeekIso(hoje));
      setTo(addDaysIso(startOfWeekIso(hoje), 6));
    }
  }

  const payload = () => ({
    list_id: listId,
    name: name || null,
    source_kind: source,
    from: source === "receitas" ? null : from,
    to: source === "receitas" ? null : source === "dia" ? from : to,
    recipes: [...selectedRecipes.entries()].map(([id, quantity]) => ({
      recipe_id: id,
      // Quantidade em PORÇÕES. Zero ou vazio não chega aqui: o campo tem mínimo 1.
      quantity,
      portion_unit: "porcao",
    })),
    recurrence,
    discount_pantry: discountPantry,
    remove_obsolete: removeObsolete,
  });

  async function runPreview() {
    setBusy(true);
    setPreview(await onPreview(payload()));
    setBusy(false);
  }

  async function confirm() {
    setBusy(true);
    const ok = await onGenerate(payload());
    setBusy(false);
    if (ok) onOpenChange(false);
  }

  const cobertos = preview?.despensa.lines.filter((line) => line.coverage === "total") ?? [];
  const parciais = preview?.despensa.lines.filter((line) => line.coverage === "parcial") ?? [];
  const semDesconto = preview?.despensa.lines.filter((line) => line.coverage === "indisponivel") ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{listId ? `Regerar “${listName}”` : "Gerar lista de compras"}</DialogTitle>
          <DialogDescription>
            A lista sai do que está planejado. Nada é gravado até você conferir a prévia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ── Fonte ── */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(SOURCE_LABELS) as GenerateSource[]).map((value) => (
              <Button
                key={value}
                type="button"
                variant={source === value ? "default" : "outline"}
                className="h-11"
                onClick={() => changeSource(value)}
              >
                {value === "receitas" ? (
                  <ChefHat className="size-4" />
                ) : (
                  <CalendarRange className="size-4" />
                )}
                {SOURCE_LABELS[value]}
              </Button>
            ))}
          </div>

          {source !== "receitas" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="gerar-de">{source === "dia" ? "Dia" : "De"}</Label>
                <Input
                  id="gerar-de"
                  type="date"
                  value={from}
                  onChange={(event) => {
                    setFrom(event.target.value);
                    setPreview(null);
                  }}
                  className="h-11"
                />
              </div>
              {source !== "dia" && (
                <div className="space-y-1.5">
                  <Label htmlFor="gerar-ate">Até</Label>
                  <Input
                    id="gerar-ate"
                    type="date"
                    value={to}
                    onChange={(event) => {
                      setTo(event.target.value);
                      setPreview(null);
                    }}
                    className="h-11"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Receitas</Label>
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-input p-2">
                {recipes.length === 0 && (
                  <p className="p-2 text-sm text-muted-foreground">Nenhuma receita cadastrada.</p>
                )}
                {recipes.map((recipe) => {
                  const selected = selectedRecipes.has(recipe.id);
                  return (
                    <div
                      key={recipe.id}
                      className="flex items-center gap-3 rounded-md px-2 py-2.5 text-sm"
                    >
                      <Checkbox
                        id={`gerar-receita-${recipe.id}`}
                        checked={selected}
                        onCheckedChange={() => {
                          setSelectedRecipes((current) => {
                            const next = new Map(current);
                            if (next.has(recipe.id)) next.delete(recipe.id);
                            else next.set(recipe.id, 1);
                            return next;
                          });
                          setPreview(null);
                        }}
                        className="size-5"
                      />
                      <Label
                        htmlFor={`gerar-receita-${recipe.id}`}
                        className="min-w-0 flex-1 truncate font-normal"
                      >
                        {recipe.name}
                      </Label>
                      {selected && (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Input
                            type="number"
                            min={1}
                            step="any"
                            inputMode="decimal"
                            aria-label={`Porções de ${recipe.name}`}
                            value={selectedRecipes.get(recipe.id) ?? 1}
                            onChange={(e) => {
                              const parsed = Number(e.target.value);
                              setSelectedRecipes((current) => {
                                const next = new Map(current);
                                // Valor inválido volta para 1 em vez de virar 0: "zero
                                // porções" seria pedir para não comprar nada.
                                next.set(
                                  recipe.id,
                                  Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
                                );
                                return next;
                              });
                              setPreview(null);
                            }}
                            className="h-9 w-20"
                          />
                          <span className="text-xs text-muted-foreground">porç.</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                A quantidade é em porções da receita. Os ingredientes entram na lista já
                multiplicados — e continuam ajustáveis item a item depois.
              </p>
            </div>
          )}

          {!listId && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="gerar-nome">Nome da lista</Label>
                <Input
                  id="gerar-nome"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Deixe vazio para o nome automático"
                  className="h-11"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="gerar-recorrencia">Repetição</Label>
                <select
                  id="gerar-recorrencia"
                  value={recurrence}
                  onChange={(event) =>
                    setRecurrence(event.target.value as (typeof SHOPPING_RECURRENCES)[number])
                  }
                  className={selectClass}
                >
                  {SHOPPING_RECURRENCES.map((value) => (
                    <option key={value} value={value}>
                      {SHOPPING_RECURRENCE_LABELS[value]}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  {SHOPPING_RECURRENCE_HINTS[recurrence]}
                </p>
              </div>
            </>
          )}

          {/* ── Opções que MUDAM dados: nenhuma marcada por padrão ── */}
          <div className="space-y-2 rounded-md border border-input p-3">
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                checked={discountPantry}
                onCheckedChange={(checked) => setDiscountPantry(checked === true)}
                className="mt-0.5 size-5"
              />
              <span>
                Descontar o que já tenho na despensa
                <span className="block text-[11px] text-muted-foreground">
                  Só desconta quando a unidade converte de verdade. O que não converte fica
                  inteiro na lista, com o motivo.
                </span>
              </span>
            </label>

            {listId && (
              <label className="flex items-start gap-3 text-sm">
                <Checkbox
                  checked={removeObsolete}
                  onCheckedChange={(checked) => setRemoveObsolete(checked === true)}
                  className="mt-0.5 size-5"
                />
                <span>
                  Remover o que o planejamento não pede mais
                  <span className="block text-[11px] text-muted-foreground">
                    Itens digitados por você nunca são removidos.
                  </span>
                </span>
              </label>
            )}
          </div>

          {/* ── Prévia ── */}
          {preview && (
            <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
              <p className="font-medium">
                {preview.itens} {preview.itens === 1 ? "item" : "itens"}
                {preview.refeicoes > 0 && ` · ${preview.refeicoes} refeições planejadas`}
              </p>

              {preview.ajustesPreservados > 0 && (
                <p className="flex gap-2 text-[11px] text-muted-foreground">
                  <Info className="size-3.5 shrink-0" />
                  {preview.ajustesPreservados} quantidade
                  {preview.ajustesPreservados === 1 ? " ajustada" : "s ajustadas"} à mão
                  {preview.ajustesPreservados === 1 ? " será preservada" : " serão preservadas"}.
                </p>
              )}

              {preview.separados.length > 0 && (
                <div className="space-y-1">
                  <p className="flex items-center gap-2 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                    <TriangleAlert className="size-3.5 shrink-0" />
                    Em linhas separadas (unidades que não se convertem)
                  </p>
                  <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                    {preview.separados.map((split) => (
                      <li key={split.label}>
                        {split.label}: {split.units.join(" · ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {preview.despensa.lines.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-medium">
                    Despensa: {cobertos.length} já tenho · {parciais.length} tenho parte ·{" "}
                    {semDesconto.length} não dá para descontar
                  </p>
                  <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                    {preview.despensa.lines.slice(0, 8).map((line) => (
                      <li key={line.consolidationKey}>{describeLine(line)}</li>
                    ))}
                  </ul>
                  {!discountPantry && (
                    <p className="text-[11px] text-muted-foreground">
                      Marque “descontar” acima para aplicar.
                    </p>
                  )}
                </div>
              )}

              {preview.obsoletos.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-medium">
                    Não é mais pedido pelo planejamento ({preview.obsoletos.length})
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {preview.obsoletos.map((row) => row.label).join(", ")}
                    {removeObsolete ? " — será removido." : " — vai continuar na lista."}
                  </p>
                </div>
              )}

              {preview.ignorados.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-medium">Ficou de fora</p>
                  <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                    {preview.ignorados.slice(0, 5).map((row, index) => (
                      <li key={`${row.label}-${index}`}>
                        {row.label}: {row.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="outline" onClick={runPreview} disabled={busy}>
            Ver o que vai entrar
          </Button>
          <Button onClick={confirm} disabled={busy || preview === null}>
            {listId ? "Regerar" : "Gerar lista"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function describeLine(line: PantryDiscountLine): string {
  const prefixo = `${line.label} — ${PANTRY_COVERAGE_LABELS[line.coverage]}`;
  if (line.coverage === "indisponivel") return `${prefixo}: ${line.reason ?? ""}`;
  if (line.coverage === "parcial") {
    return `${prefixo}: falta ${formatShoppingQuantity(line.remaining, line.unit)}`;
  }
  if (line.coverage === "total" && line.surplus && line.surplus > 0) {
    return `${prefixo} (sobra ${formatShoppingQuantity(line.surplus, line.unit)})`;
  }
  return prefixo;
}
