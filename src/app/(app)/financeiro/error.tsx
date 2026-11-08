"use client";

/**
 * 03-G (L3, D-G14) — limite de erro do Financeiro: existe para o cabeçalho e as abas do módulo
 * (`financeiro/layout.tsx`) continuarem na tela quando a leitura de uma aba falha.
 *
 * Reexporta o limite único (`LimiteDeErro`), pelo motivo de bundle escrito lá (D-G15).
 */
export { LimiteDeErro as default } from "@/components/shared/tela-de-erro";
