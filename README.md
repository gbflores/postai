# 📣 Postaí

Escreva uma vez e publique no **X, Threads, LinkedIn, Facebook e Instagram** de uma vez. Ao final, você
recebe a confirmação de cada rede com o **link do post**.

- **De graça:** não usa as APIs oficiais (a do X é paga). O Postaí controla um navegador e faz o que você faria à mão.
- **Sem IA e sem tokens:** são roteiros fixos com [Playwright](https://playwright.dev), executados no seu computador.
- **Sem servidor:** roda só na sua máquina, e as sessões das redes ficam num perfil de navegador separado do seu.
- **Funciona com só texto:** o Instagram não aceita post sem imagem, então o Postaí gera um card com o texto.

> ⚠️ **Uso pessoal e por sua conta e risco.** Automatizar a interface vai contra os termos de uso das redes. Para
> poucas publicações por dia o risco é baixo, mas as redes podem pedir verificação, limitar ou bloquear a conta.
> Quando uma rede muda o layout, o roteiro dela pode quebrar até ser ajustado (veja
> [Quando algo quebra](#quando-algo-quebra)).

## Como funciona

```
Você escreve  ──►  Postaí abre o navegador  ──►  publica em cada rede  ──►  ✅ X        https://x.com/…/status/…
(web ou CLI)       (com as suas sessões)         uma por vez                ✅ LinkedIn https://linkedin.com/feed/update/…
                                                                            ❌ Threads  erro + print da tela
```

| Rede | Texto | Imagem | Limite | Link de confirmação |
| --- | --- | --- | --- | --- |
| X | ✅ | ✅ | 280 (configurável para o Premium) | ✅ direto da resposta do X |
| Threads | ✅ | ✅ | 500 | ✅ |
| LinkedIn | ✅ | ✅ | 3.000 | ✅ |
| Facebook (perfil pessoal) | ✅ | ✅ | 63.206 | ✅ quando o post aparece no perfil |
| Instagram | gera um card | ✅ | 2.200 na legenda | ✅ com `handles.instagram` configurado |

## Requisitos

- **Node.js 20.11 ou mais novo**
- **Google Chrome** instalado. Também funciona com o Edge ou com o Chromium do Playwright (veja `browser` na configuração).
- Linux, macOS ou Windows

## Instalação

```bash
git clone https://github.com/gbflores/postai.git
cd postai
npm run setup
```

O `setup` instala as dependências, cria o `config.json` a partir do exemplo, confere se o navegador abre e mostra os
próximos passos. Pode rodar de novo quando quiser.

Se não quiser usar o Chrome instalado, coloque `"browser": "chromium"` no `config.json` e rode `npm run setup` de
novo: ele baixa o navegador do Playwright.

## Configuração

### 1. Ajuste o `config.json`

O `npm run setup` já cria o arquivo. Preencha pelo menos os `handles`:

| Campo | Para que serve |
| --- | --- |
| `handles` | Seu @ em cada rede, **sem o @**. É com ele que o Postaí acha o link do post quando a rede não o devolve na hora. Recomendado para X, Threads e Instagram. |
| `defaultNetworks` | Redes que já vêm marcadas na interface. |
| `headless` | `false` mostra a janela do navegador enquanto publica, o que facilita acompanhar. `true` roda escondido. |
| `browser` | `chrome` (padrão), `msedge` ou `chromium`. |
| `limits` | Limite de caracteres por rede. Se você assina o X Premium, aumente o do `x`. |
| `card` | Cores e rodapé da imagem gerada para o Instagram quando o post é só texto. |
| `port` | Porta da interface web (padrão `4545`). |

O `config.json` e a pasta `data/` (sessões, imagens, histórico) ficam fora do Git.

### 2. Entre nas suas contas (uma vez só)

```bash
npm run login
```

Abre o navegador do Postaí com uma aba para cada rede. **Entre em cada uma** (marque "manter conectado"),
resolva a verificação em duas etapas se pedir, e **feche a janela** quando terminar.

Para entrar só em algumas: `npm run login -- x linkedin`.

### 3. Confira as sessões

```bash
npm run check
```

```
✅ X          conectado
✅ Threads    conectado
✅ LinkedIn   conectado
❌ Facebook   precisa de login
✅ Instagram  conectado
```

As sessões duram semanas ou meses. Quando alguma cair, rode `npm run login -- <rede>` de novo.

### 4. Faça uma simulação

Antes do primeiro post de verdade, rode uma **simulação**. Ela preenche tudo em cada rede, mas não clica em publicar:

```bash
npm run post -- "Testando o Postaí" --to x,threads,linkedin,facebook,instagram --dry-run
```

Com `"headless": false`, você vê cada rede sendo preenchida. Se todas aparecerem com 🧪, está tudo pronto.

## Como usar

### Pela interface web

```bash
npm start
```

Abra **http://localhost:4545**.

1. Marque as redes. O contador ao lado de cada uma mostra quantos caracteres faltam.
2. Escreva o texto. Para anexar uma imagem, use **🖼️ Adicionar imagem** ou cole com `Ctrl+V`.
3. Se quiser um texto diferente numa rede, ative **Texto diferente por rede**.
4. Clique em **Publicar**, ou marque **Simular** para testar sem publicar.
5. Acompanhe o envio. Cada rede aparece com ✅ e o link do post, ou ❌ com o erro e o caminho do print da tela.
6. O **Histórico** guarda os últimos envios com os links.

A interface só abre no seu computador (`127.0.0.1`) e não tem login. Não a exponha na internet.

### Pela linha de comando

```bash
# Redes padrão do config.json
npm run post -- "Texto do post"

# Escolhendo redes e anexando imagem
npm run post -- "Lançamento novo no blog" --to x,linkedin,instagram --image ~/Imagens/capa.jpg

# Quebra de linha: use \n
npm run post -- "Primeira linha\n\nSegunda linha" --to threads

# Simulação
npm run post -- "Teste" --to x --dry-run
```

O comando termina com código `1` se alguma rede falhar, o que ajuda em scripts e atalhos.

## Com o Claude Code

O repositório traz um `CLAUDE.md` e a skill **`/postai`** (`.claude/skills/postai/`). Abrindo o Claude Code na pasta
do projeto, basta pedir em linguagem natural:

- *"coloca o Postaí para rodar"*: roda o setup, confere as sessões, sobe a interface e explica como usar.
  Se alguma rede precisar de login, ele pede para você rodar `! npm run login -- <rede>`.
- *"posta no X e no LinkedIn: lançamos a versão 2 do app"*: monta o post, confere os limites, **pede sua
  confirmação**, publica e devolve o link de cada rede.
- *"simula esse post em todas as redes"* ou *"o Instagram parou de publicar, vê o que houve"*.

O Claude nunca digita suas senhas: o login nas redes é sempre seu.

Para usar de **qualquer pasta**, copie a skill para o seu usuário apontando para onde você clonou o projeto (veja o
exemplo em `.claude/skills/postai/SKILL.md`), ou crie uma skill curta em `~/.claude/skills/` que leia essa.

## O que esperar de cada rede

- **X:** o compositor novo e o antigo são suportados. O link vem direto da resposta do X. Post com mais de
  280 caracteres só funciona se a sua conta for Premium e você aumentar `limits.x`.
- **Threads:** o texto entra pelo link de intenção do Threads, que preserva as quebras de linha.
- **LinkedIn:** publica no seu **perfil pessoal**, com visibilidade conforme o seu padrão no LinkedIn.
- **Facebook:** publica no seu **perfil pessoal** com a privacidade padrão do compositor (confira se está em
  "Público" ou "Amigos" no próprio Facebook). O link é buscado no seu perfil logo após publicar.
- **Instagram:** funciona em conta pessoal, Creator ou Business. Sem imagem, o Postaí gera um card 1080×1350 com o
  texto (cores e rodapé em `card`). A imagem é publicada no corte padrão do Instagram.

## Quando algo quebra

As redes mudam o layout de vez em quando. Quando uma etapa falha:

1. O envio continua nas outras redes. A que falhou aparece com ❌ e o motivo.
2. Um print da tela no momento do erro fica em `data/screenshots/`.
3. Rode com `"headless": false` e `--dry-run` para ver onde parou.
4. Ajuste o seletor em `src/networks/<rede>.ts`. Cada arquivo é curto e comentado. Os textos dos botões ficam em
   listas com as variações de idioma (`POST_BUTTON`, `NEXT_BUTTON` etc.).

Problemas comuns:

| Sintoma | O que fazer |
| --- | --- |
| `precisa de login` no `npm run check` | `npm run login -- <rede>` |
| A rede pediu captcha ou confirmação de identidade | Abra `npm run login -- <rede>`, resolva na mão e feche |
| "O botão de publicar não ficou disponível a tempo" | Imagem grande demais ou texto acima do limite; tente uma imagem menor |
| Publicou, mas sem link | Preencha `handles` no `config.json` |
| `browserType.launchPersistentContext: Chromium distribution 'chrome' is not found` | Instale o Chrome ou use `"browser": "chromium"` e `npx playwright install chromium` |

## Estrutura

```
src/
  server.ts            interface web (Hono) e envio com status ao vivo (SSE)
  cli.ts               npm run post
  login.ts / check.ts  sessões das redes
  core/
    publisher.ts       publica rede por rede, guarda prints de erro e histórico
    browser.ts         navegador com perfil persistente (data/browser-profile)
    card.ts            imagem com o texto para o Instagram
    config.ts          config.json + padrões
  networks/
    x.ts threads.ts linkedin.ts facebook.ts instagram.ts
public/                interface (HTML, CSS e JS puros)
```

Para adicionar uma rede, crie `src/networks/<rede>.ts` com a interface `Network` (`publish()` recebe o texto e a
imagem e devolve o link) e registre em `src/networks/index.ts` e em `NETWORK_IDS`.

## Licença

[MIT](LICENSE) © Guilherme Flores
