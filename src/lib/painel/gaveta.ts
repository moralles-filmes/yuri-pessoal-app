/**
 * REDESIGN-04-B — a VISTA da gaveta de registros: o `Detalhe` do motor traduzido em textos
 * prontos, para a peça comum desenhar sem importar `@/lib/finance` (as peças de
 * `components/shared/painel/` recebem texto pronto — `painel.test.ts`, "fronteiras").
 *
 * PURO: só formata. Nenhuma soma: o total, a soma da lista e as diferenças chegam calculados no
 * `Detalhe` (centavos) e aqui só viram texto de moeda.
 */
import {
  type Detalhe,
  type GrupoDoDetalhe,
  type MarcaDoRegistro,
  type RegistroDoDetalhe,
  colunaDaParte,
} from "@/lib/finance/detalhe";
import { centavosParaReais, formatCurrency } from "@/lib/format";

export type TomDaMarca = "aviso" | "estorno" | "projetado" | "neutro";

export type LinhaDaGaveta = {
  id: string;
  /** "DD/MM", ou `null` quando o registro não tem data própria. */
  data: string | null;
  descricao: string;
  /** Origem e categoria, já na ordem de exibição. */
  meta: string[];
  marcas: { texto: string; tom: TomDaMarca }[];
  /** A coluna que concilia com o número. */
  valor: string;
  negativo: boolean;
  /** As outras partes, só quando dizem algo além da coluna que concilia. */
  outras: { rotulo: string; valor: string }[];
  projetado: boolean;
};

export type GrupoDaGaveta = {
  rotulo: string;
  cabecalho: { fatura: string; minhaParte: string } | null;
  /** A fatura da view × a soma dos itens lidos, quando divergem (D-B-4). */
  diferenca: { fatura: string; itens: string } | null;
  linhas: LinhaDaGaveta[];
};

export type VistaDaGaveta =
  | {
      estado: "ok";
      titulo: string;
      linhaDeBase: string;
      total: string;
      avisos: string[];
      grupos: GrupoDaGaveta[];
      soma: { rotulo: string; valor: string };
      /** `null` quando a soma fecha com o total. */
      diferenca: string | null;
    }
  | { estado: "vazio"; titulo: string; linhaDeBase: string; frase: string; avisos: string[] }
  | { estado: "falha"; titulo: string; frase: string }
  | { estado: "nao-segue"; titulo: string; frase: string; hrefSemFiltro: string | null };

const dinheiro = (centavos: number) => formatCurrency(centavosParaReais(centavos));

const ROTULO_DA_SOMA: Record<Extract<Detalhe, { estado: "ok" }>["parte"], string> = {
  meu: "da minha parte",
  terceiros: "da parte de terceiros",
  bruto: "do valor cheio",
  pendente: "do pendente",
  saldo: "dos saldos",
  projetado: "do projetado",
};

const ROTULO_DA_COLUNA = {
  meuCent: "minha parte",
  terceirosCent: "de terceiros",
  brutoCent: "valor cheio",
} as const;

type Coluna = keyof typeof ROTULO_DA_COLUNA;

function marca(m: MarcaDoRegistro): { texto: string; tom: TomDaMarca } {
  if (typeof m !== "string") return { texto: `parcela ${m.parcela.numero}/${m.parcela.total}`, tom: "neutro" };
  switch (m) {
    case "previsto":
      return { texto: "previsto", tom: "aviso" };
    case "data-aproximada":
      return { texto: "data aproximada", tom: "aviso" };
    case "estorno":
      return { texto: "estorno", tom: "estorno" };
    case "projetado":
      return { texto: "projetado", tom: "projetado" };
    case "contado-cheio":
      return { texto: "contado cheio", tom: "neutro" };
  }
}

/** 'yyyy-MM-dd' (data pura) → "DD/MM", tirado do texto (sem converter para Date). */
function diaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function linha(r: RegistroDoDetalhe, coluna: Coluna): LinhaDaGaveta {
  const valor = r[coluna];
  const outras = (Object.keys(ROTULO_DA_COLUNA) as Coluna[])
    .filter((c) => c !== coluna && r[c] !== valor && !(c === "terceirosCent" && r[c] === 0))
    .map((c) => ({ rotulo: ROTULO_DA_COLUNA[c], valor: dinheiro(r[c]) }));
  return {
    id: r.id,
    data: r.data ? diaMes(r.data) : null,
    descricao: r.descricao,
    meta: [r.origem, r.categoria].filter((t): t is string => t !== null && t !== ""),
    marcas: r.marcas.map(marca),
    valor: dinheiro(valor),
    negativo: valor < 0,
    outras,
    projetado: r.marcas.includes("projetado"),
  };
}

function grupo(g: GrupoDoDetalhe, coluna: Coluna): GrupoDaGaveta {
  return {
    rotulo: g.rotulo,
    cabecalho: g.fatura ? { fatura: dinheiro(g.fatura.totalCent), minhaParte: dinheiro(g.fatura.meuCent) } : null,
    diferenca:
      g.fatura && g.fatura.diferencaCent !== 0
        ? { fatura: dinheiro(g.fatura.totalCent), itens: dinheiro(g.fatura.totalCent - g.fatura.diferencaCent) }
        : null,
    linhas: g.registros.map((r) => linha(r, coluna)),
  };
}

export function vistaDaGaveta(d: Detalhe): VistaDaGaveta {
  if (d.estado !== "ok") return d;
  const coluna = colunaDaParte(d.parte);
  return {
    estado: "ok",
    titulo: d.titulo,
    linhaDeBase: d.linhaDeBase,
    total: dinheiro(d.totalCent),
    avisos: d.avisos,
    grupos: d.grupos.map((g) => grupo(g, coluna)),
    soma: { rotulo: ROTULO_DA_SOMA[d.parte], valor: dinheiro(d.somaCent) },
    diferenca: d.diferencaCent === 0 ? null : dinheiro(d.diferencaCent),
  };
}
