"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DASH_CARD_TITLES, type DashCardId } from "@/lib/dashboard/cards";
import { DASH_CARD_HREF, DASH_CARD_ICONS } from "./card-meta";

/**
 * Frame de cada card do dashboard: cabeçalho (ícone + título + link "Ver") e, no modo
 * "Personalizar", controles de reordenar (↑/↓ + drag HTML5) e ocultar/mostrar. O corpo
 * (`children`) é renderizado pelo Server Component correspondente (Suspense por card).
 */
export function CardShell({
  id,
  personalizing,
  hidden,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onToggleHidden,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  subtitulo,
  children,
}: {
  id: DashCardId;
  subtitulo?: string;
  personalizing: boolean;
  hidden: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleHidden: () => void;
  onDragStart?: () => void;
  onDragOver?: () => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
  children: React.ReactNode;
}) {
  const Icon = DASH_CARD_ICONS[id];
  const title = DASH_CARD_TITLES[id];

  return (
    <Card
      draggable={personalizing}
      onDragStart={onDragStart}
      onDragOver={(e) => {
        if (!personalizing) return;
        e.preventDefault();
        onDragOver?.();
      }}
      onDrop={(e) => {
        if (!personalizing) return;
        e.preventDefault();
        onDrop?.();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-[28px]",
        personalizing && "cursor-grab ring-1 ring-border/80",
        personalizing && hidden && "opacity-55",
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex min-w-0 items-center gap-2.5 text-[1.0625rem] font-semibold tracking-[-0.018em]">
          {personalizing && (
            <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span
            aria-hidden
            className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-primary/10 text-primary"
          >
            <Icon className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate">{title}</span>
            {subtitulo && (
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {subtitulo}
              </span>
            )}
          </span>
          {personalizing && hidden && (
            <Badge variant="outline" className="ml-1 shrink-0 text-muted-foreground">
              Oculto
            </Badge>
          )}
        </CardTitle>

        {personalizing ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={isFirst}
              onClick={onMoveUp}
              aria-label="Mover para cima"
            >
              <ArrowUp />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={isLast}
              onClick={onMoveDown}
              aria-label="Mover para baixo"
            >
              <ArrowDown />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleHidden}
              aria-label={hidden ? "Mostrar card" : "Ocultar card"}
            >
              {hidden ? <EyeOff /> : <Eye />}
            </Button>
          </div>
        ) : (
          <Link
            href={DASH_CARD_HREF[id]}
            className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary transition-colors hover:underline"
          >
            Ver tudo
            <ChevronRight className="size-3" aria-hidden />
          </Link>
        )}
      </CardHeader>

      <CardContent className="@container flex-1 pt-0">{children}</CardContent>
    </Card>
  );
}
