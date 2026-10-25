"use client";

/**
 * 03-G (L3, D-G14) — limite de erro do app: pega a falha de qualquer página, com a casca
 * (Sidebar e Header) na tela. NÃO pega a falha do `(app)/layout.tsx` do mesmo segmento — quem a
 * pega é o `global-error.tsx` (não há `src/app/error.tsx`: custo de bundle, ver `tela-de-erro.tsx`).
 *
 * Reexporta o limite único (`LimiteDeErro`), pelo motivo de bundle escrito lá (D-G15).
 */
export { LimiteDeErro as default } from "@/components/shared/tela-de-erro";
