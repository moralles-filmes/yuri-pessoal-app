"use client";

/**
 * Fase 17-D — Recordes (cliente).
 *
 * ═══════════ POR QUE EXISTE UM BOTÃO DE RECALCULAR ═══════════
 *
 * O recorde é **derivado** do histórico: ele é reconstruído ao finalizar e ao excluir uma
 * sessão. O botão existe para o caso de o usuário ter corrigido séries antigas à mão ou de uma
 * finalização ter falhado no meio — reconstruir é idempotente e não inventa nada: só volta a
 * ler o histórico e a comparar.
 *
 * A tela deixa explícito que **1RM é estimativa** e mostra a marca anterior de cada recorde.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { shortDateLabelIso } from "@/lib/training/history";
import { TRAINING_BASE_PATH, type OneRmFormula } from "@/lib/training/constants";
import {
  formatRecordValue,
  previousMarkLabel,
  RECORD_TYPES,
  RECORD_TYPE_HINTS,
  RECORD_TYPE_LABELS,
  recordTypeLabel,
  type RecordType,
} from "@/lib/training/records";
import { DeepLinkHighlight } from "@/components/shared/deep-link-highlight";
import type { PersonalRecord } from "@/lib/training/history-queries";
import { rebuildPersonalRecords } from "@/lib/actions/training-history";

type GroupMode = "exercicio" | "tipo";

export function RecordsClient({
  records,
  oneRmFormula,
  highlightId = null,
}: {
  records: PersonalRecord[];
  oneRmFormula: OneRmFormula;
  /** 17-F — recorde aberto por deep-link (`?recorde=`), destacado na lista. */
  highlightId?: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<GroupMode>("exercicio");
  const [busy, setBusy] = React.useState(false);

  const general = records.filter((record) => record.scope === "geral");
  const byExercise = records.filter((record) => record.scope === "exercicio");

  async function rebuild() {
    setBusy(true);
    const result = await rebuildPersonalRecords({});
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const { created, improved, removed } = result.data;
    toast.success(
      created + improved + removed === 0
        ? "Tudo já estava em dia: nenhum recorde mudou."
        : `Recordes atualizados: ${created} novo(s), ${improved} superado(s), ${removed} removido(s).`,
    );
    router.refresh();
  }

  const groups = React.useMemo(() => {
    if (mode === "tipo") {
      return RECORD_TYPES.filter((type) => byExercise.some((record) => record.recordType === type))
        .map((type) => ({
          key: type,
          label: RECORD_TYPE_LABELS[type],
          hint: RECORD_TYPE_HINTS[type],
          records: byExercise
            .filter((record) => record.recordType === type)
            .sort((a, b) => (a.exerciseName ?? "").localeCompare(b.exerciseName ?? "", "pt-BR")),
        }));
    }

    const byName = new Map<string, PersonalRecord[]>();
    for (const record of byExercise) {
      const key = record.exerciseName ?? "Exercício removido";
      const list = byName.get(key) ?? [];
      list.push(record);
      byName.set(key, list);
    }

    return [...byName.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }))
      .map(([name, list]) => ({
        key: name,
        label: name,
        hint: null as string | null,
        records: list.sort((a, b) =>
          RECORD_TYPES.indexOf(a.recordType as RecordType) -
          RECORD_TYPES.indexOf(b.recordType as RecordType),
        ),
      }));
  }, [byExercise, mode]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recordes"
        description="As melhores marcas consolidadas do seu histórico, sem duplicidade e com a marca anterior preservada."
      >
        <Select value={mode} onValueChange={(value) => setMode(value as GroupMode)}>
          <SelectTrigger className="h-9 w-[180px]" aria-label="Agrupar recordes">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="exercicio">Por exercício</SelectItem>
            <SelectItem value="tipo">Por tipo de recorde</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={rebuild} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Recalcular
        </Button>
      </PageHeader>

      {records.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="Nenhum recorde ainda"
          description="Os recordes são calculados a partir dos treinos registrados. Assim que você finalizar uma sessão, as marcas aparecem aqui."
        >
          <Button asChild>
            <Link href={`${TRAINING_BASE_PATH}/historico`}>Ver histórico</Link>
          </Button>
        </EmptyState>
      ) : (
        <>
          {general.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Constância</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {general.map((record) => (
                  <DeepLinkHighlight
                    key={record.id}
                    id={`recorde-${record.id}`}
                    active={record.id === highlightId}
                    className="rounded-xl border border-border bg-card/60 p-3"
                  >
                    <p className="text-sm text-muted-foreground">
                      {RECORD_TYPE_LABELS[record.recordType]}
                    </p>
                    <p className="text-xl font-semibold tabular-nums">
                      {formatRecordValue(record.value, record.unit)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {shortDateLabelIso(record.achievedOn)}
                    </p>
                  </DeepLinkHighlight>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            {groups.map((group) => (
              <Card key={group.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{group.label}</CardTitle>
                  {group.hint && <p className="text-xs text-muted-foreground">{group.hint}</p>}
                </CardHeader>
                <CardContent className="space-y-2">
                  {group.records.map((record) => (
                    <DeepLinkHighlight
                      key={record.id}
                      id={`recorde-${record.id}`}
                      active={record.id === highlightId}
                    >
                      <RecordRow record={record} mode={mode} />
                    </DeepLinkHighlight>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            O 1RM estimado usa a fórmula <strong>{oneRmFormula}</strong>, escolhida nas
            configurações do módulo — é estimativa, não medição, e o sistema não sugere tentar
            carga máxima. Séries de aquecimento, puladas e canceladas não geram recorde, e
            empate não cria marca nova.
          </p>
        </>
      )}
    </div>
  );
}

function RecordRow({ record, mode }: { record: PersonalRecord; mode: GroupMode }) {
  const previous = previousMarkLabel(record.previousValue, record.previousAchievedOn, record.unit);

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 pb-2 last:border-0 last:pb-0">
      <div className="min-w-[160px] flex-1">
        <p className="text-sm font-medium">
          {mode === "tipo"
            ? record.exerciseName ?? "Exercício removido"
            : recordTypeLabel(record.recordType, record.referenceWeightKg)}
        </p>
        <p className="text-xs text-muted-foreground">
          {shortDateLabelIso(record.achievedOn)}
          {record.reps !== null && ` · ${record.reps} rep`}
          {record.oneRmFormula && ` · ${record.oneRmFormula}`}
          {record.exerciseId === null && " · exercício removido do catálogo"}
        </p>
        {previous && <p className="text-xs text-muted-foreground">{previous}</p>}
      </div>

      <div className="flex items-center gap-2">
        {record.oneRmFormula && (
          <Badge variant="outline" className="text-[10px]">
            estimativa
          </Badge>
        )}
        <p className="text-lg font-semibold tabular-nums">
          {formatRecordValue(record.value, record.unit)}
        </p>
        {record.sessionId && (
          <Button variant="ghost" size="sm" asChild className="h-7 px-2 text-xs">
            <Link href={`${TRAINING_BASE_PATH}/historico/${record.sessionId}`}>Ver treino</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
