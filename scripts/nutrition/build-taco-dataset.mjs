#!/usr/bin/env node
/**
 * Fase 16-A — Pipeline da base nutricional brasileira (TACO 4ª edição).
 *
 * Lê o arquivo XLSX **oficial** publicado pelo NEPA/UNICAMP e produz um dataset
 * normalizado, versionado e verificável em `data/nutrition/taco-4/`.
 *
 *   node scripts/nutrition/build-taco-dataset.mjs <caminho-do-xlsx>
 *
 * Regras inegociáveis deste script (ver docs/phases/PHASE_16_A_*.md):
 *  • NENHUM valor é digitado à mão nem inferido. Tudo sai da planilha.
 *  • Os quatro marcadores da legenda oficial viram estados distintos, nunca zero:
 *      (em branco) "análises não solicitadas" → ausência de registro = não disponível
 *      "Tr"        traço                      → estado `traco`
 *      "NA"        não aplicável              → estado `nao_aplicavel`
 *      "*"         "as análises estão sendo reavaliadas" → estado `em_revisao`
 *  • O manifesto guarda o SHA-256 do arquivo de origem — se a fonte mudar, o
 *    checksum muda e a divergência aparece.
 *
 * Licença da fonte: a obra declara "É permitida a reprodução parcial ou total desta
 * obra, desde que citada a fonte." Ver data/nutrition/taco-4/ATTRIBUTION.md.
 */
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = resolve(ROOT, "data/nutrition/taco-4");

/* ─────────────────────────── Mapa de colunas ───────────────────────────
 * Índices conferidos contra o cabeçalho de cada aba do XLSX oficial. A coluna
 * "Número do Alimento" aparece DUAS vezes por aba (13 na CMVCol, 12 na AG, 11 na
 * de aminoácidos) — é uma repetição de diagramação da planilha e é ignorada.
 */
const SHEET_CMV = "CMVCol taco3";
const SHEET_AG = "AGtaco3";
const SHEET_AA = "Aminoácidos TACO3";

/**
 * `method` por nutriente. A TACO não analisa tudo: energia vem dos fatores de
 * conversão, carboidrato é obtido **por diferença** e a vitamina A soma retinol
 * analítico com o valor calculado a partir dos carotenóides.
 */
const CALCULADO = new Set([
  "energia_kcal",
  "energia_kj",
  "carboidrato",
  "vitamina_a_re",
  "vitamina_a_rae",
]);

/**
 * Carboidrato por diferença pode dar levemente negativo em carnes e pescados
 * magros (a soma dos demais componentes passa de 100 g dentro da incerteza
 * analítica). São valores REAIS da fonte — publicados, não erro de leitura.
 * Preservamos como estão e só toleramos a magnitude que a própria fonte produz.
 */
const NEGATIVE_TOLERANCE = { carboidrato: -0.5 };

const CMV_COLUMNS = [
  [2, "umidade"],
  [3, "energia_kcal"],
  [4, "energia_kj"],
  [5, "proteina"],
  [6, "lipidios"],
  [7, "colesterol"],
  [8, "carboidrato"],
  [9, "fibra"],
  [10, "cinzas"],
  [11, "calcio"],
  [12, "magnesio"],
  [14, "manganes"],
  [15, "fosforo"],
  [16, "ferro"],
  [17, "sodio"],
  [18, "potassio"],
  [19, "cobre"],
  [20, "zinco"],
  [21, "retinol"],
  [22, "vitamina_a_re"],
  [23, "vitamina_a_rae"],
  [24, "tiamina"],
  [25, "riboflavina"],
  [26, "piridoxina"],
  [27, "niacina"],
  [28, "vitamina_c"],
];

const AG_COLUMNS = [
  [2, "ag_saturados"],
  [3, "ag_monoinsaturados"],
  [4, "ag_poliinsaturados"],
  [5, "ag_12_0"],
  [6, "ag_14_0"],
  [7, "ag_16_0"],
  [8, "ag_18_0"],
  [9, "ag_20_0"],
  [10, "ag_22_0"],
  [11, "ag_24_0"],
  [13, "ag_14_1"],
  [14, "ag_16_1"],
  [15, "ag_18_1"],
  [16, "ag_20_1"],
  [17, "ag_18_2_n6"],
  [18, "ag_18_3_n3"],
  [19, "ag_20_4"],
  [20, "ag_20_5"],
  [21, "ag_22_5"],
  [22, "ag_22_6"],
  [23, "ag_18_1t"],
  [24, "ag_18_2t"],
];

const AA_COLUMNS = [
  [2, "triptofano"],
  [3, "treonina"],
  [4, "isoleucina"],
  [5, "leucina"],
  [6, "lisina"],
  [7, "metionina"],
  [8, "cistina"],
  [9, "fenilalanina"],
  [10, "tirosina"],
  [12, "valina"],
  [13, "arginina"],
  [14, "histidina"],
  [15, "alanina"],
  [16, "acido_aspartico"],
  [17, "acido_glutamico"],
  [18, "glicina"],
  [19, "prolina"],
  [20, "serina"],
];

/** As 15 seções da TACO, na ordem em que aparecem na planilha. */
const CATEGORIES = [
  "Cereais e derivados",
  "Verduras, hortaliças e derivados",
  "Frutas e derivados",
  "Gorduras e óleos",
  "Pescados e frutos do mar",
  "Carnes e derivados",
  "Leite e derivados",
  "Bebidas (alcoólicas e não alcoólicas)",
  "Ovos e derivados",
  "Produtos açucarados",
  "Miscelâneas",
  "Outros alimentos industrializados",
  "Alimentos preparados",
  "Leguminosas e derivados",
  "Nozes e sementes",
];

const CATEGORY_SLUGS = {
  "Cereais e derivados": "cereais",
  "Verduras, hortaliças e derivados": "verduras-hortalicas",
  "Frutas e derivados": "frutas",
  "Gorduras e óleos": "gorduras-oleos",
  "Pescados e frutos do mar": "pescados",
  "Carnes e derivados": "carnes",
  "Leite e derivados": "leite-derivados",
  "Bebidas (alcoólicas e não alcoólicas)": "bebidas",
  "Ovos e derivados": "ovos",
  "Produtos açucarados": "produtos-acucarados",
  Miscelâneas: "miscelaneas",
  "Outros alimentos industrializados": "industrializados",
  "Alimentos preparados": "preparados",
  "Leguminosas e derivados": "leguminosas",
  "Nozes e sementes": "nozes-sementes",
};

/**
 * Estado de preparo DERIVADO do nome oficial, com casamento exato de token.
 * Não é um dado novo: é uma leitura conservadora do próprio nome publicado. Se o
 * nome não trouxer um dos termos abaixo, fica `nao_informado` — nunca chutamos.
 */
const PREPARATION_TOKENS = [
  ["cru", "cru"],
  ["crua", "cru"],
  ["cru,", "cru"],
  ["cozido", "cozido"],
  ["cozida", "cozido"],
  ["assado", "assado"],
  ["assada", "assado"],
  ["grelhado", "grelhado"],
  ["grelhada", "grelhado"],
  ["frito", "frito"],
  ["frita", "frito"],
  ["refogado", "refogado"],
  ["refogada", "refogado"],
  ["enlatado", "enlatado"],
  ["enlatada", "enlatado"],
  ["congelado", "congelado"],
  ["congelada", "congelado"],
  ["desidratado", "desidratado"],
  ["desidratada", "desidratado"],
];

/** Normaliza para comparar tokens: minúsculas, sem acento, sem pontuação. */
function tokens(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function preparationState(name) {
  const t = new Set(tokens(name));
  for (const [token, state] of PREPARATION_TOKENS) {
    if (t.has(token.replace(",", ""))) return state;
  }
  return "nao_informado";
}

/** Bebidas/óleos líquidos são medidos em ml; o resto em g. */
function baseUnitFor(category) {
  return category === "Bebidas (alcoólicas e não alcoólicas)" ? "ml" : "g";
}

/**
 * Traduz uma célula da planilha em `{amount, state}`.
 * Vazio → `null` (o chamador NÃO grava linha: ausência = "não disponível").
 */
function cellToValue(cell) {
  if (cell === undefined || cell === null || cell === "") return null;
  if (typeof cell === "number") {
    if (!Number.isFinite(cell)) return null;
    return { amount: Number(cell.toFixed(6)), state: "disponivel" };
  }
  const text = String(cell).trim();
  if (text === "") return null;
  if (/^tr$/i.test(text)) return { amount: null, state: "traco" };
  if (/^na$/i.test(text)) return { amount: null, state: "nao_aplicavel" };
  if (text === "*") return { amount: null, state: "em_revisao" };
  // Algumas células trazem número como texto ("1,2" ou "1.2").
  const parsed = Number(text.replace(",", "."));
  if (Number.isFinite(parsed)) return { amount: Number(parsed.toFixed(6)), state: "disponivel" };
  return null;
}

function rowsOf(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Aba ausente no XLSX: "${sheetName}"`);
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: true });
}

function collect(rows, columns, target, trackCategory) {
  let category = null;
  for (const row of rows) {
    const first = row?.[0];
    if (typeof first === "string" && CATEGORIES.includes(first.trim())) {
      category = first.trim();
      continue;
    }
    if (typeof first !== "number") continue;
    const code = String(first);
    const name = typeof row[1] === "string" ? row[1].trim() : null;
    if (!name) continue;

    let food = target.get(code);
    if (!food) {
      food = { code, name, category: null, nutrients: {} };
      target.set(code, food);
    }
    if (trackCategory && category) food.category = category;

    for (const [index, nutrient] of columns) {
      const value = cellToValue(row[index]);
      if (value) food.nutrients[nutrient] = value;
    }
  }
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error(
      "Uso: node scripts/nutrition/build-taco-dataset.mjs <caminho-do-taco.xlsx>\n" +
        "O XLSX oficial é publicado em https://nepa.unicamp.br/publicacoes/tabela-taco-excel/",
    );
    process.exit(1);
  }

  const buffer = readFileSync(resolve(input));
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const foods = new Map();
  collect(rowsOf(workbook, SHEET_CMV), CMV_COLUMNS, foods, true);
  collect(rowsOf(workbook, SHEET_AG), AG_COLUMNS, foods, false);
  collect(rowsOf(workbook, SHEET_AA), AA_COLUMNS, foods, false);

  const list = [...foods.values()]
    .sort((a, b) => Number(a.code) - Number(b.code))
    .map((food) => {
      if (!food.category) throw new Error(`Alimento ${food.code} ficou sem categoria.`);
      return {
        code: food.code,
        name: food.name,
        category: food.category,
        categorySlug: CATEGORY_SLUGS[food.category],
        preparationState: preparationState(food.name),
        baseQuantity: 100,
        baseUnit: baseUnitFor(food.category),
        nutrients: Object.fromEntries(
          Object.entries(food.nutrients).map(([nutrient, value]) => [
            nutrient,
            { ...value, method: CALCULADO.has(nutrient) ? "calculado" : "analitico" },
          ]),
        ),
      };
    });

  /* ─────────── Validações: falham alto em vez de gravar dado ruim ─────────── */
  const problems = [];
  if (list.length !== 597) problems.push(`Esperados 597 alimentos, obtidos ${list.length}.`);
  const seen = new Set();
  for (const food of list) {
    if (seen.has(food.code)) problems.push(`Código duplicado: ${food.code}`);
    seen.add(food.code);
    if (!food.nutrients.energia_kcal) problems.push(`Alimento ${food.code} sem energia.`);
    for (const [nutrient, value] of Object.entries(food.nutrients)) {
      const floor = NEGATIVE_TOLERANCE[nutrient] ?? 0;
      if (value.state === "disponivel" && (value.amount === null || value.amount < floor)) {
        problems.push(`Alimento ${food.code}/${nutrient}: valor disponível inválido.`);
      }
      if (value.state !== "disponivel" && value.amount !== null) {
        problems.push(`Alimento ${food.code}/${nutrient}: estado ${value.state} com valor.`);
      }
    }
  }
  if (problems.length) {
    console.error(`Validação falhou (${problems.length}):`);
    for (const problem of problems.slice(0, 25)) console.error(" •", problem);
    process.exit(1);
  }

  const nutrientRows = list.reduce((sum, f) => sum + Object.keys(f.nutrients).length, 0);
  const manifest = {
    source: {
      code: "taco-4",
      name: "Tabela Brasileira de Composição de Alimentos (TACO)",
      publisher: "NEPA — Núcleo de Estudos e Pesquisas em Alimentação / UNICAMP",
      edition: "4ª edição revista e ampliada",
      version: "2011",
      referenceUrl: "https://nepa.unicamp.br/publicacoes/tabela-taco-excel/",
      licenseNote:
        "© 2011 NEPA/UNICAMP. A obra declara: “É permitida a reprodução parcial ou total desta obra, desde que citada a fonte.”",
      citation:
        "NEPA/UNICAMP. Tabela brasileira de composição de alimentos — TACO. 4. ed. rev. e ampl. Campinas: NEPA-UNICAMP, 2011. 161 p.",
    },
    file: { name: input.split("/").pop(), sha256: checksum, bytes: buffer.length },
    counts: { foods: list.length, nutrientValues: nutrientRows, categories: CATEGORIES.length },
    legend: {
      "(em branco)": "análises não solicitadas → nenhum registro é gravado (lido como não disponível)",
      Tr: "traço → estado 'traco' (conta como 0 no cálculo, mas marca o total como aproximado)",
      NA: "não aplicável → estado 'nao_aplicavel' (ignorado no cálculo)",
      "*": "as análises estão sendo reavaliadas → estado 'em_revisao' (o alimento fica is_verified = false)",
    },
    notes: [
      "Nenhum marcador da fonte vira zero. Zero só existe quando a fonte publica zero.",
      "Energia, carboidrato (obtido por diferença) e vitamina A (RE/RAE) são marcados como 'calculado' porque a própria TACO os calcula.",
      "Carboidrato levemente negativo em carnes/pescados magros é valor real da fonte (cálculo por diferença) e foi preservado.",
      "O estado de preparo é derivado do nome oficial por casamento exato de token; sem token conhecido fica 'nao_informado'.",
      "A TACO 4 não publica medidas caseiras por alimento — nenhuma foi inventada.",
    ],
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, "foods.json"), `${JSON.stringify(list, null, 0)}\n`);
  writeFileSync(resolve(OUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`OK — ${list.length} alimentos, ${nutrientRows} valores nutricionais.`);
  console.log(`SHA-256 da fonte: ${checksum}`);
  console.log(`Gravado em ${OUT_DIR}`);
}

main();
