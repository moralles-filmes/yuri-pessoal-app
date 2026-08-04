"use client";

/**
 * Fase 16-F — Configurações do módulo Dieta e Alimentação (cliente).
 *
 * ══ O QUE ESTA TELA GARANTE ══
 *
 * 1. **NENHUMA EXCLUSÃO SILENCIOSA.** Excluir tipo de refeição já usado é RECUSADO pelo
 *    servidor com a contagem de usos e a alternativa (desativar) — o histórico do diário nunca
 *    é apagado por tabela. Categoria e etiqueta são `on delete set null`: a tela diz o que
 *    acontece antes de confirmar.
 *
 * 2. **A PROCEDÊNCIA APARECE POR EXTENSO.** A licença da TACO exige citação da fonte. Deixar
 *    isso só num arquivo do repositório não cumpre a exigência para quem usa o sistema.
 *
 * 3. **REORDENAR TEM SETAS, NÃO SÓ ARRASTO.** É o caminho que funciona no teclado e no leitor
 *    de tela — e a ordem dos tipos de refeição é o que define a ordem do dia no diário.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  ChefHat,
  Database,
  ExternalLink,
  ListOrdered,
  Loader2,
  Plus,
  Ruler,
  Tag,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { shortTime } from "@/lib/nutrition/calendar";
import type {
  FoodSource,
  FoodTag,
  MealType,
  NutritionCatalogSummary,
  RecipeCategory,
} from "@/lib/nutrition/types";
import {
  deleteMealType,
  reorderMealTypes,
  saveMealType,
} from "@/lib/actions/nutrition-goals";
import { deleteRecipeCategory, saveRecipeCategory } from "@/lib/actions/nutrition-recipes";
import { deleteNutritionTag, saveNutritionTag } from "@/lib/actions/nutrition-foods";

const nf = new Intl.NumberFormat("pt-BR");

export function NutritionSettingsClient({
  mealTypes,
  recipeCategories,
  tags,
  sources,
  summary,
}: {
  mealTypes: MealType[];
  recipeCategories: RecipeCategory[];
  tags: FoodTag[];
  sources: FoodSource[];
  summary: NutritionCatalogSummary;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else {
        // O servidor devolve a mensagem com a contagem de usos e a alternativa. Não a
        // substitua por um genérico: é ela que explica por que a exclusão foi recusada.
        toast.error(result.error ?? "Não foi possível concluir.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações da dieta"
        description="Tipos de refeição, categorias, etiquetas e a procedência da base nutricional."
      />

      {/* ══ Resumo do catálogo ══ */}
      <div className="grid gap-3 @container sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Alimentos no catálogo"
          value={nf.format(summary.total)}
          hint={`${nf.format(summary.system)} da base · ${nf.format(summary.own)} seus`}
          icon={Database}
        />
        <StatCard
          label="Valores nutricionais"
          value={nf.format(summary.nutrientValues)}
          hint="Cada valor tem estado próprio — ausência não é zero"
          icon={Database}
        />
        <StatCard
          label="Categorias"
          value={nf.format(summary.categories)}
          hint={`${nf.format(summary.withBarcode)} alimento(s) com código de barras`}
          icon={Tag}
        />
        <StatCard
          label="Favoritos"
          value={nf.format(summary.favorites)}
          hint={`${nf.format(summary.archived)} arquivado(s)`}
          icon={Tag}
        />
      </div>

      {/* ══ Tipos de refeição ══ */}
      <MealTypesCard mealTypes={mealTypes} pending={pending} run={run} />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ══ Categorias de receita ══ */}
        <SimpleListCard
          title="Categorias de receita"
          description="Como você agrupa suas receitas. Excluir uma categoria NÃO exclui receita: elas voltam para “sem categoria”."
          icon={ChefHat}
          emptyLabel="Nenhuma categoria de receita ainda."
          placeholder="Ex.: Marmitas"
          items={recipeCategories.map((c) => ({ id: c.id, name: c.name }))}
          pending={pending}
          onCreate={(name) => run(() => saveRecipeCategory({ name }), "Categoria criada.")}
          onRename={(id, name) =>
            run(() => saveRecipeCategory({ name }, id), "Categoria renomeada.")
          }
          onDelete={(id, name) => {
            if (
              !confirm(
                `Excluir a categoria “${name}”? As receitas que estavam nela continuam existindo, sem categoria. Nada é apagado.`,
              )
            ) {
              return;
            }
            run(() => deleteRecipeCategory(id), "Categoria excluída.");
          }}
        />

        {/* ══ Etiquetas de alimento ══ */}
        <SimpleListCard
          title="Etiquetas de alimento"
          description="Marcadores livres para filtrar o catálogo (“sem lactose”, “da feira”…). Excluir uma etiqueta não exclui alimento nenhum."
          icon={Tag}
          emptyLabel="Nenhuma etiqueta ainda."
          placeholder="Ex.: Sem lactose"
          items={tags.map((t) => ({ id: t.id, name: t.name }))}
          pending={pending}
          onCreate={(name) => run(() => saveNutritionTag({ name }), "Etiqueta criada.")}
          onRename={(id, name) =>
            run(() => saveNutritionTag({ name }, id), "Etiqueta renomeada.")
          }
          onDelete={(id, name) => {
            if (
              !confirm(
                `Excluir a etiqueta “${name}”? Os alimentos marcados com ela continuam no catálogo, apenas sem a etiqueta.`,
              )
            ) {
              return;
            }
            run(() => deleteNutritionTag(id), "Etiqueta excluída.");
          }}
        />
      </div>

      {/* ══ Fontes nutricionais ══ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="size-4" />
            Fontes nutricionais
          </CardTitle>
          <CardDescription>
            De onde vem cada número do catálogo. Nenhum valor nutricional é inventado pelo
            sistema — fonte nova entra pelo mesmo pipeline, com a licença registrada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma fonte cadastrada.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {sources.map((source) => {
                const contagem = summary.sources.find((s) => s.name === source.name);
                return (
                  <li key={source.id} className="space-y-1.5 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 truncate text-sm font-medium">
                        {source.name}
                      </span>
                      {source.edition && (
                        <span className="text-xs text-muted-foreground">{source.edition}</span>
                      )}
                      {source.isOfficial && (
                        <Badge variant="secondary" className="text-[10px]">
                          Oficial
                        </Badge>
                      )}
                      {contagem && (
                        <span className="ms-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                          {nf.format(contagem.foods)} alimento
                          {contagem.foods === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    {source.publisher && (
                      <p className="text-xs text-muted-foreground">{source.publisher}</p>
                    )}
                    {/* ⛔ A citação é EXIGÊNCIA DE LICENÇA, não enfeite. */}
                    {source.citation && (
                      <p className="rounded-md bg-muted/50 p-2 text-xs leading-relaxed text-muted-foreground">
                        {source.citation}
                      </p>
                    )}
                    {source.licenseNote && (
                      <p className="text-[11px] text-muted-foreground">{source.licenseNote}</p>
                    )}
                    {source.referenceUrl && (
                      <a
                        href={source.referenceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs underline underline-offset-2"
                      >
                        Página da fonte
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ══ Onde ficam as outras preferências ══ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Outras preferências do módulo</CardTitle>
          <CardDescription>
            Estas vivem na tela em que são usadas — é lá que fazem sentido.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <ShortcutLink
            href="/nutricao/compras"
            icon={ListOrdered}
            title="Corredores do mercado"
            description="A ordem em que a lista de compras é agrupada."
          />
          <ShortcutLink
            href="/nutricao/medidas"
            icon={Ruler}
            title="Tipos de medida"
            description="Peso, circunferências e composição corporal."
          />
          <ShortcutLink
            href="/nutricao/metas"
            icon={UtensilsCrossed}
            title="Perfil e metas"
            description="Perfil nutricional e metas com histórico por período."
          />
          <ShortcutLink
            href="/configuracoes"
            icon={Bell}
            title="Notificações da Dieta"
            description="Ligue ou desligue cada aviso do módulo, um a um."
          />
        </CardContent>
      </Card>
    </div>
  );
}

/* ───────────────────────────── Tipos de refeição ───────────────────────────── */

function MealTypesCard({
  mealTypes,
  pending,
  run,
}: {
  mealTypes: MealType[];
  pending: boolean;
  run: (action: () => Promise<{ ok: boolean; error?: string }>, success: string) => void;
}) {
  const [name, setName] = React.useState("");
  const [time, setTime] = React.useState("");

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= mealTypes.length) return;
    const ids = mealTypes.map((t) => t.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(target, 0, moved);
    run(() => reorderMealTypes({ ids }), "Ordem das refeições atualizada.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UtensilsCrossed className="size-4" />
          Tipos de refeição
        </CardTitle>
        <CardDescription>
          São dado seu, não do sistema: renomeie, reordene e desative como quiser. A ordem aqui
          é a ordem do seu dia no diário e no planejamento.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y rounded-lg border">
          {mealTypes.length === 0 && (
            <li className="p-4 text-center text-sm text-muted-foreground">
              Nenhum tipo de refeição.
            </li>
          )}
          {mealTypes.map((type, index) => (
            <li key={type.id} className="flex flex-wrap items-center gap-2 p-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm">
                  {type.icon && <span aria-hidden>{type.icon}</span>}
                  {type.name}
                  {!type.isActive && (
                    <Badge variant="outline" className="text-[10px]">
                      Desativada
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {type.defaultTime
                    ? `Horário previsto: ${shortTime(type.defaultTime)}`
                    : "Sem horário previsto — nunca vira “atrasada”"}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Switch
                    id={`ativo-${type.id}`}
                    checked={type.isActive}
                    disabled={pending}
                    onCheckedChange={(checked) =>
                      run(
                        () =>
                          saveMealType(
                            {
                              name: type.name,
                              icon: type.icon ?? "",
                              color: type.color ?? "",
                              default_time: type.defaultTime ?? "",
                              is_active: checked,
                            },
                            type.id,
                          ),
                        checked ? "Refeição ativada." : "Refeição desativada.",
                      )
                    }
                  />
                  <Label htmlFor={`ativo-${type.id}`} className="text-xs font-normal">
                    Ativa
                  </Label>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Mover ${type.name} para cima`}
                  disabled={pending || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Mover ${type.name} para baixo`}
                  disabled={pending || index === mealTypes.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  aria-label={`Excluir ${type.name}`}
                  disabled={pending}
                  onClick={() => {
                    // O servidor RECUSA se houver uso, com a contagem e a alternativa. A
                    // confirmação aqui não promete o que ele pode negar.
                    if (
                      !confirm(
                        `Excluir “${type.name}”? Só é possível se ela nunca tiver sido usada no diário ou no planejamento — se já foi, desative em vez de excluir.`,
                      )
                    ) {
                      return;
                    }
                    run(() => deleteMealType(type.id), "Refeição excluída.");
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <form
          className="grid gap-2 sm:grid-cols-[1fr_9rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const value = name.trim();
            if (!value) return;
            run(
              () => saveMealType({ name: value, default_time: time || "" }),
              "Tipo de refeição criado.",
            );
            setName("");
            setTime("");
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="refeicao-nome" className="text-xs">
              Nova refeição
            </Label>
            <Input
              id="refeicao-nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Ceia"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refeicao-hora" className="text-xs">
              Horário (opcional)
            </Label>
            <Input
              id="refeicao-hora"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={pending || !name.trim()}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Adicionar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/* ───────────────────────────── Lista simples (nome só) ───────────────────────────── */

function SimpleListCard({
  title,
  description,
  icon: Icon,
  emptyLabel,
  placeholder,
  items,
  pending,
  onCreate,
  onRename,
  onDelete,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  emptyLabel: string;
  placeholder: string;
  items: { id: string; name: string }[];
  pending: boolean;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const [novo, setNovo] = React.useState("");
  const [editing, setEditing] = React.useState<Record<string, string>>({});

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y rounded-lg border">
          {items.length === 0 && (
            <li className="p-4 text-center text-sm text-muted-foreground">{emptyLabel}</li>
          )}
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 p-2">
              <Input
                aria-label={`Nome de ${item.name}`}
                value={editing[item.id] ?? item.name}
                onChange={(e) =>
                  setEditing((current) => ({ ...current, [item.id]: e.target.value }))
                }
                onBlur={() => {
                  const value = (editing[item.id] ?? item.name).trim();
                  if (!value || value === item.name) {
                    setEditing((current) => {
                      const next = { ...current };
                      delete next[item.id];
                      return next;
                    });
                    return;
                  }
                  onRename(item.id, value);
                }}
                className="h-9"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={`Excluir ${item.name}`}
                disabled={pending}
                onClick={() => onDelete(item.id, item.name)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>

        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const value = novo.trim();
            if (!value) return;
            onCreate(value);
            setNovo("");
          }}
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor={`novo-${title}`} className="text-xs">
              Adicionar
            </Label>
            <Input
              id={`novo-${title}`}
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              placeholder={placeholder}
            />
          </div>
          <Button type="submit" disabled={pending || !novo.trim()}>
            <Plus className="size-4" />
            Criar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ShortcutLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-muted"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </Link>
  );
}
