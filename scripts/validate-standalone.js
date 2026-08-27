// Não há bundler neste projeto (é vanilla JS/CSS, offline-first) — "build" aqui
// significa validar que a versão standalone (arquivo único, usada em campo sem
// internet) continua com o JavaScript embutido sintaticamente correto antes de
// publicar, já que ela é editada à mão em paralelo com a versão PWA (ver
// CLAUDE.md, seção "Sincronização entre Versões").
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const STANDALONE_PATH = path.join(__dirname, "..", "standalone", "CALCULADORA COASUL.html");

const html = fs.readFileSync(STANDALONE_PATH, "utf8");
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((m) => m[1])
  .filter((code) => code.trim().length > 0);

if (scripts.length === 0) {
  console.error("Nenhum <script> inline encontrado em standalone/CALCULADORA COASUL.html");
  process.exit(1);
}

for (const [i, code] of scripts.entries()) {
  try {
    new vm.Script(code, { filename: `standalone-inline-script-${i}.js` });
  } catch (e) {
    console.error(`Erro de sintaxe no <script> inline #${i} do standalone:\n${e.message}`);
    process.exit(1);
  }
}

console.log(`OK: ${scripts.length} <script> inline(s) do standalone sao sintaticamente validos.`);
