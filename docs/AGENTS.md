# Diretrizes para Agentes de IA - Comparador de Imagens

Valem as diretrizes globais do Allan Workbench (HTML, CSS e JS puros; tema escuro; SSO pelo bridge).
Este arquivo registra só o que é específico daqui.

## Escopo

- Atue apenas neste diretório. Não há tabelas no Supabase.
- Fotos nunca vão para o git (`.gitignore` bloqueia jpg, jpeg e png). `versao-antiga/` também fica fora.

## Arquitetura

- `engine.js` é puro (sem DOM) e exporta `CMP` para o navegador e para o Node. Todo cálculo sobre pixels fica aqui.
- `app.js` carrega imagens, guarda o estado em `S` e desenha tudo em um único canvas.
- `?dev` em localhost pula o bridge para testar a interface. Não estenda isso a outros hosts.

## Convenções

- **Referência:** a primeira imagem. Tudo é desenhado no sistema de coordenadas dela por `paint()`;
  a vista (zoom e posição) leva esse sistema à tela em `vt()`.
- **Alinhamento:** cada imagem tem `al = {dx, dy, scale, rot}` em pixels da referência. A referência nunca se move.
  O ajuste manual vale para B; se B for a referência, vale para A.
- **Corte:** cortina e fatias usam a mesma geometria (`band`): uma normal dada pelo ângulo e uma posição ao longo dela.
- **Análise:** diferença e vegetação rodam em cópia reduzida (até 960 px de largura) e viram uma camada desenhada como imagem.
- **`S.clean`:** quando ligado, o desenho omite alças e marcas de cursor. Use ao exportar.

## Regras de cálculo

| Item | Regra |
|---|---|
| Alinhamento | Correlação em grade de 192 px de largura: translação, depois escala, rotação e refino subpixel |
| Brilho | Razão das somas RGB de A e B nos pixels em que as duas existem |
| Diferença | Média do módulo da diferença por canal; acima do limiar conta como mudança |
| Vegetação | Excesso de verde normalizado `(2G − R − B) ÷ (R + G + B)` acima da sensibilidade |

O índice de vegetação é estimativa: sombra, reflexo e balanço de branco mudam o resultado. Não o apresente como medição.

## Ao terminar

Rode `node tests/engine.test.js` e registre a mudança em `docs/CHANGELOG.md`.
