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
import { toast } from "sonner";
import { Camera, Images, Loader2, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  PHOTO_ACCEPT_ATTRIBUTE,
  PHOTO_ALLOWED_MIME,
  PHOTO_ANGLE_LABELS,
  PHOTO_ANGLES,
  PHOTO_MAX_BYTES,
  type PhotoAngle,
} from "@/lib/body/constants";
import { longDateLabel, shortDateLabel, diffDaysIso } from "@/lib/nutrition/calendar";
import { deleteProgressPhoto, uploadProgressPhoto } from "@/lib/actions/body-measurements";
import type { SignedProgressPhoto } from "@/lib/body/types";

const MAX_MB = Math.round(PHOTO_MAX_BYTES / (1024 * 1024));

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

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        hoje={hoje}
        onSaved={onChanged}
      />

      <CompareDialog open={compareOpen} onOpenChange={setCompareOpen} photos={photos} />

      {/* Visualização em tamanho cheio */}
      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-2xl">
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

function UploadDialog({
  open,
  onOpenChange,
  hoje,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hoje: string;
  onSaved: () => void;
}) {
  /**
   * Arquivo escolhido + a sua pré-visualização, num ESTADO SÓ.
   *
   * O object URL (`blob:`) é criado e revogado no próprio handler, nunca num efeito: o React
   * Compiler está ligado e o projeto não usa `setState` dentro de `useEffect`. Juntar os dois
   * num estado também garante que nunca exista um `preview` apontando para um arquivo que já
   * não é o escolhido.
   */
  const [chosen, setChosen] = React.useState<{ file: File; url: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const formRef = React.useRef<HTMLFormElement>(null);

  const file = chosen?.file ?? null;
  const preview = chosen?.url ?? null;

  function pick(next: File | null) {
    setError(null);
    // O blob anterior some da memória da aba assim que deixa de ser exibido.
    if (chosen) URL.revokeObjectURL(chosen.url);

    if (!next) {
      setChosen(null);
      return;
    }
    // Conveniência: aviso imediato. A validação que VALE é a do servidor.
    if (!(PHOTO_ALLOWED_MIME as readonly string[]).includes(next.type)) {
      setError("Formato não aceito. Envie JPG, PNG, WEBP ou HEIC.");
      setChosen(null);
      return;
    }
    if (next.size > PHOTO_MAX_BYTES) {
      setError(`A imagem deve ter no máximo ${MAX_MB} MB.`);
      setChosen(null);
      return;
    }
    setChosen({ file: next, url: URL.createObjectURL(next) });
  }

  /** Fechar o diálogo descarta o arquivo e o blob — nada de imagem viva numa aba fechada. */
  function handleOpenChange(next: boolean) {
    if (!next) pick(null);
    onOpenChange(next);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Escolha uma imagem.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await uploadProgressPhoto(formData);
      if (result.ok) {
        toast.success("Foto enviada.");
        pick(null);
        formRef.current?.reset();
        onOpenChange(false);
        onSaved();
      } else {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar foto de evolução</DialogTitle>
          <DialogDescription>
            A imagem fica em área privada, acessível só por você. Ela não entra no backup em
            JSON — baixe as fotos por aqui se quiser guardá-las fora do sistema.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="photo-file">Imagem</Label>
            <Input
              id="photo-file"
              name="file"
              type="file"
              accept={PHOTO_ACCEPT_ATTRIBUTE}
              onChange={(event) => pick(event.target.files?.[0] ?? null)}
              required
            />
            <p className="text-xs text-muted-foreground">
              JPG, PNG, WEBP ou HEIC, até {MAX_MB} MB.
            </p>
          </div>

          {preview && (
            <div className="relative overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob: local */}
              <img src={preview} alt="Pré-visualização" className="max-h-56 w-full object-contain" />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute end-2 top-2 size-7"
                onClick={() => pick(null)}
                aria-label="Remover imagem escolhida"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="photo-date">Data</Label>
              <Input id="photo-date" name="takenOn" type="date" defaultValue={hoje} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="photo-angle">Ângulo</Label>
              <Select name="angle" defaultValue="frontal">
                <SelectTrigger id="photo-angle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PHOTO_ANGLES.map((angle) => (
                    <SelectItem key={angle} value={angle}>
                      {PHOTO_ANGLE_LABELS[angle]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="photo-weight">Peso do dia (opcional)</Label>
            <Input
              id="photo-weight"
              name="weightKg"
              inputMode="decimal"
              placeholder="72,4"
              aria-describedby="photo-weight-hint"
            />
            <p id="photo-weight-hint" className="text-xs text-muted-foreground">
              Só como contexto da foto. O histórico de peso continua sendo o das medidas.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="photo-note">Observação (opcional)</Label>
            <Textarea id="photo-note" name="note" rows={2} maxLength={500} />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !file}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Enviar foto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────────── Comparação ───────────────────────────── */

/**
 * Antes × depois.
 *
 * As duas imagens usam as URLs JÁ ASSINADAS que vieram da leitura — nenhuma URL nova é
 * gerada, nada é persistido, e não existe "copiar link da comparação". Quando a comparação
 * cruza ângulos diferentes, a tela AVISA: frente contra costas não é evolução, é outro
 * enquadramento.
 */
function CompareDialog({
  open,
  onOpenChange,
  photos,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photos: SignedProgressPhoto[];
}) {
  // Padrão útil: a mais antiga contra a mais recente.
  const sorted = React.useMemo(
    () => [...photos].sort((a, b) => a.takenOn.localeCompare(b.takenOn)),
    [photos],
  );
  const [beforeId, setBeforeId] = React.useState<string>("");
  const [afterId, setAfterId] = React.useState<string>("");

  // Ajuste durante o render (padrão adotado no projeto — nada de setState em useEffect).
  const defaultBefore = sorted[0]?.id ?? "";
  const defaultAfter = sorted[sorted.length - 1]?.id ?? "";
  const before = photos.find((p) => p.id === (beforeId || defaultBefore)) ?? null;
  const after = photos.find((p) => p.id === (afterId || defaultAfter)) ?? null;

  const days = before && after ? diffDaysIso(before.takenOn, after.takenOn) : null;
  const weightDelta =
    before?.weightKg !== null && before?.weightKg !== undefined &&
    after?.weightKg !== null && after?.weightKg !== undefined
      ? after.weightKg - before.weightKg
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Comparar fotos</DialogTitle>
          <DialogDescription>
            Escolha duas datas. A comparação existe só nesta tela — não gera link nem imagem
            combinada.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { id: beforeId || defaultBefore, set: setBeforeId, label: "Antes" },
            { id: afterId || defaultAfter, set: setAfterId, label: "Depois" },
          ].map((side) => (
            <div key={side.label} className="space-y-1.5">
              <Label>{side.label}</Label>
              <Select value={side.id} onValueChange={side.set}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sorted.map((photo) => (
                    <SelectItem key={photo.id} value={photo.id}>
                      {shortDateLabel(photo.takenOn)} · {PHOTO_ANGLE_LABELS[photo.angle]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[before, after].map((photo, index) => (
            <figure key={index} className="space-y-1">
              <div className="aspect-3/4 overflow-hidden rounded-lg border bg-muted">
                {photo?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL assinada efêmera
                  <img
                    src={photo.url}
                    alt={`${index === 0 ? "Antes" : "Depois"}: ${longDateLabel(photo.takenOn)}`}
                    className="size-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-xs text-muted-foreground">
                    Sem imagem
                  </span>
                )}
              </div>
              <figcaption className="text-xs text-muted-foreground">
                {photo ? longDateLabel(photo.takenOn) : "—"}
                {photo?.weightKg !== null && photo?.weightKg !== undefined && (
                  <> · {photo.weightKg.toLocaleString("pt-BR")} kg</>
                )}
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="space-y-1 rounded-lg border bg-muted/30 p-3 text-sm">
          {days !== null && (
            <p>
              <strong className="tabular-nums">{Math.abs(days)}</strong> dia(s) entre as duas
              fotos.
              {weightDelta !== null && (
                <>
                  {" "}
                  Peso registrado:{" "}
                  <strong className="tabular-nums">
                    {weightDelta > 0 ? "+" : weightDelta < 0 ? "−" : ""}
                    {Math.abs(weightDelta).toLocaleString("pt-BR")} kg
                  </strong>
                  .
                </>
              )}
            </p>
          )}
          {before && after && before.angle !== after.angle && (
            <p className="flex items-center gap-1.5 text-amber-700 dark:text-amber-500">
              <Badge variant="outline" className="border-amber-500/40">
                Atenção
              </Badge>
              As fotos são de ângulos diferentes ({PHOTO_ANGLE_LABELS[before.angle]} e{" "}
              {PHOTO_ANGLE_LABELS[after.angle]}). A diferença que você vê pode ser só o
              enquadramento.
            </p>
          )}
          <p className={cn("text-xs text-muted-foreground")}>
            Iluminação, horário, postura e roupa mudam bastante a aparência de uma foto para a
            outra. Use a comparação como referência, junto das medidas.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}