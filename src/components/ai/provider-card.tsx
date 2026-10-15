"use client";

/**
 * Fase 18-A — IA · Card de um provedor (chave, modelos, limites, fallback).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A CHAVE ENTRA E NUNCA VOLTA.                                                          ║
 * ║                                                                                       ║
 * ║ O campo nasce vazio, o valor digitado só existe no estado local até o envio, e o que  ║
 * ║ o servidor devolve é `status` + `last_four` + `last_validated_at`. Não há caminho     ║
 * ║ para a chave completa reaparecer numa tela, num `props`, num log ou no HTML da página.║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  ShieldAlert,
  ShieldQuestion,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { ariaDoErro, ErroDoCampo } from "@/components/shared/erro-do-campo";
import { useLazyDialog } from "@/components/shared/use-lazy-dialog";
import { formatDate } from "@/lib/format";
import { activeModelsFor } from "@/lib/ai/core/models";
import {
  saveAiCredential,
  saveAiProviderConfig,
  testAiCredential,
} from "@/lib/actions/ai-providers";
import type { ProviderCardView } from "@/lib/ai/types";
import { lerDecimal } from "@/lib/ai/numero";
import { errosDaAction } from "@/lib/forms/mensagem-da-action";

const NENHUM = "__nenhum__";

/** Os campos deste cartão que podem receber erro (do conversor ou da action). */
const CAMPOS_COM_ERRO = ["dailyLimit", "monthlyLimit"] as const;
type CampoComErro = (typeof CAMPOS_COM_ERRO)[number];

/**
 * D2 — "Remover chave" confirma num diálogo próprio, que só baixa na primeira abertura
 * (regra 2 do carregamento sob demanda). Objeto literal escrito AQUI: o compilador do Next o
 * lê estaticamente e recusa constante compartilhada.
 */
const RemoverChaveDialog = dynamic(
  () => import("@/components/ai/remover-chave-dialog").then((m) => m.RemoverChaveDialog),
  { ssr: false, loading: () => null },
);

export function ProviderCard({
  card,
  criptoOk,
}: {
  card: ProviderCardView;
  criptoOk: boolean;
}) {
  const router = useRouter();
  const modelos = React.useMemo(() => activeModelsFor(card.provider), [card.provider]);

  const [chave, setChave] = React.useState("");
  const [salvandoChave, setSalvandoChave] = React.useState(false);
  const [testando, setTestando] = React.useState(false);
  const [salvandoConfig, setSalvandoConfig] = React.useState(false);
  const [erros, setErros] = React.useState<Partial<Record<CampoComErro, string>>>({});
  const [removerAberto, setRemoverAberto] = React.useState(false);
  const removerMontado = useLazyDialog(removerAberto);
  const botaoDeRemover = React.useRef<HTMLButtonElement | null>(null);

  function limparErro(campo: CampoComErro) {
    setErros((e) => {
      const resto = { ...e };
      delete resto[campo];
      return resto;
    });
  }

  const [form, setForm] = React.useState({
    enabled: card.enabled,
    defaultModel: card.defaultModel ?? NENHUM,
    economyModel: card.economyModel ?? NENHUM,
    advancedModel: card.advancedModel ?? NENHUM,
    fallbackAllowed: card.fallbackAllowed,
    dailyLimit: card.dailyLimit === null ? "" : String(card.dailyLimit),
    monthlyLimit: card.monthlyLimit === null ? "" : String(card.monthlyLimit),
  });

  const temCredencial = card.credentialStatus !== null;

  async function onSalvarChave() {
    if (chave.trim().length < 8) {
      toast.error("A chave parece curta demais.");
      return;
    }
    setSalvandoChave(true);
    const r = await saveAiCredential({ provider: card.provider, apiKey: chave.trim() });
    setSalvandoChave(false);

    if (!r.ok) {
      toast.error(r.fieldErrors?.apiKey?.[0] ?? r.error);
      return;
    }
    setChave("");
    toast.success(
      r.data.substituiu
        ? "Chave substituída e validada com o provedor."
        : "Chave guardada de forma cifrada. Teste a conexão quando quiser.",
    );
    router.refresh();
  }

  async function onTestar() {
    setTestando(true);
    const r = await testAiCredential({ provider: card.provider });
    setTestando(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(`Conexão validada. ${r.data.modelosVistos} modelos visíveis.`);
    router.refresh();
  }

  async function onSalvarConfig() {
    // Em branco é "sem limite próprio" (null), nunca zero; o que não é número fica no campo.
    const dia = lerDecimal(form.dailyLimit);
    const mes = lerDecimal(form.monthlyLimit);
    if (!dia.ok || !mes.ok) {
      setErros({
        ...(dia.ok ? {} : { dailyLimit: dia.motivo }),
        ...(mes.ok ? {} : { monthlyLimit: mes.motivo }),
      });
      document.getElementById(`${dia.ok ? "mes" : "dia"}-${card.provider}`)?.focus();
      return;
    }
    setErros({});
    setSalvandoConfig(true);
    const r = await saveAiProviderConfig({
      provider: card.provider,
      enabled: form.enabled,
      displayName: card.displayName,
      defaultModel: form.defaultModel === NENHUM ? null : form.defaultModel,
      economyModel: form.economyModel === NENHUM ? null : form.economyModel,
      advancedModel: form.advancedModel === NENHUM ? null : form.advancedModel,
      visionModel: null,
      timeoutMs: card.timeoutMs,
      maxRetries: card.maxRetries,
      dailyLimit: dia.valor,
      monthlyLimit: mes.valor,
      fallbackAllowed: form.fallbackAllowed,
      fallbackOrder: card.fallbackOrder,
    });
    setSalvandoConfig(false);

    if (!r.ok) {
      // Erro de campo que existe aqui fica sob o campo; o resto sobe com o nome do campo.
      const { porCampo, texto } = errosDaAction(r, CAMPOS_COM_ERRO);
      setErros(porCampo);
      toast.error(texto);
      return;
    }
    toast.success("Configuração salva.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-center gap-2">
              <span className="truncate">{card.label}</span>
              <StatusBadge card={card} />
            </CardTitle>
            <CardDescription>
              {temCredencial
                ? `Chave terminada em ${card.lastFour ?? "—"}${
                    card.lastValidatedAt
                      ? ` · validada em ${formatDate(card.lastValidatedAt)}`
                      : " · ainda não testada"
                  }`
                : "Nenhuma chave cadastrada."}
            </CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <a href={card.consoleUrl} target="_blank" rel="noreferrer">
              Console <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ── Chave ─────────────────────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label htmlFor={`chave-${card.provider}`}>
            {temCredencial ? "Substituir a chave de API" : "Chave de API"}
          </Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id={`chave-${card.provider}`}
              type="password"
              autoComplete="off"
              value={chave}
              onChange={(e) => setChave(e.target.value)}
              placeholder={card.keyHint}
              disabled={!criptoOk || salvandoChave}
              className="min-w-0 flex-1"
            />
            <Button
              type="button"
              onClick={() => void onSalvarChave()}
              disabled={!criptoOk || salvandoChave || chave.trim().length === 0}
            >
              {salvandoChave ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              Guardar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            A chave é cifrada antes de ir para o banco e nunca volta para a tela.{" "}
            {temCredencial
              ? "Ao substituir, ela só é gravada se passar no teste com o provedor — a chave atual não é perdida por engano."
              : "Ela é guardada sem validar; use “Testar conexão” quando quiser conferir."}
          </p>
        </div>

        {temCredencial && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void onTestar()}
              disabled={!criptoOk || testando}
            >
              {testando && <Loader2 className="size-4 animate-spin" />}
              Testar conexão
            </Button>
            <Button
              ref={botaoDeRemover}
              type="button"
              variant="ghost"
              size="sm"
              aria-haspopup="dialog"
              onClick={() => setRemoverAberto(true)}
              disabled={salvandoChave}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" /> Remover chave
            </Button>
          </div>
        )}

        {/* ── Modelos ───────────────────────────────────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-3">
          <ModelSelect
            id={`padrao-${card.provider}`}
            label="Modelo padrão"
            value={form.defaultModel}
            onChange={(v) => setForm((f) => ({ ...f, defaultModel: v }))}
            modelos={modelos}
          />
          <ModelSelect
            id={`economico-${card.provider}`}
            label="Econômico"
            value={form.economyModel}
            onChange={(v) => setForm((f) => ({ ...f, economyModel: v }))}
            modelos={modelos}
          />
          <ModelSelect
            id={`avancado-${card.provider}`}
            label="Avançado"
            value={form.advancedModel}
            onChange={(v) => setForm((f) => ({ ...f, advancedModel: v }))}
            modelos={modelos}
          />
        </div>

        {/* ── Limites (USD) ─────────────────────────────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`dia-${card.provider}`}>Limite diário (USD)</Label>
            <Input
              id={`dia-${card.provider}`}
              inputMode="decimal"
              value={form.dailyLimit}
              onChange={(e) => {
                setForm((f) => ({ ...f, dailyLimit: e.target.value }));
                limparErro("dailyLimit");
              }}
              placeholder="sem limite"
              {...ariaDoErro(`dia-${card.provider}-erro`, erros.dailyLimit)}
            />
            <ErroDoCampo id={`dia-${card.provider}-erro`} mensagem={erros.dailyLimit} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`mes-${card.provider}`}>Limite mensal (USD)</Label>
            <Input
              id={`mes-${card.provider}`}
              inputMode="decimal"
              value={form.monthlyLimit}
              onChange={(e) => {
                setForm((f) => ({ ...f, monthlyLimit: e.target.value }));
                limparErro("monthlyLimit");
              }}
              placeholder="sem limite"
              {...ariaDoErro(`mes-${card.provider}-erro`, erros.monthlyLimit)}
            />
            <ErroDoCampo id={`mes-${card.provider}-erro`} mensagem={erros.monthlyLimit} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Em branco significa <strong>sem limite próprio deste provedor</strong> — não é
          zero. O orçamento geral continua valendo.
        </p>

        {/* ── Interruptores ─────────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label htmlFor={`ativo-${card.provider}`}>Provedor ativo</Label>
              <p className="text-xs text-muted-foreground">
                Só provedores ativos, com chave e modelo padrão, entram na conversa.
              </p>
            </div>
            <Switch
              id={`ativo-${card.provider}`}
              checked={form.enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              className="shrink-0"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label htmlFor={`fb-${card.provider}`}>Permitir fallback a partir daqui</Label>
              <p className="text-xs text-muted-foreground">
                Nasce desligado. Fallback gasta em outro provedor, então é escolha explícita.
              </p>
            </div>
            <Switch
              id={`fb-${card.provider}`}
              checked={form.fallbackAllowed}
              onCheckedChange={(v) => setForm((f) => ({ ...f, fallbackAllowed: v }))}
              className="shrink-0"
            />
          </div>
        </div>

        <Button
          type="button"
          onClick={() => void onSalvarConfig()}
          disabled={salvandoConfig}
        >
          {salvandoConfig && <Loader2 className="size-4 animate-spin" />}
          Salvar configuração
        </Button>

        {removerMontado && (
          <RemoverChaveDialog
            aberto={removerAberto}
            onAbertoChange={setRemoverAberto}
            provider={card.provider}
            rotulo={card.label}
            focoDeVolta={botaoDeRemover}
            onRemovida={() => {
              setRemoverAberto(false);
              router.refresh();
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ card }: { card: ProviderCardView }) {
  if (card.credentialStatus === "valida") {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600">
        <CheckCircle2 className="size-3" /> validada
      </Badge>
    );
  }
  if (card.credentialStatus === "invalida") {
    return (
      <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
        <ShieldAlert className="size-3" /> inválida
      </Badge>
    );
  }
  if (card.credentialStatus === "nao_validada") {
    return (
      <Badge variant="outline" className="gap-1">
        <ShieldQuestion className="size-3" /> não testada
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      sem chave
    </Badge>
  );
}

function ModelSelect({
  id,
  label,
  value,
  onChange,
  modelos,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  modelos: ReturnType<typeof activeModelsFor>;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Nenhum" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NENHUM}>Nenhum</SelectItem>
          {modelos.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
