"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { CategoryFormDialog } from "./category-form";
import { SubcategoryFormDialog } from "./subcategory-form";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import {
  deleteCategory,
  deleteSubcategory,
  ensureDefaultCategories,
} from "@/lib/actions/categories";
import { CATEGORY_KIND_LABELS } from "@/lib/finance/constants";
import { toast } from "sonner";
import type { CategoryRow, SubcategoryRow } from "@/types/database";

export function CategoriesClient({
  categories,
  subcategories,
}: {
  categories: CategoryRow[];
  subcategories: SubcategoryRow[];
}) {
  const router = useRouter();
  const [restoring, setRestoring] = React.useState(false);

  const subsByCategory = React.useMemo(() => {
    const map = new Map<string, SubcategoryRow[]>();
    for (const sub of subcategories) {
      const list = map.get(sub.category_id) ?? [];
      list.push(sub);
      map.set(sub.category_id, list);
    }
    return map;
  }, [subcategories]);

  async function handleRestore() {
    setRestoring(true);
    try {
      const res = await ensureDefaultCategories();
      if (res.ok) {
        toast.success(
          res.data.inserted > 0
            ? `${res.data.inserted} categoria(s) padrão adicionada(s).`
            : "Categorias padrão já estão presentes.",
        );
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {categories.length} categoria(s)
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRestore}
            disabled={restoring}
          >
            {restoring ? "Restaurando…" : "Restaurar padrão"}
          </Button>
          <CategoryFormDialog
            trigger={
              <Button size="sm">
                <Plus /> Nova categoria
              </Button>
            }
          />
        </div>
      </div>

      {categories.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="Nenhuma categoria"
          description="Crie categorias ou restaure as categorias padrão do sistema."
        >
          <Button size="sm" onClick={handleRestore} disabled={restoring}>
            Restaurar padrão
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {categories.map((category) => {
            const subs = subsByCategory.get(category.id) ?? [];
            return (
              <Card key={category.id}>
                <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden
                      className="size-8 shrink-0 rounded-lg ring-1 ring-foreground/10"
                      style={{ backgroundColor: category.color }}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate font-medium">
                          {category.name}
                        </span>
                        {category.is_default && (
                          <Badge variant="outline" className="text-muted-foreground">
                            padrão
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {CATEGORY_KIND_LABELS[category.kind]}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <CategoryFormDialog
                      category={category}
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label="Editar">
                          <Pencil />
                        </Button>
                      }
                    />
                    <DeleteConfirmDialog
                      title="Excluir categoria"
                      description={`Excluir "${category.name}" e suas subcategorias?`}
                      successMessage="Categoria excluída."
                      onConfirm={async () => {
                        const res = await deleteCategory(category.id);
                        if (res.ok) router.refresh();
                        return res;
                      }}
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Excluir"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 />
                        </Button>
                      }
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {subs.map((sub) => (
                      <span
                        key={sub.id}
                        className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pr-1 pl-2.5 text-xs"
                      >
                        {sub.name}
                        <DeleteConfirmDialog
                          title="Excluir subcategoria"
                          description={`Excluir "${sub.name}"?`}
                          successMessage="Subcategoria excluída."
                          onConfirm={async () => {
                            const res = await deleteSubcategory(sub.id);
                            if (res.ok) router.refresh();
                            return res;
                          }}
                          trigger={
                            <button
                              type="button"
                              aria-label="Excluir subcategoria"
                              className="grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          }
                        />
                      </span>
                    ))}
                    {subs.length === 0 && (
                      <span className="text-xs text-muted-foreground">
                        Sem subcategorias.
                      </span>
                    )}
                  </div>
                  <SubcategoryFormDialog
                    categoryId={category.id}
                    trigger={
                      <Button variant="ghost" size="xs">
                        <Plus /> Subcategoria
                      </Button>
                    }
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
