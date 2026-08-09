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
import {
  AVISO_DA_ESCRITA,
  AVISO_MOEDA,
  ROTULO_DA_PERMISSAO,
  ROTULO_DA_PERMISSAO_DE_ESCRITA,
} from "@/lib/ai/constants";
import {
  TOOL_PERMISSIONS,
  TOOL_WRITE_PERMISSIONS,
  type ToolPermission,
  type ToolWritePermission,
} from "@/lib/ai/tools/contracts";
import {
  permissaoDeLeituraDaEscrita,
  toolsForPermission,
  toolsForWritePermission,
} from "@/lib/ai/tools/registry";
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
    // Cópia rasa do que veio do servidor: `getAiPreferences` já garante `false` para chave
    // ausente, nula ou de tipo inesperado. Nada aqui completa buraco por conta própria.
    permissions: { ...prefs.permissions },
    writePermissions: { ...prefs.writePermissions },
    /**
     * ⚠️ 18-D. `allowVision` EXISTIA no schema e na action desde a 18-D, mas nunca esteve
     * neste formulário — nem no estado, nem no payload. Como `aiPreferencesSchema` a exige
     * (`z.boolean()`, não opcional), TODO salvamento de preferências vinha sendo recusado
     * com "Autorização de envio de arquivo inválida". Corrigido junto com o Bloco 4, porque
     * um campo novo no mesmo schema herdaria o mesmo defeito.
     */
    allowVision: prefs.allowVision,
    allowInsightJobs: prefs.allowInsightJobs,
    jobMonthlyBudget: String(prefs.jobMonthlyBudget),
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
      permissions: form.permissions,
      writePermissions: form.writePermissions,
      allowVision: form.allowVision,
      allowInsightJobs: form.allowInsightJobs,
      jobMonthlyBudget: Number(form.jobMonthlyBudget),
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

        {/* ── Leituras autorizadas ──────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">Leituras autorizadas</h3>
            <p className="text-xs text-muted-foreground">
              O assistente só consulta um módulo se a chave dele estiver ligada aqui. Todas
              nascem desligadas, valem só para <strong>leitura</strong> e podem ser
              desligadas a qualquer momento. Alterar exige uma segunda chave, logo abaixo.
            </p>
          </div>

          <div className="space-y-3">
            {TOOL_PERMISSIONS.map((chave) => (
              <PermissaoLinha
                key={chave}
                chave={chave}
                ligada={form.permissions[chave]}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    permissions: { ...f.permissions, [chave]: v },
                  }))
                }
              />
            ))}
          </div>
        </div>

        {/* ── Alterações autorizadas (18-C) ─────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">Alterações autorizadas</h3>
            <p className="text-xs text-muted-foreground">{AVISO_DA_ESCRITA}</p>
          </div>

          <div className="space-y-3">
            {TOOL_WRITE_PERMISSIONS.map((chave) => (
              <PermissaoDeEscritaLinha
                key={chave}
                chave={chave}
                ligada={form.writePermissions[chave]}
                /**
                 * ⚠️ A chave de escrita depende da de LEITURA — e a tela mostra isso em vez de
                 * deixar o usuário ligar algo que o guard vai recusar depois. Propor uma
                 * alteração começa por resolver de qual registro se fala, e isso é ler.
                 */
                permissions={form.permissions}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    writePermissions: { ...f.writePermissions, [chave]: v },
                  }))
                }
              />
            ))}
          </div>
        </div>

        {/* ── Envio de arquivos (18-D) ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Label htmlFor="pref-visao">Enviar comprovantes para leitura</Label>
            <p className="text-xs text-muted-foreground">
              O arquivo <strong>sai deste sistema</strong> e vai para o provedor escolhido —
              é o único efeito do módulo que não se desfaz. Precisa da leitura{" "}
              <strong>e</strong> da alteração do Financeiro ligadas: o comprovante lido vira
              proposta de lançamento, e sem elas não teria para onde ir.
            </p>
          </div>
          <Switch
            id="pref-visao"
            checked={form.allowVision}
            disabled={
              !form.permissions.allow_finance || !form.writePermissions.allow_write_finance
            }
            onCheckedChange={(v) => setForm((f) => ({ ...f, allowVision: v }))}
            className="shrink-0"
          />
        </div>

        {/* ── Análise automática (18-E · Bloco 4) ───────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label htmlFor="pref-jobs">Gerar análises sozinho, uma vez por dia</Label>
              <p className="text-xs text-muted-foreground">
                É o único gasto que acontece <strong>sem você estar olhando</strong>. Ela
                cobre Financeiro, Treinos e Dieta, e <strong>pula</strong> o módulo cuja
                leitura estiver desligada — sem derrubar os outros. Se os números não mudaram
                desde a última análise, nada é chamado e nada é cobrado.
              </p>
            </div>
            <Switch
              id="pref-jobs"
              checked={form.allowInsightJobs}
              onCheckedChange={(v) => setForm((f) => ({ ...f, allowInsightJobs: v }))}
              className="shrink-0"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pref-job-teto">Teto da análise automática (USD/mês)</Label>
            <Input
              id="pref-job-teto"
              inputMode="decimal"
              value={form.jobMonthlyBudget}
              onChange={(e) =>
                setForm((f) => ({ ...f, jobMonthlyBudget: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Teto <strong>próprio</strong>, e ele não substitui o mensal: a análise
              automática passa pelos dois, e qualquer um dos dois a barra. Diferente dos
              orçamentos acima, este não pode ficar em branco — deixá-lo sem valor seria não
              ter teto justamente sobre o gasto que ninguém está vendo.
            </p>
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

/**
 * Uma autorização de leitura.
 *
 * ⚠️ **A chave de um módulo SEM ferramenta fica desabilitada, e a tela diz por quê.** Ligá-la
 * não liberaria nada: `guardToolCall` só consulta a flag depois de encontrar a ferramenta no
 * registry, então uma flag sem ferramenta correspondente é exatamente o botão fantasma que a
 * subfase proíbe. Quem responde "tem ferramenta?" é `toolsForPermission`, DERIVADO do registry
 * — no dia em que a 18-C acrescentar a primeira leitura de Finanças, a chave se habilita
 * sozinha, com a lista real do que ela passa a permitir.
 *
 * Responsividade: o lado do texto é `min-w-0` porque o irmão (`Switch`) é `shrink-0` — sem
 * isso a frase longa empurra o controle para fora do card.
 */
function PermissaoLinha({
  chave,
  ligada,
  onChange,
}: {
  chave: ToolPermission;
  ligada: boolean;
  onChange: (valor: boolean) => void;
}) {
  const rotulo = ROTULO_DA_PERMISSAO[chave];
  const ferramentas = toolsForPermission(chave);
  const disponivel = ferramentas.length > 0;
  const id = `pref-${chave}`;

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0 space-y-1">
        <Label htmlFor={id} className="block">
          {rotulo.titulo}
        </Label>
        <p className="text-xs text-muted-foreground">{rotulo.frase}</p>
        {disponivel ? (
          <p className="text-xs text-muted-foreground">
            Consultas disponíveis:{" "}
            {ferramentas.map((f) => f.itemLabel).join(" · ")}.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Ainda não existe consulta deste módulo nesta versão — a chave se habilita quando
            a primeira for publicada.
          </p>
        )}
      </div>
      <Switch
        id={id}
        checked={ligada}
        onCheckedChange={onChange}
        disabled={!disponivel}
        aria-label={`Autorizar leitura de ${rotulo.titulo}`}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}

/**
 * Uma autorização de ESCRITA (18-C · Bloco 4).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ DUAS CONDIÇÕES PARA A CHAVE FICAR CLICÁVEL, E AS DUAS SÃO DERIVADAS.                  ║
 * ║                                                                                       ║
 * ║  1. existir ferramenta de escrita do módulo (`toolsForWritePermission`) — senão é      ║
 * ║     botão fantasma, o mesmo defeito do lado da leitura;                                ║
 * ║  2. a chave de LEITURA do módulo estar ligada — porque o guard exige as duas, e ligar  ║
 * ║     só esta descreveria um estado que não existe. A dependência sai do próprio          ║
 * ║     descriptor (`permissaoDeLeituraDaEscrita`), nunca de uma tabela paralela.           ║
 * ║                                                                                       ║
 * ║ Quando falta a leitura, a tela DIZ qual chave ligar antes — desabilitar em silêncio    ║
 * ║ deixaria a pessoa clicando num controle morto sem saber o que fazer.                    ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
function PermissaoDeEscritaLinha({
  chave,
  ligada,
  permissions,
  onChange,
}: {
  chave: ToolWritePermission;
  ligada: boolean;
  permissions: Readonly<Record<ToolPermission, boolean>>;
  onChange: (valor: boolean) => void;
}) {
  const rotulo = ROTULO_DA_PERMISSAO_DE_ESCRITA[chave];
  const ferramentas = toolsForWritePermission(chave);
  const leitura = permissaoDeLeituraDaEscrita(chave);
  const temFerramenta = ferramentas.length > 0;
  const leituraLigada = leitura !== null && permissions[leitura] === true;
  const disponivel = temFerramenta && leituraLigada;
  const id = `pref-${chave}`;

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0 space-y-1">
        <Label htmlFor={id} className="block">
          {rotulo.titulo}
        </Label>
        <p className="text-xs text-muted-foreground">{rotulo.frase}</p>
        {!temFerramenta ? (
          <p className="text-xs text-muted-foreground">
            Ainda não existe alteração deste módulo nesta versão — a chave se habilita quando
            a primeira for publicada.
          </p>
        ) : !leituraLigada ? (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            Ligue antes a leitura de {leitura ? ROTULO_DA_PERMISSAO[leitura].titulo : "—"}:
            preparar uma alteração começa por consultar o registro.
          </p>
        ) : null}
      </div>
      <Switch
        id={id}
        checked={ligada}
        onCheckedChange={onChange}
        disabled={!disponivel}
        aria-label={`Autorizar alterações em ${rotulo.titulo}`}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}
