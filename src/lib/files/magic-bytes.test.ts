/**
 * O detector de formato por BYTES, e a política de cada tela em cima dele.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O CASO QUE ESTE ARQUIVO EXISTE PARA COBRIR                                            ║
 * ║                                                                                       ║
 * ║ Um arquivo qualquer renomeado para `foto.jpg` chega ao servidor como um `File` com     ║
 * ║ `type: "image/jpeg"` — o navegador deriva o tipo da EXTENSÃO. Era assim que ele        ║
 * ║ passava em `photoFileSchema` (16-E) e em `recipePhotoFileSchema` (16-C).               ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { describe, expect, it } from "vitest";
import { detectarFormato, MIME_DO_FORMATO } from "./magic-bytes";
import { conferirFotoPelosBytes, FORMATOS_DE_FOTO } from "./photo-guard";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

function riff(marca: string): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes.set(Array.from("RIFF", (c) => c.charCodeAt(0)), 0);
  bytes.set([0x20, 0x00, 0x00, 0x00], 4);
  bytes.set(Array.from(marca, (c) => c.charCodeAt(0)), 8);
  return bytes;
}

function ftyp(marca: string): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x00, 0x00, 0x00, 0x18], 0);
  bytes.set(Array.from("ftyp", (c) => c.charCodeAt(0)), 4);
  bytes.set(Array.from(marca, (c) => c.charCodeAt(0)), 8);
  return bytes;
}

describe("detectarFormato", () => {
  it("reconhece os cinco formatos pelos magic bytes", () => {
    expect(detectarFormato(JPEG)).toBe("jpeg");
    expect(detectarFormato(PNG)).toBe("png");
    expect(detectarFormato(riff("WEBP"))).toBe("webp");
    expect(detectarFormato(ftyp("heic"))).toBe("heic");
    expect(detectarFormato(ftyp("mif1"))).toBe("heic");
    expect(detectarFormato(PDF)).toBe("pdf");
  });

  it("⛔ o que não casa com nenhuma assinatura devolve `null` — nunca um palpite", () => {
    expect(detectarFormato(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
    expect(detectarFormato(new Uint8Array(0))).toBeNull();
    // Um contêiner ISO-BMFF que NÃO é HEIC (um MP4, por exemplo) também não passa.
    expect(detectarFormato(ftyp("isom"))).toBeNull();
  });

  it("⛔ RIFF que não é WEBP não vira WEBP", () => {
    // Um WAV é RIFF também. Exigir a marca no offset 8 é o que os separa.
    expect(detectarFormato(riff("WAVE"))).toBeNull();
  });

  it("⛔ PDF é exigido no offset 0 — poliglota não passa", () => {
    // JPEG com "%PDF-" no corpo: detectado como JPEG, que é o que ele é.
    const poliglota = new Uint8Array(32);
    poliglota.set(JPEG, 0);
    poliglota.set(Array.from("%PDF-", (c) => c.charCodeAt(0)), 12);
    expect(detectarFormato(poliglota)).toBe("jpeg");

    // Lixo antes do cabeçalho do PDF: recusado, não "quase um PDF".
    const deslocado = new Uint8Array(16);
    deslocado.set(Array.from("%PDF-", (c) => c.charCodeAt(0)), 3);
    expect(detectarFormato(deslocado)).toBeNull();
  });
});

describe("conferirFotoPelosBytes — a trava retroportada para 16-C e 16-E", () => {
  /** Um `File` cujo `type` MENTE, que é exatamente o caso real. */
  function arquivoQueMente(bytes: Uint8Array, tipoDeclarado: string): File {
    return new File([bytes as unknown as BlobPart], "foto.jpg", { type: tipoDeclarado });
  }

  it("⛔ arquivo que se declara JPEG e não é, é RECUSADO", async () => {
    const falso = arquivoQueMente(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), "image/jpeg");

    const r = await conferirFotoPelosBytes(falso);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.mensagem).toContain("a extensão do nome não basta");
  });

  it("o MIME devolvido é o DETECTADO, mesmo quando o declarado é outro", async () => {
    // Um PNG de verdade, com o navegador dizendo "image/jpeg" (extensão .jpg).
    const png = arquivoQueMente(PNG, "image/jpeg");

    const r = await conferirFotoPelosBytes(png);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mime).toBe("image/png");
  });

  it("⛔ HEIC É ACEITO aqui — a diferença que justifica duas políticas", async () => {
    // Os provedores de IA não aceitam HEIC, e `sniffMime` (18-D) o recusa. Estas telas só
    // GUARDAM o arquivo: recusar a foto padrão do iPhone seria quebrar o uso real.
    const heic = new File([ftyp("heic") as unknown as BlobPart], "IMG_0001.HEIC", {
      type: "image/heic",
    });

    const r = await conferirFotoPelosBytes(heic);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mime).toBe("image/heic");
  });

  it("⛔ PDF é recusado: uma foto de evolução em PDF não é uma foto", async () => {
    const pdf = new File([PDF as unknown as BlobPart], "foto.jpg", { type: "image/jpeg" });

    const r = await conferirFotoPelosBytes(pdf);
    expect(r.ok).toBe(false);
    // E a allowlist é quem decide — `pdf` é detectável, e ainda assim não está nela.
    expect(FORMATOS_DE_FOTO).not.toContain("pdf");
  });

  it("todo formato aceito tem MIME canônico cadastrado", () => {
    for (const formato of FORMATOS_DE_FOTO) {
      expect(MIME_DO_FORMATO[formato], formato).toMatch(/^image\//);
    }
  });
});
