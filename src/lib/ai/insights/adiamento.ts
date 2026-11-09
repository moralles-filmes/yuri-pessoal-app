import { dateInSaoPaulo } from "@/lib/format";

/** Soma dias civis à data de Brasília, sem depender do fuso do dispositivo. */
export function dataDeAdiamento(agora: Date, dias: number): string {
  const [ano, mes, dia] = dateInSaoPaulo(agora).split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}
