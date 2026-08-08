import OBR, { buildImage } from "@owlbear-rodeo/sdk";
import {
  BIBLIOTECA_AURAS,
  CHAVE_META,
  CHAVE_PREFS,
  MODO,
  ehAura,
  urlAbsoluta,
} from "./auras.js";

/**
 * Painel exibido dentro do menu de contexto (botao direito no token).
 *
 * Fluxo: escolher o modo de repeticao -> clicar na aura -> a aura e criada como
 * um item IMAGE com mime "video/webm", ancorado ao token via `attachedTo`.
 * O OBR reproduz o webm em loop infinito; o encerramento dos modos "1 vez" e
 * "N vezes" e feito pelo background script, que remove o item no tempo certo.
 */

const LIMITES_VEZES = { min: 1, max: 99 };
const ESCALA_PADRAO = 1.4;

/** Preferencias do painel, persistidas no metadata do player. */
const prefs = {
  modo: MODO.LOOP,
  vezes: 3,
  escala: ESCALA_PADRAO,
  atras: true,
};

/** auraId -> { largura, altura, duracaoMs } lido do proprio arquivo .webm. */
const dimensoes = new Map();
/** auraId -> true quando o arquivo nao pode ser carregado. */
const arquivosFaltando = new Map();

let selecao = [];
let tokens = [];
let aurasDaSelecao = [];
let meuId = "";

OBR.onReady(async () => {
  meuId = await OBR.player.getId();

  await carregarPrefs();
  renderizarEsqueleto();
  conectarEventos();
  aplicarTema(await OBR.theme.getTheme());
  OBR.theme.onChange(aplicarTema);

  await atualizarSelecao();
  OBR.player.onChange(atualizarSelecao);
  OBR.scene.items.onChange(() => atualizarSelecao());

  // Mantem a contagem regressiva das auras temporarias viva.
  setInterval(renderizarAtivas, 500);
});

/* ------------------------------------------------------------------ *
 * Interface
 * ------------------------------------------------------------------ */

function renderizarEsqueleto() {
  document.querySelector("#app").innerHTML = `
    <div class="cabecalho">
      <span class="titulo">Auras &amp; Efeitos</span>
      <span class="alvo" id="alvo">—</span>
    </div>

    <div class="secao">
      <span class="rotulo">Repetição</span>
      <div class="segmentado" id="modos">
        <button type="button" data-modo="${MODO.LOOP}" title="Repete para sempre até ser removida">∞ Loop</button>
        <button type="button" data-modo="${MODO.UMA}" title="Executa uma única vez e some">1 Vez</button>
        <button type="button" data-modo="${MODO.VEZES}" title="Executa uma quantidade definida de vezes">N Vezes</button>
      </div>
    </div>

    <div class="secao oculto" id="secao-vezes">
      <span class="rotulo">Quantidade de repetições</span>
      <input type="number" id="vezes" min="${LIMITES_VEZES.min}" max="${LIMITES_VEZES.max}" step="1" />
    </div>

    <div class="secao">
      <div class="linha">
        <span class="rotulo">Tamanho</span>
        <input type="range" id="escala" min="0.5" max="3" step="0.1" />
        <span class="valor" id="escala-valor">1.4×</span>
      </div>
      <div class="linha">
        <span class="rotulo">Camada</span>
        <div class="segmentado" id="camadas" style="grid-template-columns: repeat(2, 1fr); flex: 1 1 auto;">
          <button type="button" data-atras="true">Atrás do token</button>
          <button type="button" data-atras="false">Na frente</button>
        </div>
      </div>
    </div>

    <div class="secao">
      <span class="rotulo">Biblioteca</span>
      <div class="grade" id="grade"></div>
    </div>

    <div class="secao">
      <span class="rotulo">Ativas na seleção</span>
      <div class="ativas" id="ativas"></div>
    </div>

    <button type="button" class="botao-perigo" id="limpar">Remover todas as auras da seleção</button>
  `;

  const grade = document.querySelector("#grade");
  for (const aura of BIBLIOTECA_AURAS) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    card.dataset.auraId = aura.id;
    card.title = aura.nome;
    card.innerHTML = `
      <span class="preview">
        <video muted loop autoplay playsinline preload="metadata" src="${aura.arquivo}"></video>
      </span>
      <span class="nome">${aura.nome}</span>
    `;

    const video = card.querySelector("video");
    video.addEventListener("loadedmetadata", () => {
      const duracao = video.duration;
      dimensoes.set(aura.id, {
        largura: video.videoWidth || 512,
        altura: video.videoHeight || 512,
        // Alguns .webm nao trazem duracao no cabecalho e reportam Infinity.
        duracaoMs:
          Number.isFinite(duracao) && duracao > 0
            ? Math.round(duracao * 1000)
            : Math.round(aura.duracaoSegundos * 1000),
      });
    });
    video.addEventListener("error", () => {
      arquivosFaltando.set(aura.id, true);
      card.disabled = true;
      card.title = `Arquivo não encontrado: public${aura.arquivo}`;
      video.remove();
      const faltando = document.createElement("span");
      faltando.className = "faltando";
      faltando.textContent = "arquivo ausente";
      card.querySelector(".preview").appendChild(faltando);
    });

    card.addEventListener("click", () => aplicarAura(aura));
    grade.appendChild(card);
  }

  sincronizarControles();
}

function conectarEventos() {
  document.querySelector("#modos").addEventListener("click", (evento) => {
    const botao = evento.target.closest("button[data-modo]");
    if (!botao) return;
    prefs.modo = botao.dataset.modo;
    sincronizarControles();
    salvarPrefs();
  });

  document.querySelector("#camadas").addEventListener("click", (evento) => {
    const botao = evento.target.closest("button[data-atras]");
    if (!botao) return;
    prefs.atras = botao.dataset.atras === "true";
    sincronizarControles();
    salvarPrefs();
  });

  document.querySelector("#vezes").addEventListener("input", (evento) => {
    prefs.vezes = limitar(
      Math.round(Number(evento.target.value) || 1),
      LIMITES_VEZES.min,
      LIMITES_VEZES.max,
    );
    salvarPrefs();
  });

  document.querySelector("#escala").addEventListener("input", (evento) => {
    prefs.escala = Number(evento.target.value);
    document.querySelector("#escala-valor").textContent = `${prefs.escala.toFixed(1)}×`;
    salvarPrefs();
  });

  document.querySelector("#limpar").addEventListener("click", removerAurasDaSelecao);
}

/** Reflete o estado de `prefs` nos controles. */
function sincronizarControles() {
  for (const botao of document.querySelectorAll("#modos button")) {
    botao.setAttribute("aria-pressed", String(botao.dataset.modo === prefs.modo));
  }
  for (const botao of document.querySelectorAll("#camadas button")) {
    botao.setAttribute("aria-pressed", String((botao.dataset.atras === "true") === prefs.atras));
  }
  document.querySelector("#secao-vezes").classList.toggle("oculto", prefs.modo !== MODO.VEZES);
  document.querySelector("#vezes").value = String(prefs.vezes);
  document.querySelector("#escala").value = String(prefs.escala);
  document.querySelector("#escala-valor").textContent = `${prefs.escala.toFixed(1)}×`;
}

async function atualizarSelecao() {
  selecao = (await OBR.player.getSelection()) ?? [];

  if (selecao.length === 0) {
    tokens = [];
    aurasDaSelecao = [];
  } else {
    const itens = await OBR.scene.items.getItems();
    const idsSelecionados = new Set(selecao);
    tokens = itens.filter((item) => idsSelecionados.has(item.id) && !ehAura(item));
    aurasDaSelecao = itens.filter(
      (item) => ehAura(item) && item.attachedTo && idsSelecionados.has(item.attachedTo),
    );
  }

  const alvo = document.querySelector("#alvo");
  if (alvo) {
    alvo.textContent =
      tokens.length === 0
        ? "nenhum token selecionado"
        : tokens.length === 1
          ? tokens[0].name
          : `${tokens.length} tokens`;
  }

  renderizarAtivas();
}

function renderizarAtivas() {
  const container = document.querySelector("#ativas");
  if (!container) return;

  if (aurasDaSelecao.length === 0) {
    container.innerHTML = `<div class="vazio">Nenhuma aura ativa</div>`;
    return;
  }

  const agora = Date.now();
  container.innerHTML = aurasDaSelecao
    .map((item) => {
      const meta = item.metadata[CHAVE_META] ?? {};
      let info = "∞";
      if (meta.modo !== MODO.LOOP && Number.isFinite(Number(meta.expiraEm))) {
        const restante = Math.max(0, Math.ceil((Number(meta.expiraEm) - agora) / 1000));
        const vezes = meta.modo === MODO.UMA ? 1 : Number(meta.vezes) || 1;
        info = `${vezes}× · ${restante}s`;
      }
      return `
        <div class="ativa">
          <span class="ativa-nome">${meta.nome ?? item.name}</span>
          <span class="ativa-info">${info}</span>
          <button type="button" class="remover" data-id="${item.id}" title="Remover">✕</button>
        </div>
      `;
    })
    .join("");

  for (const botao of container.querySelectorAll(".remover")) {
    botao.addEventListener("click", () => removerItens([botao.dataset.id]));
  }
}

function aplicarTema(tema) {
  const raiz = document.documentElement.style;
  raiz.setProperty("--fundo", tema.background.default);
  raiz.setProperty("--fundo-2", tema.background.paper);
  raiz.setProperty("--texto", tema.text.primary);
  raiz.setProperty("--texto-2", tema.text.secondary);
  raiz.setProperty("--primaria", tema.primary.main);
  raiz.setProperty("--primaria-texto", tema.primary.contrastText);
}

/* ------------------------------------------------------------------ *
 * Criacao da aura
 * ------------------------------------------------------------------ */

async function aplicarAura(aura) {
  if (arquivosFaltando.get(aura.id)) return;

  if (tokens.length === 0) {
    await OBR.notification.show("Selecione um token antes de aplicar a aura.", "WARNING");
    return;
  }

  const medidas = dimensoes.get(aura.id) ?? {
    largura: 512,
    altura: 512,
    duracaoMs: Math.round(aura.duracaoSegundos * 1000),
  };

  const vezes = prefs.modo === MODO.UMA ? 1 : prefs.modo === MODO.VEZES ? prefs.vezes : 0;
  const duracaoTotalMs = prefs.modo === MODO.LOOP ? 0 : medidas.duracaoMs * vezes;
  const agora = Date.now();
  const dpiCena = await OBR.scene.grid.getDpi();

  // Reaplicar a mesma aura reinicia o efeito: removemos a anterior do mesmo tipo.
  const idsSubstituidos = aurasDaSelecao
    .filter((item) => item.metadata[CHAVE_META]?.auraId === aura.id)
    .map((item) => item.id);

  const novas = tokens.map((token) =>
    construirAura({ token, aura, medidas, vezes, duracaoTotalMs, agora, dpiCena }),
  );

  try {
    if (idsSubstituidos.length > 0) {
      await OBR.scene.items.deleteItems(idsSubstituidos);
    }
    await OBR.scene.items.addItems(novas);
  } catch (erro) {
    console.error("[auras] falha ao aplicar aura", erro);
    await OBR.notification.show(
      prefs.atras
        ? "Não foi possível criar a aura. Tente a opção “Na frente”, que usa a camada de anexos."
        : "Não foi possível criar a aura nesta cena.",
      "ERROR",
    );
  }
}

/**
 * Monta o item IMAGE animado ancorado ao token.
 *
 * O calculo de tamanho/posicao segue a mesma logica da extensao oficial
 * "Colored Rings": trabalhamos com o tamanho do token SEM escala e repassamos
 * a escala do token para o proprio item da aura, de modo que ela continue
 * correta quando o token for redimensionado.
 */
function construirAura({ token, aura, medidas, vezes, duracaoTotalMs, agora, dpiCena }) {
  const escalaDpi = dpiCena / token.grid.dpi;
  const larguraBase = token.image.width * escalaDpi;
  const alturaBase = token.image.height * escalaDpi;
  const lado = Math.max(larguraBase, alturaBase);

  // Centro do token: `position` corresponde ao ponto `grid.offset` dentro da imagem.
  const posicao = {
    x: token.position.x + (token.image.width / 2 - token.grid.offset.x) * escalaDpi,
    y: token.position.y + (token.image.height / 2 - token.grid.offset.y) * escalaDpi,
  };

  // dpi que faz o webm ocupar exatamente `lado` unidades de cena na escala 1.
  const dpiAura = (medidas.largura * dpiCena) / lado;

  return buildImage(
    {
      width: medidas.largura,
      height: medidas.altura,
      mime: "video/webm",
      // O renderer do OBR roda em outra origem: a URL precisa ser absoluta.
      url: urlAbsoluta(aura.arquivo),
    },
    {
      // Ancorar o offset no centro da imagem faz a aura girar/escalar pelo centro.
      offset: { x: medidas.largura / 2, y: medidas.altura / 2 },
      dpi: dpiAura,
    },
  )
    .name(`Aura: ${aura.nome}`)
    .position(posicao)
    .scale({ x: token.scale.x * prefs.escala, y: token.scale.y * prefs.escala })
    .rotation(token.rotation)
    .attachedTo(token.id)
    .layer(prefs.atras ? "DRAWING" : "ATTACHMENT")
    .locked(true)
    .disableHit(true)
    .visible(token.visible)
    .metadata({
      [CHAVE_META]: {
        enabled: true,
        auraId: aura.id,
        nome: aura.nome,
        modo: prefs.modo,
        vezes,
        duracaoMs: medidas.duracaoMs,
        duracaoTotalMs,
        criadoPor: meuId,
        criadoEm: agora,
        expiraEm: prefs.modo === MODO.LOOP ? null : agora + duracaoTotalMs,
        alvo: token.id,
      },
    })
    .build();
}

/* ------------------------------------------------------------------ *
 * Remocao
 * ------------------------------------------------------------------ */

async function removerItens(ids) {
  if (ids.length === 0) return;
  try {
    await OBR.scene.items.deleteItems(ids);
  } catch (erro) {
    console.error("[auras] falha ao remover aura", erro);
    await OBR.notification.show("Você não tem permissão para remover esta aura.", "ERROR");
  }
}

function removerAurasDaSelecao() {
  return removerItens(aurasDaSelecao.map((item) => item.id));
}

/* ------------------------------------------------------------------ *
 * Preferencias
 * ------------------------------------------------------------------ */

async function carregarPrefs() {
  try {
    const salvas = (await OBR.player.getMetadata())[CHAVE_PREFS];
    if (!salvas || typeof salvas !== "object") return;
    if (Object.values(MODO).includes(salvas.modo)) prefs.modo = salvas.modo;
    if (Number.isFinite(salvas.vezes)) {
      prefs.vezes = limitar(Math.round(salvas.vezes), LIMITES_VEZES.min, LIMITES_VEZES.max);
    }
    if (Number.isFinite(salvas.escala)) prefs.escala = limitar(salvas.escala, 0.5, 3);
    if (typeof salvas.atras === "boolean") prefs.atras = salvas.atras;
  } catch {
    // Sem cena / sem metadata: segue com os valores padrao.
  }
}

function salvarPrefs() {
  return OBR.player.setMetadata({ [CHAVE_PREFS]: { ...prefs } }).catch(() => {});
}

function limitar(valor, minimo, maximo) {
  return Math.min(maximo, Math.max(minimo, valor));
}
