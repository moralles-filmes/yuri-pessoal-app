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
  anexarDocumentoATransacao,
  descartarDocumento,
  guardarDocumento,
} from "@/lib/ai/server/document-store";
import { runExtraction } from "@/lib/ai/server/extraction-runner";
import {
  prepararLancamentoDoComprovante as prepararLancamento,
  type PropostaDoComprovante,
} from "@/lib/ai/approval/document";
import type { ExtracaoDeComprovante } from "@/lib/ai/vision/contracts";
import {
  anexarComprovanteSchema,
  documentoRefSchema,
  observacaoDocumentoSchema,
  prepararLancamentoDoComprovanteSchema,
} from "@/lib/validators/ai";
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
 * **PROCESSO 2 do desenho** — a leitura. É a partir daqui que o arquivo sai do sistema.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ ESTA AÇÃO NÃO LANÇA NADA, E NÃO TEM COMO LANÇAR.                                   ║
 * ║                                                                                       ║
 * ║ Ela chama `runExtraction`, que grava numa tabela `ai_*` e não conhece serviço de       ║
 * ║ módulo nenhum. Propor o lançamento é o Processo 3, e ele começa com o dono revisando   ║
 * ║ campo a campo — o critério "nenhum lançamento definitivo é criado só por ter recebido  ║
 * ║ imagem" é verdadeiro por construção, não por checagem.                                 ║
 * ║                                                                                       ║
 * ║ As três chaves são conferidas AQUI **e** dentro do RPC. A daqui existe para a mensagem ║
 * ║ dizer QUAL falta; a de lá existe porque um usuário autenticado pode chamar o RPC       ║
 * ║ direto, e a Server Action não é a última barreira de nada.                             ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
export async function extrairComprovante(
  input: unknown,
): Promise<ActionResult<{ extractionId: string; extracao: ExtracaoDeComprovante }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = documentoRefSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const autorizado = await autorizacaoDeEnvio(ctx.userId);
  if (!autorizado.ok) return { ok: false, error: autorizado.mensagem };

  const resultado = await runExtraction({
    userId: ctx.userId,
    documentoId: parsed.data.documentoId,
    // O relógio real entra AQUI, na casca — o runner e o rebaixamento recebem `hoje`/`agora`
    // injetados, e é isso que os torna testáveis sem esperar o calendário virar.
    agora: new Date(),
  });

  // A falha também mexe na tela: ela grava uma tentativa de leitura com `status = 'falhou'`,
  // e o dono precisa vê-la. Revalidar nos dois desfechos.
  revalidatePath(ROTA);
  revalidatePath("/ia/consumo");

  if (!resultado.ok) return { ok: false, error: resultado.message };

  return {
    ok: true,
    data: { extractionId: resultado.extractionId, extracao: resultado.extracao },
  };
}

/**
 * **PROCESSO 3 do desenho** — a revisão vira uma proposta. E só uma proposta.
 *
 * ⛔ Ela passa pelo MESMO motor da 18-C: mesmo hash do efeito, mesmo prazo de 10 minutos
 * vindo do banco, mesmo uso único, mesma revalidação por recálculo. Quem executa continua
 * sendo `confirmarAcaoDaIa` — esta action não alcança `approval/execute.ts`, e o teste de
 * fronteira falha se alguém a fizer alcançar.
 */
export async function prepararLancamentoDoComprovante(
  input: unknown,
): Promise<ActionResult<PropostaDoComprovante>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = prepararLancamentoDoComprovanteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const autorizado = await autorizacaoDeEnvio(ctx.userId);
  if (!autorizado.ok) return { ok: false, error: autorizado.mensagem };

  const r = await prepararLancamento({
    userId: ctx.userId,
    extractionId: parsed.data.extractionId,
    correcoes: parsed.data.correcoes,
    escolha: {
      conta: parsed.data.conta ?? null,
      cartao: parsed.data.cartao ?? null,
      categoria: parsed.data.categoria ?? null,
    },
  });
  if (!r.ok) return { ok: false, error: r.mensagem };

  // Sem `revalidatePath`: nada mudou nos módulos, e a proposta ainda está por decidir. A
  // invalidação acontece quando ela for confirmada — em `confirmarAcaoDaIa`.
  return { ok: true, data: r.proposta };
}

/**
 * O comprovante passa a ser anexo DO LANÇAMENTO. Chamada DEPOIS da confirmação.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ POR QUE ISTO É UMA SEGUNDA AÇÃO, E NÃO PARTE DA EXECUÇÃO.                          ║
 * ║                                                                                       ║
 * ║ Anexo, caminho de bucket e URL assinada **não entram em `changed_fields`** (§3.6), e a ║
 * ║ trava lá é de FORMA, não uma lista de nomes proibidos. Embutir a anexação no command   ║
 * ║ de `lancarTransacao` faria o Approval Engine escrever em `attachments` — uma tabela    ║
 * ║ que não é dele — e obrigaria a allowlist a ganhar um campo de anexo.                   ║
 * ║                                                                                       ║
 * ║ O preço é uma janela: o lançamento existe e o arquivo ainda não está ligado a ele. Se  ║
 * ║ esta ação falhar, o comprovante continua na lista como enviado, visível, e o dono      ║
 * ║ decide. Errar para "o arquivo ficou solto" é melhor que errar para "o Approval Engine  ║
 * ║ escreve onde quiser".                                                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
export async function anexarComprovanteAoLancamento(
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = anexarComprovanteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const anexou = await anexarDocumentoATransacao(
    ctx.supabase,
    ctx.userId,
    parsed.data.documentoId,
    parsed.data.transacaoId,
  );

  if (!anexou) {
    return dbError(
      "O lançamento foi criado, mas o comprovante não foi anexado a ele. Ele continua na lista de comprovantes.",
    );
  }

  revalidatePath(ROTA);
  revalidatePath("/financeiro/lancamentos");
  return { ok: true, data: undefined };
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
