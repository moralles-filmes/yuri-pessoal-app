"use client";

/**
 * Fase 18-D · Bloco 5 — IA · A REVISÃO. **PROCESSO 3**: o dono corrige, e só então propõe.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ AS QUATRO COISAS QUE ESTA TELA SE RECUSA A FAZER                                      ║
 * ║                                                                                       ║
 * ║  • NÃO mostra campo ilegível como "—", "0" ou vazio. Ele é **"não identificado"**, com ║
 * ║    o motivo ao lado. Um traço seria lido como "não tem", e "não tem" é uma afirmação   ║
 * ║    sobre o comprovante que ninguém fez.                                                ║
 * ║  • NÃO oferece o botão de propor com valor, data ou conta incertos. Não é aviso        ║
 * ║    amarelo: é a AUSÊNCIA do caminho — e o servidor recusa de novo, porque botão        ║
 * ║    escondido é contornável.                                                            ║
 * ║  • NÃO transforma alerta de duplicidade em bloqueio. Duas compras iguais no mesmo dia  ║
 * ║    existem (a lição do FITID). Ele sinaliza, o dono decide.                            ║
 * ║  • NÃO promete que a classificação dos itens vira divisão no lançamento. Ela é         ║
 * ║    CONFERÊNCIA nesta subfase, e a tela diz isso com todas as letras.                   ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ `revisar` roda AQUI para a tela reagir enquanto o dono digita, e roda DE NOVO no
 * servidor antes de gravar a proposta. É a mesma função pura nos dois lados — uma segunda
 * implementação faria a tela liberar o que o servidor recusa (ou o contrário).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  FileText,
  Info,
  Loader2,
  Receipt,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProposalCard, type PropostaNaTela } from "@/components/ai/proposal-card";
import {
  anexarComprovanteAoLancamento,
  prepararLancamentoDoComprovante,
} from "@/lib/actions/ai-documents";
import {
  ROTULO_DA_CONFIANCA,
  type Confianca,
  type ExtracaoDeComprovante,
} from "@/lib/ai/vision/contracts";
import { revisar, type CorrecoesDoDono } from "@/lib/ai/vision/review";
import type { AlertaDeDuplicidade } from "@/lib/ai/vision/duplicates";
import {
  classificacaoInicial,
  resumirNota,
  type DestinoDoItem,
  type ItemClassificado,
} from "@/lib/ai/vision/receipt-items";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export type OpcaoDeSelecao = { readonly id: string; readonly nome: string };

export type OpcoesDoLancamento = {
  readonly contas: readonly OpcaoDeSelecao[];
  readonly cartoes: readonly OpcaoDeSelecao[];
  readonly categorias: readonly OpcaoDeSelecao[];
  readonly pessoas: readonly OpcaoDeSelecao[];
};

/** A cor diz o mesmo que o texto — nunca só a cor (ela não sobrevive ao daltonismo). */
const TOM_DA_CONFIANCA: Record<Confianca, string> = {
  alta: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  media: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  baixa: "border-destructive/40 text-destructive",
  conflito: "border-destructive/40 text-destructive",
  nao_identificado: "border-muted-foreground/30 text-muted-foreground",
};

function SeloDeConfianca({ confianca }: { readonly confianca: Confianca }) {
  return (
    <Badge
      variant="outline"
      className={cn("shrink-0 text-[11px] font-normal", TOM_DA_CONFIANCA[confianca])}
    >
      {ROTULO_DA_CONFIANCA[confianca]}
    </Badge>
  );
}

const CAMPOS_DE_TEXTO = [
  { chave: "estabelecimento", rotulo: "Estabelecimento", exemplo: "Padaria Dois Irmãos" },
  { chave: "cnpj", rotulo: "CNPJ", exemplo: "00.000.000/0001-00" },
  { chave: "hora", rotulo: "Hora", exemplo: "09:12" },
  { chave: "formaPagamento", rotulo: "Forma de pagamento", exemplo: "PIX" },
  { chave: "numeroDocumento", rotulo: "Número do documento", exemplo: "000123" },
] as const;

type ChaveDeTexto = (typeof CAMPOS_DE_TEXTO)[number]["chave"];

/** Centavos → o texto do input, em reais. `null` vira "" — nunca "0,00". */
function centavosParaTexto(centavos: number | null): string {
  return centavos === null ? "" : (centavos / 100).toFixed(2).replace(".", ",");
}

/**
 * O texto do input → centavos. `null` quando o dono apagou o campo ou digitou algo que não
 * é um valor — e `null` aqui significa "não identificado", que é o estado certo: um campo
 * de dinheiro em branco não vale zero.
 */
function textoParaCentavos(texto: string): number | null {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

const SEM_ESCOLHA = "__nenhum__";

export function ReceiptReview({
  documentoId,
  extractionId,
  extracao,
  urlAssinada,
  mime,
  alertas,
  opcoes,
}: {
  readonly documentoId: string;
  readonly extractionId: string;
  readonly extracao: ExtracaoDeComprovante;
  readonly urlAssinada: string | null;
  readonly mime: string;
  readonly alertas: readonly AlertaDeDuplicidade[];
  readonly opcoes: OpcoesDoLancamento;
}) {
  const router = useRouter();
  const [correcoes, setCorrecoes] = React.useState<CorrecoesDoDono>({});
  const [ondeEntra, setOndeEntra] = React.useState<"conta" | "cartao">("conta");
  const [conta, setConta] = React.useState<string>(SEM_ESCOLHA);
  const [cartao, setCartao] = React.useState<string>(SEM_ESCOLHA);
  const [categoria, setCategoria] = React.useState<string>(SEM_ESCOLHA);
  const [classificacao, setClassificacao] = React.useState<ItemClassificado[]>(() =>
    classificacaoInicial(extracao.itens),
  );
  const [preparando, setPreparando] = React.useState(false);
  const [proposta, setProposta] = React.useState<PropostaNaTela | null>(null);

  // A MESMA função pura que o servidor roda antes de gravar. Aqui ela só decide o que a tela
  // mostra; lá ela decide se a proposta nasce.
  const { efetiva, veredito } = revisar(extracao, correcoes);

  const escolheuOrigem =
    ondeEntra === "conta" ? conta !== SEM_ESCOLHA : cartao !== SEM_ESCOLHA;

  const resumo = resumirNota(efetiva.totalCentavos.valor ?? 0, classificacao);

  function corrigirTexto(chave: ChaveDeTexto, valor: string) {
    setCorrecoes((c) => ({ ...c, [chave]: valor.trim() === "" ? null : valor }));
    setProposta(null);
  }

  async function preparar() {
    if (preparando) return;
    setPreparando(true);

    const r = await prepararLancamentoDoComprovante({
      extractionId,
      correcoes,
      conta: ondeEntra === "conta" && conta !== SEM_ESCOLHA ? conta : null,
      cartao: ondeEntra === "cartao" && cartao !== SEM_ESCOLHA ? cartao : null,
      categoria: categoria !== SEM_ESCOLHA ? categoria : null,
    });
    setPreparando(false);

    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setProposta({
      id: r.data.id,
      effectHash: r.data.effectHash,
      expiresAt: r.data.expiresAt,
      toolName: "tela.comprovante",
      rotulo: r.data.rotulo,
      risco: 3,
      resumo: r.data.previsao.resumo,
      linhas: r.data.previsao.linhas,
      ressalvas: r.data.previsao.ressalvas,
    });
  }

  /**
   * ⛔ A SEGUNDA ESCRITA, e ela é separada de propósito: anexo não entra em `changed_fields`
   * (§3.6), então ele não pode ser efeito do command. Se falhar, o comprovante continua na
   * lista — visível, para o dono decidir — e o lançamento já existe.
   */
  async function anexar(registro: { targetId: string | null }) {
    if (!registro.targetId) return;
    const r = await anexarComprovanteAoLancamento({
      documentoId,
      transacaoId: registro.targetId,
    });
    if (!r.ok) toast.warning(r.error);
    else toast.success("Comprovante anexado ao lançamento.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* ── O arquivo, ao lado do que foi lido dele ── */}
      <div className="rounded-xl border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Receipt className="size-4 shrink-0 text-muted-foreground" />
          <h2 className="min-w-0 flex-1 text-sm font-semibold">O comprovante</h2>
        </div>
        {urlAssinada ? (
          mime === "application/pdf" ? (
            <a
              href={urlAssinada}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <FileText className="size-4 shrink-0" />
              <span className="min-w-0 truncate">Abrir o PDF</span>
            </a>
          ) : (
            /*
              ⛔ `<img>` CRU, E NÃO `next/image` — decisão, não descuido.
              A URL é assinada e vale 5 minutos, gerada a cada leitura. O otimizador do Next
              buscaria e CACHEARIA o arquivo na borda, e um comprovante em cache de CDN é
              exatamente o que o bucket privado (16-E) existe para impedir.
            */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={urlAssinada}
              alt="Comprovante enviado"
              className="mt-3 max-h-96 w-full rounded-lg border object-contain"
            />
          )
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Não foi possível gerar o link de visualização agora. Recarregue a página.
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          O link de visualização vale 5 minutos e é gerado a cada leitura desta página.
        </p>
      </div>

      {/* ── Duplicidade: SINALIZA, e nunca bloqueia ── */}
      {alertas.length > 0 && (
        <div className="space-y-2">
          {alertas.map((a) => (
            <div
              key={a.tipo === "arquivo_identico" ? a.documentoId : a.transacaoId}
              className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <div className="min-w-0">
                <p className="min-w-0">{a.mensagem}</p>
                {a.tipo === "lancamento_parecido" && (
                  <Link
                    href="/financeiro/lancamentos"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Ver os lançamentos <ArrowRight className="size-3" />
                  </Link>
                )}
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Isto é um aviso, não um impedimento: duas compras iguais no mesmo dia existem.
            Quem decide é você.
          </p>
        </div>
      )}

      {/* ── Os campos, um a um, com a confiança visível ── */}
      <div className="rounded-xl border p-4">
        <h2 className="text-sm font-semibold">O que foi lido</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Cada campo mostra o quanto a leitura foi segura. Corrigir um campo o torna seu — e a
          tela registra que foi você quem preencheu.
        </p>

        <div className="mt-3 space-y-3">
          {/* Valor total e data primeiro: são os dois que bloqueiam. */}
          <CampoEditavel
            rotulo="Valor total"
            confianca={efetiva.totalCentavos.confianca}
            motivo={efetiva.totalCentavos.motivo}
            essencial
          >
            <Input
              inputMode="decimal"
              placeholder="0,00"
              defaultValue={centavosParaTexto(extracao.totalCentavos.valor)}
              onChange={(e) => {
                setCorrecoes((c) => ({
                  ...c,
                  totalCentavos: textoParaCentavos(e.target.value),
                }));
                setProposta(null);
              }}
            />
          </CampoEditavel>

          <CampoEditavel
            rotulo="Data da compra"
            confianca={efetiva.data.confianca}
            motivo={efetiva.data.motivo}
            essencial
          >
            <Input
              type="date"
              defaultValue={extracao.data.valor ?? ""}
              onChange={(e) => {
                setCorrecoes((c) => ({
                  ...c,
                  data: e.target.value === "" ? null : e.target.value,
                }));
                setProposta(null);
              }}
            />
          </CampoEditavel>

          {CAMPOS_DE_TEXTO.map((campo) => (
            <CampoEditavel
              key={campo.chave}
              rotulo={campo.rotulo}
              confianca={efetiva[campo.chave].confianca}
              motivo={efetiva[campo.chave].motivo}
            >
              <Input
                placeholder={campo.exemplo}
                defaultValue={extracao[campo.chave].valor ?? ""}
                onChange={(e) => corrigirTexto(campo.chave, e.target.value)}
              />
            </CampoEditavel>
          ))}
        </div>
      </div>

      {/* ── Os itens: CONFERÊNCIA, e a tela diz que é isso ── */}
      {efetiva.itens.length > 0 && (
        <div className="rounded-xl border p-4">
          <h2 className="text-sm font-semibold">Itens da nota</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Classifique para conferir a nota. ⚠️ Nesta versão o lançamento é{" "}
            <strong>um só</strong>, com o valor total e como despesa pessoal — separar
            categorias ou dividir com terceiros continua sendo feito na tela do Financeiro,
            pelo mesmo motor de sempre.
          </p>

          <ul className="mt-3 space-y-2">
            {classificacao.map((c, i) => (
              <li
                key={`${c.item.descricao}-${i}`}
                className="rounded-lg border p-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {/* `min-w-0` + `truncate`: descrição longa não empurra o preço para fora. */}
                  <span className="min-w-0 flex-1 truncate">{c.item.descricao}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {c.item.valorTotalCentavos === null
                      ? "não identificado"
                      : formatCurrency(c.item.valorTotalCentavos / 100)}
                  </span>
                  <Select
                    value={c.destino.tipo}
                    onValueChange={(v) =>
                      setClassificacao((atual) =>
                        atual.map((x, j) =>
                          j === i ? { ...x, destino: destinoInicial(v, opcoes) } : x,
                        ),
                      )
                    }
                  >
                    <SelectTrigger className="w-36 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="meu">Meu</SelectItem>
                      <SelectItem value="categoria">Outra categoria</SelectItem>
                      <SelectItem value="terceiro">De outra pessoa</SelectItem>
                      <SelectItem value="ignorado">Ignorar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/*
                  ⛔ Sem id REAL, `porCategoria`/`porTerceiro` viriam com uma chave inventada e
                  os totais por categoria/pessoa não significariam nada. O segundo select é o
                  que torna o número conferível — que é a única razão de a classificação
                  existir nesta subfase.
                */}
                {(c.destino.tipo === "categoria" || c.destino.tipo === "terceiro") && (
                  <div className="mt-2">
                    <Select
                      value={
                        c.destino.tipo === "categoria"
                          ? c.destino.categoriaId
                          : c.destino.pessoaId
                      }
                      onValueChange={(v) =>
                        setClassificacao((atual) =>
                          atual.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  destino:
                                    x.destino.tipo === "categoria"
                                      ? { tipo: "categoria", categoriaId: v }
                                      : { tipo: "terceiro", pessoaId: v },
                                }
                              : x,
                          ),
                        )
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={
                            c.destino.tipo === "categoria"
                              ? "Escolha a categoria"
                              : "Escolha a pessoa"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(c.destino.tipo === "categoria"
                          ? opcoes.categorias
                          : opcoes.pessoas
                        ).map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/*
            A SOBRA É DECLARADA, nunca rateada em silêncio. `resumirNota` devolve `null`
            quando algum item está ilegível — e `null` não é zero.
          */}
          <p className="mt-3 rounded-lg bg-muted/30 p-2 text-xs text-muted-foreground">
            {resumo.explicacao}
          </p>

          <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
            <TotalDaNota rotulo="Meu" centavos={resumo.meuCentavos} />
            <TotalDaNota rotulo="Ignorado" centavos={resumo.ignoradoCentavos} />
            {Object.entries(resumo.porCategoria).map(([id, centavos]) => (
              <TotalDaNota
                key={`cat-${id}`}
                rotulo={nomeDe(opcoes.categorias, id) ?? "Categoria"}
                centavos={centavos}
              />
            ))}
            {Object.entries(resumo.porTerceiro).map(([id, centavos]) => (
              <TotalDaNota
                key={`pes-${id}`}
                rotulo={nomeDe(opcoes.pessoas, id) ?? "Outra pessoa"}
                centavos={centavos}
              />
            ))}
          </dl>
        </div>
      )}

      {/* ── Onde o lançamento entra: escolha DO DONO, nunca da imagem ── */}
      <div className="rounded-xl border p-4">
        <h2 className="text-sm font-semibold">Onde este lançamento entra</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          O comprovante diz &quot;PIX&quot; ou &quot;crédito&quot;, mas não sabe de qual conta
          ou cartão <em>seu</em> se trata. Quem escolhe é você — o sistema não desempata
          sozinho.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Origem</Label>
            <Select
              value={ondeEntra}
              onValueChange={(v) => {
                setOndeEntra(v === "cartao" ? "cartao" : "conta");
                setProposta(null);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="conta">Conta</SelectItem>
                <SelectItem value="cartao">Cartão de crédito</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              {ondeEntra === "conta" ? "Conta" : "Cartão"}
            </Label>
            <Select
              value={ondeEntra === "conta" ? conta : cartao}
              onValueChange={(v) => {
                if (ondeEntra === "conta") setConta(v);
                else setCartao(v);
                setProposta(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Escolha…" />
              </SelectTrigger>
              <SelectContent>
                {(ondeEntra === "conta" ? opcoes.contas : opcoes.cartoes).map((o) => (
                  <SelectItem key={o.id} value={o.nome}>
                    {o.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Categoria (opcional)</Label>
            <Select
              value={categoria}
              onValueChange={(v) => {
                setCategoria(v);
                setProposta(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sem categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_ESCOLHA}>Sem categoria</SelectItem>
                {opcoes.categorias.map((o) => (
                  <SelectItem key={o.id} value={o.nome}>
                    {o.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── ⛔ O BLOQUEIO. Não é aviso: é a ausência do botão, com o motivo escrito. ── */}
      {!veredito.pode ? (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="font-medium text-destructive">{veredito.motivo}</p>
            <p className="mt-1 text-muted-foreground">
              Enquanto {veredito.campos.join(" e ")} não estiver{" "}
              {veredito.campos.length > 1 ? "confirmados" : "confirmado"}, não há como preparar
              o lançamento — corrigir o campo acima libera o caminho.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Button
            onClick={preparar}
            disabled={preparando || !escolheuOrigem}
            className="w-full min-w-0 sm:w-auto"
          >
            {preparando && <Loader2 className="size-4 animate-spin" />}
            <span className="truncate">Preparar lançamento</span>
          </Button>

          {!escolheuOrigem && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3 shrink-0" />
              <span className="min-w-0">
                Escolha a conta ou o cartão antes de continuar.
              </span>
            </p>
          )}

          {proposta && <ProposalCard proposta={proposta} aoAplicar={anexar} />}
        </div>
      )}
    </div>
  );
}

/**
 * O destino recém-escolhido, já com a PRIMEIRA opção real — nunca um id inventado.
 *
 * ⚠️ Um marcador tipo `"a-definir"` viraria chave em `porCategoria`/`porTerceiro`, e o resumo
 * mostraria "R$ 32,50 em a-definir". Sem opção cadastrada, o destino cai em `meu`: é o padrão
 * honesto (a nota é do dono até ele dizer o contrário) e evita um estado sem saída.
 */
function destinoInicial(valor: string, opcoes: OpcoesDoLancamento): DestinoDoItem {
  if (valor === "categoria" && opcoes.categorias.length > 0) {
    return { tipo: "categoria", categoriaId: opcoes.categorias[0].id };
  }
  if (valor === "terceiro" && opcoes.pessoas.length > 0) {
    return { tipo: "terceiro", pessoaId: opcoes.pessoas[0].id };
  }
  if (valor === "ignorado") {
    return { tipo: "ignorado", motivo: "Marcado como não sendo seu." };
  }
  return { tipo: "meu" };
}

function nomeDe(opcoes: readonly OpcaoDeSelecao[], id: string): string | null {
  return opcoes.find((o) => o.id === id)?.nome ?? null;
}

/** `null` NÃO é zero: quando algum item está ilegível, o recorte é indeterminado. */
function TotalDaNota({
  rotulo,
  centavos,
}: {
  readonly rotulo: string;
  readonly centavos: number | null;
}) {
  return (
    <>
      <dt className="min-w-0 text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 font-medium tabular-nums">
        {centavos === null ? "indeterminado" : formatCurrency(centavos / 100)}
      </dd>
    </>
  );
}

function CampoEditavel({
  rotulo,
  confianca,
  motivo,
  essencial,
  children,
}: {
  readonly rotulo: string;
  readonly confianca: Confianca;
  readonly motivo: string | null;
  readonly essencial?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* `min-w-0` no lado texto: sem ele o rótulo empurra o selo para fora do card. */}
        <Label className="min-w-0 flex-1 text-xs">
          {rotulo}
          {essencial && <span className="ml-1 text-muted-foreground">(essencial)</span>}
        </Label>
        <SeloDeConfianca confianca={confianca} />
      </div>
      {children}
      {motivo && <p className="text-xs text-muted-foreground">{motivo}</p>}
    </div>
  );
}
