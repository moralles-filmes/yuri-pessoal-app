import type { Metadata } from "next";
import Link from "next/link";
import { Dumbbell, Layers, Settings, Star, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import {
  TRAINING_BASE_PATH,
  TRAINING_SECTIONS,
  MUSCLE_REGION_LABELS,
} from "@/lib/training/constants";
import {
  getEquipment,
  getExercises,
  getMuscleGroups,
  getTrainingPreferences,
  summarizeCatalog,
} from "@/lib/training/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Treinos" };

/**
 * Fase 17-A — Visão geral do módulo Treinos.
 *
 * Mostra o que EXISTE hoje, não o que existirá. Enquanto não houver sessão registrada (17-C),
 * seria desonesto exibir "0 treinos esta semana" como se fosse um dado — não há de onde tirar
 * esse número ainda. Então a tela apresenta o estado real do catálogo e diz, com todas as
 * letras, em que subfase cada indicador chega.
 */
export default async function TreinosPage() {
  const [exercises, groups, equipment, preferences] = await Promise.all([
    getExercises(),
    getMuscleGroups(),
    getEquipment(),
    getTrainingPreferences(),
  ]);

  const summary = summarizeCatalog(exercises);
  const groupById = new Map(groups.map((g) => [g.id, g]));

  const topGroups = Object.entries(summary.byMuscleGroup)
    .map(([id, count]) => ({ group: groupById.get(id), count }))
    .filter((item): item is { group: NonNullable<typeof item.group>; count: number } =>
      Boolean(item.group),
    )
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const upcoming = TRAINING_SECTIONS.filter((section) => section.status !== "pronto");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Treinos"
        description="Musculação, hipertrofia, força e condicionamento — do catálogo de exercícios ao histórico."
      >
        <Button asChild size="sm">
          <Link href={`${TRAINING_BASE_PATH}/exercicios`}>
            <Dumbbell className="size-4" />
            Abrir catálogo
          </Link>
        </Button>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Exercícios disponíveis"
          value={String(summary.totalExercises)}
          icon={Dumbbell}
          hint={`${summary.systemExercises} da base · ${summary.ownExercises} seus`}
        />
        <StatCard
          label="Favoritos"
          value={String(summary.favorites)}
          icon={Star}
          hint={summary.archived > 0 ? `${summary.archived} arquivados` : "Nenhum arquivado"}
        />
        <StatCard
          label="Grupos musculares"
          value={String(groups.length)}
          icon={Layers}
          hint="Base do sistema + os seus"
        />
        <StatCard
          label="Equipamentos"
          value={String(equipment.length)}
          icon={Wrench}
          hint={`Incremento padrão: ${preferences.defaultIncrementKg} ${preferences.weightUnit}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Catálogo por grupo muscular</CardTitle>
            <CardDescription>
              Contagem pelo grupo <strong>principal</strong> de cada exercício. Um exercício
              aparece uma vez só, mesmo trabalhando vários músculos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum exercício no catálogo ainda.</p>
            ) : (
              <ul className="space-y-2">
                {topGroups.map(({ group, count }) => (
                  <li key={group.id}>
                    <Link
                      href={`${TRAINING_BASE_PATH}/exercicios?grupo=${group.id}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">{group.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {MUSCLE_REGION_LABELS[group.region]}
                      </span>
                      <span className="w-8 shrink-0 text-right text-sm font-medium tabular-nums">
                        {count}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">De onde vem a base de exercícios</CardTitle>
            <CardDescription>Procedência declarada, como no catálogo de alimentos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Os {summary.systemExercises} exercícios da base são{" "}
              <strong className="text-foreground">conteúdo autoral</strong>, produzido para este
              projeto. Nada foi copiado de aplicativos de treino: sem imagem, sem vídeo, sem texto
              de instrução e sem banco de dados de terceiros.
            </p>
            <p>
              A classificação (grupo muscular, equipamento, padrão de movimento) é uma aproximação
              útil para organizar treino — não é laudo biomecânico. Você pode duplicar qualquer
              exercício da base e ajustar a classificação na sua cópia.
            </p>
            <p className="text-xs">
              Procedência completa em <code>data/training/exercise-base/ATTRIBUTION.md</code>.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">O que ainda vem</CardTitle>
          <CardDescription>
            O módulo é entregue em 6 subfases. Cada seção abaixo já tem rota e diz em qual delas
            chega — nada de link morto nem de tela que finge funcionar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            {upcoming.map((section) => (
              <li
                key={section.slug}
                className="flex items-start justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{section.title}</p>
                  <p className="text-xs text-muted-foreground">{section.description}</p>
                </div>
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {section.phase.replace("Subfase ", "")}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`${TRAINING_BASE_PATH}/exercicios`}>
            <Dumbbell className="size-4" />
            Exercícios
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`${TRAINING_BASE_PATH}/configuracoes`}>
            <Settings className="size-4" />
            Configurações
          </Link>
        </Button>
      </div>
    </div>
  );
}
