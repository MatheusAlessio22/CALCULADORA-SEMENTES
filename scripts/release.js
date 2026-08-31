// Publica uma atualização: sobe a versão semântica (patch) em package.json,
// sincroniza APP_VERSION em js/app.js (mostrada no rodapé do app e nos
// PDFs/imagens exportados — ver footerVersion em index.html) e gera um novo
// CACHE_NAME em service-worker.js (força o service worker a trocar o cache
// antigo pelo novo, ver comentário no topo do arquivo). Rodar via
// `npm run release`, que encadeia isso com build + test.
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const APP_JS_PATH = path.join(ROOT, "js", "app.js");
const SW_PATH = path.join(ROOT, "service-worker.js");

// `npm version patch` cuida de subir package.json E package-lock.json juntos
// (não regravamos isso na mão pra não corromper o lockfile).
execSync("npm version patch --no-git-tag-version", { cwd: ROOT, stdio: "pipe" });
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const novaVersao = pkg.version;

let appJs = fs.readFileSync(APP_JS_PATH, "utf8");
appJs = appJs.replace(
  /const\s+APP_VERSION\s*=\s*['"](.+?)['"]/,
  `const APP_VERSION = "${novaVersao}"`
);
fs.writeFileSync(APP_JS_PATH, appJs);

const novoCache = "cache-v" + Date.now();
let sw = fs.readFileSync(SW_PATH, "utf8");
sw = sw.replace(/const\s+CACHE_NAME\s*=\s*['"](.+?)['"]/, `const CACHE_NAME = '${novoCache}'`);
fs.writeFileSync(SW_PATH, sw);

console.log(`Nova versao: ${novaVersao}`);
console.log(`Novo cache gerado: ${novoCache}`);
