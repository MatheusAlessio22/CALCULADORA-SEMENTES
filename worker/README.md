# Proxy do Gemini (Cloudflare Worker)

Esconde a chave real da API do Gemini do código público do site. O app
(GitHub Pages) chama esse Worker em vez de chamar `generativelanguage.googleapis.com`
direto; a chave fica só aqui, como secret do Cloudflare, e nunca aparece no
repositório nem no navegador de quem usa o app.

## Deploy (uma vez só)

Rodar tudo dentro desta pasta (`worker/`):

```bash
cd worker
npx wrangler login
```

Abre o navegador pra autorizar o Wrangler na sua conta Cloudflare (grátis,
não precisa cartão). Depois:

```bash
npx wrangler secret put GEMINI_API_KEY
```

Cola a chave do Gemini (a mesma do Google AI Studio) quando pedir e aperta
Enter. Por fim:

```bash
npx wrangler deploy
```

Isso publica o Worker e mostra a URL final (algo como
`https://calculadora-coasul-gemini-proxy.<seu-subdominio>.workers.dev`).
Copia essa URL — ela precisa ser colada em `LAUDO_PROXY_URL` no topo de
`js/app.js` (e depois `npm run build` pra propagar pro standalone).

## Atualizar depois de mudar `worker/src/index.js`

```bash
cd worker
npx wrangler deploy
```

## Limite de requisições (rate limiting)

O Worker limita a 20 requisições por IP a cada 60s (`LAUDO_RATE_LIMITER` em
`wrangler.toml`) — é só um freio de custo/abuso caso a URL do Worker vaze
fora do app, não autenticação. Provisionado automaticamente pelo Cloudflare
no `wrangler deploy`, sem precisar criar nada à parte (diferente de KV/D1).

## Trocar a chave

```bash
cd worker
npx wrangler secret put GEMINI_API_KEY
```
