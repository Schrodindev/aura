import OBR from "@owlbear-rodeo/sdk";
import { CHAVE_META, MODO, PLUGIN_ID, ehAura } from "./auras.js";

/**
 * Background script: roda enquanto a extensao estiver instalada, mesmo com o
 * painel fechado. Tem duas responsabilidades:
 *
 *  1. Registrar o item de menu de contexto (botao direito no token).
 *  2. Rodar o "reaper": auras criadas com repeticao limitada (1 vez ou N vezes)
 *     precisam ser removidas do mapa quando o tempo total termina. O OBR renderiza
 *     .webm em loop infinito, entao o fim do efeito e feito deletando o item.
 */

const INTERVALO_REAPER_MS = 250;

/** itemId -> timestamp local (ms) do momento em que este cliente viu a aura pela primeira vez. */
const vistoEm = new Map();

/** Cache do ultimo estado conhecido das auras da cena. */
let aurasNaCena = [];

let meuId = null;
let souMestre = false;

OBR.onReady(async () => {
  await registrarMenuDeContexto();

  meuId = await OBR.player.getId();
  souMestre = (await OBR.player.getRole()) === "GM";
  OBR.player.onChange((player) => {
    souMestre = player.role === "GM";
  });

  // A cena pode ainda nao estar carregada quando a extensao inicia.
  if (await OBR.scene.isReady()) {
    sincronizar(await OBR.scene.items.getItems());
  }
  OBR.scene.onReadyChange(async (pronta) => {
    vistoEm.clear();
    aurasNaCena = [];
    if (pronta) sincronizar(await OBR.scene.items.getItems());
  });

  OBR.scene.items.onChange(sincronizar);

  setInterval(colherAurasExpiradas, INTERVALO_REAPER_MS);
});

function registrarMenuDeContexto() {
  return OBR.contextMenu.create({
    id: `${PLUGIN_ID}/menu`,
    icons: [
      {
        icon: "/icon.svg",
        label: "Auras & Efeitos",
        filter: {
          // Somente imagens (tokens/props), nunca o mapa, o fog ou as proprias auras.
          every: [
            { key: "type", value: "IMAGE" },
            { key: "layer", value: "MAP", operator: "!=" },
            { key: "layer", value: "FOG", operator: "!=" },
            { key: ["metadata", CHAVE_META, "enabled"], value: undefined },
          ],
          // Mestre e jogadores: o proprio OBR bloqueia tokens que o jogador nao pode editar.
          permissions: ["UPDATE"],
          roles: ["GM", "PLAYER"],
        },
      },
    ],
    embed: {
      url: "/",
      height: 470,
    },
  });
}

/** Mantem o cache de auras e registra o instante em que cada uma apareceu neste cliente. */
function sincronizar(items) {
  aurasNaCena = items.filter(ehAura);

  const agora = Date.now();
  const idsAtuais = new Set();

  for (const aura of aurasNaCena) {
    idsAtuais.add(aura.id);
    if (!vistoEm.has(aura.id)) {
      // Usamos o relogio LOCAL a partir do momento em que a aura aparece.
      // Assim o efeito nao depende de relogios sincronizados entre os clientes.
      vistoEm.set(aura.id, agora);
    }
  }

  for (const id of vistoEm.keys()) {
    if (!idsAtuais.has(id)) vistoEm.delete(id);
  }
}

async function colherAurasExpiradas() {
  if (aurasNaCena.length === 0) return;

  const agora = Date.now();
  const expiradas = [];

  for (const aura of aurasNaCena) {
    const meta = aura.metadata[CHAVE_META];
    if (!meta || meta.modo === MODO.LOOP) continue;

    const total = Number(meta.duracaoTotalMs);
    if (!Number.isFinite(total) || total <= 0) continue;

    const inicio = vistoEm.get(aura.id) ?? agora;
    if (agora - inicio < total) continue;

    // Cada cliente so remove o que tem permissao de remover: o autor limpa as
    // proprias auras e o mestre limpa qualquer sobra (ex.: autor desconectou).
    if (meta.criadoPor === meuId || souMestre) {
      expiradas.push(aura.id);
    }
  }

  if (expiradas.length === 0) return;

  // Remove do cache antes do await para nao tentar deletar duas vezes no proximo tick.
  const removidas = new Set(expiradas);
  aurasNaCena = aurasNaCena.filter((aura) => !removidas.has(aura.id));

  try {
    await OBR.scene.items.deleteItems(expiradas);
  } catch (erro) {
    // Item ja removido por outro cliente, cena trocada, permissao negada: ignorar.
    console.debug("[auras] falha ao remover auras expiradas", erro);
  }
}
