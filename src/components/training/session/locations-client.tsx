"use client";

/**
 * Fase 17-C — Treinos · Locais de treino e anilhas.
 *
 * O local serve a duas coisas concretas: registrar ONDE o treino aconteceu e alimentar a
 * calculadora de anilhas com o que existe naquele lugar. Sugerir uma anilha de 1,25 kg numa
 * academia que só tem de 5 em 5 é sugerir o impossível.
 *
 * As anilhas são gravadas em BLOCO: a tela edita a lista inteira e salva de uma vez. Lista
 * vazia é uma escolha válida ("não cadastrei as anilhas daqui"), não um "não faça nada".
 */
import * as React from "react";
import { Loader2, MapPin, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PLATE_KINDS, PLATE_KIND_LABELS, type PlateKind } from "@/lib/training/constants";
import { formatPlateWeight } from "@/lib/training/plates";
import type { TrainingLocation } from "@/lib/training/types";
import {
  createTrainingLocation,
  deleteTrainingLocation,
  saveLocationPlates,
  updateTrainingLocation,
} from "@/lib/actions/training-locations";

type PlateRow = { kind: PlateKind; weight: string; quantity: string };

/** Estoque típico de academia, oferecido como ponto de partida editável — nunca imposto. */
const STARTER: PlateRow[] = [
  { kind: "barra", weight: "20", quantity: "1" },
  { kind: "anilha", weight: "20", quantity: "8" },
  { kind: "anilha", weight: "10", quantity: "6" },
  { kind: "anilha", weight: "5", quantity: "6" },
  { kind: "anilha", weight: "2.5", quantity: "4" },
  { kind: "anilha", weight: "1.25", quantity: "4" },
];

export function TrainingLocationsClient({ locations }: { locations: TrainingLocation[] }) {
  const [busy, setBusy] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [editing, setEditing] = React.useState<TrainingLocation | null>(null);
  const [plates, setPlates] = React.useState<PlateRow[]>([]);
  const [confirmDelete, setConfirmDelete] = React.useState<TrainingLocation | null>(null);

  const openPlates = (location: TrainingLocation) => {
    setEditing(location);
    setPlates(
      location.plates.length > 0
        ? location.plates.map((plate) => ({
            kind: plate.kind,
            weight: String(plate.weightKg),
            quantity: String(plate.quantity),
          }))
        : STARTER,
    );
  };

  const create = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    const result = await createTrainingLocation({ name: newName.trim() });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setNewName("");
    toast.success("Local criado.");
  };

  const setDefault = async (location: TrainingLocation) => {
    setBusy(true);
    const result = await updateTrainingLocation({
      id: location.id,
      name: location.name,
      notes: location.notes,
      is_default: true,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${location.name} agora é o local padrão.`);
  };

  const savePlates = async () => {
    if (!editing) return;
    setBusy(true);
    const result = await saveLocationPlates({
      location_id: editing.id,
      plates: plates
        .filter((plate) => plate.weight.trim())
        .map((plate) => ({
          kind: plate.kind,
          weight_kg: Number(plate.weight.replace(",", ".")),
          quantity: Number(plate.quantity) || 0,
          notes: null,
        })),
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setEditing(null);
    toast.success("Anilhas salvas.");
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    const result = await deleteTrainingLocation(confirmDelete.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setConfirmDelete(null);
    toast.success("Local excluído. Os treinos que aconteceram lá continuam registrados.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="size-4 text-primary" />
          Locais de treino
        </CardTitle>
        <CardDescription>
          Onde você treina e quais anilhas existem em cada lugar. A calculadora de anilhas da
          sessão usa exatamente esta lista.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {locations.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum local cadastrado. Sem local, a sessão funciona normalmente — só a calculadora
            de anilhas fica sem estoque para consultar.
          </p>
        )}

        {locations.map((location) => (
          <div key={location.id} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {location.name}
                  {location.isDefault && <Badge variant="secondary">Padrão</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {location.plates.length === 0
                    ? "Sem anilhas cadastradas"
                    : location.plates
                        .filter((plate) => plate.kind === "anilha")
                        .map((plate) => `${plate.quantity} × ${formatPlateWeight(plate.weightKg)}`)
                        .join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {!location.isDefault && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9"
                    onClick={() => setDefault(location)}
                    disabled={busy}
                  >
                    <Star className="size-3.5" />
                    Tornar padrão
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => openPlates(location)}
                >
                  Anilhas
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  onClick={() => setConfirmDelete(location)}
                  aria-label={`Excluir ${location.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}

        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Nome do local (ex.: Academia do bairro)"
            className="h-11"
            aria-label="Nome do novo local"
          />
          <Button className="h-11 shrink-0" onClick={create} disabled={busy || !newName.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Adicionar
          </Button>
        </div>
      </CardContent>

      {/* ───────── Anilhas ───────── */}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Anilhas de {editing?.name}</DialogTitle>
            <DialogDescription>
              A quantidade é em UNIDADES, não em pares — a calculadora divide por dois, porque a
              barra é simétrica.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {plates.map((plate, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="w-32">
                  <Label className="text-[11px] text-muted-foreground">Tipo</Label>
                  <Select
                    value={plate.kind}
                    onValueChange={(value) =>
                      setPlates((current) =>
                        current.map((item, i) =>
                          i === index ? { ...item, kind: value as PlateKind } : item,
                        ),
                      )
                    }
                  >
                    <SelectTrigger className="mt-1 h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATE_KINDS.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {PLATE_KIND_LABELS[kind]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 flex-1">
                  <Label className="text-[11px] text-muted-foreground">Peso (kg)</Label>
                  <Input
                    value={plate.weight}
                    onChange={(event) =>
                      setPlates((current) =>
                        current.map((item, i) =>
                          i === index ? { ...item, weight: event.target.value } : item,
                        ),
                      )
                    }
                    inputMode="decimal"
                    className="mt-1 h-10 text-center tabular-nums"
                    aria-label="Peso em quilos"
                  />
                </div>
                <div className="w-24">
                  <Label className="text-[11px] text-muted-foreground">Unidades</Label>
                  <Input
                    value={plate.quantity}
                    onChange={(event) =>
                      setPlates((current) =>
                        current.map((item, i) =>
                          i === index ? { ...item, quantity: event.target.value } : item,
                        ),
                      )
                    }
                    inputMode="numeric"
                    className="mt-1 h-10 text-center tabular-nums"
                    aria-label="Quantidade de unidades"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10 shrink-0"
                  onClick={() =>
                    setPlates((current) => current.filter((_, i) => i !== index))
                  }
                  aria-label="Remover item"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              className="h-10 w-full"
              onClick={() =>
                setPlates((current) => [...current, { kind: "anilha", weight: "", quantity: "2" }])
              }
            >
              <Plus className="size-4" />
              Adicionar item
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={savePlates} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Salvar anilhas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────── Excluir ───────── */}
      <Dialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir {confirmDelete?.name}?</DialogTitle>
            <DialogDescription>
              As anilhas cadastradas aqui saem junto. Os treinos que aconteceram neste local
              continuam registrados — eles só deixam de mostrar o nome do lugar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={remove} disabled={busy}>
              Excluir local
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
