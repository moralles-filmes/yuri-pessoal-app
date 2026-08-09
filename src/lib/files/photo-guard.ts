/**
 * A TRAVA DE CONTEÚDO DAS FOTOS DO USUÁRIO — retroporte da 18-D para 16-C e 16-E.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ AS DUAS TELAS MAIS SENSÍVEIS DO SISTEMA CONFIAVAM NUM CAMPO DO NAVEGADOR.             ║
 * ║                                                                                       ║
 * ║ `photoFileSchema` (16-E) e `recipePhotoFileSchema` (16-C) conferem `file.type`, que o ║
 * ║ navegador deriva da EXTENSÃO do nome. Renomear qualquer arquivo para `foto.jpg`        ║
 * ║ produzia um `File` que passava nas duas — e o conteúdo ia para o bucket privado com    ║
 * ║ `mime_type: "image/jpeg"` gravado no metadado.                                         ║
 * ║                                                                                       ║
 * ║ ⛔ Isto NÃO substitui os schemas: eles continuam conferindo tamanho e o `File` ser um  ║
 * ║ `File`, e continuam dando as mensagens de campo. Esta função acrescenta a pergunta     ║
 * ║ que faltava — **o que este arquivo é de verdade?** —, e ela só pode ser feita sobre    ║
 * ║ os BYTES, o que exige `await`. Por isso ela é uma função, e não um `.refine()`.        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ **HEIC É ACEITO AQUI, e é a diferença que justifica este arquivo existir.** As fotos de
 * evolução e de receita só GUARDAM o arquivo — ele nunca sai do sistema. O envio de
 * comprovantes (18-D) recusa HEIC porque os provedores de IA não o aceitam, e falhar depois
 * da chamada paga seria pior que recusar antes. Duas políticas, um detector.
 */

import {
  BYTES_PARA_DETECTAR,
  detectarFormato,
  MIME_DO_FORMATO,
  type FormatoDetectado,
} from "./magic-bytes";

/**
 * Os formatos que uma FOTO do usuário pode ter.
 *
 * ⛔ `pdf` não está aqui de propósito: uma "foto de evolução" em PDF não é uma foto, e o
 * bucket dessas telas serve imagem para `<img>`. Recusar é honesto; aceitar e mostrar um
 * quadro quebrado não.
 */
export const FORMATOS_DE_FOTO: readonly FormatoDetectado[] = [
  "jpeg",
  "png",
  "webp",
  "heic",
];

export type VereditoDaFoto =
  | { readonly ok: true; readonly mime: string; readonly formato: FormatoDetectado }
  | { readonly ok: false; readonly mensagem: string };

const RECUSA_DESCONHECIDO =
  "Não foi possível identificar esta imagem pelo conteúdo do arquivo. Envie JPG, PNG, WEBP ou HEIC — a extensão do nome não basta.";

/**
 * Confere os BYTES REAIS de um `File`.
 *
 * ⚠️ Lê só os primeiros {@link BYTES_PARA_DETECTAR} bytes: as assinaturas que usamos terminam
 * no offset 12, e carregar 8 MB para a memória só para olhar o cabeçalho seria um jeito
 * barato de derrubar o servidor com uploads simultâneos.
 */
export async function conferirFotoPelosBytes(file: File): Promise<VereditoDaFoto> {
  const cabecalho = new Uint8Array(
    await file.slice(0, BYTES_PARA_DETECTAR).arrayBuffer(),
  );

  const formato = detectarFormato(cabecalho);
  if (formato === null || !FORMATOS_DE_FOTO.includes(formato)) {
    return { ok: false, mensagem: RECUSA_DESCONHECIDO };
  }

  return { ok: true, formato, mime: MIME_DO_FORMATO[formato] };
}
