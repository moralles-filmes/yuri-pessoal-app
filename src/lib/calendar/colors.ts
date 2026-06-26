/**
 * Cores por tipo de evento (Fase 08). Hex fixos escolhidos para boa leitura em
 * dark E light (usados como ponto/borda + fundo com baixa opacidade no chip).
 * O usuário pode sobrescrever a cor por evento (`calendar_events.color`).
 *
 * Puro e sem dependências — testável e reutilizável (chip, badge, dot do dashboard).
 */
import type { EventType } from "@/lib/calendar/constants";

/** Paleta base — dourado da identidade + auxiliares legíveis nos dois temas. */
export const EVENT_TYPE_COLORS: Record<EventType, string> = {
  pessoal: "#C99A2E", // dourado (identidade)
  trabalho: "#2F6FED", // azul
  estudos: "#7C5CFC", // violeta
  exercicios: "#1FA971", // verde
  rotina: "#64748B", // cinza-azulado
};

/** Cor efetiva de um evento: a personalizada (se houver) ou a do tipo. */
export function eventColor(event: {
  tipo: EventType;
  color?: string | null;
}): string {
  const custom = event.color?.trim();
  if (custom && /^#?[0-9a-fA-F]{3,8}$/.test(custom)) {
    return custom.startsWith("#") ? custom : `#${custom}`;
  }
  return EVENT_TYPE_COLORS[event.tipo] ?? EVENT_TYPE_COLORS.pessoal;
}

/**
 * Estilos inline de um "chip" de evento a partir da cor base. Usa color-mix para
 * derivar fundo/borda translúcidos — o texto herda a cor (escura sobre fundo claro,
 * mas legível nos dois temas por ser a própria cor base com alto contraste no chip).
 */
export function eventChipStyle(color: string): React.CSSProperties {
  return {
    backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)`,
    borderColor: `color-mix(in oklab, ${color} 36%, transparent)`,
    color,
  };
}

/** Estilo só do "ponto" (dot) colorido. */
export function eventDotStyle(color: string): React.CSSProperties {
  return { backgroundColor: color };
}
