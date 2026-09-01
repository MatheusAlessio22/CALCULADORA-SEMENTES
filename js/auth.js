// ---- Controle de acesso (login) -------------------------------------------
// A ficha é 100% offline, então não existe servidor pra validar senha: a
// lista de usuários autorizados mora aqui mesmo, no código. Pra não deixar a
// senha em texto puro visível pra quem abrir o arquivo, guardamos só o hash
// SHA-256 dela e comparamos hash com hash no login (ver Auth.tentarLogin).
// Isso barra o uso casual por quem não tem a senha combinada com a equipe,
// mas não é segurança forte: alguém disposto a ler o código-fonte consegue
// tentar quebrar o hash offline. Não guarde aqui nada que exija proteção de
// verdade.
//
// Pra adicionar, trocar ou remover uma conta:
//   1. Rode:  node scripts/gerar-hash-senha.js "a-senha-da-pessoa"
//   2. Cole o hash impresso numa linha de USERS abaixo (troque "user" pelo
//      nome de usuário escolhido).
//   3. Rode `npm run build` pra regerar a versão standalone com a lista nova.
const USERS = [
  { user: "detec.chopin", hash: "f94e12f0bcbb9909c4a26140c8906027d9dcc54950caa755eeb9105b2092ad70" },
];

// SHA-256 puro em JavaScript (sem depender de crypto.subtle, que exige
// "contexto seguro" e pode não estar disponível quando a versão standalone é
// aberta direto do disco, file://, em alguns navegadores/WebViews). Recebe
// texto e devolve o hash em hexadecimal. Suporta acentos: o texto é
// convertido pra bytes UTF-8 antes de entrar no algoritmo (FIPS 180-4).
function sha256Hex(texto) {
  const bytes = unescape(encodeURIComponent(String(texto)));

  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const maxWord = Math.pow(2, 32);
  let i, j;
  let result = "";
  const words = [];
  const bitLength = bytes.length * 8;

  const hash = [];
  const k = [];
  const isComposite = {};
  let primeCounter = 0;
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  let padded = bytes + "\x80";
  while (padded.length % 64 - 56) padded += "\x00";
  for (i = 0; i < padded.length; i++) {
    j = padded.charCodeAt(i);
    words[i >> 2] |= j << ((3 - (i % 4)) * 8);
  }
  words[words.length] = Math.floor(bitLength / maxWord);
  words[words.length] = bitLength;

  let h = hash;
  for (j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = h;
    h = h.slice(0, 8);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const a = h[0];
      const e = h[4];
      const temp1 =
        h[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & h[5]) ^ (~e & h[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & h[1]) ^ (a & h[2]) ^ (h[1] & h[2]));

      h = [(temp1 + temp2) | 0].concat(h);
      h[4] = (h[4] + temp1) | 0;
    }

    for (i = 0; i < 8; i++) h[i] = (h[i] + oldHash[i]) | 0;
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = (h[i] >> (j * 8)) & 255;
      result += (b < 16 ? "0" : "") + b.toString(16);
    }
  }
  return result;
}

const Auth = (() => {
  const SESSION_KEY = "coasulAuthUser";

  // Além de existir no localStorage, o usuário salvo precisa continuar em
  // USERS: se a conta foi removida (funcionário desligado, ver instruções no
  // topo do arquivo), a sessão salva num aparelho fica invalidada na próxima
  // vez que a ficha é aberta ali, em vez de continuar liberada pra sempre.
  function usuarioLogado() {
    try {
      const salvo = localStorage.getItem(SESSION_KEY);
      if (!salvo) return null;
      const aindaValido = USERS.some((u) => u.user === salvo);
      if (!aindaValido) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return salvo;
    } catch (e) {
      return null;
    }
  }

  function tentarLogin(usuario, senha) {
    const alvo = String(usuario || "").trim().toLowerCase();
    if (!alvo || !senha) return false;
    const hash = sha256Hex(senha);
    const encontrado = USERS.find(
      (u) => u.user.toLowerCase() === alvo && u.hash === hash
    );
    if (!encontrado) return false;
    try {
      localStorage.setItem(SESSION_KEY, encontrado.user);
    } catch (e) {
      /* localStorage indisponível (ex.: navegação privada) — segue logado só nesta aba */
    }
    return true;
  }

  function logout() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (e) {
      /* nada a limpar */
    }
  }

  return { usuarioLogado, tentarLogin, logout };
})();

// ---- Portão de login: liga o formulário de #loginGate ao Auth acima e
// esconde a tela de acesso quando já existe sessão salva (localStorage) ou
// quando o login é aceito. Roda direto (sem esperar DOMContentLoaded) porque
// este script é carregado no fim do <body>, com o DOM já pronto. Só existe
// no navegador — pulado quando este arquivo é usado via require() no Node
// (scripts/gerar-hash-senha.js).
if (typeof document !== "undefined") {
  (() => {
    const gate = document.getElementById("loginGate");
    const form = document.getElementById("loginForm");
    const userInput = document.getElementById("loginUser");
    const passInput = document.getElementById("loginPass");
    const errorMsg = document.getElementById("loginError");
    const btnLogout = document.getElementById("btnLogout");
    const appShell = document.getElementById("appShell");

    function esconderPortao() {
      gate.classList.add("hidden");
      // appShell só fica atrás do portão visualmente (z-index) — sem inert,
      // Tab alcançaria os controles do app (ex.: "Sair") antes de um login
      // válido. Ver esconderLoginGate()/entrarNoApp() abaixo: no login
      // efetivo, tirar o inert só depois da transição de saída evita que o
      // app "salte" à frente do cartão de login ainda visível.
      if (appShell) appShell.inert = false;
    }

    function mostrarPortao() {
      gate.classList.remove("hidden");
      gate.classList.remove("is-leaving"); // sem isso, o 2º login abriria com o cartão invisível
      if (appShell) appShell.inert = true;
      if (userInput) userInput.value = "";
      if (passInput) passInput.value = "";
      if (errorMsg) errorMsg.classList.add("hidden");
    }

    // ---- Helpers de apresentação (transição de saída/entrada) — só efeito
    // visual, não mexem em nada de Auth acima. Usados apenas no login
    // efetivo (envio do formulário); a sessão já salva pula direto pra
    // esconderPortao() sem passar por aqui, então nunca anima no F5.
    function esconderLoginGate(finalizar) {
      let feito = false;
      const rodarUmaVez = () => {
        if (feito) return;
        feito = true;
        finalizar();
      };
      gate.addEventListener(
        "transitionend",
        (e) => {
          if (e.target === gate && e.propertyName === "opacity") rodarUmaVez();
        },
        { once: true }
      );
      // Guarda obrigatória: se o transitionend nunca disparar (aba em 2º
      // plano, prefers-reduced-motion, elemento sem transição computada),
      // o usuário não pode ficar preso na tela de login já autenticado.
      setTimeout(rodarUmaVez, 400);
      gate.classList.add("is-leaving");
    }

    function entrarNoApp() {
      if (!appShell) return;
      let feito = false;
      const limpar = () => {
        if (feito) return;
        feito = true;
        // Obrigatório: um elemento com transform vira containing block dos
        // descendentes position:fixed. Se a classe ficasse no DOM, qualquer
        // fixed dentro de #appShell passaria a se posicionar errado.
        appShell.classList.remove("app-entrando");
      };
      appShell.addEventListener("animationend", limpar, { once: true });
      setTimeout(limpar, 500);
      appShell.classList.add("app-entrando");
    }

    // Estado inicial: o HTML já vem com o portão visível por padrão (ver
    // comentário em index.html), então appShell começa inert até confirmar
    // sessão salva — sem isso, a 1ª carga da página (sem login ainda) deixa
    // os controles do app alcançáveis por Tab por trás do portão.
    if (Auth.usuarioLogado()) esconderPortao();
    else if (appShell) appShell.inert = true;

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const ok = Auth.tentarLogin(userInput.value, passInput.value);
      passInput.value = "";
      if (ok) {
        errorMsg.classList.add("hidden");
        // Login feito: sempre abre na tela principal (Sementes & Adubação)
        // com a Soja selecionada, independente do que estava marcado antes
        // do logout.
        if (typeof window.setView === "function") window.setView("calc");
        if (typeof window.selectCrop === "function") window.selectCrop("soja");
        esconderLoginGate(esconderPortao);
        entrarNoApp();
      } else {
        errorMsg.classList.remove("hidden");
        passInput.focus();
      }
    });

    if (btnLogout) {
      btnLogout.addEventListener("click", () => {
        Auth.logout();
        mostrarPortao();
        userInput.focus();
      });
    }
  })();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { sha256Hex };
}
