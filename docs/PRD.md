# PRD - Comparador de Imagens

## Necessidade

Acompanhar um local ao longo do tempo por fotos da mesma câmera (uma por mês) e enxergar o que mudou:
vegetação que cresce ou seca perto dos módulos, obra, sujeira, sombreamento. A câmera se desloca um
pouco entre capturas, então as fotos precisam ser alinhadas antes de comparar.

## Público e uso

Uso próprio, em notebook, para inspeção e para figuras de relatório e apresentação.

## Requisitos

| Requisito | Atendimento |
|---|---|
| Comparar duas imagens no mesmo lugar | Cortina, transparência, piscar, lupa |
| Ver as duas inteiras | Lado a lado sincronizado |
| Série de imagens (uma por mês) | Até 12 imagens; modo Fatias mostra todas; qualquer par vira A e B |
| Imagens levemente desalinhadas | Alinhamento automático por correlação e ajuste manual |
| Saber o que mudou | Modo Diferença com percentual; modo Vegetação com área verde e variação |
| Luz diferente entre fotos | Opção de igualar o brilho de B ao de A |
| Levar para o relatório | PNG da vista, PNG lado a lado, vídeo da cortina |
| Privacidade | Nenhuma imagem sai do navegador |

## Fora do escopo

- Guardar as imagens entre sessões.
- Alinhamento com perspectiva (homografia); cobre translação, escala e rotação.
- Medição calibrada de vegetação: o índice é uma estimativa pela cor do pixel.
