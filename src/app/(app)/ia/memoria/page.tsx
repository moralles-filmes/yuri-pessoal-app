import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Info, KeyRound } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { MemoryClient } from "@/components/ai/memory-client";
import { getCurrentUser } from "@/lib/supabase/server";
import { getAiPreferences } from "@/lib/ai/queries";
import { getMemorias } from "@/lib/ai/memory/queries";
import { AVISO_DA_MEMORIA, ROTULO_DO_ESTADO_DA_MEMORIA } from "@/lib/ai/memory/contracts";
import { dateInSaoPaulo } from "@/lib/format";

export const metadata: Metadata = { title: "Memória · IA" };
export const dynamic = "force-dynamic";

/**
 * Fase 18-F · Bloco 3 — IA · Memória.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ ESTA É A ÚNICA PORTA EM QUE O DONO ESCREVE, EDITA E APAGA.                          ║
 * ║                                                                                       ║
 * ║ A IA só PROPÕE, pelo Approval Engine, e o que ela propõe chega aqui já confirmado por ║
 * ║ ele. "Nada sensível é salvo automaticamente" é verdadeiro por construção — nada é     ║
 * ║ salvo automaticamente.                                                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ═══════════════════════ O QUE ESTA TELA SE RECUSA A FAZER ═══════════════════════
 *
 *  • NÃO esconde a memória expirada, a desativada nem a esquecida. Expirar não apaga, e o
 *    dono precisa poder reler o que escreveu — com o estado ao lado.
 *  • NÃO resolve o estado no cliente. `estadoDaMemoria` puxa `@/lib/format` (e `date-fns`
 *    atrás dele); ele é resolvido aqui, no servidor, e desce como rótulo pronto.
 *  • NÃO some com a lista quando `allow_memory` está desligada. A chave decide se o
 *    ASSISTENTE lê as preferências, não se o dono pode escrevê-las.
 *  • NÃO mostra `storage_path`, id de linha nem nada que o dono não tenha escrito.
 */
export default async function MemoriaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // O relógio real entra AQUI, na casca. `estadoDaMemoria` recebe `agora` injetado.
  const agora = new Date();
  const [memorias, prefs] = await Promise.all([
    getMemorias(user.id, agora),
    getAiPreferences(user.id),
  ]);

  /**
   * O estado vira rótulo AQUI. A lista que desce ao cliente não leva `expiresAt` cru nem
   * pede a ele que saiba o que "vigente" significa — ela leva o que a tela escreve.
   */
  const linhas = memorias.map((m) => ({
    id: m.id,
    conteudo: m.conteudo,
    modulo: m.modulo,
    estado: m.estado,
    rotuloDoEstado: ROTULO_DO_ESTADO_DA_MEMORIA[m.estado],
    // ⛔ `dateInSaoPaulo`, nunca `.slice(0,10)`: `expires_at` é `timestamptz`.
    prazo: m.expiresAt ? dateInSaoPaulo(new Date(m.expiresAt)) : null,
    expirouEm: m.expirouEm ?? null,
    origem: m.origem,
    criadaEm: dateInSaoPaulo(new Date(m.criadaEm)),
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Memória"
        description="As preferências que o assistente leva para toda conversa. Você escreve, edita e apaga aqui."
      />

      {/*
        O aviso não é decoração: é a §6.4 em pt-BR, no lugar em que o dono decide o que
        escrever. Ele diz ao dono a mesma coisa que a seção do prompt diz ao assistente.
      */}
      <div className="flex items-start gap-2 rounded-xl border bg-muted/30 p-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 text-muted-foreground">{AVISO_DA_MEMORIA}</p>
      </div>

      {/*
        ⚠️ O ESTADO DAS DUAS CHAVES, com o caminho para mudá-lo.

        Sem isto, o dono escreveria preferências que o assistente nunca leria e não teria como
        descobrir por quê — a lista continuaria ali, igual, com tudo "em uso". É o mesmo
        cuidado da tela de insights com o rodapé da varredura: o que NÃO está acontecendo é
        justamente o que ele não tem como perceber sozinho.
      */}
      {!prefs.permissions.allow_memory || !prefs.writePermissions.allow_write_memory ? (
        <div className="flex items-start gap-2 rounded-xl border border-dashed p-3 text-sm">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 space-y-1 text-muted-foreground">
            {!prefs.permissions.allow_memory ? (
              <p>
                O assistente ainda <strong>não usa</strong> a sua memória: estas frases não
                entram nas conversas. Ligue &quot;Memória&quot; nas preferências de IA.
              </p>
            ) : null}
            {!prefs.writePermissions.allow_write_memory ? (
              <p>
                A IA não propõe preferências novas. Você continua escrevendo as suas aqui.
              </p>
            ) : null}
            <Link
              href="/ia/configuracoes"
              className="inline-block font-medium text-foreground underline underline-offset-4"
            >
              Abrir as preferências de IA
            </Link>
          </div>
        </div>
      ) : null}

      <MemoryClient memorias={linhas} />
    </div>
  );
}
