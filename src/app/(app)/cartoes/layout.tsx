// REDESIGN-05-A — `/cartoes` passa a viver na casca da central de cartões.
import { CartoesShell } from "@/components/cartoes/cartoes-shell";

export default function CartoesLayout({ children }: { children: React.ReactNode }) {
  return <CartoesShell>{children}</CartoesShell>;
}
