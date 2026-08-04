"use client";

/**
 * Fase 16-D — Dieta e Alimentação · Lista de compras (cliente).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ESTA É A TELA MAIS MOBILE-FIRST DO MÓDULO.                                            ║
 * ║ Ela é usada EM PÉ, NO MERCADO, COM UMA MÃO — carrinho na outra. Por isso:             ║
 * ║  • o alvo de toque para marcar um item ocupa a linha inteira (não só o quadradinho);  ║
 * ║  • nada depende de `hover`: no celular não existe passar o mouse;                     ║
 * ║  • os controles ficam grandes (h-11 / size-6) e o texto do item nunca é truncado a    ║
 * ║    ponto de virar adivinhação;                                                        ║
 * ║  • o desktop ganha uma grade em colunas, mas a linha de toque continua a mesma.       ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ══ O QUE ESTA TELA GARANTE ══
 * 1. ITEM SEPARADO MOSTRA O MOTIVO. Quando o mesmo alimento aparece em duas linhas, o aviso
 *    de unidades incompatíveis fica visível — o usuário nunca vê duas linhas "estranhas" sem
 *    explicação.
 * 2. A ORIGEM É RASTREÁVEL. Cada item diz de quais refeições e receitas veio.
 * 3. AJUSTE MANUAL É SINALIZADO. Item com quantidade ajustada mostra o selo, e a regeração o
 *    preserva.
 * 4. AÇÃO EM MASSA NÃO SAI DO FILTRO. A seleção é recortada por `selectionInScope` antes de ir
 *    ao servidor, e a tela diz quantos itens serão afetados.
 * 5. EXCLUIR SEMPRE CONFIRMA; a ação em massa oferecida em primeiro lugar é marcar.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  Copy,
  ListChecks,
  Package,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShoppingCart,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SortableList } from "@/components/shared/sortable-list";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import {
  SHOPPING_ITEM_STATUS_LABELS,
  SHOPPING_ITEM_STATUSES,
  SHOPPING_LIST_STATUS_LABELS,
  SHOPPING_NO_PUBLIC_LINK_NOTE,
  SHOPPING_PRIORITY_LABELS,
  SHOPPING_SORT_LABELS,
  SHOPPING_SORTS,
  type ShoppingSort,
} from "@/lib/nutrition/constants";
import {
  EMPTY_SHOPPING_FILTERS,
  filterShoppingItems,
  formatShoppingQuantity,
  groupItemsByCategory,
  selectionInScope,
  shoppingListToText,
  sortShoppingItems,
  summarizeShoppingList,
  type ShoppingFilterState,
} from "@/lib/nutrition/shopping";
import type {
  FoodListItem,
  MarketCategory,
  PantryItem,
  ShoppingList,
  ShoppingListItem,
} from "@/lib/nutrition/types";
import {
  addLowStockToList,
  applyPantryDiscountToList,
  bulkShoppingItems,
  deletePantryItem,
  deleteShoppingItem,
  deleteShoppingList,
  duplicateShoppingItem,
  duplicateShoppingList,
  generateShoppingList,
  previewShoppingGeneration,
  savePantryItem,
  saveShoppingItem,
  saveShoppingList,
  setShoppingItemStatus,
  setShoppingListStatus,
  moveShoppingItemCategory,
  reorderShoppingItems,
  updateShoppingItemQuantity,
} from "@/lib/actions/nutrition-shopping";
import { PantryPanel } from "@/components/nutrition/pantry-panel";
import { ShoppingGenerateDialog } from "@/components/nutrition/shopping-generate-dialog";
import { ShoppingItemDialog } from "@/components/nutrition/shopping-item-dialog";

const selectClass =
  "h-11 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type ShoppingClientProps = {
  hoje: string;
  lists: ShoppingList[];
  categories: MarketCategory[];
  pantry: PantryItem[];
  foods: FoodListItem[];
  recipes: { id: string; name: string }[];
  /** Aba e lista iniciais, vindos da URL. */
  aba: "lista" | "despensa";
  listaId: string | null;
};

export function ShoppingClient(props: ShoppingClientProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const [aba, setAba] = React.useState<"lista" | "despensa">(props.aba);
  const [listId, setListId] = React.useState<string | null>(
    props.listaId ?? props.lists[0]?.id ?? null,
  );
  const [filters, setFilters] = React.useState<ShoppingFilterState>(EMPTY_SHOPPING_FILTERS);
  const [sort, setSort] = React.useState<ShoppingSort>("categoria");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [reordering, setReordering] = React.useState(false);

  const [itemDialog, setItemDialog] = React.useState<{ open: boolean; item: ShoppingListItem | null }>({
    open: false,
    item: null,
  });
  const [generateOpen, setGenerateOpen] = React.useState(false);
  const [regenerate, setRegenerate] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  // A lista selecionada pode ter sumido (exclusão em outra aba): cai na primeira disponível.
  const list = props.lists.find((row) => row.id === listId) ?? props.lists[0] ?? null;

  const items = React.useMemo(() => list?.items ?? [], [list]);
  const visible = React.useMemo(
    () => sortShoppingItems(filterShoppingItems(items, filters), sort, props.categories),
    [items, filters, sort, props.categories],
  );
  const groups = React.useMemo(
    () => groupItemsByCategory(visible, props.categories),
    [visible, props.categories],
  );
  const summary = React.useMemo(() => summarizeShoppingList(items), [items]);

  const stores = React.useMemo(() => {
    const set = new Set<string>();
    for (const row of items) if (row.store) set.add(row.store);
    for (const row of props.lists) if (row.store) set.add(row.store);
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items, props.lists]);

  /** Regra 5: a ação em massa só alcança o que está visível no filtro atual. */
  const scopedSelection = React.useMemo(
    () => selectionInScope(selected, visible),
    [selected, visible],
  );

  function goTo(next: { aba?: "lista" | "despensa"; lista?: string | null }) {
    const params = new URLSearchParams();
    const nextAba = next.aba ?? aba;
    const nextLista = next.lista === undefined ? list?.id : next.lista;
    if (nextAba !== "lista") params.set("aba", nextAba);
    if (nextLista) params.set("lista", nextLista);
    const query = params.toString();
    router.replace(query ? `/nutricao/compras?${query}` : "/nutricao/compras", { scroll: false });
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(result.error ?? "Não foi possível concluir.");
      }
    });
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Marcar/desmarcar com um toque — a ação mais usada dentro do mercado. */
  function toggleBought(item: ShoppingListItem) {
    run(
      () =>
        setShoppingItemStatus({
          item_id: item.id,
          status: item.status === "comprado" ? "pendente" : "comprado",
          actual_price_cents: null,
        }),
      item.status === "comprado" ? "Item desmarcado." : "Item comprado.",
    );
  }

  function runBulk(action: string, extra: Record<string, unknown> = {}) {
    if (!list || scopedSelection.length === 0) return;

    if (action === "excluir") {
      const ok = confirm(
        `Excluir ${scopedSelection.length} ${scopedSelection.length === 1 ? "item" : "itens"} desta lista? Só o que está visível no filtro atual será excluído. “Não vou comprar” tira o item da conta sem apagar nada.`,
      );
      if (!ok) return;
    }

    startTransition(async () => {
      const result = await bulkShoppingItems({
        list_id: list.id,
        ids: scopedSelection,
        action,
        ...extra,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível aplicar a ação.");
        return;
      }
      toast.success(
        `${result.data.afetados} ${result.data.afetados === 1 ? "item atualizado" : "itens atualizados"}.` +
          (result.data.ignorados > 0 ? ` ${result.data.ignorados} fora do filtro.` : ""),
      );
      setSelected(new Set());
      router.refresh();
    });
  }

  function exportList() {
    if (!list) return;
    const texto = shoppingListToText(list, props.categories);
    const blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${list.name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Lista exportada.", { description: SHOPPING_NO_PUBLIC_LINK_NOTE });
  }

  const allVisibleSelected =
    visible.length > 0 && visible.every((item) => selected.has(item.id));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Lista de compras"
        description="Gerada do planejamento, agrupada por corredor e feita para o celular."
      >
        <Button
          variant="outline"
          className="h-11"
          onClick={() => {
            setRegenerate(false);
            setGenerateOpen(true);
          }}
        >
          <Sparkles className="size-4" />
          Gerar
        </Button>
        <Button
          className="h-11"
          onClick={() =>
            run(
              () => saveShoppingList({ name: `Lista de ${props.hoje.split("-").reverse().slice(0, 2).join("/")}` }),
              "Lista criada.",
            )
          }
        >
          <Plus className="size-4" />
          Nova
        </Button>
      </PageHeader>

      {/* ── Abas: alvo de toque grande ── */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={aba === "lista" ? "default" : "outline"}
          className="h-11"
          onClick={() => {
            setAba("lista");
            goTo({ aba: "lista" });
          }}
        >
          <ShoppingCart className="size-4" />
          Listas
        </Button>
        <Button
          variant={aba === "despensa" ? "default" : "outline"}
          className="h-11"
          onClick={() => {
            setAba("despensa");
            goTo({ aba: "despensa" });
          }}
        >
          <Package className="size-4" />
          Despensa
        </Button>
      </div>

      {aba === "despensa" ? (
        <PantryPanel
          pantry={props.pantry}
          categories={props.categories}
          foods={props.foods}
          hoje={props.hoje}
          pending={pending}
          onSave={async (values, id) => {
            const result = await savePantryItem(values, id);
            if (result.ok) {
              toast.success(id ? "Item atualizado." : "Item adicionado à despensa.");
              router.refresh();
              return true;
            }
            toast.error(result.error ?? "Não foi possível salvar.");
            return false;
          }}
          onDelete={(id) => run(() => deletePantryItem(id), "Item removido da despensa.")}
          onSendLowStock={
            list
              ? () =>
                  startTransition(async () => {
                    const result = await addLowStockToList(list.id);
                    if (result.ok) {
                      toast.success(
                        `${result.data.adicionados} ${result.data.adicionados === 1 ? "item enviado" : "itens enviados"} para “${list.name}”.`,
                      );
                      router.refresh();
                    } else {
                      toast.error(result.error ?? "Não foi possível enviar.");
                    }
                  })
              : null
          }
        />
      ) : !list ? (
        <EmptyState
          icon={ShoppingCart}
          title="Nenhuma lista ainda"
          description="Crie uma lista à mão ou gere a partir do que você já planejou comer — os itens repetidos são consolidados, e o que não converte de unidade fica separado, com o motivo."
        >
          <Button
            onClick={() => {
              setRegenerate(false);
              setGenerateOpen(true);
            }}
          >
            <Sparkles className="size-4" />
            Gerar do planejamento
          </Button>
        </EmptyState>
      ) : (
        <>
          {/* ── Seletor de lista + ações do documento ── */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={list.id}
              onChange={(event) => {
                setListId(event.target.value);
                setSelected(new Set());
                goTo({ lista: event.target.value });
              }}
              aria-label="Escolher lista"
              className={cn(selectClass, "min-w-[12rem] flex-1")}
            >
              {props.lists.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                  {row.status !== "ativa" ? ` · ${SHOPPING_LIST_STATUS_LABELS[row.status]}` : ""}
                </option>
              ))}
            </select>

            <Button
              variant="outline"
              size="sm"
              className="h-11"
              disabled={pending}
              onClick={() => {
                setRegenerate(true);
                setGenerateOpen(true);
              }}
            >
              <RefreshCw className="size-4" />
              Regerar
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-11"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await applyPantryDiscountToList({ list_id: list.id });
                  if (result.ok) {
                    toast.success(
                      result.data.aplicados === 0
                        ? "Nada da despensa pôde ser descontado desta lista."
                        : `${result.data.aplicados} ${result.data.aplicados === 1 ? "item ajustado" : "itens ajustados"} pela despensa.`,
                    );
                    router.refresh();
                  } else {
                    toast.error(result.error ?? "Não foi possível aplicar.");
                  }
                })
              }
            >
              <Package className="size-4" />
              Despensa
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-11"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await duplicateShoppingList({ list_id: list.id });
                  if (result.ok) {
                    toast.success(`Criada “${result.data.name}” com ${result.data.itens} itens.`);
                    setListId(result.data.id);
                    goTo({ lista: result.data.id });
                    router.refresh();
                  } else {
                    toast.error(result.error ?? "Não foi possível duplicar.");
                  }
                })
              }
            >
              <Copy className="size-4" />
              Duplicar
            </Button>

            <Button variant="outline" size="sm" className="h-11" onClick={exportList}>
              <ListChecks className="size-4" />
              Exportar
            </Button>

            <Button variant="outline" size="sm" className="h-11" onClick={() => window.print()}>
              <Printer className="size-4" />
              Imprimir
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-11"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    setShoppingListStatus(list.id, list.status === "concluida" ? "ativa" : "concluida"),
                  list.status === "concluida" ? "Lista reaberta." : "Compra concluída.",
                )
              }
            >
              <Check className="size-4" />
              {list.status === "concluida" ? "Reabrir" : "Concluir"}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-11"
              disabled={pending}
              onClick={() => {
                if (
                  confirm(
                    `Excluir a lista “${list.name}” e todos os ${list.items.length} itens dela? Isso não pode ser desfeito. Arquivar mantém tudo e tira da frente.`,
                  )
                ) {
                  run(() => deleteShoppingList(list.id), "Lista excluída.");
                  setListId(null);
                }
              }}
            >
              <Trash2 className="size-4" />
              Excluir
            </Button>
          </div>

          {/* ── Resumo: preço ausente é contado, não somado como zero ── */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryTile label="Itens" value={String(summary.total)} />
            <SummaryTile
              label="Faltam"
              value={String(summary.pendentes + summary.noCarrinho)}
              hint={summary.tudoResolvido ? "Tudo resolvido" : undefined}
            />
            <SummaryTile
              label="Estimado"
              value={formatCurrency(summary.estimadoCents / 100)}
              hint={summary.semPrecoEstimado > 0 ? `${summary.semPrecoEstimado} sem preço` : undefined}
            />
            <SummaryTile
              label="Pago"
              value={formatCurrency(summary.realCents / 100)}
              hint={summary.semPrecoReal > 0 ? `${summary.semPrecoReal} sem preço` : undefined}
            />
          </div>

          {/* ── Filtros ── */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filters.search}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, search: event.target.value }))
                }
                placeholder="Buscar item"
                className="h-11 pl-9"
                aria-label="Buscar item"
              />
            </div>

            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as ShoppingFilterState["status"],
                }))
              }
              aria-label="Filtrar por status"
              className={selectClass}
            >
              <option value="todos">Todos os status</option>
              <option value="abertos">Só o que falta</option>
              {SHOPPING_ITEM_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {SHOPPING_ITEM_STATUS_LABELS[status]}
                </option>
              ))}
            </select>

            <select
              value={filters.categoryId ?? ""}
              onChange={(event) =>
                setFilters((current) => ({ ...current, categoryId: event.target.value || null }))
              }
              aria-label="Filtrar por corredor"
              className={selectClass}
            >
              <option value="">Todos os corredores</option>
              {props.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

            {stores.length > 0 && (
              <select
                value={filters.store ?? ""}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, store: event.target.value || null }))
                }
                aria-label="Filtrar por loja"
                className={selectClass}
              >
                <option value="">Todas as lojas</option>
                {stores.map((store) => (
                  <option key={store} value={store}>
                    {store}
                  </option>
                ))}
              </select>
            )}

            <select
              value={filters.origin}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  origin: event.target.value as ShoppingFilterState["origin"],
                }))
              }
              aria-label="Filtrar por origem"
              className={selectClass}
            >
              <option value="todos">Toda origem</option>
              <option value="planejamento">Do planejamento</option>
              <option value="receita">De receita</option>
              <option value="manual">Adicionados por mim</option>
            </select>

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as ShoppingSort)}
              aria-label="Ordenar"
              className={selectClass}
            >
              {SHOPPING_SORTS.map((value) => (
                <option key={value} value={value}>
                  {SHOPPING_SORT_LABELS[value]}
                </option>
              ))}
            </select>

            <Button
              variant={reordering ? "default" : "outline"}
              size="sm"
              className="h-11"
              onClick={() => setReordering((v) => !v)}
            >
              Reordenar
            </Button>

            <Button
              className="h-11"
              onClick={() => setItemDialog({ open: true, item: null })}
            >
              <Plus className="size-4" />
              Item
            </Button>
          </div>

          {/* ── Ações em massa ── */}
          {scopedSelection.length > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="space-y-2 p-3">
                <p className="text-sm font-medium">
                  {scopedSelection.length}{" "}
                  {scopedSelection.length === 1 ? "item selecionado" : "itens selecionados"}
                  {selected.size > scopedSelection.length && (
                    <span className="ms-1 font-normal text-muted-foreground">
                      ({selected.size - scopedSelection.length} fora do filtro não será afetado)
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="h-10" disabled={pending} onClick={() => runBulk("marcar_comprado")}>
                    Comprado
                  </Button>
                  <Button size="sm" variant="outline" className="h-10" disabled={pending} onClick={() => runBulk("desmarcar")}>
                    Desmarcar
                  </Button>
                  <Button size="sm" variant="outline" className="h-10" disabled={pending} onClick={() => runBulk("no_carrinho")}>
                    No carrinho
                  </Button>
                  <Button size="sm" variant="outline" className="h-10" disabled={pending} onClick={() => runBulk("indisponivel")}>
                    Não encontrei
                  </Button>
                  <Button size="sm" variant="outline" className="h-10" disabled={pending} onClick={() => runBulk("remover_da_compra")}>
                    Não vou comprar
                  </Button>
                  <Button size="sm" variant="outline" className="h-10" disabled={pending} onClick={() => runBulk("prioridade_alta")}>
                    Prioridade alta
                  </Button>
                  <select
                    aria-label="Mover para corredor"
                    className={cn(selectClass, "h-10")}
                    value=""
                    onChange={(event) => {
                      if (!event.target.value) return;
                      runBulk("mover_categoria", { category_id: event.target.value });
                    }}
                  >
                    <option value="">Mover para…</option>
                    {props.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="ghost" className="h-10" disabled={pending} onClick={() => runBulk("excluir")}>
                    Excluir
                  </Button>
                  <Button size="sm" variant="ghost" className="h-10" onClick={() => setSelected(new Set())}>
                    Limpar seleção
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {visible.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title={items.length === 0 ? "Lista vazia" : "Nada encontrado"}
              description={
                items.length === 0
                  ? "Adicione itens à mão ou gere a partir do planejamento."
                  : "Ajuste a busca ou os filtros."
              }
            >
              {items.length === 0 && (
                <Button onClick={() => setItemDialog({ open: true, item: null })}>
                  <Plus className="size-4" />
                  Adicionar item
                </Button>
              )}
            </EmptyState>
          ) : reordering ? (
            <SortableList
              items={visible}
              getId={(item) => item.id}
              className="space-y-2"
              onReorder={(ids) =>
                run(() => reorderShoppingItems({ list_id: list.id, ids }), "Ordem salva.")
              }
              renderItem={(item, handle) => (
                <Card>
                  <CardContent className="flex items-center gap-2 p-3">
                    {handle}
                    <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatShoppingQuantity(item.quantity, item.unit)}
                    </span>
                  </CardContent>
                </Card>
              )}
            />
          ) : (
            <div className="space-y-4">
              <label className="flex w-fit items-center gap-3 py-1 text-xs text-muted-foreground">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={(checked) =>
                    setSelected(checked ? new Set(visible.map((item) => item.id)) : new Set())
                  }
                  className="size-5"
                  aria-label="Selecionar os itens visíveis"
                />
                Selecionar os {visible.length} visíveis
              </label>

              {groups.map((group) => (
                <section key={group.category?.id ?? "sem-corredor"} className="space-y-2">
                  <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.category?.icon && <span aria-hidden>{group.category.icon}</span>}
                    {group.category?.name ?? "Sem corredor"}
                    <span className="font-normal normal-case">({group.items.length})</span>
                  </h2>

                  <div className="space-y-2">
                    {group.items.map((item) => (
                      <ShoppingRow
                        key={item.id}
                        item={item}
                        selected={selected.has(item.id)}
                        expanded={expanded.has(item.id)}
                        pending={pending}
                        categories={props.categories}
                        onToggleSelect={() => toggleSelected(item.id)}
                        onToggleExpand={() => toggleExpanded(item.id)}
                        onToggleBought={() => toggleBought(item)}
                        onEdit={() => setItemDialog({ open: true, item })}
                        onDuplicate={() =>
                          run(() => duplicateShoppingItem(item.id), "Item duplicado.")
                        }
                        onDelete={() => {
                          if (
                            confirm(
                              `Excluir “${item.label}” da lista? Se você só não quer comprar agora, use “Não vou comprar” — o item fica registrado.`,
                            )
                          ) {
                            run(() => deleteShoppingItem(item.id), "Item excluído.");
                          }
                        }}
                        onQuantity={(quantity) =>
                          run(
                            () =>
                              updateShoppingItemQuantity({ item_id: item.id, quantity }),
                            "Quantidade ajustada. Regerar a lista não vai desfazer isso.",
                          )
                        }
                        onMoveCategory={(categoryId) =>
                          run(
                            () =>
                              moveShoppingItemCategory({
                                item_id: item.id,
                                category_id: categoryId,
                              }),
                            "Item movido de corredor.",
                          )
                        }
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Diálogos ── */}
      <ShoppingItemDialog
        open={itemDialog.open}
        onOpenChange={(open) => setItemDialog((current) => ({ ...current, open }))}
        item={itemDialog.item}
        categories={props.categories}
        foods={props.foods}
        stores={stores}
        onSubmit={async (values) => {
          if (!list) return;
          const result = await saveShoppingItem(
            { ...values, list_id: list.id },
            itemDialog.item?.id,
          );
          if (result.ok) {
            toast.success(itemDialog.item ? "Item salvo." : "Item adicionado.");
            setItemDialog({ open: false, item: null });
            router.refresh();
          } else {
            toast.error(result.error ?? "Não foi possível salvar.");
          }
        }}
      />

      <ShoppingGenerateDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        hoje={props.hoje}
        recipes={props.recipes}
        listId={regenerate ? (list?.id ?? null) : null}
        listName={regenerate ? (list?.name ?? null) : null}
        onPreview={async (input) => {
          const result = await previewShoppingGeneration(input);
          if (result.ok) return result.data;
          toast.error(result.error ?? "Não foi possível montar a prévia.");
          return null;
        }}
        onGenerate={async (input) => {
          const result = await generateShoppingList(input);
          if (!result.ok) {
            toast.error(result.error ?? "Não foi possível gerar a lista.");
            return false;
          }
          const { criados, atualizados, removidos, ajustesPreservados, separados, ignorados } =
            result.data;
          toast.success(
            `${criados} ${criados === 1 ? "item novo" : "itens novos"}` +
              (atualizados > 0 ? `, ${atualizados} atualizados` : "") +
              (removidos > 0 ? `, ${removidos} removidos` : "") +
              ".",
            {
              description: [
                ajustesPreservados > 0
                  ? `${ajustesPreservados} ajuste(s) manual(is) preservado(s).`
                  : null,
                separados > 0
                  ? `${separados} item(ns) em linhas separadas por unidades que não se convertem.`
                  : null,
                ignorados.length > 0 ? `${ignorados.length} ficou(aram) de fora.` : null,
              ]
                .filter(Boolean)
                .join(" "),
            },
          );
          setListId(result.data.listId);
          goTo({ lista: result.data.listId });
          router.refresh();
          return true;
        }}
      />
    </div>
  );
}

/* ───────────────────────────── Peças ───────────────────────────── */

function SummaryTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * A linha do mercado.
 *
 * O botão de marcar ocupa a linha inteira: no celular, com uma mão, mirar num quadradinho de
 * 16 px é o que faz a pessoa desistir do app no meio do corredor. A caixa de seleção múltipla
 * fica separada, à esquerda, e é grande também.
 */
function ShoppingRow({
  item,
  selected,
  expanded,
  pending,
  categories,
  onToggleSelect,
  onToggleExpand,
  onToggleBought,
  onEdit,
  onDuplicate,
  onDelete,
  onQuantity,
  onMoveCategory,
}: {
  item: ShoppingListItem;
  selected: boolean;
  expanded: boolean;
  pending: boolean;
  categories: MarketCategory[];
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onToggleBought: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onQuantity: (quantity: string) => void;
  onMoveCategory: (categoryId: string | null) => void;
}) {
  const [quantity, setQuantity] = React.useState(
    item.quantity === null ? "" : String(item.quantity),
  );

  const seen = `${item.id}:${item.quantity}`;
  const [lastSeen, setLastSeen] = React.useState(seen);
  if (seen !== lastSeen) {
    setLastSeen(seen);
    setQuantity(item.quantity === null ? "" : String(item.quantity));
  }

  const riscado = item.status === "comprado" || item.status === "removido";

  return (
    <Card className={cn(riscado && "opacity-60")}>
      <CardContent className="p-0">
        <div className="flex items-stretch">
          {/* Seleção múltipla: alvo grande e separado do "comprei". */}
          <label className="flex cursor-pointer items-center px-3">
            <Checkbox
              checked={selected}
              onCheckedChange={onToggleSelect}
              className="size-5"
              aria-label={`Selecionar ${item.label}`}
            />
          </label>

          {/* Marcar comprado: a linha inteira é o botão. */}
          <button
            type="button"
            onClick={onToggleBought}
            disabled={pending}
            className="min-w-0 flex-1 py-3 pe-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={
              item.status === "comprado" ? `Desmarcar ${item.label}` : `Marcar ${item.label} como comprado`
            }
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border-2",
                  item.status === "comprado"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/40",
                )}
                aria-hidden
              >
                {item.status === "comprado" && <Check className="size-3.5" />}
              </span>
              <span className={cn("min-w-0 flex-1 text-sm font-medium", riscado && "line-through")}>
                {item.label}
              </span>
              <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                {formatShoppingQuantity(item.quantity, item.unit)}
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-1 ps-8">
              {item.status !== "pendente" && item.status !== "comprado" && (
                <Badge variant="outline" className="text-[10px]">
                  {SHOPPING_ITEM_STATUS_LABELS[item.status]}
                </Badge>
              )}
              {item.priority !== "normal" && (
                <Badge variant="secondary" className="text-[10px]">
                  {SHOPPING_PRIORITY_LABELS[item.priority]}
                </Badge>
              )}
              {item.quantityOverridden && (
                <Badge variant="outline" className="text-[10px]">
                  Ajustado por você
                </Badge>
              )}
              {item.brand && <span className="text-[11px] text-muted-foreground">{item.brand}</span>}
              {item.store && <span className="text-[11px] text-muted-foreground">· {item.store}</span>}
              {item.estimatedPriceCents !== null && (
                <span className="text-[11px] text-muted-foreground">
                  · ~{formatCurrency(item.estimatedPriceCents / 100)}
                </span>
              )}
            </div>
          </button>

          <button
            type="button"
            onClick={onToggleExpand}
            className="px-3 text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={expanded ? `Recolher ${item.label}` : `Detalhes de ${item.label}`}
            aria-expanded={expanded}
          >
            <ChevronDown className={cn("size-5 transition-transform", expanded && "rotate-180")} />
          </button>
        </div>

        {/* ⛔ O aviso que impede a lista de parecer bugada: por que há duas linhas do mesmo item. */}
        {item.separateReason && (
          <p className="flex gap-2 border-t border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            {item.separateReason}
          </p>
        )}

        {expanded && (
          <div className="space-y-3 border-t border-border p-3">
            {/* Ajuste rápido da quantidade — a ação mais comum no corredor. */}
            <div className="flex items-center gap-2">
              <Input
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                inputMode="decimal"
                aria-label={`Quantidade de ${item.label}`}
                className="h-11 w-28"
              />
              <span className="text-sm text-muted-foreground">{item.unit}</span>
              <Button
                size="sm"
                variant="outline"
                className="h-11"
                disabled={pending}
                onClick={() => onQuantity(quantity)}
              >
                Ajustar
              </Button>
            </div>

            {/* Origem — regra 2 */}
            {item.origins.length > 0 ? (
              <div>
                <p className="text-[11px] font-medium">De onde veio</p>
                <ul className="mt-0.5 space-y-0.5 text-[11px] text-muted-foreground">
                  {item.origins.map((origin, index) => (
                    <li key={`${origin.label}-${index}`}>
                      {origin.kind === "receita" ? "Receita: " : ""}
                      {origin.label}
                      {origin.quantity !== null &&
                        ` — ${formatShoppingQuantity(origin.quantity, origin.unit || item.unit)}`}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {item.isManual ? "Adicionado por você." : "Sem origem registrada."}
              </p>
            )}

            {item.note && <p className="text-[11px] text-muted-foreground">{item.note}</p>}

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={item.categoryId ?? ""}
                onChange={(event) => onMoveCategory(event.target.value || null)}
                aria-label={`Corredor de ${item.label}`}
                className={cn(selectClass, "h-10")}
              >
                <option value="">Sem corredor</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="outline" className="h-10" onClick={onEdit}>
                <Pencil className="size-4" />
                Editar
              </Button>
              <Button size="sm" variant="outline" className="h-10" disabled={pending} onClick={onDuplicate}>
                <Copy className="size-4" />
                Duplicar
              </Button>
              <Button size="sm" variant="ghost" className="h-10" disabled={pending} onClick={onDelete}>
                <Trash2 className="size-4" />
                Excluir
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
