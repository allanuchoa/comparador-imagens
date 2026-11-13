# Comparador de Imagens

Ferramenta estática do **Allan Workbench**: compara fotos do mesmo lugar em momentos diferentes
(por exemplo, uma foto por mês da mesma câmera). Alinha as imagens sozinha e mostra o que mudou.

Tudo roda no navegador. As imagens não são enviadas nem guardadas; só as preferências ficam no `localStorage`.

## O que faz

| Modo | Tecla | Para quê |
|---|---|---|
| Cortina | 1 | Linha arrastável, com ângulo e animação |
| Transparência | 2 | B por cima de A, com opacidade |
| Piscar | 3 | Alterna A e B no mesmo lugar |
| Lupa | 4 | B dentro de um círculo em volta do cursor |
| Lado a lado | 5 | Dois painéis sincronizados |
| Fatias | 6 | Tiras alternadas; com várias imagens, cada tira é um momento |
| Diferença | 7 | Só o que mudou, com percentual da área |
| Vegetação | 8 | Área verde em cada imagem e o que cresceu ou secou |

- Até 12 imagens, por arrastar, colar (Ctrl+V) ou escolher. A primeira é a referência.
- Alinhamento automático (translação, escala e rotação), ajuste fino por botões e arrastando com Alt.
- Segurar Espaço inverte A e B para conferir.
- Exporta PNG da vista, PNG lado a lado e vídeo da cortina animada.

## Estrutura

```
index.html                    interface
styles.css                    tokens do Workbench + estilos locais
engine.js                     motor puro: alinhamento, diferença, vegetação, exposição
app.js                        interface: imagens, canvas, modos, exportação
config.js / supabase.js       chaves públicas e client Supabase (sessão compartilhada)
tests/engine.test.js          teste do motor (node tests/engine.test.js)
docs/                         PRD, AGENTS, CHANGELOG
sql/setup.sql                 registro no portal (idempotente)
.github/workflows/deploy.yml  deploy no GitHub Pages a cada push na main
```

Sem bibliotecas de terceiros além do SDK do Supabase.

## Rodar localmente

```bash
python -m http.server 8000
```

Abra `http://localhost:8000/?dev`. O `?dev` só funciona em localhost e pula o login do portal.

```bash
node tests/engine.test.js
```

## Deploy e portal

Push na `main` publica em `https://allanuchoa.github.io/comparador-imagens/`. O card no portal pode ser
criado pela tela Catálogo do portal ou por `sql/setup.sql`.

Fotos nunca entram no repositório (ver `.gitignore`).
