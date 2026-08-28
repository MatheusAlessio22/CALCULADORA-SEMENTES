
const APP_VERSION = "1.4.0";

const CROPS = {
  soja: {
    nome:"Soja", icon:"soja", accent:"#5C8A26", accentLight:"#9ACD3E",
    tipo:"semente", plantas:10, transpasse:5,
    embalagens:[["Embalagem 125.000", 125000], ["Embalagem 5.000.000", 5000000]],
  },
  milho: {
    nome:"Milho", icon:"milho", accent:"#D99A1E", accentLight:"#FDBA2D",
    defaultVariant:"sacas",
    variants:{
      sacas:   { label:"Sacas por alqueire", tipo:"sacas", sacasAlq:2.5, tamanhoSaco:60000 },
      semente: { label:"Plantas por metro",  tipo:"semente", plantas:3.3, transpasse:8, espacamentos:["0.40","0.42","0.45","0.50","0.80","0.90"], embalagens:[["Embalagem 60.000", 60000]] },
    },
  },
  feijao: {
    nome:"Feijão", icon:"feijao", accent:"#C42A2E", accentLight:"#FF7276",
    tipo:"semente", plantas:13, transpasse:8,
    embalagens:[["Embalagem 140.000", 140000]],
  },
  trigo: {
    nome:"Trigo", icon:"trigo", accent:"#0678A8", accentLight:"#4FB6E8",
    defaultVariant:"dose",
    variants:{
      dose:    { label:"Dose (kg/ha)", tipo:"dose", showDoseHa:true, dose:70, embalagens:[["Sacas de 40 kg", 40], ["Bag (TON) 1.000 kg", 1000]] },
      semente: { label:"Plantas por metro linear", tipo:"semente", plantas:60, transpasse:5, espacamentos:["0.17"], embalagensViaPMS:[["Sacas de 40 kg", 40], ["Bag (TON) 1.000 kg", 1000]] },
    },
  },
  adubacao: {
    nome:"Adubação/Ureia", icon:"adubacao", accent:"#8C6D46", accentLight:"#D2A97A",
    tipo:"dose", showDoseHa:false, dose:250,
    embalagens:[["Sacas de 50 kg", 50]],
  },
};

// TODO: confirmar faixas oficiais com o setor agronômico — abaixo é só um
// ponto de partida (±20% do valor sugerido em CROPS[cultura].plantas), exceto
// soja, que já veio validada como exemplo do produto (8 a 16 plantas/m).
const FAIXA_USUAL_PLANTAS = {
  soja:   { min: 8,   max: 16 },
  feijao: { min: 10,  max: 16 },
  milho:  { min: 2.6, max: 4  }, // variante "semente" (sugerido: 3,3 plantas/m)
  trigo:  { min: 48,  max: 72 }, // variante "semente" (sugerido: 60 plantas/m)
};

// fórmulas puras (sem DOM) moram em calculos.js, carregado antes deste arquivo — ver ali
// para as implementações e o motivo da separação (testes automatizados com Vitest)
const {
  ALQ_HA, alqParaHa, haParaAlq, normalizarAreaParaAlqueires,
  calcularSementes, calcularSacas, calcularDose, calcularDosePMS,
  montarCombo, bagSizeFromNpk, calcularCusto, formatarPrecoResumo, precisaAlertarPrazoAusente,
  converterKMgParaCmolc, calcularIndicesSolo, calcularCalagem, determinarTipoCalcario,
  verificarNecessidadeGessagem, calcularGessagem, nutrientesGesso,
  calcularConcentracaoTotalNutrientes, calcularCustoPorKgNutriente, identificarMelhorCustoBeneficio,
  montarTextoWhatsApp, montarTextoWhatsAppRegulagem, montarTextoWhatsAppCalagem,
} = Calculos;

// Unidade em que o campo "Área" é exibido/digitado — fixa em alqueires em todas
// as culturas. A unidade canônica usada internamente em todas as fórmulas também
// é sempre alqueires (ver normalizarAreaParaAlqueires em calculos.js).
const areaUnit = "alq";

const $ = id => document.getElementById(id);

$("footerVersion").textContent = "v" + APP_VERSION;

// nomes comerciais comuns que não trazem o NPK escrito no rótulo, mas têm formulação padrão conhecida
const FORMULACOES_NOMEADAS = [
  [/cloreto de potassio/, [0, 0, 60]],
  [/sulfato de amoni[oa]/, [20, 0, 0]],
  [/superfosfato simples|super simples/, [0, 18, 0]],
];

// "10.15.15 EVOLUTION", "04-14-08", "MAP 11-52-00": pega os três números do NPK de dentro do texto
// também reconhece nomes comerciais sem número (ex.: "Cloreto de Potássio") via FORMULACOES_NOMEADAS
function lerFormulacao(texto){
  const norm = String(texto || "").normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "").toLowerCase();
  for(const [regex, npk] of FORMULACOES_NOMEADAS){
    if(regex.test(norm)) return npk;
  }
  const m = norm.match(/(\d{1,2})\s*[.,\-\/ ]\s*(\d{1,2})\s*[.,\-\/ ]\s*(\d{1,2})/);
  if(!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

// preenche os campos N, P e K a partir da formulação digitada (só na adubação/ureia)
function aplicarFormulacao(){
  if(currentCrop !== "adubacao") return false;
  const eraAutoDetectada = !$("npkAuto").classList.contains("hidden");
  const npk = lerFormulacao($("cultivar").value);
  $("npkAuto").classList.toggle("hidden", !npk);
  if(!npk){
    // a formulação que tinha preenchido o NPK foi apagada/mudou: zera em vez de deixar o valor antigo
    // (se o NPK nunca veio de uma formulação lida — ex.: valor padrão do ureia — não mexe)
    if(!eraAutoDetectada) return false;
    const mudou = Number($("npkN").value) !== 0 || Number($("npkP").value) !== 0 || Number($("npkK").value) !== 0;
    $("npkN").value = 0;
    $("npkP").value = 0;
    $("npkK").value = 0;
    return mudou;
  }
  const [n, p, k] = npk;
  const mudou = Number($("npkN").value) !== n || Number($("npkP").value) !== p || Number($("npkK").value) !== k;
  $("npkN").value = n;
  $("npkP").value = p;
  $("npkK").value = k;
  return mudou;
}

// Na adubação/ureia o produtor raciocina em sacas por alqueire; o bag entra só na hora da compra
function getSacaAduboSize(){
  const emb = (CROPS.adubacao.embalagens || [])[0];
  return (emb && emb[1]) || 50;
}

function getBagSize(){
  const npkN = parseFloat($("npkN").value) || 0;
  const npkP = parseFloat($("npkP").value) || 0;
  const npkK = parseFloat($("npkK").value) || 0;
  return bagSizeFromNpk(npkN, npkP, npkK);
}

let currentCrop = "soja";
const cropVariant = {}; // guarda a variante escolhida por cultura (ex.: milho -> 'sacas')

const tabs = document.querySelectorAll(".tab-btn");

// Seletor personalizado: troca a lista nativa do <select> (impossível de
// estilizar de verdade em todo navegador — no iPhone vira sempre uma rodinha
// do sistema) por uma lista HTML nossa, com a cara do resto do app. O
// <select> original some visualmente mas continua no DOM guardando o valor
// de verdade, então o resto do código (calc(), fórmulas, estado por
// cultura...) não precisa saber que ele foi trocado: continua lendo/gravando
// ".value" e escutando "change" normalmente.
function enhanceSelect(selectEl){
  const wrap = document.createElement("div");
  wrap.className = "csel";
  selectEl.parentNode.insertBefore(wrap, selectEl);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "csel-trigger " + selectEl.className;
  btn.setAttribute("aria-haspopup", "listbox");
  btn.setAttribute("aria-expanded", "false");
  const labelSpan = document.createElement("span");
  labelSpan.className = "csel-label";
  btn.appendChild(labelSpan);

  const list = document.createElement("ul");
  list.setAttribute("role", "listbox");
  list.tabIndex = -1;
  list.id = (selectEl.id || ("csel" + Math.random().toString(36).slice(2))) + "-list";

  // Popover API (Chrome/Edge 114+, Firefox 125+, Safari 17+): a lista renderiza
  // na top layer do navegador, escapando de qualquer ancestral com overflow
  // clipado sem precisar reposicioná-la a cada scroll nem movê-la pro <body>
  // manualmente — o próprio navegador cuida do "fixed" e do estado inicial
  // oculto. Onde não há suporte, cai pro fallback abaixo (portar a lista pro
  // <body> só enquanto aberta, controlado pela classe .hidden — comportamento
  // que já existia antes desta função ganhar suporte a Popover).
  const supportsPopover = typeof HTMLElement !== "undefined" && "popover" in HTMLElement.prototype;
  if(supportsPopover){
    list.className = "csel-list";
    list.popover = "manual";
  } else {
    list.className = "csel-list hidden";
  }

  selectEl.classList.add("csel-native");
  selectEl.tabIndex = -1;
  wrap.appendChild(btn);
  wrap.appendChild(list);
  wrap.appendChild(selectEl);

  let activeIndex = -1;

  function render(){
    const opts = Array.from(selectEl.options);
    list.innerHTML = "";
    opts.forEach((opt, i) => {
      const li = document.createElement("li");
      const selecionada = opt.value === selectEl.value;
      li.id = list.id + "-opt-" + i;
      li.className = "csel-option" + (selecionada ? " is-selected" : "");
      li.textContent = opt.textContent;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", selecionada ? "true" : "false");
      li.addEventListener("click", () => {
        selectEl.value = opt.value;
        selectEl.dispatchEvent(new Event("change", { bubbles: true }));
        close();
        btn.focus();
      });
      list.appendChild(li);
    });
    const atual = opts.find((o) => o.value === selectEl.value);
    labelSpan.textContent = atual ? atual.textContent : "";
  }

  function updateActive(){
    Array.from(list.children).forEach((li, i) => li.classList.toggle("is-active", i === activeIndex));
    const activeLi = list.children[activeIndex];
    if(activeLi) activeLi.scrollIntoView({ block: "nearest" });
    // aria-activedescendant no elemento com foco real (o botão — a lista
    // nunca recebe foco de verdade) descreve pro leitor de tela qual opção
    // está ativa sem precisar mover o foco pra dentro do <ul>.
    if(activeLi) btn.setAttribute("aria-activedescendant", activeLi.id);
    else btn.removeAttribute("aria-activedescendant");
  }
  function positionList(){
    const rect = btn.getBoundingClientRect();
    const minW = Math.min(window.innerWidth - 16, Math.max(rect.width, 280));
    list.style.width = minW + "px";
    const leftPos = Math.min(Math.max(8, rect.left), window.innerWidth - minW - 8);
    list.style.left = leftPos + "px";
    const espacoAbaixo = window.innerHeight - rect.bottom;
    const abrePraCima = espacoAbaixo < list.offsetHeight + 6 && rect.top > list.offsetHeight + 6;
    list.style.top = abrePraCima ? (rect.top - list.offsetHeight - 6) + "px" : (rect.bottom + 6) + "px";
  }
  function isOpen(){
    return supportsPopover ? list.matches(":popover-open") : !list.classList.contains("hidden");
  }
  // Fecha a lista na primeira rolagem detectada, em vez de perseguir o botão
  // pela tela a cada evento de scroll: um listener contínuo de scroll aqui
  // forçava getBoundingClientRect() (reflow síncrono) em toda rolagem,
  // travando o scroll no celular. { once:true } já remove o próprio listener
  // sozinho; close() também remove por segurança, caso a lista já tenha sido
  // fechada por outro caminho (Escape, clique fora, seleção de item) antes.
  function closeOnScroll(){ close(); }
  function open(){
    if(supportsPopover){
      list.showPopover();
    } else {
      document.body.appendChild(list);
      list.style.position = "fixed";
      list.style.right = "auto";
      list.classList.remove("hidden");
    }
    positionList();
    btn.setAttribute("aria-expanded", "true");
    wrap.classList.add("is-open");
    const selecionada = list.querySelector(".is-selected");
    activeIndex = selecionada ? Array.from(list.children).indexOf(selecionada) : 0;
    updateActive();
    document.addEventListener("click", onOutsideClick);
    window.addEventListener("scroll", closeOnScroll, { capture: true, once: true, passive: true });
    window.addEventListener("resize", positionList);
  }
  function close(){
    if(!isOpen()) return;
    if(supportsPopover){
      list.hidePopover();
    } else {
      list.classList.add("hidden");
      wrap.appendChild(list);
      list.style.position = "";
      list.style.right = "";
    }
    list.style.left = "";
    list.style.top = "";
    list.style.width = "";
    btn.setAttribute("aria-expanded", "false");
    btn.removeAttribute("aria-activedescendant");
    wrap.classList.remove("is-open");
    document.removeEventListener("click", onOutsideClick);
    window.removeEventListener("scroll", closeOnScroll, true);
    window.removeEventListener("resize", positionList);
  }
  function onOutsideClick(e){
    if(!wrap.contains(e.target)) close();
  }

  btn.addEventListener("click", () => {
    if(isOpen()) close(); else open();
  });
  btn.addEventListener("keydown", (e) => {
    const opts = Array.from(list.children);
    if(!isOpen()){
      if(["ArrowDown","ArrowUp","Enter"," "].includes(e.key)){ e.preventDefault(); open(); }
      return;
    }
    if(e.key === "ArrowDown"){ e.preventDefault(); activeIndex = Math.min(activeIndex+1, opts.length-1); updateActive(); }
    else if(e.key === "ArrowUp"){ e.preventDefault(); activeIndex = Math.max(activeIndex-1, 0); updateActive(); }
    else if(e.key === "Enter" || e.key === " "){ e.preventDefault(); const li = opts[activeIndex]; if(li) li.click(); }
    else if(e.key === "Escape"){ close(); btn.focus(); }
    else if(e.key === "Tab"){ close(); }
  });

  // ".value = x" e "appendChild(...)" continuam existindo no resto do
  // código (montar as opções, restaurar valor salvo por cultura etc.) — só
  // interceptamos os dois pra re-renderizar a lista bonita automaticamente,
  // sem precisar tocar em nenhuma outra função do app.
  const nativeValueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  Object.defineProperty(selectEl, "value", {
    get(){ return nativeValueDesc.get.call(selectEl); },
    set(v){ nativeValueDesc.set.call(selectEl, v); render(); },
    configurable: true,
  });
  const originalAppendChild = selectEl.appendChild.bind(selectEl);
  selectEl.appendChild = (child) => { const r = originalAppendChild(child); render(); return r; };

  render();
}

// build transpasse dropdown 5-10%
const transSel = $("transpasse");
for(let t=5;t<=10;t++){
  const o=document.createElement("option");
  o.value=t; o.textContent=t+"%";
  transSel.appendChild(o);
}
enhanceSelect(transSel);
enhanceSelect($("espacamento"));

// ---------- Busca/sugestão de cultivar (soja, milho, feijão, trigo) ----------
// Catálogo em js/cultivares.js — ainda vazio, então a lista nunca aparece
// hoje; o campo continua um texto livre normal, pronto pra quando os dados
// forem cadastrados. Não se aplica à adubação: lá o campo é a formulação NPK
// (aplicarFormulacao() já cuida disso, sem nenhuma relação com este código).
// A lista de sugestões abre "flutuando" fixa na tela (portada pro <body>),
// mesmo esquema do seletor de espaçamento/transpasse — assim não vira scroll
// da coluna quando abre perto da borda inferior.
const cultivarInput = $("cultivar");
const cultivarList = $("cultivarSuggestList");
const cultivarPmsHint = $("cultivarPmsHint");
const cultivarWrapOriginal = cultivarList.parentNode;
let cultivarActiveIndex = -1;

// Mesmo suporte a Popover API do enhanceSelect() acima (ver comentário lá):
// quando disponível, a lista renderiza na top layer sem precisar ser movida
// pro <body> nem reposicionada a cada scroll.
const cultivarSupportsPopover = typeof HTMLElement !== "undefined" && "popover" in HTMLElement.prototype;
if(cultivarSupportsPopover){
  cultivarList.classList.remove("hidden");
  cultivarList.popover = "manual";
}

function cultivarCatalogo(){
  return currentCrop !== "adubacao" ? (CULTIVARES[currentCrop] || []) : [];
}

function posicionarCultivarList(){
  const rect = cultivarInput.getBoundingClientRect();
  cultivarList.style.left = rect.left + "px";
  cultivarList.style.width = rect.width + "px";
  cultivarList.style.top = (rect.bottom + 6) + "px";
}

function cultivarListaAberta(){
  return cultivarSupportsPopover ? cultivarList.matches(":popover-open") : !cultivarList.classList.contains("hidden");
}
// Mesma lógica de enhanceSelect(): fecha na primeira rolagem detectada em vez
// de perseguir o campo pela tela a cada evento de scroll (reflow síncrono).
function fecharCultivarListOnScroll(){ fecharCultivarList(); }
function fecharCultivarList(){
  if(!cultivarListaAberta()){ cultivarActiveIndex = -1; return; }
  if(cultivarSupportsPopover){
    cultivarList.hidePopover();
  } else {
    cultivarList.classList.add("hidden");
    cultivarWrapOriginal.appendChild(cultivarList);
    cultivarList.style.position = "";
  }
  cultivarActiveIndex = -1;
  cultivarInput.setAttribute("aria-expanded", "false");
  cultivarInput.removeAttribute("aria-activedescendant");
  cultivarList.style.left = "";
  cultivarList.style.top = "";
  cultivarList.style.width = "";
  window.removeEventListener("scroll", fecharCultivarListOnScroll, true);
  window.removeEventListener("resize", posicionarCultivarList);
  document.removeEventListener("click", onCultivarOutsideClick);
}
function onCultivarOutsideClick(e){
  if(!cultivarInput.contains(e.target) && !cultivarList.contains(e.target)) fecharCultivarList();
}
function atualizarCultivarAtivo(opts){
  opts.forEach((li, i) => {
    const ativo = i === cultivarActiveIndex;
    li.classList.toggle("is-active", ativo);
    li.setAttribute("aria-selected", ativo ? "true" : "false");
  });
  const ativo = opts[cultivarActiveIndex];
  if(ativo){
    ativo.scrollIntoView({ block: "nearest" });
    cultivarInput.setAttribute("aria-activedescendant", ativo.id);
  } else {
    cultivarInput.removeAttribute("aria-activedescendant");
  }
}
function selecionarCultivar(item){
  cultivarInput.value = item.nome;
  fecharCultivarList();
  mostrarPmsCultivar(item);
  calc();
}
// PMS/PMG só aparece quando o texto digitado bate exatamente com um item do
// catálogo que tenha esse dado — não é obrigatório escolher da lista.
function mostrarPmsCultivar(item){
  if(item && item.pms){
    cultivarPmsHint.textContent = `PMS/PMG: ${fmtLivre(item.pms)} g (preenchido automaticamente)`;
    show(cultivarPmsHint, true);
  } else {
    show(cultivarPmsHint, false);
  }
}
function renderCultivarSugestoes(){
  const termo = cultivarInput.value.trim().toLowerCase();
  const catalogo = cultivarCatalogo();
  const bateram = termo ? catalogo.filter(item => item.nome.toLowerCase().includes(termo)) : [];
  if(bateram.length === 0){ fecharCultivarList(); return; }

  cultivarList.innerHTML = "";
  bateram.forEach((item, i) => {
    const li = document.createElement("li");
    const ativo = i === cultivarActiveIndex;
    li.id = "cultivarSuggestList-opt-" + i;
    li.className = "csel-option" + (ativo ? " is-active" : "");
    li.textContent = item.nome;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", ativo ? "true" : "false");
    li.addEventListener("click", () => selecionarCultivar(item));
    cultivarList.appendChild(li);
  });

  if(cultivarSupportsPopover){
    if(!cultivarList.matches(":popover-open")) cultivarList.showPopover();
  } else {
    document.body.appendChild(cultivarList);
    cultivarList.style.position = "fixed";
    cultivarList.classList.remove("hidden");
  }
  cultivarInput.setAttribute("aria-expanded", "true");
  posicionarCultivarList();
  const ativo = cultivarList.children[cultivarActiveIndex];
  cultivarInput.setAttribute("aria-activedescendant", ativo ? ativo.id : "");
  window.addEventListener("scroll", fecharCultivarListOnScroll, { capture: true, once: true, passive: true });
  window.addEventListener("resize", posicionarCultivarList);
  document.addEventListener("click", onCultivarOutsideClick);
}
cultivarInput.addEventListener("input", () => {
  if(currentCrop === "adubacao") return; // aqui o campo é a formulação NPK, sem busca
  cultivarActiveIndex = -1;
  renderCultivarSugestoes();
  const exato = cultivarCatalogo().find(i => i.nome.toLowerCase() === cultivarInput.value.trim().toLowerCase());
  mostrarPmsCultivar(exato);
});
cultivarInput.addEventListener("keydown", (e) => {
  if(!cultivarListaAberta()) return;
  const opts = Array.from(cultivarList.children);
  if(e.key === "ArrowDown"){ e.preventDefault(); cultivarActiveIndex = Math.min(cultivarActiveIndex + 1, opts.length - 1); atualizarCultivarAtivo(opts); }
  else if(e.key === "ArrowUp"){ e.preventDefault(); cultivarActiveIndex = Math.max(cultivarActiveIndex - 1, 0); atualizarCultivarAtivo(opts); }
  else if(e.key === "Enter"){ if(cultivarActiveIndex >= 0){ e.preventDefault(); opts[cultivarActiveIndex].click(); } }
  else if(e.key === "Escape"){ fecharCultivarList(); }
  else if(e.key === "Tab"){ fecharCultivarList(); }
});

// espaçamentos padrão; cada cultura pode ter a própria lista (ex.: trigo só 0,17)
const ESPACAMENTOS_PADRAO = ["0.40","0.42","0.45","0.50"];
function preencherEspacamentos(lista){
  const sel = $("espacamento");
  sel.innerHTML = "";
  lista.forEach(v => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = parseFloat(v).toLocaleString("pt-BR", {minimumFractionDigits:2});
    sel.appendChild(o);
  });
}

function fmtInt(n){
  if(!isFinite(n)) return "0";
  return Math.round(n).toLocaleString("pt-BR");
}
function fmtDec(n){
  if(!isFinite(n)) return "0,00";
  return n.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
}
function fmtMoeda(n){
  if(!isFinite(n)) n = 0;
  return "R$ " + n.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
}

// ---------- Área: leitura/escrita do campo #area na unidade de exibição atual ----------
// O campo mostra alqueires ou hectares conforme `areaUnit`, mas todo o resto do app
// (calc(), custos, comparador, ficha exportada) trabalha só com o valor canônico em
// alqueires — essas funções são a única ponte entre as duas representações.
function areaAlqDoInput(){
  return normalizarAreaParaAlqueires($("area").value, areaUnit);
}
// Reescreve o valor exibido no campo a partir de uma área canônica (alqueires),
// convertendo para a unidade selecionada no momento. Usado ao trocar de unidade e
// ao restaurar a área salva de uma cultura.
function formatarAreaInput(areaAlq){
  if(!areaAlq){ $("area").value = ""; return; }
  const valorExibido = areaUnit === "ha" ? alqParaHa(areaAlq) : areaAlq;
  $("area").value = Math.round(valorExibido * 10000) / 10000; // 4 casas evitam ruído de ponto flutuante sem cortar precisão útil
}
// Hint abaixo do campo: sempre mostra a equivalência na OUTRA unidade.
function atualizarAreaHint(areaAlq){
  $("areaHaHint").textContent = areaUnit === "ha"
    ? fmtDec(areaAlq) + " alq"
    : fmtDec(alqParaHa(areaAlq)) + " ha";
}
// Texto "10,00 alqueires" / "24,20 ha" na unidade de exibição atual — usado na memória de cálculo.
function fmtAreaComUnidade(areaAlq){
  return areaUnit === "ha" ? fmtDec(alqParaHa(areaAlq)) + " ha" : fmtDec(areaAlq) + " alqueires";
}
// "10,00 alq (24,20 ha)" / "24,20 ha (10,00 alq)" — usado na ficha exportada (PDF/PNG),
// sempre com as duas unidades para não depender de qual estava selecionada na hora da geração.
function fmtAreaRelatorio(areaAlq){
  if(!areaAlq) return "—";
  const alq = fmtDec(areaAlq) + " alq", ha = fmtDec(alqParaHa(areaAlq)) + " ha";
  return areaUnit === "ha" ? `${ha} (${alq})` : `${alq} (${ha})`;
}
// número "solto" (sem casas fixas) pra faixas e sugestões: 8 -> "8", 2.6 -> "2,6"
function fmtLivre(n){
  if(!isFinite(n)) return "0";
  return n.toLocaleString("pt-BR", {maximumFractionDigits:1});
}
const show = (el, on) => el.classList.toggle("hidden", !on);

function getConfig(crop){
  const base = CROPS[crop];
  if(base.variants){
    const v = cropVariant[crop] || base.defaultVariant;
    return {...base, ...base.variants[v], _variantKey:v};
  }
  return base;
}

// valor típico da cultura vira só sugestão no campo — nada entra na conta sem ser digitado
function usual(valor){
  return valor ? ` <span class="font-semibold normal-case tracking-normal opacity-70">· usual ${String(valor).replace(".", ",")}</span>` : "";
}
function setRotulo(id, texto, valor){
  $(id).innerHTML = texto + usual(valor);
}

// Germinação/pureza chegam pré-preenchidas com o valor típico (90/98): o campo
// fica com aparência de "sugestão, ainda não confirmada" (borda tracejada) até
// o usuário digitar algo nele — a partir daí some, mesmo que troque de cultura
// e volte. Guardado por "cultura:campo" porque os dois inputs são reaproveitados
// entre as culturas (cada uma pode ter ou não seu próprio valor já confirmado).
const CAMPOS_COM_SUGESTAO = ["germinacao", "pureza"];
const touchedFields = new Set();
function fieldTouchKey(crop, id){ return crop + ":" + id; }
CAMPOS_COM_SUGESTAO.forEach(id => {
  $(id).addEventListener("input", () => {
    touchedFields.add(fieldTouchKey(currentCrop, id));
    $(id).classList.remove("is-suggested");
  });
});
function marcarSugestao(id, crop){
  $(id).classList.toggle("is-suggested", !touchedFields.has(fieldTouchKey(crop, id)));
}

function renderVariantToggle(crop){
  const base = CROPS[crop];
  const box = $("variantToggle");
  if(!base.variants){
    box.classList.add("hidden");
    box.classList.remove("flex");
    box.innerHTML = "";
    return;
  }
  const current = cropVariant[crop] || base.defaultVariant;
  box.innerHTML = "";
  Object.entries(base.variants).forEach(([key, v]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "variant-btn flex-1 rounded-lg px-3 py-2.5 text-[12.5px] font-bold text-muted" + (key === current ? " is-active" : "");
    btn.setAttribute("aria-pressed", key === current ? "true" : "false");
    btn.textContent = v.label;
    btn.addEventListener("click", () => {
      cropVariant[crop] = key;
      selectCrop(crop);
    });
    box.appendChild(btn);
  });
  box.classList.remove("hidden");
  box.classList.add("flex");
}

const STATE_FIELD_IDS = ["cultivar","area","plantas","espacamento","transpasse","sacasAlq","doseHa","doseAlq","sacasAlqAdubo","npkN","npkP","npkK","pms","popDesejada","germinacao","pureza"];
const cropState = {}; // guarda os valores digitados em cada cultura, pra não se perderem ao trocar de aba

function captureState(crop){
  if(!crop) return;
  const snap = { variant: cropVariant[crop] };
  STATE_FIELD_IDS.forEach(id => { snap[id] = $(id).value; });
  snap.area = areaAlqDoInput(); // guardado sempre em alqueires (canônico), independente da unidade exibida no momento
  cropState[crop] = snap;
}

function selectCrop(crop){
  const mesmaCultura = currentCrop === crop;
  const cultivarAtual = $("cultivar").value;
  if(currentCrop && currentCrop !== crop) captureState(currentCrop);
  currentCrop = crop;
  tabs.forEach(t => {
    const on = t.dataset.crop === crop;
    t.classList.toggle("is-active", on);
    t.setAttribute("aria-selected", on ? "true" : "false");
  });

  const saved = cropState[crop];
  if(saved && saved.variant) cropVariant[crop] = saved.variant;
  const c = getConfig(crop);
  applyAccentVars(c.accent, c.accentLight);
  $("cropIcon").innerHTML = iconSvg(c.icon, "icon-inline");
  $("cropLabelText").textContent = "Total — " + c.nome;
  $("custosCropNome").textContent = "· " + c.nome;
  $("prazoData").value = custoPrazoData[crop] || "";
  $("cultivar").value = (saved && saved.cultivar) ? saved.cultivar : (mesmaCultura ? cultivarAtual : "");
  formatarAreaInput((saved && saved.area !== undefined) ? parseFloat(saved.area) || 0 : 0);
  const ehAdubo = crop === "adubacao";
  show($("comparadorSection"), ehAdubo);
  $("cultivarLabel").textContent = ehAdubo ? "Formulação cotada" : "Cultivar cotada";
  $("cultivar").placeholder = ehAdubo ? "Ex.: 04-14-08 ou Ureia" : "Ex.: BRS 404";
  fecharCultivarList();
  mostrarPmsCultivar(ehAdubo ? null : cultivarCatalogo().find(i => i.nome.toLowerCase() === $("cultivar").value.trim().toLowerCase()));
  renderVariantToggle(crop);

  const val = (id, fallback) => (saved && saved[id] !== undefined && saved[id] !== "") ? saved[id] : fallback;

  show($("npkBox"), false);
  show($("pmsBox"), false);
  show($("plantasField"), false);
  show($("seedFields"), false);
  show($("doseFields"), false);
  show($("sacasFields"), false);
  show($("sacasAlqAdubField"), false);

  if(c.tipo === "semente"){
    show($("plantasField"), true);
    show($("seedFields"), true);
    $("paramsTitle").textContent = "Parâmetros do plantio";
    $("plantas").value = val("plantas", "");
    $("plantas").placeholder = "0";
    setRotulo("plantasLabel", "Plantas por metro"); // sem sugestão: o rótulo quebrava linha na coluna estreita
    // sugestão só de apoio visual, embaixo do campo — não preenche nada sozinha
    $("plantasSuggestionHint").textContent = `Sugerido para ${c.nome}: ${fmtLivre(c.plantas)} plantas/m`;
    const espacamentos = c.espacamentos || ESPACAMENTOS_PADRAO;
    preencherEspacamentos(espacamentos);
    const espSalvado = val("espacamento", "");
    // se o valor salvo não existe mais na lista da cultura, cai no padrão dela
    $("espacamento").value = espacamentos.includes(espSalvado)
      ? espSalvado
      : (espacamentos.includes("0.45") ? "0.45" : espacamentos[0]);
    transSel.value = val("transpasse", c.transpasse);
    $("pms").value = val("pms", "35");
    $("popDesejada").value = val("popDesejada", "300");
    $("germinacao").value = val("germinacao", "90");
    $("pureza").value = val("pureza", "98");
    marcarSugestao("germinacao", crop);
    marcarSugestao("pureza", crop);
    $("unitLabel").textContent = "sementes";
    $("totalCaption").textContent = "necessário para toda a área informada";
    $("formulaHint").textContent = "1 alqueire = 24.200 m² (padrão paulista) · fórmula: (24.200 × área ÷ espaçamento) × plantas/m ÷ ((100 − transpasse) ÷ 100)";
    if(crop === "trigo") show($("pmsBox"), true); // PMS ajuda a converter sementes -> kg no trigo
  } else if(c.tipo === "sacas"){
    show($("sacasFields"), true);
    $("paramsTitle").textContent = "Parâmetros do plantio";
    $("sacasAlq").value = val("sacasAlq", "");
    $("sacasAlq").placeholder = "0";
    setRotulo("sacasAlqLabel", "Sacas por alqueire", c.sacasAlq);
    $("unitLabel").textContent = "sacas";
    $("totalCaption").textContent = "necessário para toda a área informada";
    $("formulaHint").textContent = `fórmula: Total (sacas) = Área (alqueires) × Sacas por alqueire · 1 saca = ${c.tamanhoSaco.toLocaleString("pt-BR")} sementes`;
  } else {
    show($("doseFields"), true);
    show($("doseHaField"), !!c.showDoseHa);
    $("paramsTitle").textContent = "Dose aplicada";
    $("unitLabel").textContent = "kg";
    $("totalCaption").textContent = "necessário para toda a área informada";

    if(c.showDoseHa){
      const doseHaVal = val("doseHa", "");
      $("doseHa").value = doseHaVal;
      $("doseHa").placeholder = "0";
      setRotulo("doseHaLabel", "Dose (kg/ha)", c.dose);
      $("doseAlq").value = val("doseAlq", doseHaVal === "" ? "" : (parseFloat(doseHaVal) * ALQ_HA).toFixed(2));
      $("doseAlq").placeholder = "0";
      $("doseAlqLabel").textContent = "Dose (kg/alqueire)";
      $("formulaHint").textContent = "1 alqueire = 2,42 ha (padrão paulista) · dose por ha e por alqueire ficam sincronizadas · Total (kg) = Área (alqueires) × Dose (kg/alqueire)";
      $("pms").value = val("pms", "35");
      $("popDesejada").value = val("popDesejada", "300");
      $("germinacao").value = val("germinacao", "90");
      $("pureza").value = val("pureza", "98");
      marcarSugestao("germinacao", crop);
      marcarSugestao("pureza", crop);
      if(crop === "trigo") show($("pmsBox"), true);
    } else {
      $("npkN").value = val("npkN", "45");
      $("npkP").value = val("npkP", "0");
      $("npkK").value = val("npkK", "0");
      $("doseAlq").value = val("doseAlq", "");
      $("doseAlq").placeholder = "0";
      setRotulo("doseAlqLabel", "Dose (kg/alqueire)", c.dose);
      $("formulaHint").textContent = "fórmula: Total (kg) = Área (alqueires) × Dose (kg/alqueire)";
      show($("npkBox"), true);
      if(crop === "adubacao"){
        aplicarFormulacao(); // a formulação cotada manda no NPK
        show($("sacasAlqAdubField"), true);
        const doseAdubo = parseFloat($("doseAlq").value);
        $("sacasAlqAdubo").value = val("sacasAlqAdubo", doseAdubo > 0 ? (doseAdubo / getSacaAduboSize()).toFixed(2) : "");
        $("sacasAlqAdubo").placeholder = "0";
        setRotulo("sacasAlqAduboLabel", "Sacas por alqueire", (c.dose / getSacaAduboSize()).toFixed(2));
      }
    }
  }
  calcPMS();
  calc();
}

// cores derivadas do accent da cultura (fundo suave e borda da caixa de totais)
function hexToRgba(hex, alpha){
  const h = hex.replace("#","");
  const r = parseInt(h.substring(0,2),16), g = parseInt(h.substring(2,4),16), b = parseInt(h.substring(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function hexToSoft(hex){
  return hexToRgba(hex, 0.10);
}
function hexToSurface(hex){
  return hexToRgba(hex, 0.05);
}
// Design tokens dinâmicos por cultura (ver :root em styles.css): centraliza
// aqui a atualização das 5 CSS custom properties de accent, chamada tanto por
// selectCrop() quanto pelo botão de Calagem & Gessagem em setView() — evita
// os dois lugares divergirem entre si.
function applyAccentVars(hex, hoverHex){
  const root = document.documentElement.style;
  root.setProperty("--accent", hex);
  root.setProperty("--accent-soft", hexToSoft(hex));
  root.setProperty("--accent-surface", hexToSurface(hex));
  root.setProperty("--accent-border", hexToRgba(hex, .30));
  root.setProperty("--accent-hover", hoverHex || hex);
}

function calc(){
  const c = getConfig(currentCrop);
  const area = areaAlqDoInput(); // sempre em alqueires (canônico), qualquer que seja a unidade exibida no campo
  atualizarAreaHint(area);
  let total = 0;

  // valores dos passos de cada ramo, guardados para alimentar a memória de cálculo mais abaixo
  const mem = { plantas: 0, espacamento: 0, transpasse: 0, sacasAlq: 0, doseAlq: 0, kgTrigo: 0 };

  if(c.tipo === "semente"){
    const plantas = parseFloat($("plantas").value) || 0;
    const espacamento = parseFloat($("espacamento").value) || 0.45;
    const transpasse = parseFloat(transSel.value) || 0;
    total = calcularSementes({ area, plantas, espacamento, transpasse });
    mem.plantas = plantas; mem.espacamento = espacamento; mem.transpasse = transpasse;
    // população final (stand): não leva o transpasse em conta, pois ele é perda de semente
    // na sobreposição das passadas, não altera quantas plantas de fato nascem por área
    const popFinalHa = espacamento > 0 ? plantas * (10000 / espacamento) : 0;
    const popFinalAlq = popFinalHa * ALQ_HA;
    $("popFinalHa").textContent = fmtInt(popFinalHa);
    $("popFinalAlq").textContent = fmtInt(popFinalAlq);
  } else if(c.tipo === "sacas"){
    const sacasAlq = parseFloat($("sacasAlq").value) || 0;
    total = calcularSacas({ area, sacasAlq });
    mem.sacasAlq = sacasAlq;
  } else {
    const doseAlq = parseFloat($("doseAlq").value) || 0;
    total = calcularDose({ area, doseAlq });
    mem.doseAlq = doseAlq;
  }

  $("totalValue").textContent = c.tipo === "semente" ? fmtInt(total) : fmtDec(total);
  // cliente e cultivar identificam a cotação: aparecem juntos no resultado e no bloco de custos
  const cliente = $("cliente").value.trim();
  const cultivar = $("cultivar").value.trim();
  const identificacao = [cliente, cultivar].filter(Boolean).join(" · ");
  $("clienteEcho").textContent = identificacao;
  $("clienteEcho").classList.toggle("hidden", !identificacao);
  $("custosCropNome").textContent = "· " + c.nome + (cultivar ? " · " + cultivar : "");

  const wrap = $("packsWrap");
  wrap.innerHTML = "";

  function addPack(label, value, roundedNote){
    const div = document.createElement("div");
    div.className = "rounded-xl border border-ink/[.08] bg-white/80 px-3 py-2.5 lg:py-2";
    div.innerHTML =
      `<div class="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted"><span aria-hidden="true">📦</span>${label}</div>` +
      `<div class="pack-value mt-0.5 font-mono tabular-nums text-ink">${value}</div>` +
      (roundedNote ? `<div class="mt-0.5 text-[10.5px] text-muted">${roundedNote}</div>` : "");
    wrap.appendChild(div);
  }

  // opções de compra da cultura: sacaria e bag entram aqui e alimentam o bloco de custos
  const unidades = [];
  let baseTotal = total; // total na unidade base (sementes ou kg); no trigo por PMS vira kg

  if(c.tipo === "sacas"){
    const sementesEquiv = total * c.tamanhoSaco;
    addPack("Sementes equivalentes", fmtInt(sementesEquiv), `${c.tamanhoSaco.toLocaleString("pt-BR")} sementes/saca`);
    addPack("Sacas arredondadas", Math.ceil(total).toLocaleString("pt-BR"), "para compra fechada");
    unidades.push({ label:`Saca de ${c.tamanhoSaco.toLocaleString("pt-BR")} sementes`, qty: total, size: 1 });
  } else if(currentCrop === "trigo" && c.tipo === "semente"){
    // Plantas/m linear no trigo: usa o PMS (peso de mil sementes) para converter sementes -> kg -> sacas
    const pms = parseFloat($("pms").value) || 0;
    const kg = total * pms / 1000000;
    mem.kgTrigo = kg;
    addPack("Peso estimado", fmtDec(kg) + " kg", "via PMS informado acima");
    (c.embalagensViaPMS || []).forEach(([label, tamanho]) => {
      const exato = kg / tamanho;
      addPack(label, fmtDec(exato), `→ ${Math.ceil(exato).toLocaleString("pt-BR")} un. arredondado`);
      unidades.push({ label, qty: exato, size: tamanho });
    });
    baseTotal = kg;
  } else if(c.embalagens){
    c.embalagens.forEach(([label, tamanho]) => {
      const exato = total / tamanho;
      addPack(label, fmtDec(exato), `→ ${Math.ceil(exato).toLocaleString("pt-BR")} un. arredondado`);
      unidades.push({ label, qty: exato, size: tamanho });
    });
  }

  if(currentCrop === "adubacao"){
    const npkN = parseFloat($("npkN").value) || 0;
    const npkP = parseFloat($("npkP").value) || 0;
    const npkK = parseFloat($("npkK").value) || 0;

    // Bag de 750 kg só existe pras formulações de ureia específicas; demais formulações vêm em bag de 1.000 kg
    const bagTamanho = getBagSize();
    const bagLabel = bagTamanho === 750 ? "Bag de Ureia 750 kg" : "Bag 1.000 kg";
    const exatoBag = total / bagTamanho;
    addPack(bagLabel, fmtDec(exatoBag), `→ ${Math.ceil(exatoBag).toLocaleString("pt-BR")} un. arredondado`);
    unidades.push({ label: bagLabel, qty: exatoBag, size: bagTamanho });

    // mantém "sacas por alqueire" sincronizado com a dose (kg/alqueire), na saca de 50 kg
    const doseAlqVal = parseFloat($("doseAlq").value) || 0;
    if(document.activeElement !== $("sacasAlqAdubo")){
      $("sacasAlqAdubo").value = doseAlqVal > 0 ? (doseAlqVal / getSacaAduboSize()).toFixed(2) : "";
    }

    const wrapN = $("npkWrap");
    wrapN.innerHTML = "";
    // fórmula: kg da fonte padrão = (% do nutriente na formulação × total aplicado) ÷ % garantido na fonte
    // fontes padrão: ureia (45% N), superfosfato triplo (41% P₂O₅), cloreto de potássio (60% K₂O)
    [["N", npkN, 45], ["P₂O₅", npkP, 41], ["K₂O", npkK, 60]].forEach(([nome, pct, fonte]) => {
      const kg = (pct * total) / fonte;
      const div = document.createElement("div");
      div.className = "rounded-xl border border-ink/10 bg-white px-3 py-2.5 lg:py-1.5";
      const porAlq = area ? kg / area : 0;
      div.innerHTML = `<div class="text-[10px] font-semibold uppercase tracking-wide text-muted">${nome} (${pct}%)</div>` +
        `<div class="font-mono text-[16px] font-bold tabular-nums lg:text-[15px]">${fmtDec(porAlq)} kg / alqueire</div>` +
        `<div class="text-[10px] text-muted">${fmtDec(kg)} kg total na área</div>`;
      wrapN.appendChild(div);
    });
  }

  const combo = montarCombo(unidades, baseTotal);
  if(combo) unidades.push(combo);

  const hint = $("comboHint");
  if(combo){
    const k = combo.combo;
    // textContent puro fica guardado à parte pra reaproveitar no PDF/imagem
    // (r.combo em montarReportData()), que precisa de uma frase corrida, não do HTML da dica.
    hint.dataset.plain = `Sobra fracionada: dá para levar ${k.nBags} × ${k.bag.label} + ${k.nSacas} × ${k.saca.label} (em vez de arredondar a embalagem maior para cima).`;
    hint.innerHTML = `
      <div style="background:#EFF6FC;border:1px solid #CBE0F5;border-radius:14px;padding:14px 16px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0C447C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2h5c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z"/><line x1="9.5" y1="19" x2="14.5" y2="19"/><line x1="10" y1="21.5" x2="14" y2="21.5"/></svg>
          <span style="font-size:12px;font-weight:500;color:#0C447C;">Combinação sugerida — evita arredondar para cima</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="flex:1;background:#FFFFFF;border:1px solid #CBE0F5;border-radius:12px;padding:10px 12px;text-align:center;">
            <div style="font-family:monospace;font-size:22px;font-weight:700;color:#0C447C;">${k.nBags}×</div>
            <div style="font-size:11px;color:#185FA5;margin-top:2px;">${k.bag.label}</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#378ADD" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <div style="flex:1;background:#FFFFFF;border:1px solid #CBE0F5;border-radius:12px;padding:10px 12px;text-align:center;">
            <div style="font-family:monospace;font-size:22px;font-weight:700;color:#0C447C;">${k.nSacas}×</div>
            <div style="font-size:11px;color:#185FA5;margin-top:2px;">${k.saca.label}</div>
          </div>
        </div>
        <div style="font-size:11px;color:#185FA5;margin-top:10px;line-height:1.4;">Em vez de fechar em ${k.nBags + 1} embalagens de ${k.bag.label}, essa combinação encaixa a sobra com precisão.</div>
      </div>`;
    hint.classList.remove("hidden");
  } else {
    hint.classList.add("hidden");
  }

  renderCustos(unidades);
  renderMemoria(c, area, total, mem);
  renderAlerts(area);
  updateComparador();
}

// ---------- Ícones da interface (Tabler, embutidos como SVG inline) ----------
// Mesmo padrão do ALERT_META abaixo: objeto com "icon" (nome do ícone Tabler,
// só para a classe CSS) + "paths" (o <path> do ícone, direto do tabler-icons).
// Tudo embutido no JS — sem webfont nem CDN — pra manter o app 100% offline.
// Só entram aqui os ícones que o JS de fato precisa montar em tempo de
// execução (o ícone da cultura corrente, reaproveitado no cabeçalho do
// resultado e na ficha em PDF/PNG); os demais ícones da tela são estáticos
// no HTML e já foram trocados por SVG inline direto no markup.
const UI_ICONS = {
  soja:     { icon:"leaf",    paths:'<path d="M5 21c.5 -4.5 2.5 -8 7 -10" /><path d="M9 18c6.218 0 10.5 -3.288 11 -12v-2h-4.014c-9 0 -11.986 4 -12 9c0 1 0 3 2 5h3l.014 0" />' },
  milho:    { icon:"plant",   paths:'<path d="M7 15h10v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2v-4" /><path d="M12 9a6 6 0 0 0 -6 -6h-3v2a6 6 0 0 0 6 6h3" /><path d="M12 11a6 6 0 0 1 6 -6h3v1a6 6 0 0 1 -6 6h-3" /><path d="M12 15l0 -6" />' },
  feijao:   { icon:"plant-2", paths:'<path d="M2 9a10 10 0 1 0 20 0" /><path d="M12 19a10 10 0 0 1 10 -10" /><path d="M2 9a10 10 0 0 1 10 10" /><path d="M12 4a9.7 9.7 0 0 1 2.99 7.5" /><path d="M9.01 11.5a9.7 9.7 0 0 1 2.99 -7.5" />' },
  trigo:    { icon:"wheat",   paths:'<path d="M12.014 21.514v-3.75" /><path d="M5.93 9.504l-.43 1.604c-.712 2.659 .866 5.391 3.524 6.105c.997 .268 1.993 .535 2.99 .801v-3.44c-.164 -2.105 -1.637 -3.879 -3.676 -4.426l-2.408 -.644" /><path d="M13.744 11.164c.454 -.454 .815 -.994 1.061 -1.587c.246 -.594 .372 -1.23 .372 -1.873c0 -.643 -.126 -1.279 -.372 -1.872c-.246 -.594 -.606 -1.133 -1.061 -1.588l-1.73 -1.73l-1.73 1.73c-.454 .454 -.815 .994 -1.06 1.588c-.246 .594 -.372 1.23 -.373 1.872c0 .643 .127 1.279 .373 1.873c.246 .594 .606 1.133 1.06 1.587" /><path d="M18.099 9.504l.43 1.604c.712 2.659 -.866 5.391 -3.525 6.105c-.997 .268 -1.994 .535 -2.99 .801v-3.44c.164 -2.105 1.637 -3.879 3.677 -4.426l2.408 -.644" />' },
  adubacao: { icon:"flask",   paths:'<path d="M9 3l6 0" /><path d="M10 9l4 0" /><path d="M10 3v6l-4 11a.7 .7 0 0 0 .5 1h11a.7 .7 0 0 0 .5 -1l-4 -11v-6" />' },
  regua:    { icon:"ruler",   paths:'<path d="M5 4h14a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-7a1 1 0 0 0 -1 1v7a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1" /><path d="M4 8l2 0" /><path d="M4 12l3 0" /><path d="M4 16l2 0" /><path d="M8 4l0 2" /><path d="M12 4l0 3" /><path d="M16 4l0 2" />' },
};

function iconSvg(key, cls){
  const m = UI_ICONS[key];
  return `<svg class="ti ti-${m.icon}${cls ? " " + cls : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${m.paths}</svg>`;
}

// Mesmo ícone, desenhado no <canvas> da ficha em PNG (ctx.fillText não
// interpreta SVG — os "d" de cada <path> viram Path2D, escalados do
// viewBox 24x24 pro tamanho pedido).
function drawIcon(ctx, draw, key, x, y, size, color){
  if(!draw) return;
  const m = UI_ICONS[key];
  if(!m) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color || "#1E2420";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  [...m.paths.matchAll(/d="([^"]+)"/g)].forEach(mm => ctx.stroke(new Path2D(mm[1])));
  ctx.restore();
}

// ---------- Alertas de validação da aba Sementes & Adubação ----------
// Camada só de aviso sobre os dados já digitados/calculados: não bloqueia nem recalcula
// nada além do que calc() e renderCustos() já fazem. Empilha quantos alertas se apliquem.
const ALERT_META = {
  error: { icon:"alert-circle",   paths:'<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 8v4" /><path d="M12 16h.01" />' },
  warn:  { icon:"alert-triangle", paths:'<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9v4" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.871l-8.106 -13.534a1.914 1.914 0 0 0 -3.274 0z" /><path d="M12 16h.01" />' },
  info:  { icon:"info-circle",    paths:'<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 9h.01" /><path d="M11 12h1v4h1" />' },
};

// Evita mostrar o alerta de área zerada já na carga da página, antes de
// qualquer digitação — assim que o usuário mexe em algum campo do
// formulário (captura, não bubbling, pra já valer na mesma interação que
// dispara calc()/renderAlerts()), a validação passa a valer normalmente.
// Por cultura (não um flag único global): trocar de aba pra uma cultura
// ainda não tocada não deve "herdar" o toque que já aconteceu em outra.
const formTouchedByCrop = {};
const marcarFormTouched = () => { formTouchedByCrop[currentCrop] = true; };
document.addEventListener("input", marcarFormTouched, true);
document.addEventListener("change", marcarFormTouched, true);

function renderAlerts(area){
  const alerts = []; // { level: "error"|"warn"|"info", text }

  if(area <= 0 && formTouchedByCrop[currentCrop]){
    alerts.push({ level:"error", text:"Informe uma área maior que zero para calcular." });
  }

  if(!$("pmsBox").classList.contains("hidden")){
    const germinacao = parseFloat($("germinacao").value) || 0;
    if(germinacao > 0 && germinacao < 80){
      alerts.push({ level:"warn", text:"A germinação está abaixo de 80%. Confirme o valor do boletim." });
    }
    const pureza = parseFloat($("pureza").value) || 0;
    // TODO: confirmar limiar com o setor agronômico — 90% é um valor sugerido, não oficial
    if(pureza > 0 && pureza < 90){
      alerts.push({ level:"warn", text:"A pureza está abaixo de 90%. Confirme o valor do boletim." });
    }
  }

  if(!$("plantasField").classList.contains("hidden")){
    const faixa = FAIXA_USUAL_PLANTAS[currentCrop];
    const plantas = parseFloat($("plantas").value) || 0;
    if(plantas > 0 && faixa && (plantas < faixa.min || plantas > faixa.max)){
      alerts.push({ level:"warn", text:`O valor de plantas/m está fora da faixa usual (${fmtLivre(faixa.min)} a ${fmtLivre(faixa.max)}). Confirme antes de prosseguir.` });
    }
  }

  custosUnidades.forEach((u, i) => {
    if(u.combo) return; // linha combinada usa os preços das outras linhas, não tem campo próprio
    const vista = $(`precoVista-${i}`);
    const prazo = $(`precoPrazo-${i}`);
    if(vista && prazo && precisaAlertarPrazoAusente(vista.value, prazo.value)){
      alerts.push({ level:"warn", text:`O preço a prazo não foi informado para ${u.label}.` });
    }
  });

  if(currentCrop === "adubacao"){
    const cultivarVal = $("cultivar").value.trim();
    if(cultivarVal){
      const npk = lerFormulacao(cultivarVal);
      if(npk){
        const [n, p, k] = npk;
        alerts.push({ level:"info", text:`Formulação identificada: ${n}-${p}-${k} (N ${n}% · P ${p}% · K ${k}%)` });
      } else {
        alerts.push({ level:"warn", text:"A formulação digitada não foi reconhecida. Confira os valores de N, P e K manualmente." });
      }
    }
  }

  const box = $("alertsBox");
  box.innerHTML = "";
  show(box, alerts.length > 0);
  alerts.forEach(a => {
    const meta = ALERT_META[a.level];
    const div = document.createElement("div");
    div.className = `alert-item alert-${a.level}`;
    div.innerHTML =
      `<svg class="ti ti-${meta.icon} alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${meta.paths}</svg>` +
      `<span class="alert-text">${a.text}</span>`;
    box.appendChild(div);
  });
}

// ---------- Memória de cálculo (passo a passo) da aba Sementes & Adubação ----------
// Só exibição: lê os mesmos valores que calc() já calculou (área, total e o objeto `mem`
// com os campos usados em cada ramo), sem recalcular nada com regra própria.
// Os passos de entrada viram itens da timeline (círculo numerado + linha conectando);
// o(s) resultado(s) final(is) vira(m) cartão(ões) de destaque separado, com acento dourado.
function renderMemoria(c, area, total, mem){
  const wrap = $("memoriaStepsWrap");
  wrap.innerHTML = "";
  let stepNum = 0;

  function addStep(label, value, caption){
    stepNum++;
    const div = document.createElement("div");
    div.className = "mem-step";
    div.innerHTML =
      `<div class="mem-step-marker"><span class="mem-step-dot">${stepNum}</span></div>` +
      `<div class="mem-step-body">` +
        `<div class="mem-step-label">${label}</div>` +
        `<div class="mem-step-value">${value}</div>` +
        `<div class="mem-step-caption">${caption}</div>` +
      `</div>`;
    wrap.appendChild(div);
  }

  function addResult(label, value, caption){
    const div = document.createElement("div");
    div.className = "mem-result";
    div.innerHTML =
      `<div class="mem-step-label">${label}</div>` +
      `<div class="mem-step-value">${value}</div>` +
      `<div class="mem-step-caption">${caption}</div>`;
    wrap.appendChild(div);
  }

  if(c.tipo === "semente"){
    addStep("Área", fmtAreaComUnidade(area), "informada acima");
    addStep("Espaçamento", fmtDec(mem.espacamento) + " m", "informado ao lado");
    addStep("População informada", fmtDec(mem.plantas) + " plantas/m", "informado ao lado");
    addStep("Transpasse", fmtDec(mem.transpasse) + " %", "informado ao lado");
    addResult("Resultado", fmtInt(total) + " sementes", "(24.200 × área ÷ espaçamento) × plantas/m ÷ ((100 − transpasse) ÷ 100)");
    if(currentCrop === "trigo"){
      addResult("Peso estimado (via PMS)", fmtDec(mem.kgTrigo) + " kg", "Total × PMS ÷ 1.000.000");
    }
  } else if(c.tipo === "sacas"){
    addStep("Área", fmtAreaComUnidade(area), "informada acima");
    addStep("Sacas por alqueire", fmtDec(mem.sacasAlq), "informado ao lado");
    addResult("Resultado", fmtDec(total) + " sacas", "Área × Sacas por alqueire");
  } else {
    addStep("Área", fmtAreaComUnidade(area), "informada acima");
    addStep("Dose por alqueire", fmtDec(mem.doseAlq) + " kg", "informado ao lado");
    addResult("Resultado", fmtDec(total) + " kg", "Área × Dose por alqueire");
  }

  $("memoriaFormula").textContent = $("formulaHint").textContent;
  syncMemoriaHeight();
}

// Abre/fecha o painel animando max-height + opacity (a altura do conteúdo é dinâmica
// conforme a cultura, por isso é medida via scrollHeight em vez de um valor fixo).
const memoriaToggle = $("memoriaToggle");
const memoriaPanel = $("memoriaPanel");
function syncMemoriaHeight(){
  if(memoriaPanel.classList.contains("is-open")){
    memoriaPanel.style.maxHeight = memoriaPanel.scrollHeight + "px";
  }
}
memoriaToggle.addEventListener("click", () => {
  const abrindo = memoriaToggle.getAttribute("aria-expanded") !== "true";
  memoriaToggle.setAttribute("aria-expanded", abrindo ? "true" : "false");
  if(abrindo){
    memoriaPanel.classList.add("is-open");
    memoriaPanel.style.maxHeight = memoriaPanel.scrollHeight + "px";
  } else {
    memoriaPanel.style.maxHeight = memoriaPanel.scrollHeight + "px"; // trava a altura atual antes de animar pra 0
    requestAnimationFrame(() => {
      memoriaPanel.classList.remove("is-open");
      memoriaPanel.style.maxHeight = "0px";
    });
  }
});

function calcPMS(){
  const pms = parseFloat($("pms").value) || 0;
  const pop = parseFloat($("popDesejada").value) || 0;
  const germ = parseFloat($("germinacao").value) || 0;
  const pureza = parseFloat($("pureza").value) || 0;
  const dose = calcularDosePMS({ populacao: pop, pms, germinacao: germ, pureza });
  $("pmsDoseResult").textContent = fmtDec(dose);
  return dose;
}

// ---------- Custos por cultura ----------
// Cada embalagem da cultura (sacaria ou bag) vira uma linha de custo: o preço é digitado
// aqui mesmo e o custo total é a quantidade arredondada (compra fechada) × preço.
const custoPrecos = {};   // { "crop::embalagem": { vista, prazo } }
const custoPrazoData = {}; // { crop: "AAAA-MM-DD" } — vencimento negociado para o preço a prazo
let custosUnidades = [];
let custosSig = "";

const custoKey = (crop, label) => crop + "::" + label;

function renderCustos(unidades){
  custosUnidades = unidades;
  const list = $("custosList");
  const sig = currentCrop + "|" + unidades.map(u => u.label).join("|");

  if(sig !== custosSig){
    custosSig = sig;
    list.innerHTML = "";

    if(!unidades.length){
      list.innerHTML = `<p class="text-[12px] text-muted">Nenhuma embalagem definida para esta cultura.</p>`;
      return;
    }

    // no desktop a lista vira tabela: um cabeçalho e uma linha por embalagem
    const head = document.createElement("div");
    head.className = "custos-head";
    head.innerHTML = ["Embalagem","Preço à vista","Preço a prazo","Custo à vista","Custo a prazo"]
      .map(t => `<span class="whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-muted">${t}</span>`).join("");
    list.appendChild(head);

    unidades.forEach((u, i) => {
      const key = custoKey(currentCrop, u.label);
      const p = custoPrecos[key] || {};
      const item = document.createElement("div");
      item.className = "custo-card-item";

      if(u.combo){
        item.className = "custo-card-item is-combo";
        item.innerHTML = `
        <div class="custos-grid">
          <div class="col-span-2 mb-1 lg:col-span-1 lg:mb-0">
            <span class="text-[13px] font-extrabold text-ink lg:leading-tight">${u.label}</span>
            <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
              <span class="font-mono text-[11px] text-muted" id="custoQtd-${i}">—</span>
              <span id="custoBadge-${i}" class="hidden whitespace-nowrap rounded-full bg-brand-money/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-money"><span class="lg:hidden">menor custo</span><span class="hidden lg:inline">menor</span></span>
            </div>
          </div>
          <div class="col-span-2 self-center text-[10.5px] leading-snug text-muted lg:col-span-2">
            usa os preços acima
          </div>
          <div>
            <div class="custo-mobile-label">Custo à vista</div>
            <div class="whitespace-nowrap font-mono text-[14px] font-bold tabular-nums text-ink" id="custoVista-${i}">R$ 0,00</div>
            <div class="whitespace-nowrap text-[10.5px] text-muted" id="custoVistaAlq-${i}">R$ 0,00 / alqueire</div>
          </div>
          <div>
            <div class="custo-mobile-label" id="custoPrazoRot-${i}">Custo a prazo</div>
            <div class="whitespace-nowrap font-mono text-[14px] font-bold tabular-nums text-ink" id="custoPrazo-${i}">R$ 0,00</div>
            <div class="whitespace-nowrap text-[10.5px] text-muted" id="custoPrazoAlq-${i}">R$ 0,00 / alqueire</div>
          </div>
        </div>`;
        list.appendChild(item);
        return;
      }

      item.innerHTML = `
        <div class="custos-grid">
          <div class="col-span-2 mb-1 flex flex-wrap items-baseline justify-between gap-x-2 lg:col-span-1 lg:mb-0 lg:block">
            <span class="text-[13px] font-extrabold text-ink lg:leading-tight">${u.label}</span>
            <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
              <span class="whitespace-nowrap font-mono text-[11px] text-muted" id="custoQtd-${i}">—</span>
              <span id="custoBadge-${i}" class="hidden whitespace-nowrap rounded-full bg-brand-money/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-money"><span class="lg:hidden">menor custo</span><span class="hidden lg:inline">menor</span></span>
            </div>
          </div>

          <div>
            <label class="lbl lg:hidden" for="precoVista-${i}">Preço à vista</label>
            <div class="input-group">
              <span class="input-group-addon is-prefix">R$</span>
              <input type="number" id="precoVista-${i}" class="inp inp-num inp-money" step="0.01" min="0" inputmode="decimal"
                     placeholder="0,00" data-custo="${key}" data-tipo="vista" value="${p.vista || ""}">
            </div>
          </div>
          <div>
            <label class="lbl lg:hidden" for="precoPrazo-${i}">Preço a prazo</label>
            <div class="input-group">
              <span class="input-group-addon is-prefix">R$</span>
              <input type="number" id="precoPrazo-${i}" class="inp inp-num inp-money" step="0.01" min="0" inputmode="decimal"
                     placeholder="0,00" data-custo="${key}" data-tipo="prazo" value="${p.prazo || ""}">
            </div>
          </div>
          <div>
            <div class="custo-mobile-label">Custo à vista</div>
            <div class="whitespace-nowrap font-mono text-[14px] font-bold tabular-nums text-ink" id="custoVista-${i}">R$ 0,00</div>
            <div class="whitespace-nowrap text-[10.5px] text-muted" id="custoVistaAlq-${i}">R$ 0,00 / alqueire</div>
          </div>
          <div>
            <div class="custo-mobile-label" id="custoPrazoRot-${i}">Custo a prazo</div>
            <div class="whitespace-nowrap font-mono text-[14px] font-bold tabular-nums text-ink" id="custoPrazo-${i}">R$ 0,00</div>
            <div class="whitespace-nowrap text-[10.5px] text-muted" id="custoPrazoAlq-${i}">R$ 0,00 / alqueire</div>
          </div>
        </div>
      `;
      list.appendChild(item);
    });

    list.querySelectorAll("input[data-custo]").forEach(inp => {
      inp.addEventListener("input", () => {
        const key = inp.dataset.custo;
        custoPrecos[key] = custoPrecos[key] || {};
        custoPrecos[key][inp.dataset.tipo] = inp.value;
        updateCustos();
      });
    });
  }

  updateCustos();
}

// vencimento do prazo: devolve o texto formatado e atualiza o "em X dias"
function refreshVencimento(){
  const iso = $("prazoData").value;
  if(!iso){
    $("prazoDias").textContent = "";
    return "";
  }
  const [y,m,d] = iso.split("-").map(Number);
  const venc = new Date(y, m-1, d);
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const dias = Math.round((venc - hoje) / 86400000);
  $("prazoDias").textContent = dias === 0 ? "vence hoje"
    : dias > 0 ? `em ${dias} dia${dias === 1 ? "" : "s"}`
    : `venceu há ${-dias} dia${dias === -1 ? "" : "s"}`;
  return venc.toLocaleDateString("pt-BR");
}

function updateCustos(){
  const area = areaAlqDoInput();
  const venc = refreshVencimento();
  const rotPrazo = venc ? `Custo a prazo · ${venc}` : "Custo a prazo";
  let menorVista = Infinity, menorIdx = -1;

  custosUnidades.forEach((u, i) => {
    // linha combinada: quantidade e custo saem dos preços já digitados nas outras linhas
    if(u.combo){
      const { bag, saca, nBags, nSacas } = u.combo;
      const pB = custoPrecos[custoKey(currentCrop, bag.label)] || {};
      const pS = custoPrecos[custoKey(currentCrop, saca.label)] || {};
      const vB = parseFloat(pB.vista) || 0, vS = parseFloat(pS.vista) || 0;
      const zB = parseFloat(pB.prazo) || 0, zS = parseFloat(pS.prazo) || 0;
      const cVista = (vB > 0 && vS > 0) ? nBags * vB + nSacas * vS : 0;
      const cPrazo = (zB > 0 && zS > 0) ? nBags * zB + nSacas * zS : 0;

      $(`custoQtd-${i}`).textContent = `${nBags} × ${bag.label} + ${nSacas} × ${saca.label}`;
      $(`custoVista-${i}`).textContent = fmtMoeda(cVista);
      $(`custoPrazo-${i}`).textContent = fmtMoeda(cPrazo);
      $(`custoVistaAlq-${i}`).textContent = fmtMoeda(area ? cVista/area : 0) + " / alqueire";
      $(`custoPrazoAlq-${i}`).textContent = fmtMoeda(area ? cPrazo/area : 0) + " / alqueire";
      const rotC = $(`custoPrazoRot-${i}`);
      if(rotC) rotC.textContent = rotPrazo;
      if(cVista > 0 && cVista < menorVista){ menorVista = cVista; menorIdx = i; }
      return;
    }

    const p = custoPrecos[custoKey(currentCrop, u.label)] || {};
    const qtdArred = Math.max(0, Math.ceil(u.qty || 0));

    const custoVista = calcularCusto(qtdArred, p.vista);
    const custoPrazo = calcularCusto(qtdArred, p.prazo);

    $(`custoQtd-${i}`).textContent = `${qtdArred.toLocaleString("pt-BR")} un. (exato: ${fmtDec(u.qty || 0)})`;
    $(`custoVista-${i}`).textContent = fmtMoeda(custoVista);
    $(`custoPrazo-${i}`).textContent = fmtMoeda(custoPrazo);
    $(`custoVistaAlq-${i}`).textContent = fmtMoeda(area ? custoVista/area : 0) + " / alqueire";
    $(`custoPrazoAlq-${i}`).textContent = fmtMoeda(area ? custoPrazo/area : 0) + " / alqueire";
    const rot = $(`custoPrazoRot-${i}`);
    if(rot) rot.textContent = rotPrazo;

    if(custoVista > 0 && custoVista < menorVista){ menorVista = custoVista; menorIdx = i; }
  });

  // destaca a embalagem mais barata só quando há de fato o que comparar
  const comparaveis = custosUnidades.filter(u => {
    if(u.combo){
      const pB = custoPrecos[custoKey(currentCrop, u.combo.bag.label)] || {};
      const pS = custoPrecos[custoKey(currentCrop, u.combo.saca.label)] || {};
      return (parseFloat(pB.vista) || 0) > 0 && (parseFloat(pS.vista) || 0) > 0;
    }
    const p = custoPrecos[custoKey(currentCrop, u.label)] || {};
    return (parseFloat(p.vista) || 0) > 0;
  }).length;
  custosUnidades.forEach((u, i) => {
    const badge = $(`custoBadge-${i}`);
    if(badge) badge.classList.toggle("hidden", !(comparaveis > 1 && i === menorIdx));
  });
}

// ---------- Comparador de formulações (Adubação/Ureia) ----------
// Ferramenta auxiliar de venda dentro da aba Adubação/Ureia: compara o custo
// de 2 a 4 formulações candidatas, para ajudar a recomendar a mais vantajosa
// ao produtor. Reaproveita lerFormulacao() (mesma função do campo "Formulação
// cotada" acima) e a área já informada na Identificação — não duplica nem
// altera o cálculo principal da aba, é só uma simulação à parte.
let compModo = "dose"; // "dose": mesma dose (kg/ha) pra todas · "npk": cada uma dosada pra bater a mesma necessidade de NPK
const compRows = [
  { texto: "", preco: "" },
  { texto: "", preco: "" },
];
// snapshot do último cálculo do comparador, pra exportação (PDF/PNG) ler sem
// recalcular — ver coletarResumo() e updateComparador()
let ultimoComparador = null;

// chips de preenchimento rápido: MAP/Ureia/KCl entram já com o NPK padrão de
// mercado embutido no texto (ex.: "MAP 11-52-00"), pra lerFormulacao() (a
// mesma função do campo "Formulação cotada" acima) reconhecer pelo número,
// sem precisar de mais um nome na lista FORMULACOES_NOMEADAS.
const COMP_CHIPS = [
  { label: "04-14-08", formula: "04-14-08" },
  { label: "10-15-15", formula: "10-15-15" },
  { label: "02-20-20", formula: "02-20-20" },
  { label: "MAP", formula: "MAP 11-52-00" },
  { label: "Ureia", formula: "Ureia 45-00-00" },
  { label: "KCl", formula: "KCl 00-00-60" },
];

function renderComparador(){
  const rowsBox = $("compRows");
  rowsBox.innerHTML = "";
  compRows.forEach((row, i) => {
    const div = document.createElement("div");
    div.className = "comp-row";
    div.id = `compRow-${i}`;
    div.innerHTML = `
      <div class="fld-grid">
        <div>
          <label class="lbl" for="compFormula-${i}">Formulação</label>
          <input type="text" id="compFormula-${i}" class="inp" placeholder="Ex.: 04-14-08, MAP, Ureia" autocomplete="off">
          <div class="comp-chip-row">
            ${COMP_CHIPS.map(c => `<button type="button" class="comp-chip" data-formula="${c.formula}">${c.label}</button>`).join("")}
          </div>
        </div>
        <div>
          <label class="lbl" for="compPreco-${i}">Preço por kg</label>
          <div class="input-group">
            <span class="input-group-addon is-prefix">R$</span>
            <input type="number" id="compPreco-${i}" class="inp inp-num inp-money" step="0.01" min="0" inputmode="decimal" placeholder="0,00">
          </div>
        </div>
      </div>
      <div class="comp-card-body" id="compResult-${i}"></div>
      ${compRows.length > 2 ? `<button type="button" class="comp-remove mt-2" data-i="${i}">remover formulação</button>` : ""}
    `;
    rowsBox.appendChild(div);

    const inpFormula = div.querySelector(`#compFormula-${i}`);
    const inpPreco = div.querySelector(`#compPreco-${i}`);
    inpFormula.value = row.texto;
    inpPreco.value = row.preco;
    inpFormula.addEventListener("input", e => { row.texto = e.target.value; updateComparador(); });
    inpPreco.addEventListener("input", e => { row.preco = e.target.value; updateComparador(); });

    div.querySelectorAll(".comp-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        inpFormula.value = chip.dataset.formula;
        row.texto = chip.dataset.formula;
        updateComparador();
      });
    });

    const rm = div.querySelector(".comp-remove");
    if(rm) rm.addEventListener("click", () => { compRows.splice(i, 1); renderComparador(); });
  });

  $("compAddRow").classList.toggle("hidden", compRows.length >= 4);
  updateComparador();
}

function updateComparador(){
  if(currentCrop !== "adubacao") return;
  const area = areaAlqDoInput(); // alqueires (canônico) — mesmo campo da Identificação, não duplicado aqui
  const areaHa = area * ALQ_HA;
  const necessidade = parseFloat($("compDose").value) || 0; // kg/ha: dose (modo "dose") ou necessidade de NPK (modo "npk")

  // 1ª passada: calcula cada linha reconhecida e guarda o resultado — precisa
  // terminar todas antes de saber qual é a mais barata (2ª passada, abaixo),
  // pra montar o badge "menor custo" e a linha de diferença percentual.
  const resultados = [];

  compRows.forEach((row, i) => {
    const box = $(`compResult-${i}`);
    if(!box) return;
    const texto = row.texto.trim();
    const preco = parseFloat(row.preco) || 0;

    if(!texto){
      box.innerHTML = `<span class="text-[11px] text-muted">Informe a formulação para comparar.</span>`;
      return;
    }

    const npk = lerFormulacao(texto);
    if(!npk){
      box.innerHTML =
        `<div class="alert-item alert-warn" style="padding:6px 10px;">` +
        `<svg class="ti ti-${ALERT_META.warn.icon} alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ALERT_META.warn.paths}</svg>` +
        `<span class="alert-text">Formulação não reconhecida — confira o texto digitado.</span></div>`;
      return;
    }

    const [n, p, k] = npk;
    const somaNpk = n + p + k;
    // modo "dose": todas recebem a mesma dose informada · modo "npk": cada uma usa a dose
    // que entrega, sozinha, a necessidade total de nutrientes informada (kg/ha ÷ % NPK da formulação)
    const dose = compModo === "dose" ? necessidade : (somaNpk > 0 ? necessidade / (somaNpk / 100) : 0);
    const doseAlq = dose * ALQ_HA;
    const totalKg = dose * areaHa;
    const bagTamanho = bagSizeFromNpk(n, p, k); // 750 kg só pra ureia específica; demais em bag de 1.000 kg
    const bags = bagTamanho > 0 ? totalKg / bagTamanho : 0;
    const sacas = totalKg / getSacaAduboSize(); // sempre 50 kg, mesma saca da aba principal
    const custoHa = dose * preco;
    const custoAlq = custoHa * ALQ_HA;
    const custoTotal = custoHa * areaHa; // mesma fórmula de sempre (dose × preço × área em ha)
    // custo-benefício intrínseco do produto (R$ por kg de N+P₂O₅+K₂O ativo) —
    // independe da dose/área informada, só de preço e concentração; `preco`
    // aqui já é por kg do produto, então uma "embalagem" de 1 kg custa `preco`
    const custoPorKgNutriente = calcularCustoPorKgNutriente({ preco, tamanhoEmbalagemKg: 1, npkN: n, npkP: p, npkK: k });

    resultados.push({
      i, box, n, p, k, somaNpk, dose, doseAlq, bagTamanho, bags, sacas,
      custoHa, custoAlq, custoTotal, custoPorKgNutriente, temPreco: preco > 0 && dose > 0,
    });
  });

  const validos = resultados.filter(r => r.temPreco);
  const menor = validos.length > 1 ? validos.reduce((a, b) => a.custoTotal < b.custoTotal ? a : b) : null;
  // melhor custo-benefício = menor R$/kg de nutriente entre as linhas reconhecidas
  // com preço informado — ao contrário de `menor` (custo total), não depende de
  // dose/área terem sido informadas, só do preço e da concentração do produto.
  const melhorCustoBeneficio = resultados.length > 1
    ? identificarMelhorCustoBeneficio(resultados.filter(r => r.custoPorKgNutriente > 0))
    : null;

  ultimoComparador = { modo: compModo, necessidade, resultados, menor, melhorCustoBeneficio };

  // 2ª passada: agora que sabemos qual é a mais barata, desenha o cartão de
  // cada linha reconhecida (badge de NPK, grade de 4 métricas e, quando
  // aplicável, o badge "menor custo" ou a diferença em R$/% pra ela).
  resultados.forEach(r => {
    const isCheapest = !!menor && r.i === menor.i;
    const isMelhorCustoBeneficio = !!melhorCustoBeneficio && r.i === melhorCustoBeneficio.i;
    const bagLabel = r.bagTamanho === 750 ? "bags 750kg" : "bags 1.000kg";
    let deltaHtml = "";
    if(menor && !isCheapest && r.temPreco){
      const diff = r.custoTotal - menor.custoTotal;
      const pct = menor.custoTotal > 0 ? (diff / menor.custoTotal) * 100 : 0;
      deltaHtml = `<div class="comp-delta">+ ${fmtMoeda(diff)} (+${fmtDec(pct)}%) em relação à melhor opção</div>`;
    }
    r.box.innerHTML = `
      <div class="comp-npk-row">
        <span class="comp-npk-badge">${r.n}-${r.p}-${r.k} <span class="comp-npk-total">· ${fmtInt(r.somaNpk)}% ativos</span></span>
        <div class="comp-badge-group">
          ${isCheapest ? `<span class="comp-cheapest-badge">★ Menor Custo</span>` : ""}
          ${isMelhorCustoBeneficio ? `<span class="comp-best-value-badge">★ Melhor Custo-Benefício</span>` : ""}
        </div>
      </div>
      ${r.custoPorKgNutriente > 0 ? `
      <div class="comp-nutrient-badge">
        ${fmtMoeda(r.custoPorKgNutriente)} / kg nutriente total <span class="comp-nutrient-pct">(${fmtInt(r.somaNpk)}% de NPK)</span>
      </div>` : ""}
      <div class="comp-metric-grid">
        <div class="comp-metric-box">
          <div class="comp-metric-label">Dose calculada</div>
          <div class="comp-metric-value">${fmtDec(r.dose)} kg/ha</div>
          <div class="comp-metric-sub">${fmtDec(r.doseAlq)} kg/alq</div>
        </div>
        <div class="comp-metric-box">
          <div class="comp-metric-label">Volume estimado</div>
          <div class="comp-metric-value">${fmtDec(r.bags)} ${bagLabel}</div>
          <div class="comp-metric-sub">${fmtDec(r.sacas)} sacas 50kg</div>
        </div>
        <div class="comp-metric-box">
          <div class="comp-metric-label">Custo por área</div>
          <div class="comp-metric-value">${fmtMoeda(r.custoHa)}/ha</div>
          <div class="comp-metric-sub">${fmtMoeda(r.custoAlq)}/alq</div>
        </div>
        <div class="comp-metric-box is-total">
          <div class="comp-metric-label">Custo total</div>
          <div class="comp-metric-value">${fmtMoeda(r.custoTotal)}</div>
          <div class="comp-metric-sub">${area > 0 ? "na área informada" : "informe a área acima"}</div>
        </div>
      </div>
      ${deltaHtml}
    `;
  });

  compRows.forEach((_row, i) => {
    const div = $(`compRow-${i}`);
    if(div) div.classList.toggle("is-cheapest", !!menor && i === menor.i);
  });
}

$("compModo").querySelectorAll("button").forEach(btn => {
  btn.addEventListener("click", () => {
    compModo = btn.dataset.modo;
    $("compModo").querySelectorAll("button").forEach(b => {
      b.classList.toggle("is-active", b === btn);
      b.setAttribute("aria-pressed", b === btn ? "true" : "false");
    });
    $("compDoseLabel").textContent = compModo === "dose" ? "Dose (kg/ha)" : "Necessidade de NPK (kg/ha)";
    updateComparador();
  });
});
$("compDose").addEventListener("input", updateComparador);
$("compAddRow").addEventListener("click", () => {
  if(compRows.length >= 4) return;
  compRows.push({ texto: "", preco: "" });
  renderComparador();
});

renderComparador();

// ---------- Eventos ----------
tabs.forEach(tab => {
  tab.addEventListener("click", () => selectCrop(tab.dataset.crop));
});

["area","plantas","cliente","cultivar","sacasAlq"].forEach(id => $(id).addEventListener("input", calc));

// formulação cotada -> campos NPK -> bag, nutrientes e custos, tudo junto
$("cultivar").addEventListener("input", () => {
  if(aplicarFormulacao()) calc();
});

// vencimento do preço a prazo (guardado por cultura)
$("prazoData").addEventListener("input", () => {
  custoPrazoData[currentCrop] = $("prazoData").value;
  updateCustos();
});

// dose kg/ha <-> dose kg/alqueire ficam sincronizadas (1 alqueire = 2,42 ha)
$("doseHa").addEventListener("input", () => {
  const raw = $("doseHa").value.trim();
  const v = parseFloat(raw) || 0;
  $("doseAlq").value = raw === "" ? "" : (v * ALQ_HA).toFixed(2);
  calc();
});
$("doseAlq").addEventListener("input", () => {
  const raw = $("doseAlq").value.trim();
  const v = parseFloat(raw) || 0;
  const c = getConfig(currentCrop);
  if(c.showDoseHa){
    $("doseHa").value = raw === "" ? "" : (v / ALQ_HA).toFixed(2);
  }
  calc();
});
$("espacamento").addEventListener("change", calc);
transSel.addEventListener("change", calc);

// PMS calculator (Trigo)
["pms","popDesejada","germinacao","pureza"].forEach(id => $(id).addEventListener("input", () => { calcPMS(); calc(); }));
$("usarDosePMS").addEventListener("click", () => {
  const dose = calcPMS();
  $("doseHa").value = dose.toFixed(2);
  $("doseHa").dispatchEvent(new Event("input"));
});

// NPK formulation (Adubação/Ureia)
["npkN","npkP","npkK"].forEach(id => $(id).addEventListener("input", calc));

// Sacas por alqueire (Adubação/Ureia) <-> dose (kg/alqueire), na saca de 50 kg
$("sacasAlqAdubo").addEventListener("input", () => {
  const raw = $("sacasAlqAdubo").value.trim();
  const v = parseFloat(raw) || 0;
  $("doseAlq").value = raw === "" ? "" : (v * getSacaAduboSize()).toFixed(2);
  calc();
});

// navegação por teclado entre as culturas (setas), como manda o padrão de tablist
document.querySelector(".tabs").addEventListener("keydown", e => {
  const arr = [...tabs];
  const i = arr.indexOf(document.activeElement);
  if(i === -1) return;
  let next = null;
  if(e.key === "ArrowRight") next = arr[(i+1) % arr.length];
  if(e.key === "ArrowLeft")  next = arr[(i-1+arr.length) % arr.length];
  if(next){ e.preventDefault(); next.focus(); selectCrop(next.dataset.crop); }
});


// ---------- Exportar a ficha (PDF pela impressão do navegador, imagem pelo canvas) ----------
// Sem biblioteca externa: a ficha roda offline, então tudo é gerado aqui mesmo.

function dataHoje(){
  return new Date().toLocaleDateString("pt-BR");
}

// Código de referência rápido pra localizar qual ficha é qual numa conversa
// com o cliente/consultor — não é sequencial nem garante unicidade, é só a
// data/hora local do momento em que o documento foi gerado (AAAAMMDD-HHMM).
function gerarCodigoRef(d){
  const p2 = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
}

function coletarResumo(){
  const agora = new Date();
  const c = getConfig(currentCrop);
  const area = areaAlqDoInput();
  const cliente = $("cliente").value.trim();
  const cultivar = $("cultivar").value.trim();

  // os campos guardam número com ponto; na ficha impressa tudo sai com vírgula
  const num = id => { const v = $(id).value.trim(); return v === "" ? "" : v.replace(".", ","); };
  const params = [];
  if(c.tipo === "semente"){
    params.push(["Plantas por metro", num("plantas") || "—"]);
    params.push(["Espaçamento", (parseFloat($("espacamento").value) || 0).toLocaleString("pt-BR", {minimumFractionDigits:2}) + " m"]);
    params.push(["Transpasse", transSel.value + "%"]);
    if(currentCrop === "trigo") params.push(["PMS", (num("pms") || "—") + " g"]);
  } else if(c.tipo === "sacas"){
    params.push(["Sacas por alqueire", num("sacasAlq") || "—"]);
  } else {
    if(c.showDoseHa) params.push(["Dose", (num("doseHa") || "—") + " kg/ha"]);
    params.push(["Dose", (num("doseAlq") || "—") + " kg/alqueire"]);
    if(currentCrop === "adubacao"){
      params.push(["Sacas por alqueire", num("sacasAlqAdubo") || "—"]);
      const dois = id => String(Math.round(parseFloat($(id).value) || 0)).padStart(2, "0");
      params.push(["Formulação", `${dois("npkN")}-${dois("npkP")}-${dois("npkK")}`]);
    }
  }

  const venc = $("prazoData").value ? refreshVencimento() : "";
  const linhas = custosUnidades.map((u, i) => {
    const base = {
      vista: $(`custoVista-${i}`).textContent,
      prazo: $(`custoPrazo-${i}`).textContent,
      vistaAlq: $(`custoVistaAlq-${i}`).textContent,
      prazoAlq: $(`custoPrazoAlq-${i}`).textContent,
      menor: !$(`custoBadge-${i}`).classList.contains("hidden"),
    };
    if(u.combo){
      const { bag, saca, nBags, nSacas } = u.combo;
      return {...base, nome:"Combinado", qtd:`${nBags} × ${bag.label} + ${nSacas} × ${saca.label}`, precoVista:"usa os preços acima", precoPrazo:""};
    }
    const p = custoPrecos[custoKey(currentCrop, u.label)] || {};
    return {...base,
      nome: u.label,
      qtd: `${Math.max(0, Math.ceil(u.qty || 0)).toLocaleString("pt-BR")} un.  (exato ${fmtDec(u.qty || 0)})`,
      precoVista: formatarPrecoResumo(p.vista, fmtMoeda),
      precoPrazo: formatarPrecoResumo(p.prazo, fmtMoeda),
    };
  });

  const nutrientes = currentCrop === "adubacao"
    ? [...document.querySelectorAll("#npkWrap > div")].map(d => ({
        nome: d.children[0].textContent.trim(),
        valor: d.children[1].textContent.trim(),
        porAlq: d.children[2] ? d.children[2].textContent.trim() : "",
      }))
    : [];

  // Comparador de Formulações — só existe na aba Adubação/Ureia; usa o snapshot
  // que updateComparador() já deixou pronto (evita recalcular e reler o DOM
  // aqui). Só entra na ficha exportada quando há pelo menos uma linha reconhecida.
  const comparadorLinhas = (currentCrop === "adubacao" && ultimoComparador)
    ? ultimoComparador.resultados.map(res => ({
        npk: `${res.n}-${res.p}-${res.k}`,
        somaNpk: fmtInt(res.somaNpk),
        custoPorKgNutriente: res.custoPorKgNutriente > 0 ? fmtMoeda(res.custoPorKgNutriente) : "—",
        custoTotal: fmtMoeda(res.custoTotal),
        dose: `${fmtDec(res.dose)} kg/ha`,
        isMenorCusto: !!ultimoComparador.menor && res.i === ultimoComparador.menor.i,
        isMelhorCustoBeneficio: !!ultimoComparador.melhorCustoBeneficio && res.i === ultimoComparador.melhorCustoBeneficio.i,
      }))
    : [];
  const comparador = comparadorLinhas.length
    ? { modo: ultimoComparador.modo === "dose" ? "Mesma dose para todas" : "Bater necessidade de NPK", linhas: comparadorLinhas }
    : null;

  return {
    cultura: c.nome, icone: c.icon, accent: c.accent,
    cliente, cultivar,
    rotuloCultivar: currentCrop === "adubacao" ? "Formulação" : "Cultivar",
    area: fmtAreaRelatorio(area),
    params,
    total: $("totalValue").textContent,
    unidade: $("unitLabel").textContent,
    combo: $("comboHint").classList.contains("hidden") ? "" : ($("comboHint").dataset.plain || ""),
    linhas, nutrientes, comparador,
    vencimento: venc, vencimentoDias: $("prazoDias").textContent,
    data: agora.toLocaleDateString("pt-BR"),
    ref: gerarCodigoRef(agora),
    horaGeracao: agora.toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"}),
  };
}

function nomeArquivo(r, ext){
  const limpa = t => (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  const partes = ["cotacao", limpa(r.cultura), limpa(r.cliente), r.data.replace(/\//g, "-")].filter(Boolean);
  return partes.join("_") + "." + ext;
}

// ---- Regulagem de Plantadeira: dados para exportacao (PDF/PNG) -- le os
// mesmos campos e resultados que calcRegulagem()/calcRegulagemAvancada()/
// calcRegulagemAdubo() ja preenchem na tela, sem recalcular nada com regra
// propria. Cobre a sub-aba (Semente ou Adubo) que estiver ativa no momento.
function coletarResumoRegulagem(){
  const semente = $("regTabSemente").classList.contains("is-active");
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#5C8A26";

  if(semente){
    const alertaTeste = $("regTesteAlertBox").classList.contains("hidden") ? "" : $("regTesteAlertBox").textContent.trim();
    return {
      variante: "semente", accent, data: dataHoje(),
      populacao: $("regPopulacao").value.trim(),
      espacamento: $("regEspacamento").value.trim(),
      germinacao: $("regGerminacao").value.trim(),
      plantasHa: $("regPlantasHa").textContent,
      metrosLineares: $("regMetrosLineares").textContent,
      plantasMetro: $("regPlantasMetro").textContent,
      numLinhas: $("regNumLinhas").value.trim(),
      testeMetros: $("regTesteMetrosLabel").textContent,
      esperadoPorLinha: $("regTesteEsperadoPorLinha").textContent,
      esperadoTotal: $("regTesteEsperadoTotal").textContent,
      coletadas: $("regSementesColetadas").value.trim(),
      alertaTeste,
      velocidade: $("regVelocidade").value.trim(),
      areaPorHora: $("regAreaPorHora").textContent,
      capacidadeReservatorio: $("regCapacidadeReservatorio").value.trim(),
      areaTotal: $("regAreaTotal").value.trim(),
      abastecimentos: $("regAbastecimentos").textContent,
      engrenagemRef: $("regEngrenagemRef").value.trim(),
    };
  }

  return {
    variante: "adubo", accent, data: dataHoje(),
    dose: $("regAduboDose").value.trim(),
    espacamento: $("regAduboEspacamento").value.trim(),
    metrosLineares: $("regAduboMetrosLineares").textContent,
    aduboKg: $("regAduboPorMetroKg").textContent,
    aduboG: $("regAduboPorMetroG").textContent,
  };
}
function nomeArquivoRegulagem(r, ext){
  const partes = ["regulagem", r.variante, r.data.replace(/\//g, "-")];
  return partes.join("_") + "." + ext;
}

// Cache da logo em Base64: convertida uma única vez (assim que a imagem do
// cabeçalho termina de carregar) pra getLogoSrc() nunca depender de conversão
// just-in-time no instante da impressão, quando pode não dar tempo.
let logoDataUrlCache = null;
function tentarCachearLogo(){
  const img = document.querySelector("header img");
  if(!img || !img.naturalWidth) return;
  try {
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth;
    cv.height = img.naturalHeight;
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    logoDataUrlCache = cv.toDataURL("image/png");
  } catch(e){ /* sem sorte agora; getLogoSrc tenta de novo na hora do PDF */ }
}
(() => {
  const img = document.querySelector("header img");
  if(!img) return;
  if(img.complete) tentarCachearLogo();
  else img.addEventListener("load", tentarCachearLogo, {once: true});
})();

// Extrai a logo do cabeçalho como DataURL (Base64), pra garantir que ela
// apareça na folha impressa/PDF mesmo sem acesso à rede.
function getLogoSrc(){
  if(logoDataUrlCache) return logoDataUrlCache;
  const img = document.querySelector("header img");
  if(!img) return "assets/logo.png";
  if(img.src.startsWith("data:")) return img.src;
  try {
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth || img.width || 120;
    cv.height = img.naturalHeight || img.height || 42;
    const ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    logoDataUrlCache = cv.toDataURL("image/png");
    return logoDataUrlCache;
  } catch(e){
    return img.src;
  }
}

// ---- PDF: monta a folha e chama a impressão (o navegador salva como PDF, offline)
function montarFolha(r){
  const esc = t => String(t == null ? "" : t).replace(/[&<>]/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[m]));
  const logo = getLogoSrc();
  const info = [["Cliente", r.cliente || "—"], [r.rotuloCultivar, r.cultivar || "—"], ["Cultura", r.cultura], ["Área", r.area]];

  const linhasHtml = r.linhas.map(l => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #EEF2EB;">
        <strong>${esc(l.nome)}</strong>${l.menor ? ' <span style="display:inline-block;background:rgba(35,107,86,0.10);color:#236B56;font-size:9px;font-weight:700;padding:2px 8px;border-radius:999px;margin-left:4px;">MENOR CUSTO</span>' : ""}
        <div style="color:#4B554F;font-size:10px;font-family:monospace;margin-top:2px;">${esc(l.qtd)}</div>
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #EEF2EB;text-align:right;font-family:monospace;white-space:nowrap;">${esc(l.precoVista)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #EEF2EB;text-align:right;font-family:monospace;white-space:nowrap;">${esc(l.precoPrazo)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #EEF2EB;text-align:right;font-family:monospace;font-weight:700;white-space:nowrap;">${esc(l.vista)}<div style="font-weight:400;font-size:9.5px;color:#4B554F;">${esc(l.vistaAlq)}</div></td>
      <td style="padding:10px 8px;border-bottom:1px solid #EEF2EB;text-align:right;font-family:monospace;font-weight:700;white-space:nowrap;">${esc(l.prazo)}<div style="font-weight:400;font-size:9.5px;color:#4B554F;">${esc(l.prazoAlq)}</div></td>
    </tr>`).join("");

  return `
  <div style="font-family:'Segoe UI',Arial,sans-serif;color:#1E2420;font-size:12px;">
    <div style="display:flex;align-items:center;gap:16px;padding-bottom:12px;border-bottom:1px solid #DCE3D6;">
      <img src="${logo}" alt="Coasul" style="height:42px;">
      <div style="width:1px;align-self:stretch;background:#DCE3D6;"></div>
      <div style="flex:1;">
        <div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#4B554F;font-weight:700;">Coasul Agro · Departamento Técnico</div>
        <div style="font-size:18px;font-weight:700;color:#1E2420;margin-top:2px;">Calculadora de Sementes e Adubação</div>
      </div>
      <div style="text-align:right;background:#F7FAF5;border:1px solid #DCE3D6;border-radius:8px;padding:8px 12px;font-size:10px;min-width:120px;">
        <div style="color:#4B554F;">${esc(r.data)}</div>
        <div style="font-family:monospace;font-weight:700;color:#1E2420;margin-top:2px;">${esc(r.ref)}</div>
      </div>
    </div>

    <div style="background:#F7FAF5;border:1px solid #DCE3D6;border-radius:8px;padding:8px 12px;margin-top:10px;font-size:10.5px;">
      <div style="color:#4B554F;">Gerado em ${esc(r.data)} às ${esc(r.horaGeracao)}</div>
      <div style="margin-top:2px;font-weight:700;color:#854F0B;">Preço válido apenas no momento da geração — pode haver alteração.</div>
    </div>

    <div style="display:flex;gap:10px;margin-top:12px;">
      ${info.map(([k, v]) => `
        <div style="flex:1;background:#F7FAF5;border:1px solid #DCE3D6;border-radius:8px;padding:8px 12px;">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#4B554F;font-weight:700;">${esc(k)}</div>
          <div style="font-size:13px;font-weight:700;margin-top:2px;">${esc(v)}</div>
        </div>`).join("")}
    </div>

    <div style="margin-top:6px;font-size:11px;color:#4B554F;">
      ${r.params.map(([k, v]) => `${esc(k)}: <strong style="color:#1E2420;">${esc(v)}</strong>`).join(" &nbsp;·&nbsp; ")}
    </div>

    <div style="margin-top:14px;background:#FFFFFF;border:1px solid #DCE3D6;border-radius:10px;padding:14px 16px;">
      <div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#4B554F;">Necessidade total</div>
      <div style="font-family:monospace;font-size:28px;font-weight:700;margin-top:2px;">${esc(r.total)} <span style="font-size:13px;font-weight:400;color:#4B554F;">${esc(r.unidade)}</span></div>
      ${r.combo ? `<div style="margin-top:6px;font-size:10.5px;color:#4B554F;">${esc(r.combo)}</div>` : ""}
    </div>

    ${r.nutrientes.length ? `
    <div style="margin-top:12px;font-size:11px;">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#4B554F;margin-bottom:4px;">Nutriente que será fornecido ao solo · total na área</div>
      ${r.nutrientes.map(n => `<span style="display:inline-block;background:#F7FAF5;border:1px solid #DCE3D6;border-radius:6px;padding:5px 9px;margin-right:6px;">${esc(n.nome)}: <strong>${esc(n.valor)}</strong> <span style="color:#4B554F;">(${esc(n.porAlq)})</span></span>`).join("")}
    </div>` : ""}

    ${r.comparador ? `
    <div style="margin-top:14px;">
      <div style="font-size:12px;font-weight:800;color:#4B554F;">Comparador de formulações <span style="font-weight:400;font-size:10.5px;">— ${esc(r.comparador.modo)}</span></div>
      <table style="width:100%;border-collapse:separate;border-spacing:0;margin-top:8px;font-size:11px;">
        <thead>
          <tr style="text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#4B554F;background:#F1F5ED;">
            <th style="padding:7px 8px;border-radius:6px 0 0 6px;">Formulação</th>
            <th style="padding:7px 8px;text-align:right;">Dose</th>
            <th style="padding:7px 8px;text-align:right;">R$/kg nutriente</th>
            <th style="padding:7px 8px;text-align:right;border-radius:0 6px 6px 0;">Custo total</th>
          </tr>
        </thead>
        <tbody>
          ${r.comparador.linhas.map(l => `
          <tr>
            <td style="padding:8px;border-bottom:1px solid #EEF2EB;">
              <strong style="font-family:monospace;">${esc(l.npk)}</strong> <span style="color:#4B554F;font-size:9.5px;">(${esc(l.somaNpk)}% NPK)</span>
              ${l.isMenorCusto ? ' <span style="display:inline-block;background:rgba(35,107,86,0.10);color:#236B56;font-size:8.5px;font-weight:700;padding:2px 7px;border-radius:999px;margin-left:2px;">MENOR CUSTO</span>' : ""}
              ${l.isMelhorCustoBeneficio ? ' <span style="display:inline-block;background:#236B56;color:#fff;font-size:8.5px;font-weight:700;padding:2px 7px;border-radius:999px;margin-left:2px;">★ MELHOR CUSTO-BENEFÍCIO</span>' : ""}
            </td>
            <td style="padding:8px;border-bottom:1px solid #EEF2EB;text-align:right;font-family:monospace;white-space:nowrap;">${esc(l.dose)}</td>
            <td style="padding:8px;border-bottom:1px solid #EEF2EB;text-align:right;font-family:monospace;font-weight:700;white-space:nowrap;">${esc(l.custoPorKgNutriente)}</td>
            <td style="padding:8px;border-bottom:1px solid #EEF2EB;text-align:right;font-family:monospace;font-weight:700;white-space:nowrap;">${esc(l.custoTotal)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>` : ""}

    <div style="margin-top:14px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <div style="font-size:12px;font-weight:800;color:#4B554F;">Custo por embalagem</div>
        <div style="font-size:10.5px;color:#4B554F;">${r.vencimento ? "Vencimento do prazo: <strong style='color:#1E2420;'>" + esc(r.vencimento) + "</strong> " + esc(r.vencimentoDias) : "Prazo sem data informada"}</div>
      </div>
      <table style="width:100%;border-collapse:separate;border-spacing:0;margin-top:8px;font-size:11px;">
        <thead>
          <tr style="text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#4B554F;background:#F1F5ED;">
            <th style="padding:7px 8px;border-radius:6px 0 0 6px;">Embalagem</th>
            <th style="padding:7px 8px;text-align:right;">Preço à vista</th>
            <th style="padding:7px 8px;text-align:right;">Preço a prazo</th>
            <th style="padding:7px 8px;text-align:right;">Custo à vista</th>
            <th style="padding:7px 8px;text-align:right;border-radius:0 6px 6px 0;">Custo a prazo</th>
          </tr>
        </thead>
        <tbody>${linhasHtml}</tbody>
      </table>
      <div style="margin-top:6px;font-size:10px;color:#4B554F;">Bag e sacaria são alternativas de compra — os custos das linhas não se somam. Quantidades arredondadas para embalagem fechada.</div>
    </div>

    <div style="margin-top:16px;border-top:1px solid #DCE3D6;padding-top:8px;font-size:9.5px;color:#4B554F;">
      <div>Calculadora Coasul — versão ${APP_VERSION}</div>
      <div>Documento de uso interno — não substitui recomendação agronômica oficial. Valores sujeitos a conferência pelo técnico responsável.</div>
      <div>Gerado em ${esc(new Date().toLocaleString("pt-BR", {day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit"}))}</div>
    </div>
  </div>`;
}

// PDF da Regulagem de Plantadeira: mesma tecnica (HTML jogado em #printSheet,
// impressao do navegador salva como PDF), so que com o layout dos campos de
// regulagem (semente ou adubo, conforme a sub-aba ativa) em vez da ficha de
// sementes/adubacao.
function montarFolhaRegulagem(r){
  const esc = t => String(t == null ? "" : t).replace(/[&<>]/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[m]));
  const logo = getLogoSrc();
  const num = (v, suf) => v ? String(v).replace(".", ",") + (suf || "") : "—";
  const bloco = (k, v) => `
    <td style="padding:8px 12px;background:#F7FAF5;border:1px solid #DCE3D6;border-radius:8px;">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#4B554F;font-weight:700;">${esc(k)}</div>
      <div style="font-size:13px;font-weight:700;margin-top:2px;">${esc(v)}</div>
    </td>`;

  const corpo = r.variante === "semente" ? `
    <table style="width:100%;margin-top:12px;border-collapse:separate;border-spacing:10px 0;">
      <tr>${bloco("Stand de plantas", num(r.populacao, " plantas/ha"))}${bloco("Espaçamento", num(r.espacamento, " m"))}${bloco("Germinação", num(r.germinacao, "%"))}</tr>
    </table>

    <div style="margin-top:14px;background:#FFFFFF;border:1px solid #DCE3D6;border-radius:10px;padding:14px 16px;">
      <div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#4B554F;">Plantas por metro linear</div>
      <div style="font-family:monospace;font-size:28px;font-weight:700;margin-top:2px;">${esc(r.plantasMetro)} <span style="font-size:13px;font-weight:400;color:#4B554F;">plantas/m</span></div>
      <div style="margin-top:6px;font-size:10.5px;color:#4B554F;">Plantas/ha: <strong style="color:#1E2420;">${esc(r.plantasHa)}</strong> &nbsp;·&nbsp; Metros lineares/ha: <strong style="color:#1E2420;">${esc(r.metrosLineares)}</strong></div>
    </div>

    <div style="margin-top:18px;font-size:12px;font-weight:800;color:#4B554F;">Regulagem avançada</div>
    <table style="width:100%;margin-top:8px;border-collapse:separate;border-spacing:10px;font-size:11px;">
      <tr>
        <td style="padding:12px;background:#F7FAF5;border:1px solid #DCE3D6;border-radius:8px;vertical-align:top;width:50%;">
          <div style="font-weight:700;">Linhas da plantadeira</div>
          <div style="margin-top:4px;">Nº de linhas: <strong style="font-family:monospace;">${esc(r.numLinhas || "—")}</strong></div>
          <div>Sementes por metro de linha: <strong style="font-family:monospace;">${esc(r.plantasMetro)}</strong></div>
        </td>
        <td style="padding:12px;background:#F7FAF5;border:1px solid #DCE3D6;border-radius:8px;vertical-align:top;width:50%;">
          <div style="font-weight:700;">Teste de campo (${esc(r.testeMetros)} metros)</div>
          <div style="margin-top:4px;">Esperadas por linha: <strong style="font-family:monospace;">${esc(r.esperadoPorLinha)}</strong></div>
          <div>Esperadas em ${esc(r.numLinhas || "0")} linhas: <strong style="font-family:monospace;">${esc(r.esperadoTotal)}</strong></div>
          ${r.coletadas ? `<div>Coletadas no teste: <strong style="font-family:monospace;">${esc(r.coletadas)}</strong></div>` : ""}
          ${r.alertaTeste ? `<div style="margin-top:4px;color:#8A5A00;font-weight:700;">⚠ ${esc(r.alertaTeste)}</div>` : ""}
        </td>
      </tr>
      <tr>
        <td style="padding:12px;background:#F7FAF5;border:1px solid #DCE3D6;border-radius:8px;vertical-align:top;">
          <div style="font-weight:700;">Velocidade de plantio</div>
          <div style="margin-top:4px;">Velocidade: <strong>${esc(num(r.velocidade, " km/h"))}</strong></div>
          <div>Área plantada por hora: <strong style="font-family:monospace;">${esc(r.areaPorHora)} ha/h</strong></div>
        </td>
        <td style="padding:12px;background:#F7FAF5;border:1px solid #DCE3D6;border-radius:8px;vertical-align:top;">
          <div style="font-weight:700;">Reservatório de sementes</div>
          <div style="margin-top:4px;">Capacidade: <strong>${esc(r.capacidadeReservatorio || "—")}</strong> sementes &nbsp;·&nbsp; Área total: <strong>${esc(num(r.areaTotal, " ha"))}</strong></div>
          <div>Abastecimentos necessários: <strong style="font-family:monospace;">${esc(r.abastecimentos)}</strong></div>
        </td>
      </tr>
      ${r.engrenagemRef ? `
      <tr>
        <td colspan="2" style="padding:12px;background:#F7FAF5;border:1px solid #DCE3D6;border-radius:8px;">
          <div style="font-weight:700;">Engrenagem/disco (referência do manual do fabricante)</div>
          <div style="margin-top:4px;">${esc(r.engrenagemRef)}</div>
        </td>
      </tr>` : ""}
    </table>
  ` : `
    <table style="width:100%;margin-top:12px;border-collapse:separate;border-spacing:10px 0;">
      <tr>${bloco("Adubo", num(r.dose, " kg/ha"))}${bloco("Espaçamento", num(r.espacamento, " m"))}</tr>
    </table>

    <div style="margin-top:14px;background:#FFFFFF;border:1px solid #DCE3D6;border-radius:10px;padding:14px 16px;">
      <div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#4B554F;">Adubo por metro linear</div>
      <div style="font-family:monospace;font-size:28px;font-weight:700;margin-top:2px;">${esc(r.aduboG)} <span style="font-size:13px;font-weight:400;color:#4B554F;">g/m</span></div>
      <div style="margin-top:6px;font-size:10.5px;color:#4B554F;">Metros lineares/ha: <strong style="color:#1E2420;">${esc(r.metrosLineares)}</strong> &nbsp;·&nbsp; Adubo/m: <strong style="color:#1E2420;">${esc(r.aduboKg)} kg</strong></div>
    </div>
  `;

  return `
  <div style="font-family:'Segoe UI',Arial,sans-serif;color:#1E2420;font-size:12px;">
    <div style="display:flex;align-items:center;gap:16px;padding-bottom:12px;border-bottom:1px solid #DCE3D6;">
      <img src="${logo}" alt="Coasul" style="height:42px;">
      <div style="width:1px;align-self:stretch;background:#DCE3D6;"></div>
      <div style="flex:1;">
        <div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#4B554F;font-weight:700;">Coasul Agro · Departamento Técnico</div>
        <div style="font-size:18px;font-weight:700;color:#1E2420;margin-top:2px;">Regulagem de Plantadeira · ${r.variante === "semente" ? "Semente" : "Adubo"}</div>
      </div>
      <div style="text-align:right;background:#F7FAF5;border:1px solid #DCE3D6;border-radius:8px;padding:8px 12px;font-size:10px;min-width:100px;">
        <div style="color:#4B554F;">${esc(r.data)}</div>
      </div>
    </div>

    ${corpo}

    <div style="margin-top:16px;border-top:1px solid #DCE3D6;padding-top:8px;font-size:9.5px;color:#4B554F;">
      <div>Calculadora Coasul — versão ${APP_VERSION}</div>
      <div>Documento de uso interno — não substitui recomendação agronômica oficial. Valores sujeitos a conferência pelo técnico responsável.</div>
      <div>Gerado em ${esc(new Date().toLocaleString("pt-BR", {day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit"}))}</div>
    </div>
  </div>`;
}

$("btnPdf").addEventListener("click", async () => {
  if(!$("viewRegulagem").classList.contains("hidden")){
    const r = coletarResumoRegulagem();
    $("printSheet").innerHTML = montarFolhaRegulagem(r);
  } else if(!$("viewCalagem").classList.contains("hidden")){
    const r = coletarResumoCalagem();
    $("printSheet").innerHTML = montarFolhaCalagem(r);
  } else {
    const r = coletarResumo();
    $("printSheet").innerHTML = montarFolha(r);
  }
  const img = $("printSheet").querySelector("img");
  if(img) await img.decode().catch(() => {});
  window.print();
});

// ---- Imagem (PNG): desenhada no canvas, sem depender de biblioteca
const FONTE = "'Segoe UI',Arial,sans-serif";
const MONO = "Consolas,'SFMono-Regular',Menlo,monospace";

function texto(ctx, draw, s, x, y, o){
  o = o || {};
  ctx.letterSpacing = o.espaco || "0px";
  ctx.font = o.font || ("13px " + FONTE);
  ctx.textAlign = o.align || "left";
  ctx.fillStyle = o.cor || "#1E2420";
  let str = String(s == null ? "" : s);
  if(o.maxW) str = cortaTexto(ctx, str, o.maxW);
  if(draw) ctx.fillText(str, x, y);
  ctx.letterSpacing = "0px";
}
function cortaTexto(ctx, s, maxW){
  if(ctx.measureText(s).width <= maxW) return s;
  let out = s;
  while(out.length > 1 && ctx.measureText(out + "…").width > maxW) out = out.slice(0, -1);
  return out + "…";
}
function quebraTexto(ctx, s, maxW){
  const palavras = String(s).split(" ");
  const linhas = [];
  let atual = "";
  palavras.forEach(p => {
    const teste = atual ? atual + " " + p : p;
    if(ctx.measureText(teste).width > maxW && atual){ linhas.push(atual); atual = p; }
    else atual = teste;
  });
  if(atual) linhas.push(atual);
  return linhas;
}
function caixa(ctx, draw, x, y, w, h, raio, fundo, borda){
  if(!draw) return;
  ctx.beginPath();
  if(ctx.roundRect) ctx.roundRect(x, y, w, h, raio);
  else ctx.rect(x, y, w, h);
  if(fundo){ ctx.fillStyle = fundo; ctx.fill(); }
  if(borda){ ctx.strokeStyle = borda; ctx.lineWidth = 1.5; ctx.stroke(); }
}
function risco(ctx, draw, x1, y, x2, cor){
  if(!draw) return;
  ctx.strokeStyle = cor || "#DCE3D6"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x1, y + .5); ctx.lineTo(x2, y + .5); ctx.stroke();
}

function layoutFicha(ctx, draw, r, logo){
  const W = 1000, P = 40, dir = W - P;
  let y = P;

  // cabeçalho com o logo
  const logoH = 44, logoW = logo && logo.naturalWidth ? logoH * logo.naturalWidth / logo.naturalHeight : 60;
  if(draw && logo) ctx.drawImage(logo, P, y, logoW, logoH);
  const xt = P + logoW + 16;
  texto(ctx, draw, "COASUL AGRO · FICHA DE COTAÇÃO", xt, y + 14, {font:"bold 10px " + FONTE, cor:"#4B554F", espaco:"1.6px"});
  const iconSize = 19;
  drawIcon(ctx, draw, r.icone, xt, y + 36 - iconSize + 3, iconSize, r.accent);
  texto(ctx, draw, `${r.cultura}${r.cultivar ? " · " + r.cultivar : ""}`, xt + iconSize + 7, y + 36, {font:"600 21px " + FONTE, maxW:dir - xt - iconSize - 7 - 110});
  texto(ctx, draw, r.data, dir, y + 14, {font:"11px " + FONTE, cor:"#4B554F", align:"right"});
  y += logoH + 12;
  risco(ctx, draw, P, y, dir, r.accent);
  if(draw){ ctx.fillStyle = r.accent; ctx.fillRect(P, y, dir - P, 2.5); }
  y += 20;

  // referência rápida da ficha: código não sequencial (derivado da data/hora
  // da geração), horário completo e aviso de que o preço vale só na hora
  const refH = 56;
  caixa(ctx, draw, P, y, dir - P, refH, 10, "#F7FAF5");
  texto(ctx, draw, "REF", P + 12, y + 16, {font:"bold 8px " + FONTE, cor:"#4B554F", espaco:"0.8px"});
  texto(ctx, draw, r.ref, dir - 12, y + 16, {font:"bold 11px " + MONO, align:"right"});
  texto(ctx, draw, `Gerado em ${r.data} às ${r.horaGeracao}`, P + 12, y + 31, {font:"10px " + FONTE, cor:"#4B554F"});
  texto(ctx, draw, "Preço válido apenas no momento da geração — pode haver alteração.", P + 12, y + 46, {font:"bold 10px " + FONTE, cor:"#854F0B", maxW:dir - P - 24});
  y += refH + 12;

  // cliente / cultivar / cultura / área
  const info = [["Cliente", r.cliente || "—"], [r.rotuloCultivar, r.cultivar || "—"], ["Cultura", r.cultura], ["Área", r.area]];
  const gap = 10, bw = (dir - P - gap * 3) / 4, bh = 48;
  info.forEach(([k, v], i) => {
    const x = P + i * (bw + gap);
    caixa(ctx, draw, x, y, bw, bh, 8, "#F7FAF5", "#DCE3D6");
    texto(ctx, draw, k.toUpperCase(), x + 10, y + 17, {font:"bold 9px " + FONTE, cor:"#4B554F", espaco:"0.6px", maxW:bw - 20});
    texto(ctx, draw, v, x + 10, y + 36, {font:"bold 14px " + FONTE, maxW:bw - 20});
  });
  y += bh + 14;

  // parâmetros usados no cálculo
  if(r.params.length){
    const linha = r.params.map(([k, v]) => `${k}: ${v}`).join("   ·   ");
    ctx.font = "11.5px " + FONTE;
    quebraTexto(ctx, linha, dir - P).forEach(l => {
      texto(ctx, draw, l, P, y + 10, {font:"11.5px " + FONTE, cor:"#4B554F"});
      y += 16;
    });
    y += 6;
  }

  // necessidade total
  ctx.font = "10.5px " + FONTE;
  const comboLinhas = r.combo ? quebraTexto(ctx, r.combo, dir - P - 28) : [];
  const alturaTotal = 78 + (comboLinhas.length ? comboLinhas.length * 14 + 6 : 0);
  caixa(ctx, draw, P, y, dir - P, alturaTotal, 10, "#FFFFFF", "#DCE3D6");
  texto(ctx, draw, "NECESSIDADE TOTAL", P + 14, y + 22, {font:"bold 10px " + FONTE, cor:"#4B554F", espaco:"1.2px"});
  texto(ctx, draw, r.total, P + 14, y + 58, {font:"bold 30px " + MONO});
  if(draw){
    ctx.font = "bold 30px " + MONO;
    const w = ctx.measureText(r.total).width;
    texto(ctx, draw, r.unidade, P + 22 + w, y + 58, {font:"13px " + FONTE, cor:"#4B554F"});
  }
  comboLinhas.forEach((l, i) => texto(ctx, draw, l, P + 14, y + 78 + i * 14, {font:"10.5px " + FONTE, cor:"#4B554F"}));
  y += alturaTotal + 18;

  // nutrientes (adubação)
  if(r.nutrientes.length){
    texto(ctx, draw, "NUTRIENTE QUE SERÁ FORNECIDO AO SOLO · TOTAL NA ÁREA", P, y + 10, {font:"bold 9.5px " + FONTE, cor:"#4B554F", espaco:"0.6px"});
    y += 20;
    const nw = (dir - P - 20) / 3, nh = 44;
    r.nutrientes.forEach((n, i) => {
      const x = P + i * (nw + 10);
      caixa(ctx, draw, x, y, nw, nh, 8, "#F7FAF5", "#DCE3D6");
      texto(ctx, draw, n.nome, x + 10, y + 16, {font:"bold 9.5px " + FONTE, cor:"#4B554F", maxW:nw - 20});
      texto(ctx, draw, n.valor, x + 10, y + 33, {font:"bold 14px " + MONO, maxW:nw - 20});
      texto(ctx, draw, n.porAlq, x + nw - 10, y + 33, {font:"9.5px " + FONTE, cor:"#4B554F", align:"right"});
    });
    y += nh + 18;
  }

  // comparador de formulações (adubação/ureia)
  if(r.comparador){
    texto(ctx, draw, `COMPARADOR DE FORMULAÇÕES — ${r.comparador.modo.toUpperCase()}`, P, y + 10, {font:"bold 9.5px " + FONTE, cor:"#4B554F", espaco:"0.6px"});
    y += 20;
    caixa(ctx, draw, P, y, dir - P, 22, 6, "#F1F5ED");
    texto(ctx, draw, "FORMULAÇÃO", P + 8, y + 14, {font:"bold 9px " + FONTE, cor:"#4B554F", espaco:"0.5px"});
    const cDose = dir - 260, cRs = dir - 130, cTotal = dir;
    [["DOSE", cDose], ["R$/KG NUTRIENTE", cRs], ["CUSTO TOTAL", cTotal - 8]]
      .forEach(([t, x]) => texto(ctx, draw, t, x, y + 14, {font:"bold 9px " + FONTE, cor:"#4B554F", align:"right", espaco:"0.5px"}));
    y += 30;
    r.comparador.linhas.forEach(l => {
      const nomeMaxW = cDose - P - 16;
      texto(ctx, draw, l.npk, P, y + 15, {font:"bold 12px " + MONO, maxW:nomeMaxW});
      ctx.font = "bold 12px " + MONO;
      const wn = ctx.measureText(l.npk).width;
      texto(ctx, draw, `(${l.somaNpk}% NPK)`, P + wn + 8, y + 15, {font:"10px " + FONTE, cor:"#4B554F"});
      if(l.isMelhorCustoBeneficio){
        texto(ctx, draw, "★ MELHOR CUSTO-BENEFÍCIO", P, y + 30, {font:"bold 8.5px " + FONTE, cor:"#236B56"});
      } else if(l.isMenorCusto){
        texto(ctx, draw, "MENOR CUSTO", P, y + 30, {font:"bold 8.5px " + FONTE, cor:"#236B56"});
      }
      texto(ctx, draw, l.dose, cDose, y + 16, {font:"11px " + MONO, cor:"#4B554F", align:"right"});
      texto(ctx, draw, l.custoPorKgNutriente, cRs, y + 16, {font:"bold 12px " + MONO, align:"right"});
      texto(ctx, draw, l.custoTotal, cTotal, y + 16, {font:"bold 12px " + MONO, align:"right"});
      y += 40;
      risco(ctx, draw, P, y, dir, "#EEF2EB");
      y += 4;
    });
    y += 14;
  }

  // tabela de custos
  texto(ctx, draw, "Custo por embalagem", P, y + 12, {font:"bold 13px " + FONTE, cor:"#4B554F"});
  texto(ctx, draw, r.vencimento ? `Vencimento do prazo: ${r.vencimento} ${r.vencimentoDias}` : "Prazo sem data informada",
        dir, y + 12, {font:"10.5px " + FONTE, cor:"#4B554F", align:"right"});
  y += 24;

  const colMoeda = 152;
  const x4 = dir, x3 = dir - colMoeda, x2 = dir - colMoeda * 2, x1 = dir - colMoeda * 3;
  const larguraNome = x1 - colMoeda - P + colMoeda - 12;
  caixa(ctx, draw, P, y, dir - P, 22, 6, "#F1F5ED");
  texto(ctx, draw, "EMBALAGEM", P + 8, y + 14, {font:"bold 9px " + FONTE, cor:"#4B554F", espaco:"0.5px"});
  [["PREÇO À VISTA", x1], ["PREÇO A PRAZO", x2], ["CUSTO À VISTA", x3], ["CUSTO A PRAZO", x4 - 8]]
    .forEach(([t, x]) => texto(ctx, draw, t, x, y + 14, {font:"bold 9px " + FONTE, cor:"#4B554F", align:"right", espaco:"0.5px"}));
  y += 30;

  r.linhas.forEach(l => {
    const alt = 44;
    texto(ctx, draw, l.nome, P, y + 17, {font:"bold 12.5px " + FONTE, maxW:larguraNome - (l.menor ? 92 : 0)});
    if(l.menor){
      ctx.font = "bold 12.5px " + FONTE;
      const wn = Math.min(ctx.measureText(l.nome).width, larguraNome - 92);
      caixa(ctx, draw, P + wn + 8, y + 5, 84, 16, 8, "rgba(35,107,86,0.12)", null);
      texto(ctx, draw, "MENOR CUSTO", P + wn + 14, y + 16, {font:"bold 8.5px " + FONTE, cor:"#236B56"});
    }
    texto(ctx, draw, l.qtd, P, y + 33, {font:"10.5px " + MONO, cor:"#4B554F", maxW:larguraNome});
    texto(ctx, draw, l.precoVista, x1, y + 20, {font:"11.5px " + MONO, cor:"#4B554F", align:"right", maxW:colMoeda - 10});
    texto(ctx, draw, l.precoPrazo, x2, y + 20, {font:"11.5px " + MONO, cor:"#4B554F", align:"right", maxW:colMoeda - 10});
    texto(ctx, draw, l.vista, x3, y + 18, {font:"bold 13px " + MONO, align:"right"});
    texto(ctx, draw, l.vistaAlq, x3, y + 32, {font:"9.5px " + FONTE, cor:"#4B554F", align:"right"});
    texto(ctx, draw, l.prazo, x4, y + 18, {font:"bold 13px " + MONO, align:"right"});
    texto(ctx, draw, l.prazoAlq, x4, y + 32, {font:"9.5px " + FONTE, cor:"#4B554F", align:"right"});
    y += alt;
    risco(ctx, draw, P, y, dir, "#EEF2EB");
    y += 4;
  });

  y += 6;
  texto(ctx, draw, "Bag e sacaria são alternativas de compra — os custos das linhas não se somam. Quantidades arredondadas para embalagem fechada.",
        P, y + 10, {font:"10px " + FONTE, cor:"#4B554F", maxW:dir - P});
  y += 24;
  risco(ctx, draw, P, y, dir);
  texto(ctx, draw, "Gerado pela Calculadora de Sementes e Adubação · Coasul — valores sujeitos a conferência pelo técnico.",
        P, y + 18, {font:"9.5px " + FONTE, cor:"#4B554F"});
  y += 30;

  return { largura:W, altura:y + P - 20 };
}

function desenharFicha(r){
  const logo = document.querySelector("header img");
  const medidor = document.createElement("canvas").getContext("2d");
  const dim = layoutFicha(medidor, false, r, logo);

  const escala = 2;
  const cv = document.createElement("canvas");
  cv.width = dim.largura * escala;
  cv.height = dim.altura * escala;
  const ctx = cv.getContext("2d");
  ctx.scale(escala, escala);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, dim.largura, dim.altura);
  ctx.textBaseline = "alphabetic";
  layoutFicha(ctx, true, r, logo);
  return cv;
}

// Imagem (PNG) da Regulagem de Plantadeira: mesma tecnica de duas passadas
// (medir sem desenhar, depois desenhar) do layoutFicha() das sementes/adubacao,
// reaproveitando os mesmos helpers (texto/caixa/risco/quebraTexto) -- so que
// com o layout dos campos de regulagem em vez da ficha de cotacao.
function layoutFichaRegulagem(ctx, draw, r, logo){
  const W = 1000, P = 40, dir = W - P;
  let y = P;
  const num = (v, suf) => v ? String(v).replace(".", ",") + (suf || "") : "—";

  const logoH = 44, logoW = logo && logo.naturalWidth ? logoH * logo.naturalWidth / logo.naturalHeight : 60;
  if(draw && logo) ctx.drawImage(logo, P, y, logoW, logoH);
  const xt = P + logoW + 16;
  texto(ctx, draw, "COASUL AGRO · FICHA DE REGULAGEM", xt, y + 14, {font:"bold 10px " + FONTE, cor:"#4B554F", espaco:"1.6px"});
  const iconSize = 18;
  drawIcon(ctx, draw, "regua", xt, y + 36 - iconSize + 3, iconSize, r.accent);
  texto(ctx, draw, `Regulagem de Plantadeira · ${r.variante === "semente" ? "Semente" : "Adubo"}`, xt + iconSize + 7, y + 36, {font:"600 20px " + FONTE, maxW:dir - xt - iconSize - 7 - 110});
  texto(ctx, draw, r.data, dir, y + 14, {font:"11px " + FONTE, cor:"#4B554F", align:"right"});
  y += logoH + 12;
  risco(ctx, draw, P, y, dir, r.accent);
  if(draw){ ctx.fillStyle = r.accent; ctx.fillRect(P, y, dir - P, 2.5); }
  y += 20;

  function cartao(titulo, linhas, x, yy, largura){
    ctx.font = "10.5px " + FONTE;
    const alturaLinhas = linhas.reduce((h, l) => h + quebraTexto(ctx, l, largura - 24).length * 15, 0);
    const altura = 36 + alturaLinhas + 10;
    caixa(ctx, draw, x, yy, largura, altura, 8, "#F7FAF5", "#DCE3D6");
    texto(ctx, draw, titulo, x + 12, yy + 18, {font:"bold 11px " + FONTE, cor:"#4B554F", maxW:largura - 24});
    let ly = yy + 36;
    linhas.forEach(l => {
      quebraTexto(ctx, l, largura - 24).forEach(parte => {
        texto(ctx, draw, parte, x + 12, ly, {font:"10.5px " + FONTE, cor:"#3A423C"});
        ly += 15;
      });
    });
    return altura;
  }

  if(r.variante === "semente"){
    const info = [["Stand de plantas", num(r.populacao, " plantas/ha")], ["Espaçamento", num(r.espacamento, " m")], ["Germinação", num(r.germinacao, "%")]];
    const gap = 10, bw = (dir - P - gap * 2) / 3, bh = 48;
    info.forEach(([k, v], i) => {
      const x = P + i * (bw + gap);
      caixa(ctx, draw, x, y, bw, bh, 8, "#F7FAF5", "#DCE3D6");
      texto(ctx, draw, k.toUpperCase(), x + 10, y + 17, {font:"bold 9px " + FONTE, cor:"#4B554F", espaco:"0.6px", maxW:bw - 20});
      texto(ctx, draw, v, x + 10, y + 36, {font:"bold 14px " + FONTE, maxW:bw - 20});
    });
    y += bh + 18;

    caixa(ctx, draw, P, y, dir - P, 78, 10, "#FFFFFF", "#DCE3D6");
    texto(ctx, draw, "PLANTAS POR METRO LINEAR", P + 14, y + 22, {font:"bold 10px " + FONTE, cor:"#4B554F", espaco:"1.2px"});
    texto(ctx, draw, r.plantasMetro, P + 14, y + 58, {font:"bold 30px " + MONO});
    if(draw){
      ctx.font = "bold 30px " + MONO;
      const w = ctx.measureText(r.plantasMetro).width;
      texto(ctx, draw, "plantas/m", P + 22 + w, y + 58, {font:"13px " + FONTE, cor:"#4B554F"});
    }
    y += 78 + 10;
    texto(ctx, draw, `Plantas/ha: ${r.plantasHa}   ·   Metros lineares/ha: ${r.metrosLineares}`, P, y, {font:"10.5px " + FONTE, cor:"#4B554F"});
    y += 26;

    texto(ctx, draw, "Regulagem avançada", P, y + 4, {font:"bold 13px " + FONTE, cor:"#4B554F"});
    y += 22;

    const cw = (dir - P - 12) / 2;
    const linhasTeste = [
      `Teste recomendado: ${r.testeMetros} metros`,
      `Sementes esperadas por linha: ${r.esperadoPorLinha}`,
      `Sementes esperadas em ${r.numLinhas || "0"} linhas: ${r.esperadoTotal}`,
    ];
    if(r.coletadas) linhasTeste.push(`Sementes coletadas: ${r.coletadas}`);
    if(r.alertaTeste) linhasTeste.push(`⚠ ${r.alertaTeste}`);

    const h1a = cartao(`Nº de linhas: ${r.numLinhas || "—"}`, [`Sementes por metro de linha: ${r.plantasMetro}`], P, y, cw);
    const h1b = cartao("Teste de campo", linhasTeste, P + cw + 12, y, cw);
    y += Math.max(h1a, h1b) + 12;

    const linhasVeloc = [`Velocidade: ${num(r.velocidade, " km/h")}`, `Área plantada por hora: ${r.areaPorHora} ha/h`];
    const linhasReserv = [`Capacidade: ${r.capacidadeReservatorio || "—"} sementes`, `Área total: ${num(r.areaTotal, " ha")}`, `Abastecimentos necessários: ${r.abastecimentos}`];
    const h2a = cartao("Velocidade de plantio", linhasVeloc, P, y, cw);
    const h2b = cartao("Reservatório de sementes", linhasReserv, P + cw + 12, y, cw);
    y += Math.max(h2a, h2b) + 12;

    if(r.engrenagemRef){
      const h3 = cartao("Engrenagem/disco (referência do manual do fabricante)", [r.engrenagemRef], P, y, dir - P);
      y += h3 + 12;
    }
  } else {
    const info = [["Adubo", num(r.dose, " kg/ha")], ["Espaçamento", num(r.espacamento, " m")]];
    const gap = 10, bw = (dir - P - gap) / 2, bh = 48;
    info.forEach(([k, v], i) => {
      const x = P + i * (bw + gap);
      caixa(ctx, draw, x, y, bw, bh, 8, "#F7FAF5", "#DCE3D6");
      texto(ctx, draw, k.toUpperCase(), x + 10, y + 17, {font:"bold 9px " + FONTE, cor:"#4B554F", espaco:"0.6px", maxW:bw - 20});
      texto(ctx, draw, v, x + 10, y + 36, {font:"bold 14px " + FONTE, maxW:bw - 20});
    });
    y += bh + 18;

    caixa(ctx, draw, P, y, dir - P, 78, 10, "#FFFFFF", "#DCE3D6");
    texto(ctx, draw, "ADUBO POR METRO LINEAR", P + 14, y + 22, {font:"bold 10px " + FONTE, cor:"#4B554F", espaco:"1.2px"});
    texto(ctx, draw, r.aduboG, P + 14, y + 58, {font:"bold 30px " + MONO});
    if(draw){
      ctx.font = "bold 30px " + MONO;
      const w = ctx.measureText(r.aduboG).width;
      texto(ctx, draw, "g/m", P + 22 + w, y + 58, {font:"13px " + FONTE, cor:"#4B554F"});
    }
    y += 78 + 10;
    texto(ctx, draw, `Metros lineares/ha: ${r.metrosLineares}   ·   Adubo/m: ${r.aduboKg} kg`, P, y, {font:"10.5px " + FONTE, cor:"#4B554F"});
    y += 26;
  }

  risco(ctx, draw, P, y, dir);
  texto(ctx, draw, "Gerado pela ficha de Regulagem de Plantadeira · Coasul — valores sujeitos a conferência pelo técnico.",
        P, y + 18, {font:"9.5px " + FONTE, cor:"#4B554F"});
  y += 30;

  return { largura:W, altura:y + P - 20 };
}
function desenharFichaRegulagem(r){
  const logo = document.querySelector("header img");
  const medidor = document.createElement("canvas").getContext("2d");
  const dim = layoutFichaRegulagem(medidor, false, r, logo);

  const escala = 2;
  const cv = document.createElement("canvas");
  cv.width = dim.largura * escala;
  cv.height = dim.altura * escala;
  const ctx = cv.getContext("2d");
  ctx.scale(escala, escala);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, dim.largura, dim.altura);
  ctx.textBaseline = "alphabetic";
  layoutFichaRegulagem(ctx, true, r, logo);
  return cv;
}

function baixar(href, nome){
  const a = document.createElement("a");
  a.href = href; a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Compartilha a imagem via Web Share API (abre a folha nativa do celular —
// WhatsApp, e-mail etc. — sem precisar baixar no disco primeiro); cai pro
// download tradicional (baixar()) quando a API não existe, quando o
// navegador não sabe compartilhar arquivos, ou se o compartilhamento falhar
// por outro motivo que não o usuário simplesmente ter cancelado.
async function compartilharOuBaixarImagem(cv, nomeArq){
  if(navigator.share && navigator.canShare){
    try {
      const blob = await new Promise(resolve => cv.toBlob(resolve, "image/png"));
      const file = new File([blob], nomeArq, { type: "image/png" });
      if(navigator.canShare({ files: [file] })){
        await navigator.share({ title: "Cotação Coasul", files: [file] });
        return;
      }
    } catch(e){
      if(e && e.name === "AbortError") return; // usuário cancelou a folha de compartilhamento
      // qualquer outro erro (ex.: canShare/share indisponível de fato): cai pro download abaixo
    }
  }
  baixar(cv.toDataURL("image/png"), nomeArq);
}

$("btnPng").addEventListener("click", () => {
  if(!$("viewRegulagem").classList.contains("hidden")){
    const r = coletarResumoRegulagem();
    const cv = desenharFichaRegulagem(r);
    compartilharOuBaixarImagem(cv, nomeArquivoRegulagem(r, "png"));
    return;
  }
  if(!$("viewCalagem").classList.contains("hidden")){
    const r = coletarResumoCalagem();
    const cv = desenharFichaCalagem(r);
    compartilharOuBaixarImagem(cv, nomeArquivoCalagem(r, "png"));
    return;
  }
  const r = coletarResumo();
  const cv = desenharFicha(r);
  compartilharOuBaixarImagem(cv, nomeArquivo(r, "png"));
});

// ---------- Envio de cotação formatada no WhatsApp ----------
// Monta o texto a partir da mesma ficha (resumo) já usada pelo PDF/PNG desta
// aba — a formatação em si (montarTextoWhatsApp*) é pura e mora em
// calculos.js; aqui só decide qual das três chamar, conforme a ferramenta
// ativa no momento (Sementes/Adubação, Regulagem ou Calagem).
function montarTextoWhatsAppAtual(){
  if(!$("viewRegulagem").classList.contains("hidden")){
    return montarTextoWhatsAppRegulagem(coletarResumoRegulagem());
  }
  if(!$("viewCalagem").classList.contains("hidden")){
    return montarTextoWhatsAppCalagem(coletarResumoCalagem());
  }
  return montarTextoWhatsApp(coletarResumo());
}

const whatsappModal = $("whatsappModal");

function abrirModalWhatsApp(){
  const texto = montarTextoWhatsAppAtual();
  $("modalWaText").value = texto;
  whatsappModal.classList.remove("hidden");
}
function fecharModalWhatsApp(){
  whatsappModal.classList.add("hidden");
}

$("btnWhatsapp").addEventListener("click", abrirModalWhatsApp);
$("modalWaClose").addEventListener("click", fecharModalWhatsApp);
whatsappModal.addEventListener("click", e => { if(e.target === whatsappModal) fecharModalWhatsApp(); });
document.addEventListener("keydown", e => {
  if(e.key === "Escape" && !whatsappModal.classList.contains("hidden")) fecharModalWhatsApp();
});

$("modalWaSend").addEventListener("click", () => {
  const texto = $("modalWaText").value;
  window.open("https://api.whatsapp.com/send?text=" + encodeURIComponent(texto), "_blank");
});

let toastTimer = null;
function mostrarToast(mensagem){
  const toast = $("appToast");
  $("appToastText").textContent = mensagem;
  toast.classList.remove("hidden");
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
    toast.classList.add("hidden");
  }, 2500);
}

$("modalWaCopy").addEventListener("click", async () => {
  const texto = $("modalWaText").value;
  try {
    await navigator.clipboard.writeText(texto);
  } catch(e){
    // clipboard-write pode ser bloqueado (contexto não-seguro, permissão negada
    // etc.) — mesmo assim o texto já está selecionável/selecionado na textarea
    $("modalWaText").select();
    document.execCommand("copy");
  }
  mostrarToast("Texto copiado com sucesso!");
});

// ---- Alternância entre as três ferramentas: calculadora de sementes,
// regulagem de plantadeira e calagem & gessagem
const viewBtnCalc = $("viewBtnCalc");
const viewBtnReg = $("viewBtnReg");
const viewBtnCalagem = $("viewBtnCalagem");
const viewCalculadora = $("viewCalculadora");
const viewRegulagem = $("viewRegulagem");
const viewCalagem = $("viewCalagem");
let emCalagem = false; // sinaliza que o accent atual é o da Calagem, pra restaurar o da cultura ao sair

function setView(view){
  viewBtnCalc.classList.toggle("is-active", view === "calc");
  viewBtnCalc.setAttribute("aria-selected", view === "calc" ? "true" : "false");
  viewBtnReg.classList.toggle("is-active", view === "reg");
  viewBtnReg.setAttribute("aria-selected", view === "reg" ? "true" : "false");
  viewBtnCalagem.classList.toggle("is-active", view === "calagem");
  viewBtnCalagem.setAttribute("aria-selected", view === "calagem" ? "true" : "false");
  viewCalculadora.classList.toggle("hidden", view !== "calc");
  viewRegulagem.classList.toggle("hidden", view !== "reg");
  viewCalagem.classList.toggle("hidden", view !== "calagem");

  if(view === "calagem"){
    emCalagem = true;
    applyAccentVars("#8C6D46", "#D2A97A");
  } else if(emCalagem){
    // reaplica as variáveis de accent da cultura corrente sem tocar em nenhum campo
    // (chamar selectCrop() de novo aqui apagaria digitação ainda não salva na aba)
    emCalagem = false;
    const c = getConfig(currentCrop);
    applyAccentVars(c.accent, c.accentLight);
  }
}
viewBtnCalc.addEventListener("click", () => setView("calc"));
viewBtnReg.addEventListener("click", () => setView("reg"));
viewBtnCalagem.addEventListener("click", () => setView("calagem"));

// ---- Regulagem de plantadeira: só preenche e calcula pelas fórmulas de plantas/m linear
function fmtDecCasas(n, casas){
  return isFinite(n) ? n.toLocaleString("pt-BR", {minimumFractionDigits:casas, maximumFractionDigits:casas}) : "0";
}
function calcRegulagem(){
  const populacao = parseFloat($("regPopulacao").value) || 0;
  const espacamento = parseFloat($("regEspacamento").value) || 0;
  const germinacao = parseFloat($("regGerminacao").value) || 0;

  const plantasHa = germinacao > 0 ? populacao / (germinacao / 100) : 0;
  const metrosLineares = espacamento > 0 ? 10000 / espacamento : 0;
  const plantasMetro = metrosLineares > 0 ? plantasHa / metrosLineares : 0;

  $("regPlantasHa").textContent = fmtDecCasas(plantasHa, 2);
  $("regMetrosLineares").textContent = fmtDecCasas(metrosLineares, 2);
  $("regPlantasMetroStep").textContent = fmtDecCasas(plantasMetro, 2);
  $("regPlantasMetro").textContent = fmtDecCasas(plantasMetro, 2);

  calcRegulagemAvancada(plantasHa, espacamento, plantasMetro);
}
["regPopulacao","regEspacamento","regGerminacao"].forEach(id => $(id).addEventListener("input", calcRegulagem));

// ---- Regulagem avançada (opcional): linhas, teste de campo, velocidade e
// reservatório. Depende dos mesmos plantasHa/espacamento/plantasMetro que
// calcRegulagem() já calcula — por isso é chamada de dentro dela, em vez de
// recalcular tudo de novo a partir dos campos de "Dados da regulagem".
function calcRegulagemAvancada(plantasHa, espacamento, plantasMetro){
  $("regSementesPorMetroLinha").textContent = fmtDecCasas(plantasMetro, 2);

  const numLinhas = parseFloat($("regNumLinhas").value) || 0;

  // 2) teste de campo (50/100 m)
  const testeMetros = parseFloat($("regTesteMetros").value) || 0;
  const esperadoPorLinha = plantasMetro * testeMetros;
  const esperadoTotal = esperadoPorLinha * numLinhas;
  $("regTesteMetrosLabel").textContent = fmtInt(testeMetros);
  $("regTesteEsperadoPorLinha").textContent = fmtInt(esperadoPorLinha);
  $("regTesteNumLinhasLabel").textContent = fmtInt(numLinhas);
  $("regTesteEsperadoTotal").textContent = fmtInt(esperadoTotal);

  const alertBox = $("regTesteAlertBox");
  alertBox.innerHTML = "";
  show(alertBox, false);
  const coletadas = parseFloat($("regSementesColetadas").value) || 0;
  if(coletadas > 0 && esperadoPorLinha > 0){
    const diffPct = ((coletadas - esperadoPorLinha) / esperadoPorLinha) * 100;
    if(Math.abs(diffPct) > 10){
      const meta = ALERT_META.warn;
      const div = document.createElement("div");
      div.className = "alert-item alert-warn";
      div.innerHTML =
        `<svg class="ti ti-${meta.icon} alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${meta.paths}</svg>` +
        `<span class="alert-text">Sementes coletadas divergem do esperado em ${fmtDecCasas(Math.abs(diffPct), 1)}%. Reveja a regulagem.</span>`;
      alertBox.appendChild(div);
      show(alertBox, true);
    }
  }

  // 3) velocidade de plantio -> área plantada por hora
  const velocidade = parseFloat($("regVelocidade").value) || 0;
  const areaHora = espacamento * numLinhas * velocidade * 0.1;
  $("regAreaPorHora").textContent = fmtDecCasas(areaHora, 2);

  // 4) reservatório de sementes -> abastecimentos necessários
  const capacidade = parseFloat($("regCapacidadeReservatorio").value) || 0;
  const areaTotal = parseFloat($("regAreaTotal").value) || 0;
  const abastecimentos = capacidade > 0 ? Math.ceil((areaTotal * plantasHa) / capacidade) : 0;
  $("regAbastecimentos").textContent = fmtInt(abastecimentos);

  // 5) engrenagem/disco é só anotação livre — sem cálculo, de propósito (ver nota no HTML)
}
enhanceSelect($("regTesteMetros"));
[
  "regNumLinhas", "regSementesColetadas",
  "regVelocidade", "regCapacidadeReservatorio", "regAreaTotal",
].forEach(id => $(id).addEventListener("input", calcRegulagem));
$("regTesteMetros").addEventListener("change", calcRegulagem); // select personalizado dispara "change", não "input"
calcRegulagem();

// ---- Regulagem de plantadeira: sub-abas semente / adubo
const regTabSemente = $("regTabSemente");
const regTabAdubo = $("regTabAdubo");
const regSementeBox = $("regSementeBox");
const regAduboBox = $("regAduboBox");

function setRegTab(tab){
  const ehSemente = tab === "semente";
  regTabSemente.classList.toggle("is-active", ehSemente);
  regTabSemente.setAttribute("aria-pressed", ehSemente ? "true" : "false");
  regTabAdubo.classList.toggle("is-active", !ehSemente);
  regTabAdubo.setAttribute("aria-pressed", !ehSemente ? "true" : "false");
  regSementeBox.classList.toggle("hidden", !ehSemente);
  regAduboBox.classList.toggle("hidden", ehSemente);
}
regTabSemente.addEventListener("click", () => setRegTab("semente"));
regTabAdubo.addEventListener("click", () => setRegTab("adubo"));

// ---- Regulagem de adubo: metros lineares em 1 ha / adubo por metro (kg e g)
function calcRegulagemAdubo(){
  const dose = parseFloat($("regAduboDose").value) || 0;
  const espacamento = parseFloat($("regAduboEspacamento").value) || 0;

  const metrosLineares = espacamento > 0 ? 10000 / espacamento : 0;
  const aduboKg = metrosLineares > 0 ? dose / metrosLineares : 0;
  const aduboG = aduboKg * 1000;

  $("regAduboMetrosLineares").textContent = fmtDecCasas(metrosLineares, 2);
  $("regAduboPorMetroKg").textContent = fmtDecCasas(aduboKg, 3);
  $("regAduboPorMetroG").textContent = fmtDecCasas(aduboG, 2);
  $("regAduboGramas").textContent = fmtDecCasas(aduboG, 2);
}
["regAduboDose","regAduboEspacamento"].forEach(id => $(id).addEventListener("input", calcRegulagemAdubo));
calcRegulagemAdubo();

// ---------- Calagem & Gessagem (Manual de Adubação e Calagem para o Estado do
// Paraná — SBCS-NEPAR / IDR-Paraná / Embrapa) ----------
// Ferramenta técnica independente (terceira aba, ao lado de Sementes & Adubação
// e Regulagem de Plantadeira): a matemática pura mora em calculos.js
// (calcularIndicesSolo, calcularCalagem, determinarTipoCalcario,
// verificarNecessidadeGessagem, calcularGessagem, nutrientesGesso) — aqui só lê
// os campos, chama essas funções e desenha o resultado.

// Área a corrigir: mesmo esquema de leitura/escrita da aba de Sementes &
// Adubação (ver areaAlqDoInput/formatarAreaInput acima), só que como uma
// instância própria — é um campo de área independente, de outra ferramenta,
// não o mesmo #area da calculadora de cultura. Unidade de exibição fixa em
// alqueires em todas as culturas.
const calAreaUnit = "alq";
function calAreaAlqDoInput(){
  return normalizarAreaParaAlqueires($("calArea").value, calAreaUnit);
}
function calFormatarAreaInput(areaAlq){
  if(!areaAlq){ $("calArea").value = ""; return; }
  const valorExibido = calAreaUnit === "ha" ? alqParaHa(areaAlq) : areaAlq;
  $("calArea").value = Math.round(valorExibido * 10000) / 10000;
}
function calAtualizarAreaHint(areaAlq){
  $("calAreaHaHint").textContent = calAreaUnit === "ha"
    ? fmtDec(areaAlq) + " alq"
    : fmtDec(alqParaHa(areaAlq)) + " ha";
}
function calFmtAreaRelatorio(areaAlq){
  if(!areaAlq) return "—";
  const alq = fmtDec(areaAlq) + " alq", ha = fmtDec(alqParaHa(areaAlq)) + " ha";
  return calAreaUnit === "ha" ? `${ha} (${alq})` : `${alq} (${ha})`;
}

// Cultura-alvo -> V₂ sugerido (editável); "Personalizado" deixa o campo livre.
$("calCultura").addEventListener("change", () => {
  const sel = $("calCultura");
  const opt = sel.selectedOptions?.[0] || sel.options[sel.selectedIndex] || sel.querySelector(`option[value="${sel.value}"]`);
  const v2 = opt?.dataset?.v2;
  if(v2) $("calV2").value = v2;
  calcCalagem();
});
// Sistema de manejo -> profundidade sugerida (editável); "Personalizado" deixa o campo livre.
$("calManejo").addEventListener("change", () => {
  const sel = $("calManejo");
  const opt = sel.selectedOptions?.[0] || sel.options[sel.selectedIndex] || sel.querySelector(`option[value="${sel.value}"]`);
  const prof = opt?.dataset?.prof;
  if(prof) $("calProfundidade").value = prof;
  calcCalagem();
});

const CAL_INPUT_IDS = [
  "calV2","calProfundidade","calPrnt","calAreaAplicadaPct",
  "calCa020","calMg020","calK020","calAl020","calHAl020",
  "calCa2040","calMg2040","calK2040","calAl2040","calHAl2040","calArgila2040",
];
CAL_INPUT_IDS.forEach(id => {
  const el = $(id);
  if(el) el.addEventListener("input", calcCalagem);
});
$("calArea").addEventListener("input", calcCalagem);
$("calKUnidade020").addEventListener("change", calcCalagem);
$("calMetodoGessagem").addEventListener("change", calcCalagem);

// Selects da aba Calagem & Gessagem com o mesmo componente customizado usado
// em Espaçamento/Transpasse — os listeners de "change" acima continuam
// disparando normalmente, já que enhanceSelect() só troca a aparência e
// redispara "change" no <select> nativo por baixo (ver enhanceSelect()).
enhanceSelect($("calCultura"));
enhanceSelect($("calKUnidade020"));
// marca o wrap como compacto: o K⁺ mora na própria coluna "Unid." da matriz
// de solo (ver .csel-compact em styles.css), no lugar do <select> de largura
// total usado nos outros 3 selects desta aba.
$("calKUnidade020").closest(".csel").classList.add("csel-compact");
enhanceSelect($("calManejo"));
enhanceSelect($("calMetodoGessagem"));

// guarda o último resultado calculado — reaproveitado por coletarResumoCalagem() na exportação (PDF/PNG)
let calUltimoResultado = null;

function calcCalagem(){
  const v = id => parseFloat($(id).value) || 0;

  const kUnidade020 = $("calKUnidade020").value;
  const idx020 = calcularIndicesSolo({ ca: v("calCa020"), mg: v("calMg020"), k: v("calK020"), al: v("calAl020"), hAl: v("calHAl020"), kUnidade: kUnidade020 });
  const idx2040 = calcularIndicesSolo({ ca: v("calCa2040"), mg: v("calMg2040"), k: v("calK2040"), al: v("calAl2040"), hAl: v("calHAl2040") });

  const v2 = v("calV2");
  const prnt = v("calPrnt");
  const profundidade = v("calProfundidade");
  const areaAplicadaPct = v("calAreaAplicadaPct") || 100;
  const calagem = calcularCalagem({ v1: idx020.v, v2, t: idx020.ctcPh7, prnt, profundidade, areaAplicadaPct });
  const tipoCalcario = determinarTipoCalcario({ mg: v("calMg020"), caMg: idx020.caMg });

  const gessagem = verificarNecessidadeGessagem({ al: v("calAl2040"), m: idx2040.m, ca: v("calCa2040"), v: idx2040.v });
  const metodoGessagem = $("calMetodoGessagem").value;
  const areaAlq = calAreaAlqDoInput();
  const areaHa = alqParaHa(areaAlq);
  const gesso = calcularGessagem({ argila: v("calArgila2040"), metodo: metodoGessagem, tSub: idx2040.ctcPh7, caSub: v("calCa2040"), area: areaHa });
  const nutrientes = nutrientesGesso(gesso.doseKgHa);

  calAtualizarAreaHint(areaAlq);

  // ---- leitura instantânea (readouts dos laudos) ----
  $("calReadoutSB").textContent = fmtDec(idx020.sb);
  $("calReadoutCtc020").textContent = fmtDec(idx020.ctcPh7);
  $("calReadoutV1").textContent = fmtDec(idx020.v) + "%";
  $("calReadoutCaMg").textContent = fmtDec(idx020.caMg);
  $("calReadoutV2040").textContent = fmtDec(idx2040.v) + "%";
  $("calReadoutM2040").textContent = fmtDec(idx2040.m) + "%";

  const totalCalcarioT = calagem.ncAplicar * areaHa;
  const totalGessoT = gesso.totalTArea;

  // ---- gráfico técnico de perfil e balanço da CTC (substitui o antigo semáforo
  // em texto): barra de V1 x meta V2, ocupação de Ca/Mg/K/H+Al na CTC pH 7,0 e
  // micro-medidor de impedimento químico do subsolo — tudo a partir dos mesmos
  // índices já calculados acima (idx020/idx2040/tipoCalcario), sem fórmula nova.
  const clampPct = (n) => Math.max(0, Math.min(100, n));
  $("calGraficoV1Pin").style.left = clampPct(idx020.v) + "%";
  $("calGraficoV2Line").style.left = clampPct(v2) + "%";
  $("calGraficoV1Tag").textContent = fmtDec(idx020.v) + "%";
  $("calGraficoV2Tag").textContent = fmtDec(v2) + "%";

  const pctHAl020 = idx020.ctcPh7 > 0 ? (v("calHAl020") / idx020.ctcPh7) * 100 : 0;
  $("calGraficoSegCa").style.width = clampPct(idx020.pctCa) + "%";
  $("calGraficoSegMg").style.width = clampPct(idx020.pctMg) + "%";
  $("calGraficoSegK").style.width = clampPct(idx020.pctK) + "%";
  $("calGraficoSegHAl").style.width = clampPct(pctHAl020) + "%";
  $("calGraficoPctCa").textContent = fmtDec(idx020.pctCa) + "%";
  $("calGraficoPctMg").textContent = fmtDec(idx020.pctMg) + "%";
  $("calGraficoPctK").textContent = fmtDec(idx020.pctK) + "%";
  $("calGraficoPctHAl").textContent = fmtDec(pctHAl020) + "%";

  const caMgFaixa = idx020.caMg > 4 ? "Alto" : idx020.caMg < 2 ? "Baixo" : "Equilibrado";
  $("calGraficoCaMgBadge").textContent = `Ca:Mg ${fmtDec(idx020.caMg)}:1 — ${caMgFaixa}`;
  $("calGraficoCorretivoBadge").textContent = `Calcário ${tipoCalcario.tipo} indicado (${tipoCalcario.faixaMgO})`;

  const al2040Gauge = v("calAl2040");
  const impedimentoSub = idx2040.m > 20 || al2040Gauge > 0.3;
  const subGaugeFill = $("calGraficoSubGaugeFill");
  subGaugeFill.style.width = clampPct(idx2040.m) + "%";
  subGaugeFill.classList.toggle("is-alerta", impedimentoSub);
  subGaugeFill.classList.toggle("is-ok", !impedimentoSub);
  $("calGraficoSubGaugeLabel").textContent = fmtDec(idx2040.m) + "%";
  $("calGraficoSubGaugeAlLabel").textContent = fmtDec(al2040Gauge);
  const subGaugeStatus = $("calGraficoSubGaugeStatus");
  subGaugeStatus.textContent = impedimentoSub ? "Impedimento em profundidade" : "Sem impedimento";
  subGaugeStatus.classList.toggle("ctc-badge-warn", impedimentoSub);
  subGaugeStatus.classList.toggle("ctc-badge-ok", !impedimentoSub);

  // ---- calagem ----
  $("calNcV1Read").textContent = fmtDec(idx020.v) + "%";
  $("calNcV2Read").textContent = fmtDec(v2) + "%";
  $("calNcPrntRead").textContent = fmtDec(prnt) + "%";
  $("calNcBase").textContent = fmtDec(calagem.ncBase);
  $("calNcAplicar").textContent = fmtDec(calagem.ncAplicar);
  $("calNcTotal").textContent = fmtDec(totalCalcarioT);
  $("calTipoCalcario").textContent = "Calcário " + tipoCalcario.tipo;
  $("calFaixaMgo").textContent = tipoCalcario.faixaMgO;

  const calAlertBox = $("calAlertBox");
  calAlertBox.innerHTML = "";
  show(calAlertBox, calagem.alertaParcelamento);
  if(calagem.alertaParcelamento){
    const meta = ALERT_META.warn;
    calAlertBox.innerHTML = `<div class="alert-item alert-warn"><svg class="ti ti-${meta.icon} alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${meta.paths}</svg><span class="alert-text">Dose acima de 2,5 t/ha em aplicação superficial — recomenda-se parcelar entre safras para evitar supercalagem na camada superficial.</span></div>`;
  }

  // ---- gessagem ----
  $("calNgDose").textContent = fmtDec(gesso.doseKgHa);
  $("calNgTotal").textContent = fmtDec(totalGessoT);
  $("calNgEnxofre").textContent = fmtDec(nutrientes.enxofreKgHa);
  $("calNgCalcio").textContent = fmtDec(nutrientes.calcioKgHa);

  const gessoBox = $("calGessoNecessariaBox");
  if(gessagem.necessaria){
    gessoBox.innerHTML = `<div class="alerts-box">${gessagem.motivos.map(m => {
      const meta = ALERT_META.warn;
      return `<div class="alert-item alert-warn"><svg class="ti ti-${meta.icon} alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${meta.paths}</svg><span class="alert-text">${m}</span></div>`;
    }).join("")}</div>`;
  } else {
    const meta = ALERT_META.info;
    gessoBox.innerHTML = `<div class="alert-item alert-info"><svg class="ti ti-${meta.icon} alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${meta.paths}</svg><span class="alert-text">Nenhum dos 4 critérios do subsolo foi disparado — gessagem dispensada pelos dados informados.</span></div>`;
  }

  // ---- memória de cálculo ----
  const dadosMemoria = { idx020, idx2040, al2040: v("calAl2040"), v2, prnt, profundidade, areaAplicadaPct, calagem, tipoCalcario, gessagem, metodoGessagem, gesso, nutrientes, areaAlq, areaHa, totalCalcarioT, totalGessoT };
  calRenderMemoria(dadosMemoria);
  calUltimoResultado = dadosMemoria;
}

function calRenderMemoria(d){
  const wrap = $("calMemoriaStepsWrap");
  wrap.innerHTML = "";
  let stepNum = 0;
  function addStep(label, value, caption){
    stepNum++;
    const div = document.createElement("div");
    div.className = "mem-step";
    div.innerHTML =
      `<div class="mem-step-marker"><span class="mem-step-dot">${stepNum}</span></div>` +
      `<div class="mem-step-body">` +
        `<div class="mem-step-label">${label}</div>` +
        `<div class="mem-step-value">${value}</div>` +
        `<div class="mem-step-caption">${caption}</div>` +
      `</div>`;
    wrap.appendChild(div);
  }
  function addResult(label, value, caption){
    const div = document.createElement("div");
    div.className = "mem-result";
    div.innerHTML = `<div class="mem-step-label">${label}</div><div class="mem-step-value">${value}</div><div class="mem-step-caption">${caption}</div>`;
    wrap.appendChild(div);
  }

  addStep("Índices — camada 0-20 cm", `SB ${fmtDec(d.idx020.sb)} · CTC(T) ${fmtDec(d.idx020.ctcPh7)} · V ${fmtDec(d.idx020.v)}%`, "SB = Ca+Mg+K · T = SB+(H+Al) · V% = (SB÷T)×100");
  addStep("Necessidade de calagem (NCbase)", `${fmtDec(d.calagem.ncBase)} t/ha`, `(V₂ ${fmtDec(d.v2)}% − V₁ ${fmtDec(d.idx020.v)}%) × T ${fmtDec(d.idx020.ctcPh7)} ÷ PRNT ${fmtDec(d.prnt)}%`);
  addStep("Ajuste por profundidade e área aplicada", `${fmtDec(d.calagem.ncAplicar)} t/ha`, `NCbase × (${fmtDec(d.profundidade)}÷20) × (${fmtDec(d.areaAplicadaPct)}÷100)`);
  addResult("Calcário recomendado", `Calcário ${d.tipoCalcario.tipo} — ${fmtDec(d.totalCalcarioT)} t na área`, `NC aplicar × ${fmtDec(d.areaHa)} ha (${d.tipoCalcario.faixaMgO})`);

  addStep("Índices — subsolo 20-40 cm", `Al ${fmtDec(d.al2040)} · m ${fmtDec(d.idx2040.m)}% · V ${fmtDec(d.idx2040.v)}%`, "m% = (Al ÷ CTC efetiva) × 100");
  addStep("Gatilhos de gessagem", d.gessagem.necessaria ? `${d.gessagem.motivos.length} critério(s) disparado(s)` : "nenhum critério disparado", "Al > 0,3 · m% > 20 · Ca < 1,5 · V% < 35 (qualquer um já indica gesso)");
  addStep("Dose de gesso", `${fmtDec(d.gesso.doseKgHa)} kg/ha`, d.metodoGessagem === "saturacaoCa" ? "[0,6 × T subsolo − Ca subsolo] × 640" : "50 × argila% do subsolo");
  addResult("Gesso agrícola recomendado", `${fmtDec(d.totalGessoT)} t na área`, `S: ${fmtDec(d.nutrientes.enxofreKgHa)} kg/ha · Ca: ${fmtDec(d.nutrientes.calcioKgHa)} kg/ha fornecidos`);
}

// abrir/fechar o painel da memória de cálculo (mesma animação max-height do card de Sementes & Adubação)
const calMemoriaToggle = $("calMemoriaToggle");
const calMemoriaPanel = $("calMemoriaPanel");
calMemoriaToggle.addEventListener("click", () => {
  const abrindo = calMemoriaToggle.getAttribute("aria-expanded") !== "true";
  calMemoriaToggle.setAttribute("aria-expanded", abrindo ? "true" : "false");
  if(abrindo){
    calMemoriaPanel.classList.add("is-open");
    calMemoriaPanel.style.maxHeight = calMemoriaPanel.scrollHeight + "px";
  } else {
    calMemoriaPanel.style.maxHeight = calMemoriaPanel.scrollHeight + "px";
    requestAnimationFrame(() => {
      calMemoriaPanel.classList.remove("is-open");
      calMemoriaPanel.style.maxHeight = "0px";
    });
  }
});

// ---- Anexar e interpretar laudo de solo (PDF/foto) via IA multimodal ----
// Fluxo: usuário anexa o laudo (ou cola um texto/JSON já pronto) -> a chave
// Gemini fica só no localStorage deste aparelho -> a IA devolve um JSON com
// os teores -> preenchemos os inputs da matriz técnica (com pulso visual de
// confirmação) e chamamos calcCalagem() de novo pra recalcular tudo na hora.
// Sem chave/rede o app continua 100% funcional: o campo de colar texto/JSON
// não depende de nenhuma chamada de rede.
const LAUDO_GEMINI_KEY_STORAGE = "gemini_api_key";
const LAUDO_GEMINI_MODEL = "gemini-2.0-flash";
const LAUDO_TIPOS_ACEITOS = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];
const LAUDO_PROMPT = `Você é um agrônomo especialista em interpretar laudos de análise de solo (boletins de laboratório brasileiros).
Analise o documento anexado (PDF ou foto de um laudo de solo) e devolva APENAS um JSON válido, sem markdown e sem texto fora do JSON, no formato exato abaixo:
{
  "cliente": "nome do produtor/cooperado, ou null se não constar",
  "camada_0_20": { "ca": number|null, "mg": number|null, "k": number|null, "k_unidade": "cmolc"|"mgdm3", "al": number|null, "h_al": number|null, "p": number|null, "ph": number|null, "argila_pct": number|null },
  "camada_20_40": { "ca": number|null, "mg": number|null, "k": number|null, "k_unidade": "cmolc"|"mgdm3", "al": number|null, "h_al": number|null, "argila_pct": number|null }
}
Regras: use ponto decimal (nunca vírgula); todos os valores de Ca, Mg, Al e H+Al em cmolc/dm³; se o K estiver em mg/dm³ no laudo, informe "k_unidade":"mgdm3" e mantenha o valor em mg/dm³ (não converta); se o laudo trouxer só a camada 0-20 cm, devolva "camada_20_40" com todos os campos null; nunca invente valores — o que não constar no laudo deve ser null.`;

const laudoModal = $("laudoModal");
let laudoArquivoSelecionado = null; // { file, mimeType }
let laudoInterpretando = false;

function configurarPainelColapsavel(toggleEl, panelEl){
  toggleEl.addEventListener("click", () => {
    const abrindo = toggleEl.getAttribute("aria-expanded") !== "true";
    toggleEl.setAttribute("aria-expanded", abrindo ? "true" : "false");
    if(abrindo){
      panelEl.classList.add("is-open");
      panelEl.style.maxHeight = panelEl.scrollHeight + "px";
    } else {
      panelEl.style.maxHeight = panelEl.scrollHeight + "px";
      requestAnimationFrame(() => {
        panelEl.classList.remove("is-open");
        panelEl.style.maxHeight = "0px";
      });
    }
  });
}
configurarPainelColapsavel($("laudoApiKeyToggle"), $("laudoApiKeyPanel"));
configurarPainelColapsavel($("laudoPasteToggle"), $("laudoPastePanel"));

function laudoFormatarTamanho(bytes){
  if(bytes < 1024) return bytes + " B";
  if(bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function laudoResetarEstado(){
  laudoArquivoSelecionado = null;
  $("laudoFileInput").value = "";
  $("laudoCameraInput").value = "";
  $("laudoPasteText").value = "";
  show($("laudoFilePreview"), false);
  show($("laudoDropzone"), true);
  show($("laudoLoadingState"), false);
}

function abrirModalLaudo(){
  laudoResetarEstado();
  $("laudoApiKeyInput").value = localStorage.getItem(LAUDO_GEMINI_KEY_STORAGE) || "";
  laudoModal.classList.remove("hidden");
}
function fecharModalLaudo(){
  if(laudoInterpretando) return;
  laudoModal.classList.add("hidden");
}

$("btnAnexarLaudo").addEventListener("click", abrirModalLaudo);
$("laudoModalClose").addEventListener("click", fecharModalLaudo);
$("laudoModalCancel").addEventListener("click", fecharModalLaudo);
laudoModal.addEventListener("click", e => { if(e.target === laudoModal) fecharModalLaudo(); });
document.addEventListener("keydown", e => {
  if(e.key === "Escape" && !laudoModal.classList.contains("hidden")) fecharModalLaudo();
});

$("laudoApiKeyInput").addEventListener("change", () => {
  const chave = $("laudoApiKeyInput").value.trim();
  if(chave) localStorage.setItem(LAUDO_GEMINI_KEY_STORAGE, chave);
  else localStorage.removeItem(LAUDO_GEMINI_KEY_STORAGE);
});

function laudoValidarArquivo(file){
  const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
  return LAUDO_TIPOS_ACEITOS.includes(ext);
}
function laudoSelecionarArquivo(file){
  if(!file) return;
  if(!laudoValidarArquivo(file)){
    mostrarToast("Formato não suportado — use PDF, PNG, JPG ou WEBP.");
    return;
  }
  laudoArquivoSelecionado = { file, mimeType: file.type || "application/pdf" };
  $("laudoFileName").textContent = file.name;
  $("laudoFileSize").textContent = laudoFormatarTamanho(file.size);
  show($("laudoFilePreview"), true);
  show($("laudoDropzone"), false);
}

const laudoDropzone = $("laudoDropzone");
laudoDropzone.addEventListener("click", () => $("laudoFileInput").click());
laudoDropzone.addEventListener("keydown", e => {
  if(e.key === "Enter" || e.key === " "){ e.preventDefault(); $("laudoFileInput").click(); }
});
$("laudoFileInput").addEventListener("change", e => laudoSelecionarArquivo(e.target.files[0]));
$("btnLaudoCamera").addEventListener("click", () => $("laudoCameraInput").click());
$("laudoCameraInput").addEventListener("change", e => laudoSelecionarArquivo(e.target.files[0]));

["dragenter", "dragover"].forEach(evt => laudoDropzone.addEventListener(evt, e => {
  e.preventDefault(); e.stopPropagation();
  laudoDropzone.classList.add("is-dragover");
}));
["dragleave", "drop"].forEach(evt => laudoDropzone.addEventListener(evt, e => {
  e.preventDefault(); e.stopPropagation();
  laudoDropzone.classList.remove("is-dragover");
}));
laudoDropzone.addEventListener("drop", e => {
  const file = e.dataTransfer?.files?.[0];
  if(file) laudoSelecionarArquivo(file);
});

$("laudoFileRemove").addEventListener("click", e => {
  e.stopPropagation();
  laudoArquivoSelecionado = null;
  $("laudoFileInput").value = "";
  $("laudoCameraInput").value = "";
  show($("laudoFilePreview"), false);
  show($("laudoDropzone"), true);
});

function laudoLerArquivoComoBase64(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

function laudoExtrairJson(texto){
  let limpo = String(texto).trim();
  limpo = limpo.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const inicio = limpo.indexOf("{");
  const fim = limpo.lastIndexOf("}");
  if(inicio === -1 || fim === -1 || fim < inicio){
    throw new Error("Não encontrei um JSON válido no texto.");
  }
  return JSON.parse(limpo.slice(inicio, fim + 1));
}

async function laudoChamarGemini(apiKey, base64, mimeType){
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${LAUDO_GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{
      parts: [
        { text: LAUDO_PROMPT },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ],
    }],
    generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
  };
  const resposta = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if(!resposta.ok){
    const detalhe = await resposta.text().catch(() => "");
    throw new Error(`Falha na API Gemini (${resposta.status}). ${detalhe.slice(0, 160)}`);
  }
  const dados = await resposta.json();
  const texto = dados?.candidates?.[0]?.content?.parts?.[0]?.text;
  if(!texto) throw new Error("A IA não devolveu nenhum conteúdo interpretável.");
  return laudoExtrairJson(texto);
}

// Mapa parâmetro do JSON da IA -> id do input na matriz técnica (só os campos
// que a calculadora realmente usa em calcCalagem(); "p", "ph" e a argila da
// camada 0-20 não têm campo próprio na ficha e ficam de fora do preenchimento).
const LAUDO_CAMPOS_020 = { ca: "calCa020", mg: "calMg020", k: "calK020", al: "calAl020", h_al: "calHAl020" };
const LAUDO_CAMPOS_2040 = { ca: "calCa2040", mg: "calMg2040", k: "calK2040", al: "calAl2040", h_al: "calHAl2040", argila_pct: "calArgila2040" };

function laudoAplicarPulso(el){
  el.classList.remove("input-pulse-success");
  void el.offsetWidth; // força reflow pra reiniciar a animação, mesmo se já rodou antes nesta mesma sessão
  el.classList.add("input-pulse-success");
}
function laudoNumeroValido(v){
  return v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v));
}

function laudoPreencherCampos(dados){
  let preenchidos = 0;
  const c020 = dados?.camada_0_20 || {};
  const c2040 = dados?.camada_20_40 || {};

  Object.entries(LAUDO_CAMPOS_020).forEach(([chave, id]) => {
    if(!laudoNumeroValido(c020[chave])) return;
    const el = $(id);
    el.value = Number(c020[chave]);
    laudoAplicarPulso(el);
    preenchidos++;
  });
  if(c020.k_unidade === "cmolc" || c020.k_unidade === "mgdm3"){
    const select = $("calKUnidade020");
    select.value = c020.k_unidade;
    const gatilho = select.closest(".csel")?.querySelector(".csel-trigger");
    laudoAplicarPulso(gatilho || select);
    preenchidos++;
  }

  Object.entries(LAUDO_CAMPOS_2040).forEach(([chave, id]) => {
    if(!laudoNumeroValido(c2040[chave])) return;
    const el = $(id);
    el.value = Number(c2040[chave]);
    laudoAplicarPulso(el);
    preenchidos++;
  });

  if(typeof dados?.cliente === "string" && dados.cliente.trim() && !$("calCliente").value.trim()){
    const el = $("calCliente");
    el.value = dados.cliente.trim();
    laudoAplicarPulso(el);
    preenchidos++;
  }

  calcCalagem();
  return preenchidos;
}

function laudoMostrarCarregando(ativo){
  show($("laudoLoadingState"), ativo);
  show($("laudoDropzone"), !ativo && !laudoArquivoSelecionado);
  show($("laudoFilePreview"), !ativo && !!laudoArquivoSelecionado);
  $("laudoModalInterpretar").disabled = ativo;
  $("laudoModalCancel").disabled = ativo;
}
function laudoAtualizarEtapa(texto){
  $("laudoLoadingText").textContent = texto;
}

$("laudoModalInterpretar").addEventListener("click", async () => {
  if(laudoInterpretando) return;

  const textoColado = $("laudoPasteText").value.trim();
  if(textoColado){
    try {
      const dados = laudoExtrairJson(textoColado);
      const n = laudoPreencherCampos(dados);
      fecharModalLaudoForcado();
      mostrarToast(n > 0 ? `✅ Laudo interpretado com sucesso! ${n} parâmetros preenchidos.` : "Nenhum parâmetro reconhecido no texto colado.");
    } catch(e){
      mostrarToast("Não consegui interpretar o texto/JSON colado — confira o formato.");
    }
    return;
  }

  if(!laudoArquivoSelecionado){
    mostrarToast("Anexe um arquivo (PDF ou foto) ou cole o texto/JSON extraído.");
    return;
  }

  const apiKey = $("laudoApiKeyInput").value.trim();
  if(!apiKey){
    mostrarToast("Informe sua chave da API Gemini, ou use a opção de colar texto/JSON.");
    if($("laudoApiKeyToggle").getAttribute("aria-expanded") !== "true") $("laudoApiKeyToggle").click();
    return;
  }
  localStorage.setItem(LAUDO_GEMINI_KEY_STORAGE, apiKey);

  laudoInterpretando = true;
  laudoMostrarCarregando(true);
  try {
    laudoAtualizarEtapa("Lendo documento...");
    const base64 = await laudoLerArquivoComoBase64(laudoArquivoSelecionado.file);
    laudoAtualizarEtapa("Identificando teores químicos...");
    const dados = await laudoChamarGemini(apiKey, base64, laudoArquivoSelecionado.mimeType);
    laudoAtualizarEtapa("Preenchendo matriz...");
    const n = laudoPreencherCampos(dados);
    laudoInterpretando = false;
    fecharModalLaudoForcado();
    mostrarToast(n > 0 ? `✅ Laudo interpretado com sucesso! ${n} parâmetros preenchidos.` : "A IA não localizou parâmetros reconhecíveis neste laudo.");
  } catch(e){
    laudoInterpretando = false;
    laudoMostrarCarregando(false);
    mostrarToast("Erro ao interpretar o laudo: " + (e?.message || "falha desconhecida") + ". Tente colar o texto/JSON manualmente.");
  }
});

function fecharModalLaudoForcado(){
  laudoInterpretando = false;
  laudoModal.classList.add("hidden");
}

// ---- Exportar a ficha de Calagem & Gessagem (PDF via impressão do navegador, PNG via canvas) ----
function coletarResumoCalagem(){
  const agora = new Date();
  const d = calUltimoResultado || {};
  const num = id => { const el = $(id); const val = el ? el.value.trim() : ""; return val === "" ? "—" : val.replace(".", ","); };

  // versão curta do rótulo da cultura-alvo pro texto do WhatsApp — a option
  // completa já traz "— descrição (V₂ X%)" embutido, o que duplicaria o
  // "(V₂ desejado: X%)" que o próprio texto do WhatsApp acrescenta depois
  const culturaTexto = $("calCultura").selectedOptions[0].textContent;
  const culturaAlvoResumida = culturaTexto.split(" — ")[0].replace(/\s*\(V.*?\)\s*$/, "").trim();

  return {
    cliente: $("calCliente").value.trim(),
    cultura: culturaTexto,
    culturaAlvoResumida,
    manejo: $("calManejo").selectedOptions[0].textContent,
    area: calFmtAreaRelatorio(d.areaAlq || 0),
    laudo020: [["Ca²⁺", num("calCa020")], ["Mg²⁺", num("calMg020")], ["K⁺", num("calK020")], ["Al³⁺", num("calAl020")], ["H+Al", num("calHAl020")]],
    laudo2040: [["Ca²⁺", num("calCa2040")], ["Mg²⁺", num("calMg2040")], ["K⁺", num("calK2040")], ["Al³⁺", num("calAl2040")], ["H+Al", num("calHAl2040")], ["Argila %", num("calArgila2040")]],
    indices020: d.idx020 ? `SB ${fmtDec(d.idx020.sb)} · CTC efetiva ${fmtDec(d.idx020.ctcEfetiva)} · CTC a pH 7,0 ${fmtDec(d.idx020.ctcPh7)} · V ${fmtDec(d.idx020.v)}% · m ${fmtDec(d.idx020.m)}%` : "—",
    indices2040: d.idx2040 ? `V ${fmtDec(d.idx2040.v)}% · m ${fmtDec(d.idx2040.m)}%` : "—",
    v1: d.idx020 ? fmtDec(d.idx020.v) : "0,00",
    v2: d.v2 !== undefined ? fmtDec(d.v2) : "0,00",
    prnt: d.prnt !== undefined ? fmtDec(d.prnt) : "0,00",
    profundidade: d.profundidade !== undefined ? fmtDec(d.profundidade) : "0,00",
    sb: d.idx020 ? fmtDec(d.idx020.sb) : "0,00",
    ctc: d.idx020 ? fmtDec(d.idx020.ctcPh7) : "0,00",
    relCaMg: d.idx020 ? fmtDec(d.idx020.caMg) : "0,00",
    mg: num("calMg020"),
    ncBase: d.calagem ? fmtDec(d.calagem.ncBase) : "0,00",
    ncAplicar: d.calagem ? fmtDec(d.calagem.ncAplicar) : "0,00",
    totalCalcario: d.totalCalcarioT !== undefined ? fmtDec(d.totalCalcarioT) : "0,00",
    tipoCalcario: d.tipoCalcario ? ("Calcário " + d.tipoCalcario.tipo) : "—",
    faixaMgo: d.tipoCalcario ? d.tipoCalcario.faixaMgO : "",
    alertaParcelamento: !!(d.calagem && d.calagem.alertaParcelamento),
    gessagemNecessaria: !!(d.gessagem && d.gessagem.necessaria),
    gessagemMotivos: d.gessagem ? d.gessagem.motivos : [],
    metodoGessagem: $("calMetodoGessagem").selectedOptions[0].textContent,
    ngDoseKgHa: d.gesso ? fmtDec(d.gesso.doseKgHa) : "0,00",
    totalGesso: d.totalGessoT !== undefined ? fmtDec(d.totalGessoT) : "0,00",
    enxofre: d.nutrientes ? fmtDec(d.nutrientes.enxofreKgHa) : "0,00",
    calcio: d.nutrientes ? fmtDec(d.nutrientes.calcioKgHa) : "0,00",
    data: agora.toLocaleDateString("pt-BR"),
    ref: gerarCodigoRef(agora),
    horaGeracao: agora.toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"}),
  };
}

function nomeArquivoCalagem(r, ext){
  const limpa = t => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return ["calagem-gessagem", limpa(r.cultura), r.data.replace(/\//g, "-")].filter(Boolean).join("_") + "." + ext;
}

function montarFolhaCalagem(r){
  const esc = t => String(t == null ? "" : t).replace(/[&<>]/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[m]));
  const logo = getLogoSrc();
  const bloco = (k, v) => `
    <td style="padding:8px 12px;background:#F7FAF5;border:1px solid #DCE3D6;border-radius:8px;">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#4B554F;font-weight:700;">${esc(k)}</div>
      <div style="font-size:13px;font-weight:700;margin-top:2px;">${esc(v)}</div>
    </td>`;
  const laudoLinha = (titulo, campos) => `
    <div style="margin-top:10px;font-size:11px;">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#4B554F;margin-bottom:4px;">${esc(titulo)}</div>
      ${campos.map(([k, v]) => `<span style="display:inline-block;background:#F7FAF5;border:1px solid #DCE3D6;border-radius:6px;padding:4px 9px;margin-right:6px;margin-top:4px;">${esc(k)}: <strong>${esc(v)}</strong> cmolc/dm³</span>`).join("")}
    </div>`;

  return `
  <div style="font-family:'Segoe UI',Arial,sans-serif;color:#1E2420;font-size:12px;">
    <div style="display:flex;align-items:center;gap:16px;padding-bottom:12px;border-bottom:1px solid #DCE3D6;">
      <img src="${logo}" alt="Coasul" style="height:42px;">
      <div style="width:1px;align-self:stretch;background:#DCE3D6;"></div>
      <div style="flex:1;">
        <div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#4B554F;font-weight:700;">Coasul Agro · Departamento Técnico</div>
        <div style="font-size:18px;font-weight:700;color:#1E2420;margin-top:2px;">Laudo Técnico — Calagem &amp; Gessagem</div>
      </div>
      <div style="text-align:right;background:#F7FAF5;border:1px solid #DCE3D6;border-radius:8px;padding:8px 12px;font-size:10px;min-width:120px;">
        <div style="color:#4B554F;">${esc(r.data)}</div>
        <div style="font-family:monospace;font-weight:700;color:#1E2420;margin-top:2px;">${esc(r.ref)}</div>
      </div>
    </div>

    <table style="width:100%;margin-top:12px;border-collapse:separate;border-spacing:10px 0;">
      <tr>${bloco("Cliente", r.cliente || "—")}${bloco("Cultura/grupo", r.cultura)}${bloco("Manejo", r.manejo)}${bloco("Área a corrigir", r.area)}</tr>
    </table>

    ${laudoLinha("Laudo de solo — camada 0-20 cm", r.laudo020.filter(([k]) => k !== "Argila %"))}
    <div style="margin-top:4px;font-size:10px;color:#4B554F;">${esc(r.indices020)}</div>
    ${laudoLinha("Laudo de solo — subsolo 20-40 cm", r.laudo2040)}
    <div style="margin-top:4px;font-size:10px;color:#4B554F;">${esc(r.indices2040)}</div>

    <div style="margin-top:14px;background:#FFFFFF;border:1px solid #DCE3D6;border-radius:10px;padding:14px 16px;">
      <div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#4B554F;">Necessidade de calagem</div>
      <div style="font-family:monospace;font-size:26px;font-weight:700;margin-top:2px;">${esc(r.ncAplicar)} <span style="font-size:13px;font-weight:400;color:#4B554F;">t/ha</span> <span style="font-size:14px;font-weight:400;color:#4B554F;">→ ${esc(r.totalCalcario)} t na área</span></div>
      <div style="margin-top:6px;font-size:10.5px;color:#4B554F;">V₁ ${esc(r.v1)}% → V₂ ${esc(r.v2)}% · PRNT ${esc(r.prnt)}% · profundidade ${esc(r.profundidade)} cm · NC base ${esc(r.ncBase)} t/ha</div>
      <div style="margin-top:6px;font-size:12px;font-weight:700;">${esc(r.tipoCalcario)} <span style="font-weight:400;color:#4B554F;">(${esc(r.faixaMgo)})</span></div>
      ${r.alertaParcelamento ? `<div style="margin-top:6px;font-weight:700;color:#8A5A00;">⚠ Dose acima de 2,5 t/ha em aplicação superficial — recomenda-se parcelar entre safras.</div>` : ""}
    </div>

    <div style="margin-top:12px;background:#FFFFFF;border:1px solid #DCE3D6;border-radius:10px;padding:14px 16px;">
      <div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#4B554F;">Necessidade de gessagem</div>
      <div style="font-family:monospace;font-size:26px;font-weight:700;margin-top:2px;">${esc(r.ngDoseKgHa)} <span style="font-size:13px;font-weight:400;color:#4B554F;">kg/ha</span> <span style="font-size:14px;font-weight:400;color:#4B554F;">→ ${esc(r.totalGesso)} t na área</span></div>
      <div style="margin-top:6px;font-size:10.5px;color:#4B554F;">Método: ${esc(r.metodoGessagem)} · Enxofre: ${esc(r.enxofre)} kg/ha · Cálcio: ${esc(r.calcio)} kg/ha</div>
      <div style="margin-top:6px;font-size:11px;">
        ${r.gessagemNecessaria
          ? `<strong style="color:#9C2B22;">Gessagem recomendada</strong> — ${r.gessagemMotivos.map(esc).join(" · ")}`
          : `<strong style="color:#1B4E82;">Gessagem dispensada</strong> pelos critérios do subsolo (20-40 cm).`}
      </div>
    </div>

    <div style="margin-top:16px;border-top:1px solid #DCE3D6;padding-top:8px;font-size:9.5px;color:#4B554F;">
      <div>Calculadora Coasul — versão ${APP_VERSION}</div>
      <div>Estimativa técnica baseada no Manual de Adubação e Calagem para o Estado do Paraná (SBCS-NEPAR / IDR-Paraná / Embrapa) — sujeita a conferência e ajuste pelo engenheiro agrônomo responsável.</div>
      <div>Gerado em ${esc(new Date().toLocaleString("pt-BR", {day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit"}))}</div>
    </div>
  </div>`;
}

function layoutFichaCalagem(ctx, draw, r, logo){
  const W = 1000, P = 40, dir = W - P;
  let y = P;

  const logoH = 44, logoW = logo && logo.naturalWidth ? logoH * logo.naturalWidth / logo.naturalHeight : 60;
  if(draw && logo) ctx.drawImage(logo, P, y, logoW, logoH);
  const xt = P + logoW + 16;
  texto(ctx, draw, "COASUL AGRO · LAUDO TÉCNICO", xt, y + 14, {font:"bold 10px " + FONTE, cor:"#4B554F", espaco:"1.6px"});
  texto(ctx, draw, "Calagem & Gessagem", xt, y + 36, {font:"600 21px " + FONTE, maxW:dir - xt - 110});
  texto(ctx, draw, r.data, dir, y + 14, {font:"11px " + FONTE, cor:"#4B554F", align:"right"});
  y += logoH + 12;
  risco(ctx, draw, P, y, dir, "#8C6D46");
  if(draw){ ctx.fillStyle = "#8C6D46"; ctx.fillRect(P, y, dir - P, 2.5); }
  y += 20;

  const info = [["Cliente", r.cliente || "—"], ["Cultura/grupo", r.cultura], ["Manejo", r.manejo], ["Área a corrigir", r.area]];
  const gap = 10, bw = (dir - P - gap * 3) / 4, bh = 48;
  info.forEach(([k, v], i) => {
    const x = P + i * (bw + gap);
    caixa(ctx, draw, x, y, bw, bh, 8, "#F7FAF5", "#DCE3D6");
    texto(ctx, draw, k.toUpperCase(), x + 10, y + 17, {font:"bold 9px " + FONTE, cor:"#4B554F", espaco:"0.6px", maxW:bw - 20});
    texto(ctx, draw, v, x + 10, y + 36, {font:"bold 13px " + FONTE, maxW:bw - 20});
  });
  y += bh + 16;

  function boxResultado(titulo, valorGrande, unidade, complemento, sublinhas, accent){
    ctx.font = "10.5px " + FONTE;
    const linhasComplemento = complemento ? quebraTexto(ctx, complemento, dir - P - 28) : [];
    const alturaExtra = (sublinhas.length + linhasComplemento.length) * 15;
    const altura = 66 + alturaExtra;
    caixa(ctx, draw, P, y, dir - P, altura, 10, "#FFFFFF", "#DCE3D6");
    texto(ctx, draw, titulo.toUpperCase(), P + 14, y + 20, {font:"bold 10px " + FONTE, cor:"#4B554F", espaco:"1.2px"});
    texto(ctx, draw, valorGrande, P + 14, y + 50, {font:"bold 26px " + MONO});
    if(draw){
      ctx.font = "bold 26px " + MONO;
      const w = ctx.measureText(valorGrande).width;
      texto(ctx, draw, unidade, P + 22 + w, y + 50, {font:"13px " + FONTE, cor:"#4B554F"});
    }
    let ly = y + 50 + 18;
    linhasComplemento.forEach(l => { texto(ctx, draw, l, P + 14, ly, {font:"10.5px " + FONTE, cor:"#4B554F"}); ly += 15; });
    sublinhas.forEach(l => { texto(ctx, draw, l, P + 14, ly, {font:"600 11px " + FONTE, cor: accent || "#1E2420"}); ly += 15; });
    y += altura + 14;
  }

  boxResultado(
    "Necessidade de calagem",
    r.ncAplicar, "t/ha",
    `V₁ ${r.v1}% → V₂ ${r.v2}%  ·  PRNT ${r.prnt}%  ·  profundidade ${r.profundidade} cm  ·  NC base ${r.ncBase} t/ha  ·  total na área: ${r.totalCalcario} t`,
    [r.tipoCalcario + " (" + r.faixaMgo + ")"].concat(r.alertaParcelamento ? ["⚠ Dose acima de 2,5 t/ha — recomenda-se parcelar entre safras."] : []),
    "#8C6D46"
  );

  boxResultado(
    "Necessidade de gessagem",
    r.ngDoseKgHa, "kg/ha",
    `Método: ${r.metodoGessagem}  ·  S: ${r.enxofre} kg/ha  ·  Ca: ${r.calcio} kg/ha  ·  total na área: ${r.totalGesso} t`,
    [r.gessagemNecessaria ? ("Gessagem recomendada — " + r.gessagemMotivos.join(" · ")) : "Gessagem dispensada pelos critérios do subsolo (20-40 cm)."],
    r.gessagemNecessaria ? "#9C2B22" : "#1B4E82"
  );

  risco(ctx, draw, P, y, dir);
  y += 10;
  texto(ctx, draw, "Calculadora Coasul — versão " + APP_VERSION, P, y + 10, {font:"9.5px " + FONTE, cor:"#4B554F"});
  y += 14;
  ctx.font = "9.5px " + FONTE;
  quebraTexto(ctx, "Estimativa técnica baseada no Manual de Adubação e Calagem para o Estado do Paraná (SBCS-NEPAR / IDR-Paraná / Embrapa) — sujeita a conferência e ajuste pelo engenheiro agrônomo responsável.", dir - P).forEach(l => {
    texto(ctx, draw, l, P, y + 10, {font:"9.5px " + FONTE, cor:"#4B554F"});
    y += 13;
  });

  return { largura: W, altura: y + P };
}

function desenharFichaCalagem(r){
  const logo = document.querySelector("header img");
  const medidor = document.createElement("canvas").getContext("2d");
  const dim = layoutFichaCalagem(medidor, false, r, logo);

  const escala = 2;
  const cv = document.createElement("canvas");
  cv.width = dim.largura * escala;
  cv.height = dim.altura * escala;
  const ctx = cv.getContext("2d");
  ctx.scale(escala, escala);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, dim.largura, dim.altura);
  ctx.textBaseline = "alphabetic";
  layoutFichaCalagem(ctx, true, r, logo);
  return cv;
}

calcCalagem();

selectCrop("soja");

// ---- PWA: registra o service worker (cache do app shell + funcionamento
// offline depois da primeira visita). Só roda em http(s) ou localhost -
// abrir o arquivo direto (file://) não tem service worker nesse caso, mas a
// ficha continua funcionando normalmente, só sem instalação real.
if("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").then((reg) => {
      reg.update().catch(() => {});
    }).catch(() => {});
  });
}