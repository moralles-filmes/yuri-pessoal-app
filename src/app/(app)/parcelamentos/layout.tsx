// REDESIGN-05-A — `/parcelamentos` entra na casca da central de cartões, sem mudar de lugar.
import { CartoesShell } from "@/components/cartoes/cartoes-shell";

export default function ParcelamentosLayout({ children }: { children: React.ReactNode }) {
  return <CartoesShell>{children}</CartoesShell>;
}
