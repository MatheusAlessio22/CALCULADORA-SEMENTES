// Fórmulas de cálculo da calculadora, extraídas de app.js para serem puras (sem DOM)
// e assim testáveis isoladamente com Vitest. Carregado como script clássico (sem
// type="module"), antes de app.js, que consome tudo através do objeto global `Calculos`
// — nenhum comportamento do app muda, é só onde o código passa a morar.
//
// Tudo fica dentro de um IIFE: scripts clássicos compartilham o mesmo escopo global,
// então sem isso as funções internas (calcularSementes etc.) colidiriam com o
// `const { calcularSementes, ... } = Calculos` que o app.js faz logo em seguida.
const Calculos = (function () {

  // Formulações de ureia/adubo que só existem em bag de 750 kg — todas as demais são 1.000 kg
  const FORMULACOES_750KG = [[33, 0, 0], [40, 0, 0], [30, 0, 20]];

  const ALQ_HA = 2.42; // 1 alqueire (padrão paulista) = 2,42 hectares

  // fórmula: (24.200 × área ÷ espaçamento) × plantas/m ÷ ((100 − transpasse) ÷ 100)
  function calcularSementes({ area, plantas, espacamento, transpasse }) {
    if (!(espacamento > 0) || !(transpasse < 100)) return 0;
    return ((24200 * area / espacamento) * plantas) / ((100 - transpasse) / 100);
  }

  function calcularSacas({ area, sacasAlq }) {
    return area * sacasAlq;
  }

  function calcularDose({ area, doseAlq }) {
    return area * doseAlq;
  }

  // fórmula: (população × PMS × 100) ÷ (germinação × pureza)
  function calcularDosePMS({ populacao, pms, germinacao, pureza }) {
    if (!(germinacao > 0) || !(pureza > 0)) return 0;
    return (populacao * pms * 100) / (germinacao * pureza);
  }

  // Quando a conta cai no meio de uma embalagem grande (ex.: 1,90 bag), o produtor pode levar
  // os bags inteiros e completar o resto em sacaria, em vez de arredondar o bag para cima.
  function montarCombo(unidades, baseTotal) {
    const comTamanho = unidades.filter(u => u.size > 1);
    if (comTamanho.length < 2 || !isFinite(baseTotal) || baseTotal <= 0) return null;

    const ordenadas = [...comTamanho].sort((a, b) => b.size - a.size);
    const bag = ordenadas[0];      // maior embalagem
    const saca = ordenadas[1];     // sacaria imediatamente menor
    const nBags = Math.floor(baseTotal / bag.size);
    if (nBags < 1) return null;

    const resto = baseTotal - nBags * bag.size;
    if (resto <= bag.size * 0.0001) return null; // fechou redondo, não há sobra

    const nSacas = Math.ceil(resto / saca.size);
    return { label: "Combinado", combo: { bag, saca, nBags, nSacas } };
  }

  // Bag de 750 kg só existe pras formulações de ureia específicas; demais formulações vêm em bag de 1.000 kg
  function bagSizeFromNpk(npkN, npkP, npkK) {
    const eh750 = FORMULACOES_750KG.some(([n, p, k]) => n === Math.round(npkN) && p === Math.round(npkP) && k === Math.round(npkK));
    return eh750 ? 750 : 1000;
  }

  // custo de uma linha de embalagem: quantidade arredondada × preço digitado (0 se vazio/inválido)
  function calcularCusto(qtd, preco) {
    return (qtd || 0) * (parseFloat(preco) || 0);
  }

  // no resumo/ficha exportada, preço não informado vira "—" em vez de R$ 0,00
  function formatarPrecoResumo(valor, fmtMoeda) {
    return valor ? fmtMoeda(parseFloat(valor)) : "—";
  }

  // alerta de "preço a prazo não informado": só dispara quando o à vista foi preenchido e o a prazo não
  function precisaAlertarPrazoAusente(precoVistaStr, precoPrazoStr) {
    return precoVistaStr.trim() !== "" && precoPrazoStr.trim() === "";
  }

  return {
    FORMULACOES_750KG,
    ALQ_HA,
    calcularSementes,
    calcularSacas,
    calcularDose,
    calcularDosePMS,
    montarCombo,
    bagSizeFromNpk,
    calcularCusto,
    formatarPrecoResumo,
    precisaAlertarPrazoAusente,
  };

})();

// no navegador `module` não existe, então este bloco nunca roda ali — é só o que
// permite `import`/`require` deste arquivo a partir dos testes (Node/Vitest).
if (typeof module !== "undefined" && module.exports) {
  module.exports = Calculos;
}
