# Calculadora de Sementes e Adubação — Coasul

Ficha de campo para calcular necessidade de sementes, adubação e custo por
embalagem (Soja, Milho, Feijão, Trigo e Adubação/Ureia), além de uma
calculadora de regulagem de plantadeira. Funciona 100% offline — não faz
nenhuma chamada de rede.

## Stack

Vanilla JavaScript (ES6+), CSS3 e HTML5 — sem framework nem bundler. PWA
offline-first via Service Worker (cache de arquivos estáticos). Testes de
lógica de cálculo com [Vitest](https://vitest.dev). Qualidade de código com
ESLint e Prettier.

Este repositório tem **duas versões equivalentes** da mesma ficha:

## 1. App instalável (raiz do repositório)

`index.html` + `manifest.json` + `service-worker.js` + `css/` + `js/` +
`assets/` + `icons/` — a versão pensada para ser hospedada (GitHub Pages,
Netlify, Vercel etc.) e **instalada** na tela de início do celular (iOS e
Android), com ícone próprio e funcionamento offline via service worker.

**Rodar localmente para testar:**
```bash
npm run dev
# ou, sem instalar dependências:
npx serve .
# ou
python -m http.server 8000
```
Depois abra `http://localhost:PORTA` no navegador. A instalação real (com o
service worker funcionando) só funciona em `https://` ou em `localhost` —
não funciona abrindo o `index.html` direto pelo disco (`file://`).

**Atualizar a versão instalada:** depois de editar `css/`, `js/` ou os
ícones, mude `CACHE_NAME` em `service-worker.js` (ex.: `v1` → `v2`) —
senão quem já instalou o app fica preso na versão em cache antiga.

## 2. Arquivo único (`standalone/`)

`standalone/CALCULADORA COASUL.html` — a mesma ficha, mas num único arquivo
HTML autocontido (CSS, JS, logo e imagens embutidos em base64). Não precisa
de servidor: dá pra abrir direto pelo disco, mandar por e-mail/WhatsApp, ou
guardar num pendrive. Não é instalável na tela de início, mas funciona
offline normalmente.

As duas versões têm a mesma interface e a mesma lógica de cálculo — ao
alterar uma, replique a mudança na outra.

## Build

Não há bundler nem etapa de compilação — os arquivos servidos são os mesmos
do repositório. `npm run build` roda uma validação sintática do JavaScript
embutido na versão `standalone/`, para pegar erros de digitação antes de
publicar:
```bash
npm run build
```

## Testes

A lógica de cálculo pura (sementes, dose, calagem/gessagem etc.) fica em
`js/calculos.js` e é coberta por testes automatizados com Vitest:
```bash
npm test
```

## Login (acesso restrito)

A ficha só abre depois de login (usuário + senha). Como o app é 100%
offline, a lista de usuários autorizados mora em `js/auth.js`, guardando só
o hash SHA-256 de cada senha (nunca a senha em texto puro) — ver o
comentário no topo do arquivo. Pra adicionar, trocar ou remover uma conta:

```bash
node scripts/gerar-hash-senha.js "a-senha-da-pessoa"
```

Cole o hash impresso numa linha de `USERS` em `js/auth.js`, depois rode
`npm run build` pra regerar a versão `standalone/` com a lista atualizada.
A senha em texto puro nunca fica salva em lugar nenhum do repositório — só
o hash. O login de cada pessoa fica salvo no navegador (localStorage) até
ela clicar em "Sair".

## Lint & Format

```bash
npm run lint    # ESLint (no-unused-vars, no-undef, eqeqeq)
npm run format  # Prettier --check (relatório; standalone/ fica fora, ver .prettierignore)
```
