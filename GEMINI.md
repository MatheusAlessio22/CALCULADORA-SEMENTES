# Diretrizes do Projeto - Calculadora Coasul PWA

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
- `js/`: Lógica das calculadoras e manipuladores de interface.
- `css/`: Estilos da aplicação e responsividade.
- `tests/`: Testes unitários com Vitest.
- `service-worker.js`: Gerenciamento de cache offline.
- `manifest.json`: Configurações de PWA.
