// Gera o hash SHA-256 de uma senha, pra colar na lista USERS de js/auth.js
// sem deixar a senha em texto puro no código-fonte. Usa o mesmo algoritmo
// (sha256Hex) que roda no navegador, então o hash gerado aqui bate exatamente
// com o que o login vai calcular.
//
// Uso:
//   node scripts/gerar-hash-senha.js "senha-da-pessoa"
"use strict";

const { sha256Hex } = require("../js/auth.js");

const senha = process.argv[2];
if (!senha) {
  console.error('Uso: node scripts/gerar-hash-senha.js "senha-da-pessoa"');
  process.exit(1);
}

console.log(sha256Hex(senha));
