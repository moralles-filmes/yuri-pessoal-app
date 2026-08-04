"use client";

/**
 * Fase 18-A — IA · Preferências gerais do módulo.
 *
 * ⚠️ O "modo de confirmação" é gravado e a tela DIZ que ele ainda não faz nada — porque na
 * 18-A não existe escrita nenhuma. Mostrar um controle que promete o que não entrega seria
 * exatamente o tipo de mentira que a trava de honestidade existe para impedir.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AI_PROVIDER_LABEL, type AiProviderId } from "@/lib/ai/core/contracts";
import { activeModelsFor } from "@/lib/ai/core/models";
import { AVISO_MOEDA } from "@/lib/ai/constants";
import { saveAiPreferences } from "@/lib/actions/ai-preferences";
import type { AiPreferencesView, ProviderCardView } from "@/lib/ai/types";

const NENHUM = "__nenhum__";

export function AiPreferencesForm({
  prefs,
  cards,
}: {
  prefs: AiPreferencesView;
  cards: readonly ProviderCardView[];
}) {
  const router = useRouter();
  const [salvando, setSalvando] = React.useState(false);

  const [form, setForm] = React.useState({
    defaultProvider: prefs.defaultProvider ?? NENHUM,
    defaultModel: prefs.defaultModel ?? NENHUM,
    confirmationMode: prefs.confirmationMode,
    allowFallback: prefs.allowFallback,
    dailyBudget: prefs.dailyBudget === null ? "" : String(prefs.dailyBudget),
    monthlyBudget: prefs.monthlyBudget === null ? "" : String(prefs.monthlyBudget),
    budgetBlockOnLimit: prefs.budgetBlockOnLimit,
    reservationMargin: String(prefs.reservationMargin),
    rateLimitPerMinute: String(prefs.rateLimitPerMinute),
    rateLimitPerHour: String(prefs.rateLimitPerHour),
  });

  const provedoresProntos = cards.filter((c) => c.enabled && c.credentialStatus !== null);
  const modelosDoPadrao =
    form.defaultProvider === NENHUM
      ? []
      : activeModelsFor(form.defaultProvider as AiProviderId);

  async function salvar() {
    setSalvando(true);
    const r = await saveAiPreferences({
      defaultProvider: form.defaultProvider === NENHUM ? null : form.defaultProvider,
      defaultModel: form.defaultModel === NENHUM ? null : form.defaultModel,
      confirmationMode: form.confirmationMode,
      allowFallback: form.allowFallback,
      dailyBudget: form.dailyBudget.trim() === "" ? null : Number(form.dailyBudget),
      monthlyBudget: form.monthlyBudget.trim() === "" ? null : Number(form.monthlyBudget),
      budgetBlockOnLimit: form.budgetBlockOnLimit,
      reservationMargin: Number(form.reservationMargin),
      rateLimitPerMinute: Number(form.rateLimitPerMinute),
      rateLimitPerHour: Number(form.rateLimitPerHour),
    });
    setSalvando(false);

    if (!r.ok) {
      const primeiro = Object.values(r.fieldErrors ?? {})[0]?.[0];
      toast.error(primeiro ?? r.error);
      return;
    }
    toast.success("Preferências salvas.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferências</CardTitle>
        <CardDescription>
          Padrões de provedor e modelo, orçamento e limites de uso.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="pref-provedor">Provedor padrão</Label>
            <Select
              value={form.defaultProvider}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, defaultProvider: v, defaultModel: NENHUM }))
              }
            >
              <SelectTrigger id="pref-provedor" className="w-full">
                <SelectValue placeholder="Nenhum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NENHUM}>Nenhum</SelectItem>
                {provedoresProntos.map((c) => (
                  <SelectItem key={c.provider} value={c.provider}>
                    {AI_PROVIDER_LABEL[c.provider]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="pref-modelo">Modelo padrão</Label>
            <Select
              value={form.defaultModel}
              onValueChange={(v) => setForm((f) => ({ ...f, defaultModel: v }))}
              disabled={form.defaultProvider === NENHUM}
            >
              <SelectTrigger id="pref-modelo" className="w-full">
                <SelectValue placeholder="Nenhum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NENHUM}>Nenhum</SelectItem>
                {modelosDoPadrao.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Orçamento ─────────────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pref-dia">Orçamento diário (USD)</Label>
              <Input
                id="pref-dia"
                inputMode="decimal"
                value={form.dailyBudget}
                onChange={(e) => setForm((f) => ({ ...f, dailyBudget: e.target.value }))}
                placeholder="sem limite"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pref-mes">Orçamento mensal (USD)</Label>
              <Input
                id="pref-mes"
                inputMode="decimal"
                value={form.monthlyBudget}
                onChange={(e) => setForm((f) => ({ ...f, monthlyBudget: e.target.value }))}
                placeholder="sem limite"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{AVISO_MOEDA}</p>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label htmlFor="pref-bloqueio">Bloquear ao atingir o limite</Label>
              <p className="text-xs text-muted-foreground">
                O bloqueio acontece <strong>antes</strong> de chamar o provedor, na mesma
                transação que reserva o custo da mensagem.
              </p>
            </div>
            <Switch
              id="pref-bloqueio"
              checked={form.budgetBlockOnLimit}
              onCheckedChange={(v) => setForm((f) => ({ ...f, budgetBlockOnLimit: v }))}
              className="shrink-0"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pref-margem">Margem de segurança da reserva</Label>
            <Input
              id="pref-margem"
              inputMode="decimal"
              value={form.reservationMargin}
              onChange={(e) =>
                setForm((f) => ({ ...f, reservationMargin: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Antes de chamar o provedor, o sistema reserva o custo do <em>pior caso</em>{" "}
              (modelo mais caro autorizado × tentativas permitidas × esta margem). Ao
              terminar, vale o custo real. Margem menor libera mais mensagens; margem maior
              protege melhor o orçamento.
            </p>
          </div>
        </div>

        {/* ── Fallback e limites ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Label htmlFor="pref-fallback">Permitir fallback entre provedores</Label>
            <p className="text-xs text-muted-foreground">
              Precisa estar ligado aqui <strong>e</strong> no provedor de origem. Chave
              inválida, cancelamento e conteúdo recusado nunca fazem fallback.
            </p>
          </div>
          <Switch
            id="pref-fallback"
            checked={form.allowFallback}
            onCheckedChange={(v) => setForm((f) => ({ ...f, allowFallback: v }))}
            className="shrink-0"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pref-rpm">Mensagens por minuto</Label>
            <Input
              id="pref-rpm"
              inputMode="numeric"
              value={form.rateLimitPerMinute}
              onChange={(e) =>
                setForm((f) => ({ ...f, rateLimitPerMinute: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pref-rph">Mensagens por hora</Label>
            <Input
              id="pref-rph"
              inputMode="numeric"
              value={form.rateLimitPerHour}
              onChange={(e) =>
                setForm((f) => ({ ...f, rateLimitPerHour: e.target.value }))
              }
            />
          </div>
        </div>

        {/* ── Modo de confirmação: gravado agora, consumido na 18-C ─────────────────── */}
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="pref-confirmacao">Modo de confirmação</Label>
          <Select
            value={form.confirmationMode}
            onValueChange={(v) =>
              setForm((f) => ({
                ...f,
                confirmationMode: v as AiPreferencesView["confirmationMode"],
              }))
            }
          >
            <SelectTrigger id="pref-confirmacao" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="seguro">Seguro — confirma tudo</SelectItem>
              <SelectItem value="equilibrado">Equilibrado</SelectItem>
              <SelectItem value="rapido">Rápido</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Guardado desde já, mas ainda <strong>sem efeito</strong>: nesta versão a IA não
            cria nem altera nada, então não há o que confirmar.
          </p>
        </div>

        <Button type="button" onClick={() => void salvar()} disabled={salvando}>
          {salvando && <Loader2 className="size-4 animate-spin" />}
          Salvar preferências
        </Button>
      </CardContent>
    </Card>
  );
}
