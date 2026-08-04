/**
 * Fase 16-E — Dieta e Alimentação · Exportação em CSV (PURO, sem I/O).
 *
 * Monta as LINHAS; quem vira texto é `toCsv` (`src/lib/reports/csv.ts`, Fase 14, separador
 * ';' e escape RFC 4180) e quem baixa é `downloadCsv` (`src/lib/reports/download.ts`, com BOM
 * para o Excel reconhecer UTF-8). Nenhum dos dois é reimplementado aqui.
 *
 * ══ A REGRA QUE UM CSV FACILMENTE QUEBRARIA ══
 * CÉLULA VAZIA ≠ ZERO. Um nutriente não analisado sai como célula VAZIA, nunca como "0" — no
 * Excel, a diferença entre elas é a diferença entre "não sei" e "medi e deu zero", e uma
 * planilha que soma zeros inventados produz um número que ninguém consegue mais auditar.
 * Quando o valor é "traço", a célula traz o rótulo em vez de um número.
 *
 * Números saem no padrão pt-BR (vírgula decimal), coerente com o separador ';'.
 */
import { NUTRIENT_VALUE_STATE_SHORT, type NutrientTotalQuality } from "./constants";
import { formatMeasurement } from "@/lib/body/measurements";
import { roundForDisplay, TOTAL_QUALITY_LABELS } from "./calc";
import { longDateLabel } from "./calendar";
import type { DailyReport, NutrientRow, SubstitutionRanking, FoodRanking } from "./reports";
import type { FoodListItem, NutrientDefinition } from "./types";
import type { MeasurementType, MeasurementWithType } from "@/lib/body/types";
import { MEASUREMENT_CONDITION_LABELS } from "@/lib/body/constants";

/** Número em pt-BR. `null`/indefinido vira CÉLULA VAZIA — jamais 0. */
function num(value: number | null | undefined, precision = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return roundForDisplay(value, precision).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision,
  });
}

const yesNo = (value: boolean): string => (value ? "sim" : "não");

/* ═══════════════════════════ Catálogo de alimentos ═══════════════════════════ */

export const FOOD_CATALOG_HEADERS = [
  "Nome",
  "Marca",
  "Categoria",
  "Tipo",
  "Preparo",
  "Base",
  "Unidade",
  "Energia (kcal)",
  "Proteína (g)",
  "Carboidrato (g)",
  "Lipídios (g)",
  "Fibra (g)",
  "Sódio (mg)",
  "Açúcares (g)",
  "Saturadas (g)",
  "Nutrientes cadastrados",
  "Fonte",
  "Código na fonte",
  "Origem",
  "Favorito",
  "Arquivado",
  "Código de barras",
  "Vezes usado",
];

/**
 * Catálogo de alimentos para planilha — a pendência que a 16-D deixou para cá.
 *
 * Os macros vêm da view pivotada (`macros`), e cada um deles é `number | null`: alimento sem
 * o nutriente publicado sai com a célula em branco. É por isso que a soma de uma coluna no
 * Excel pode não bater com o número de linhas, e está certo assim.
 */
export function foodCatalogRows(foods: FoodListItem[]): Record<string, unknown>[] {
  return foods.map((food) => ({
    Nome: food.name,
    Marca: food.brand ?? "",
    Categoria: food.categoryName ?? "",
    Tipo: food.foodType,
    Preparo: food.preparationState,
    Base: num(food.baseQuantity, 2),
    Unidade: food.baseUnit,
    "Energia (kcal)": num(food.macros.energiaKcal, 0),
    "Proteína (g)": num(food.macros.proteina),
    "Carboidrato (g)": num(food.macros.carboidrato),
    "Lipídios (g)": num(food.macros.lipidios),
    "Fibra (g)": num(food.macros.fibra),
    "Sódio (mg)": num(food.macros.sodio),
    "Açúcares (g)": num(food.macros.acucares),
    "Saturadas (g)": num(food.macros.saturadas),
    "Nutrientes cadastrados": food.macros.nutrientsAvailable,
    Fonte: food.source?.name ?? "",
    "Código na fonte": food.sourceFoodCode ?? "",
    Origem: food.isSystemFood ? "base do sistema" : "próprio",
    Favorito: yesNo(food.isFavorite),
    Arquivado: yesNo(food.isArchived),
    "Código de barras": food.barcode ?? "",
    "Vezes usado": food.useCount,
  }));
}

/**
 * Linha de atribuição obrigatória do CSV do catálogo.
 *
 * A base TACO exige citação para reprodução (regra 6 do módulo). Um CSV que sai do sistema
 * sem dizer de onde vieram os números é exatamente a reprodução sem crédito que a licença
 * proíbe — então a citação viaja junto do arquivo.
 */
export function catalogAttributionLines(
  sources: { name: string; edition: string | null; citation: string | null }[],
): string[] {
  const lines = ["Fontes dos dados nutricionais deste arquivo:"];
  for (const source of sources) {
    const edition = source.edition ? ` (${source.edition})` : "";
    lines.push(`- ${source.name}${edition}${source.citation ? ` — ${source.citation}` : ""}`);
  }
  lines.push(
    "Alimentos marcados como 'próprio' foram cadastrados pelo usuário e não pertencem a nenhuma fonte oficial.",
  );
  return lines;
}

/* ═══════════════════════════ Relatório diário ═══════════════════════════ */

export const DAILY_REPORT_HEADERS = [
  "Data",
  "Registrou",
  "Refeições",
  "Itens",
  "Energia (kcal)",
  "Meta de energia",
  "% da meta",
  "Proteína (g)",
  "Carboidrato (g)",
  "Lipídios (g)",
  "Fibra (g)",
  "Aderência (%)",
  "Qualidade do total",
];

const QUALITY_CELL: Record<NutrientTotalQuality, string> = TOTAL_QUALITY_LABELS;

/**
 * Uma linha por dia do período, inclusive os dias sem registro.
 *
 * O dia sem registro sai com "Registrou: não" e as colunas de valor VAZIAS. Se saísse com
 * zeros, qualquer média feita na planilha ficaria errada — e o usuário não teria como saber.
 */
export function dailyReportRows(
  daily: DailyReport[],
  codes: { energia: string; proteina: string; carboidrato: string; lipidios: string; fibra: string },
): Record<string, unknown>[] {
  return daily.map((day) => {
    const energy = day.totals[codes.energia];
    const target = day.targets[codes.energia]?.amount ?? null;
    const has = day.hasRecord;

    return {
      Data: day.date,
      Registrou: yesNo(has),
      Refeições: day.meals,
      Itens: day.entries,
      "Energia (kcal)": has ? num(energy?.amount ?? 0, 0) : "",
      "Meta de energia": num(target, 0),
      "% da meta":
        has && target !== null && target > 0 ? num(((energy?.amount ?? 0) / target) * 100, 1) : "",
      "Proteína (g)": has ? num(day.totals[codes.proteina]?.amount ?? 0, 1) : "",
      "Carboidrato (g)": has ? num(day.totals[codes.carboidrato]?.amount ?? 0, 1) : "",
      "Lipídios (g)": has ? num(day.totals[codes.lipidios]?.amount ?? 0, 1) : "",
      "Fibra (g)": has ? num(day.totals[codes.fibra]?.amount ?? 0, 1) : "",
      "Aderência (%)": has ? num(day.adherence.percent, 1) : "",
      "Qualidade do total": has && energy ? QUALITY_CELL[energy.quality] : "",
    };
  });
}

/* ═══════════════════════════ Nutrientes do período ═══════════════════════════ */

export const NUTRIENT_REPORT_HEADERS = [
  "Nutriente",
  "Grupo",
  "Unidade",
  "Total no período",
  "Média por dia registrado",
  "Meta média",
  "% da meta",
  "Dias com valor",
  "Dias com dado incompleto",
  "Qualidade",
];

export function nutrientReportRows(
  rows: NutrientRow[],
  definitions: Record<string, NutrientDefinition>,
): Record<string, unknown>[] {
  return rows.map((row) => {
    const precision = definitions[row.code]?.precision ?? 1;
    return {
      Nutriente: row.name,
      Grupo: row.group,
      Unidade: row.unit,
      "Total no período": num(row.amount, precision),
      "Média por dia registrado": num(row.averagePerDay, precision),
      "Meta média": num(row.target, precision),
      "% da meta": num(row.percent, 1),
      "Dias com valor": row.daysWithValue,
      // A coluna que impede a leitura ingênua do total.
      "Dias com dado incompleto": row.daysIncomplete,
      Qualidade: QUALITY_CELL[row.quality],
    };
  });
}

/* ═══════════════════════════ Rankings ═══════════════════════════ */

export const TOP_FOODS_HEADERS = [
  "Alimento",
  "Tipo de registro",
  "Vezes",
  "Dias",
  "Energia total (kcal)",
  "Ocorrências sem energia",
];

export function topFoodsRows(rows: FoodRanking[]): Record<string, unknown>[] {
  return rows.map((row) => ({
    Alimento: row.label,
    "Tipo de registro": row.kind,
    Vezes: row.times,
    Dias: row.days,
    // Vazio quando NENHUMA ocorrência tinha energia — não é "consumiu 0 kcal".
    "Energia total (kcal)": num(row.energyKcal, 0),
    "Ocorrências sem energia": row.withoutEnergy,
  }));
}

export const SUBSTITUTION_HEADERS = [
  "Item original",
  "Alternativa",
  "Vezes",
  "Diferença de energia (kcal)",
  "Diferença de proteína (g)",
  "Trocas sem diferença registrada",
  "Última troca",
];

export function substitutionRows(rows: SubstitutionRanking[]): Record<string, unknown>[] {
  return rows.map((row) => ({
    "Item original": row.originalLabel,
    Alternativa: row.replacementLabel,
    Vezes: row.times,
    "Diferença de energia (kcal)": num(row.deltaEnergyKcal, 0),
    "Diferença de proteína (g)": num(row.deltaProteinG, 1),
    "Trocas sem diferença registrada": row.withoutDelta,
    "Última troca": row.lastAppliedOn,
  }));
}

/* ═══════════════════════════ Medidas corporais ═══════════════════════════ */

export const MEASUREMENT_HEADERS = [
  "Data",
  "Horário",
  "Medida",
  "Valor",
  "Unidade",
  "Condição",
  "Origem",
  "Observação",
];

/**
 * Histórico de medidas para planilha.
 *
 * A unidade sai da MEDIÇÃO (congelada na gravação), não do tipo atual: um histórico exportado
 * depois de o usuário trocar a unidade do tipo continuaria dizendo a verdade sobre cada linha.
 */
export function measurementRows(measurements: MeasurementWithType[]): Record<string, unknown>[] {
  return measurements.map((item) => ({
    Data: item.measuredOn,
    Horário: item.measuredAt ?? "",
    Medida: item.typeName,
    Valor: num(item.value, item.typeDecimals),
    Unidade: item.unit,
    Condição: item.condition ? MEASUREMENT_CONDITION_LABELS[item.condition] : "",
    Origem: item.source,
    Observação: item.note ?? "",
  }));
}

/* ═══════════════════════════ Nome de arquivo ═══════════════════════════ */

/**
 * Nome do arquivo exportado. `hoje` é INJETADO: um arquivo baixado às 22h não pode sair com a
 * data de amanhã (o processo pode estar em UTC — ver a seção de fuso do CLAUDE.md).
 */
export function exportFileName(kind: string, from: string, to: string): string {
  return `${kind}-${from}-a-${to}.csv`;
}

/** Cabeçalho textual do relatório, para a primeira linha do arquivo e para a tela. */
export function periodTitle(from: string, to: string): string {
  return from === to
    ? longDateLabel(from)
    : `${longDateLabel(from)} até ${longDateLabel(to)}`;
}

/* ═══════════════════════════ Leitura textual (acessibilidade) ═══════════════════════════ */

/**
 * Descrição textual de uma medição, para leitor de tela e para a tabela que acompanha o
 * gráfico. Regra 6 da subfase: gráfico NUNCA é a única forma de ler o dado.
 */
export function describeMeasurement(item: MeasurementWithType, type?: MeasurementType): string {
  const decimals = type?.decimals ?? item.typeDecimals;
  const parts = [
    `${item.typeName}: ${formatMeasurement(item.value, item.unit, decimals)}`,
    `em ${longDateLabel(item.measuredOn)}`,
  ];
  if (item.measuredAt) parts.push(`às ${item.measuredAt.slice(0, 5)}`);
  if (item.condition) parts.push(`(${MEASUREMENT_CONDITION_LABELS[item.condition].toLowerCase()})`);
  return parts.join(" ");
}

/** Rótulo curto do estado de um nutriente, reusando o vocabulário da 16-A. */
export const valueStateShort = NUTRIENT_VALUE_STATE_SHORT;
