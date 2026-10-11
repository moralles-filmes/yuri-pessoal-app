"use client";

/**
 * Fase 16-E — Módulo central de medidas corporais · Fotos privadas de evolução.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ ESTE É O COMPONENTE QUE LIDA COM O DADO MAIS SENSÍVEL DO SISTEMA.                   ║
 * ║                                                                                       ║
 * ║ • As `src` são URLs ASSINADAS que expiram em minutos, geradas no servidor a cada       ║
 * ║   leitura. Nenhuma é guardada em estado persistente, localStorage ou query string.     ║
 * ║ • O upload passa por Server Action com o arquivo real — o navegador NÃO fala com o     ║
 * ║   Storage. É o que permite validar tipo e tamanho de verdade no servidor.              ║
 * ║ • Não há botão de compartilhar, copiar link ou "abrir em nova aba com URL fixa": a     ║
 * ║   comparação antes × depois monta as duas imagens com as assinaturas já recebidas.     ║
 * ║ • `referrerPolicy="no-referrer"` para a URL assinada não vazar em Referer.             ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * A validação de MIME/tamanho aqui é CONVENIÊNCIA (aviso imediato ao usuário). A que vale é
 * a do servidor, em `uploadProgressPhoto` — esta pode ser ignorada por qualquer requisição.
 */
import * as React from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Camera, Images, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { useLazyDialog } from "@/components/shared/use-lazy-dialog";
import {
  PHOTO_ANGLE_LABELS,
  PHOTO_ANGLES,
  type PhotoAngle,
} from "@/lib/body/constants";
import { longDateLabel, shortDateLabel } from "@/lib/nutrition/calendar";
import { deleteProgressPhoto } from "@/lib/actions/body-measurements";
import type { SignedProgressPhoto } from "@/lib/body/types";

// ⛔ objeto literal escrito ali mesmo — o compilador o lê estaticamente (regra 4 do carregamento sob demanda)
const UploadDialog = dynamic(
  () => import("./progress-photo-upload-dialog").then((m) => m.UploadDialog),
  { ssr: false },
);
const CompareDialog = dynamic(
  () => import("./progress-photo-compare-dialog").then((m) => m.CompareDialog),
  { ssr: false },
);

export function ProgressPhotos({
  photos,
  hoje,
  onChanged,
}: {
  photos: SignedProgressPhoto[];
  hoje: string;
  onChanged: () => void;
}) {
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [compareOpen, setCompareOpen] = React.useState(false);
  const uploadDialogMontado = useLazyDialog(uploadOpen);
  const compareDialogMontado = useLazyDialog(compareOpen);
  const [viewing, setViewing] = React.useState<SignedProgressPhoto | null>(null);
  const [pending, startTransition] = React.useTransition();

  const byAngle = React.useMemo(() => {
    const map = new Map<PhotoAngle, SignedProgressPhoto[]>();
    for (const photo of photos) {
      const list = map.get(photo.angle);
      if (list) list.push(photo);
      else map.set(photo.angle, [photo]);
    }
    return map;
  }, [photos]);

  function handleDelete(photo: SignedProgressPhoto) {
    if (
      !window.confirm(
        `Excluir a foto de ${longDateLabel(photo.takenOn)}? A imagem é apagada definitivamente e não há como recuperar.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await deleteProgressPhoto(photo.id);
      if (result.ok) {
        toast.success("Foto excluída.");
        setViewing(null);
        onChanged();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-base">Fotos de evolução</CardTitle>
          <CardDescription>
            Guardadas em área privada. Só você acessa, e cada visualização usa um endereço
            temporário que expira em poucos minutos — as fotos não têm link público nem
            compartilhável.
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          {photos.length >= 2 && (
            <Button variant="outline" size="sm" onClick={() => setCompareOpen(true)}>
              <Images className="size-4" />
              Comparar
            </Button>
          )}
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Camera className="size-4" />
            Enviar
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {photos.length === 0 ? (
          <EmptyState
            icon={Camera}
            title="Nenhuma foto ainda"
            description="Fotos do mesmo ângulo, na mesma luz e no mesmo horário mostram mudanças que a balança não mostra."
          />
        ) : (
          <div className="space-y-4">
            {PHOTO_ANGLES.filter((angle) => byAngle.has(angle)).map((angle) => (
              <div key={angle} className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {PHOTO_ANGLE_LABELS[angle]}
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {(byAngle.get(angle) ?? []).map((photo) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => setViewing(photo)}
                      className="group relative aspect-3/4 overflow-hidden rounded-lg border bg-muted transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Foto de ${longDateLabel(photo.takenOn)}, ${PHOTO_ANGLE_LABELS[photo.angle]}`}
                    >
                      {photo.url ? (
                        /* URL assinada e efêmera: o otimizador do next/image guardaria a
                           imagem em cache no servidor — exatamente o que não pode acontecer
                           com foto de evolução corporal. */
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photo.url}
                          alt={`Evolução em ${longDateLabel(photo.takenOn)}`}
                          className="size-full object-cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="flex size-full items-center justify-center p-2 text-center text-[10px] text-muted-foreground">
                          Não foi possível carregar
                        </span>
                      )}
                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1 text-[10px] font-medium text-white">
                        {shortDateLabel(photo.takenOn)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {uploadDialogMontado && (
        <UploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          hoje={hoje}
          onSaved={onChanged}
        />
      )}

      {compareDialogMontado && (
        <CompareDialog open={compareOpen} onOpenChange={setCompareOpen} photos={photos} />
      )}

      {/* Visualização em tamanho cheio */}
      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{viewing ? longDateLabel(viewing.takenOn) : ""}</DialogTitle>
            <DialogDescription>
              {viewing ? PHOTO_ANGLE_LABELS[viewing.angle] : ""}
              {viewing?.weightKg !== null && viewing?.weightKg !== undefined
                ? ` · ${viewing.weightKg.toLocaleString("pt-BR")} kg`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {viewing?.url && (
            // eslint-disable-next-line @next/next/no-img-element -- ver nota acima
            <img
              src={viewing.url}
              alt={`Evolução em ${longDateLabel(viewing.takenOn)}`}
              className="max-h-[65vh] w-full rounded-lg object-contain"
              referrerPolicy="no-referrer"
            />
          )}
          {viewing?.note && <p className="text-sm text-muted-foreground">{viewing.note}</p>}

          <DialogFooter className="sm:justify-between">
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => viewing && handleDelete(viewing)}
              disabled={pending}
            >
              <Trash2 className="size-4" />
              Excluir
            </Button>
            <Button variant="outline" onClick={() => setViewing(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ───────────────────────────── Envio ───────────────────────────── */

/* ───────────────────────────── Comparação ───────────────────────────── */
