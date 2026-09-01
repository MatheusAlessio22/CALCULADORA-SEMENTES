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

  // Conversões de área entre alqueire e hectare — só matemática pura, sem qualquer
  // suposição sobre qual unidade está selecionada na interface.
  function alqParaHa(alqueires) {
    return alqueires * ALQ_HA;
  }
  function haParaAlq(hectares) {
    return hectares / ALQ_HA;
  }

  // Todas as fórmulas de cálculo abaixo (sementes, sacas, dose) esperam a área já
  // na unidade canônica interna (alqueires) — esta função normaliza o valor
  // digitado pelo usuário, seja qual for a unidade escolhida no seletor da
  // interface, evitando qualquer divergência de arredondamento entre os dois
  // jeitos de informar a mesma área.
  function normalizarAreaParaAlqueires(valor, unidade) {
    const v = Number(valor) || 0;
    return unidade === "ha" ? haParaAlq(v) : v;
  }

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

  // ---------- Calagem & Gessagem (Manual de Adubação e Calagem para o Estado do
  // Paraná — SBCS-NEPAR / IDR-Paraná / Embrapa) ----------

  // K trocável do laudo às vezes vem em mg/dm³ em vez de cmolc/dm³ — esta é a
  // conversão oficial usada nos boletins de análise de solo do Paraná.
  function converterKMgParaCmolc(mgDm3) {
    return (Number(mgDm3) || 0) / 391;
  }

  // Índices de fertilidade da camada de solo (SB, CTC efetiva e a pH 7,0, V%, m%,
  // relações catiônicas e % de ocupação de cada cátion na CTC a pH 7,0). Os
  // cátions (Ca²⁺, Mg²⁺, Al³⁺, H+Al) entram sempre em cmolc/dm³; o K⁺ pode vir
  // nessa mesma unidade ou em mg/dm³ (kUnidade: "cmolc" [padrão] ou "mgdm3").
  function calcularIndicesSolo({ ca = 0, mg = 0, k = 0, al = 0, hAl = 0, kUnidade = "cmolc" } = {}) {
    const caN = Number(ca) || 0, mgN = Number(mg) || 0, alN = Number(al) || 0, hAlN = Number(hAl) || 0;
    const kCmolc = kUnidade === "mgdm3" ? converterKMgParaCmolc(k) : (Number(k) || 0);

    const sb = caN + mgN + kCmolc;
    const ctcEfetiva = sb + alN;
    const ctcPh7 = sb + hAlN;
    const v = ctcPh7 > 0 ? (sb / ctcPh7) * 100 : 0;
    const m = ctcEfetiva > 0 ? (alN / ctcEfetiva) * 100 : 0;
    const caMg = mgN > 0 ? caN / mgN : 0;
    const caK = kCmolc > 0 ? caN / kCmolc : 0;
    const mgK = kCmolc > 0 ? mgN / kCmolc : 0;
    const pctCa = ctcPh7 > 0 ? (caN / ctcPh7) * 100 : 0;
    const pctMg = ctcPh7 > 0 ? (mgN / ctcPh7) * 100 : 0;
    const pctK = ctcPh7 > 0 ? (kCmolc / ctcPh7) * 100 : 0;

    return { sb, ctcEfetiva, ctcPh7, v, m, caMg, caK, mgK, pctCa, pctMg, pctK, kCmolc };
  }

  // Necessidade de calagem pelo método da elevação da saturação por bases (camada
  // 0-20 cm): NCbase (t/ha) = (V2 − V1) × T ÷ PRNT, ajustada pela profundidade de
  // incorporação (referência 20 cm — plantio direto sem incorporação usa 10 cm,
  // fator 0,5) e pelo percentual da área efetivamente aplicada. V1 ≥ V2 significa
  // que a saturação por bases já está no alvo ou acima dele: não há necessidade
  // de calagem. `alertaParcelamento` sinaliza dose acima de 2,5 t/ha numa única
  // aplicação superficial, que o manual recomenda parcelar entre safras.
  function calcularCalagem({ v1 = 0, v2 = 0, t = 0, prnt = 0, profundidade = 20, areaAplicadaPct = 100 } = {}) {
    if (!(t > 0) || !(prnt > 0) || v1 >= v2) {
      return { ncBase: 0, ncAplicar: 0, alertaParcelamento: false };
    }
    const ncBase = ((v2 - v1) * t) / prnt;
    const fatorProfundidade = profundidade / 20;
    const fatorArea = areaAplicadaPct / 100;
    const ncAplicar = ncBase * fatorProfundidade * fatorArea;
    return { ncBase, ncAplicar, alertaParcelamento: ncAplicar > 2.5 };
  }

  // Tipo de calcário recomendado a partir do teor de Mg²⁺ e da relação Ca/Mg da
  // camada 0-20 cm. As duas primeiras regras cobrem os extremos definidos no
  // manual (dolomítico, calcítico). O miolo (Mg entre 0,8 e 1,5 cmolc/dm³ e
  // Ca/Mg entre 2,0 e 4,0) seria magnesiano no manual, mas a Coasul só
  // trabalha com Dolomítico e Calcítico — então esse miolo é dividido no
  // ponto médio da faixa de Mg (1,15 cmolc/dm³): abaixo pende pro produto
  // com mais MgO (Dolomítico), acima pende pro produto com menos MgO
  // (Calcítico), seguindo a mesma direção das regras dos extremos.
  function determinarTipoCalcario({ mg = 0, caMg = 0 } = {}) {
    if (mg < 0.8 || caMg > 4.0) return { tipo: "Dolomítico", faixaMgO: "MgO > 12%" };
    if (mg > 1.5 || caMg < 2.0) return { tipo: "Calcítico", faixaMgO: "MgO < 5%" };
    if (mg <= 1.15) return { tipo: "Dolomítico", faixaMgO: "MgO > 12%" };
    return { tipo: "Calcítico", faixaMgO: "MgO < 5%" };
  }

  // Gatilhos oficiais (Paraná) para indicar gessagem, a partir do laudo do
  // subsolo (20-40 cm): basta UM dos quatro critérios para recomendar gesso.
  function verificarNecessidadeGessagem({ al = 0, m = 0, ca = 0, v = 0 } = {}) {
    const motivos = [];
    if (al > 0.3) motivos.push("Alumínio trocável (Al³⁺) acima de 0,3 cmolc/dm³ no subsolo (20-40 cm).");
    if (m > 20) motivos.push("Saturação por alumínio (m%) acima de 20% no subsolo (20-40 cm).");
    if (ca < 1.5) motivos.push("Cálcio (Ca²⁺) abaixo de 1,5 cmolc/dm³ no subsolo (20-40 cm).");
    if (v < 35) motivos.push("Saturação por bases (V%) abaixo de 35% no subsolo (20-40 cm).");
    return { necessaria: motivos.length > 0, motivos };
  }

  // Dose de gesso agrícola pelo método do teor de argila do subsolo (padrão
  // sugerido: NG = 50 × argila%) ou pela elevação da saturação por cálcio no
  // subsolo (NG = [0,6 × Tsubsolo − Ca²⁺subsolo] × 640); nunca negativa — quando a
  // fórmula por saturação de cálcio já dá conta suprida, a dose é zero, não
  // corretiva ao contrário. `area` aqui é sempre em hectares.
  function calcularGessagem({ argila = 0, metodo = "argila", tSub = 0, caSub = 0, area = 0 } = {}) {
    const doseKgHa = metodo === "saturacaoCa"
      ? Math.max(0, (0.6 * tSub - caSub) * 640)
      : Math.max(0, 50 * argila);
    const doseTHa = doseKgHa / 1000;
    return { doseKgHa, doseTHa, totalTArea: doseTHa * area };
  }

  // Enxofre (~15%) e Cálcio (~18%) aportados pela dose de gesso agrícola aplicada.
  function nutrientesGesso(doseKgHa) {
    const d = Number(doseKgHa) || 0;
    return { enxofreKgHa: d * 0.15, calcioKgHa: d * 0.18 };
  }

  // ---------- Comparador de Formulações: Custo por Ponto de Nutriente ----------
  // Ajuda a comparar adubos comerciais não só pelo preço da embalagem, mas pelo
  // custo real de cada kg de nutriente ativo (N + P₂O₅ + K₂O) que ela entrega —
  // duas formulações com preços parecidos podem ter custo-benefício bem
  // diferente se a concentração de nutrientes também for diferente.

  // Soma simples dos três nutrientes primários (%). Ex.: Ureia 45-00-00 = 45%;
  // 04-14-08 = 26%; 10-15-15 = 40%; KCl 00-00-60 = 60%.
  function calcularConcentracaoTotalNutrientes(npkN, npkP, npkK) {
    return (Number(npkN) || 0) + (Number(npkP) || 0) + (Number(npkK) || 0);
  }

  // Custo por kg de nutriente ativo (R$/kg) de uma embalagem: quanto do preço
  // pago vai de fato para nutriente, e não para o "peso morto" do produto.
  // `preco` é o preço da embalagem inteira (não confundir com preço por kg do
  // produto) — para comparar por preço/kg de produto, basta chamar com
  // `tamanhoEmbalagemKg: 1`, já que o preço de 1 kg é o preço de uma
  // "embalagem" de 1 kg.
  function calcularCustoPorKgNutriente({ preco = 0, tamanhoEmbalagemKg = 0, npkN = 0, npkP = 0, npkK = 0 } = {}) {
    const precoN = Number(preco) || 0;
    const tamanhoN = Number(tamanhoEmbalagemKg) || 0;
    const somaNpk = calcularConcentracaoTotalNutrientes(npkN, npkP, npkK);
    if (somaNpk <= 0 || precoN <= 0 || tamanhoN <= 0) return 0;
    const nutrienteTotalKg = tamanhoN * (somaNpk / 100);
    return precoN / nutrienteTotalKg;
  }

  // A partir de uma lista de linhas do comparador (cada uma já com o campo
  // `custoPorKgNutriente` calculado), aponta a de melhor custo-benefício —
  // ignorando linhas zeradas ou sem preço/NPK reconhecido. Retorna a própria
  // linha vencedora (preservando o índice `i`, se houver) ou `null` se nenhuma
  // linha for válida.
  function identificarMelhorCustoBeneficio(linhasComparador) {
    const validas = (linhasComparador || []).filter((l) => (l.custoPorKgNutriente || 0) > 0);
    if (!validas.length) return null;
    return validas.reduce((melhor, atual) => (atual.custoPorKgNutriente < melhor.custoPorKgNutriente ? atual : melhor));
  }

  // ---------- Comparador de Formulações: Equivalência e Compensação de Adubos ----------
  // Modo "equiv" do comparador (Adubação/Ureia): a partir da formulação que o
  // produtor já usa hoje (dose praticada, kg/ha) e de um critério de nutriente
  // (P₂O₅ por padrão, ou NPK Total/K₂O), calcula a dose de uma formulação
  // candidata que entrega exatamente a mesma quantidade daquele nutriente por
  // hectare — a regra clássica de equivalência de adubos:
  //   Dose_Comp = Dose_Base × (%Nutriente_Base ÷ %Nutriente_Comp)
  function nutrientePctPorCriterio(npk, criterio) {
    const [n, p, k] = npk || [0, 0, 0];
    if (criterio === "npk") return (Number(n) || 0) + (Number(p) || 0) + (Number(k) || 0);
    if (criterio === "k") return Number(k) || 0;
    return Number(p) || 0; // "p" (P₂O₅) é o critério padrão
  }

  // Retorna sempre um objeto (nunca null) pra deixar explícito, no `doseHa`,
  // quando a equivalência não é calculável (nutriente do critério ausente na
  // base ou na formulação comparada) — quem chama decide como avisar o usuário.
  function calcularEquivalenciaAdubo({ baseDoseHa, baseNpk, compNpk, criterio } = {}) {
    const baseNutrientePct = nutrientePctPorCriterio(baseNpk, criterio);
    const compNutrientePct = nutrientePctPorCriterio(compNpk, criterio);
    const baseDose = Number(baseDoseHa) || 0;
    const possivel = baseNutrientePct > 0 && compNutrientePct > 0;
    return {
      baseNutrientePct,
      compNutrientePct,
      doseHa: possivel ? baseDose * (baseNutrientePct / compNutrientePct) : null,
    };
  }

  // Veredito financeiro do modo "Equivalência de Formulações por Sacas": compara
  // o custo por alqueire (e total na área) do adubo proposto contra a base do
  // produtor e devolve uma frase pronta pro card em tela, WhatsApp, PDF e PNG.
  // `fmtMoeda`/`fmtDec` são passados pelo chamador (não moram aqui — ver
  // formatarPrecoResumo() acima pelo mesmo motivo) pra manter esta função pura
  // e testável sem depender de formatação específica de moeda/locale.
  function montarVeredicto({ custoAlqBase, custoAlqComp, custoTotalBase, custoTotalComp, precoSacaBase, precoSacaComp, areaAlq } = {}, fmtMoeda, fmtDec) {
    const TOL = 0.005;
    const diffAlq = custoAlqComp - custoAlqBase;
    const diffTotal = custoTotalComp - custoTotalBase;
    const economiza = diffAlq < -TOL;
    const custaMais = diffAlq > TOL;
    const sacaMaisCara = precoSacaComp > precoSacaBase + TOL;
    const temArea = areaAlq > 0;

    if (economiza) {
      const prefixo = sacaMaisCara ? "Mesmo a saca do adubo proposto tendo valor unitário maior, o" : "O";
      const totalTexto = temArea
        ? ` (economia total de ${fmtMoeda(Math.abs(diffTotal))} na área de ${fmtDec(areaAlq)} alqueires)`
        : " — informe a área da lavoura acima para ver a economia total";
      return `${prefixo} custo final da lavoura é ${fmtMoeda(Math.abs(diffAlq))} mais barato por alqueire${totalTexto}.`;
    }
    if (custaMais) {
      const totalTexto = temArea ? ` (${fmtMoeda(diffTotal)} a mais na área de ${fmtDec(areaAlq)} alqueires)` : "";
      return `O adubo proposto sai ${fmtMoeda(diffAlq)} mais caro por alqueire${totalTexto}, mesmo entregando menos sacas por alqueire.`;
    }
    return "Custo final praticamente equivalente entre as duas opções.";
  }

  // ---------- Estimativa de Produtividade: Necessidade de Nutrientes ----------
  // A partir de uma produtividade-alvo (sacas de 60 kg por alqueire), estima a
  // exportação bruta de N/P₂O₅/K₂O pelos grãos colhidos — o que a lavoura
  // "leva" do solo pra entregar aquela produção — e aponta, numa lista de
  // formulações, qual tem a proporção mais parecida com essa necessidade.
  // "Bruta" porque não desconta nutriente já disponível no solo (isso viria
  // de um laudo, como na aba Calagem & Gessagem) nem eficiência de
  // aproveitamento do adubo aplicado — é a exportação teórica pelos grãos.

  // Necessidade bruta de N/P₂O₅/K₂O (kg) por alqueire, dada a produtividade-
  // alvo em sacas de 60 kg e o coeficiente de extração (kg de nutriente por
  // TONELADA de grão) da cultura.
  function calcularNecessidadeNutrientes({ produtividadeSacaAlq = 0, coef } = {}) {
    const sacas = Number(produtividadeSacaAlq) || 0;
    const toneladasAlq = (sacas * 60) / 1000;
    const c = coef || { n: 0, p: 0, k: 0 };
    const nKgAlq = toneladasAlq * (Number(c.n) || 0);
    const pKgAlq = toneladasAlq * (Number(c.p) || 0);
    const kKgAlq = toneladasAlq * (Number(c.k) || 0);
    return { toneladasAlq, nKgAlq, pKgAlq, kKgAlq, totalKgAlq: nKgAlq + pKgAlq + kKgAlq };
  }

  // Pontua uma formulação candidata [N%, P%, K%] contra a necessidade
  // calculada: `distancia` é a distância euclidiana entre as razões N:P:K
  // normalizadas (0 = proporção idêntica; quanto maior, mais "torta" a
  // formulação é em relação ao que a lavoura precisa) — não mede quantidade,
  // só o "formato". `doseAlq` é a dose que cobre o nutriente mais exigente
  // (maior kg necessário ÷ % da formulação), pra nunca deixar a lavoura curta
  // em nenhum dos três; nutriente ausente na formulação (% = 0) não entra na
  // conta da dose e aparece como falta pura em `diferenca`.
  //
  // `ignorarN` (opcional): trata o N como se fosse 0 tanto na necessidade
  // quanto na formulação, pra rankear e dosar só por P e K — uso pra soja
  // (e outras leguminosas fortemente inoculadas), cujo N exportado pelo grão
  // vem majoritariamente de fixação biológica (Bradyrhizobium), não de
  // adubo: sem isso, a exportação bruta de N (bem maior que P/K) dominava a
  // razão e fazia o ranking preferir a formulação com mais N% do catálogo,
  // em vez da mais adequada pra P e K — e a dose calculada (que cobre o
  // nutriente mais exigente) inflava junto, sugerindo uma quantidade de
  // adubo muito acima do que a lavoura realmente precisa aplicar. `fornecido.n`
  // e `diferenca.n` continuam calculados (informam quanto de N a dose de P/K
  // escolhida acaba trazendo de carona), só não entram mais na razão nem na
  // dose — quem chama decide se/como exibir essa diferença de N (ver
  // renderProdutividade em app.js, que não trata falta de N como alerta
  // quando ignorarN está ativo).
  function pontuarFormulacao(necessidade, npk, { ignorarN = false } = {}) {
    const [n, p, k] = npk;
    const necessidadeN = necessidade ? necessidade.nKgAlq : 0;
    const necessidadeP = necessidade ? necessidade.pKgAlq : 0;
    const necessidadeK = necessidade ? necessidade.kKgAlq : 0;
    const nRazao = ignorarN ? 0 : n;
    const necessidadeNRazao = ignorarN ? 0 : necessidadeN;
    const somaFormulacao = nRazao + p + k;
    const somaNecessidade = necessidadeNRazao + necessidadeP + necessidadeK;
    if (somaFormulacao <= 0 || !(somaNecessidade > 0)) {
      return { npk, distancia: Infinity, doseAlq: 0, fornecido: { n: 0, p: 0, k: 0 }, diferenca: { n: 0, p: 0, k: 0 } };
    }

    const razaoForm = { n: nRazao / somaFormulacao, p: p / somaFormulacao, k: k / somaFormulacao };
    const razaoNec = {
      n: necessidadeNRazao / somaNecessidade,
      p: necessidadeP / somaNecessidade,
      k: necessidadeK / somaNecessidade,
    };
    const distancia = Math.sqrt(
      (razaoForm.n - razaoNec.n) ** 2 + (razaoForm.p - razaoNec.p) ** 2 + (razaoForm.k - razaoNec.k) ** 2
    );

    const doseAlq = Math.max(
      !ignorarN && n > 0 ? necessidadeN / (n / 100) : 0,
      p > 0 ? necessidadeP / (p / 100) : 0,
      k > 0 ? necessidadeK / (k / 100) : 0
    );

    const fornecido = { n: doseAlq * (n / 100), p: doseAlq * (p / 100), k: doseAlq * (k / 100) };
    const diferenca = {
      n: fornecido.n - necessidadeN,
      p: fornecido.p - necessidadeP,
      k: fornecido.k - necessidadeK,
    };

    return { npk, distancia, doseAlq, fornecido, diferenca };
  }

  // Rankeia um catálogo de formulações [N%, P%, K%] pela distância à
  // necessidade (menor primeiro) — quem chama usa o primeiro item como
  // recomendação principal e pode mostrar os seguintes como alternativa.
  // `opts` (ex.: `{ ignorarN: true }`) é repassado direto pra
  // pontuarFormulacao acima.
  function encontrarFormulacaoMaisProxima(necessidade, catalogo, opts) {
    return (catalogo || [])
      .map((npk) => pontuarFormulacao(necessidade, npk, opts))
      .sort((a, b) => a.distancia - b.distancia);
  }

  // ---------- Texto formatado para envio no WhatsApp ----------
  // Cada função recebe o mesmo objeto "resumo" que já alimenta a exportação em
  // PDF/PNG daquela ficha (coletarResumo/coletarResumoRegulagem/
  // coletarResumoCalagem, em app.js) — são funções puras: só formatam texto a
  // partir do que já foi coletado do DOM, nunca leem o DOM elas mesmas.

  // Linha "Ref: #X · data às hora" do cabeçalho — a versão standalone (arquivo
  // único) não gera código de referência nem hora de geração, então essas
  // partes somem graciosamente em vez de aparecer como "undefined".
  function montarLinhaRefData(r) {
    const dataHora = r.horaGeracao ? `${r.data} às ${r.horaGeracao}` : r.data;
    return r.ref ? `Ref: #${r.ref} · ${dataHora}` : dataHora;
  }

  // Sementes & Adubação
  function montarTextoWhatsApp(r) {
    const blocos = [];
    blocos.push(`🌱 *COASUL AGRO — COTAÇÃO TÉCNICA*\n${montarLinhaRefData(r)}`);
    blocos.push(
      `👤 *Produtor:* ${r.cliente || "Não informado"}\n` +
      `🌾 *Cultura:* ${r.cultura}${r.cultivar ? " (" + r.cultivar + ")" : ""}\n` +
      `📐 *Área:* ${r.area}`
    );
    if (r.params && r.params.length) {
      blocos.push(`⚙️ *Parâmetros:*\n` + r.params.map(([k, v]) => `• ${k}: ${v}`).join("\n"));
    }
    let necessidade = `📦 *NECESSIDADE TOTAL:*\n*${r.total} ${r.unidade}*`;
    if (r.combo) necessidade += `\n↳ Combinado: ${r.combo}`;
    blocos.push(necessidade);
    if (r.nutrientes && r.nutrientes.length) {
      blocos.push(`🧪 *Nutrientes no Solo (Total):*\n` + r.nutrientes.map((n) => `• ${n.nome}: ${n.valor} (${n.porAlq})`).join("\n"));
    }
    if (r.comparador && r.comparador.linhas && r.comparador.linhas.length) {
      let compBloco = `🔁 *COMPARADOR DE FORMULAÇÕES* — ${r.comparador.modo}`;
      if (r.comparador.isEquivalencia && r.comparador.base) {
        const b = r.comparador.base;
        compBloco += `\nBase do produtor: *${b.npk}* · ${b.sacasAlq} (${b.doseAlq}) · ${b.custoAlq}/alq · ${b.custoTotal} na área (critério: ${b.criterio})`;
        compBloco += `\n  ↳ N: ${b.nutrientes.n} · P₂O₅: ${b.nutrientes.p} · K₂O: ${b.nutrientes.k} por alqueire`;
      }
      compBloco += "\n" + r.comparador.linhas.map((l) => {
        const rotuloQtd = r.comparador.isEquivalencia ? `${l.sacasAlq} (${l.doseAlq})` : l.dose;
        let s = `• ${l.npk} (${l.somaNpk}% NPK): ${rotuloQtd} → *${l.custoTotal}*`;
        if (l.isMenorCusto) s += " ★ menor custo";
        if (l.isMelhorCustoBeneficio) s += " ★ melhor custo-benefício";
        if (r.comparador.isEquivalencia && l.nutrientes) {
          s += `\n  ↳ N: ${l.nutrientes.n} · P₂O₅: ${l.nutrientes.p} · K₂O: ${l.nutrientes.k} por alqueire`;
        }
        if (l.logisticaTexto) s += `\n  ↳ ${l.logisticaTexto}`;
        if (l.veredicto) s += `\n  ↳ ${l.veredicto}`;
        return s;
      }).join("\n");
      blocos.push(compBloco);
    }
    if (r.linhas && r.linhas.length) {
      const linhasCusto = r.linhas.map((l) => {
        const temVista = l.precoVista && l.precoVista !== "—";
        let s = `• ${l.nome}: ${l.qtd} × ${temVista ? l.precoVista : "Sob consulta"} = *${temVista ? l.vista : "Sob consulta"}*`;
        if (l.precoPrazo && l.precoPrazo !== "—") s += `\n  ↳ A prazo (${r.vencimento || "Safra"}): ${l.prazo}`;
        return s;
      }).join("\n");
      blocos.push(`💰 *INVESTIMENTO ESTIMADO:*\n${linhasCusto}`);
    }
    blocos.push(`──────────────────────\n_Preço válido no momento da geração — sujeito a alteração._\n_Documento técnico de uso interno · Coasul Agro_`);
    return blocos.join("\n\n");
  }

  // Regulagem de Plantadeira (Semente ou Adubo)
  function montarTextoWhatsAppRegulagem(r) {
    const ehSemente = r.variante === "semente";
    const blocos = [];
    blocos.push(`🚜 *COASUL AGRO — REGULAGEM DE IMPLEMENTO*\n${ehSemente ? "🌱 Semente" : "🧪 Adubação"} · ${r.data}`);
    const parametros = [`• Espaçamento entre linhas: ${r.espacamento} m`];
    if (ehSemente) {
      parametros.push(`• Stand de plantas: ${r.populacao} plantas/ha`);
      parametros.push(`• Germinação do lote: ${r.germinacao}%`);
    } else {
      parametros.push(`• Dose desejada: ${r.dose} kg/ha`);
    }
    blocos.push(`⚙️ *Parâmetros:*\n` + parametros.join("\n"));
    const resultado = ehSemente ? `${r.plantasMetro} plantas/m` : `${r.aduboG} g/m`;
    blocos.push(`🎯 *REGULAGEM RECOMENDADA:*\n*${resultado}*\n↳ Metros lineares/ha: ${r.metrosLineares} m`);
    if (ehSemente && r.testeMetros) {
      blocos.push(`📏 *Teste de Campo (${r.testeMetros} metros):*\n• Esperado por linha: ${r.esperadoPorLinha} sementes`);
    }
    blocos.push(`──────────────────────\n_Estimativa técnica para calibração de semeadora · Coasul Agro_`);
    return blocos.join("\n\n");
  }

  // Calagem & Gessagem
  function montarTextoWhatsAppCalagem(r) {
    const blocos = [];
    blocos.push(`🧪 *COASUL AGRO — RECOMENDAÇÃO DE CALAGEM E GESSAGEM*\n${montarLinhaRefData(r)}`);
    blocos.push(
      `👤 *Produtor:* ${r.cliente || "Não informado"}\n` +
      `📐 *Área:* ${r.area}\n` +
      `🎯 *V₂ desejado:* ${r.v2}%`
    );
    blocos.push(
      `📊 *Diagnóstico do Solo:*\n` +
      `• V₁ atual: ${r.v1}% ➔ V₂ alvo: ${r.v2}%\n` +
      `• CTC (T): ${r.ctc} cmolc/dm³ · Soma de Bases: ${r.sb} cmolc/dm³\n` +
      `• Relação Ca/Mg: ${r.relCaMg} · Mg: ${r.mg} cmolc/dm³`
    );
    let calagemTexto =
      `💧 *CALAGEM RECOMENDADA:*\n` +
      `*${r.ncAplicar} t/ha* (Total: *${r.totalCalcario} toneladas*)\n` +
      `• Corretivo: *${r.tipoCalcario}* (PRNT ${r.prnt}%)`;
    if (r.alertaParcelamento) {
      calagemTexto += `\n⚠️ _Atenção: Dose > 2,5 t/ha em plantio direto superficial — recomenda-se parcelamento anual._`;
    }
    blocos.push(calagemTexto);

    let gessagemTexto = `⚡ *GESSAGEM:*\n*${r.ngDoseKgHa} kg/ha* (Total: *${r.totalGesso} toneladas*)\n`;
    gessagemTexto += r.gessagemNecessaria
      ? `• Aporte: ~${r.enxofre} kg/ha de Enxofre (S) e ~${r.calcio} kg/ha de Cálcio (Ca)`
      : `• _Subsolo sem impedimento químico crítico — gessagem dispensada._`;
    blocos.push(gessagemTexto);

    blocos.push(`──────────────────────\n_Baseado no Manual de Adubação e Calagem para o Estado do Paraná (SBCS-NEPAR)_`);
    return blocos.join("\n\n");
  }

  return {
    FORMULACOES_750KG,
    ALQ_HA,
    alqParaHa,
    haParaAlq,
    normalizarAreaParaAlqueires,
    calcularSementes,
    calcularSacas,
    calcularDose,
    calcularDosePMS,
    montarCombo,
    bagSizeFromNpk,
    calcularCusto,
    formatarPrecoResumo,
    precisaAlertarPrazoAusente,
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
  };

})();

// no navegador `module` não existe, então este bloco nunca roda ali — é só o que
// permite `import`/`require` deste arquivo a partir dos testes (Node/Vitest).
if (typeof module !== "undefined" && module.exports) {
  module.exports = Calculos;
}
