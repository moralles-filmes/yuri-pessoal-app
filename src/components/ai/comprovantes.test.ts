import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";
import { LIMITE_BYTES_IMAGEM, LIMITE_BYTES_PDF } from "@/lib/ai/vision/limits";
const ler = (arquivo: string) => fs.readFileSync(path.resolve(arquivo), "utf8");
const pagina = ler("src/app/(app)/ia/comprovantes/page.tsx");
const revisao = ler("src/components/ai/receipt-review.tsx");
describe("Task 24 — contrato da tela e corpo do envio", () => {
  it("limite do Next comporta o maior arquivo aceito e o formulário", () => {
    const limite = nextConfig.experimental?.serverActions;
    expect(limite && typeof limite === "object" && limite.bodySizeLimit).toBeGreaterThan(Math.max(LIMITE_BYTES_IMAGEM, LIMITE_BYTES_PDF));
    const config = ler("next.config.ts");
    expect(config).toMatch(/import[\s\S]*LIMITE_BYTES_IMAGEM[\s\S]*LIMITE_BYTES_PDF[\s\S]*from ["']\.\/src\/lib\/ai\/vision\/limits["']/);
    expect(config).toMatch(/bodySizeLimit:\s*Math.max\(LIMITE_BYTES_IMAGEM, LIMITE_BYTES_PDF\)/);
  });
  it("revisão remonta por documento E por extração", () => {
    expect(pagina).toContain('key={`${selecionado.documento.id}:${selecionado.documento.leitura!.id}`}');
    expect(pagina).toMatch(/<ReceiptReview\s+key=/);
  });
  it("comprovante lançado chega à revisão e esconde o caminho de preparar", () => {
    expect(pagina).toMatch(/virouLancamento=\{selecionado.documento.virouLancamento\}/);
    expect(revisao).toMatch(/if \(preparando \|\| virouLancamento\) return/);
    expect(revisao).toMatch(/\{virouLancamento \? \([\s\S]*?Este comprovante já virou lançamento[\s\S]*?\) : !veredito.pode \?/);
  });
  it("conta e cartão vazios ativam o placeholder real do Radix", () => {
    expect(revisao).toMatch(/const \[conta, setConta\] = React.useState<string>\(""\)/);
    expect(revisao).toMatch(/const \[cartao, setCartao\] = React.useState<string>\(""\)/);
    expect(revisao).toMatch(/ondeEntra === "conta" \? conta !== "" : cartao !== ""/);
    expect(revisao).toMatch(/conta: ondeEntra === "conta" && conta !== "" \? conta : null/);
    expect(revisao).toMatch(/cartao: ondeEntra === "cartao" && cartao !== "" \? cartao : null/);
    expect(revisao).toContain('<SelectValue placeholder="Escolha…" />');
  });
  it("documento ausente avisa acima da lista", () => {
    expect(pagina).toMatch(/doc && !selecionado && \([\s\S]*?Esse comprovante não existe mais\./);
    expect(pagina.indexOf("Esse comprovante não existe mais.")).toBeLessThan(pagina.indexOf(">Enviados</h2>"));
  });
  it("limites de páginas e contagem desconhecida aparecem antes do envio", () => {
    const envio = ler("src/components/ai/receipt-upload.tsx");
    expect(envio).toContain("{LIMITE_PAGINAS_PDF} páginas");
    expect(envio).toContain("{mb(LIMITE_BYTES_PDF_SEM_CONTAGEM)} MB");
  });
  it("escolha permite galeria e PDF sem forçar câmera", () => {
    expect(ler("src/components/ai/receipt-upload.tsx")).not.toMatch(/capture\s*=/);
  });
});
