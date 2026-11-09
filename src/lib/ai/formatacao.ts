import { rotaInternaAceita } from "./tools/sources";

export type Inline =
  | { readonly t: "texto"; readonly v: string }
  | { readonly t: "negrito"; readonly v: readonly Inline[] }
  | { readonly t: "italico"; readonly v: readonly Inline[] }
  | { readonly t: "codigo"; readonly v: string }
  | { readonly t: "link"; readonly href: string; readonly v: readonly Inline[] }
  | { readonly t: "quebra" };

export type Bloco =
  | { readonly t: "paragrafo"; readonly v: readonly Inline[] }
  | { readonly t: "titulo"; readonly nivel: 2 | 3; readonly v: readonly Inline[] }
  | { readonly t: "lista"; readonly ordenada: boolean; readonly itens: readonly (readonly Inline[])[] };

/** Subconjunto deliberado de Markdown. A árvore não tem imagem nem nó de HTML. */
function inline(texto: string, profundidade = 0, permiteLink = true): Inline[] {
  if (profundidade >= 16) return [{ t: "texto", v: texto }];
  const nos: Inline[] = [];
  let literal = "";
  const descarregar = () => {
    if (literal) nos.push({ t: "texto", v: literal });
    literal = "";
  };
  for (let i = 0; i < texto.length;) {
    const c = texto[i];
    if (c === "\n") {
      descarregar();
      nos.push({ t: "quebra" });
      i++;
      continue;
    }
    // HTML é só texto, inclusive a marcação que porventura exista dentro de uma tag.
    if (c === "<") {
      const fim = texto.indexOf(">", i + 1);
      if (fim !== -1) {
        literal += texto.slice(i, fim + 1);
        i = fim + 1;
        continue;
      }
    }
    if (c === "[" || (c === "!" && texto[i + 1] === "[")) {
      const link = /^(!?)\[([^\]\n]*)\]\(([^)]*)\)/.exec(texto.slice(i));
      if (link) {
        const [, imagem, rotulo, destino] = link;
        if (!imagem && permiteLink && rotaInternaAceita(destino)) {
          descarregar();
          nos.push({ t: "link", href: destino, v: inline(rotulo, profundidade + 1, false) });
        } else {
          // A URL descartada nunca entra na árvore, nem como atributo ou texto oculto.
          literal += rotulo;
        }
        i += link[0].length;
        continue;
      }
    }
    const marca = texto.startsWith("**", i) ? "**" : c;
    if (marca === "**" || marca === "*" || marca === "_" || marca === "\u0060") {
      const fim = texto.indexOf(marca, i + marca.length);
      const conteudo = fim === -1 ? "" : texto.slice(i + marca.length, fim);
      const dentroDaPalavra = marca === "_" && /[\p{L}\p{N}]/u.test(texto[i - 1] ?? "");
      if (conteudo && (marca === "\u0060" || (!/^\s|\s$/.test(conteudo) && !dentroDaPalavra))) {
        descarregar();
        nos.push(marca === "\u0060"
          ? { t: "codigo", v: conteudo }
          : { t: marca === "**" ? "negrito" : "italico", v: inline(conteudo, profundidade + 1, permiteLink) });
        i = fim + marca.length;
        continue;
      }
    }
    literal += c;
    i++;
  }
  descarregar();
  return nos;
}

export function formatar(md: string): readonly Bloco[] {
  const blocos: Bloco[] = [];
  let paragrafo: string[] = [];
  let lista: { ordenada: boolean; itens: Inline[][] } | null = null;
  const fecharParagrafo = () => {
    if (paragrafo.length) blocos.push({ t: "paragrafo", v: inline(paragrafo.join("\n")) });
    paragrafo = [];
  };
  const fecharLista = () => {
    if (lista) blocos.push({ t: "lista", ...lista });
    lista = null;
  };
  for (const linha of md.replace(/\r\n/g, "\n").split("\n")) {
    if (!linha.trim()) {
      fecharParagrafo();
      fecharLista();
      continue;
    }
    const titulo = /^(#{1,3})\s+(.+)$/.exec(linha);
    const item = /^\s*(?:([-*])|([0-9]+)\.)\s+(.+)$/.exec(linha);
    if (titulo) {
      fecharParagrafo();
      fecharLista();
      blocos.push({ t: "titulo", nivel: titulo[1].length === 3 ? 3 : 2, v: inline(titulo[2]) });
    } else if (item) {
      fecharParagrafo();
      const ordenada = Boolean(item[2]);
      if (lista && lista.ordenada !== ordenada) fecharLista();
      lista ??= { ordenada, itens: [] };
      lista.itens.push(inline(item[3]));
    } else {
      fecharLista();
      paragrafo.push(linha);
    }
  }
  fecharParagrafo();
  fecharLista();
  return blocos;
}
