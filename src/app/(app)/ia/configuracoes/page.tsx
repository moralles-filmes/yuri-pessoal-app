import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ProviderCard } from "@/components/ai/provider-card";
import { AiPreferencesForm } from "@/components/ai/ai-preferences-form";
import { RetentionCard } from "@/components/ai/retention-card";
import { getCurrentUser } from "@/lib/supabase/server";
import { getAiPreferences, getProviderCards } from "@/lib/ai/queries";
import { isCatalogStale, oldestVerification } from "@/lib/ai/core/models";
import { hojeISO } from "@/lib/format";
import { cryptoProblemMessage } from "@/lib/ai/server/crypto-readiness";

export const metadata: Metadata = { title: "Configurações · IA" };
export const dynamic = "force-dynamic";

/**
 * Fase 18-A — IA · Configurações do módulo.
 *
 * A tela avisa quando o catálogo de modelos está velho. Um catálogo que envelhece em
 * silêncio é pior que catálogo nenhum, porque parece confiável — e atualizar é editar um
 * arquivo puro (`core/models.ts` + `core/pricing.ts`), sem migration e sem deploy de schema.
 */
export default async function IaConfiguracoesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [cards, prefs] = await Promise.all([
    getProviderCards(user.id),
    getAiPreferences(user.id),
  ]);

  const problemaCripto = cryptoProblemMessage();
  const hoje = hojeISO();
  const catalogoVelho = isCatalogStale(hoje);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Configurações da IA"
        description="Provedores, chaves de API, modelos, orçamento e preferências."
      />

      {problemaCripto ? (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0 space-y-1">
            <p className="font-medium text-destructive">{problemaCripto}</p>
            <p className="text-muted-foreground">
              Nenhuma credencial pode ser salva ou lida sem isso. O restante do sistema
              continua funcionando normalmente — só a IA fica indisponível.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-xl border bg-muted/30 p-3 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
          <p className="min-w-0 text-muted-foreground">
            Suas chaves são guardadas cifradas (AES-256-GCM com envelope): uma chave própria
            por credencial, embrulhada por uma chave-mestra que vive apenas no ambiente do
            servidor e <strong>nunca</strong> no banco.
          </p>
        </div>
      )}

      {catalogoVelho && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <p className="min-w-0 text-muted-foreground">
            O catálogo de modelos e preços foi conferido pela última vez em{" "}
            {oldestVerification()}. Confira a documentação oficial dos provedores — os
            valores exibidos podem estar desatualizados.
          </p>
        </div>
      )}

      <AiPreferencesForm prefs={prefs} cards={cards} />

      <div className="space-y-4">
        <h2 className="text-sm font-semibold">Provedores</h2>
        {cards.map((card) => (
          <ProviderCard
            key={card.provider}
            card={card}
            criptoOk={problemaCripto === null}
          />
        ))}
      </div>

      {/* Fase 18-F — a única porta de exclusão em massa do módulo. Não há job que apague
          nada sozinho: descartar é clique do dono. */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold">Seus dados</h2>
        <RetentionCard />
      </div>
    </div>
  );
}
