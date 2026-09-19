/**
 * Fase 06 — Importação de Faturas & Extratos.
 * Fonte única dos enums do módulo de importação (casam com os CHECK das migrations
 * import_batches/import_rows) + os rótulos pt-BR e as regras de sugestão de categoria.
 */

/** Formato do arquivo importado. */
export const IMPORT_FORMATS = ["excel", "csv", "ofx"] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];

export const IMPORT_FORMAT_LABELS: Record<ImportFormat, string> = {
  excel: "Excel",
  csv: "CSV",
  ofx: "OFX",
};

/** Origem do arquivo: fatura de cartão ou extrato de conta. */
export const IMPORT_ORIGENS = ["cartao", "conta"] as const;
export type ImportOrigem = (typeof IMPORT_ORIGENS)[number];

export const IMPORT_ORIGEM_LABELS: Record<ImportOrigem, string> = {
  cartao: "Fatura de cartão",
  conta: "Extrato de conta",
};

/** Status do lote no fluxo de importação. */
export const IMPORT_BATCH_STATUSES = [
  "pendente",
  "mapeando",
  "revisando",
  "importado",
  "cancelado",
] as const;
export type ImportBatchStatus = (typeof IMPORT_BATCH_STATUSES)[number];

export const IMPORT_BATCH_STATUS_LABELS: Record<ImportBatchStatus, string> = {
  pendente: "Pendente",
  mapeando: "Mapeando",
  revisando: "Em revisão",
  importado: "Importado",
  cancelado: "Cancelado",
};

/** Status de uma linha do arquivo durante a revisão. */
export const IMPORT_ROW_STATUSES = [
  "pendente",
  "para_importar",
  "duplicada",
  "ignorada",
  "importada",
  "erro",
] as const;
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

export const IMPORT_ROW_STATUS_LABELS: Record<ImportRowStatus, string> = {
  pendente: "Pendente",
  para_importar: "Para importar",
  duplicada: "Duplicada",
  ignorada: "Ignorada",
  importada: "Importada",
  erro: "Erro",
};

/**
 * Sentido de uma linha (casa com o CHECK de `import_rows.tipo`). São DOIS: o dinheiro saiu da
 * conta/cartão do lote, ou entrou nele.
 *
 * ⚠️ **`transferencia` NÃO é um terceiro valor daqui.** Uma linha de extrato vira transferência
 * quando ganha `transfer_account_id` (a outra conta), e `tipo` continua dizendo o SENTIDO —
 * que é o que decide qual das duas contas é a origem. Ver a migration
 * `20260919120000_import_rows_transferencia.sql`.
 */
export const IMPORT_ROW_TIPOS = ["despesa", "receita"] as const;
export type ImportRowTipo = (typeof IMPORT_ROW_TIPOS)[number];

export const IMPORT_ROW_TIPO_LABELS: Record<ImportRowTipo, string> = {
  despesa: "Despesa",
  receita: "Receita",
};

/** Como uma linha será criada: 1 lançamento (single) ou compra parcelada (Fase 04). */
export const IMPORT_AS_OPTIONS = ["single", "parcelamento"] as const;
export type ImportAs = (typeof IMPORT_AS_OPTIONS)[number];

/**
 * Campos mapeáveis de uma coluna do arquivo. `valor`, `data` e `descricao` são essenciais;
 * os demais são opcionais (enriquecem o lançamento). `conta_cartao` é informativo (o alvo
 * real é definido no lote); `identificador` reforça a deduplicação (ex.: FITID do OFX).
 */
export const MAPPING_FIELDS = [
  "data",
  "descricao",
  "valor",
  "categoria",
  "conta_cartao",
  "parcela",
  "parcelas_total",
  "identificador",
] as const;
export type MappingField = (typeof MAPPING_FIELDS)[number];

export const MAPPING_FIELD_LABELS: Record<MappingField, string> = {
  data: "Data",
  descricao: "Descrição",
  valor: "Valor",
  categoria: "Categoria",
  conta_cartao: "Cartão/Conta",
  parcela: "Parcela (nº)",
  parcelas_total: "Total de parcelas",
  identificador: "Identificador",
};

/** Campos obrigatórios para conseguir importar uma linha. */
export const REQUIRED_MAPPING_FIELDS: MappingField[] = [
  "data",
  "valor",
  "descricao",
];

/**
 * Palavras-chave por campo, usadas na detecção automática do cabeçalho. Comparadas como
 * substring sobre o cabeçalho NORMALIZADO (minúsculo, sem acento). Ordem dos campos importa:
 * `parcelas_total` é detectado antes de `parcela` para não roubar a coluna "parcelas".
 */
export const HEADER_KEYWORDS: Record<MappingField, string[]> = {
  data: ["data", "date", "dtposted", "posted"],
  valor: [
    "valor",
    "value",
    "amount",
    "montante",
    "trnamt",
    "debito",
    "credito",
    "r$",
    "quantia",
  ],
  descricao: [
    "descri",
    "historico",
    "memo",
    "name",
    "estabelecimento",
    "titulo",
    "detalhe",
    "transacao",
    "lancamento",
    "favorecido",
  ],
  parcelas_total: [
    "total parcelas",
    "qtd parcelas",
    "n parcelas",
    "no parcelas",
    "numero parcelas",
    "parcelas",
  ],
  parcela: ["parcela", "parc"],
  categoria: ["categoria", "category", "tipo de gasto", "grupo"],
  conta_cartao: ["cartao", "conta", "account", "card", "bandeira"],
  identificador: [
    "identificador",
    "fitid",
    "documento",
    "autenticacao",
    "referencia",
    "id transacao",
    "numero doc",
  ],
};

/**
 * Regras de sugestão de categoria por palavra-chave na descrição (mais específicas primeiro).
 * `categoria` casa com o NOME de uma das categorias do usuário (seed da Fase 02). A sugestão
 * é sempre editável e nunca aplicada sem revisão (Fase 06).
 */
export const CATEGORY_RULES: { categoria: string; keywords: string[] }[] = [
  {
    categoria: "Delivery",
    keywords: ["ifood", "rappi", "uber eats", "ubereats", "delivery", "james"],
  },
  {
    categoria: "Combustível",
    keywords: [
      "posto",
      "shell",
      "ipiranga",
      "petrobras",
      "br distribuidora",
      "combustivel",
      "gasolina",
      "etanol",
      "ale ",
    ],
  },
  {
    categoria: "Transporte",
    keywords: [
      "uber",
      "99 ",
      "99app",
      "99pop",
      "cabify",
      "taxi",
      "metro",
      "onibus",
      "estacionamento",
      "estapar",
      "pedagio",
      "sem parar",
      "blablacar",
    ],
  },
  {
    categoria: "Mercado",
    keywords: [
      "mercado",
      "supermercado",
      "atacad",
      "hortifruti",
      "acougue",
      "mercearia",
      "carrefour",
      "pao de acucar",
      "assai",
      "extra ",
      "sams club",
    ],
  },
  {
    categoria: "Alimentação",
    keywords: [
      "restaurante",
      "lanchonete",
      "padaria",
      "cafe",
      "food",
      "burger",
      "pizza",
      "bistro",
      "churrasc",
      "sushi",
      "hamburgueria",
    ],
  },
  {
    categoria: "Saúde",
    keywords: [
      "farmacia",
      "drogaria",
      "droga raia",
      "drogasil",
      "pague menos",
      "hospital",
      "clinica",
      "laboratorio",
      "dentista",
      "unimed",
      "amil",
      "medico",
    ],
  },
  {
    categoria: "Assinaturas",
    keywords: [
      "netflix",
      "spotify",
      "amazon prime",
      "disney",
      "hbo",
      "youtube premium",
      "globoplay",
      "deezer",
      "icloud",
      "google one",
      "dropbox",
      "assinatura",
    ],
  },
  {
    categoria: "Contas fixas",
    keywords: [
      "energia",
      "enel",
      "cemig",
      "light",
      "copel",
      "sabesp",
      "agua",
      "gas ",
      "internet",
      "vivo",
      "claro",
      " tim ",
      "telefon",
      "condominio",
    ],
  },
  {
    categoria: "Educação",
    keywords: [
      "curso",
      "faculdade",
      "escola",
      "udemy",
      "alura",
      "hotmart",
      "coursera",
      "livraria",
      "kindle",
    ],
  },
  {
    categoria: "Lazer",
    keywords: [
      "cinema",
      "ingresso",
      "teatro",
      "show",
      "parque",
      "steam",
      "playstation",
      "xbox",
      "nintendo",
      "balada",
    ],
  },
  {
    categoria: "Marketing",
    keywords: [
      "facebook ads",
      "meta ads",
      "google ads",
      "instagram ads",
      "anuncio",
      "mailchimp",
      "marketing",
    ],
  },
  {
    categoria: "Equipamentos",
    keywords: [
      "kabum",
      "pichau",
      "terabyte",
      "magazine",
      "magalu",
      "americanas",
      "casas bahia",
      "notebook",
      "monitor",
      "eletronico",
    ],
  },
  {
    categoria: "Viagens",
    keywords: [
      "hotel",
      "airbnb",
      "booking",
      "latam",
      "gol ",
      "azul ",
      "decolar",
      "passagem",
      "hospedagem",
      "viagem",
    ],
  },
  {
    categoria: "Trabalho",
    keywords: ["salario", "freelance", "honorario", "pagamento cliente"],
  },
  {
    categoria: "Moradia",
    keywords: ["aluguel", "imobiliaria", "iptu"],
  },
];
