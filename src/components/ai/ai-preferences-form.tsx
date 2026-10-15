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
// ⚠️ Módulo PURO, sem um único import de runtime — pela mesma razão de `@/lib/ai/constants`
// acima: a tela não pode arrastar `zod` para ler quatro constantes.
import {
  ATALHO_DO_PAINEL,
  CANTOS_DO_BOTAO,
  ROTULO_DO_CANTO,
  type CantoDoBotao,
} from "@/lib/ai/painel";
import {
  TOOL_PERMISSIONS,
  TOOL_WRITE_PERMISSIONS,
  type ToolPermission,
  type ToolWritePermission,
} from "@/lib/ai/tools/contracts";
// ⚠️ D2 — o Tool Registry NÃO entra aqui: ele levava os 30 descritores (descrições para o modelo
// e JSON Schemas) ao navegador. O Server Component o lê e passa `catalogo` por prop.
import type { CatalogoDasPermissoes } from "@/lib/ai/permissoes-da-tela";
import { saveAiPreferences } from "@/lib/actions/ai-preferences";
import type { AiPreferencesView, ProviderCardView } from "@/lib/ai/types";
import { exigirValor, lerDecimal, lerInteiro, type Leitura } from "@/lib/ai/numero";
import { errosDaAction } from "@/lib/forms/mensagem-da-action";
import { ariaDoErro, ErroDoCampo } from "@/components/shared/erro-do-campo";
import {
  alternarEscrita,
  alternarLeitura,
  escritaVisivel,
  permissoesParaSalvar,
  visaoPossivel,
  visaoVisivel,
  type PermissoesDoForm,
} from "@/components/ai/preferencias-cascata";

const NENHUM = "__nenhum__";

/** Os campos numéricos, com o id do input — para o erro ficar no campo e o foco ir até ele. */
const CAMPOS_NUMERICOS = {
  jobMonthlyBudget: "pref-job-teto",
  dailyBudget: "pref-dia",
  monthlyBudget: "pref-mes",
  reservationMargin: "pref-margem",
  rateLimitPerMinute: "pref-rpm",
  rateLimitPerHour: "pref-rph",
} as const;
type CampoNumerico = keyof typeof CAMPOS_NUMERICOS;
type ErrosNumericos = Partial<Record<CampoNumerico, string>>;

const SEM_VALOR = "Informe um valor.";

/**
 * D2 — os números digitados, pelo conversor único. Em branco: orçamento diário e mensal
 * aceitam ("sem limite"); teto do job, margem e limites de taxa RECUSAM no próprio campo.
 * Nada vira 0 por omissão (`Number("")` era 0) e "1,5" é 1,5 (`Number("1,5")` era NaN).
 */
function lerNumeros(form: Record<CampoNumerico, string>):
  | {
      ok: true;
      valores: {
        jobMonthlyBudget: number;
        dailyBudget: number | null;
        monthlyBudget: number | null;
        reservationMargin: number;
        rateLimitPerMinute: number;
        rateLimitPerHour: number;
      };
    }
  | { ok: false; erros: ErrosNumericos } {
  const erros: ErrosNumericos = {};
  const ler = (campo: CampoNumerico, leitura: Leitura): number | null => {
    if (leitura.ok) return leitura.valor;
    erros[campo] = leitura.motivo;
    return null;
  };

  const job = ler(
    "jobMonthlyBudget",
    exigirValor(
      lerDecimal(form.jobMonthlyBudget),
      "Informe um valor. Para a análise automática não gastar nada, use 0.",
    ),
  );
  const dia = ler("dailyBudget", lerDecimal(form.dailyBudget));
  const mes = ler("monthlyBudget", lerDecimal(form.monthlyBudget));
  const margem = ler("reservationMargin", exigirValor(lerDecimal(form.reservationMargin), SEM_VALOR));
  const rpm = ler("rateLimitPerMinute", exigirValor(lerInteiro(form.rateLimitPerMinute), SEM_VALOR));
  const rph = ler("rateLimitPerHour", exigirValor(lerInteiro(form.rateLimitPerHour), SEM_VALOR));

  if (job === null || margem === null || rpm === null || rph === null || Object.keys(erros).length) {
    return { ok: false, erros };
  }
  return {
    ok: true,
    valores: {
      jobMonthlyBudget: job,
      dailyBudget: dia,
      monthlyBudget: mes,
      reservationMargin: margem,
      rateLimitPerMinute: rpm,
      rateLimitPerHour: rph,
    },
  };
}

export function AiPreferencesForm({
  prefs,
  cards,
  catalogo,
}: {
  prefs: AiPreferencesView;
  cards: readonly ProviderCardView[];
  /** O que cada chave libera e de qual leitura cada escrita depende — derivado do registry. */
  catalogo: CatalogoDasPermissoes;
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
    // 18-F Bloco 4 — entra no estado E no payload no MESMO commit (invariantes 81 e 94).
    allowCrossModule: prefs.allowCrossModule,
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
    // 18-F Bloco 2 — entram no estado E no payload no MESMO commit (invariante 81).
    floatingCorner: prefs.floatingCorner,
    floatingHidden: prefs.floatingHidden,
  });

  const provedoresProntos = cards.filter((c) => c.enabled && c.credentialStatus !== null);
  const modelosDoPadrao =
    form.defaultProvider === NENHUM
      ? []
      : activeModelsFor(form.defaultProvider as AiProviderId);

  const [erros, setErros] = React.useState<ErrosNumericos>({});

  /** Um campo numérico editado perde o próprio erro (os outros ficam até o próximo salvar). */
  function editarNumero(campo: CampoNumerico, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErros((e) => {
      const resto = { ...e };
      delete resto[campo];
      return resto;
    });
  }

  async function salvar() {
    const numeros = lerNumeros(form);
    if (!numeros.ok) {
      setErros(numeros.erros);
      const primeiro = (Object.keys(CAMPOS_NUMERICOS) as CampoNumerico[]).find(
        (c) => numeros.erros[c],
      );
      if (primeiro) document.getElementById(CAMPOS_NUMERICOS[primeiro])?.focus();
      return;
    }
    setErros({});
    // O que se salva é o que os interruptores mostram (D2): escrita sem leitura e visão sem as
    // duas chaves do Financeiro saem `false`, como o servidor gravaria de qualquer jeito.
    const permissoes = permissoesParaSalvar(form, catalogo.escritas);
    const v = numeros.valores;
    setSalvando(true);
    // ⚠️ Cada chave escrita por extenso, sem spread: `validators/ai.test.ts` confere no texto
    // que o payload cita todos os campos obrigatórios do schema (invariantes 81 e 94).
    const r = await saveAiPreferences({
      permissions: permissoes.permissions,
      writePermissions: permissoes.writePermissions,
      allowVision: permissoes.allowVision,
      allowInsightJobs: form.allowInsightJobs,
      allowCrossModule: form.allowCrossModule,
      jobMonthlyBudget: v.jobMonthlyBudget,
      defaultProvider: form.defaultProvider === NENHUM ? null : form.defaultProvider,
      defaultModel: form.defaultModel === NENHUM ? null : form.defaultModel,
      confirmationMode: form.confirmationMode,
      allowFallback: form.allowFallback,
      dailyBudget: v.dailyBudget,
      monthlyBudget: v.monthlyBudget,
      budgetBlockOnLimit: form.budgetBlockOnLimit,
      reservationMargin: v.reservationMargin,
      rateLimitPerMinute: v.rateLimitPerMinute,
      rateLimitPerHour: v.rateLimitPerHour,
      floatingCorner: form.floatingCorner,
      floatingHidden: form.floatingHidden,
    });
    setSalvando(false);

    if (!r.ok) {
      // Erro de campo que existe aqui fica sob o campo; o resto sobe com o nome do campo.
      const { porCampo, texto } = errosDaAction(r, Object.keys(CAMPOS_NUMERICOS));
      setErros(porCampo);
      toast.error(texto);
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
                // D2 — desligar a leitura desliga a escrita que depende dela (e, no
                // Financeiro, o envio de comprovantes). Ligar não liga nada além dela.
                consultas={catalogo.leituras[chave]}
                onChange={(v) => setForm((f) => alternarLeitura(f, chave, v, catalogo.escritas))}
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
                /**
                 * ⚠️ A chave de escrita depende da de LEITURA — e a tela mostra isso em vez de
                 * deixar o usuário ligar algo que o guard vai recusar depois. Propor uma
                 * alteração começa por resolver de qual registro se fala, e isso é ler.
                 */
                form={form}
                escritas={catalogo.escritas}
                onChange={(v) => setForm((f) => alternarEscrita(f, chave, v, catalogo.escritas))}
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
            // D2 — mostra visão E as duas chaves do Financeiro: um `true` vindo do servidor com
            // a escrita desligada não aparece ligado (nem é salvo de volta).
            checked={visaoVisivel(form, catalogo.escritas)}
            disabled={!visaoPossivel(form, catalogo.escritas)}
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
              onChange={(e) => editarNumero("jobMonthlyBudget", e.target.value)}
              {...ariaDoErro("pref-job-teto-erro", erros.jobMonthlyBudget)}
            />
            <ErroDoCampo id="pref-job-teto-erro" mensagem={erros.jobMonthlyBudget} />
            <p className="text-xs text-muted-foreground">
              Teto <strong>próprio</strong>, e ele não substitui o mensal: a análise
              automática passa pelos dois, e qualquer um dos dois a barra. Diferente dos
              orçamentos acima, este não pode ficar em branco — deixá-lo sem valor seria não
              ter teto justamente sobre o gasto que ninguém está vendo.
            </p>
          </div>
        </div>

        {/* ── Panoramas de vários módulos (18-F · Bloco 4) ──────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Label htmlFor="pref-panoramas">Panoramas de vários módulos</Label>
            <p className="text-xs text-muted-foreground">
              Libera os atalhos “Planejar meu dia”, “Encerrar meu dia” e “Planejar minha
              semana”. Cada panorama lê só os módulos cuja leitura estiver ligada acima — o que
              estiver desligado fica de fora, e o panorama <strong>diz o que ficou</strong>.
            </p>
          </div>
          <Switch
            id="pref-panoramas"
            checked={form.allowCrossModule}
            onCheckedChange={(v) => setForm((f) => ({ ...f, allowCrossModule: v }))}
            className="shrink-0"
          />
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
                onChange={(e) => editarNumero("dailyBudget", e.target.value)}
                placeholder="sem limite"
                {...ariaDoErro("pref-dia-erro", erros.dailyBudget)}
              />
              <ErroDoCampo id="pref-dia-erro" mensagem={erros.dailyBudget} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pref-mes">Orçamento mensal (USD)</Label>
              <Input
                id="pref-mes"
                inputMode="decimal"
                value={form.monthlyBudget}
                onChange={(e) => editarNumero("monthlyBudget", e.target.value)}
                placeholder="sem limite"
                {...ariaDoErro("pref-mes-erro", erros.monthlyBudget)}
              />
              <ErroDoCampo id="pref-mes-erro" mensagem={erros.monthlyBudget} />
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
              onChange={(e) => editarNumero("reservationMargin", e.target.value)}
              {...ariaDoErro("pref-margem-erro", erros.reservationMargin)}
            />
            <ErroDoCampo id="pref-margem-erro" mensagem={erros.reservationMargin} />
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
              onChange={(e) => editarNumero("rateLimitPerMinute", e.target.value)}
              {...ariaDoErro("pref-rpm-erro", erros.rateLimitPerMinute)}
            />
            <ErroDoCampo id="pref-rpm-erro" mensagem={erros.rateLimitPerMinute} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pref-rph">Mensagens por hora</Label>
            <Input
              id="pref-rph"
              inputMode="numeric"
              value={form.rateLimitPerHour}
              onChange={(e) => editarNumero("rateLimitPerHour", e.target.value)}
              {...ariaDoErro("pref-rph-erro", erros.rateLimitPerHour)}
            />
            <ErroDoCampo id="pref-rph-erro" mensagem={erros.rateLimitPerHour} />
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

        {/* ── Botão flutuante (18-F · Bloco 2) ──────────────────────────────────────────
          Este cartão é o ÚNICO caminho de volta: quem esconde o botão pelo menu do painel só
          o reencontra aqui. Por isso ele não fica atrás de "avançado", e por isso o texto diz
          o que "ocultar" NÃO faz.
        */}
        <div className="space-y-3">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">Botão flutuante</h3>
            <p className="text-xs text-muted-foreground">
              O atalho para conversar com o assistente sem sair da tela em que você está.
              Ocultar tira o <strong>botão</strong> da tela — o atalho {ATALHO_DO_PAINEL}{" "}
              continua abrindo o painel, e o que a IA pode ler ou alterar não muda.
            </p>
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="pref-canto-botao">Posição</Label>
            <Select
              value={form.floatingCorner}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, floatingCorner: v as CantoDoBotao }))
              }
              disabled={form.floatingHidden}
            >
              <SelectTrigger
                id="pref-canto-botao"
                className="w-full"
                aria-describedby={form.floatingHidden ? "pref-canto-botao-aviso" : undefined}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CANTOS_DO_BOTAO.map((canto) => (
                  <SelectItem key={canto} value={canto}>
                    {ROTULO_DO_CANTO[canto]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* D2 — o seletor desabilitado diz por quê, e o que continua valendo. */}
            {form.floatingHidden ? (
              <p id="pref-canto-botao-aviso" className="text-xs text-muted-foreground">
                Com o botão oculto, o canto não se aplica — o atalho {ATALHO_DO_PAINEL}{" "}
                continua abrindo o painel.
              </p>
            ) : null}
          </div>

          {/*
            `min-w-0` no lado do texto e `shrink-0` no controle — regra 2 do layout
            responsivo: sem isso o rótulo empurra o `Switch` para fora e o card o corta.
          */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label htmlFor="pref-ocultar-botao">Ocultar o botão</Label>
              <p className="text-xs text-muted-foreground">
                O assistente continua ao alcance pelo atalho e pela página{" "}
                <strong>Conversar</strong>.
              </p>
            </div>
            <Switch
              id="pref-ocultar-botao"
              checked={form.floatingHidden}
              onCheckedChange={(v) => setForm((f) => ({ ...f, floatingHidden: v }))}
              className="shrink-0"
            />
          </div>
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
 * no servidor (`catalogoDasPermissoes`) e entregue aqui como `consultas` — no dia em que a 18-C acrescentar a primeira leitura de Finanças, a chave se habilita
 * sozinha, com a lista real do que ela passa a permitir.
 *
 * Responsividade: o lado do texto é `min-w-0` porque o irmão (`Switch`) é `shrink-0` — sem
 * isso a frase longa empurra o controle para fora do card.
 */
function PermissaoLinha({
  chave,
  ligada,
  consultas,
  onChange,
}: {
  chave: ToolPermission;
  ligada: boolean;
  consultas: readonly string[];
  onChange: (valor: boolean) => void;
}) {
  const rotulo = ROTULO_DA_PERMISSAO[chave];
  const disponivel = consultas.length > 0;
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
            {consultas.join(" · ")}.
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
 * ║ As duas chegam em `escritas`, derivadas do registry no SERVIDOR (D2).                 ║
 * ║                                                                                       ║
 * ║ Quando falta a leitura, a tela DIZ qual chave ligar antes — desabilitar em silêncio    ║
 * ║ deixaria a pessoa clicando num controle morto sem saber o que fazer.                    ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
function PermissaoDeEscritaLinha({
  chave,
  form,
  escritas,
  onChange,
}: {
  chave: ToolWritePermission;
  form: PermissoesDoForm;
  escritas: CatalogoDasPermissoes["escritas"];
  onChange: (valor: boolean) => void;
}) {
  const rotulo = ROTULO_DA_PERMISSAO_DE_ESCRITA[chave];
  const { temFerramenta, leitura } = escritas[chave];
  const leituraLigada = leitura !== null && form.permissions[leitura] === true;
  const disponivel = temFerramenta && leituraLigada;
  const precisaDaLeitura = temFerramenta && !leituraLigada;
  const id = `pref-${chave}`;
  const idDoAviso = `${id}-aviso`;

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
        ) : precisaDaLeitura ? (
          <p id={idDoAviso} className="text-xs text-warning-ink">
            Ligue antes a leitura de {leitura ? ROTULO_DA_PERMISSAO[leitura].titulo : "—"}:
            preparar uma alteração começa por consultar o registro.
          </p>
        ) : null}
      </div>
      <Switch
        id={id}
        // D2 — leitura E escrita: com a leitura desligada a escrita aparece desligada, mesmo
        // que o estado (ou o servidor) ainda a tenha como `true`.
        checked={escritaVisivel(form, chave, escritas)}
        onCheckedChange={onChange}
        disabled={!disponivel}
        aria-label={`Autorizar alterações em ${rotulo.titulo}`}
        aria-describedby={precisaDaLeitura ? idDoAviso : undefined}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}
