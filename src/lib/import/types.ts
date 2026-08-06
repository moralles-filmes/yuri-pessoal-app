/**
 * Fase 06 — Tipos do pipeline puro de importação (parse → mapear → normalizar → dedup).
 * São tipos de DADOS (não de DB): a persistência em import_batches/import_rows fica nas
 * Server Actions. Mantidos puros para serem testáveis em Vitest (ambiente node).
 */
import type {
  ImportRowStatus,
  MappingField,
} from "@/lib/import/constants";

/** Tabela genérica resultante do parsing (cabeçalho + linhas de células string). */
export type ParsedTable = {
  headers: string[];
  rows: string[][];
};

/** Mapeamento campo → índice da coluna no arquivo. Campo ausente = não mapeado. */
export type ColumnMapping = Partial<Record<MappingField, number>>;

/** Categoria mínima usada na sugestão (id + nome). */
export type CategoriaLookup = { id: string; name: string };

/** Opções de normalização (origem do lote + convenção de sinal + categorias do usuário). */
export type NormalizeOptions = {
  origem: "cartao" | "conta";
  /**
   * Convenção de sinal do ARQUIVO: valores negativos são as saídas (true) ou as entradas
   * (false). Em extrato de conta quem escolhe é o usuário no upload; em fatura de cartão é
   * detectada do próprio arquivo (`detectarSinalNegativoDespesa`) — OFX traz compra negativa,
   * planilha traz compra positiva — e continua editável na revisão.
   */
  sinalNegativoDespesa: boolean;
  categorias: CategoriaLookup[];
};

/**
 * Linha já normalizada a partir do arquivo + mapeamento. `valorCentavos` é o MÓDULO
 * (sempre >= 0); o sentido vai em `tipo`. Linhas inválidas saem com status 'erro' + motivo.
 */
export type NormalizedRow = {
  linhaIndex: number;
  raw: string[];
  dataNorm: string | null; // 'yyyy-MM-dd'
  descricao: string;
  valorCentavos: number | null; // módulo (>= 0)
  tipo: "despesa" | "receita" | null;
  parcela: number | null;
  parcelasTotal: number | null;
  identificador: string | null;
  categoriaSugeridaId: string | null;
  status: ImportRowStatus;
  motivo: string | null;
};
