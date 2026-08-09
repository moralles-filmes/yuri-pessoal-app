/**
 * Fase 18-D — IA · O MIME decidido pelos bytes.
 *
 * O critério de aceite desta subfase é literal: **"MIME falsificado (extensão que mente)"**.
 * Os bytes abaixo são montados à mão, não lidos de fixture — assim o teste diz exatamente
 * qual assinatura está exercitando, e um cabeçalho de amostra não pode "consertar" um bug
 * por acidente.
 */

import { describe, expect, it } from "vitest";
import { sniffMime } from "./mime";

const b = (...valores: number[]) => new Uint8Array(valores);
const ascii = (texto: string) => Array.from(texto, (c) => c.charCodeAt(0));

const JPEG = b(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
const PNG = b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
const WEBP = b(...ascii("RIFF"), 0x1a, 0, 0, 0, ...ascii("WEBPVP8 "));
const PDF = b(...ascii("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n"));
const HEIC = b(0, 0, 0, 0x20, ...ascii("ftypheic"), ...ascii("mif1heic"));

describe("os quatro formatos aceitos", () => {
  it("reconhece JPEG, PNG, WEBP e PDF", () => {
    expect(sniffMime(JPEG)).toEqual({ ok: true, mime: "image/jpeg" });
    expect(sniffMime(PNG)).toEqual({ ok: true, mime: "image/png" });
    expect(sniffMime(WEBP)).toEqual({ ok: true, mime: "image/webp" });
    expect(sniffMime(PDF)).toEqual({ ok: true, mime: "application/pdf" });
  });
});

describe("⛔ a extensão mente — e o `File.type` mente junto", () => {
  it("um PDF chamado `nota.jpg` continua sendo PDF", () => {
    // Este é o caso que `photoFileSchema` (16-E) deixa passar: o navegador olharia a
    // extensão e diria `image/jpeg`. Aqui quem responde são os bytes.
    const resultado = sniffMime(PDF);
    expect(resultado).toEqual({ ok: true, mime: "application/pdf" });
  });

  it("um executável chamado `comprovante.png` é RECUSADO", () => {
    // MZ — cabeçalho de PE/EXE do Windows.
    const exe = b(0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00);
    const resultado = sniffMime(exe);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe("desconhecido");
  });

  it("um ZIP disfarçado é RECUSADO", () => {
    const zip = b(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00);
    expect(sniffMime(zip).ok).toBe(false);
  });
});

describe("⛔ poliglota: a ordem das assinaturas importa", () => {
  it("um JPEG que carrega `%PDF-` no corpo é detectado como JPEG", () => {
    const poliglota = b(...JPEG, ...ascii("....%PDF-1.4 /Type /Page"));
    expect(sniffMime(poliglota)).toEqual({ ok: true, mime: "image/jpeg" });
  });

  it("`%PDF-` fora do offset 0 é RECUSADO, não aceito como PDF", () => {
    // Errar para "recusei um arquivo legítimo" é aceitável. Errar para "aceitei um arquivo
    // que não sei o que é" não.
    const comLixoAntes = b(0x00, 0x00, ...ascii("%PDF-1.4"));
    const resultado = sniffMime(comLixoAntes);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe("desconhecido");
  });

  it("RIFF que não é WEBP (um WAV) é recusado", () => {
    const wav = b(...ascii("RIFF"), 0x24, 0, 0, 0, ...ascii("WAVEfmt "));
    expect(sniffMime(wav).ok).toBe(false);
  });
});

describe("HEIC ganha motivo próprio", () => {
  it("é recusado com instrução de como resolver, não com 'formato inválido'", () => {
    const resultado = sniffMime(HEIC);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toBe("heic");
      // A mensagem precisa dizer o que FAZER. É o formato padrão do iPhone: vai ser a
      // recusa mais comum do sistema, e "formato não aceito" mandaria o dono adivinhar.
      expect(resultado.mensagem).toContain("iPhone");
      expect(resultado.mensagem).toContain("Mais Compatível");
    }
  });

  it("reconhece as marcas genéricas que o iOS usa (mif1)", () => {
    const mif1 = b(0, 0, 0, 0x18, ...ascii("ftypmif1"), ...ascii("mif1heic"));
    const resultado = sniffMime(mif1);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe("heic");
  });
});

describe("formatos que são imagem e ainda assim não entram", () => {
  it("GIF, BMP e TIFF são recusados — a allowlist tem quatro itens, não 'imagens'", () => {
    const gif = b(...ascii("GIF89a"), 0x01, 0x00);
    const bmp = b(0x42, 0x4d, 0x36, 0x00, 0x00, 0x00, 0x00, 0x00);
    const tiff = b(0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00);
    expect(sniffMime(gif).ok).toBe(false);
    expect(sniffMime(bmp).ok).toBe(false);
    expect(sniffMime(tiff).ok).toBe(false);
  });

  it("SVG é recusado — é texto, e texto que o navegador executa", () => {
    const svg = b(...ascii('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'));
    expect(sniffMime(svg).ok).toBe(false);
  });
});

describe("bordas", () => {
  it("arquivo vazio tem motivo próprio", () => {
    const resultado = sniffMime(new Uint8Array(0));
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe("vazio");
  });

  it("arquivo curto demais para qualquer assinatura não estoura", () => {
    expect(sniffMime(b(0xff)).ok).toBe(false);
    expect(sniffMime(b(0xff, 0xd8)).ok).toBe(false); // JPEG precisa dos três bytes
    expect(sniffMime(b(...ascii("RIFF"))).ok).toBe(false);
    expect(sniffMime(b(...ascii("%PDF"))).ok).toBe(false); // falta o hífen
  });

  it("nunca lança, para qualquer entrada", () => {
    for (let tamanho = 0; tamanho < 40; tamanho += 1) {
      const lixo = new Uint8Array(tamanho).fill(0xab);
      expect(() => sniffMime(lixo)).not.toThrow();
    }
  });
});
