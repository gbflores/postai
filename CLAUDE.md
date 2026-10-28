# Postaí

Publica o mesmo post no X, Threads, LinkedIn, Facebook e Instagram controlando um navegador com Playwright.
Roda só na máquina do usuário; publicar não usa APIs pagas nem IA. Só o bloco "Criar post" usa IA
(Gemini com `GEMINI_API_KEY` no `.env`, ou `claude -p`), e ele nunca publica: o usuário revisa e copia. Detalhes para humanos estão no `README.md`.

Para rodar, publicar ou consertar, siga a skill `/postai` (`.claude/skills/postai/SKILL.md`).

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run setup` | Instala dependências, cria `config.json` a partir do exemplo e confere o navegador. Seguro rodar de novo. |
| `npm run login [-- x linkedin]` | Abre o navegador para o **usuário** entrar nas contas. Interativo: só o usuário roda. |
| `npm run check` | Verifica as sessões (✅/❌ por rede). Sai com código 1 se alguma precisar de login. |
| `npm start` | Interface web em `http://localhost:4545` (só 127.0.0.1). |
| `npm run post -- --file post.txt --to x,threads [--image foto.jpg] [--dry-run]` | Publica pela linha de comando e imprime o link de cada rede. |
| `npm run typecheck` | Checagem de tipos. Não há outros testes. |

## Regras

- **Publicar é público e irreversível.** Antes de rodar `npm run post` sem `--dry-run`, mostre o texto final, as
  redes e a imagem, e só siga com a confirmação do usuário (ou se ele já pediu explicitamente para publicar aquele
  texto naquelas redes).
- **Nunca digite senhas, códigos de verificação ou resolva captchas.** Login é sempre com o usuário (`npm run login`).
- Não versionar `config.json`, `.env`, `sobre-mim.md` nem `data/` (sessões do navegador, uploads, prints, histórico).
- Mantenha os seletores multilíngues: cada texto de botão fica em listas como `POST_BUTTON` em
  `src/networks/helpers.ts` ou no arquivo da rede.

## Mapa do código

- `src/core/publisher.ts`: `validate()` e `publish()`, uma rede por vez, com print em `data/screenshots/` quando falha.
- `src/networks/<rede>.ts`: roteiro de cada rede (`publish()` devolve `{ url?, note? }`).
- `src/core/writer.ts`: "Criar post" (`writePost()`); regras de estilo por rede em `STYLE`, contexto em `config.writer.knowledge`.
- `src/core/card.ts`: gera a imagem com o texto quando o Instagram recebe só texto.
- `src/server.ts` + `public/`: interface (Hono, SSE para status ao vivo, HTML/JS puros).
- `config.json`: `handles` (@ do usuário por rede, usado para achar o link), `headless`, `browser`, `limits`, `card`.
