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
  alqParaHa,
  haParaAlq,
  normalizarAreaParaAlqueires,
  converterKMgParaCmolc,
  calcularIndicesSolo,
  calcularCalagem,
  determinarTipoCalcario,
  verificarNecessidadeGessagem,
  calcularGessagem,
  nutrientesGesso,
  calcularConcentracaoTotalNutrientes,
  calcularCustoPorKgNutriente,
  identificarMelhorCustoBeneficio,
  calcularEquivalenciaAdubo,
  montarVeredicto,
  calcularNecessidadeNutrientes,
  pontuarFormulacao,
  encontrarFormulacaoMaisProxima,
  montarTextoWhatsApp,
  montarTextoWhatsAppRegulagem,
  montarTextoWhatsAppCalagem,
} from "../js/calculos.js";

// formatadores simples só pra isolar as funções puras da formatação real de moeda/locale
const fmtMoedaFake = (n) => `R$ ${n.toFixed(2)}`;
const fmtDecFake = (n) => n.toFixed(2);

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

describe("alqParaHa / haParaAlq (conversão de área)", () => {
  it("1 alqueire = 2,42 ha", () => {
    expect(alqParaHa(1)).toBeCloseTo(2.42, 9);
  });

  it("1 ha ≈ 0,4132 alqueires", () => {
    expect(haParaAlq(1)).toBeCloseTo(0.4132, 4);
  });

  it("conversão bidirecional (alq -> ha -> alq) devolve o valor original, mesmo com decimais", () => {
    const original = 7.35;
    expect(haParaAlq(alqParaHa(original))).toBeCloseTo(original, 9);
  });

  it("conversão bidirecional (ha -> alq -> ha) devolve o valor original, mesmo com decimais", () => {
    const original = 18.7;
    expect(alqParaHa(haParaAlq(original))).toBeCloseTo(original, 9);
  });

  it("zero permanece zero nas duas direções", () => {
    expect(alqParaHa(0)).toBe(0);
    expect(haParaAlq(0)).toBe(0);
  });
});

describe("normalizarAreaParaAlqueires (entrada do usuário em alqueire ou hectare)", () => {
  it("unidade 'alq' devolve o valor como está", () => {
    expect(normalizarAreaParaAlqueires(10, "alq")).toBe(10);
  });

  it("unidade 'ha' converte para alqueires dividindo por 2,42", () => {
    expect(normalizarAreaParaAlqueires(24.2, "ha")).toBeCloseTo(10, 9);
  });

  it("valor vazio/inválido normaliza para 0 em qualquer unidade", () => {
    expect(normalizarAreaParaAlqueires("", "alq")).toBe(0);
    expect(normalizarAreaParaAlqueires("", "ha")).toBe(0);
    expect(normalizarAreaParaAlqueires(NaN, "ha")).toBe(0);
  });

  it("10 alqueires e o equivalente em hectares (24,2 ha) normalizam para a mesma área", () => {
    const emAlqueires = normalizarAreaParaAlqueires(10, "alq");
    const emHectares = normalizarAreaParaAlqueires(24.2, "ha");
    expect(emHectares).toBeCloseTo(emAlqueires, 9);
  });
});

describe("cálculos alimentados por área em alqueire ou hectare não divergem", () => {
  it("calcularSementes: 10 alqueires e seu equivalente em ha dão o mesmo resultado", () => {
    const base = { plantas: 10, espacamento: 0.45, transpasse: 5 };
    const areaAlq = normalizarAreaParaAlqueires(10, "alq");
    const areaHa = normalizarAreaParaAlqueires(24.2, "ha");
    expect(calcularSementes({ ...base, area: areaHa })).toBeCloseTo(calcularSementes({ ...base, area: areaAlq }), 6);
  });

  it("calcularSacas: 4 alqueires e seu equivalente em ha (9,68 ha) dão o mesmo resultado", () => {
    const areaAlq = normalizarAreaParaAlqueires(4, "alq");
    const areaHa = normalizarAreaParaAlqueires(4 * ALQ_HA, "ha");
    expect(calcularSacas({ area: areaHa, sacasAlq: 2.5 })).toBeCloseTo(calcularSacas({ area: areaAlq, sacasAlq: 2.5 }), 9);
  });

  it("calcularDose: área digitada em hectare bate com a mesma área digitada em alqueire", () => {
    const areaAlq = normalizarAreaParaAlqueires(7.35, "alq");
    const areaHa = normalizarAreaParaAlqueires(alqParaHa(7.35), "ha");
    expect(calcularDose({ area: areaHa, doseAlq: 250 })).toBeCloseTo(calcularDose({ area: areaAlq, doseAlq: 250 }), 9);
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

describe("converterKMgParaCmolc", () => {
  it("391 mg/dm³ equivalem a 1 cmolc/dm³", () => {
    expect(converterKMgParaCmolc(391)).toBeCloseTo(1, 9);
  });

  it("0 mg/dm³ ou valor inválido resulta em 0", () => {
    expect(converterKMgParaCmolc(0)).toBe(0);
    expect(converterKMgParaCmolc(undefined)).toBe(0);
  });
});

describe("calcularIndicesSolo", () => {
  it("SB, CTC efetiva, CTC a pH 7,0, V% e m% batem com a fórmula recalculada", () => {
    const entrada = { ca: 4, mg: 1.5, k: 0.3, al: 0.2, hAl: 3 };
    const r = calcularIndicesSolo(entrada);
    const sbEsperado = entrada.ca + entrada.mg + entrada.k;
    expect(r.sb).toBeCloseTo(sbEsperado, 9);
    expect(r.ctcEfetiva).toBeCloseTo(sbEsperado + entrada.al, 9);
    expect(r.ctcPh7).toBeCloseTo(sbEsperado + entrada.hAl, 9);
    expect(r.v).toBeCloseTo((sbEsperado / (sbEsperado + entrada.hAl)) * 100, 9);
    expect(r.m).toBeCloseTo((entrada.al / (sbEsperado + entrada.al)) * 100, 9);
  });

  it("relações catiônicas Ca/Mg, Ca/K e Mg/K batem com a divisão direta", () => {
    const r = calcularIndicesSolo({ ca: 4, mg: 2, k: 0.4, al: 0, hAl: 3 });
    expect(r.caMg).toBeCloseTo(2, 9);
    expect(r.caK).toBeCloseTo(10, 9);
    expect(r.mgK).toBeCloseTo(5, 9);
  });

  it("% de ocupação de Ca, Mg e K na CTC a pH 7,0 soma até a saturação por bases (V%)", () => {
    const r = calcularIndicesSolo({ ca: 4, mg: 1.5, k: 0.3, al: 0.2, hAl: 3 });
    expect(r.pctCa + r.pctMg + r.pctK).toBeCloseTo(r.v, 9);
  });

  it("K informado em mg/dm³ (kUnidade: 'mgdm3') é convertido antes de entrar na SB", () => {
    const emCmolc = calcularIndicesSolo({ ca: 4, mg: 1.5, k: 0.3, al: 0.2, hAl: 3 });
    const emMgDm3 = calcularIndicesSolo({ ca: 4, mg: 1.5, k: 0.3 * 391, al: 0.2, hAl: 3, kUnidade: "mgdm3" });
    expect(emMgDm3.sb).toBeCloseTo(emCmolc.sb, 6);
    expect(emMgDm3.v).toBeCloseTo(emCmolc.v, 6);
  });

  it("CTC a pH 7,0 igual a zero não gera Infinity/NaN em V% nem nas relações", () => {
    const r = calcularIndicesSolo({ ca: 0, mg: 0, k: 0, al: 0, hAl: 0 });
    expect(r.v).toBe(0);
    expect(r.m).toBe(0);
    expect(r.caMg).toBe(0);
    expect(Number.isFinite(r.v)).toBe(true);
  });
});

describe("calcularCalagem (necessidade de calagem, método V%)", () => {
  it("bate com a fórmula oficial: NCbase = (V2 - V1) × T ÷ PRNT", () => {
    const entrada = { v1: 40, v2: 65, t: 8, prnt: 80, profundidade: 20, areaAplicadaPct: 100 };
    const esperado = ((entrada.v2 - entrada.v1) * entrada.t) / entrada.prnt;
    const r = calcularCalagem(entrada);
    expect(r.ncBase).toBeCloseTo(esperado, 9);
    expect(r.ncAplicar).toBeCloseTo(esperado, 9); // profundidade 20/20 e área 100% não alteram a dose base
  });

  it("plantio direto (profundidade 10 cm) aplica metade da dose calculada para 20 cm", () => {
    const base = { v1: 40, v2: 65, t: 8, prnt: 80 };
    const convencional = calcularCalagem({ ...base, profundidade: 20, areaAplicadaPct: 100 });
    const plantioDireto = calcularCalagem({ ...base, profundidade: 10, areaAplicadaPct: 100 });
    expect(plantioDireto.ncAplicar).toBeCloseTo(convencional.ncAplicar / 2, 9);
  });

  it("área aplicada parcial (ex.: 50% na linha) reduz a dose proporcionalmente", () => {
    const base = { v1: 40, v2: 65, t: 8, prnt: 80, profundidade: 20 };
    const integral = calcularCalagem({ ...base, areaAplicadaPct: 100 });
    const parcial = calcularCalagem({ ...base, areaAplicadaPct: 50 });
    expect(parcial.ncAplicar).toBeCloseTo(integral.ncAplicar / 2, 9);
  });

  it("V1 >= V2 (saturação já no alvo ou acima): não precisa de calagem, retorna 0", () => {
    expect(calcularCalagem({ v1: 65, v2: 65, t: 8, prnt: 80 })).toEqual({ ncBase: 0, ncAplicar: 0, alertaParcelamento: false });
    expect(calcularCalagem({ v1: 70, v2: 65, t: 8, prnt: 80 })).toEqual({ ncBase: 0, ncAplicar: 0, alertaParcelamento: false });
  });

  it("dose acima de 2,5 t/ha sinaliza alerta de parcelamento", () => {
    const r = calcularCalagem({ v1: 10, v2: 65, t: 15, prnt: 70, profundidade: 20, areaAplicadaPct: 100 });
    expect(r.ncAplicar).toBeGreaterThan(2.5);
    expect(r.alertaParcelamento).toBe(true);
  });

  it("dose de 2,5 t/ha ou menos não sinaliza alerta de parcelamento", () => {
    const r = calcularCalagem({ v1: 55, v2: 65, t: 8, prnt: 80, profundidade: 20, areaAplicadaPct: 100 });
    expect(r.ncAplicar).toBeLessThanOrEqual(2.5);
    expect(r.alertaParcelamento).toBe(false);
  });

  it("T ou PRNT zerados não geram Infinity/NaN", () => {
    expect(calcularCalagem({ v1: 40, v2: 65, t: 0, prnt: 80 }).ncAplicar).toBe(0);
    expect(calcularCalagem({ v1: 40, v2: 65, t: 8, prnt: 0 }).ncAplicar).toBe(0);
  });
});

describe("determinarTipoCalcario", () => {
  it("Mg abaixo de 0,8 cmolc/dm³ recomenda Dolomítico", () => {
    expect(determinarTipoCalcario({ mg: 0.5, caMg: 3 }).tipo).toBe("Dolomítico");
  });

  it("relação Ca/Mg acima de 4,0 recomenda Dolomítico, mesmo com Mg dentro da faixa", () => {
    expect(determinarTipoCalcario({ mg: 1.0, caMg: 4.5 }).tipo).toBe("Dolomítico");
  });

  it("miolo (Mg entre 0,8 e 1,5, Ca/Mg entre 2,0 e 4,0) com Mg até 1,15 recomenda Dolomítico", () => {
    expect(determinarTipoCalcario({ mg: 1.0, caMg: 3.0 }).tipo).toBe("Dolomítico");
    expect(determinarTipoCalcario({ mg: 1.15, caMg: 3.0 }).tipo).toBe("Dolomítico");
  });

  it("miolo (Mg entre 0,8 e 1,5, Ca/Mg entre 2,0 e 4,0) com Mg acima de 1,15 recomenda Calcítico", () => {
    expect(determinarTipoCalcario({ mg: 1.2, caMg: 3.0 }).tipo).toBe("Calcítico");
  });

  it("Mg acima de 1,5 cmolc/dm³ recomenda Calcítico", () => {
    expect(determinarTipoCalcario({ mg: 2.0, caMg: 3.0 }).tipo).toBe("Calcítico");
  });

  it("relação Ca/Mg abaixo de 2,0 recomenda Calcítico, mesmo com Mg dentro da faixa", () => {
    expect(determinarTipoCalcario({ mg: 1.0, caMg: 1.5 }).tipo).toBe("Calcítico");
  });
});

describe("verificarNecessidadeGessagem (subsolo 20-40 cm)", () => {
  it("nenhum dos 4 critérios disparado: gessagem não necessária", () => {
    const r = verificarNecessidadeGessagem({ al: 0.1, m: 10, ca: 2.5, v: 50 });
    expect(r.necessaria).toBe(false);
    expect(r.motivos).toHaveLength(0);
  });

  it("Al³⁺ acima de 0,3 cmolc/dm³ dispara sozinho", () => {
    expect(verificarNecessidadeGessagem({ al: 0.4, m: 10, ca: 2.5, v: 50 }).necessaria).toBe(true);
  });

  it("saturação por alumínio (m%) acima de 20% dispara sozinha", () => {
    expect(verificarNecessidadeGessagem({ al: 0.1, m: 25, ca: 2.5, v: 50 }).necessaria).toBe(true);
  });

  it("Ca²⁺ abaixo de 1,5 cmolc/dm³ dispara sozinho", () => {
    expect(verificarNecessidadeGessagem({ al: 0.1, m: 10, ca: 1.0, v: 50 }).necessaria).toBe(true);
  });

  it("saturação por bases (V%) abaixo de 35% dispara sozinha", () => {
    expect(verificarNecessidadeGessagem({ al: 0.1, m: 10, ca: 2.5, v: 30 }).necessaria).toBe(true);
  });

  it("todos os 4 critérios disparados listam os 4 motivos", () => {
    const r = verificarNecessidadeGessagem({ al: 0.5, m: 30, ca: 1.0, v: 20 });
    expect(r.motivos).toHaveLength(4);
  });
});

describe("calcularGessagem", () => {
  it("método 'argila' (padrão): NG (kg/ha) = 50 × argila%", () => {
    const r = calcularGessagem({ argila: 40, metodo: "argila", area: 10 });
    expect(r.doseKgHa).toBeCloseTo(2000, 9);
    expect(r.doseTHa).toBeCloseTo(2, 9);
    expect(r.totalTArea).toBeCloseTo(20, 9); // 2 t/ha × 10 ha
  });

  it("método 'saturacaoCa': NG (kg/ha) = [0,6 × Tsubsolo − Ca subsolo] × 640", () => {
    const r = calcularGessagem({ metodo: "saturacaoCa", tSub: 6, caSub: 1.5, area: 10 });
    const esperadoKgHa = (0.6 * 6 - 1.5) * 640;
    expect(r.doseKgHa).toBeCloseTo(esperadoKgHa, 9);
    expect(r.totalTArea).toBeCloseTo((esperadoKgHa / 1000) * 10, 9);
  });

  it("método 'saturacaoCa' com Ca subsolo já suficiente não retorna dose negativa", () => {
    const r = calcularGessagem({ metodo: "saturacaoCa", tSub: 4, caSub: 5, area: 10 });
    expect(r.doseKgHa).toBe(0);
    expect(r.totalTArea).toBe(0);
  });

  it("área zero resulta em total zero, mas a dose por hectare continua calculada", () => {
    const r = calcularGessagem({ argila: 40, metodo: "argila", area: 0 });
    expect(r.doseKgHa).toBeCloseTo(2000, 9);
    expect(r.totalTArea).toBe(0);
  });
});

describe("nutrientesGesso", () => {
  it("enxofre ≈ 15% e cálcio ≈ 18% da dose de gesso aplicada", () => {
    const r = nutrientesGesso(2000);
    expect(r.enxofreKgHa).toBeCloseTo(300, 9);
    expect(r.calcioKgHa).toBeCloseTo(360, 9);
  });

  it("dose zero ou inválida resulta em nutrientes zerados", () => {
    expect(nutrientesGesso(0)).toEqual({ enxofreKgHa: 0, calcioKgHa: 0 });
    expect(nutrientesGesso(undefined)).toEqual({ enxofreKgHa: 0, calcioKgHa: 0 });
  });
});

describe("calcularConcentracaoTotalNutrientes", () => {
  it("soma N + P2O5 + K2O das formulações comerciais mais comuns", () => {
    expect(calcularConcentracaoTotalNutrientes(45, 0, 0)).toBe(45); // Ureia 45-00-00
    expect(calcularConcentracaoTotalNutrientes(0, 0, 60)).toBe(60); // KCl 00-00-60
    expect(calcularConcentracaoTotalNutrientes(11, 52, 0)).toBe(63); // MAP 11-52-00
    expect(calcularConcentracaoTotalNutrientes(4, 14, 8)).toBe(26); // 04-14-08
    expect(calcularConcentracaoTotalNutrientes(10, 15, 15)).toBe(40); // 10-15-15
  });

  it("entradas ausentes/inválidas contam como zero", () => {
    expect(calcularConcentracaoTotalNutrientes(undefined, null, "")).toBe(0);
    expect(calcularConcentracaoTotalNutrientes(10, undefined, 5)).toBe(15);
  });
});

describe("calcularCustoPorKgNutriente", () => {
  it("Ureia 45-00-00: saca de 50kg a R$ 150,00", () => {
    const r = calcularCustoPorKgNutriente({ preco: 150, tamanhoEmbalagemKg: 50, npkN: 45, npkP: 0, npkK: 0 });
    expect(r).toBeCloseTo(150 / (50 * 0.45), 9); // R$ 6,6667/kg de N
  });

  it("KCl 00-00-60: saca de 50kg a R$ 180,00", () => {
    const r = calcularCustoPorKgNutriente({ preco: 180, tamanhoEmbalagemKg: 50, npkN: 0, npkP: 0, npkK: 60 });
    expect(r).toBeCloseTo(180 / (50 * 0.6), 9); // R$ 6,00/kg de K2O
  });

  it("MAP 11-52-00: saca de 50kg a R$ 220,00", () => {
    const r = calcularCustoPorKgNutriente({ preco: 220, tamanhoEmbalagemKg: 50, npkN: 11, npkP: 52, npkK: 0 });
    expect(r).toBeCloseTo(220 / (50 * 0.63), 9);
  });

  it("formulação mista 04-14-08: saca de 50kg a R$ 100,00", () => {
    const r = calcularCustoPorKgNutriente({ preco: 100, tamanhoEmbalagemKg: 50, npkN: 4, npkP: 14, npkK: 8 });
    expect(r).toBeCloseTo(100 / (50 * 0.26), 9);
  });

  it("formulação mista 10-15-15: saca de 50kg a R$ 160,00 — mais cara por kg de nutriente que a 04-14-08 acima", () => {
    const r = calcularCustoPorKgNutriente({ preco: 160, tamanhoEmbalagemKg: 50, npkN: 10, npkP: 15, npkK: 15 });
    expect(r).toBeCloseTo(160 / (50 * 0.4), 9);
    expect(r).toBeGreaterThan(100 / (50 * 0.26));
  });

  it("preço por kg do produto (embalagem de 1kg) equivale à mesma fórmula", () => {
    const porSaca = calcularCustoPorKgNutriente({ preco: 150, tamanhoEmbalagemKg: 50, npkN: 45, npkP: 0, npkK: 0 });
    const porKg = calcularCustoPorKgNutriente({ preco: 3, tamanhoEmbalagemKg: 1, npkN: 45, npkP: 0, npkK: 0 }); // R$3/kg = R$150/saca 50kg
    expect(porKg).toBeCloseTo(porSaca, 9);
  });

  it("NPK somando zero (formulação sem nutrientes reconhecidos) retorna 0", () => {
    expect(calcularCustoPorKgNutriente({ preco: 100, tamanhoEmbalagemKg: 50, npkN: 0, npkP: 0, npkK: 0 })).toBe(0);
  });

  it("preço zero ou ausente retorna 0", () => {
    expect(calcularCustoPorKgNutriente({ preco: 0, tamanhoEmbalagemKg: 50, npkN: 45, npkP: 0, npkK: 0 })).toBe(0);
    expect(calcularCustoPorKgNutriente({ tamanhoEmbalagemKg: 50, npkN: 45, npkP: 0, npkK: 0 })).toBe(0);
  });

  it("tamanho de embalagem zero ou ausente retorna 0", () => {
    expect(calcularCustoPorKgNutriente({ preco: 150, tamanhoEmbalagemKg: 0, npkN: 45, npkP: 0, npkK: 0 })).toBe(0);
    expect(calcularCustoPorKgNutriente({ preco: 150, npkN: 45, npkP: 0, npkK: 0 })).toBe(0);
  });

  it("sem argumentos não lança erro e retorna 0", () => {
    expect(calcularCustoPorKgNutriente()).toBe(0);
  });
});

describe("identificarMelhorCustoBeneficio", () => {
  it("identifica a linha de menor R$/kg de nutriente entre formulações concorrentes", () => {
    const linhas = [
      { i: 0, custoPorKgNutriente: 100 / (50 * 0.26) }, // 04-14-08, ~R$ 7,69/kg
      { i: 1, custoPorKgNutriente: 160 / (50 * 0.4) },  // 10-15-15, R$ 8,00/kg
      { i: 2, custoPorKgNutriente: 150 / (50 * 0.45) }, // Ureia, ~R$ 6,67/kg — vence
    ];
    const melhor = identificarMelhorCustoBeneficio(linhas);
    expect(melhor.i).toBe(2);
  });

  it("ignora linhas zeradas (sem preço ou sem NPK reconhecido)", () => {
    const linhas = [
      { i: 0, custoPorKgNutriente: 0 },
      { i: 1, custoPorKgNutriente: 9.5 },
      { i: 2, custoPorKgNutriente: 0 },
    ];
    expect(identificarMelhorCustoBeneficio(linhas).i).toBe(1);
  });

  it("lista vazia ou só com linhas zeradas retorna null", () => {
    expect(identificarMelhorCustoBeneficio([])).toBeNull();
    expect(identificarMelhorCustoBeneficio([{ i: 0, custoPorKgNutriente: 0 }])).toBeNull();
    expect(identificarMelhorCustoBeneficio(undefined)).toBeNull();
  });
});

describe("calcularEquivalenciaAdubo", () => {
  it("critério padrão (P₂O₅): calcula a dose que entrega a mesma quantidade de P₂O₅ da base", () => {
    // base: 04-14-08 a 250 kg/ha entrega 250 × 14% = 35 kg/ha de P₂O₅
    const r = calcularEquivalenciaAdubo({ baseDoseHa: 250, baseNpk: [4, 14, 8], compNpk: [10, 15, 15], criterio: "p" });
    expect(r.baseNutrientePct).toBe(14);
    expect(r.compNutrientePct).toBe(15);
    expect(r.doseHa).toBeCloseTo(250 * (14 / 15), 6); // ≈ 233,33 kg/ha
  });

  it("critério NPK Total: soma os três nutrientes de cada formulação", () => {
    // base: 04-14-08 (26% NPK) a 250 kg/ha × Ureia 45-00-00 (45% NPK)
    const r = calcularEquivalenciaAdubo({ baseDoseHa: 250, baseNpk: [4, 14, 8], compNpk: [45, 0, 0], criterio: "npk" });
    expect(r.baseNutrientePct).toBe(26);
    expect(r.compNutrientePct).toBe(45);
    expect(r.doseHa).toBeCloseTo(250 * (26 / 45), 6);
  });

  it("critério K₂O: usa só o terceiro número da formulação", () => {
    // base: 04-14-08 (8% K₂O) a 250 kg/ha × KCl 00-00-60 (60% K₂O)
    const r = calcularEquivalenciaAdubo({ baseDoseHa: 250, baseNpk: [4, 14, 8], compNpk: [0, 0, 60], criterio: "k" });
    expect(r.baseNutrientePct).toBe(8);
    expect(r.compNutrientePct).toBe(60);
    expect(r.doseHa).toBeCloseTo(250 * (8 / 60), 6);
  });

  it("formulação comparada sem o nutriente do critério: doseHa fica null (equivalência impossível)", () => {
    // Ureia 45-00-00 não tem P₂O₅ — não dá pra bater a mesma dose de P₂O₅ com ela
    const r = calcularEquivalenciaAdubo({ baseDoseHa: 250, baseNpk: [4, 14, 8], compNpk: [45, 0, 0], criterio: "p" });
    expect(r.doseHa).toBeNull();
    expect(r.compNutrientePct).toBe(0);
  });

  it("formulação base sem o nutriente do critério: doseHa fica null pra qualquer comparada", () => {
    const r = calcularEquivalenciaAdubo({ baseDoseHa: 250, baseNpk: [45, 0, 0], compNpk: [4, 14, 8], criterio: "p" });
    expect(r.baseNutrientePct).toBe(0);
    expect(r.doseHa).toBeNull();
  });

  it("dose base zerada ou não informada: doseHa é 0 (não null) quando os nutrientes existem nos dois lados", () => {
    const r = calcularEquivalenciaAdubo({ baseDoseHa: 0, baseNpk: [4, 14, 8], compNpk: [10, 15, 15], criterio: "p" });
    expect(r.doseHa).toBe(0);
  });

  it("critério ausente/desconhecido usa P₂O₅ como padrão", () => {
    const semCriterio = calcularEquivalenciaAdubo({ baseDoseHa: 100, baseNpk: [4, 14, 8], compNpk: [10, 15, 15] });
    const comP = calcularEquivalenciaAdubo({ baseDoseHa: 100, baseNpk: [4, 14, 8], compNpk: [10, 15, 15], criterio: "p" });
    expect(semCriterio.doseHa).toBeCloseTo(comP.doseHa, 6);
  });
});

describe("montarVeredicto", () => {
  it("economiza mesmo com saca mais cara: usa o prefixo 'Mesmo a saca...tendo valor unitário maior'", () => {
    const texto = montarVeredicto({
      custoAlqBase: 900, custoAlqComp: 823.5,
      custoTotalBase: 21780, custoTotalComp: 19928.7,
      precoSacaBase: 50, precoSacaComp: 61, areaAlq: 24.2,
    }, fmtMoedaFake, fmtDecFake);
    expect(texto).toBe(
      "Mesmo a saca do adubo proposto tendo valor unitário maior, o custo final da lavoura é R$ 76.50 mais barato por alqueire (economia total de R$ 1851.30 na área de 24.20 alqueires)."
    );
  });

  it("economiza com saca também mais barata: sem o prefixo, começa direto com 'O custo final'", () => {
    const texto = montarVeredicto({
      custoAlqBase: 900, custoAlqComp: 607.5,
      custoTotalBase: 21780, custoTotalComp: 14701.5,
      precoSacaBase: 50, precoSacaComp: 45, areaAlq: 24.2,
    }, fmtMoedaFake, fmtDecFake);
    expect(texto.startsWith("O custo final da lavoura é R$ 292.50 mais barato por alqueire")).toBe(true);
    expect(texto).not.toContain("Mesmo a saca");
  });

  it("adubo proposto sai mais caro no total: frase de alerta, sem mencionar 'mais barato'", () => {
    const texto = montarVeredicto({
      custoAlqBase: 900, custoAlqComp: 945,
      custoTotalBase: 21780, custoTotalComp: 22869,
      precoSacaBase: 50, precoSacaComp: 70, areaAlq: 24.2,
    }, fmtMoedaFake, fmtDecFake);
    expect(texto).toBe(
      "O adubo proposto sai R$ 45.00 mais caro por alqueire (R$ 1089.00 a mais na área de 24.20 alqueires), mesmo entregando menos sacas por alqueire."
    );
  });

  it("sem área informada: omite o total e orienta a informar a área", () => {
    const texto = montarVeredicto({
      custoAlqBase: 900, custoAlqComp: 823.5,
      custoTotalBase: 0, custoTotalComp: 0,
      precoSacaBase: 50, precoSacaComp: 61, areaAlq: 0,
    }, fmtMoedaFake, fmtDecFake);
    expect(texto).toContain("— informe a área da lavoura acima para ver a economia total.");
    expect(texto).not.toContain("na área de");
  });

  it("custo praticamente igual (dentro da tolerância): mensagem neutra", () => {
    const texto = montarVeredicto({
      custoAlqBase: 900, custoAlqComp: 900.001,
      custoTotalBase: 21780, custoTotalComp: 21780.02,
      precoSacaBase: 50, precoSacaComp: 50.0001, areaAlq: 24.2,
    }, fmtMoedaFake, fmtDecFake);
    expect(texto).toBe("Custo final praticamente equivalente entre as duas opções.");
  });
});

describe("montarTextoWhatsApp", () => {
  const resumoSoja = {
    ref: "20260101-0001", data: "01/01/2026", horaGeracao: "10:00",
    cliente: "João da Silva", cultura: "Soja", cultivar: "BRS 404", area: "10,00 alq (24,20 ha)",
    params: [["Plantas por metro", "10"], ["Espaçamento", "0,45 m"], ["Transpasse", "5%"]],
    total: "1.234.567", unidade: "sementes",
    combo: "", nutrientes: [],
    linhas: [
      { nome: "Embalagem 125.000", qtd: "10 un.  (exato 9,88)", precoVista: "R$ 450,00", precoPrazo: "R$ 470,00", vista: "R$ 4.500,00", prazo: "R$ 4.700,00" },
    ],
    vencimento: "15/06/2026",
  };

  it("inclui cabeçalho, ref/data/hora e identificação do produtor", () => {
    const texto = montarTextoWhatsApp(resumoSoja);
    expect(texto).toContain("🌱 *COASUL AGRO — COTAÇÃO TÉCNICA*");
    expect(texto).toContain("Ref: #20260101-0001 · 01/01/2026 às 10:00");
    expect(texto).toContain("👤 *Produtor:* João da Silva");
    expect(texto).toContain("🌾 *Cultura:* Soja (BRS 404)");
    expect(texto).toContain("📐 *Área:* 10,00 alq (24,20 ha)");
  });

  it("cliente ausente cai no texto padrão 'Não informado'", () => {
    const texto = montarTextoWhatsApp({ ...resumoSoja, cliente: "" });
    expect(texto).toContain("👤 *Produtor:* Não informado");
  });

  it("lista os parâmetros com marcador", () => {
    const texto = montarTextoWhatsApp(resumoSoja);
    expect(texto).toContain("⚙️ *Parâmetros:*");
    expect(texto).toContain("• Plantas por metro: 10");
    expect(texto).toContain("• Espaçamento: 0,45 m");
  });

  it("necessidade total em negrito, com combo quando houver", () => {
    const texto = montarTextoWhatsApp(resumoSoja);
    expect(texto).toContain("📦 *NECESSIDADE TOTAL:*");
    expect(texto).toContain("*1.234.567 sementes*");
    expect(texto).not.toContain("↳ Combinado:");

    const comCombo = montarTextoWhatsApp({ ...resumoSoja, combo: "2 × Bag 1.000kg + 13 × Sacas 40kg" });
    expect(comCombo).toContain("↳ Combinado: 2 × Bag 1.000kg + 13 × Sacas 40kg");
  });

  it("investimento estimado: embalagem, preço à vista e total em negrito, com linha 'a prazo' quando houver preço a prazo", () => {
    const texto = montarTextoWhatsApp(resumoSoja);
    expect(texto).toContain("💰 *INVESTIMENTO ESTIMADO:*");
    expect(texto).toContain("• Embalagem 125.000: 10 un.  (exato 9,88) × R$ 450,00 = *R$ 4.500,00*");
    expect(texto).toContain("↳ A prazo (15/06/2026): R$ 4.700,00");
  });

  it("sem preço à vista informado, mostra 'Sob consulta' em vez de R$ 0,00", () => {
    const resumo = { ...resumoSoja, linhas: [{ nome: "Embalagem 125.000", qtd: "0 un.", precoVista: "—", precoPrazo: "—", vista: "R$ 0,00", prazo: "R$ 0,00" }] };
    const texto = montarTextoWhatsApp(resumo);
    expect(texto).toContain("× Sob consulta = *Sob consulta*");
    expect(texto).not.toContain("↳ A prazo");
  });

  it("Adubação/Ureia: inclui bloco de nutrientes no solo quando presente", () => {
    const resumoAdubacao = {
      ...resumoSoja, cultura: "Adubação/Ureia", cultivar: "",
      nutrientes: [
        { nome: "N (45%)", valor: "12,34 kg / alqueire", porAlq: "298,68 kg total na área" },
        { nome: "P₂O₅ (0%)", valor: "0,00 kg / alqueire", porAlq: "0,00 kg total na área" },
      ],
    };
    const texto = montarTextoWhatsApp(resumoAdubacao);
    expect(texto).toContain("🧪 *Nutrientes no Solo (Total):*");
    expect(texto).toContain("• N (45%): 12,34 kg / alqueire (298,68 kg total na área)");
    expect(texto).toContain("🌾 *Cultura:* Adubação/Ureia");
    expect(texto).not.toContain("Adubação/Ureia ()");
  });

  it("sem comparador de formulações, não inclui o bloco (Sementes & Adubação sem essa ferramenta)", () => {
    const texto = montarTextoWhatsApp(resumoSoja);
    expect(texto).not.toContain("COMPARADOR DE FORMULAÇÕES");
  });

  it("Adubação/Ureia, modo Equivalência por Sacas: inclui a base, os nutrientes N/P/K, a logística e o veredito de cada linha", () => {
    const resumoEquivalencia = {
      ...resumoSoja, cultura: "Adubação/Ureia", cultivar: "",
      comparador: {
        modo: "Equivalência de Formulações por Sacas (Custo Real do Produtor)",
        isEquivalencia: true,
        base: {
          npk: "10-15-15", sacasAlq: "18,0 sc/alq", doseAlq: "900,00 kg/alq",
          custoAlq: "R$ 900,00", custoTotal: "R$ 21.780,00", criterio: "P₂O₅",
          nutrientes: { n: "0,00 kg", p: "135,00 kg", k: "135,00 kg" },
        },
        linhas: [
          {
            npk: "08-20-15", somaNpk: "43", custoTotal: "R$ 19.965,00", dose: "279,34 kg/ha",
            sacasAlq: "13,5 sc/alq", doseAlq: "675,00 kg/alq", custoAlq: "R$ 825,00",
            nutrientes: { n: "54,00 kg", p: "135,00 kg", k: "101,25 kg" },
            logisticaTexto: "↓ Menos 4,5 sacas/alq (−225,00 kg/alq) para transportar e abastecer",
            veredicto: "Mesmo a saca do adubo proposto tendo valor unitário maior, o custo final da lavoura é R$ 75,00 mais barato por alqueire (economia total de R$ 1.815,00 na área de 24,20 alqueires).",
            isMenorCusto: true, isMelhorCustoBeneficio: false,
          },
        ],
      },
    };
    const texto = montarTextoWhatsApp(resumoEquivalencia);
    expect(texto).toContain("🔁 *COMPARADOR DE FORMULAÇÕES* — Equivalência de Formulações por Sacas (Custo Real do Produtor)");
    expect(texto).toContain("Base do produtor: *10-15-15* · 18,0 sc/alq (900,00 kg/alq) · R$ 900,00/alq · R$ 21.780,00 na área (critério: P₂O₅)");
    expect(texto).toContain("↳ N: 0,00 kg · P₂O₅: 135,00 kg · K₂O: 135,00 kg por alqueire");
    expect(texto).toContain("• 08-20-15 (43% NPK): 13,5 sc/alq (675,00 kg/alq) → *R$ 19.965,00* ★ menor custo");
    expect(texto).toContain("↳ N: 54,00 kg · P₂O₅: 135,00 kg · K₂O: 101,25 kg por alqueire");
    expect(texto).toContain("↳ ↓ Menos 4,5 sacas/alq (−225,00 kg/alq) para transportar e abastecer");
    expect(texto).toContain("↳ Mesmo a saca do adubo proposto tendo valor unitário maior, o custo final da lavoura é R$ 75,00 mais barato por alqueire (economia total de R$ 1.815,00 na área de 24,20 alqueires).");
  });

  it("termina com o rodapé de aviso técnico", () => {
    const texto = montarTextoWhatsApp(resumoSoja);
    expect(texto).toContain("_Preço válido no momento da geração — sujeito a alteração._");
    expect(texto).toContain("_Documento técnico de uso interno · Coasul Agro_");
  });

  it("sem ref/horaGeracao (versão standalone, mais simples): mostra só a data, sem 'undefined'", () => {
    // eslint-disable-next-line no-unused-vars -- destructuring só pra remover ref/horaGeracao do objeto
    const { ref, horaGeracao, ...resumoSemRef } = resumoSoja;
    const texto = montarTextoWhatsApp(resumoSemRef);
    expect(texto).toContain("🌱 *COASUL AGRO — COTAÇÃO TÉCNICA*\n01/01/2026");
    expect(texto).not.toContain("undefined");
    expect(texto).not.toContain("Ref:");
  });
});

describe("montarTextoWhatsAppRegulagem", () => {
  it("variante semente: parâmetros, regulagem recomendada e teste de campo", () => {
    const resumo = {
      variante: "semente", data: "01/01/2026",
      espacamento: "0,45", populacao: "280.000", germinacao: "90",
      plantasMetro: "12,60", metrosLineares: "22.222",
      testeMetros: "40", esperadoPorLinha: "50",
    };
    const texto = montarTextoWhatsAppRegulagem(resumo);
    expect(texto).toContain("🚜 *COASUL AGRO — REGULAGEM DE IMPLEMENTO*");
    expect(texto).toContain("🌱 Semente · 01/01/2026");
    expect(texto).toContain("• Espaçamento entre linhas: 0,45 m");
    expect(texto).toContain("• Stand de plantas: 280.000 plantas/ha");
    expect(texto).toContain("• Germinação do lote: 90%");
    expect(texto).toContain("🎯 *REGULAGEM RECOMENDADA:*\n*12,60 plantas/m*\n↳ Metros lineares/ha: 22.222 m");
    expect(texto).toContain("📏 *Teste de Campo (40 metros):*");
    expect(texto).toContain("• Esperado por linha: 50 sementes");
  });

  it("variante semente sem teste de campo informado não inclui a seção", () => {
    const resumo = {
      variante: "semente", data: "01/01/2026",
      espacamento: "0,45", populacao: "280.000", germinacao: "90",
      plantasMetro: "12,60", metrosLineares: "22.222",
      testeMetros: "", esperadoPorLinha: "",
    };
    expect(montarTextoWhatsAppRegulagem(resumo)).not.toContain("Teste de Campo");
  });

  it("variante adubo: dose desejada e regulagem em g/m, sem teste de campo", () => {
    const resumo = {
      variante: "adubo", data: "01/01/2026",
      espacamento: "0,45", dose: "300", metrosLineares: "22.222", aduboG: "13,50", aduboKg: "0,0135",
    };
    const texto = montarTextoWhatsAppRegulagem(resumo);
    expect(texto).toContain("🧪 Adubação · 01/01/2026");
    expect(texto).toContain("• Dose desejada: 300 kg/ha");
    expect(texto).toContain("🎯 *REGULAGEM RECOMENDADA:*\n*13,50 g/m*\n↳ Metros lineares/ha: 22.222 m");
    expect(texto).not.toContain("Stand de plantas");
    expect(texto).not.toContain("Teste de Campo");
  });

  it("termina com o rodapé de calibração de semeadora", () => {
    const resumo = { variante: "adubo", data: "01/01/2026", espacamento: "0,45", dose: "300", metrosLineares: "22.222", aduboG: "13,50" };
    expect(montarTextoWhatsAppRegulagem(resumo)).toContain("_Estimativa técnica para calibração de semeadora · Coasul Agro_");
  });
});

describe("montarTextoWhatsAppCalagem", () => {
  const resumoBase = {
    ref: "20260101-0001", data: "01/01/2026",
    cliente: "Fazenda São Judas", area: "10,00 alq (24,20 ha)",
    v1: "30,23", v2: "80,00", ctc: "8,60", sb: "2,60", relCaMg: "3,33", mg: "0,6",
    ncAplicar: "2,68", totalCalcario: "64,74", tipoCalcario: "Calcário Dolomítico", prnt: "80,00",
    alertaParcelamento: true,
    ngDoseKgHa: "2.000,00", totalGesso: "48,40", gessagemNecessaria: true, enxofre: "300,00", calcio: "360,00",
  };

  it("cabeçalho, produtor, área e V2 desejado", () => {
    const texto = montarTextoWhatsAppCalagem(resumoBase);
    expect(texto).toContain("🧪 *COASUL AGRO — RECOMENDAÇÃO DE CALAGEM E GESSAGEM*");
    expect(texto).toContain("Ref: #20260101-0001 · 01/01/2026");
    expect(texto).toContain("👤 *Produtor:* Fazenda São Judas");
    expect(texto).toContain("📐 *Área:* 10,00 alq (24,20 ha)");
    expect(texto).toContain("🎯 *V₂ desejado:* 80,00%");
  });

  it("diagnóstico do solo com V1/V2, CTC, soma de bases e relação Ca/Mg", () => {
    const texto = montarTextoWhatsAppCalagem(resumoBase);
    expect(texto).toContain("• V₁ atual: 30,23% ➔ V₂ alvo: 80,00%");
    expect(texto).toContain("• CTC (T): 8,60 cmolc/dm³ · Soma de Bases: 2,60 cmolc/dm³");
    expect(texto).toContain("• Relação Ca/Mg: 3,33 · Mg: 0,6 cmolc/dm³");
  });

  it("calagem recomendada com dose, total, corretivo e alerta de parcelamento", () => {
    const texto = montarTextoWhatsAppCalagem(resumoBase);
    expect(texto).toContain("💧 *CALAGEM RECOMENDADA:*");
    expect(texto).toContain("*2,68 t/ha* (Total: *64,74 toneladas*)");
    expect(texto).toContain("• Corretivo: *Calcário Dolomítico* (PRNT 80,00%)");
    expect(texto).toContain("⚠️ _Atenção: Dose > 2,5 t/ha em plantio direto superficial — recomenda-se parcelamento anual._");
  });

  it("sem alerta de parcelamento, a linha de atenção não aparece", () => {
    const texto = montarTextoWhatsAppCalagem({ ...resumoBase, alertaParcelamento: false });
    expect(texto).not.toContain("Atenção: Dose > 2,5 t/ha");
  });

  it("gessagem necessária: mostra aporte de enxofre e cálcio", () => {
    const texto = montarTextoWhatsAppCalagem(resumoBase);
    expect(texto).toContain("⚡ *GESSAGEM:*");
    expect(texto).toContain("*2.000,00 kg/ha* (Total: *48,40 toneladas*)");
    expect(texto).toContain("• Aporte: ~300,00 kg/ha de Enxofre (S) e ~360,00 kg/ha de Cálcio (Ca)");
  });

  it("gessagem dispensada: mostra o aviso de subsolo sem impedimento", () => {
    const texto = montarTextoWhatsAppCalagem({ ...resumoBase, gessagemNecessaria: false });
    expect(texto).toContain("• _Subsolo sem impedimento químico crítico — gessagem dispensada._");
    expect(texto).not.toContain("Aporte:");
  });

  it("não inclui mais o bloco de investimento/logística (card removido da aba)", () => {
    const texto = montarTextoWhatsAppCalagem(resumoBase);
    expect(texto).not.toContain("Investimento Estimado");
    expect(texto).not.toContain("Logística");
  });

  it("termina com o rodapé citando o manual do Paraná (SBCS-NEPAR)", () => {
    const texto = montarTextoWhatsAppCalagem(resumoBase);
    expect(texto).toContain("_Baseado no Manual de Adubação e Calagem para o Estado do Paraná (SBCS-NEPAR)_");
  });

  it("sem ref (versão standalone): mostra só a data, sem 'undefined'", () => {
    // eslint-disable-next-line no-unused-vars -- destructuring só pra remover ref do objeto
    const { ref, ...resumoSemRef } = resumoBase;
    const texto = montarTextoWhatsAppCalagem(resumoSemRef);
    expect(texto).toContain("🧪 *COASUL AGRO — RECOMENDAÇÃO DE CALAGEM E GESSAGEM*\n01/01/2026");
    expect(texto).not.toContain("undefined");
  });
});

describe("calcularNecessidadeNutrientes", () => {
  it("100 sacas/alq a 15-6-4 (t/ton): 6 t/alq × coef = 90 N, 36 P, 24 K, total 150", () => {
    const r = calcularNecessidadeNutrientes({ produtividadeSacaAlq: 100, coef: { n: 15, p: 6, k: 4 } });
    expect(r.toneladasAlq).toBeCloseTo(6, 9);
    expect(r.nKgAlq).toBeCloseTo(90, 9);
    expect(r.pKgAlq).toBeCloseTo(36, 9);
    expect(r.kKgAlq).toBeCloseTo(24, 9);
    expect(r.totalKgAlq).toBeCloseTo(150, 9);
  });

  it("produtividade 0 retorna tudo zerado", () => {
    const r = calcularNecessidadeNutrientes({ produtividadeSacaAlq: 0, coef: { n: 15, p: 6, k: 4 } });
    expect(r.toneladasAlq).toBe(0);
    expect(r.nKgAlq).toBe(0);
    expect(r.pKgAlq).toBe(0);
    expect(r.kKgAlq).toBe(0);
    expect(r.totalKgAlq).toBe(0);
  });

  it("coef ausente não quebra (trata como 0-0-0)", () => {
    const r = calcularNecessidadeNutrientes({ produtividadeSacaAlq: 50 });
    expect(r.totalKgAlq).toBe(0);
  });
});

describe("pontuarFormulacao", () => {
  it("formulação com a mesma razão N:P:K da necessidade tem distância 0 e dose que fecha exato nos três", () => {
    const necessidade = { nKgAlq: 50, pKgAlq: 25, kKgAlq: 25, totalKgAlq: 100 };
    const r = pontuarFormulacao(necessidade, [20, 10, 10]); // mesma razão 2:1:1
    expect(r.distancia).toBeCloseTo(0, 9);
    expect(r.doseAlq).toBeCloseTo(250, 9);
    expect(r.fornecido.n).toBeCloseTo(50, 9);
    expect(r.fornecido.p).toBeCloseTo(25, 9);
    expect(r.fornecido.k).toBeCloseTo(25, 9);
    expect(r.diferenca.n).toBeCloseTo(0, 9);
    expect(r.diferenca.p).toBeCloseTo(0, 9);
    expect(r.diferenca.k).toBeCloseTo(0, 9);
  });

  it("formulação sem um dos nutrientes (%=0) não entra na conta da dose e aparece como falta pura", () => {
    const necessidade = { nKgAlq: 30, pKgAlq: 10, kKgAlq: 20, totalKgAlq: 60 };
    const r = pontuarFormulacao(necessidade, [30, 0, 20]); // sem P
    // dose cobre o mais exigente entre N e K (aqui P não conta)
    expect(r.doseAlq).toBeCloseTo(Math.max(30 / 0.3, 20 / 0.2), 9);
    expect(r.fornecido.p).toBe(0);
    expect(r.diferenca.p).toBeCloseTo(-10, 9); // falta os 10 kg de P que a formulação não entrega
  });

  it("necessidade zerada (nada calculado ainda) retorna distância infinita, sem NaN", () => {
    const r = pontuarFormulacao({ nKgAlq: 0, pKgAlq: 0, kKgAlq: 0, totalKgAlq: 0 }, [20, 5, 20]);
    expect(r.distancia).toBe(Infinity);
    expect(r.doseAlq).toBe(0);
  });

  it("formulação zerada ([0,0,0]) retorna distância infinita em vez de dividir por zero", () => {
    const necessidade = { nKgAlq: 30, pKgAlq: 10, kKgAlq: 20, totalKgAlq: 60 };
    const r = pontuarFormulacao(necessidade, [0, 0, 0]);
    expect(r.distancia).toBe(Infinity);
  });

  it("ignorarN: exportação de N alta (ex.: soja) não puxa a razão nem a dose — só P e K contam", () => {
    // N bem maior que P/K na necessidade (como a soja, que fixa N via inoculante) —
    // sem ignorarN isso dominaria a razão e a dose (ver teste seguinte).
    const necessidade = { nKgAlq: 300, pKgAlq: 40, kKgAlq: 20, totalKgAlq: 360 };
    const r = pontuarFormulacao(necessidade, [10, 20, 10], { ignorarN: true }); // mesma razão P:K (2:1) da necessidade
    expect(r.distancia).toBeCloseTo(0, 9); // razão P:K bate exato, N não entra na conta
    expect(r.doseAlq).toBeCloseTo(200, 9); // dose que cobre P e K (40/0,20 e 20/0,10) — N (300/0,10=3000) não conta mais
    expect(r.fornecido.n).toBeCloseTo(20, 9); // N que essa dose de P/K acaba trazendo de carona (informativo)
    expect(r.diferenca.n).toBeCloseTo(-280, 9); // "falta" de N é esperada e não deve ser tratada como alerta
  });

  it("ignorarN ausente/false preserva o comportamento padrão (N entra na razão e na dose)", () => {
    const necessidade = { nKgAlq: 300, pKgAlq: 40, kKgAlq: 20, totalKgAlq: 360 };
    const r = pontuarFormulacao(necessidade, [10, 20, 10]);
    expect(r.doseAlq).toBeCloseTo(3000, 9); // sem ignorarN, N (300/0,10) domina a dose
  });
});

describe("encontrarFormulacaoMaisProxima", () => {
  it("rankeia a formulação de razão mais parecida em primeiro lugar", () => {
    const necessidade = { nKgAlq: 50, pKgAlq: 25, kKgAlq: 25, totalKgAlq: 100 }; // razão 2:1:1
    const catalogo = [
      [8, 20, 20],  // bem torta em relação à necessidade
      [20, 10, 10], // razão idêntica (2:1:1)
      [30, 0, 20],  // sem P, também torta
    ];
    const ranking = encontrarFormulacaoMaisProxima(necessidade, catalogo);
    expect(ranking).toHaveLength(3);
    expect(ranking[0].npk).toEqual([20, 10, 10]);
    expect(ranking[0].distancia).toBeCloseTo(0, 9);
    expect(ranking[0].distancia).toBeLessThan(ranking[1].distancia);
    expect(ranking[1].distancia).toBeLessThan(ranking[2].distancia);
  });

  it("catálogo vazio retorna lista vazia", () => {
    const necessidade = { nKgAlq: 50, pKgAlq: 25, kKgAlq: 25, totalKgAlq: 100 };
    expect(encontrarFormulacaoMaisProxima(necessidade, [])).toEqual([]);
  });

  it("ignorarN muda o 1º colocado: sem o filtro, o catálogo mais rico em N vence mesmo com P:K invertido", () => {
    const necessidade = { nKgAlq: 300, pKgAlq: 40, kKgAlq: 20, totalKgAlq: 360 }; // P:K real = 2:1
    const catalogo = [
      [10, 20, 10], // P:K = 2:1 (igual à necessidade), pouco N
      [30, 10, 20], // P:K = 1:2 (invertido!), N próximo do necessário
    ];
    const semFiltro = encontrarFormulacaoMaisProxima(necessidade, catalogo);
    expect(semFiltro[0].npk).toEqual([30, 10, 20]); // vence só por causa do N, apesar do P:K errado

    const comFiltro = encontrarFormulacaoMaisProxima(necessidade, catalogo, { ignorarN: true });
    expect(comFiltro[0].npk).toEqual([10, 20, 10]); // agora vence quem tem o P:K certo
    expect(comFiltro[0].distancia).toBeCloseTo(0, 9);
  });
});
