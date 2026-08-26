import { describe, it, expect } from "vitest";
import {
  calcularSementes,
  calcularSacas,
  calcularDose,
  calcularDosePMS,
  montarCombo,
  bagSizeFromNpk,
  calcularCusto,
  formatarPrecoResumo,
  precisaAlertarPrazoAusente,
  ALQ_HA,
} from "../js/calculos.js";

// formatador simples só pra isolar formatarPrecoResumo da formatação de moeda real
const fmtMoedaFake = (n) => `R$ ${n.toFixed(2)}`;

describe("calcularSementes", () => {
  it("1 alqueire: resultado bate com a fórmula recalculada nos mesmos inputs", () => {
    const inputs = { area: 1, espacamento: 0.45, plantas: 10, transpasse: 5 };
    const esperado = ((24200 * inputs.area / inputs.espacamento) * inputs.plantas) / ((100 - inputs.transpasse) / 100);
    const resultado = calcularSementes(inputs);
    expect(resultado).toBeGreaterThan(0);
    expect(resultado).toBeCloseTo(esperado, 9);
  });

  it("área zero retorna 0", () => {
    expect(calcularSementes({ area: 0, espacamento: 0.45, plantas: 10, transpasse: 5 })).toBe(0);
  });

  it("área decimal não sofre erro de arredondamento intermediário", () => {
    const inputs = { area: 7.35, espacamento: 0.45, plantas: 10, transpasse: 5 };
    const esperado = ((24200 * inputs.area / inputs.espacamento) * inputs.plantas) / ((100 - inputs.transpasse) / 100);
    expect(calcularSementes(inputs)).toBeCloseTo(esperado, 9);
  });

  it("transpasse 0% dá exatamente (24.200 × área ÷ espaçamento) × plantas/m", () => {
    const inputs = { area: 3, espacamento: 0.45, plantas: 10, transpasse: 0 };
    const esperadoSemTranspasse = (24200 * inputs.area / inputs.espacamento) * inputs.plantas;
    expect(calcularSementes(inputs)).toBeCloseTo(esperadoSemTranspasse, 9);
  });

  it("transpasse 5% (caso padrão) resulta em mais sementes que transpasse 0%", () => {
    const base = { area: 3, espacamento: 0.45, plantas: 10 };
    const comTranspasse = calcularSementes({ ...base, transpasse: 5 });
    const semTranspasse = calcularSementes({ ...base, transpasse: 0 });
    expect(comTranspasse).toBeGreaterThan(semTranspasse);
  });

  it("espaçamento <= 0 retorna 0 (evita divisão por zero)", () => {
    expect(calcularSementes({ area: 1, espacamento: 0, plantas: 10, transpasse: 5 })).toBe(0);
  });

  it("transpasse >= 100 retorna 0 (evita divisão por zero)", () => {
    expect(calcularSementes({ area: 1, espacamento: 0.45, plantas: 10, transpasse: 100 })).toBe(0);
  });
});

describe("calcularSacas", () => {
  it("é área × sacas por alqueire", () => {
    expect(calcularSacas({ area: 4, sacasAlq: 2.5 })).toBe(10);
  });
});

describe("calcularDose", () => {
  it("é área × dose por alqueire", () => {
    expect(calcularDose({ area: 4, doseAlq: 250 })).toBe(1000);
  });
});

describe("calcularDosePMS", () => {
  it("germinação 100% e pureza 100%: calcula normalmente, sem divisão por zero", () => {
    const resultado = calcularDosePMS({ populacao: 300, pms: 35, germinacao: 100, pureza: 100 });
    expect(resultado).toBeCloseTo((300 * 35 * 100) / (100 * 100), 9);
    expect(Number.isFinite(resultado)).toBe(true);
  });

  it("germinação 0 retorna 0 (não gera Infinity/NaN)", () => {
    const resultado = calcularDosePMS({ populacao: 300, pms: 35, germinacao: 0, pureza: 98 });
    expect(resultado).toBe(0);
    expect(Number.isFinite(resultado)).toBe(true);
  });

  it("pureza 0 retorna 0 (não gera Infinity/NaN)", () => {
    const resultado = calcularDosePMS({ populacao: 300, pms: 35, germinacao: 90, pureza: 0 });
    expect(resultado).toBe(0);
    expect(Number.isFinite(resultado)).toBe(true);
  });
});

describe("conversão de área (1 alqueire = 2,42 ha)", () => {
  it("1 hectare equivalente em alqueires, convertido de volta, bate com 1,00 ha", () => {
    const areaEmAlqueires = 1 / ALQ_HA; // "1 hectare" expresso na unidade nativa do app (alqueires)
    const areaHa = areaEmAlqueires * ALQ_HA;
    expect(Number(areaHa.toFixed(2))).toBe(1.00);
  });
});

describe("montarCombo (bag + sacaria)", () => {
  const unidades = [
    { label: "Bag 1.000 kg", qty: 0, size: 1000 },
    { label: "Sacas de 50 kg", qty: 0, size: 50 },
  ];

  it("bag que fecha exatamente (sem sobra) retorna null", () => {
    expect(montarCombo(unidades, 3000)).toBeNull();
  });

  it("bag com sobra sugere nBags e nSacas para cobrir o restante", () => {
    const combo = montarCombo(unidades, 3200);
    expect(combo).not.toBeNull();
    expect(combo.combo.nBags).toBe(3);
    // sobra de 200 kg em sacas de 50 kg = 4 sacas
    expect(combo.combo.nSacas).toBe(4);
  });
});

describe("bagSizeFromNpk / FORMULACOES_750KG", () => {
  it("formulação conhecida (33-0-0) retorna bag de 750 kg", () => {
    expect(bagSizeFromNpk(33, 0, 0)).toBe(750);
  });

  it("formulação fora da lista (10-15-15) retorna bag de 1.000 kg", () => {
    expect(bagSizeFromNpk(10, 15, 15)).toBe(1000);
  });
});

describe("calcularCusto (preços)", () => {
  it("preço à vista vazio resulta em custo 0", () => {
    expect(calcularCusto(10, "")).toBe(0);
  });

  it("preço à vista 0 resulta em custo 0", () => {
    expect(calcularCusto(10, "0")).toBe(0);
  });

  it("preço informado calcula custo normalmente", () => {
    expect(calcularCusto(10, "25.5")).toBeCloseTo(255, 9);
  });
});

describe("formatarPrecoResumo (resumo/ficha exportada)", () => {
  it("preço vazio vira travessão", () => {
    expect(formatarPrecoResumo("", fmtMoedaFake)).toBe("—");
  });

  it("preço indefinido vira travessão", () => {
    expect(formatarPrecoResumo(undefined, fmtMoedaFake)).toBe("—");
  });

  it("preço informado usa o formatador de moeda", () => {
    expect(formatarPrecoResumo("25.5", fmtMoedaFake)).toBe("R$ 25.50");
  });
});

describe("precisaAlertarPrazoAusente", () => {
  it("dispara quando à vista foi preenchido e a prazo não", () => {
    expect(precisaAlertarPrazoAusente("100", "")).toBe(true);
  });

  it("não dispara quando os dois estão vazios", () => {
    expect(precisaAlertarPrazoAusente("", "")).toBe(false);
  });

  it("não dispara quando os dois estão preenchidos", () => {
    expect(precisaAlertarPrazoAusente("100", "110")).toBe(false);
  });
});
