"use client";

/**
 * Fase 18-D · Bloco 5 — IA · O envio. **PROCESSO 1**: nada sai do sistema aqui.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ OS LIMITES SÃO VISÍVEIS ANTES DE O DONO ESCOLHER O ARQUIVO.                           ║
 * ║                                                                                       ║
 * ║ Não é cortesia: o HEIC é o formato padrão da câmera do iPhone, e vai ser o mais        ║
 * ║ recusado do sistema. Dizer isso DEPOIS de o dono esperar o upload de uma foto de 8 MB  ║
 * ║ seria fazê-lo descobrir a regra pelo erro. A recusa continua acontecendo no servidor,  ║
 * ║ sobre os BYTES (`sniffMime`) — o texto aqui é aviso, nunca a validação.                ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ `capture="environment"` no input abre a CÂMERA TRASEIRA no celular, que é onde um
 * comprovante é fotografado. Sem ele, o iOS oferece a galeria primeiro.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { enviarComprovante } from "@/lib/actions/ai-documents";
import { MAX_OBSERVACAO_DOCUMENTO } from "@/lib/ai/constants";
import {
  LIMITE_BYTES_IMAGEM,
  LIMITE_BYTES_PDF,
  LIMITE_MEGAPIXELS,
} from "@/lib/ai/vision/limits";
import { cn } from "@/lib/utils";

const ACEITOS_NO_INPUT = "image/jpeg,image/png,image/webp,application/pdf";

const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));

export function ReceiptUpload({ desligado }: { readonly desligado: boolean }) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = React.useState<File | null>(null);
  const [observacao, setObservacao] = React.useState("");
  const [arrastando, setArrastando] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);

  async function enviar() {
    if (!arquivo || enviando) return;
    setEnviando(true);

    const dados = new FormData();
    dados.set("arquivo", arquivo);
    if (observacao.trim()) dados.set("observacao", observacao.trim());

    const r = await enviarComprovante(dados);
    setEnviando(false);

    if (!r.ok) {
      // `fieldErrors` traz a recusa por conteúdo (HEIC, MIME que mente, tamanho); `error`
      // traz falha de infraestrutura. Descartar o primeiro deixaria o dono sem saída —
      // é a regra de `mapServerFieldErrors`, aplicada a um formulário sem resolver.
      const campo = r.fieldErrors?.arquivo?.[0] ?? r.fieldErrors?.observacao?.[0];
      toast.error(campo ?? r.error);
      return;
    }

    setArquivo(null);
    setObservacao("");
    if (inputRef.current) inputRef.current.value = "";
    toast.success("Comprovante guardado. Nada saiu do sistema ainda.");
    router.refresh();
  }

  return (
    <div className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Upload className="size-4 shrink-0 text-muted-foreground" />
        <h2 className="min-w-0 flex-1 text-sm font-semibold">Enviar comprovante</h2>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!desligado) setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          if (desligado) return;
          const primeiro = e.dataTransfer.files?.[0];
          if (primeiro) setArquivo(primeiro);
        }}
        className={cn(
          "mt-3 rounded-xl border border-dashed p-4 text-center transition-colors",
          arrastando ? "border-primary bg-primary/5" : "bg-muted/20",
          desligado && "opacity-60",
        )}
      >
        <p className="text-sm text-muted-foreground">
          Arraste o arquivo aqui, ou escolha abaixo.
        </p>

        <div className="mt-3 flex flex-col items-center gap-2">
          <Input
            ref={inputRef}
            type="file"
            accept={ACEITOS_NO_INPUT}
            // Abre a câmera traseira no celular — é onde um comprovante é fotografado.
            capture="environment"
            disabled={desligado || enviando}
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            className="max-w-sm"
          />
          {arquivo && (
            <p className="min-w-0 max-w-full truncate text-xs text-muted-foreground">
              {arquivo.name} · {(arquivo.size / (1024 * 1024)).toFixed(1)} MB
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <Label htmlFor="observacao-comprovante" className="text-xs">
          Observação (opcional)
        </Label>
        <Textarea
          id="observacao-comprovante"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value.slice(0, MAX_OBSERVACAO_DOCUMENTO))}
          disabled={desligado || enviando}
          rows={2}
          placeholder="Ex.: foi no PIX; metade é do João"
        />
        {/*
          ⛔ A observação é DADO, e a tela diz isso. Ela entra na leitura dentro do mesmo
          bloco não confiável que o conteúdo do arquivo — texto de humano não vira instrução
          só porque foi digitado num campo nosso.
        */}
        <p className="text-xs text-muted-foreground">
          Até {MAX_OBSERVACAO_DOCUMENTO} caracteres. O que você escrever aqui é tratado como
          informação sobre a compra, nunca como ordem para o assistente.
        </p>
      </div>

      <Button
        onClick={enviar}
        disabled={!arquivo || desligado || enviando}
        className="mt-3 w-full min-w-0 sm:w-auto"
      >
        {enviando ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
        <span className="truncate">Guardar comprovante</span>
      </Button>

      <div className="mt-3 space-y-1 rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
        <p>
          <strong className="text-foreground">Formatos aceitos:</strong> JPEG, PNG, WEBP e PDF.
          Imagem até {mb(LIMITE_BYTES_IMAGEM)} MB e {LIMITE_MEGAPIXELS} megapixels; PDF até{" "}
          {mb(LIMITE_BYTES_PDF)} MB.
        </p>
        <p>
          <strong className="text-foreground">HEIC não é aceito.</strong> É o formato padrão da
          câmera do iPhone — ao compartilhar a foto, o iOS exporta em JPEG, e esse arquivo
          funciona aqui.
        </p>
        <p>
          O tipo do arquivo é decidido pelo conteúdo dele, não pela extensão do nome.
        </p>
      </div>
    </div>
  );
}
