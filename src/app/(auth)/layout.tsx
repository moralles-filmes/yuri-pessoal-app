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
      {/* Coluna da marca: sem fundo próprio, o texto vai direto na névoa. */}
      <div className="hidden flex-col justify-between p-10 text-foreground lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary-fill font-bold text-primary-fill-foreground">
            Y
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Sistema Pessoal</p>
            <p className="text-xs text-muted-on-fog">por Yuri</p>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-3xl font-semibold leading-tight">
            Sua vida pessoal,
            <br />
            organizada num só lugar.
          </h2>
          <p className="max-w-sm text-sm text-muted-on-fog">
            Controle financeiro completo, cartões e faturas, agenda, tarefas,
            hábitos e estudos — com um visual premium e rápido de usar.
          </p>
        </div>

        <ul className="space-y-3">
          {HIGHLIGHTS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.label} className="flex items-center gap-3 text-sm">
                <span className="ladrilho grid size-8 place-items-center rounded-lg text-foreground">
                  <Icon className="size-4" />
                </span>
                <span>{item.label}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Formulário */}
      <div className="flex items-center justify-center p-6">
        <div className="vidro-cartao w-full max-w-sm rounded-[28px] p-6 sm:p-8">{children}</div>
      </div>
    </div>
  );
}
