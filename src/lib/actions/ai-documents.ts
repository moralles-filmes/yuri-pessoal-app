"use server";

/**
 * Fase 18-D — IA · O envio do comprovante. **PROCESSO 1 do desenho.**
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ NADA SAI DO SISTEMA NESTE ARQUIVO.                                                 ║
 * ║                                                                                       ║
 * ║ Aqui o arquivo é validado pelos BYTES, medido e guardado no bucket privado. Nenhuma   ║
 * ║ chamada a provedor acontece — quem faz isso é o Processo 2 (`extraction-runner`),     ║
 * ║ noutra ação, depois de o dono decidir extrair.                                        ║
 * ║                                                                                       ║
 * ║ É o que torna "o arquivo não sai sem autorização" verdadeiro POR CONSTRUÇÃO: mesmo    ║
 * ║ que a checagem de `allow_vision` abaixo tivesse um bug, este caminho não tem para     ║
 * ║ onde mandar nada.                                                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Casca fina, como manda o contrato de Server Action do projeto: auth + Zod + serviço +
 * `revalidatePath`. Os bytes são tratados em `ai/server/document-store.ts`, que é
 * `server-only`.
 */

import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { getAiPreferences } from "@/lib/ai/queries";
import {
  descartarDocumento,
  guardarDocumento,
} from "@/lib/ai/server/document-store";
import { documentoRefSchema, observacaoDocumentoSchema } from "@/lib/validators/ai";
import { limiteDeBytes } from "@/lib/ai/vision/limits";
import type { ActionResult } from "@/types/finance";

const ROTA = "/ia/comprovantes";

/**
 * ⚠️ **AS TRÊS CHAVES, ANDadas.**
 *
 * `allow_vision` sozinha não basta, e a razão não é cerimônia: um comprovante extraído
 * precisa resolver conta e categoria (leitura do Financeiro) e virar uma proposta de
 * lançamento (escrita do Financeiro). Sem as duas, o arquivo sairia do sistema para uma
 * extração que não teria para onde ir — o pior negócio possível.
 *
 * A mensagem diz QUAL chave falta, porque "sem permissão" mandaria o dono caçar entre
 * quinze interruptores.
 */
async function autorizacaoDeEnvio(
  userId: string,
): Promise<{ ok: true } | { ok: false; mensagem: string }> {
  const prefs = await getAiPreferences(userId);

  if (!prefs.permissions.allow_finance) {
    return {
      ok: false,
      mensagem:
        "Para ler comprovantes, autorize antes a leitura do Financeiro em /ia/configuracoes.",
    };
  }
  if (!prefs.writePermissions.allow_write_finance) {
    return {
      ok: false,
      mensagem:
        "Para lançar a partir de um comprovante, autorize as alterações no Financeiro em /ia/configuracoes.",
    };
  }
  if (!prefs.allowVision) {
    return {
      ok: false,
      mensagem:
        "O envio de arquivos para a IA está desligado. Ligue em /ia/configuracoes — " +
        "lembrando que o arquivo sai deste sistema e vai para o provedor escolhido.",
    };
  }
  return { ok: true };
}

export async function enviarComprovante(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const autorizado = await autorizacaoDeEnvio(ctx.userId);
  if (!autorizado.ok) return invalid({ arquivo: [autorizado.mensagem] });

  const observacao = observacaoDocumentoSchema.safeParse(formData.get("observacao"));
  if (!observacao.success) {
    return invalid({ observacao: observacao.error.issues.map((i) => i.message) });
  }

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) {
    return invalid({ arquivo: ["Escolha um arquivo."] });
  }

  // ⚠️ Uma barreira de tamanho ANTES de ler os bytes para a memória. `guardarDocumento`
  // confere de novo, por espécie, sobre o conteúdo real — mas ler 500 MB para só então
  // recusar seria um jeito barato de derrubar o servidor. Aqui o teto é o MAIOR dos dois
  // limites, porque a espécie ainda não é conhecida (ela sai dos bytes).
  const tetoAbsoluto = Math.max(limiteDeBytes("imagem"), limiteDeBytes("pdf"));
  if (arquivo.size > tetoAbsoluto) {
    const mb = Math.round(tetoAbsoluto / (1024 * 1024));
    return invalid({
      arquivo: [`O arquivo tem ${(arquivo.size / (1024 * 1024)).toFixed(1)} MB e o limite é ${mb} MB.`],
    });
  }
  if (arquivo.size === 0) {
    return invalid({ arquivo: ["O arquivo está vazio."] });
  }

  const bytes = new Uint8Array(await arquivo.arrayBuffer());

  const resultado = await guardarDocumento({
    supabase: ctx.supabase,
    userId: ctx.userId,
    bytes,
    nomeOriginal: arquivo.name,
    observacao: observacao.data,
  });

  if (!resultado.ok) {
    // Recusa de conteúdo é erro de CAMPO (o dono pode trocar o arquivo); falha de
    // infraestrutura é erro de ação. Misturar os dois faria o toast dizer "tente de novo"
    // para um HEIC, que nunca vai funcionar por mais que se tente.
    const infra = resultado.falha.motivo === "storage" || resultado.falha.motivo === "banco";
    return infra
      ? dbError(resultado.falha.mensagem)
      : invalid({ arquivo: [resultado.falha.mensagem] });
  }

  revalidatePath(ROTA);
  return { ok: true, data: { id: resultado.documento.id } };
}

/**
 * Descarta um envio que não virou nada.
 *
 * ⛔ Comprovante que JÁ virou anexo de uma transação **não é descartável por aqui** — quem o
 * apaga é o Financeiro, junto com o lançamento. `descartarDocumento` recusa pelo
 * `entity_type`, e a recusa vira mensagem, não silêncio.
 */
export async function descartarComprovante(input: unknown): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = documentoRefSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const apagou = await descartarDocumento(
    ctx.supabase,
    ctx.userId,
    parsed.data.documentoId,
  );

  if (!apagou) {
    return dbError(
      "Não foi possível descartar. Se este comprovante já foi anexado a um lançamento, " +
        "exclua-o pelo Financeiro.",
    );
  }

  revalidatePath(ROTA);
  return { ok: true, data: undefined };
}
