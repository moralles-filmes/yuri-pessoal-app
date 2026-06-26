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
  children,
}: {
  id: DashCardId;
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
        "flex h-full flex-col overflow-hidden",
        personalizing && "cursor-grab ring-1 ring-border/80",
        personalizing && hidden && "opacity-55",
      )}
    >
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex min-w-0 items-center gap-2 text-base">
          {personalizing && (
            <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <Icon className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="truncate">{title}</span>
          {personalizing && hidden && (
            <Badge variant="outline" className="ml-1 text-muted-foreground">
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
            className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Ver
            <ChevronRight className="size-3" />
          </Link>
        )}
      </CardHeader>

      <CardContent className="flex-1 pt-0">{children}</CardContent>
    </Card>
  );
}
