# Calculadora de Sementes e Adubação — Coasul

Ficha de campo para calcular necessidade de sementes, adubação e custo por
embalagem (Soja, Milho, Feijão, Trigo e Adubação/Ureia), além de uma
calculadora de regulagem de plantadeira. Funciona 100% offline — não faz
nenhuma chamada de rede.

Este repositório tem **duas versões equivalentes** da mesma ficha:

## 1. App instalável (raiz do repositório)

`index.html` + `manifest.json` + `service-worker.js` + `css/` + `js/` +
`assets/` + `icons/` — a versão pensada para ser hospedada (GitHub Pages,
Netlify, Vercel etc.) e **instalada** na tela de início do celular (iOS e
Android), com ícone próprio e funcionamento offline via service worker.

**Rodar localmente para testar:**
```bash
npx serve .
# ou
python -m http.server 8000
```
Depois abra `http://localhost:PORTA` no navegador. A instalação real (com o
service worker funcionando) só funciona em `https://` ou em `localhost` —
não funciona abrindo o `index.html` direto pelo disco (`file://`).

**Atualizar a versão instalada:** depois de editar `css/`, `js/` ou os
ícones, mude `CACHE_VERSION` em `service-worker.js` (ex.: `v1` → `v2`) —
senão quem já instalou o app fica preso na versão em cache antiga.

## 2. Arquivo único (`standalone/`)

`standalone/CALCULADORA COASUL.html` — a mesma ficha, mas num único arquivo
HTML autocontido (CSS, JS, logo e imagens embutidos em base64). Não precisa
de servidor: dá pra abrir direto pelo disco, mandar por e-mail/WhatsApp, ou
guardar num pendrive. Não é instalável na tela de início, mas funciona
offline normalmente.

As duas versões têm a mesma interface e a mesma lógica de cálculo — ao
alterar uma, replique a mudança na outra.
