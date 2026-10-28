// Servidor Node.js mínimo (sem dependências) para hospedagens que exigem app Node, como a Hostinger.
// - Serve o site (index.html, css, js, img)
// - Serve os dados em /data: loja.json (Catálogo Pro + ajustes feitos no painel), site.json (dados da loja) e fotos
// - Painel /admin com senha (variável ADMIN_SENHA): visão geral, pedidos, produtos, importação do ZIP e dados da loja
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = escolherPastaDados();
const SENHA = process.env.ADMIN_SENHA || "";
const MAX_UPLOAD = 80 * 1024 * 1024;
const MAX_FOTO = 8 * 1024 * 1024;
const PUBLIC = ["index.html", "css", "js", "img"]; // só isso fica acessível
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// Arquivos de dados. "privado/" nunca é servido ao público.
const F = {
  loja: path.join(DATA_DIR, "loja.json"), // exportação original do Catálogo Pro
  ajustes: path.join(DATA_DIR, "ajustes.json"), // edições e produtos criados no painel
  site: path.join(DATA_DIR, "site.json"), // dados da loja (WhatsApp, Instagram, cotação manual…)
  banner: path.join(DATA_DIR, "banner.json"), // banners do topo da página inicial e aviso da faixa superior
  pedidos: path.join(DATA_DIR, "privado", "pedidos.json"),
};

const inside = (base, file) => file === base || file.startsWith(base + path.sep);

// Onde ficam catálogo, fotos, edições, pedidos e banners.
// Um deploy recria a pasta do app e apagaria uma pasta data/ dentro dela; por isso, sem DATA_DIR,
// os dados vão para uma pasta ao lado do app ("rota-importados-dados"). Na primeira vez, copia o que
// existir em data/. Se não for possível escrever lá, continua usando data/ (como antes).
function escolherPastaDados() {
  if (process.env.DATA_DIR) return path.resolve(process.env.DATA_DIR);
  const antiga = path.join(ROOT, "data");
  const nova = path.resolve(ROOT, "..", "rota-importados-dados");
  try {
    fs.mkdirSync(nova, { recursive: true });
    const teste = path.join(nova, ".teste-escrita");
    fs.writeFileSync(teste, "ok");
    fs.unlinkSync(teste);
  } catch (e) {
    console.warn(`Não foi possível usar ${nova} (${e.code || e.message}); os dados ficam em ${antiga} e podem ser apagados em um novo deploy.`);
    return antiga;
  }
  try {
    const vazia = !fs.readdirSync(nova).length;
    if (vazia && fs.existsSync(antiga) && fs.readdirSync(antiga).length) {
      fs.cpSync(antiga, nova, { recursive: true });
      console.log(`Dados copiados de ${antiga} para ${nova}.`);
    }
  } catch (e) {
    console.warn(`Não foi possível copiar os dados antigos: ${e.message}`);
  }
  return nova;
}

http
  .createServer((req, res) => {
    let rel;
    try {
      rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
    } catch {
      return redirectHome(res);
    }

    if (rel === "admin" || rel === "admin/") return sendFile(res, path.join(ROOT, "admin.html"), "no-store", false, req);
    if (rel === "admin/importar") return importar(req, res);
    if (rel.startsWith("admin/api/")) return adminApi(req, res, rel.slice(10));
    if (rel === "api/pedido") return novoPedido(req, res);

    if (rel === "data/loja.json") return sendLoja(req, res);
    if (rel === "data/site.json" && !fs.existsSync(F.site)) return json(res, 200, {}, { "Cache-Control": "no-cache" });
    if (rel === "data/banner.json" && !fs.existsSync(F.banner)) return json(res, 200, {}, { "Cache-Control": "no-cache" });
    if (rel.startsWith("data/")) {
      const file = path.normalize(path.join(DATA_DIR, rel.slice(5)));
      if (!inside(DATA_DIR, file) || inside(path.join(DATA_DIR, "privado"), file) || file === F.ajustes || file.endsWith(".tmp")) return notFound(res);
      return sendFile(res, file, rel.endsWith(".json") ? "no-cache" : "public, max-age=86400", true, req);
    }

    if (rel === "") rel = "index.html";
    const file = path.normalize(path.join(ROOT, rel));
    const allowed = PUBLIC.some((p) => inside(path.join(ROOT, p), file));
    if (!allowed) return redirectHome(res);
    sendFile(res, file, rel === "index.html" ? "no-cache" : "public, max-age=3600", false, req);
  })
  .listen(PORT, () => console.log(`Rota Importados rodando na porta ${PORT}`));

// Envia o arquivo com ETag: se o navegador já tem a mesma versão, responde 304 (sem reenviar o conteúdo).
// A compressão (Brotli/gzip) fica a cargo da CDN da Hostinger.
function sendFile(res, file, cache, plain404, req) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return plain404 ? notFound(res) : redirectHome(res);
    const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const headers = {
      "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": cache,
      ETag: etag,
      "Last-Modified": st.mtime.toUTCString(),
    };
    if (naoMudou(req, etag)) {
      res.writeHead(304, headers);
      return res.end();
    }
    fs.readFile(file, (err2, data) => {
      if (err2) return plain404 ? notFound(res) : redirectHome(res);
      res.writeHead(200, headers);
      res.end(req && req.method === "HEAD" ? undefined : data);
    });
  });
}

const naoMudou = (req, etag) => {
  const inm = req && req.headers["if-none-match"];
  return !!inm && inm.split(",").some((t) => t.trim() === etag);
};

function redirectHome(res) {
  res.writeHead(302, { Location: "/" });
  res.end();
}

function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Não encontrado");
}

function json(res, status, obj, extra) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra });
  res.end(JSON.stringify(obj));
}

/* ---------- Arquivos JSON ---------- */
function lerJSON(file, padrao) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return padrao;
  }
}

// Grava em arquivo temporário e renomeia: quem estiver lendo nunca vê um arquivo pela metade
function gravarJSON(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
  if (file !== F.pedidos) lojaCache = null;
}

const lerAjustes = () => {
  const a = lerJSON(F.ajustes, null) || {};
  return { produtos: a.produtos && typeof a.produtos === "object" ? a.produtos : {}, novos: Array.isArray(a.novos) ? a.novos : [] };
};

/* ---------- loja.json público = Catálogo Pro + ajustes do painel + cotação manual ---------- */
// Campos que o painel pode alterar. Se o Catálogo Pro mudar o mesmo campo depois da edição
// (nova exportação com outro valor), vale o do Catálogo Pro: a alteração mais recente ganha.
const CAMPOS = ["name", "description", "brand", "sector", "price", "stock", "active", "tags", "photos"];
const igual = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);

function aplicarAjuste(p, aj) {
  if (!aj || !aj.campos) return p;
  const q = { ...p };
  for (const k of CAMPOS) {
    if (!(k in aj.campos)) continue;
    if (aj.base && k in aj.base && !igual(p[k], aj.base[k])) continue; // Catálogo Pro alterou depois
    q[k] = aj.campos[k];
  }
  return q;
}

let lojaCache = null;
function montarLoja() {
  if (lojaCache) return lojaCache;
  const loja = lerJSON(F.loja, null);
  const aj = lerAjustes();
  const site = lerJSON(F.site, null) || {};
  const valida = loja && loja.type === "catalogo-pro-site" && Array.isArray(loja.products);
  if (!valida && !aj.novos.length) return (lojaCache = { vazio: true });

  const out = valida ? { ...loja } : { type: "catalogo-pro-site", version: 1, currency: "USD", sectors: [], rates: {}, products: [] };
  // Produtos criados no painel entram no fim; se um backup reimportado também os trouxer, vale a versão do painel
  const novos = new Set(aj.novos.map((p) => p.sku));
  out.products = out.products.filter((p) => !novos.has(p.sku)).map((p) => aplicarAjuste(p, p.sku && aj.produtos[p.sku])).concat(aj.novos);
  const rates = { ...(out.rates || {}) };
  for (const k of ["pix", "efetivo"]) {
    const c = site.cotacao && site.cotacao[k];
    if (c && c.rate > 0) rates[k] = { rate: c.rate, date: c.date || "" };
  }
  out.rates = rates;
  // O site recebe só o que deve aparecer (regras de exibição do painel); o backup usa a lista completa
  const pub = { ...out, products: out.products.filter((p) => !foraDoSite(p, site.ocultar)) };
  const body = Buffer.from(JSON.stringify(pub));
  const etag = `W/"${crypto.createHash("sha1").update(body).digest("hex").slice(0, 20)}"`;
  return (lojaCache = { completo: out, body, etag });
}

// Regras de exibição definidas na aba Pendências (os produtos continuam salvos, só não aparecem)
const temFoto = (p) => (Array.isArray(p.photos) ? p.photos : [p.photos]).some((id) => (typeof id === "string" && id.trim()) || typeof id === "number");
function foraDoSite(p, o) {
  if (!o) return false;
  return (o.semFoto && !temFoto(p)) || (o.semDescricao && !String(p.description || "").trim()) || (o.semEstoque && p.stock === 0);
}

function sendLoja(req, res) {
  let l;
  try {
    l = montarLoja();
  } catch {
    return notFound(res);
  }
  if (l.vazio) return notFound(res);
  const headers = { "Content-Type": TYPES[".json"], "Cache-Control": "no-cache", ETag: l.etag };
  if (naoMudou(req, l.etag)) {
    res.writeHead(304, headers);
    return res.end();
  }
  res.writeHead(200, headers);
  res.end(req.method === "HEAD" ? undefined : l.body);
}

/* ---------- Acesso ao painel ---------- */
function senhaOk(given) {
  if (!SENHA) return false;
  const a = crypto.createHash("sha256").update(String(given || "")).digest();
  const b = crypto.createHash("sha256").update(SENHA).digest();
  return crypto.timingSafeEqual(a, b);
}

const SESSAO_MS = 12 * 3600 * 1000;
const sessoes = new Map(); // token -> expira em
const falhas = new Map(); // ip -> { n, ate }

const ipDe = (req) => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
const cookie = (req, nome) => {
  const m = new RegExp("(?:^|;\\s*)" + nome + "=([^;]+)").exec(req.headers.cookie || "");
  return m ? m[1] : "";
};

function logado(req) {
  const t = cookie(req, "rota_adm");
  const exp = t && sessoes.get(t);
  if (exp && exp > Date.now()) return true;
  if (t) sessoes.delete(t);
  return false;
}

// Painel: sessão (cookie) + cabeçalho x-rota nas alterações (impede envio a partir de outros sites).
// O envio antigo com x-senha continua aceito.
const autorizado = (req) => (req.headers["x-senha"] ? senhaOk(req.headers["x-senha"]) : logado(req) && (req.method === "GET" || req.headers["x-rota"] === "1"));

function bloqueado(req) {
  const f = falhas.get(ipDe(req));
  return f && f.ate > Date.now() && f.n >= 8;
}
function registrarFalha(req) {
  const ip = ipDe(req);
  const f = falhas.get(ip);
  if (!f || f.ate < Date.now()) falhas.set(ip, { n: 1, ate: Date.now() + 15 * 60 * 1000 });
  else f.n++;
}

function lerCorpo(req, max, cb) {
  const chunks = [];
  let size = 0, aborted = false;
  req.on("data", (c) => {
    if (aborted) return;
    size += c.length;
    if (size > max) {
      aborted = true;
      cb(new Error("grande"));
      req.destroy();
    } else chunks.push(c);
  });
  req.on("end", () => !aborted && cb(null, Buffer.concat(chunks)));
}

function lerCorpoJSON(req, res, max, cb) {
  lerCorpo(req, max, (err, buf) => {
    if (err) return json(res, 413, { erro: "Conteúdo grande demais." });
    let d;
    try {
      d = JSON.parse(buf.toString("utf8") || "{}");
    } catch {
      return json(res, 400, { erro: "JSON inválido." });
    }
    try {
      cb(d && typeof d === "object" ? d : {});
    } catch (e) {
      json(res, 400, { erro: e.message });
    }
  });
}

function adminApi(req, res, rota) {
  if (!SENHA) return json(res, 503, { erro: "Painel desativado: defina a variável ADMIN_SENHA na hospedagem." });

  if (rota === "login" && req.method === "POST") {
    if (bloqueado(req)) return json(res, 429, { erro: "Muitas tentativas. Aguarde 15 minutos." });
    return lerCorpoJSON(req, res, 4096, (d) => {
      if (!senhaOk(d.senha)) {
        registrarFalha(req);
        return json(res, 401, { erro: "Senha incorreta." });
      }
      falhas.delete(ipDe(req));
      const token = crypto.randomBytes(32).toString("hex");
      sessoes.set(token, Date.now() + SESSAO_MS);
      const seguro = req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted ? "; Secure" : "";
      json(res, 200, { ok: true }, { "Set-Cookie": `rota_adm=${token}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${SESSAO_MS / 1000}${seguro}` });
    });
  }
  if (rota === "logout" && req.method === "POST") {
    sessoes.delete(cookie(req, "rota_adm"));
    return json(res, 200, { ok: true }, { "Set-Cookie": "rota_adm=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0" });
  }
  if (rota === "sessao") return json(res, 200, { logado: logado(req) });

  if (!autorizado(req)) return json(res, 401, { erro: "Sessão expirada. Entre novamente." });

  const r = `${req.method} ${rota}`;
  if (r === "GET dados") return dadosPainel(res);
  if (r === "GET exportar.zip") return exportarZip(req, res).catch(() => res.destroy());
  if (r === "PUT produto") return lerCorpoJSON(req, res, 1e6, (d) => json(res, 200, salvarProduto(d)));
  if (r === "POST produto") return lerCorpoJSON(req, res, 1e6, (d) => json(res, 200, criarProduto(d)));
  if (r === "DELETE produto") return lerCorpoJSON(req, res, 4096, (d) => json(res, 200, removerAjuste(d.sku)));
  if (r === "PUT produtos") return lerCorpoJSON(req, res, 1e6, (d) => json(res, 200, alterarVarios(d)));
  if (r === "POST foto") return enviarFoto(req, res);
  if (r === "PUT banner") return lerCorpoJSON(req, res, 65536, (d) => json(res, 200, salvarBanner(d)));
  if (r === "POST banner-imagem") return enviarImagemBanner(req, res);
  if (r === "PUT exibicao")return lerCorpoJSON(req, res, 4096, (d) => json(res, 200, salvarExibicao(d)));
  if (r === "PUT site")return lerCorpoJSON(req, res, 65536, (d) => json(res, 200, salvarSite(d)));
  if (r === "GET pedidos") return json(res, 200, { pedidos: lerJSON(F.pedidos, []) });
  if (r === "POST ia/descricao") {
    return lerCorpoJSON(req, res, 4096, (d) =>
      gerarDescricao(d.sku).then(
        (texto) => json(res, 200, { ok: true, texto }),
        (e) => { const [st, msg] = erroIA(e); json(res, st, { erro: msg }); }
      )
    );
  }
  if (r === "POST pedido")return lerCorpoJSON(req, res, 65536, (d) => json(res, 200, pedidoManual(d)));
  if (r === "PUT pedido")return lerCorpoJSON(req, res, 65536, (d) => json(res, 200, alterarPedido(d)));
  if (r === "DELETE pedido") return lerCorpoJSON(req, res, 4096, (d) => json(res, 200, excluirPedido(d.id)));
  json(res, 404, { erro: "Rota desconhecida." });
}

function dadosPainel(res) {
  const loja = lerJSON(F.loja, null);
  const valida = loja && loja.type === "catalogo-pro-site" && Array.isArray(loja.products);
  let gravado = null;
  try { gravado = fs.statSync(F.loja).mtime.toISOString(); } catch {}
  json(res, 200, {
    loja: valida ? loja : null,
    importadoEm: valida ? gravado : null,
    ajustes: lerAjustes(),
    site: lerJSON(F.site, null) || {},
    pedidos: lerJSON(F.pedidos, []),
    banner: lerJSON(F.banner, null) || {},
    ia: !!process.env.ANTHROPIC_API_KEY,
    dados: { pasta: DATA_DIR, segura: !inside(ROOT, DATA_DIR) }, // segura = fora da pasta do app (sobrevive a deploys)
  });
}

/* ---------- Banners do topo da página inicial ---------- */
const ARQ_BANNER = /^bn[a-z0-9]{6,30}\.(jpg|png|webp)$/;
const TIPOS_LINK = ["nenhum", "catalogo", "departamento", "marca", "produto", "whatsapp", "url"];

function limparLink(l) {
  l = l && typeof l === "object" ? l : {};
  const tipo = TIPOS_LINK.includes(l.tipo) ? l.tipo : "nenhum";
  const valor = texto(l.valor, 300);
  if (tipo === "url" && !/^https?:\/\/[^\s]+$/i.test(valor)) throw new Error("Link externo inválido: use o endereço completo, começando com https://");
  if (["departamento", "marca", "produto"].includes(tipo) && !valor) throw new Error("Escolha o departamento, a marca ou o produto do link.");
  return { tipo, valor: ["nenhum", "catalogo"].includes(tipo) ? "" : valor };
}

function limparSlide(s, i) {
  s = s && typeof s === "object" ? s : {};
  const img = (v) => (ARQ_BANNER.test(String(v || "")) ? String(v) : "");
  const botao = (b) => ({ texto: texto(b && b.texto, 40), link: limparLink(b && b.link) });
  const slide = {
    id: /^[a-z0-9]{4,20}$/.test(s.id) ? s.id : crypto.randomBytes(5).toString("hex"),
    ativo: s.ativo !== false,
    layout: ["lado", "fundo", "imagem"].includes(s.layout) ? s.layout : "lado",
    etiqueta: texto(s.etiqueta, 60),
    titulo: texto(s.titulo, 120),
    subtitulo: texto(s.subtitulo, 240),
    btn1: botao(s.btn1),
    btn2: botao(s.btn2),
    link: limparLink(s.link), // banner "só imagem": a imagem inteira vira o link
    imagem: img(s.imagem),
    imagemCelular: img(s.imagemCelular),
    alt: texto(s.alt, 160),
  };
  const n = `Banner ${i + 1}`;
  if (slide.layout !== "lado" && !slide.imagem) throw new Error(`${n}: envie a imagem.`);
  if (slide.layout !== "imagem" && !slide.titulo) throw new Error(`${n}: escreva o título.`);
  for (const b of [slide.btn1, slide.btn2]) if (b.texto && b.link.tipo === "nenhum") throw new Error(`${n}: o botão "${b.texto}" precisa de um link.`);
  return slide;
}

function salvarBanner(d) {
  const slides = (Array.isArray(d.slides) ? d.slides : []).slice(0, 8).map(limparSlide);
  const faixa = { texto: texto(d.faixa && d.faixa.texto, 120), link: limparLink(d.faixa && d.faixa.link) };
  const intervalo = Math.min(15, Math.max(4, parseInt(d.intervalo, 10) || 6));
  const banner = { slides, faixa, intervalo };
  gravarJSON(F.banner, banner);
  limparImagensBanner(banner);
  return { ok: true, banner };
}

// Apaga imagens enviadas que não estão em nenhum banner (só as com mais de 1 hora, para não apagar um envio em andamento)
function limparImagensBanner(banner) {
  const usadas = new Set(banner.slides.flatMap((s) => [s.imagem, s.imagemCelular]).filter(Boolean));
  const dir = path.join(DATA_DIR, "banners");
  let arqs = [];
  try { arqs = fs.readdirSync(dir); } catch { return; }
  for (const a of arqs) {
    if (!ARQ_BANNER.test(a) || usadas.has(a)) continue;
    try { if (Date.now() - fs.statSync(path.join(dir, a)).mtimeMs > 3600 * 1000) fs.unlinkSync(path.join(dir, a)); } catch {}
  }
}

function enviarImagemBanner(req, res) {
  lerCorpo(req, MAX_FOTO, (err, buf) => {
    if (err) return json(res, 413, { erro: "Imagem grande demais (máx. 8 MB)." });
    const ext = buf[0] === 0xff && buf[1] === 0xd8 ? "jpg"
      : buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47 ? "png"
      : buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP" ? "webp" : "";
    if (!ext) return json(res, 400, { erro: "Envie a imagem em JPG, PNG ou WebP." });
    const nome = "bn" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex") + "." + ext;
    fs.mkdirSync(path.join(DATA_DIR, "banners"), { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, "banners", nome), buf);
    json(res, 200, { ok: true, arquivo: nome });
  });
}

/* ---------- IA: descrição de produtos (Claude, pelo SDK oficial da Anthropic) ---------- */
// Precisa da variável ANTHROPIC_API_KEY na hospedagem. O texto volta para o painel revisar; nada é salvo aqui.
const IA_MODELO = process.env.IA_MODELO || "claude-opus-5-5";
const SISTEMA_IA = `Você escreve descrições de produtos para o catálogo online da Rota Importados, uma loja de produtos importados (perfumes, cosméticos, eletrônicos e outros) que vende pelo WhatsApp.

Escreva em português do Brasil uma descrição de venda com 2 a 4 frases (cerca de 40 a 90 palavras), em tom profissional e acolhedor.

Use somente as informações dos dados do produto. Não invente características técnicas, ingredientes, notas olfativas, duração, rendimento, composição, garantia, origem, autenticidade, preço, promoções ou prazos: o cliente pode comprar com base nesse texto, e uma informação errada gera reclamação e devolução. Se os dados forem poucos, descreva o produto de forma geral a partir do nome, da marca e do departamento, sem afirmar detalhes que não estão nos dados.

Responda apenas com o texto da descrição, sem título, listas, markdown, emojis ou aspas.`;

let sdkIA = null, clienteIA = null;
function ia() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("IA desativada: defina a variável ANTHROPIC_API_KEY na hospedagem.");
  if (!clienteIA) {
    // Carregado só quando usado: se a biblioteca faltar, o resto do site continua funcionando
    try { sdkIA = require("@anthropic-ai/sdk"); } catch { throw new Error("Biblioteca da IA não instalada no servidor (npm install)."); }
    const Anthropic = sdkIA.default || sdkIA;
    clienteIA = new Anthropic();
  }
  return clienteIA;
}

function erroIA(e) {
  const A = sdkIA && (sdkIA.default || sdkIA);
  if (A && e instanceof A.AuthenticationError) return [502, "Chave da IA (ANTHROPIC_API_KEY) inválida."];
  if (A && e instanceof A.PermissionDeniedError) return [502, "A chave da IA não tem permissão para este modelo."];
  if (A && e instanceof A.RateLimitError) return [429, "Limite de uso da IA atingido. Aguarde um pouco e tente de novo."];
  if (A && e instanceof A.APIConnectionError) return [502, "Não foi possível conectar à IA. Tente de novo."];
  if (A && e instanceof A.APIError) return [502, `Erro da IA (${e.status || "desconhecido"}). Tente de novo.`];
  return [400, e.message];
}

// Produto como aparece no site (Catálogo Pro + edições do painel)
function produtoEfetivo(sku) {
  const aj = lerAjustes();
  const novo = aj.novos.find((p) => p.sku === sku);
  if (novo) return novo;
  const loja = lerJSON(F.loja, null);
  const p = loja && Array.isArray(loja.products) && loja.products.find((x) => x.sku === sku);
  return p ? aplicarAjuste(p, aj.produtos[sku]) : null;
}

async function gerarDescricao(skuIn) {
  const p = produtoEfetivo(texto(skuIn, 120));
  if (!p) throw new Error("Produto não encontrado.");
  const dados = [["Nome", p.name], ["Marca", p.brand], ["Departamento", p.sector], ["Tipo", p.tipo], ["Notas", p.notes], ["Volume (como cadastrado)", p.volume], ["Etiquetas", p.tags]]
    .filter(([, v]) => v != null && String(v).trim())
    .map(([k, v]) => `${k}: ${String(v).trim()}`)
    .join("\n");
  const r = await ia().beta.messages.create({
    model: IA_MODELO,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // se o modelo recusar, a API tenta automaticamente outro modelo
    output_config: { effort: "low" },
    system: SISTEMA_IA,
    messages: [{ role: "user", content: `Dados do produto:\n${dados}` }],
  });
  if (r.stop_reason === "refusal") throw new Error("A IA não gerou texto para este produto.");
  const txt = r.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  if (!txt) throw new Error("A IA não retornou texto.");
  return txt.slice(0, 2000);
}

/* ---------- Produtos ---------- */
const texto = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const ID_FOTO = /^[A-Za-z0-9_-]{1,120}$/;

// Valida e normaliza os campos enviados pelo painel
function limparCampos(c) {
  const out = {};
  if ("name" in c) { out.name = texto(c.name, 200); if (!out.name) throw new Error("Informe o nome do produto."); }
  if ("description" in c) out.description = texto(c.description, 5000);
  if ("brand" in c) out.brand = texto(c.brand, 120);
  if ("sector" in c) out.sector = texto(c.sector, 120);
  if ("tags" in c) out.tags = texto(c.tags, 300);
  if ("active" in c) out.active = c.active !== false;
  if ("price" in c) {
    const n = c.price === "" || c.price == null ? null : Number(c.price);
    if (n != null && !(n >= 0 && n < 1e7)) throw new Error("Preço inválido.");
    out.price = n == null ? null : Math.round(n * 100) / 100;
  }
  if ("stock" in c) {
    const n = c.stock === "" || c.stock == null ? null : Number(c.stock);
    if (n != null && !(Number.isInteger(n) && n >= 0 && n < 1e7)) throw new Error("Estoque inválido.");
    out.stock = n;
  }
  if ("photos" in c) {
    if (!Array.isArray(c.photos)) throw new Error("Fotos inválidas.");
    out.photos = c.photos.map(String).filter((id) => ID_FOTO.test(id)).slice(0, 20);
  }
  return out;
}

const ehNovo = (sku) => /^ADM-/.test(sku);

function salvarProduto(d) {
  const sku = texto(d.sku, 120);
  const campos = limparCampos(d.campos || {});
  const aj = lerAjustes();
  if (ehNovo(sku)) {
    const i = aj.novos.findIndex((p) => p.sku === sku);
    if (i < 0) throw new Error("Produto não encontrado.");
    aj.novos[i] = { ...aj.novos[i], ...campos, updated: new Date().toISOString() };
  } else {
    const loja = lerJSON(F.loja, null);
    const orig = loja && Array.isArray(loja.products) && loja.products.find((p) => p.sku === sku);
    if (!orig) throw new Error("Produto não encontrado no Catálogo Pro.");
    const atual = aj.produtos[sku] || { campos: {}, base: {} };
    for (const [k, v] of Object.entries(campos)) {
      if (igual(orig[k], v)) { delete atual.campos[k]; delete atual.base[k]; } // voltou ao valor do Catálogo Pro
      else { atual.campos[k] = v; atual.base[k] = orig[k] === undefined ? null : orig[k]; }
    }
    atual.em = new Date().toISOString();
    if (Object.keys(atual.campos).length) aj.produtos[sku] = atual;
    else delete aj.produtos[sku];
  }
  gravarJSON(F.ajustes, aj);
  return { ok: true, ajustes: aj };
}

function criarProduto(d) {
  const campos = limparCampos({ active: true, ...(d.campos || {}) });
  if (!campos.name) throw new Error("Informe o nome do produto.");
  const aj = lerAjustes();
  let n = aj.novos.reduce((m, p) => Math.max(m, Number(String(p.sku).slice(4)) || 0), 0) + 1;
  const agora = new Date().toISOString();
  const p = { sku: "ADM-" + String(n).padStart(4, "0"), name: "", description: "", sector: "", brand: "", tipo: "", notes: "", volume: null, stock: null, price: null, tags: "", photos: [], ...campos, added: agora.slice(0, 10), updated: agora };
  aj.novos.push(p);
  gravarJSON(F.ajustes, aj);
  return { ok: true, sku: p.sku, ajustes: aj };
}

// Novo produto: exclui. Produto do Catálogo Pro: descarta as edições (volta ao original).
function removerAjuste(skuIn) {
  const sku = texto(skuIn, 120);
  const aj = lerAjustes();
  if (ehNovo(sku)) aj.novos = aj.novos.filter((p) => p.sku !== sku);
  else delete aj.produtos[sku];
  gravarJSON(F.ajustes, aj);
  return { ok: true, ajustes: aj };
}

// Ação em lote (por enquanto: mostrar/ocultar)
function alterarVarios(d) {
  if (!Array.isArray(d.skus) || !d.skus.length) throw new Error("Nenhum produto selecionado.");
  if (typeof d.active !== "boolean") throw new Error("Ação inválida.");
  let aj;
  for (const sku of d.skus.slice(0, 5000)) {
    try { aj = salvarProduto({ sku, campos: { active: d.active } }).ajustes; } catch {}
  }
  return { ok: true, ajustes: aj || lerAjustes() };
}

function enviarFoto(req, res) {
  lerCorpo(req, MAX_FOTO, (err, buf) => {
    if (err) return json(res, 413, { erro: "Foto grande demais (máx. 8 MB)." });
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return json(res, 400, { erro: "Envie a foto em JPG." });
    const id = "adm" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
    fs.mkdirSync(path.join(DATA_DIR, "fotos"), { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, "fotos", id + ".jpg"), buf);
    json(res, 200, { ok: true, id });
  });
}

/* ---------- Dados da loja ---------- */
function salvarSite(d) {
  const site = {};
  for (const k of ["nome", "slogan", "instagram", "cidade", "horario"]) site[k] = texto(d[k], k === "slogan" ? 200 : 120);
  site.whatsapp = texto(d.whatsapp, 30).replace(/\D/g, "");
  if (site.whatsapp && site.whatsapp.length < 10) throw new Error("WhatsApp inválido: use DDI + DDD + número (ex.: 5511920889155).");
  if (site.instagram && !/^https:\/\//.test(site.instagram)) site.instagram = "https://instagram.com/" + site.instagram.replace(/^@/, "");
  site.cotacao = {};
  for (const k of ["pix", "efetivo"]) {
    const v = d.cotacao && d.cotacao[k];
    const n = v === "" || v == null ? null : Number(v);
    if (n == null) continue;
    if (!(n > 0 && n < 100)) throw new Error("Cotação inválida.");
    site.cotacao[k] = { rate: Math.round(n * 10000) / 10000, date: new Date().toISOString().slice(0, 10) };
  }
  const atual = lerJSON(F.site, null) || {};
  if (atual.ocultar) site.ocultar = atual.ocultar; // regras de exibição são salvas pela aba Pendências
  gravarJSON(F.site, site);
  return { ok: true, site };
}

// Mostrar/ocultar no site os produtos sem foto, sem descrição ou sem estoque
function salvarExibicao(d) {
  const site = lerJSON(F.site, null) || {};
  site.ocultar = { semFoto: d.semFoto === true, semDescricao: d.semDescricao === true, semEstoque: d.semEstoque === true };
  gravarJSON(F.site, site);
  return { ok: true, site };
}

/* ---------- Pedidos ---------- */
const STATUS = ["novo", "atendimento", "confirmado", "entregue", "cancelado"];
const envios = new Map(); // ip -> { n, ate }

// Chamado pelo site quando o cliente clica em "Enviar pedido pelo WhatsApp"
function novoPedido(req, res) {
  if (req.method !== "POST") return json(res, 405, { erro: "Use POST." });
  const ip = ipDe(req);
  const e = envios.get(ip);
  if (e && e.ate > Date.now() && e.n >= 20) return json(res, 429, { erro: "Muitos pedidos. Tente mais tarde." });
  if (!e || e.ate < Date.now()) envios.set(ip, { n: 1, ate: Date.now() + 3600 * 1000 });
  else e.n++;

  lerCorpoJSON(req, res, 65536, (d) => json(res, 200, { ok: true, id: gravarPedido(d, "site").id }));
}

// Pedido lançado manualmente no painel (ex.: venda combinada direto no WhatsApp ou na loja)
function pedidoManual(d) {
  if ("status" in d && !STATUS.includes(d.status)) throw new Error("Status inválido.");
  return { ok: true, pedido: gravarPedido(d, "painel") };
}

/* ---------- Dados do cliente ---------- */
const PAISES = { Brasil: "CPF", Argentina: "DNI", Paraguai: "CI" };
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

function cpfValido(v) {
  const c = String(v || "").replace(/\D/g, "");
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (const n of [9, 10]) {
    let s = 0;
    for (let i = 0; i < n; i++) s += c[i] * (n + 1 - i);
    if (((s * 10) % 11) % 10 !== +c[n]) return false;
  }
  return true;
}

// Nome completo, documento (CPF no Brasil, DNI na Argentina, CI no Paraguai) e endereço completo
function limparCliente(c) {
  c = c && typeof c === "object" ? c : {};
  const t = (k, n) => texto(c[k], n);
  const pais = PAISES[c.pais] ? c.pais : "Brasil";
  const cli = {
    nome: t("nome", 120), pais, docTipo: PAISES[pais], doc: t("doc", 20),
    cep: t("cep", 10), estado: t("estado", 60), rua: t("rua", 160), numero: t("numero", 20),
    complemento: t("complemento", 80), bairro: t("bairro", 100), cidade: t("cidade", 100), obs: t("obs", 1000),
  };
  const regiao = pais === "Brasil" ? "o estado" : pais === "Argentina" ? "a província" : "o departamento";
  const falta = [["nome", "o nome completo"], ["doc", "o " + cli.docTipo], ["rua", "a rua"], ["numero", "o número"], ["bairro", "o bairro"], ["cidade", "a cidade"], ["estado", regiao]].find(([k]) => !cli[k]);
  if (falta) throw new Error(`Informe ${falta[1]} do cliente.`);
  if (pais === "Brasil") {
    if (!cpfValido(cli.doc)) throw new Error("CPF inválido.");
    if (!UFS.includes(cli.estado)) throw new Error("Estado inválido.");
    const cep = cli.cep.replace(/\D/g, "");
    if (cep.length !== 8) throw new Error("CEP inválido.");
    const d = cli.doc.replace(/\D/g, "");
    cli.doc = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    cli.cep = cep.slice(0, 5) + "-" + cep.slice(5);
  }
  return cli;
}

function gravarPedido(d, origem) {
  if (!Array.isArray(d.itens) || !d.itens.length) throw new Error("Pedido vazio.");
  const num = (v) => (typeof v === "number" && isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null);
  const itens = d.itens.slice(0, 100).map((i) => ({
    sku: texto(i.sku, 120),
    nome: texto(i.nome, 200),
    variacao: texto(i.v, 120),
    q: Math.max(1, Math.min(9999, parseInt(i.q, 10) || 1)),
    preco: num(i.preco),
  }));
  if (itens.some((i) => !i.nome)) throw new Error("Há um item sem nome.");
  // Carrinho do site: só nome e cidade, opcionais. Pedido lançado no painel: dados completos.
  const c = d.cliente && typeof d.cliente === "object" ? d.cliente : {};
  const cliente = origem === "painel" ? limparCliente(c) : { nome: texto(c.nome, 120), cidade: texto(c.cidade, 100) };
  const pedidos = lerJSON(F.pedidos, []);
  const pedido = {
    id: pedidos.reduce((m, p) => Math.max(m, p.id || 0), 0) + 1,
    data: new Date().toISOString(),
    origem,
    status: origem === "painel" && STATUS.includes(d.status) ? d.status : "novo",
    cliente,
    itens,
    // No painel o total é sempre recalculado a partir dos itens
    total: origem === "painel" ? Math.round(itens.reduce((s, i) => s + (i.preco || 0) * i.q, 0) * 100) / 100 : num(d.total),
    moeda: d.moeda === "USD" ? "USD" : "BRL",
    nota: origem === "painel" ? texto(d.nota, 2000) : "",
  };
  pedidos.unshift(pedido);
  gravarJSON(F.pedidos, pedidos.slice(0, 5000));
  return pedido;
}

function alterarPedido(d) {
  const pedidos = lerJSON(F.pedidos, []);
  const p = pedidos.find((x) => x.id === Number(d.id));
  if (!p) throw new Error("Pedido não encontrado.");
  if ("status" in d) {
    if (!STATUS.includes(d.status)) throw new Error("Status inválido.");
    p.status = d.status;
  }
  if ("nota" in d) p.nota = texto(d.nota, 2000);
  p.alterado = new Date().toISOString();
  gravarJSON(F.pedidos, pedidos);
  return { ok: true, pedido: p };
}

function excluirPedido(id) {
  const pedidos = lerJSON(F.pedidos, []);
  gravarJSON(F.pedidos, pedidos.filter((p) => p.id !== Number(id)));
  return { ok: true };
}

/* ---------- Importação do ZIP do Catálogo Pro ---------- */
function importar(req, res) {
  if (req.method !== "POST") return json(res, 405, { erro: "Use POST." });
  if (!SENHA) return json(res, 503, { erro: "Painel desativado: defina a variável ADMIN_SENHA na hospedagem." });
  if (!autorizado(req)) return json(res, 401, { erro: req.headers["x-senha"] ? "Senha incorreta." : "Sessão expirada. Entre novamente." });

  lerCorpo(req, MAX_UPLOAD, (err, buf) => {
    if (err) return json(res, 413, { erro: "Arquivo grande demais (máx. 80 MB). Exporte em partes." });
    try {
      json(res, 200, aplicarZip(buf));
    } catch (e) {
      json(res, 400, { erro: e.message });
    }
  });
}

function aplicarZip(buf) {
  const entries = lerZip(buf);
  let loja = null, fotos = 0;
  fs.mkdirSync(path.join(DATA_DIR, "fotos"), { recursive: true });

  for (const e of entries) {
    if (e.name === "loja.json") {
      const data = JSON.parse(e.data().toString("utf8"));
      if (data.type !== "catalogo-pro-site" || !Array.isArray(data.products)) {
        throw new Error("loja.json não é uma exportação do Catálogo Pro.");
      }
      loja = data;
    } else {
      const m = /^fotos\/([A-Za-z0-9_-]{1,120})\.jpe?g$/.exec(e.name);
      if (!m) continue; // ignora qualquer outro arquivo
      fs.writeFileSync(path.join(DATA_DIR, "fotos", m[1] + ".jpg"), e.data());
      fotos++;
    }
  }

  if (loja) gravarJSON(F.loja, loja);
  if (!loja && !fotos) throw new Error("O ZIP não tem loja.json nem fotos.");

  const faltando = loja
    ? [...new Set(loja.products.flatMap((p) => (Array.isArray(p.photos) ? p.photos : [])))].filter(
        (id) => !fs.existsSync(path.join(DATA_DIR, "fotos", id + ".jpg"))
      ).length
    : null;
  return { ok: true, produtos: loja ? loja.products.length : null, fotos, fotosFaltando: faltando };
}

/* ---------- Exportação: ZIP no mesmo formato da importação ---------- */
// loja.json como aparece no site (Catálogo Pro + edições e produtos do painel + cotação manual) e,
// opcionalmente, as fotos. Pode ser reimportado aqui pelo painel (backup).
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

async function exportarZip(req, res) {
  let loja;
  try { loja = montarLoja(); } catch { loja = { vazio: true }; }
  if (loja.vazio) return json(res, 404, { erro: "Ainda não há produtos para exportar." });
  const comFotos = new URL(req.url, "http://x").searchParams.get("fotos") === "1";
  const dados = { ...loja.completo, generated: new Date().toISOString() };
  const arquivos = [{ nome: "loja.json", dados: Buffer.from(JSON.stringify(dados)) }];
  if (comFotos) {
    const ids = new Set(dados.products.flatMap((p) => (Array.isArray(p.photos) ? p.photos : [])).map(String).filter((id) => ID_FOTO.test(id)));
    for (const id of ids) arquivos.push({ nome: `fotos/${id}.jpg`, arquivo: path.join(DATA_DIR, "fotos", id + ".jpg") });
  }

  const data = new Date().toISOString().slice(0, 10);
  res.writeHead(200, {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="loja-${data}${comFotos ? "" : "-sem-fotos"}.zip"`,
    "Cache-Control": "no-store",
  });
  // Escreve arquivo por arquivo (sem montar o ZIP inteiro na memória)
  const escrever = (b) => new Promise((ok) => (res.write(b) ? ok() : res.once("drain", ok)));
  const central = [];
  let pos = 0;
  const agora = new Date();
  const dosHora = (agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1);
  const dosData = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();
  for (const a of arquivos) {
    let bruto;
    try { bruto = a.dados || (await fs.promises.readFile(a.arquivo)); } catch { continue; } // foto que não está no servidor
    if (res.destroyed) return;
    const comprime = a.nome.endsWith(".json"); // JPG já é comprimido
    const corpo = comprime ? zlib.deflateRawSync(bruto) : bruto;
    const nome = Buffer.from(a.nome, "utf8");
    const crc = crc32(bruto);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(comprime ? 8 : 0, 8);
    h.writeUInt16LE(dosHora, 10); h.writeUInt16LE(dosData, 12); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(corpo.length, 18); h.writeUInt32LE(bruto.length, 22); h.writeUInt16LE(nome.length, 26); h.writeUInt16LE(0, 28);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(comprime ? 8 : 0, 10);
    c.writeUInt16LE(dosHora, 12); c.writeUInt16LE(dosData, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(corpo.length, 20); c.writeUInt32LE(bruto.length, 24);
    c.writeUInt16LE(nome.length, 28); c.writeUInt32LE(pos, 42);
    central.push(Buffer.concat([c, nome]));
    await escrever(Buffer.concat([h, nome]));
    await escrever(corpo);
    pos += 30 + nome.length + corpo.length;
  }
  const cd = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(central.length, 8); fim.writeUInt16LE(central.length, 10);
  fim.writeUInt32LE(cd.length, 12); fim.writeUInt32LE(pos, 16);
  await escrever(cd);
  res.end(fim);
}

// Leitor de ZIP (armazenado ou deflate), usando o diretório central
function lerZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Arquivo não é um ZIP válido.");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("ZIP corrompido.");
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nlen).replace(/\\/g, "/");
    p += 46 + nlen + xlen + clen;
    if (name.endsWith("/")) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    out.push({
      name,
      data: () => {
        if (method === 0) return raw;
        if (method === 8) return zlib.inflateRawSync(raw);
        throw new Error(`Compressão não suportada em ${name}.`);
      },
    });
  }
  return out;
}
