/**
 * REDESIGN-04-A — saudação, data e título da abertura do painel. PURO: `hoje` e a hora chegam de fora, nada
 * aqui lê o relógio.
 */

/**
 * "Bom dia" de 05:00 a 11:59, "Boa tarde" de 12:00 a 17:59, "Boa noite" no resto (18:00 a 04:59).
 * Recebe a hora de parede de Brasília como 'HH:mm'.
 */
export function saudacaoPara(horaHHmm: string): "Bom dia" | "Boa tarde" | "Boa noite" {
  const hora = Number.parseInt(horaHHmm.slice(0, 2), 10);
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

const DIA_DA_SEMANA_E_MES = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/**
 * A data da abertura do painel: "Sexta-feira, 6 de novembro". Recebe `'yyyy-MM-dd'` e a monta em
 * `Date.UTC` sobre o texto, sem fuso: o dia que vem de fora é o dia que sai.
 */
export function dataDaAbertura(hojeIso: string): string {
  const [ano, mes, dia] = hojeIso.split("-").map(Number);
  const texto = DIA_DA_SEMANA_E_MES.format(new Date(Date.UTC(ano, mes - 1, dia)));
  // "sexta-feira, 6 de novembro": o "-feira" fica, só a inicial sobe.
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Texto até o primeiro espaço. Nome só com espaços não é nome. */
function primeiroNomeDe(nome: string | null): string | null {
  const limpo = nome?.trim();
  if (!limpo) return null;
  return limpo.split(/\s+/)[0];
}

/** "Boa noite, Maria." — sem nome, "Boa noite." (nunca uma vírgula solta). */
export function tituloDaAbertura(saudacao: string, nome: string | null): string {
  const primeiro = primeiroNomeDe(nome);
  return primeiro ? `${saudacao}, ${primeiro}.` : `${saudacao}.`;
}
