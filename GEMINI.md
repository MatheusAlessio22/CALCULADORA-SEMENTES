# Diretrizes do Projeto: Calculadora de Sementes (Coasul)

## 🚨 REGRAS CRÍTICAS DE ARQUITETURA (OPERAÇÃO OFFLINE)
1. **Dependência Zero de Rede**: É estritamente proibido o uso de CDNs, Google Fonts online ou scripts externos. Todo recurso (fontes, imagens, ícones) deve ser local e vir das pastas `/assets`, `/css`, `/js` ou `/icons`.
2. **Ciclo de Vida do PWA**: Nunca altere a lógica de registro do `service-worker.js` ou do `manifest.json` sem autorização. Novas rotas ou arquivos criados em `/js` ou `/css` devem ser adicionados à lista de precache do Service Worker.
3. **Persistência Local**: Todos os dados gerados pelo usuário em campo devem ser salvos usando LocalStorage ou IndexedDB. Nunca assuma que uma requisição de rede (`fetch`) funcionará.

## 🔀 DIRETRIZES DE FLUXO (MAIN VS DEV)
1. **Ambiente de Trabalho**: Novas funcionalidades, fórmulas em `js/calculos.js` ou novos dados em `js/cultivares.js` devem ser alterados EXCLUSIVAMENTE na branch ou arquivos de desenvolvimento (`dev`).
2. **Atualização Geral (Deploy)**: Antes de mesclar modificações da branch `dev` para a `main`, o comando obrigatório `npm run release` DEVE ser executado no terminal para atualizar a versão do cache e validar os testes unitários de `tests/calculos.test.js`.
3. **Preservação de Dados**: Atualizações de código não podem corromper os dados que o usuário já possui salvos localmente no navegador em campo. Garanta retrocompatibilidade de dados.

## Visão Geral
Ficha de campo para cálculo de sementes, adubação, custo por embalagem e regulagem de plantadeiras (Soja, Milho, Feijão, Trigo). Funciona 100% offline via Service Worker.

## Padrões de Desenvolvimento
- **Arquitetura**: HTML5, Vanilla JavaScript (ES6+) e CSS3 nativo. Sem uso de frameworks pesados.
- **Offline-First**: Garantir que toda funcionalidade continue operando offline. Ao alterar scripts ou recursos estáticos, verificar a integridade dos arquivos em cache no `service-worker.js`.
- **UI/UX**: Interface otimizada para dispositivos móveis no campo, com foco em clareza, botões legíveis sob luz solar direta e validação imediata de entradas numéricas.

## Testes e Qualidade
- Rodar os testes unitários via Vitest antes de finalizar alterações na lógica de cálculo:
  ```bash
  npm test
  ```
- Garantir que a precisão dos cálculos agrícolas de dosagem, população de plantas e regulagem de engrenagens esteja alinhada com as recomendações agronômicas.

## Estrutura do Repositório
- `js/`: Lógica das calculadoras (`calculos.js`, `cultivares.js`, `app.js`).
- `css/`: Estilos da aplicação e responsividade.
- `tests/`: Testes unitários com Vitest (`calculos.test.js`).
- `standalone/`: Versão autocontida da ficha em arquivo único (`CALCULADORA COASUL.html`).
- `service-worker.js`: Gerenciamento de cache offline (atualizar `CACHE_NAME` ao alterar arquivos estáticos).
- `manifest.json`: Configurações de PWA para instalação no celular.

## Sincronização entre Versões
- Ao alterar regras de cálculo ou elementos de interface, manter sincronizadas a versão principal PWA (`index.html` + `js/` + `css/`) e a versão de arquivo único (`standalone/CALCULADORA COASUL.html`).
