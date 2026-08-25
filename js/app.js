
const CROPS = {
  soja: {
    nome:"Soja", icon:"🌱", accent:"#5C8A26", accentLight:"#9ACD3E",
    tipo:"semente", plantas:10, transpasse:5,
    embalagens:[["Embalagem 125.000", 125000], ["Embalagem 5.000.000", 5000000]],
  },
  milho: {
    nome:"Milho", icon:"🌽", accent:"#D99A1E", accentLight:"#FDBA2D",
    defaultVariant:"sacas",
    variants:{
      sacas:   { label:"Sacas por alqueire", tipo:"sacas", sacasAlq:2.5, tamanhoSaco:60000 },
      semente: { label:"Plantas por metro",  tipo:"semente", plantas:3.3, transpasse:8, embalagens:[["Embalagem 60.000", 60000]] },
    },
  },
  feijao: {
    nome:"Feijão", icon:"🫘", accent:"#C42A2E", accentLight:"#FF7276",
    tipo:"semente", plantas:13, transpasse:8,
    embalagens:[["Embalagem 140.000", 140000]],
  },
  trigo: {
    nome:"Trigo", icon:"🌾", accent:"#0678A8", accentLight:"#4FB6E8",
    defaultVariant:"dose",
    variants:{
      dose:    { label:"Dose (kg/ha)", tipo:"dose", showDoseHa:true, dose:70, embalagens:[["Sacas de 40 kg", 40], ["Bag (TON) 1.000 kg", 1000]] },
      semente: { label:"Plantas por metro linear", tipo:"semente", plantas:60, transpasse:5, espacamentos:["0.17"], embalagensViaPMS:[["Sacas de 40 kg", 40], ["Bag (TON) 1.000 kg", 1000]] },
    },
  },
  adubacao: {
    nome:"Adubação/Ureia", icon:"🧪", accent:"#8C6D46", accentLight:"#D2A97A",
    tipo:"dose", showDoseHa:false, dose:250,
    embalagens:[["Sacas de 50 kg", 50]],
  },
};

// Formulações de ureia/adubo que só existem em bag de 750 kg — todas as demais são 1.000 kg
const FORMULACOES_750KG = [[33,0,0],[40,0,0],[30,0,20]];

const $ = id => document.getElementById(id);

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
  const npk = lerFormulacao($("cultivar").value);
  $("npkAuto").classList.toggle("hidden", !npk);
  if(!npk) return false;
  const [n, p, k] = npk;
  const mudou = $("npkN").value != n || $("npkP").value != p || $("npkK").value != k;
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
  const eh750 = FORMULACOES_750KG.some(([n,p,k]) => n===Math.round(npkN) && p===Math.round(npkP) && k===Math.round(npkK));
  return eh750 ? 750 : 1000;
}

let currentCrop = "soja";
const cropVariant = {}; // guarda a variante escolhida por cultura (ex.: milho -> 'sacas')

const ALQ_HA = 2.42; // 1 alqueire (padrão paulista) = 2,42 hectares

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
  list.className = "csel-list hidden";
  list.setAttribute("role", "listbox");
  list.tabIndex = -1;

  selectEl.classList.add("csel-native");
  selectEl.tabIndex = -1;
  wrap.appendChild(btn);
  wrap.appendChild(list);
  wrap.appendChild(selectEl);

  let activeIndex = -1;

  function render(){
    const opts = Array.from(selectEl.options);
    list.innerHTML = "";
    opts.forEach((opt) => {
      const li = document.createElement("li");
      const selecionada = opt.value === selectEl.value;
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
  }
  function open(){
    list.classList.remove("hidden");
    btn.setAttribute("aria-expanded", "true");
    wrap.classList.add("is-open");
    const selecionada = list.querySelector(".is-selected");
    activeIndex = selecionada ? Array.from(list.children).indexOf(selecionada) : 0;
    updateActive();
    document.addEventListener("click", onOutsideClick);
  }
  function close(){
    list.classList.add("hidden");
    btn.setAttribute("aria-expanded", "false");
    wrap.classList.remove("is-open");
    document.removeEventListener("click", onOutsideClick);
  }
  function onOutsideClick(e){
    if(!wrap.contains(e.target)) close();
  }

  btn.addEventListener("click", () => {
    if(list.classList.contains("hidden")) open(); else close();
  });
  btn.addEventListener("keydown", (e) => {
    const opts = Array.from(list.children);
    if(list.classList.contains("hidden")){
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
  document.documentElement.style.setProperty("--accent", c.accent);
  document.documentElement.style.setProperty("--accent-soft", hexToSoft(c.accent));
  document.documentElement.style.setProperty("--accent-light", c.accentLight || c.accent);
  document.documentElement.style.setProperty("--accent-line", hexToRgba(c.accent, .30));
  $("cropIcon").textContent = c.icon;
  $("cropLabelText").textContent = "Total — " + c.nome;
  $("custosCropNome").textContent = "· " + c.nome;
  $("prazoData").value = custoPrazoData[crop] || "";
  $("cultivar").value = (saved && saved.cultivar) ? saved.cultivar : (mesmaCultura ? cultivarAtual : "");
  $("area").value = (saved && saved.area !== undefined) ? saved.area : "";
  const ehAdubo = crop === "adubacao";
  $("cultivarLabel").textContent = ehAdubo ? "Formulação cotada" : "Cultivar cotada";
  $("cultivar").placeholder = ehAdubo ? "Ex.: 04-14-08 ou Ureia" : "Ex.: BRS 404";
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

function calc(){
  const c = getConfig(currentCrop);
  const area = parseFloat($("area").value) || 0;
  $("areaHaHint").textContent = fmtDec(area * ALQ_HA) + " ha";
  let total = 0;

  // valores dos passos de cada ramo, guardados para alimentar a memória de cálculo mais abaixo
  const mem = { plantas: 0, espacamento: 0, transpasse: 0, sacasAlq: 0, doseAlq: 0, kgTrigo: 0 };

  if(c.tipo === "semente"){
    const plantas = parseFloat($("plantas").value) || 0;
    const espacamento = parseFloat($("espacamento").value) || 0.45;
    const transpasse = parseFloat(transSel.value) || 0;
    if(espacamento > 0 && transpasse < 100){
      total = ((24200 * area / espacamento) * plantas) / ((100 - transpasse) / 100);
    }
    mem.plantas = plantas; mem.espacamento = espacamento; mem.transpasse = transpasse;
    // população final (stand): não leva o transpasse em conta, pois ele é perda de semente
    // na sobreposição das passadas, não altera quantas plantas de fato nascem por área
    const popFinalHa = espacamento > 0 ? plantas * (10000 / espacamento) : 0;
    const popFinalAlq = popFinalHa * ALQ_HA;
    $("popFinalHa").textContent = fmtInt(popFinalHa);
    $("popFinalAlq").textContent = fmtInt(popFinalAlq);
  } else if(c.tipo === "sacas"){
    const sacasAlq = parseFloat($("sacasAlq").value) || 0;
    total = area * sacasAlq;
    mem.sacasAlq = sacasAlq;
  } else {
    const doseAlq = parseFloat($("doseAlq").value) || 0;
    total = area * doseAlq;
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
      `<div class="mt-0.5 font-mono text-[18px] font-bold tabular-nums text-ink">${value}</div>` +
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
    hint.textContent = `Sobra fracionada: dá para levar ${k.nBags} × ${k.bag.label} + ${k.nSacas} × ${k.saca.label} (em vez de arredondar a embalagem maior para cima).`;
    hint.classList.remove("hidden");
  } else {
    hint.classList.add("hidden");
  }

  renderCustos(unidades);
  renderMemoria(c, area, total, mem);
}

// ---------- Memória de cálculo (passo a passo) da aba Sementes & Adubação ----------
// Só exibição: lê os mesmos valores que calc() já calculou (área, total e o objeto `mem`
// com os campos usados em cada ramo), sem recalcular nada com regra própria.
function renderMemoria(c, area, total, mem){
  const wrap = $("memoriaStepsWrap");
  wrap.innerHTML = "";

  function addStep(label, value, caption, wide){
    const div = document.createElement("div");
    div.className = (wide ? "col-span-2 " : "") + "rounded-xl border border-line bg-white px-3 py-2.5";
    div.innerHTML =
      `<div class="text-[10px] font-semibold uppercase tracking-wide text-muted">${label}</div>` +
      `<div class="mt-1 font-mono text-[16px] font-bold tabular-nums text-ink">${value}</div>` +
      `<div class="mt-0.5 text-[10px] leading-snug text-muted">${caption}</div>`;
    wrap.appendChild(div);
  }

  if(c.tipo === "semente"){
    addStep("1 · Área equivalente", fmtDec(area * ALQ_HA) + " ha", "Área × 2,42");
    addStep("2 · Espaçamento", fmtDec(mem.espacamento) + " m", "informado ao lado");
    addStep("3 · População informada", fmtDec(mem.plantas) + " plantas/m", "informado ao lado");
    addStep("4 · Transpasse", fmtDec(mem.transpasse) + " %", "informado ao lado");
    addStep("Resultado", fmtInt(total) + " sementes", "(24.200 × área ÷ espaçamento) × plantas/m ÷ ((100 − transpasse) ÷ 100)", true);
    if(currentCrop === "trigo"){
      addStep("Peso estimado (via PMS)", fmtDec(mem.kgTrigo) + " kg", "Total × PMS ÷ 1.000.000", true);
    }
  } else if(c.tipo === "sacas"){
    addStep("1 · Área", fmtDec(area) + " alqueires", "informada acima");
    addStep("2 · Sacas por alqueire", fmtDec(mem.sacasAlq), "informado ao lado");
    addStep("Resultado", fmtDec(total) + " sacas", "Área × Sacas por alqueire", true);
  } else {
    addStep("1 · Área", fmtDec(area) + " alqueires", "informada acima");
    addStep("2 · Dose por alqueire", fmtDec(mem.doseAlq) + " kg", "informado ao lado");
    addStep("Resultado", fmtDec(total) + " kg", "Área × Dose por alqueire", true);
  }

  $("memoriaFormula").textContent = $("formulaHint").textContent;
}

// Quando a conta cai no meio de uma embalagem grande (ex.: 1,90 bag), o produtor pode levar
// os bags inteiros e completar o resto em sacaria, em vez de arredondar o bag para cima.
function montarCombo(unidades, baseTotal){
  const comTamanho = unidades.filter(u => u.size > 1);
  if(comTamanho.length < 2 || !isFinite(baseTotal) || baseTotal <= 0) return null;

  const ordenadas = [...comTamanho].sort((a, b) => b.size - a.size);
  const bag = ordenadas[0];      // maior embalagem
  const saca = ordenadas[1];     // sacaria imediatamente menor
  const nBags = Math.floor(baseTotal / bag.size);
  if(nBags < 1) return null;

  const resto = baseTotal - nBags * bag.size;
  if(resto <= bag.size * 0.0001) return null; // fechou redondo, não há sobra

  const nSacas = Math.ceil(resto / saca.size);
  return { label: "Combinado", combo: { bag, saca, nBags, nSacas } };
}

function calcPMS(){
  const pms = parseFloat($("pms").value) || 0;
  const pop = parseFloat($("popDesejada").value) || 0;
  const germ = parseFloat($("germinacao").value) || 0;
  const pureza = parseFloat($("pureza").value) || 0;
  let dose = 0;
  if(germ > 0 && pureza > 0){
    dose = (pop * pms * 100) / (germ * pureza);
  }
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
    head.className = "hidden lg:grid-cols-[1.45fr_.9fr_.9fr_1.02fr_1.02fr] lg:grid lg:gap-2 lg:px-3.5 lg:pb-0.5";
    head.innerHTML = ["Embalagem","Preço à vista","Preço a prazo","Custo à vista","Custo a prazo"]
      .map(t => `<span class="whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-muted">${t}</span>`).join("");
    list.appendChild(head);

    unidades.forEach((u, i) => {
      const key = custoKey(currentCrop, u.label);
      const p = custoPrecos[key] || {};
      const item = document.createElement("div");
      item.className = "rounded-xl border border-line bg-white p-3.5 shadow-sm lg:p-2";
      item.style.borderLeft = "4px solid var(--accent)";

      if(u.combo){
        item.className += " border-dashed";
        item.innerHTML = `
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-[1.45fr_.9fr_.9fr_1.02fr_1.02fr] lg:items-center lg:gap-2">
          <div class="col-span-2 mb-1 lg:col-span-1 lg:mb-0">
            <span class="text-[13.5px] font-extrabold lg:text-[12.5px] lg:leading-tight">${u.label}</span>
            <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span class="font-mono text-[11.5px] text-muted lg:text-[10.5px]" id="custoQtd-${i}">—</span>
              <span id="custoBadge-${i}" class="hidden whitespace-nowrap rounded-full bg-brand-money/10 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-brand-money"><span class="lg:hidden">menor custo</span><span class="hidden lg:inline">menor</span></span>
            </span>
          </div>
          <div class="col-span-2 self-center text-[10.5px] leading-snug text-muted lg:col-span-2">
            usa os preços acima
          </div>
          <div class="rounded-xl bg-canvas px-3 py-2 lg:px-2.5 lg:py-1.5">
            <div class="text-[10px] font-semibold uppercase tracking-wide text-muted lg:hidden">Custo à vista</div>
            <div class="whitespace-nowrap font-mono text-[16px] font-bold tabular-nums lg:text-[14px]" id="custoVista-${i}">R$ 0,00</div>
            <div class="whitespace-nowrap text-[10.5px] text-muted lg:text-[10px]" id="custoVistaAlq-${i}">R$ 0,00 / alqueire</div>
          </div>
          <div class="rounded-xl bg-canvas px-3 py-2 lg:px-2.5 lg:py-1.5">
            <div class="text-[10px] font-semibold uppercase tracking-wide text-muted lg:hidden" id="custoPrazoRot-${i}">Custo a prazo</div>
            <div class="whitespace-nowrap font-mono text-[16px] font-bold tabular-nums lg:text-[14px]" id="custoPrazo-${i}">R$ 0,00</div>
            <div class="whitespace-nowrap text-[10.5px] text-muted lg:text-[10px]" id="custoPrazoAlq-${i}">R$ 0,00 / alqueire</div>
          </div>
        </div>`;
        list.appendChild(item);
        return;
      }

      item.innerHTML = `
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-[1.45fr_.9fr_.9fr_1.02fr_1.02fr] lg:items-center lg:gap-2">
          <div class="col-span-2 mb-1 flex flex-wrap items-baseline justify-between gap-x-2 lg:col-span-1 lg:mb-0 lg:block">
            <span class="text-[13.5px] font-extrabold lg:text-[12.5px] lg:leading-tight">${u.label}</span>
            <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span class="whitespace-nowrap font-mono text-[11.5px] text-muted lg:text-[10.5px]" id="custoQtd-${i}">—</span>
              <span id="custoBadge-${i}" class="hidden whitespace-nowrap rounded-full bg-brand-money/10 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-brand-money"><span class="lg:hidden">menor custo</span><span class="hidden lg:inline">menor</span></span>
            </span>
          </div>

          <div>
            <label class="lbl lg:hidden" for="precoVista-${i}">Preço à vista</label>
            <div class="relative">
              <span class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-muted">R$</span>
              <input type="number" id="precoVista-${i}" class="inp inp-num inp-money" step="0.01" min="0" inputmode="decimal"
                     placeholder="0,00" data-custo="${key}" data-tipo="vista" value="${p.vista || ""}">
            </div>
          </div>
          <div>
            <label class="lbl lg:hidden" for="precoPrazo-${i}">Preço a prazo</label>
            <div class="relative">
              <span class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-muted">R$</span>
              <input type="number" id="precoPrazo-${i}" class="inp inp-num inp-money" step="0.01" min="0" inputmode="decimal"
                     placeholder="0,00" data-custo="${key}" data-tipo="prazo" value="${p.prazo || ""}">
            </div>
          </div>
          <div class="rounded-xl bg-canvas px-3 py-2 lg:px-2.5 lg:py-1.5">
            <div class="text-[10px] font-semibold uppercase tracking-wide text-muted lg:hidden">Custo à vista</div>
            <div class="whitespace-nowrap font-mono text-[16px] font-bold tabular-nums lg:text-[14px]" id="custoVista-${i}">R$ 0,00</div>
            <div class="whitespace-nowrap text-[10.5px] text-muted lg:text-[10px]" id="custoVistaAlq-${i}">R$ 0,00 / alqueire</div>
          </div>
          <div class="rounded-xl bg-canvas px-3 py-2 lg:px-2.5 lg:py-1.5">
            <div class="text-[10px] font-semibold uppercase tracking-wide text-muted lg:hidden" id="custoPrazoRot-${i}">Custo a prazo</div>
            <div class="whitespace-nowrap font-mono text-[16px] font-bold tabular-nums lg:text-[14px]" id="custoPrazo-${i}">R$ 0,00</div>
            <div class="whitespace-nowrap text-[10.5px] text-muted lg:text-[10px]" id="custoPrazoAlq-${i}">R$ 0,00 / alqueire</div>
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
  const area = parseFloat($("area").value) || 0;
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
    const precoVista = parseFloat(p.vista) || 0;
    const precoPrazo = parseFloat(p.prazo) || 0;
    const qtdArred = Math.max(0, Math.ceil(u.qty || 0));

    const custoVista = qtdArred * precoVista;
    const custoPrazo = qtdArred * precoPrazo;

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

function coletarResumo(){
  const c = getConfig(currentCrop);
  const area = parseFloat($("area").value) || 0;
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
      precoVista: p.vista ? fmtMoeda(parseFloat(p.vista)) : "—",
      precoPrazo: p.prazo ? fmtMoeda(parseFloat(p.prazo)) : "—",
    };
  });

  const nutrientes = currentCrop === "adubacao"
    ? [...document.querySelectorAll("#npkWrap > div")].map(d => ({
        nome: d.children[0].textContent.trim(),
        valor: d.children[1].textContent.trim(),
        porAlq: d.children[2] ? d.children[2].textContent.trim() : "",
      }))
    : [];

  return {
    cultura: c.nome, icone: c.icon, accent: c.accent,
    cliente, cultivar,
    rotuloCultivar: currentCrop === "adubacao" ? "Formulação" : "Cultivar",
    area: area ? area.toLocaleString("pt-BR") + " alqueires" : "—",
    params,
    total: $("totalValue").textContent,
    unidade: $("unitLabel").textContent,
    combo: $("comboHint").classList.contains("hidden") ? "" : $("comboHint").textContent,
    linhas, nutrientes,
    vencimento: venc, vencimentoDias: $("prazoDias").textContent,
    data: dataHoje(),
  };
}

function nomeArquivo(r, ext){
  const limpa = t => (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  const partes = ["cotacao", limpa(r.cultura), limpa(r.cliente), r.data.replace(/\//g, "-")].filter(Boolean);
  return partes.join("_") + "." + ext;
}

// ---- PDF: monta a folha e chama a impressão (o navegador salva como PDF, offline)
function montarFolha(r){
  const esc = t => String(t == null ? "" : t).replace(/[&<>]/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[m]));
  const logo = document.querySelector("header img").src;
  const info = [["Cliente", r.cliente || "—"], [r.rotuloCultivar, r.cultivar || "—"], ["Cultura", r.cultura], ["Área", r.area]];

  const linhasHtml = r.linhas.map(l => `
    <tr>
      <td style="padding:7px 8px;border-bottom:1px solid #E2E7DA;">
        <strong>${esc(l.nome)}</strong>${l.menor ? ' <span style="font-size:9px;font-weight:700;color:#2E6B5E;">MENOR CUSTO</span>' : ""}
        <div style="color:#5B6660;font-size:10px;font-family:monospace;">${esc(l.qtd)}</div>
      </td>
      <td style="padding:7px 8px;border-bottom:1px solid #E2E7DA;text-align:right;font-family:monospace;white-space:nowrap;">${esc(l.precoVista)}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #E2E7DA;text-align:right;font-family:monospace;white-space:nowrap;">${esc(l.precoPrazo)}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #E2E7DA;text-align:right;font-family:monospace;font-weight:700;white-space:nowrap;">${esc(l.vista)}<div style="font-weight:400;font-size:9.5px;color:#5B6660;">${esc(l.vistaAlq)}</div></td>
      <td style="padding:7px 8px;border-bottom:1px solid #E2E7DA;text-align:right;font-family:monospace;font-weight:700;white-space:nowrap;">${esc(l.prazo)}<div style="font-weight:400;font-size:9.5px;color:#5B6660;">${esc(l.prazoAlq)}</div></td>
    </tr>`).join("");

  return `
  <div style="font-family:'Segoe UI',Arial,sans-serif;color:#1E2420;font-size:12px;">
    <div style="height:3px;border-radius:999px;background:#D99A1E;margin-bottom:12px;"></div>
    <div style="display:flex;align-items:center;gap:12px;border-bottom:3px solid ${r.accent};padding-bottom:10px;">
      <img src="${logo}" alt="Coasul" style="height:42px;">
      <div style="flex:1;">
        <div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#5B6660;font-weight:700;">Coasul Agro · Ficha de Cotação</div>
        <div style="font-size:19px;font-weight:600;">${esc(r.icone)} ${esc(r.cultura)}${r.cultivar ? " · " + esc(r.cultivar) : ""}</div>
      </div>
      <div style="text-align:right;font-size:10.5px;color:#5B6660;">${esc(r.data)}</div>
    </div>

    <table style="width:100%;margin-top:12px;border-collapse:collapse;">
      <tr>${info.map(([k, v]) => `
        <td style="padding:6px 8px;background:#F4F7F0;border:1px solid #E2E7DA;width:25%;">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#5B6660;font-weight:700;">${esc(k)}</div>
          <div style="font-size:13px;font-weight:700;">${esc(v)}</div>
        </td>`).join("")}
      </tr>
    </table>

    <div style="margin-top:6px;font-size:11px;color:#5B6660;">
      ${r.params.map(([k, v]) => `${esc(k)}: <strong style="color:#1E2420;">${esc(v)}</strong>`).join(" &nbsp;·&nbsp; ")}
    </div>

    <div style="margin-top:14px;border:1.5px solid ${r.accent};border-radius:8px;padding:12px 14px;">
      <div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:${r.accent};">Necessidade total</div>
      <div style="font-family:monospace;font-size:28px;font-weight:700;margin-top:2px;">${esc(r.total)} <span style="font-size:13px;font-weight:400;color:#5B6660;">${esc(r.unidade)}</span></div>
      ${r.combo ? `<div style="margin-top:6px;font-size:10.5px;color:#5B6660;">${esc(r.combo)}</div>` : ""}
    </div>

    ${r.nutrientes.length ? `
    <div style="margin-top:12px;font-size:11px;">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#5B6660;margin-bottom:4px;">Nutriente que será fornecido ao solo · total na área</div>
      ${r.nutrientes.map(n => `<span style="display:inline-block;border:1px solid #E2E7DA;border-radius:6px;padding:5px 9px;margin-right:6px;">${esc(n.nome)}: <strong>${esc(n.valor)}</strong> <span style="color:#5B6660;">(${esc(n.porAlq)})</span></span>`).join("")}
    </div>` : ""}

    <div style="margin-top:14px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <div style="font-size:12px;font-weight:800;">Custo por embalagem</div>
        <div style="font-size:10.5px;color:#5B6660;">${r.vencimento ? "Vencimento do prazo: <strong style='color:#1E2420;'>" + esc(r.vencimento) + "</strong> " + esc(r.vencimentoDias) : "Prazo sem data informada"}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:11px;">
        <thead>
          <tr style="text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#5B6660;">
            <th style="padding:4px 8px;">Embalagem</th>
            <th style="padding:4px 8px;text-align:right;">Preço à vista</th>
            <th style="padding:4px 8px;text-align:right;">Preço a prazo</th>
            <th style="padding:4px 8px;text-align:right;">Custo à vista</th>
            <th style="padding:4px 8px;text-align:right;">Custo a prazo</th>
          </tr>
        </thead>
        <tbody>${linhasHtml}</tbody>
      </table>
      <div style="margin-top:6px;font-size:10px;color:#5B6660;">Bag e sacaria são alternativas de compra — os custos das linhas não se somam. Quantidades arredondadas para embalagem fechada.</div>
    </div>

    <div style="margin-top:16px;border-top:1px solid #E2E7DA;padding-top:8px;font-size:9.5px;color:#5B6660;">
      Documento gerado pela Calculadora de Sementes e Adubação · Coasul — valores sujeitos a conferência pelo técnico.
    </div>
  </div>`;
}

$("btnPdf").addEventListener("click", () => {
  const r = coletarResumo();
  $("printSheet").innerHTML = montarFolha(r);
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
  ctx.strokeStyle = cor || "#E2E7DA"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x1, y + .5); ctx.lineTo(x2, y + .5); ctx.stroke();
}

function layoutFicha(ctx, draw, r, logo){
  const W = 1000, P = 40, dir = W - P;
  let y = P;

  // linha dourada no topo, igual ao cabeçalho da ficha na tela
  if(draw){ ctx.fillStyle = "#D99A1E"; ctx.fillRect(P, y, dir - P, 3); }
  y += 3 + 16;

  // cabeçalho com o logo
  const logoH = 44, logoW = logo && logo.naturalWidth ? logoH * logo.naturalWidth / logo.naturalHeight : 60;
  if(draw && logo) ctx.drawImage(logo, P, y, logoW, logoH);
  const xt = P + logoW + 16;
  texto(ctx, draw, "COASUL AGRO · FICHA DE COTAÇÃO", xt, y + 14, {font:"bold 10px " + FONTE, cor:"#5B6660", espaco:"1.6px"});
  texto(ctx, draw, `${r.icone} ${r.cultura}${r.cultivar ? " · " + r.cultivar : ""}`, xt, y + 36, {font:"600 21px " + FONTE, maxW:dir - xt - 110});
  texto(ctx, draw, r.data, dir, y + 14, {font:"11px " + FONTE, cor:"#5B6660", align:"right"});
  y += logoH + 12;
  risco(ctx, draw, P, y, dir, r.accent);
  if(draw){ ctx.fillStyle = r.accent; ctx.fillRect(P, y, dir - P, 2.5); }
  y += 20;

  // cliente / cultivar / cultura / área
  const info = [["Cliente", r.cliente || "—"], [r.rotuloCultivar, r.cultivar || "—"], ["Cultura", r.cultura], ["Área", r.area]];
  const gap = 10, bw = (dir - P - gap * 3) / 4, bh = 48;
  info.forEach(([k, v], i) => {
    const x = P + i * (bw + gap);
    caixa(ctx, draw, x, y, bw, bh, 8, "#F6F8F2", "#E2E7DA");
    texto(ctx, draw, k.toUpperCase(), x + 10, y + 17, {font:"bold 9px " + FONTE, cor:"#5B6660", espaco:"0.6px", maxW:bw - 20});
    texto(ctx, draw, v, x + 10, y + 36, {font:"bold 14px " + FONTE, maxW:bw - 20});
  });
  y += bh + 14;

  // parâmetros usados no cálculo
  if(r.params.length){
    const linha = r.params.map(([k, v]) => `${k}: ${v}`).join("   ·   ");
    ctx.font = "11.5px " + FONTE;
    quebraTexto(ctx, linha, dir - P).forEach(l => {
      texto(ctx, draw, l, P, y + 10, {font:"11.5px " + FONTE, cor:"#5B6660"});
      y += 16;
    });
    y += 6;
  }

  // necessidade total
  ctx.font = "10.5px " + FONTE;
  const comboLinhas = r.combo ? quebraTexto(ctx, r.combo, dir - P - 28) : [];
  const alturaTotal = 78 + (comboLinhas.length ? comboLinhas.length * 14 + 6 : 0);
  caixa(ctx, draw, P, y, dir - P, alturaTotal, 10, "#FFFFFF", r.accent);
  texto(ctx, draw, "NECESSIDADE TOTAL", P + 14, y + 22, {font:"bold 10px " + FONTE, cor:r.accent, espaco:"1.2px"});
  texto(ctx, draw, r.total, P + 14, y + 58, {font:"bold 30px " + MONO});
  if(draw){
    ctx.font = "bold 30px " + MONO;
    const w = ctx.measureText(r.total).width;
    texto(ctx, draw, r.unidade, P + 22 + w, y + 58, {font:"13px " + FONTE, cor:"#5B6660"});
  }
  comboLinhas.forEach((l, i) => texto(ctx, draw, l, P + 14, y + 78 + i * 14, {font:"10.5px " + FONTE, cor:"#5B6660"}));
  y += alturaTotal + 18;

  // nutrientes (adubação)
  if(r.nutrientes.length){
    texto(ctx, draw, "NUTRIENTE QUE SERÁ FORNECIDO AO SOLO · TOTAL NA ÁREA", P, y + 10, {font:"bold 9.5px " + FONTE, cor:"#5B6660", espaco:"0.6px"});
    y += 20;
    const nw = (dir - P - 20) / 3, nh = 44;
    r.nutrientes.forEach((n, i) => {
      const x = P + i * (nw + 10);
      caixa(ctx, draw, x, y, nw, nh, 8, "#FFFFFF", "#E2E7DA");
      texto(ctx, draw, n.nome, x + 10, y + 16, {font:"bold 9.5px " + FONTE, cor:"#5B6660", maxW:nw - 20});
      texto(ctx, draw, n.valor, x + 10, y + 33, {font:"bold 14px " + MONO, maxW:nw - 20});
      texto(ctx, draw, n.porAlq, x + nw - 10, y + 33, {font:"9.5px " + FONTE, cor:"#5B6660", align:"right"});
    });
    y += nh + 18;
  }

  // tabela de custos
  texto(ctx, draw, "Custo por embalagem", P, y + 12, {font:"bold 13px " + FONTE});
  texto(ctx, draw, r.vencimento ? `Vencimento do prazo: ${r.vencimento} ${r.vencimentoDias}` : "Prazo sem data informada",
        dir, y + 12, {font:"10.5px " + FONTE, cor:"#5B6660", align:"right"});
  y += 24;

  const colMoeda = 152;
  const x4 = dir, x3 = dir - colMoeda, x2 = dir - colMoeda * 2, x1 = dir - colMoeda * 3;
  const larguraNome = x1 - colMoeda - P + colMoeda - 12;
  texto(ctx, draw, "EMBALAGEM", P, y + 10, {font:"bold 9px " + FONTE, cor:"#5B6660", espaco:"0.5px"});
  [["PREÇO À VISTA", x1], ["PREÇO A PRAZO", x2], ["CUSTO À VISTA", x3], ["CUSTO A PRAZO", x4]]
    .forEach(([t, x]) => texto(ctx, draw, t, x, y + 10, {font:"bold 9px " + FONTE, cor:"#5B6660", align:"right", espaco:"0.5px"}));
  y += 16;
  risco(ctx, draw, P, y, dir);
  y += 4;

  r.linhas.forEach(l => {
    const alt = 44;
    texto(ctx, draw, l.nome, P, y + 17, {font:"bold 12.5px " + FONTE, maxW:larguraNome - (l.menor ? 92 : 0)});
    if(l.menor){
      ctx.font = "bold 12.5px " + FONTE;
      const wn = Math.min(ctx.measureText(l.nome).width, larguraNome - 92);
      caixa(ctx, draw, P + wn + 8, y + 5, 84, 16, 8, "rgba(46,107,94,.12)", null);
      texto(ctx, draw, "MENOR CUSTO", P + wn + 14, y + 16, {font:"bold 8.5px " + FONTE, cor:"#2E6B5E"});
    }
    texto(ctx, draw, l.qtd, P, y + 33, {font:"10.5px " + MONO, cor:"#5B6660", maxW:larguraNome});
    texto(ctx, draw, l.precoVista, x1, y + 20, {font:"11.5px " + MONO, cor:"#5B6660", align:"right", maxW:colMoeda - 10});
    texto(ctx, draw, l.precoPrazo, x2, y + 20, {font:"11.5px " + MONO, cor:"#5B6660", align:"right", maxW:colMoeda - 10});
    texto(ctx, draw, l.vista, x3, y + 18, {font:"bold 13px " + MONO, align:"right"});
    texto(ctx, draw, l.vistaAlq, x3, y + 32, {font:"9.5px " + FONTE, cor:"#5B6660", align:"right"});
    texto(ctx, draw, l.prazo, x4, y + 18, {font:"bold 13px " + MONO, align:"right"});
    texto(ctx, draw, l.prazoAlq, x4, y + 32, {font:"9.5px " + FONTE, cor:"#5B6660", align:"right"});
    y += alt;
    risco(ctx, draw, P, y, dir, "#EDF1E6");
    y += 4;
  });

  y += 6;
  texto(ctx, draw, "Bag e sacaria são alternativas de compra — os custos das linhas não se somam. Quantidades arredondadas para embalagem fechada.",
        P, y + 10, {font:"10px " + FONTE, cor:"#5B6660", maxW:dir - P});
  y += 24;
  risco(ctx, draw, P, y, dir);
  texto(ctx, draw, "Gerado pela Calculadora de Sementes e Adubação · Coasul — valores sujeitos a conferência pelo técnico.",
        P, y + 18, {font:"9.5px " + FONTE, cor:"#5B6660"});
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

function baixar(href, nome){
  const a = document.createElement("a");
  a.href = href; a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

$("btnPng").addEventListener("click", () => {
  const r = coletarResumo();
  const cv = desenharFicha(r);
  // toDataURL é síncrono: o download dispara na hora, sem depender de callback
  baixar(cv.toDataURL("image/png"), nomeArquivo(r, "png"));
});

// ---- Alternância entre a calculadora de sementes e a regulagem de plantadeira
const viewBtnCalc = $("viewBtnCalc");
const viewBtnReg = $("viewBtnReg");
const viewCalculadora = $("viewCalculadora");
const viewRegulagem = $("viewRegulagem");

function setView(view){
  const ehCalc = view === "calc";
  viewBtnCalc.classList.toggle("is-active", ehCalc);
  viewBtnCalc.setAttribute("aria-selected", ehCalc ? "true" : "false");
  viewBtnReg.classList.toggle("is-active", !ehCalc);
  viewBtnReg.setAttribute("aria-selected", !ehCalc ? "true" : "false");
  viewCalculadora.classList.toggle("hidden", !ehCalc);
  viewRegulagem.classList.toggle("hidden", ehCalc);
}
viewBtnCalc.addEventListener("click", () => setView("calc"));
viewBtnReg.addEventListener("click", () => setView("reg"));

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
}
["regPopulacao","regEspacamento","regGerminacao"].forEach(id => $(id).addEventListener("input", calcRegulagem));
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

selectCrop("soja");

// ---- PWA: registra o service worker (cache do app shell + funcionamento
// offline depois da primeira visita). Só roda em http(s) ou localhost -
// abrir o arquivo direto (file://) não tem service worker nesse caso, mas a
// ficha continua funcionando normalmente, só sem instalação real.
if("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}