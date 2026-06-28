"use client";

import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { arrayMoveById } from "@/lib/shared/reorder";

/**
 * Lista reordenável por arrastar-e-soltar com **alça dedicada**. Genérica: o consumidor
 * decide como cada item é renderizado e onde a alça aparece (via render prop).
 *
 * - Só a alça inicia o arraste — botões/links dentro do card seguem clicáveis.
 * - Acessível por teclado (foco na alça + setas) e por toque (delay p/ não brigar c/ scroll).
 * - A reordenação é puramente visual aqui; persistir fica a cargo do `onReorder`.
 */
export function SortableList<T>({
  items,
  getId,
  onReorder,
  renderItem,
  className,
}: {
  items: T[];
  getId: (item: T) => string;
  onReorder: (orderedIds: string[]) => void;
  /** Recebe o item e o nó da alça já pronto para ser posicionado no card. */
  renderItem: (item: T, handle: React.ReactNode) => React.ReactNode;
  className?: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = items.map(getId);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const next = arrayMoveById(ids, String(active.id), String(over.id));
    if (next !== ids) onReorder(next);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {items.map((item) => (
            <SortableRow key={getId(item)} id={getId(item)} renderItem={renderItem} item={item} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow<T>({
  id,
  item,
  renderItem,
}: {
  id: string;
  item: T;
  renderItem: (item: T, handle: React.ReactNode) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      aria-label="Arrastar para reordenar"
      className="-ml-1 flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-4" />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && "relative z-10 opacity-80")}
    >
      {renderItem(item, handle)}
    </div>
  );
}
