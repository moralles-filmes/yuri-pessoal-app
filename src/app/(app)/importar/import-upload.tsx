"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, FileUp, Loader2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { IMPORT_ORIGEM_LABELS } from "@/lib/import/constants";
import { parseImportFile } from "@/lib/actions/imports";
import type { ImportOrigem } from "@/lib/import/constants";

type CardOption = { id: string; nome: string };
type AccountOption = { id: string; name: string };

const ACCEPT = ".xlsx,.xls,.csv,.ofx";

export function ImportUpload({
  cards,
  accounts,
}: {
  cards: CardOption[];
  accounts: AccountOption[];
}) {
  const router = useRouter();
  const [origem, setOrigem] = React.useState<ImportOrigem>("cartao");
  const [cardId, setCardId] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [sinal, setSinal] = React.useState(true);
  const [file, setFile] = React.useState<File | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function pickFile(f: File | null) {
    if (!f) return;
    const ok = /\.(xlsx|xls|csv|ofx)$/i.test(f.name);
    if (!ok) {
      toast.error("Formato não suportado. Use .xlsx, .xls, .csv ou .ofx.");
      return;
    }
    setFile(f);
  }

  async function handleSubmit() {
    if (!file) {
      toast.error("Selecione um arquivo.");
      return;
    }
    if (origem === "cartao" && !cardId) {
      toast.error("Selecione o cartão de destino.");
      return;
    }
    if (origem === "conta" && !accountId) {
      toast.error("Selecione a conta de destino.");
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("origem", origem);
      if (origem === "cartao") fd.append("credit_card_id", cardId);
      if (origem === "conta") {
        fd.append("account_id", accountId);
        fd.append("sinal_negativo_despesa", String(sinal));
      }
      fd.append("file", file);

      const res = await parseImportFile(fd);
      if (res.ok) {
        toast.success("Arquivo lido. Revise antes de importar.");
        router.push(`/importar?batch=${res.data.batchId}`);
      } else {
        toast.error(res.error);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const noTarget =
    (origem === "cartao" && cards.length === 0) ||
    (origem === "conta" && accounts.length === 0);

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Origem</Label>
            <Select
              value={origem}
              onValueChange={(v) => setOrigem(v as ImportOrigem)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["cartao", "conta"] as ImportOrigem[]).map((o) => (
                  <SelectItem key={o} value={o}>
                    {IMPORT_ORIGEM_LABELS[o]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {origem === "cartao" ? (
            <div className="space-y-1.5">
              <Label>Cartão de destino</Label>
              <Select value={cardId} onValueChange={setCardId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione o cartão" />
                </SelectTrigger>
                <SelectContent>
                  {cards.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Conta de destino</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {origem === "conta" && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/40 p-3">
            <div className="space-y-0.5">
              <Label htmlFor="imp-sinal">Valores negativos são despesas</Label>
              <p className="text-xs text-muted-foreground">
                Padrão da maioria dos extratos. Desligue se o seu usa o contrário.
              </p>
            </div>
            <Switch id="imp-sinal" checked={sinal} onCheckedChange={setSinal} />
          </div>
        )}

        {noTarget ? (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
            {origem === "cartao"
              ? "Nenhum cartão cadastrado. Cadastre um em Cartões antes de importar."
              : "Nenhuma conta cadastrada. Cadastre uma em Financeiro → Contas."}
          </p>
        ) : (
          <>
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pickFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/40",
              )}
            >
              <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                <UploadCloud className="size-6" />
              </div>
              <p className="text-sm font-medium">
                Arraste o arquivo aqui ou clique para selecionar
              </p>
              <p className="text-xs text-muted-foreground">
                Excel (.xlsx, .xls), CSV ou OFX · máximo 5 MB
              </p>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {file && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/40 p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <FileSpreadsheet className="size-4 shrink-0 text-primary" />
                  <span className="truncate text-sm">{file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(0)} KB
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remover arquivo"
                  onClick={() => setFile(null)}
                >
                  <X />
                </Button>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleSubmit} disabled={submitting || !file}>
                {submitting ? <Loader2 className="animate-spin" /> : <FileUp />}
                {submitting ? "Lendo arquivo…" : "Ler e revisar"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
