"use client";

/**
 * Fase 16-F — leitura de código de barras pela CÂMERA (pendência aberta desde a 16-A).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ AS TRÊS REGRAS QUE ESTE COMPONENTE EXISTE PARA GARANTIR                             ║
 * ║                                                                                       ║
 * ║ 1. FALHAR EM SILÊNCIO É O PIOR RESULTADO. Permissão negada, câmera ocupada, navegador ║
 * ║    sem suporte — TUDO vira estado de erro ESCRITO na tela, com o que fazer a seguir.  ║
 * ║    Uma tela de celular que "não faz nada" ao tocar em Escanear é indefensável.        ║
 * ║                                                                                       ║
 * ║ 2. A ENTRADA MANUAL NUNCA SOME. O campo de digitar o código fica visível o tempo      ║
 * ║    todo, inclusive enquanto a câmera funciona. A câmera é atalho, não pré-requisito.  ║
 * ║                                                                                       ║
 * ║ 3. NENHUM ASSET DE TERCEIROS. Usa a `BarcodeDetector` NATIVA do navegador — sem       ║
 * ║    biblioteca de leitura, sem WASM baixado, sem base externa consultada. Onde a API   ║
 * ║    não existe, o componente DIZ isso e oferece a digitação.                            ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * O que ele NÃO faz: consultar base externa de produto. O código lido volta para quem chamou,
 * e é o usuário quem confirma os dados — nada é preenchido automaticamente a partir de fonte
 * não verificada (invariante 8 do módulo).
 */
import * as React from "react";
import { Camera, Keyboard, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Formatos de código de barras de produto de mercado. */
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "itf"];

/** Estado da câmera. Cada um tem um texto próprio — nenhum é silencioso. */
type CameraState =
  | { kind: "parada" }
  | { kind: "iniciando" }
  | { kind: "lendo" }
  | { kind: "erro"; message: string; hint: string };

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

/** A API nativa existe neste navegador? (Chrome/Android sim; Safari/iOS ainda não.) */
function getDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  return typeof ctor === "function" ? ctor : null;
}

/** Traduz a falha do `getUserMedia` para uma frase útil, nunca para um silêncio. */
function describeCameraError(error: unknown): { message: string; hint: string } {
  const name = (error as { name?: string } | null)?.name ?? "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return {
        message: "Permissão de câmera negada.",
        hint: "Libere a câmera para este site nas configurações do navegador e toque em Tentar de novo — ou digite o código abaixo.",
      };
    case "NotFoundError":
    case "OverconstrainedError":
      return {
        message: "Nenhuma câmera encontrada neste aparelho.",
        hint: "Digite o código abaixo.",
      };
    case "NotReadableError":
      return {
        message: "A câmera está sendo usada por outro aplicativo.",
        hint: "Feche o outro aplicativo e tente de novo — ou digite o código abaixo.",
      };
    default:
      return {
        message: "Não foi possível abrir a câmera.",
        hint: "Digite o código abaixo para continuar.",
      };
  }
}

export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onDetected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Recebe o código lido ou digitado. Quem chama decide o que fazer com ele. */
  onDetected: (code: string) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const loopRef = React.useRef<number | null>(null);
  const [state, setState] = React.useState<CameraState>({ kind: "parada" });
  const [manual, setManual] = React.useState("");

  // Fechar o diálogo tem de DESLIGAR a câmera. Um LED aceso depois de fechar a tela é uma
  // quebra de confiança — e este módulo já lida com o dado mais sensível do sistema.
  const stop = React.useCallback(() => {
    if (loopRef.current !== null) {
      window.clearInterval(loopRef.current);
      loopRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  React.useEffect(() => stop, [stop]);

  const finish = React.useCallback(
    (code: string) => {
      stop();
      setState({ kind: "parada" });
      onDetected(code);
      onOpenChange(false);
    },
    [onDetected, onOpenChange, stop],
  );

  async function start() {
    const Ctor = getDetectorCtor();
    if (!Ctor) {
      setState({
        kind: "erro",
        message: "Este navegador não lê código de barras pela câmera.",
        hint: "No iPhone, use o app da câmera para ler o código e digite-o abaixo. No Android, o Chrome costuma funcionar.",
      });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({
        kind: "erro",
        message: "Este navegador não dá acesso à câmera.",
        hint: "Digite o código abaixo para continuar.",
      });
      return;
    }

    setState({ kind: "iniciando" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Câmera traseira quando houver; `ideal` não falha em aparelho com uma câmera só.
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stop();
        setState({ kind: "parada" });
        return;
      }
      video.srcObject = stream;
      await video.play();

      const detector = new Ctor({ formats: FORMATS });
      setState({ kind: "lendo" });

      loopRef.current = window.setInterval(async () => {
        const el = videoRef.current;
        if (!el || el.readyState < 2) return;
        try {
          const found = await detector.detect(el);
          const code = found[0]?.rawValue?.trim();
          if (code) finish(code);
        } catch {
          // Um quadro que não decodifica é o caso NORMAL: segue tentando, sem alarme.
        }
      }, 350);
    } catch (error) {
      stop();
      setState({ kind: "erro", ...describeCameraError(error) });
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      stop();
      setState({ kind: "parada" });
      setManual("");
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="size-4" />
            Ler código de barras
          </DialogTitle>
          <DialogDescription>
            A câmera só identifica o código. Os dados nutricionais continuam sendo você quem
            confirma — nada é preenchido a partir de fonte não verificada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ── Câmera ── */}
          <div className="space-y-2">
            <div className="relative overflow-hidden rounded-lg border border-border bg-muted">
              <video
                ref={videoRef}
                playsInline
                muted
                aria-label="Prévia da câmera para leitura do código de barras"
                className={`aspect-video w-full object-cover ${
                  state.kind === "lendo" ? "" : "hidden"
                }`}
              />
              {state.kind !== "lendo" && (
                <div className="grid aspect-video w-full place-items-center p-4 text-center">
                  {state.kind === "iniciando" ? (
                    <p className="text-sm text-muted-foreground">Abrindo a câmera…</p>
                  ) : state.kind === "erro" ? (
                    // ⛔ ESTADO DE ERRO EXPLÍCITO — nunca um botão que não faz nada.
                    <div role="alert" className="space-y-1">
                      <p className="text-sm font-medium text-destructive">{state.message}</p>
                      <p className="text-xs text-muted-foreground">{state.hint}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      A câmera fica desligada até você tocar em Escanear.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              {state.kind === "lendo" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    stop();
                    setState({ kind: "parada" });
                  }}
                >
                  Parar câmera
                </Button>
              ) : (
                <Button
                  type="button"
                  className="flex-1 gap-2"
                  disabled={state.kind === "iniciando"}
                  onClick={() => void start()}
                >
                  <Camera className="size-4" />
                  {state.kind === "erro" ? "Tentar de novo" : "Escanear"}
                </Button>
              )}
            </div>
          </div>

          {/* ── Entrada manual: SEMPRE visível, inclusive com a câmera funcionando ── */}
          <form
            className="space-y-2 border-t pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              const code = manual.trim();
              if (code) finish(code);
            }}
          >
            <Label htmlFor="barcode-manual" className="flex items-center gap-1.5 text-xs">
              <Keyboard className="size-3.5" />
              Digitar o código
            </Label>
            <div className="flex gap-2">
              <Input
                id="barcode-manual"
                inputMode="numeric"
                autoComplete="off"
                placeholder="8 a 14 dígitos"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
              />
              <Button type="submit" variant="outline" disabled={!manual.trim()}>
                Usar
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
