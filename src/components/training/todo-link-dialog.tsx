"use client";

/**
 * Fase 17-F — criar tarefa no TO-DO a partir dos Treinos (opt-in, com vínculo).
 *
 * ⛔ NADA ACONTECE SOZINHO. O módulo nunca cria tarefa por conta própria: este diálogo só abre
 * por clique, e a tarefa nasce com um LINK de volta para o registro que a originou — é o
 * vínculo que faz o sistema (e o usuário) saberem que os dois são a mesma coisa.
 *
 * ⛔ E NÃO DUPLICA VERDADE. A tarefa é um lembrete de execução; quem sabe se o treino
 * aconteceu continua sendo a sessão registrada. Concluir a tarefa não registra treino nenhum,
 * e a tela diz isso.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { ListTodo } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createGoalTodo,
  createTrainingTodo,
  createWorkoutTodo,
} from "@/lib/actions/training-integrations";

type Kind = "treino" | "meta" | "avulsa";

export function TodoLinkDialog({
  kind,
  defaultTitle,
  defaultDate = null,
  scheduledId = null,
  goalId = null,
  trigger,
}: {
  kind: Kind;
  defaultTitle: string;
  /** 'yyyy-MM-dd' — data programada sugerida. */
  defaultDate?: string | null;
  scheduledId?: string | null;
  goalId?: string | null;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState(defaultTitle);
  const [date, setDate] = React.useState(defaultDate ?? "");
  const [pending, start] = React.useTransition();

  // Reabrir com outro registro precisa recarregar o padrão — ajuste durante o render.
  const [lastTitle, setLastTitle] = React.useState(defaultTitle);
  if (lastTitle !== defaultTitle) {
    setLastTitle(defaultTitle);
    setTitle(defaultTitle);
    setDate(defaultDate ?? "");
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      toast.error("Informe o título da tarefa.");
      return;
    }

    start(async () => {
      const scheduled = date || null;
      const res =
        kind === "meta" && goalId
          ? await createGoalTodo({ goal_id: goalId, scheduled_date: scheduled })
          : kind === "treino"
            ? await createWorkoutTodo({
                scheduled_id: scheduledId,
                title: title.trim(),
                scheduled_date: scheduled,
              })
            : await createTrainingTodo({
                title: title.trim(),
                description: null,
                scheduled_date: scheduled,
              });

      if (res.ok) {
        toast.success("Tarefa criada no TO-DO.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Não foi possível criar a tarefa.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <ListTodo className="size-4" />
            Criar tarefa
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Criar tarefa no TO-DO</DialogTitle>
          <DialogDescription>
            A tarefa nasce com um link de volta para este registro. Ela é um lembrete de
            execução — quem registra que o treino aconteceu continua sendo a sessão.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          {kind !== "meta" && (
            <div className="space-y-1.5">
              <Label htmlFor="todo-title" className="text-xs">
                Título
              </Label>
              <Input
                id="todo-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={300}
                autoFocus
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="todo-date" className="text-xs">
              Data programada (opcional)
            </Label>
            <Input
              id="todo-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending} className="w-full sm:w-auto">
              {pending ? "Criando…" : "Criar tarefa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}