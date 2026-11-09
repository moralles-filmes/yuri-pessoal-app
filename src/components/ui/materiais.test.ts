import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { cn } from "@/lib/utils"
import {
  MATERIAL_CARTAO,
  MATERIAL_LADRILHO,
  MATERIAL_PILULA,
  PRESSAO,
} from "./materiais"

const SOMBRA_CARTAO = "shadow-(--shadow-vidro)"

describe("materiais das primitivas", () => {
  it("o cartao cede fundo e brilho para quem sobrescreve", () => {
    const r = cn(MATERIAL_CARTAO, "bg-transparent bg-none")
    expect(r).not.toContain("bg-card")
    expect(r).not.toContain("linear-gradient")
    expect(r).toContain("bg-transparent")
  })

  it("bg-transparent sozinho remove o fundo mas mantem o brilho", () => {
    const r = cn(MATERIAL_CARTAO, "bg-transparent")
    expect(r).not.toContain("bg-card")
    expect(r).toContain("linear-gradient")
  })

  it("o cartao cede a borda", () => {
    const r = cn(MATERIAL_CARTAO, "border-primary/30")
    expect(r).not.toContain("border-glass-border")
    expect(r).toContain("border-primary/30")
  })

  it("o cartao cede a sombra", () => {
    const r = cn(MATERIAL_CARTAO, "shadow-none")
    expect(r).not.toContain(SOMBRA_CARTAO)
    expect(r).toContain("shadow-none")
  })

  it("o ladrilho cede fundo, largura da borda e sombra", () => {
    const r = cn(MATERIAL_LADRILHO, "border-0 bg-transparent shadow-none")
    // border-0 troca a LARGURA; a cor da borda e outro grupo do twMerge e
    // fica (inofensiva: largura zero). Nao sobra fundo, largura nem sombra.
    expect(r.split(/\s+/).sort()).toEqual(
      ["bg-transparent", "border-0", "border-tile-border", "shadow-none"].sort(),
    )
  })

  it("a pilula cede o fundo", () => {
    const r = cn(MATERIAL_PILULA, "bg-primary-fill")
    expect(r).not.toContain("bg-pill")
    expect(r).toContain("bg-primary-fill")
  })

  it("nenhuma constante usa utilitaria desconhecida do twMerge, blur ou raio", () => {
    for (const c of [MATERIAL_CARTAO, MATERIAL_LADRILHO, MATERIAL_PILULA, PRESSAO]) {
      expect(c).not.toContain("vidro-")
      expect(c).not.toMatch(/(^|\s)ladrilho(\s|$)/)
      expect(c).not.toContain("backdrop-")
      expect(c).not.toContain("rounded")
    }
  })

  it("a pressao usa a mola e respeita movimento reduzido", () => {
    expect(PRESSAO).toContain("ease-mola")
    expect(PRESSAO).toContain("active:scale-[.96]")
    expect(PRESSAO).toContain("motion-reduce:transition-none")
    expect(PRESSAO).toContain("motion-reduce:active:scale-100")
  })

  it("o arquivo nao tem import", () => {
    const fonte = readFileSync(join(__dirname, "materiais.ts"), "utf8")
    expect(fonte).not.toMatch(/^\s*import\s/m)
  })
})
