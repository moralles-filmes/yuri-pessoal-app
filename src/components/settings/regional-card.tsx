"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { savePreferences } from "@/lib/actions/settings";
import {
  CURRENCY,
  DATE_FORMATS,
  DATE_FORMAT_LABELS,
  type DateFormatPreference,
} from "@/lib/settings/constants";
import { formatCurrency, formatDateWith, hojeISO } from "@/lib/format";

/** Card regional: moeda (BRL, fixa) + formato de data com pré-visualização ao vivo. */
export function RegionalCard({
  dateFormat,
}: {
  dateFormat: DateFormatPreference;
}) {
  const router = useRouter();
  const [fmt, setFmt] = React.useState<DateFormatPreference>(dateFormat);
  const [pending, startTransition] = React.useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await savePreferences({ currency: CURRENCY, date_format: fmt });
      if (res.ok) {
        toast.success("Preferências regionais salvas.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Regional</CardTitle>
        <CardDescription>
          Moeda e formato de data do sistema (Brasil / pt-BR).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Moeda</Label>
              <div className="flex h-9 items-center justify-between rounded-lg border border-input bg-muted/40 px-3 text-sm">
                <span>Real brasileiro ({CURRENCY})</span>
                <span className="text-muted-foreground tabular-nums">
                  {formatCurrency(1234.56)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                O sistema opera exclusivamente em Real (BRL).
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="date_format">Formato de data</Label>
              <select
                id="date_format"
                value={fmt}
                onChange={(e) => setFmt(e.target.value as DateFormatPreference)}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
              >
                {DATE_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {DATE_FORMAT_LABELS[f]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Pré-visualização:{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {formatDateWith(hojeISO(), fmt)}
                </span>
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              <Save /> {pending ? "Salvando…" : "Salvar preferências"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
