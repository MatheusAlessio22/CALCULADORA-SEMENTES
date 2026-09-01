// Proxy do Gemini pra interpretação de laudo de solo (Anexar Laudo de Solo,
// ver LAUDO_PROXY_URL em js/app.js). A chave real da API do Google fica só
// aqui, como secret do Cloudflare Worker (GEMINI_API_KEY via `wrangler
// secret put`) — nunca aparece no código público do site. O site (GitHub
// Pages) chama esse Worker em vez de chamar o Google direto; o Worker é
// quem monta o prompt e repassa a chamada, e devolve a resposta do Gemini
// como veio (o app já sabe interpretar esse formato).
//
// Deploy: ver worker/README.md.

const ORIGENS_PERMITIDAS = ["https://matheusalessio22.github.io", "http://localhost:5173"];

const MODELO_GEMINI = "gemini-3.6-flash";

const PROMPT_LAUDO = `Você é um agrônomo especialista em interpretar laudos de análise de solo (boletins de laboratório brasileiros).
Analise o documento anexado (PDF ou foto de um laudo de solo) e devolva APENAS um JSON válido, sem markdown e sem texto fora do JSON, no formato exato abaixo:
{
  "cliente": "nome do produtor/cooperado, ou null se não constar",
  "camada_0_20": { "ca": number|null, "mg": number|null, "k": number|null, "k_unidade": "cmolc"|"mgdm3", "al": number|null, "h_al": number|null, "p": number|null, "ph": number|null, "argila_pct": number|null },
  "camada_20_40": { "ca": number|null, "mg": number|null, "k": number|null, "k_unidade": "cmolc"|"mgdm3", "al": number|null, "h_al": number|null, "argila_pct": number|null }
}
Regras: use ponto decimal (nunca vírgula); todos os valores de Ca, Mg, Al e H+Al em cmolc/dm³; se o K estiver em mg/dm³ no laudo, informe "k_unidade":"mgdm3" e mantenha o valor em mg/dm³ (não converta); se o laudo trouxer só a camada 0-20 cm, devolva "camada_20_40" com todos os campos null; nunca invente valores — o que não constar no laudo deve ser null.`;

function headersCors(origem) {
  const permitida = ORIGENS_PERMITIDAS.includes(origem) ? origem : ORIGENS_PERMITIDAS[0];
  return {
    "Access-Control-Allow-Origin": permitida,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request, env) {
    const origem = request.headers.get("Origin") || "";
    const cors = headersCors(origem);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: cors });
    }
    if (!ORIGENS_PERMITIDAS.includes(origem)) {
      return new Response("Origem nao permitida", { status: 403, headers: cors });
    }

    // Ver LAUDO_RATE_LIMITER em wrangler.toml: o header Origin acima só barra
    // navegadores, então este é o freio de verdade contra abuso de custo/quota
    // da chave do Gemini caso a URL do Worker vaze fora do app.
    const ip = request.headers.get("CF-Connecting-IP") || "desconhecido";
    const { success } = await env.LAUDO_RATE_LIMITER.limit({ key: ip });
    if (!success) {
      return new Response("Muitas requisicoes, tente novamente em instantes.", { status: 429, headers: cors });
    }

    let corpo;
    try {
      corpo = await request.json();
    } catch {
      return new Response("JSON invalido", { status: 400, headers: cors });
    }
    const { base64, mimeType } = corpo || {};
    if (!base64 || !mimeType) {
      return new Response("base64 e mimeType sao obrigatorios", { status: 400, headers: cors });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GEMINI}:generateContent?key=${env.GEMINI_API_KEY}`;
    const respostaGemini = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT_LAUDO }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      }),
    });

    const textoResposta = await respostaGemini.text();
    return new Response(textoResposta, {
      status: respostaGemini.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  },
};
