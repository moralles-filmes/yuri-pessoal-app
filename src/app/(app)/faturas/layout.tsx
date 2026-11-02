// REDESIGN-05-A — `/faturas` entra na casca da central de cartões, sem mudar de lugar.
import { CartoesShell } from "@/components/cartoes/cartoes-shell";

export default function FaturasLayout({ children }: { children: React.ReactNode }) {
  return <CartoesShell>{children}</CartoesShell>;
}
