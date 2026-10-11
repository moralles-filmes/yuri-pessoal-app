"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  PHOTO_ACCEPT_ATTRIBUTE,
  PHOTO_ALLOWED_MIME,
  PHOTO_ANGLE_LABELS,
  PHOTO_ANGLES,
  PHOTO_MAX_BYTES,
} from "@/lib/body/constants";
import { uploadProgressPhoto } from "@/lib/actions/body-measurements";

export const MAX_MB = Math.round(PHOTO_MAX_BYTES / (1024 * 1024));

export function UploadDialog({
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
      <DialogContent className="sm:max-w-md">
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
