"use client";

/**
 * Fase 17-F — Treinos · integrações do módulo (cliente).
 *
 * ⛔ A tela declara a FONTE DE VERDADE antes de oferecer qualquer interruptor. É o que impede
 * a mesma informação de virar quatro registros divergentes:
 *
 *   • "o treino aconteceu"        → a sessão registrada (o hábito só reflete);
 *   • "está planejado para o dia" → o planejamento (a agenda é espelho);
 *   • "peso e medidas"            → o módulo central `body_*`, o mesmo da Dieta.
 *
 * Nada aqui liga sozinho: os dois recursos nascem desligados.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Target } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setTrainingHabit } from "@/lib/actions/training-integrations";

const NENHUM = "__nenhum__";

export function TrainingIntegrationsCard({
  habitId,
  habits,
  googleConnected,
  googleSyncEnabled,
}: {
  habitId: string | null;
  habits: { id: string; name: string }[];
  googleConnected: boolean;
  googleSyncEnabled: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(habitId ?? NENHUM);
  const [saving, setSaving] = React.useState(false);

  // Recarregar do servidor precisa refletir aqui — ajuste durante o render (React Compiler).
  const [last, setLast] = React.useState(habitId);
  if (last !== habitId) {
    setLast(habitId);
    setValue(habitId ?? NENHUM);
  }

  async function handleChange(next: string) {
    setValue(next);
    setSaving(true);
    const res = await setTrainingHabit({ habit_id: next === NENHUM ? null : next });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      setValue(habitId ?? NENHUM);
      return;
    }
    toast.success(
      next === NENHUM
        ? "Vínculo removido. O hábito volta a ser registrado à mão."
        : "Vínculo salvo. O check-in do dia passa a refletir os treinos concluídos.",
    );
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Integrações</CardTitle>
        <CardDescription>
          Cada informação tem um dono. O treino registrado é a fonte de verdade sobre o que
          aconteceu; agenda e hábito são espelhos opcionais, criados por escolha sua.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Hábito */}
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-start gap-2.5">
            <Target className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <Label htmlFor="training-habit" className="text-sm font-medium">
                  Hábito que reflete os treinos
                </Label>
                <p className="text-xs text-muted-foreground">
                  Ao concluir um treino, o check-in daquele dia é preenchido a partir das
                  sessões concluídas — sem você registrar a mesma coisa duas vezes. Excluir ou
                  reabrir uma sessão atualiza o dia de volta.
                </p>
              </div>
              {habits.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum hábito cadastrado ainda.{" "}
                  <Link href="/habitos" className="underline underline-offset-2">
                    Criar em Hábitos
                  </Link>
                  .
                </p>
              ) : (
                <Select value={value} onValueChange={handleChange} disabled={saving}>
                  <SelectTrigger id="training-habit" className="w-full sm:max-w-sm">
                    <SelectValue placeholder="Nenhum" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NENHUM}>Nenhum (desligado)</SelectItem>
                    {habits.map((habit) => (
                      <SelectItem key={habit.id} value={habit.id}>
                        {habit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>

        {/* Agenda */}
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-start gap-2.5">
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Treinos planejados no Google Agenda</p>
              <p className="text-xs text-muted-foreground">
                {googleConnected
                  ? googleSyncEnabled
                    ? "Ligado. Cada dia planejado com treino vira um evento; dia de descanso não vira nada."
                    : "Desligado. Nenhum treino sai daqui sem você ligar."
                  : "Conecte a conta Google na Agenda para habilitar o envio."}
              </p>
              <Button asChild variant="outline" size="sm" className="mt-2">
                <Link href="/agenda">Abrir configuração na Agenda</Link>
              </Button>
            </div>
          </div>
        </div>

        <p className="text-[0.7rem] leading-snug text-muted-foreground">
          Peso e circunferências ficam nas medidas corporais, compartilhadas com o módulo Dieta:
          o que você registra em um aparece no outro, e não existe uma segunda tabela de peso.
        </p>
      </CardContent>
    </Card>
  );
}