import { CreditCard, CalendarDays, Target, GraduationCap } from "lucide-react";

const HIGHLIGHTS = [
  { icon: CreditCard, label: "Cartões, faturas e parcelamentos" },
  { icon: CalendarDays, label: "Agenda integrada ao Google" },
  { icon: Target, label: "Hábitos, água, leitura e exercícios" },
  { icon: GraduationCap, label: "Cursos e sessões de estudo" },
];

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Painel de marca (sempre preto/dourado — superfície premium) */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-neutral-950 p-10 text-neutral-100 lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-primary/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-16 size-80 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary font-bold text-primary-foreground">
            Y
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Sistema Pessoal</p>
            <p className="text-xs text-neutral-400">por Yuri</p>
          </div>
        </div>

        <div className="relative space-y-4">
          <h2 className="text-3xl font-semibold leading-tight">
            Sua vida pessoal,
            <br />
            <span className="text-gradient-gold">organizada num só lugar.</span>
          </h2>
          <p className="max-w-sm text-sm text-neutral-400">
            Controle financeiro completo, cartões e faturas, agenda, tarefas,
            hábitos e estudos — com um visual premium e rápido de usar.
          </p>
        </div>

        <ul className="relative space-y-3">
          {HIGHLIGHTS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.label} className="flex items-center gap-3 text-sm">
                <span className="grid size-8 place-items-center rounded-lg bg-white/5 text-primary ring-1 ring-white/10">
                  <Icon className="size-4" />
                </span>
                <span className="text-neutral-300">{item.label}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Formulário */}
      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
