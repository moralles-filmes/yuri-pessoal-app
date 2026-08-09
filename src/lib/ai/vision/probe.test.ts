/**
 * Fase 18-D — IA · As dimensões e a contagem de páginas.
 *
 * ⚠️ A propriedade mais importante daqui é a MENOS óbvia: **`null` é sempre uma resposta
 * correta**. Estes testes provam que a medida está certa quando existe, e que a ausência é
 * declarada quando não existe — nunca um número inventado, que é o que faria a reserva
 * sair menor que o custo.
 */

import { describe, expect, it } from "vitest";
import { dimensoesDaImagem, paginasDoPdf } from "./probe";

const ascii = (texto: string) => Array.from(texto, (c) => c.charCodeAt(0));
const u16be = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const u32be = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u24le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];

function png(largura: number, altura: number): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...u32be(13),
    ...ascii("IHDR"),
    ...u32be(largura),
    ...u32be(altura),
  ]);
}

/** JPEG com `segmentosAntes` de metadados antes do SOF — o caso que quebra o ingênuo. */
function jpeg(
  largura: number,
  altura: number,
  segmentosAntes: readonly number[][] = [],
): Uint8Array {
  const bytes: number[] = [0xff, 0xd8];
  for (const conteudo of segmentosAntes) {
    // [FF][E1 = APP1][tamanho, incluindo os 2 bytes do próprio tamanho][conteúdo]
    bytes.push(0xff, 0xe1, ...u16be(conteudo.length + 2), ...conteudo);
  }
  // SOF0: [FF][C0][tamanho 17][precisão 8][altura][largura][componentes...]
  bytes.push(0xff, 0xc0, ...u16be(17), 8, ...u16be(altura), ...u16be(largura));
  bytes.push(3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1);
  return new Uint8Array(bytes);
}

describe("PNG", () => {
  it("lê o IHDR", () => {
    expect(dimensoesDaImagem(png(1920, 1080))).toEqual({
      larguraPx: 1920,
      alturaPx: 1080,
    });
  });

  it("lê dimensão grande sem estourar o sinal de int32", () => {
    // 0x80000000 tem o bit alto ligado: sem `>>> 0` viraria negativo.
    const grande = png(40000, 30000);
    expect(dimensoesDaImagem(grande)).toEqual({ larguraPx: 40000, alturaPx: 30000 });
  });

  it("PNG sem IHDR devolve null", () => {
    const semIhdr = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...u32be(13),
      ...ascii("XXXX"),
      ...u32be(100),
      ...u32be(100),
    ]);
    expect(dimensoesDaImagem(semIhdr)).toBeNull();
  });
});

describe("JPEG", () => {
  it("lê o SOF quando ele é o primeiro segmento", () => {
    expect(dimensoesDaImagem(jpeg(800, 600))).toEqual({
      larguraPx: 800,
      alturaPx: 600,
    });
  });

  it("⛔ ANDA pelos metadados: EXIF grande antes do SOF não confunde", () => {
    // É o caso real. Toda foto de celular traz EXIF (e às vezes um ICC de vários KB) antes
    // do SOF. Um leitor que assumisse posição fixa leria bytes de metadado como dimensão —
    // e produziria um número plausível e errado, que é o pior tipo de erro aqui.
    const exif = Array.from({ length: 4000 }, (_, i) => i % 256);
    const icc = Array.from({ length: 3000 }, () => 0x42);
    expect(dimensoesDaImagem(jpeg(4032, 3024, [exif, icc]))).toEqual({
      larguraPx: 4032,
      alturaPx: 3024,
    });
  });

  it("para no SOS em vez de interpretar pixel como marcador", () => {
    const semSof = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xda, ...u16be(12), ...Array.from({ length: 10 }, () => 0x00),
      // Daqui para a frente são dados comprimidos. Um `FF C0` acidental aqui NÃO pode
      // virar dimensão.
      0xff, 0xc0, ...u16be(17), 8, ...u16be(9999), ...u16be(9999),
    ]);
    expect(dimensoesDaImagem(semSof)).toBeNull();
  });

  it("segmento com tamanho corrompido devolve null em vez de girar em falso", () => {
    const corrompido = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe1, 0x00, 0x00, // tamanho 0 é inválido (mínimo é 2)
      0xff, 0xc0, ...u16be(17), 8, ...u16be(100), ...u16be(100),
    ]);
    expect(dimensoesDaImagem(corrompido)).toBeNull();
  });

  it("não confunde DHT (C4) com SOF — os dois estão na faixa C0-CF", () => {
    const comDht = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xc4, ...u16be(20), ...Array.from({ length: 18 }, () => 0x11),
      // ⚠️ No SOF a ALTURA vem antes da largura. Escrever na ordem "natural" foi um erro
      // meu que este teste pegou — e é o mesmo erro que produziria uma estimativa de
      // megapixel certa com uma orientação errada na tela.
      0xff, 0xc0, ...u16be(17), 8, ...u16be(480), ...u16be(640),
    ]);
    expect(dimensoesDaImagem(comDht)).toEqual({ larguraPx: 640, alturaPx: 480 });
  });
});

describe("WEBP", () => {
  const riff = (chunk: string, resto: number[]) =>
    new Uint8Array([
      ...ascii("RIFF"),
      ...u32be(0),
      ...ascii("WEBP"),
      ...ascii(chunk),
      ...resto,
    ]);

  it("VP8X (estendido) — tamanho da tela em 24 bits, menos 1", () => {
    const bytes = riff("VP8X", [
      ...u32be(10), // tamanho do chunk
      0x10, 0, 0, 0, // flags + reservado
      ...u24le(1919), // largura - 1
      ...u24le(1079), // altura - 1
    ]);
    expect(dimensoesDaImagem(bytes)).toEqual({ larguraPx: 1920, alturaPx: 1080 });
  });

  it("VP8 (com perdas) — 14 bits depois do sync code", () => {
    const bytes = riff("VP8 ", [
      ...u32be(20),
      0x30, 0x00, 0x00, // frame tag
      0x9d, 0x01, 0x2a, // sync code
      640 & 0xff, (640 >> 8) & 0x3f,
      480 & 0xff, (480 >> 8) & 0x3f,
    ]);
    expect(dimensoesDaImagem(bytes)).toEqual({ larguraPx: 640, alturaPx: 480 });
  });

  it("VP8L (sem perdas) — largura-1 e altura-1 empacotadas", () => {
    const largura = 300;
    const altura = 200;
    const bits = (largura - 1) | ((altura - 1) << 14);
    const bytes = riff("VP8L", [
      ...u32be(20),
      0x2f, // assinatura do VP8L
      bits & 0xff,
      (bits >>> 8) & 0xff,
      (bits >>> 16) & 0xff,
      (bits >>> 24) & 0xff,
      0, 0, 0, 0, 0,
    ]);
    expect(dimensoesDaImagem(bytes)).toEqual({ larguraPx: 300, alturaPx: 200 });
  });

  it("VP8 sem sync code devolve null", () => {
    const bytes = riff("VP8 ", [
      ...u32be(20),
      0x30, 0x00, 0x00,
      0x00, 0x00, 0x00, // sync errado
      0, 0, 0, 0,
    ]);
    expect(dimensoesDaImagem(bytes)).toBeNull();
  });
});

describe("ausência é declarada, nunca inventada", () => {
  it("formato desconhecido devolve null", () => {
    expect(dimensoesDaImagem(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
  });

  it("arquivo truncado devolve null e não lança", () => {
    const completo = png(100, 100);
    for (let corte = 0; corte < completo.length; corte += 1) {
      const truncado = completo.slice(0, corte);
      expect(() => dimensoesDaImagem(truncado)).not.toThrow();
    }
    expect(dimensoesDaImagem(completo.slice(0, 20))).toBeNull();
  });

  it("nunca lança, para qualquer lixo", () => {
    for (let tamanho = 0; tamanho < 40; tamanho += 1) {
      expect(() => dimensoesDaImagem(new Uint8Array(tamanho).fill(0xff))).not.toThrow();
    }
  });
});

describe("páginas do PDF (best-effort declarado)", () => {
  const pdf = (corpo: string) => new Uint8Array(ascii(`%PDF-1.7\n${corpo}\n%%EOF`));

  it("conta as páginas de um PDF não comprimido", () => {
    const doc = pdf(
      "1 0 obj << /Type /Pages /Kids [2 0 R 3 0 R] /Count 2 >> endobj\n" +
        "2 0 obj << /Type /Page /Parent 1 0 R >> endobj\n" +
        "3 0 obj << /Type /Page /Parent 1 0 R >> endobj",
    );
    expect(paginasDoPdf(doc)).toBe(2);
  });

  it("⛔ NÃO confunde /Pages com /Page", () => {
    // `/Pages` é o NÓ da árvore, não uma página. Um regex ingênuo contaria 3 acima.
    const soArvore = pdf("1 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj");
    expect(paginasDoPdf(soArvore)).toBeNull();
  });

  it("aceita espaçamento variável entre /Type e /Page", () => {
    expect(paginasDoPdf(pdf("<< /Type/Page >>"))).toBe(1);
    expect(paginasDoPdf(pdf("<< /Type   /Page >>"))).toBe(1);
    expect(paginasDoPdf(pdf("<< /Type\n/Page >>"))).toBe(1);
  });

  it("PDF comprimido (sem /Type /Page legível) devolve null — e tudo bem", () => {
    // `null` faz a reserva usar o teto de 20 páginas. Caro, seguro, honesto.
    const comprimido = pdf("5 0 obj << /Type /ObjStm /N 12 /First 80 >> stream\n\x00\x01\x02");
    expect(paginasDoPdf(comprimido)).toBeNull();
  });

  it("não lança em bytes binários", () => {
    const binario = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0xff, 0xfe, 0x00, 0x80]);
    expect(() => paginasDoPdf(binario)).not.toThrow();
  });
});
