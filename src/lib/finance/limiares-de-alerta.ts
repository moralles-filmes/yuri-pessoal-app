/**
 * Régua comum da tela (`gerarAlertas`) e do sino (`generateNotifications`).
 * No sino, `diasDeAvisoDeVencimento` governa também o aviso de conta fixa,
 * com o mesmo valor usado para o vencimento de fatura.
 */
export const LIMIARES_DE_ALERTA = {
  gastoAlto: 1.2,
  usoDoLimite: 0.8,
  diasDeAvisoDeVencimento: 5,
} as const;
