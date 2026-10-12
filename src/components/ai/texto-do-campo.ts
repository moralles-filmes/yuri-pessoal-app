/**
 * REDESIGN-07-D · D1 — como um campo tocado aparece em `/ia/acoes`.
 *
 * `changed_fields` guarda escalares crus (§3.6), e a tela os passava por `String()`: um id saía
 * como UUID, um instante como ISO em UTC. Aqui eles ganham forma de gente — sem inventar nada:
 * é só apresentação do que a auditoria já guarda (invariante 20).
 *
 * - instante (`timestamptz`) → dia e hora EM BRASÍLIA, nunca `.slice(0, 10)`;
 * - data pura (`yyyy-MM-dd`) → texto, sem passar por `Date`;
 * - uuid → "registro interno" (o id não diz nada ao dono, e o link "Ver o registro" já leva lá);
 * - booleano → sim/não; nulo → "sem valor".
 */
import { formatDate, timeInSaoPaulo } from "@/lib/format";

const DATA_PURA = /^\d{4}-\d{2}-\d{2}$/;
const INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rótulo legível de um campo tocado. A coluna é técnica; a tela não precisa ser. */
export const ROTULO_DO_CAMPO: Readonly<Record<string, string>> = {
  title: "Título",
  scheduled_date: "Data",
  scheduled_date_anterior: "Data anterior",
  scheduled_time: "Hora",
  scheduled_for: "Concluída em",
  next_scheduled_date: "Próxima ocorrência",
  recurred: "Tarefa recorrente",
  deadline_at: "Prazo",
  priority: "Prioridade",
  project_id: "Projeto",
  status: "Situação",
  value: "Valor registrado",
  is_done: "Marcado como feito",
  log_date: "Dia",
  start_at: "Início",
  end_at: "Fim",
  all_day: "Dia inteiro",
  tipo: "Tipo",
  food_name: "Alimento",
  quantity: "Quantidade",
  measure_label: "Medida",
  diary_date: "Dia do diário",
  meal_name: "Refeição",
  type: "Tipo",
  amount: "Valor",
  description: "Descrição",
  purchase_date: "Data da compra",
  account_or_card: "Conta ou cartão",
  modulo: "Módulo",
  expires_at: "Válida até",
};

/** O rótulo, ou a chave crua quando o command trouxer um campo que esta tela não conhece. */
export function rotuloDoCampo(chave: string): string {
  return Object.hasOwn(ROTULO_DO_CAMPO, chave) ? ROTULO_DO_CAMPO[chave] : chave;
}

export function textoDoCampo(valor: string | number | boolean | null): string {
  if (valor === null) return "sem valor";
  if (typeof valor === "boolean") return valor ? "sim" : "não";
  if (typeof valor === "number") return String(valor);
  if (DATA_PURA.test(valor)) return formatDate(valor);
  if (INSTANTE.test(valor)) {
    const d = new Date(valor);
    if (!Number.isNaN(d.getTime())) return `${formatDate(d)} às ${timeInSaoPaulo(d)}`;
  }
  if (UUID.test(valor)) return "registro interno";
  return valor;
}
