import { describe, expect, it } from "vitest";
import { applyTextOp, computeChanges, findReplace, parseClipboardGrid } from "@/lib/participants/bulk";
import { buildImport, parseCsvText, parsePastedText, suggestMapping } from "@/lib/import/spreadsheet";
import { validateParticipants } from "@/lib/import/validate";
import type { Participant } from "@/lib/model/types";

const mk = (n: number): Participant[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, templateId: "t", overrides: {}, values: { c1: `  nome   ${i} da silva `, c2: i % 2 ? "8h" : "" } }));

describe("edição em massa", () => {
  it("transforma textos", () => {
    expect(applyTextOp("  maria   DA silva ", "capitalize")).toBe("Maria da Silva");
    expect(applyTextOp("joão", "upper")).toBe("JOÃO");
    expect(applyTextOp("  a   b ", "trim")).toBe("a b");
  });

  it("localiza e substitui", () => {
    expect(findReplace("8h de curso", "8H", "12h", { caseSensitive: false, wholeCell: false })).toBe("12h de curso");
    expect(findReplace("8h", "8h", "10h", { caseSensitive: true, wholeCell: true })).toBe("10h");
    expect(findReplace("8h total", "8h", "10h", { caseSensitive: true, wholeCell: true })).toBe("8h total");
    expect(findReplace("a.b", ".", "-", { caseSensitive: true, wholeCell: false })).toBe("a-b");
  });

  it("calcula apenas mudanças reais em 1.000 registros", () => {
    const ps = mk(1000);
    const changes = computeChanges(ps, null, ["c2"], (v) => (v === "" ? "4h" : v));
    expect(changes).toHaveLength(500);
    const sel = computeChanges(ps, ["p1", "p2", "p3"], ["c2"], () => "12h");
    expect(sel).toHaveLength(3);
  });

  it("lê grade colada do Excel", () => {
    expect(parseClipboardGrid("a\tb\r\nc\td\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("respeita células com quebra de linha e aspas coladas do Excel", () => {
    expect(parseClipboardGrid('Ana\t"Rua A\nApto 2"\nBia\t"Diz ""oi"""\n')).toEqual([
      ["Ana", "Rua A\nApto 2"],
      ["Bia", 'Diz "oi"'],
    ]);
    expect(parseClipboardGrid("um\ndois")).toEqual([["um"], ["dois"]]);
  });
});

describe("importação de planilhas", () => {
  it("lê CSV com ponto e vírgula e acentos, sugerindo colunas", () => {
    const t = parseCsvText("Nome;Empresa;Carga horária\nMaria Silva;Empresa A;8h\nJoão Oliveira;Empresa B;12h\n;;\nAna Pereira;Empresa C;8h\n");
    expect(t.headers).toEqual(["Nome", "Empresa", "Carga horária"]);
    expect(t.rows).toHaveLength(3);
    const mapping = suggestMapping(t.headers, []);
    expect(mapping.map((m) => (m.kind === "new" ? m.key : m.kind))).toEqual(["nome", "empresa", "carga_horaria"]);
    const r = buildImport(t, mapping, [], "t1");
    expect(r.columns.map((c) => c.key)).toEqual(["nome", "empresa", "carga_horaria"]);
    expect(r.participants[1].values[r.columns[0].id]).toBe("João Oliveira");
  });

  it("mapeia 'Nome completo' para a coluna nome existente", () => {
    const m = suggestMapping(["Nome completo", "Cargo"], [{ id: "x", key: "nome", label: "Nome" }]);
    expect(m[0]).toEqual({ kind: "existing", columnId: "x" });
  });

  it("lê texto colado (TAB)", () => {
    const t = parsePastedText("Nome\tCidade\nAna\tSão Paulo\nBia\tCuritiba");
    expect(t.rows).toEqual([
      ["Ana", "São Paulo"],
      ["Bia", "Curitiba"],
    ]);
  });

  it("valida vazios e duplicidades", () => {
    const ps: Participant[] = [
      { id: "1", templateId: "t", overrides: {}, values: { n: "Ana Silva" } },
      { id: "2", templateId: "t", overrides: {}, values: { n: "ANA  SILVA" } },
      { id: "3", templateId: "t", overrides: {}, values: { n: "" } },
      { id: "4", templateId: "t", overrides: {}, values: { n: "Ána Silva" } },
    ];
    const v = validateParticipants(ps, [{ id: "n", key: "nome", label: "Nome" }], "n");
    expect(v.emptyName).toEqual(["3"]);
    expect(v.duplicates).toEqual([["1", "2", "4"]]);
  });

  it("importa 1.000 linhas", () => {
    const csv = ["Nome,Email", ...Array.from({ length: 1000 }, (_, i) => `Pessoa ${i},p${i}@x.com`)].join("\n");
    const t = parseCsvText(csv);
    expect(t.rows).toHaveLength(1000);
  });
});

describe("XLSX", () => {
  it("lê planilha Excel com acentos", async () => {
    const { makeXlsx, participantRows } = await import("../fixtures/make-fixtures");
    const { parseSpreadsheetFile } = await import("@/lib/import/spreadsheet");
    const bytes = makeXlsx(participantRows(10));
    const file = Object.assign(new Blob([bytes.slice().buffer as ArrayBuffer]), { name: "p.xlsx" });
    const t = await parseSpreadsheetFile(file);
    expect(t.headers).toEqual(["Nome", "Empresa", "Carga horária", "Categoria"]);
    expect(t.rows).toHaveLength(10);
    expect(t.rows[1][0]).toBe("João Oliveira");
    expect(t.sheetName).toBe("Participantes");
  });
});
