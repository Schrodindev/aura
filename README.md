# Auras & Efeitos Animados — Extensão para Owlbear Rodeo 2.0

Aplique efeitos visuais animados (`.webm` com transparência) em qualquer token do mapa,
com controle de repetição: **loop infinito**, **1 vez** (impacto / magia instantânea) ou
**quantidade personalizada de repetições**.

O efeito é criado como um item `IMAGE` ancorado ao token (`attachedTo`), portanto **anda
junto com o personagem**, acompanha rotação/escala e é removido automaticamente quando o
token é apagado.

Funciona para **Mestre e Jogadores** — o próprio Owlbear filtra os tokens que cada jogador
tem permissão de editar.

---

## 📁 Estrutura do projeto

```
aura/
├── public/
│   ├── manifest.json        # manifesto da extensão (lido pelo Owlbear)
│   ├── icon.svg             # ícone do menu de contexto
│   └── aura/                # <- coloque os .webm aqui
│       ├── furia.webm       # ok — 500x500, alfa, 7.07s
│       ├── static.webm      # ok — 400x400, alfa, 1.97s
│       ├── fumaca.webm      # pendente
│       ├── cura.webm        # pendente
│       ├── escudo.webm      # pendente
│       ├── fogo.webm        # pendente
│       ├── veneno.webm      # pendente
│       └── eletrico.webm    # pendente
├── index.html               # painel do menu de contexto (CSS dark mode embutido)
├── main.js                  # UI do painel + criação da aura
├── background.html          # página persistente
├── background.js            # registra o menu de contexto + remove auras expiradas
├── auras.js                 # BIBLIOTECA_AURAS e constantes compartilhadas
├── vite.config.js           # build com 2 entradas + CORS do dev server p/ o Owlbear
├── vercel.json              # headers de CORS/cache para os .webm
└── package.json
```

> **Por que `background.html` além do `index.html`?**
> O item de menu de contexto precisa ser registrado assim que a extensão carrega, antes de
> qualquer painel ser aberto. Isso só é possível numa página persistente declarada em
> `background_url` no manifesto — é o mesmo padrão usado pelas extensões oficiais.

### Status atual dos arquivos de vídeo

Hoje existem `furia.webm` e `static.webm`. Os demais estão declarados em
[auras.js](auras.js) mas ainda não foram adicionados. Isso **não quebra a extensão**: o
painel detecta o arquivo ausente, mostra "arquivo ausente" no card e desabilita o clique.
Basta soltar os `.webm` na pasta para eles ficarem ativos.

O `duracaoSegundos` de cada entrada é só o **fallback**. Na prática o painel lê a duração
real do arquivo, então basta o valor estar na ordem de grandeza certa.

---

## 🚀 Rodando localmente

```bash
npm install
npm run dev        # http://localhost:5173
```

Para instalar a versão local no Owlbear, use `Add Extension` com a URL
`http://localhost:5173/manifest.json`.

> O Owlbear precisa acessar a URL pelo navegador do usuário, então `localhost` funciona
> apenas na sua própria máquina. Para os jogadores verem os efeitos, é obrigatório publicar
> em uma URL pública (veja abaixo) — a URL do `.webm` é gravada no item da cena e cada
> cliente baixa o vídeo por conta própria.

### "Failed to fetch" ao instalar via localhost

A partir do **Vite 6** o servidor de desenvolvimento deixou de enviar
`Access-Control-Allow-Origin` para origens externas (mudança de segurança, CVE-2025-24010).
Sem esse header o Owlbear não consegue ler o `manifest.json` e mostra **"Failed to fetch"**.

Isso **já está resolvido** pelo plugin `corsParaOwlbear()` em [vite.config.js](vite.config.js),
que libera as origens do Owlbear e envia também `Access-Control-Allow-Private-Network`
(exigido pelo Chrome quando uma página HTTPS pública acessa `localhost`).

Se mesmo assim falhar, verifique nesta ordem:

1. **O servidor está mesmo na porta que você digitou?** Se a `5173` já estiver ocupada, o
   Vite sobe em `5174`, `5175`… Confira a porta impressa no terminal.
2. **Usa Safari?** O Safari não trata `http://localhost` como origem segura e bloqueia a
   requisição a partir de uma página HTTPS. Use Chrome/Edge/Firefox, ou um túnel HTTPS.
3. **Origem diferente das cadastradas?** Adicione-a em `ORIGENS_PERMITIDAS` no
   [vite.config.js](vite.config.js).
4. **Usando túnel (ngrok/cloudflared)?** Veja a seção abaixo.

Para conferir manualmente se os headers estão corretos:

```bash
curl -i -H "Origin: https://www.owlbear.rodeo" http://localhost:5173/manifest.json
```

A resposta precisa conter `Access-Control-Allow-Origin: https://www.owlbear.rodeo`.

---

## 🔌 Usando um túnel (ngrok, cloudflared)

Um túnel dá uma URL HTTPS pública apontando para o seu `localhost` — útil para testar com os
jogadores sem fazer deploy. Duas coisas precisam estar certas:

**1. `allowedHosts`** — o Vite bloqueia hosts desconhecidos (proteção contra DNS rebinding) e
responde `Blocked request. This host ... is not allowed`. Os domínios de túnel mais comuns já
estão liberados em `HOSTS_PERMITIDOS` no [vite.config.js](vite.config.js), usando o prefixo `.`
que cobre todos os subdomínios. Como as URLs gratuitas mudam a cada reinício, isso evita ter
que editar o arquivo toda vez. Se usar outro provedor, acrescente o domínio na lista.

**2. `ORIGENS_PERMITIDAS` não muda.** Essa lista é sobre **quem faz a requisição** (o Owlbear),
não sobre onde o projeto está hospedado. Com túnel, a origem continua sendo
`https://www.owlbear.rodeo`, que já está liberada. Não adicione a URL do túnel aí.

### ⚠️ ngrok gratuito tem um porém

O plano free do ngrok mostra uma **página de aviso do navegador** antes de servir o conteúdo,
em requisições de navegação (`Accept: text/html`). O `manifest.json` costuma passar, porque é
buscado via `fetch` — mas o painel da extensão é carregado num **iframe**, que é navegação. O
resultado é a extensão instalar e o painel abrir mostrando a tela do ngrok em vez da interface.

Se isso acontecer, as saídas são:

- **cloudflared** (recomendado, gratuito e sem interstitial):
  ```bash
  cloudflared tunnel --url http://localhost:5173
  ```
- ngrok em plano pago, que remove o aviso.
- Fazer o deploy na Vercel, que resolve de vez.

### Limites do manifesto

O Owlbear valida o `manifest.json` na instalação e rejeita `description` com mais de
**128 caracteres** (`"description" length must be less than or equal to 128 characters long`).

O plugin `validarManifesto()` em [vite.config.js](vite.config.js) checa isso no `build` e ao
subir o dev server, então o erro aparece no terminal em vez de só na hora de instalar.

```bash
npm run build      # gera dist/
npm run preview    # serve dist/ localmente
```

---

## 🌐 Publicação na Vercel (não executado — instruções)

> Nada foi enviado para a Vercel. Os passos abaixo estão documentados para quando você
> quiser publicar.

### Opção A — via CLI

```bash
npm i -g vercel
vercel login
vercel            # deploy de preview
vercel --prod     # deploy de produção
```

Configurações detectadas automaticamente (confirme se perguntado):

| Campo             | Valor           |
| ----------------- | --------------- |
| Framework Preset  | `Vite`          |
| Build Command     | `npm run build` |
| Output Directory  | `dist`          |
| Install Command   | `npm install`   |

### Opção B — via painel da Vercel

1. Suba o projeto para um repositório Git (GitHub/GitLab/Bitbucket).
2. Em <https://vercel.com/new>, importe o repositório.
3. Confirme os valores da tabela acima e clique em **Deploy**.

### Depois do deploy

1. Anote a URL gerada, por exemplo `https://minhas-auras.vercel.app`.
2. Edite [public/manifest.json](public/manifest.json) e preencha `author`, e opcionalmente
   `homepage_url` com essa URL.
3. Rode o deploy novamente.
4. No Owlbear Rodeo: menu de extensões → **Add Extension** → cole
   `https://minhas-auras.vercel.app/manifest.json`.

### Sobre o `vercel.json`

O arquivo já inclui `Access-Control-Allow-Origin: *` para `/aura/*`. Isso é **importante**:
o renderer do Owlbear carrega o `.webm` de outra origem para dentro de uma textura WebGL, e
sem o header de CORS o vídeo pode falhar silenciosamente. O mesmo arquivo desliga o cache
do `manifest.json` para que atualizações da extensão sejam vistas imediatamente.

---

## 🎬 Como usar

1. Clique com o **botão direito** em um token (ou selecione vários e clique com o direito).
2. Escolha **Auras & Efeitos**.
3. No painel:
   - **Repetição** — `∞ Loop`, `1 Vez` ou `N Vezes` (com o campo de quantidade).
   - **Tamanho** — de `0.5×` a `3×` do tamanho do token.
   - **Camada** — `Atrás do token` (padrão, ideal para auras) ou `Na frente`
     (ideal para impactos e explosões).
4. Clique no card da aura desejada. O efeito é aplicado imediatamente a todos os tokens
   selecionados.

Extras do painel:

- Os cards mostram **preview animado ao vivo** do próprio `.webm`.
- **Ativas na seleção** lista as auras já aplicadas, com contagem regressiva, e permite
  remover uma por uma.
- **Remover todas as auras da seleção** limpa tudo de uma vez.
- Reaplicar a mesma aura no mesmo token **reinicia** o efeito.
- As preferências (modo, quantidade, tamanho, camada) ficam salvas por jogador.

---

## ⏱️ Como o controle de repetição funciona

O Owlbear reproduz `.webm` em **loop infinito** — não existe uma API para pedir "toque N
vezes". Então a extensão faz assim:

1. A duração real do vídeo é lida do próprio arquivo (`HTMLVideoElement.duration`). Se o
   `.webm` não trouxer duração no cabeçalho (comum em arquivos gerados por `MediaRecorder`),
   é usado o `duracaoSegundos` declarado em [auras.js](auras.js).
2. O tempo total (`duração × repetições`) é gravado no `metadata` do item.
3. O `background.js` roda um "reaper" que remove o item quando o tempo acaba.

Detalhes de robustez:

- O cronômetro usa o **relógio local** de cada cliente, contado a partir do instante em que
  a aura aparece na cena. Assim o efeito não depende de relógios sincronizados entre
  jogadores.
- Quem remove a aura é **o autor** dela; o **Mestre** age como rede de segurança, limpando
  auras órfãs caso o autor desconecte antes do fim.
- O modo `∞ Loop` nunca expira — só sai pelo painel ou apagando o token.

---

## ➕ Adicionando novas auras

1. Coloque o arquivo em `public/aura/`.
2. Adicione uma entrada em `BIBLIOTECA_AURAS` no [auras.js](auras.js):

```js
{ id: "gelo", nome: "❄️ Aura Congelante", arquivo: "/aura/gelo.webm", duracaoSegundos: 3 }
```

Recomendações para os vídeos:

- **VP9 ou VP8 com canal alfa** (transparência). Sem alfa, a aura vira um quadrado preto.
- Quadrado (ex.: `512×512`), com o efeito centralizado.
- Sem áudio, e o mais curto possível — o arquivo é baixado por cada jogador.

Exemplo de conversão preservando transparência:

```bash
ffmpeg -i entrada.mov -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 1M -an public/aura/gelo.webm
```

---

## 🔧 Personalização rápida

| O quê                       | Onde                                                       |
| --------------------------- | ---------------------------------------------------------- |
| ID único da extensão        | `PLUGIN_ID` em [auras.js](auras.js)                        |
| Lista de auras              | `BIBLIOTECA_AURAS` em [auras.js](auras.js)                 |
| Tamanho padrão              | `ESCALA_PADRAO` em [main.js](main.js)                      |
| Limite de repetições        | `LIMITES_VEZES` em [main.js](main.js)                      |
| Altura do painel            | `embed.height` em [background.js](background.js)           |
| Cores / dark mode           | bloco `:root` em [index.html](index.html)                  |

Troque `PLUGIN_ID` por um domínio reverso seu (ex.: `com.seunome.auras`) antes de publicar,
para não colidir com o metadata de outras extensões.

---

## 📎 Notas

- SDK usado: `@owlbear-rodeo/sdk` **3.1.0**.
- `npm audit` reporta 2 avisos moderados vindos de `uuid`, uma dependência transitiva do
  próprio SDK. Não há correção disponível pelo nosso lado e não afeta o funcionamento.
- Camada `Atrás do token` usa a layer `DRAWING`; `Na frente` usa `ATTACHMENT`. Se um jogador
  não tiver permissão de desenho na sala, o painel avisa e sugere trocar para `Na frente`.

## Referências

- [Getting Started — Owlbear Rodeo](https://docs.owlbear.rodeo/extensions/getting-started/)
- [Manifest — Owlbear Rodeo](https://docs.owlbear.rodeo/extensions/reference/manifest/)
- [Context Menu API](https://docs.owlbear.rodeo/extensions/apis/context-menu/)
- [SDK no GitHub](https://github.com/owlbear-rodeo/sdk)
- [Extensão oficial "Colored Rings"](https://github.com/owlbear-rodeo/colored-rings) — padrão de referência para anexos em tokens
