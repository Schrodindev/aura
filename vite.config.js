import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

/**
 * O Owlbear recusa o manifesto com "description length must be less than or
 * equal to 128 characters long". O erro so aparece na hora de instalar, entao
 * validamos aqui para falhar cedo, no build e ao subir o dev server.
 */
const LIMITE_DESCRICAO = 128;

function validarManifesto() {
  const checar = () => {
    const caminho = resolve(import.meta.dirname, "public/manifest.json");
    const manifesto = JSON.parse(readFileSync(caminho, "utf8"));
    const tamanho = [...String(manifesto.description ?? "")].length;
    if (tamanho > LIMITE_DESCRICAO) {
      throw new Error(
        `manifest.json: "description" tem ${tamanho} caracteres, ` +
          `o Owlbear aceita no maximo ${LIMITE_DESCRICAO}.`,
      );
    }
  };

  return {
    name: "validar-manifesto",
    buildStart: checar,
    configureServer: checar,
    configurePreviewServer: checar,
  };
}

/**
 * Origens autorizadas a buscar o manifesto/painel no servidor de desenvolvimento.
 *
 * A partir do Vite 6 o dev server passou a responder SEM o header
 * `Access-Control-Allow-Origin` para origens externas (mudanca de seguranca,
 * CVE-2025-24010). Sem esse header o Owlbear nao consegue ler o manifest.json
 * e mostra "Failed to fetch" ao instalar a extensao via localhost.
 *
 * Adicione aqui qualquer outra origem que precise acessar (ex.: a URL de um
 * tunel HTTPS como ngrok/cloudflared).
 */
const ORIGENS_PERMITIDAS = [
  "https://www.owlbear.rodeo",
  "https://owlbear.rodeo",
];

/**
 * Hosts aceitos no header `Host` do dev server.
 *
 * O Vite bloqueia hosts desconhecidos (protecao contra DNS rebinding) com
 * "Blocked request. This host ... is not allowed". Um tunel (ngrok, cloudflared)
 * chega com o host do tunel, entao ele precisa estar liberado aqui.
 *
 * Um valor iniciado com "." libera o dominio e todos os subdominios, o que evita
 * ter que editar este arquivo toda vez que o tunel gera uma URL nova.
 */
const HOSTS_PERMITIDOS = [
  ".ngrok-free.app",
  ".ngrok.app",
  ".ngrok.io",
  ".trycloudflare.com",
  ".loca.lt",
  ".tunnelmole.net",
];

function origemPermitida(origem) {
  if (!origem) return false;
  if (ORIGENS_PERMITIDAS.includes(origem)) return true;
  // Libera qualquer porta de localhost/127.0.0.1 para testes locais.
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem);
}

/**
 * Plugin de CORS para dev/preview.
 *
 * Alem do `Access-Control-Allow-Origin`, envia `Access-Control-Allow-Private-Network`.
 * O Chrome exige esse header no preflight quando uma pagina publica em HTTPS
 * (o Owlbear) faz requisicao para um endereco de rede privada (localhost).
 */
function corsParaOwlbear() {
  const middleware = (req, res, next) => {
    const origem = req.headers.origin;

    if (origemPermitida(origem)) {
      res.setHeader("Access-Control-Allow-Origin", origem);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        req.headers["access-control-request-headers"] ?? "*",
      );
      res.setHeader("Access-Control-Allow-Private-Network", "true");
      res.setHeader("Access-Control-Max-Age", "86400");

      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
      }
    }

    next();
  };

  return {
    name: "cors-para-owlbear",
    // Sem retornar funcao, o middleware roda ANTES dos internos do Vite.
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

/**
 * A extensao tem DUAS paginas:
 *  - background.html -> carregada quando a extensao e instalada. Registra o menu
 *    de contexto e roda o "reaper" que remove auras com repeticao limitada.
 *  - index.html      -> painel (popover) exibido dentro do menu de contexto.
 */
export default defineConfig({
  plugins: [validarManifesto(), corsParaOwlbear()],
  // O CORS interno fica desligado: quem responde e o plugin acima, para nao
  // haver dois lugares definindo os mesmos headers.
  server: { cors: false, allowedHosts: HOSTS_PERMITIDOS },
  preview: { cors: false, allowedHosts: HOSTS_PERMITIDOS },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        background: resolve(import.meta.dirname, "background.html"),
      },
    },
  },
});
