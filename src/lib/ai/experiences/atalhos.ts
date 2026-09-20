/**
 * Fase 18-F · Bloco 4 — IA · O que a TELA sabe sobre as experiências.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ ESTE ARQUIVO NÃO TEM UM ÚNICO IMPORT, E A SEPARAÇÃO É A MESMA DA REGRA 3 DO         ║
 * ║ CARREGAMENTO SOB DEMANDA.                                                             ║
 * ║                                                                                       ║
 * ║ `chat-client.tsx` precisa de três títulos para desenhar três botões. `catalog.ts`      ║
 * ║ carrega junto os prompts de redação inteiros e importa o Tool Registry — que o cliente ║
 * ║ baixaria por causa de três strings. A lista é DADO; o catálogo é declaração de         ║
 * ║ servidor. Um teste amarra as duas, então elas não divergem.                           ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

export type AtalhoDeExperiencia = {
  readonly id: string;
  readonly titulo: string;
  readonly descricao: string;
};

export const ATALHOS_DE_EXPERIENCIA: readonly AtalhoDeExperiencia[] = [
  {
    id: "planejar-dia",
    titulo: "Planejar meu dia",
    descricao: "Tarefas, compromissos, hábitos e rotinas de hoje, num panorama só.",
  },
  {
    id: "encerrar-dia",
    titulo: "Encerrar meu dia",
    descricao: "O que ficou aberto, o que você registrou e o que dá para fechar.",
  },
  {
    id: "planejar-semana",
    titulo: "Planejar minha semana",
    descricao: "Os próximos sete dias: tarefas, agenda, hábitos e treino.",
  },
];
