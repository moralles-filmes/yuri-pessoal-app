import Link from "next/link";
import { AlertTriangle, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AI_PROVIDER_LABEL } from "@/lib/ai/core/contracts";
import type { ProviderCardView } from "@/lib/ai/types";

/**
 * Fase 18-A — Card de IA dentro de **Configurações**.
 *
 * As credenciais dos provedores moram no módulo de Configurações (é onde o usuário procura
 * por "chave de API"), e a tela completa fica em `/ia/configuracoes`. Este card é o resumo
 * honesto: diz quantos provedores estão prontos e o que ainda falta, sem mostrar nada da
 * chave além do status.
 *
 * Server Component: `ProviderCardView` já vem sem material criptográfico.
 */
export function AiCard({
  cards,
  problemaCripto,
}: {
  cards: readonly ProviderCardView[];
  problemaCripto: string | null;
}) {
  const prontos = cards.filter((c) => c.enabled && c.credentialStatus !== null);
  const comChave = cards.filter((c) => c.credentialStatus !== null);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 shrink-0 text-primary" />
              Inteligência Artificial
            </CardTitle>
            <CardDescription>
              Chaves dos provedores, modelos, orçamento e preferências do assistente.
            </CardDescription>
          </div>
          <Button asChild size="sm">
            <Link href="/ia/configuracoes">Abrir configurações</Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {problemaCripto ? (
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p className="min-w-0 text-muted-foreground">{problemaCripto}</p>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-sm">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
            <p className="min-w-0 text-muted-foreground">
              As chaves são cifradas antes de ir para o banco e nunca voltam para a tela.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {cards.map((c) => (
            <Badge
              key={c.provider}
              variant="outline"
              className="font-normal"
              title={
                c.credentialStatus === null
                  ? "Sem chave cadastrada"
                  : c.enabled
                    ? "Ativo"
                    : "Chave cadastrada, provedor desativado"
              }
            >
              {AI_PROVIDER_LABEL[c.provider]}
              {c.credentialStatus === null
                ? " · sem chave"
                : c.enabled
                  ? " · ativo"
                  : " · inativo"}
            </Badge>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          {prontos.length === 0
            ? comChave.length === 0
              ? "Nenhuma chave cadastrada ainda."
              : "Há chave cadastrada, mas nenhum provedor está ativo."
            : `${prontos.length} de ${cards.length} provedores prontos para conversar.`}{" "}
          Nesta versão o assistente <strong>não consulta seus registros</strong> e não cria
          nem altera nada.
        </p>
      </CardContent>
    </Card>
  );
}
