/**
 * Configuracao compartilhada entre o background script e o painel.
 */

/** Prefixo unico da extensao. Use um dominio reverso proprio para evitar colisoes. */
export const PLUGIN_ID = "com.seudominio.auras-animadas";

/** Chave usada no metadata dos itens criados por esta extensao. */
export const CHAVE_META = `${PLUGIN_ID}/aura`;

/** Chave usada no metadata do player para lembrar as preferencias do painel. */
export const CHAVE_PREFS = `${PLUGIN_ID}/prefs`;

/**
 * Biblioteca de auras.
 *
 * `arquivo` aponta para dentro de `public/`, portanto o caminho publico e `/aura/<nome>.webm`.
 * `duracaoSegundos` e apenas o fallback: no clique o painel le a duracao real do
 * arquivo via `HTMLVideoElement.duration` e usa esse valor quando disponivel.
 */
export const BIBLIOTECA_AURAS = [
  { id: "furia", nome: "🔥 Fúria do Bárbaro", arquivo: "/aura/furia.webm", duracaoSegundos: 7 },
  { id: "tiro", nome: "🔥 tido", arquivo: "/aura/tiro.webm", duracaoSegundos: 7 },
  { id: "fumaca", nome: "💨 Fumaça / Sombra", arquivo: "/aura/fumaca.webm", duracaoSegundos: 4 },
  { id: "cura", nome: "✨ Aura de Cura", arquivo: "/aura/cura.webm", duracaoSegundos: 2.5 },
  { id: "escudo", nome: "🛡️ Escudo Mágico", arquivo: "/aura/aura.webm", duracaoSegundos: 3 },
  { id: "circulo_magico", nome: "🛡️ circulo_magico", arquivo: "/aura/circulo_magico.webm", duracaoSegundos: 3 },
  { id: "fogo", nome: "🌋 Fogo Elemental", arquivo: "/aura/fireball.webm", duracaoSegundos: 3 },
  { id: "encantado", nome: "🌋 encantado", arquivo: "/aura/encantado.webm", duracaoSegundos: 4 },
  { id: "eletrico", nome: "⚡ Aura Elétrica", arquivo: "/aura/eletrico.webm", duracaoSegundos: 2 },
  { id: "static", nome: "📺 Aura Statica", arquivo: "/aura/static.webm", duracaoSegundos: 2 },
];
 
/** Modos de repeticao suportados. */
export const MODO = {
  LOOP: "LOOP",
  UMA: "UMA",
  VEZES: "VEZES",
};

/** Resolve o caminho relativo do webm para uma URL absoluta (exigida pelo renderer do OBR). */
export function urlAbsoluta(arquivo) {
  return new URL(arquivo, window.location.origin).toString();
}

/** True se o item foi criado por esta extensao. */
export function ehAura(item) {
  const meta = item?.metadata?.[CHAVE_META];
  return Boolean(meta && typeof meta === "object" && meta.enabled);
}
