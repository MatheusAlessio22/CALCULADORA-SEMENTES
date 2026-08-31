// Gera a versão standalone (arquivo único, usada em campo sem internet) a
// partir das fontes da versão PWA (index.html + css/ + js/), embutindo tudo
// inline (CSS, JS, fontes e logo em base64) para que o resultado abra direto
// do disco, sem precisar de servidor nem de arquivos externos.
//
// Rodar com: node scripts/bundle-standalone.js  (ou via `npm run build`)
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const INDEX_PATH = path.join(ROOT, "index.html");
const CSS_PATH = path.join(ROOT, "css", "styles.css");
const CSS_DIR = path.join(ROOT, "css");
const JS_PATHS = ["js/auth.js", "js/calculos.js", "js/cultivares.js", "js/app.js"].map((p) =>
  path.join(ROOT, p)
);
const LOGO_PATH = path.join(ROOT, "assets", "logo.png");
const OUTPUT_PATH = path.join(ROOT, "standalone", "CALCULADORA COASUL.html");

function toDataUri(filePath, mime) {
  return `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;
}

// @font-face do styles.css aponta pra "../assets/fonts/*.woff2" (caminho
// relativo à pasta css/); no standalone não existe pasta ao lado do arquivo,
// então cada fonte vira um data URI embutido direto no CSS.
function inlineFonts(css) {
  return css.replace(
    /url\((["']?)(\.\.\/assets\/fonts\/[^"')]+)\1\)/g,
    (_match, _quote, relPath) => {
      const fontPath = path.join(CSS_DIR, relPath);
      const ext = path.extname(fontPath).slice(1);
      const mime =
        ext === "woff2"
          ? "font/woff2"
          : ext === "woff"
            ? "font/woff"
            : `font/${ext}`;
      return `url("${toDataUri(fontPath, mime)}")`;
    }
  );
}

// Substituição exata (não regex): garante que o texto buscado existe uma
// única vez em index.html antes de trocar, pra falhar alto se a fonte mudou
// de formato em vez de gerar um standalone quebrado silenciosamente.
function replaceOnce(html, search, replacement, label) {
  const count = html.split(search).length - 1;
  if (count !== 1) {
    throw new Error(
      `bundle-standalone: esperava 1 ocorrência de "${label}" em index.html, encontrei ${count}. ` +
        "index.html pode ter mudado de estrutura — ajuste o script antes de gerar o standalone."
    );
  }
  return html.replace(search, replacement);
}

// Bootstrap exclusivo do standalone: como o arquivo único não tem
// manifest.json nem icons/ ao lado, ele gera favicon/apple-touch-icon/
// manifesto em runtime reaproveitando o logo já embutido no cabeçalho (evita
// duplicar base64 no <head>). Fica aqui — não em js/app.js — porque só faz
// sentido no build de arquivo único; tudo local, então continua 100% offline.
const STANDALONE_BOOTSTRAP_JS = `
// ---- Ícone e "instalar no celular": reaproveita o logo já embutido no
// cabeçalho (evita duplicar o base64 no <head>) para gerar um ícone quadrado
// (a logo original é retangular) usado como favicon, ícone ao adicionar à
// tela de início (iOS, via apple-touch-icon) e no manifesto de instalação
// (Android/Chrome). O manifesto vira um Blob local — nada disso depende de
// rede, então continua funcionando com a ficha aberta 100% offline.
try{
  const logoImg = new Image();
  logoImg.onload = () => {
    const TAM = 512;
    const cv = document.createElement("canvas");
    cv.width = cv.height = TAM;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, TAM, TAM);
    const pad = TAM * 0.14;
    const escala = Math.min((TAM - pad * 2) / logoImg.naturalWidth, (TAM - pad * 2) / logoImg.naturalHeight);
    const w = logoImg.naturalWidth * escala, h = logoImg.naturalHeight * escala;
    ctx.drawImage(logoImg, (TAM - w) / 2, (TAM - h) / 2, w, h);
    const iconSrc = cv.toDataURL("image/png");

    const addLink = (rel, href) => {
      const link = document.createElement("link");
      link.rel = rel; link.href = href;
      document.head.appendChild(link);
    };
    addLink("icon", iconSrc);
    addLink("apple-touch-icon", iconSrc);

    const manifest = {
      name: "Calculadora de Sementes e Adubação — Coasul",
      short_name: "Calculadora Coasul",
      start_url: ".",
      display: "standalone",
      background_color: "#F4F7F0",
      theme_color: "#5C8A26",
      icons: [{ src: iconSrc, sizes: \`\${TAM}x\${TAM}\`, type: "image/png", purpose: "any" }],
    };
    const manifestUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }));
    addLink("manifest", manifestUrl);
  };
  logoImg.src = document.querySelector("header img").src;
}catch(e){ /* tela de início/manifesto são só um extra; a ficha funciona normalmente sem eles */ }
`;

function build() {
  const raw = fs.readFileSync(INDEX_PATH, "utf8");
  // index.html está em CRLF (Windows); casa as substituições nessa mesma
  // quebra de linha pra não falhar por diferença invisível de \r.
  const NL = raw.includes("\r\n") ? "\r\n" : "\n";
  let html = raw;

  // 1) <meta name="description"> + comentário/links de PWA (manifest.json,
  // icons/*) não fazem sentido isolados num arquivo único -> vira o
  // comentário específico do standalone, sem links (o bootstrap cuida disso).
  html = replaceOnce(
    html,
    [
      '<meta name="description" content="Ficha de campo para cálculo de sementes e adubação — Coasul. Funciona offline.">',
      "",
      "<!-- PWA: instalável no iOS e no Android. manifest.json + service-worker.js",
      "     cuidam da instalação e do funcionamento 100% offline depois da primeira",
      '     visita; as tags apple-mobile-web-app-* fazem o "Adicionar à Tela de',
      '     Início" do iOS abrir em tela cheia, sem a barra do Safari. -->',
      '<link rel="manifest" href="manifest.json">',
      '<link rel="icon" href="icons/icon-192.png" type="image/png">',
      '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
      "",
    ].join(NL),
    [
      "<!-- Ficha 100% offline: roda de um arquivo local, sem servidor. Estas tags deixam o",
      '     "Adicionar à tela de início" abrir em tela cheia (sem a barra do navegador) tanto',
      "     no iOS quanto no Android; o ícone é aplicado por JS reaproveitando o logo já",
      "     embutido no cabeçalho, sem duplicar o base64 no <head>. -->",
      "",
    ].join(NL),
    "meta description + links de manifest/icon/apple-touch-icon"
  );

  // 2) css/styles.css -> <style> inline, com as fontes locais em base64.
  const css = inlineFonts(fs.readFileSync(CSS_PATH, "utf8"));
  html = replaceOnce(
    html,
    '<link rel="stylesheet" href="css/styles.css">',
    `<style>\n${css}\n</style>`,
    '<link rel="stylesheet"> do styles.css'
  );

  // 3) Logo do cabeçalho -> base64 inline.
  const logoDataUri = toDataUri(LOGO_PATH, "image/png");
  html = replaceOnce(
    html,
    '<img src="assets/logo.png" alt="Logo Coasul" class="h-14 w-auto drop-shadow-sm lg:h-12">',
    `<img src="${logoDataUri}" alt="Logo Coasul" class="h-14 w-auto drop-shadow-sm lg:h-12">`,
    "<img> do logo no cabeçalho"
  );

  // 4) js/auth.js + js/calculos.js + js/cultivares.js + js/app.js -> um único
  // <script> inline, na mesma ordem das tags originais, seguido do bootstrap
  // exclusivo do standalone (ícone/manifesto em runtime).
  const jsBundle = JS_PATHS.map((p) => fs.readFileSync(p, "utf8")).join("\n");
  html = replaceOnce(
    html,
    [
      '<script src="js/auth.js"></script>',
      '<script src="js/calculos.js"></script>',
      '<script src="js/cultivares.js"></script>',
      '<script src="js/app.js"></script>',
    ].join(NL),
    `<script>\n${jsBundle}\n${STANDALONE_BOOTSTRAP_JS}</script>`,
    "tags <script src=...> do auth/calculos/cultivares/app"
  );

  fs.writeFileSync(OUTPUT_PATH, html, "utf8");
  console.log(
    `OK: standalone gerado em ${path.relative(ROOT, OUTPUT_PATH)} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB).`
  );
}

build();
