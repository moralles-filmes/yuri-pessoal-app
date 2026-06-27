"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TRANSACTION_STATUSES,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
} from "@/lib/finance/constants";

const ALL = "all";

export function TransactionFilters({
  accounts,
  categories,
  cards,
}: {
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  cards: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = React.useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!value || value === ALL) params.delete(key);
      else params.set(key, value);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const current = (key: string) => searchParams.get(key) ?? ALL;
  const hasFilters = [
    "type",
    "status",
    "account",
    "card",
    "category",
    "month",
  ].some((k) => searchParams.get(k));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={current("type")} onValueChange={(v) => setParam("type", v)}>
        <SelectTrigger size="sm" className="w-auto min-w-28">
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os tipos</SelectItem>
          {TRANSACTION_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {TRANSACTION_TYPE_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={current("status")}
        onValueChange={(v) => setParam("status", v)}
      >
        <SelectTrigger size="sm" className="w-auto min-w-28">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os status</SelectItem>
          {TRANSACTION_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {TRANSACTION_STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={current("account")}
        onValueChange={(v) => setParam("account", v)}
      >
        <SelectTrigger size="sm" className="w-auto min-w-28">
          <SelectValue placeholder="Conta" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas as contas</SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={current("card")} onValueChange={(v) => setParam("card", v)}>
        <SelectTrigger size="sm" className="w-auto min-w-28">
          <SelectValue placeholder="Cartão" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os cartões</SelectItem>
          {cards.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={current("category")}
        onValueChange={(v) => setParam("category", v)}
      >
        <SelectTrigger size="sm" className="w-auto min-w-28">
          <SelectValue placeholder="Categoria" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas as categorias</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="month"
        aria-label="Mês"
        value={searchParams.get("month") ?? ""}
        onChange={(e) => setParam("month", e.target.value)}
        className="h-7 w-auto"
      />

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.replace(pathname, { scroll: false })}
        >
          <X /> Limpar
        </Button>
      )}
    </div>
  );
}
