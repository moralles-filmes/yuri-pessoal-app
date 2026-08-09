/**
 * Fase 18-D — IA · A allowlist de formatos e os limites.
 *
 * O que estes testes protegem: **`isMimeAceito` é uma allowlist**, e a lição da 18-B
 * (`parseRefs` recusava `//` e deixava passar `/\`) é que toda trava escrita como lista de
 * proibidos vai ser furada. Aqui a pergunta é sempre "está na lista?", nunca "não está entre
 * os proibidos?".
 */

import { describe, expect, it } from "vitest";
import {
  MIMES_ACEITOS,
  especieDoMime,
  isMimeAceito,
  limiteDeBytes,
  LIMITE_BYTES_IMAGEM,
  LIMITE_BYTES_PDF,
} from "./limits";

describe("allowlist de MIME", () => {
  it("aceita exatamente os quatro formatos declarados", () => {
    expect([...MIMES_ACEITOS]).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]);
  });

  it("⛔ HEIC é recusado — é o formato padrão do iPhone, e a recusa é deliberada", () => {
    expect(isMimeAceito("image/heic")).toBe(false);
    expect(isMimeAceito("image/heif")).toBe(false);
  });

  it("⛔ `image/jpg` NÃO existe como MIME e não é aceito por cortesia", () => {
    // `sniffMime` decide pelos bytes e sempre devolve `image/jpeg`. Uma segunda grafia aqui
    // criaria um caminho que nunca casa — e que alguém tentaria "consertar" depois.
    expect(isMimeAceito("image/jpg")).toBe(false);
  });

  it("recusa o que não está na lista, incluindo coisas plausíveis", () => {
    for (const mime of [
      "image/gif",
      "image/svg+xml",
      "image/bmp",
      "image/tiff",
      "text/csv",
      "application/vnd.ms-excel",
      "application/x-ofx",
      "text/plain",
      "application/octet-stream",
      "",
      "IMAGE/JPEG",
      "image/jpeg; charset=utf-8",
    ]) {
      expect(isMimeAceito(mime), `${mime} não devia passar`).toBe(false);
    }
  });

  it("não tem duplicata", () => {
    expect(new Set(MIMES_ACEITOS).size).toBe(MIMES_ACEITOS.length);
  });
});

describe("espécie e limite", () => {
  it("só o PDF é espécie `pdf`", () => {
    expect(especieDoMime("application/pdf")).toBe("pdf");
    expect(especieDoMime("image/jpeg")).toBe("imagem");
    expect(especieDoMime("image/png")).toBe("imagem");
    expect(especieDoMime("image/webp")).toBe("imagem");
  });

  it("o PDF tem folga maior que a imagem", () => {
    expect(limiteDeBytes("pdf")).toBe(LIMITE_BYTES_PDF);
    expect(limiteDeBytes("imagem")).toBe(LIMITE_BYTES_IMAGEM);
    expect(LIMITE_BYTES_PDF).toBeGreaterThan(LIMITE_BYTES_IMAGEM);
  });

  it("os dois limites ficam abaixo do MENOR que os provedores publicam (20 MB, Gemini)", () => {
    // A requisição carrega mais coisa além do arquivo: prompt de sistema, schema, instrução.
    // Encostar no limite do provedor faria a chamada falhar por causa do prompt, não do
    // arquivo — e a mensagem de erro apontaria para o lugar errado.
    const VINTE_MB = 20 * 1024 * 1024;
    expect(LIMITE_BYTES_IMAGEM).toBeLessThan(VINTE_MB);
    expect(LIMITE_BYTES_PDF).toBeLessThan(VINTE_MB);
  });
});
