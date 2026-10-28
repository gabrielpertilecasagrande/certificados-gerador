import { describe, expect, it } from "vitest";
import { buildContext, capitalizeWords, renderContent, slugify, tokenize, uniqueKey } from "@/lib/variables";
import { FileNameRegistry, renderFileName, sanitizeFileName } from "@/lib/variables/filename";

const project = {
  columns: [
    { id: "c1", key: "nome", label: "Nome" },
    { id: "c2", key: "carga_horaria", label: "Carga horária" },
    { id: "c3", key: "evento", label: "Evento" },
  ],
  globals: [{ id: "g1", key: "evento", label: "Evento", value: "Congresso 2026" }],
};

describe("variáveis", () => {
  it("cria chaves a partir de rótulos com acentos", () => {
    expect(slugify("Carga horária")).toBe("carga_horaria");
    expect(slugify("  Instituição / Órgão ")).toBe("instituicao_orgao");
    expect(uniqueKey("nome", ["nome", "nome_2"])).toBe("nome_3");
  });

  it("tokeniza textos compostos com filtros", () => {
    const t = tokenize("Certificamos que {{ nome | upper }} participou de {{evento}}.");
    expect(t.filter((x) => x.type === "var").map((x) => (x.type === "var" ? x.key : ""))).toEqual(["nome", "evento"]);
  });

  it("substitui valores, globais como padrão e derivados", () => {
    const ctx = buildContext(project, { values: { c1: "Ana Carolina Pereira", c2: "8", c3: "" } });
    const r = renderContent(
      "{{primeiro_nome}} / {{sobrenome}} — {{nome|upper}} participou de {{evento}} com {{carga_horaria}}h {{inexistente}}",
      ctx,
    );
    expect(r.text).toBe("Ana / Carolina Pereira — ANA CAROLINA PEREIRA participou de Congresso 2026 com 8h ");
    expect(r.missing).toEqual(["inexistente"]);
  });

  it("capitaliza respeitando conectivos", () => {
    expect(capitalizeWords("MARIA DA SILVA E SOUZA")).toBe("Maria da Silva e Souza");
  });

  it("gera nomes de arquivo seguros e únicos", () => {
    expect(sanitizeFileName('Ana/Maria: "teste"?')).toBe("Ana_Maria_ _teste_");
    const ctx = buildContext(project, { values: { c1: "João Ção" } });
    expect(renderFileName("Certificado_{{nome}}.pdf", ctx, "x")).toBe("Certificado_João Ção");
    const reg = new FileNameRegistry();
    expect(reg.take("", "Ana", "pdf")).toBe("Ana.pdf");
    expect(reg.take("", "ana", "pdf")).toBe("ana (2).pdf");
    expect(reg.take("Palestrantes", "Ana", "pdf")).toBe("Palestrantes/Ana.pdf");
  });
});
