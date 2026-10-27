---
name: postai
description: Roda e usa o Postaí, que publica o mesmo post no X, Threads, LinkedIn, Facebook e Instagram pelo navegador. Use quando o usuário pedir para colocar o Postaí (ou "a aplicação") para rodar, abrir a interface, conferir sessões/login das redes, publicar ou postar algo nas redes sociais, simular uma publicação, ver o histórico/links de posts ou consertar uma rede que parou de publicar.
---

# Postaí

Todos os comandos rodam na raiz do projeto (a pasta com `package.json` cujo `name` é `postai`).
Se não estiver nela, mude antes com `cd`.

Escolha o fluxo pelo pedido:

- "coloca para rodar", "abre a aplicação", "sobe o Postaí" → **Rodar a aplicação**
- "posta/publica isso…", "manda no X e no LinkedIn…" → **Publicar**
- "testa", "simula" → **Publicar** com `--dry-run`
- "não publicou", "deu erro no Instagram" → **Consertar uma rede**

## Rodar a aplicação

1. **Preparar:** `npm run setup`. Instala o que falta, cria `config.json` se não existir e confere o navegador.
   Se ele avisar que os `handles` estão vazios, pergunte ao usuário o @ dele em X, Threads e Instagram e grave
   em `config.json` (sem o @).
2. **Sessões:** `npm run check`.
   - Tudo ✅: siga.
   - Algum ❌: o login é **interativo e só o usuário faz**. Peça para ele rodar
     `! npm run login -- <redes com ❌>` (o prefixo `!` roda no próprio terminal da conversa), entrar nas contas
     e fechar a janela. Depois rode `npm run check` de novo. Nunca digite senhas nem códigos por ele.
3. **Subir a interface:** rode `npm start` **em segundo plano** (é um servidor que não termina) e confirme que
   respondeu com `curl -s localhost:4545/api/networks` (a porta pode ser outra em `config.json > port`).
   Se a porta já estiver ocupada, provavelmente o Postaí já está rodando: confirme com o mesmo `curl`.
4. **Responder ao usuário** com:
   - o endereço `http://localhost:4545`;
   - o estado das sessões (quais redes estão prontas);
   - em 3 linhas, como usar: marcar redes → escrever (imagem com 🖼️ ou Ctrl+V) → Publicar, ou Simular para testar;
     cada rede volta com ✅ e link ou ❌ com o erro.

## Publicar

1. **Montar o post** a partir do pedido:
   - **Texto:** use as palavras do usuário. Se pedir para você escrever ou adaptar, escreva e mostre antes.
   - **Redes:** as que ele citou; se não citou, as de `config.json > defaultNetworks`.
   - **Imagem:** caminho de arquivo, se ele mandou. Sem imagem, o Instagram recebe um card gerado com o texto.
2. **Checar limites** (`config.json > limits`; padrão X 280, Threads 500, LinkedIn 3.000, Instagram 2.200).
   Se passar em alguma rede, avise e proponha uma versão mais curta só para ela, ou tirar a rede.
3. **Confirmar** mostrando texto, redes e imagem. Só pule a confirmação se o usuário já pediu explicitamente para
   publicar aquele texto exato naquelas redes. Publicar é público e não dá para desfazer daqui.
4. **Gravar o texto num arquivo** temporário (evita problemas com aspas e quebras de linha) e rodar:
   ```bash
   npm run post -- --file /caminho/post.txt --to x,threads,linkedin [--image /caminho/foto.jpg] [--dry-run]
   ```
   Para textos diferentes por rede, rode um comando por grupo de redes com o texto de cada um.
   A publicação leva de 20 s a 1 min por rede; use um timeout de alguns minutos.
5. **Relatar** a saída rede por rede: ✅ com o link clicável, 🧪 na simulação, ❌ com o erro. Se houver
   `print do erro: …png`, abra a imagem para entender o que apareceu na tela e explique.
   Saída com código 1 significa que pelo menos uma rede falhou; as outras podem ter publicado.

Se `npm run check` ainda não foi rodado na conversa, rode antes de publicar para não falhar por sessão vencida.

## Consertar uma rede

1. Veja o erro e o print em `data/screenshots/<id>-<rede>.png`.
2. Sessão caiu (tela de login no print)? Peça `! npm run login -- <rede>`.
3. Layout mudou? Reproduza com `--dry-run` (com `"headless": false` o usuário vê o navegador) e ajuste
   `src/networks/<rede>.ts`. Inspecione a página real para achar o seletor novo; prefira papéis e textos
   acessíveis (`getByRole`) a classes geradas, e acrescente o texto novo às listas de idiomas em vez de trocar.
4. Valide com `npm run typecheck` e uma simulação naquela rede antes de dizer que está consertado.

## Histórico

`data/history.json` guarda os últimos envios (texto, data, status e link por rede). Para "quais foram meus
últimos posts" ou "me passa o link do post de ontem", leia esse arquivo.
