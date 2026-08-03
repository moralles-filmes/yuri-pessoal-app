import type { Metadata } from "next";
import Link from "next/link";
import { Apple, BookOpen, Database, Ruler, Star, Utensils } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import {
  getFoodCategories,
  getFoods,
  getNutrientValueCount,
  getOfficialSources,
  summarizeCatalog,
} from "@/lib/nutrition/queries";
import { NUTRITION_SECTIONS } from "@/lib/nutrition/constants";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dieta e Alimentação" };

/**
 * Fase 16-A — Visão geral do módulo.
 *
 * Nesta subfase o painel mostra o **estado real do catálogo** e a procedência da base. Os
 * indicadores do dia (calorias consumidas, refeições pendentes, aderência) chegam na
 * Subfase B, quando existir diário — inventar um card vazio aqui só ocuparia espaço.
 */
export default async function NutricaoPage() {
  const [foods, categories, nutrientValues, sources] = await Promise.all([
    getFoods(),
    getFoodCategories(),
    getNutrientValueCount(),
    getOfficialSources(),
  ]);

  const summary = summarizeCatalog(foods, categories, nutrientValues);
  const proximaSubfase = NUTRITION_SECTIONS.filter((section) => section.status === "proxima");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dieta e Alimentação"
        description="Planeje, registre e acompanhe sua alimentação."
      >
        <Button asChild>
          <Link href="/nutricao/alimentos">
            <Apple className="size-4" />
            Ver alimentos
          </Link>
        </Button>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Alimentos no catálogo"
          value={summary.total.toLocaleString("pt-BR")}
          icon={Apple}
          hint={`${summary.system.toLocaleString("pt-BR")} da base · ${summary.own.toLocaleString("pt-BR")} seus`}
        />
        <StatCard
          label="Valores nutricionais"
          value={summary.nutrientValues.toLocaleString("pt-BR")}
          icon={Database}
          hint={`${summary.categories} categorias`}
        />
        <StatCard
          label="Favoritos"
          value={summary.favorites.toLocaleString("pt-BR")}
          icon={Star}
          hint="Aparecem primeiro na busca"
        />
        <StatCard
          label="Com código de barras"
          value={summary.withBarcode.toLocaleString("pt-BR")}
          icon={BookOpen}
          hint="Produtos industrializados"
        />
      </div>

      {/* Procedência da base — a licença da TACO exige a citação visível. */}
      {sources.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Base nutricional</CardTitle>
            <CardDescription>
              De onde vêm os números. Nenhum valor foi estimado, arredondado para zero ou
              gerado automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sources.map((source) => {
              const count = summary.sources.find((item) => item.name === source.name)?.foods ?? 0;
              return (
                <div key={source.id} className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{source.name}</p>
                    {source.edition && <Badge variant="secondary">{source.edition}</Badge>}
                    <Badge variant="outline">
                      {count.toLocaleString("pt-BR")} alimentos
                    </Badge>
                  </div>
                  {source.citation && (
                    <p className="text-xs text-muted-foreground">{source.citation}</p>
                  )}
                  {source.licenseNote && (
                    <p className="text-[11px] text-muted-foreground/80">{source.licenseNote}</p>
                  )}
                  {source.referenceUrl && (
                    <a
                      href={source.referenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary underline-offset-4 hover:underline"
                    >
                      Página oficial da fonte
                    </a>
                  )}
                </div>
              );
            })}
            <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              Um nutriente ausente significa que a fonte <strong>não o analisou</strong> — não
              que ele seja zero. O sistema marca a diferença em toda soma, e diz quando um
              total é parcial.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">O que vem a seguir</CardTitle>
          <CardDescription>
            A fundação (catálogo, medidas caseiras e núcleo de cálculo) está pronta. As telas
            de uso diário chegam nas próximas subfases.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {proximaSubfase.map((section) => (
            <Link
              key={section.slug}
              href={section.href}
              className="rounded-lg border p-3 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <p className="text-sm font-medium">{section.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{section.description}</p>
              <Badge variant="secondary" className="mt-2 text-[10px]">
                {section.phase}
              </Badge>
            </Link>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Ruler className="size-4 text-primary" />
              Medidas caseiras
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            A TACO não publica medidas caseiras por alimento, então nenhuma foi presumida —
            uma colher de arroz e uma de azeite não pesam o mesmo. Cadastre as suas no detalhe
            de cada alimento para registrar sem precisar pesar.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Utensils className="size-4 text-primary" />
              Alimentos próprios
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Os alimentos da base são somente leitura, para o dado oficial nunca ser reescrito.
            Duplique qualquer um deles e você ganha uma cópia editável, com a origem
            registrada.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
