// Servidor Node.js mínimo (sem dependências) para hospedagens que exigem app Node, como a Hostinger.
// - Serve o site (index.html, css, js, img)
// - Serve os dados em /data: loja.json (Catálogo Pro + ajustes feitos no painel), site.json (dados da loja) e fotos
// - Painel /admin com senha (variável ADMIN_SENHA): visão geral, pedidos, produtos, importação do ZIP e dados da loja
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const os = require("os");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PASTA_ESTAVEL = "rota-importados-dados";
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
  naoDuplicados: path.join(DATA_DIR, "privado", "nao-duplicados.json"), // grupos marcados como "não são duplicados"
  pedidoStatus: path.join(DATA_DIR, "privado", "pedido-status.json"), // colunas do quadro de pedidos (situações)
  custos: path.join(DATA_DIR, "privado", "custos.json"), // último custo (R$) informado por SKU, sugerido nos pedidos seguintes
};

const inside = (base, file) => file === base || file.startsWith(base + path.sep);

// Onde ficam catálogo, fotos, edições, pedidos e banners.
// A Hostinger monta cada deploy numa pasta nova (…/hbuilds/versions/<código>/), então qualquer pasta
// dentro ou ao lado do app some no deploy seguinte. Sem DATA_DIR, os dados ficam na pasta pessoal da
// conta (~/rota-importados-dados), que nenhum deploy toca. Na primeira vez, copia os dados mais recentes
// que encontrar nas versões anteriores. Se não puder escrever lá, usa data/ dentro do app (como antes).
function escolherPastaDados() {
  if (process.env.DATA_DIR) return path.resolve(process.env.DATA_DIR);
  const antiga = path.join(ROOT, "data");
  const nova = path.join(os.homedir(), PASTA_ESTAVEL);
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
    if (!fs.existsSync(path.join(nova, "loja.json"))) {
      const origem = dadosAnteriores(nova);
      if (origem) {
        fs.cpSync(origem, nova, { recursive: true, force: false });
        console.log(`Dados copiados de ${origem} para ${nova}.`);
      }
    }
  } catch (e) {
    console.warn(`Não foi possível copiar os dados antigos: ${e.message}`);
  }
  return nova;
}

// Procura, entre os lugares onde versões anteriores guardavam os dados, o loja.json mais recente
function dadosAnteriores(nova) {
  const candidatas = [path.join(ROOT, "data"), path.resolve(ROOT, "..", PASTA_ESTAVEL)];
  const partes = ROOT.split(path.sep);
  const iv = partes.lastIndexOf("versions");
  if (iv > 0) {
    const versoes = partes.slice(0, iv + 1).join(path.sep) || path.sep;
    let lista = [];
    try { lista = fs.readdirSync(versoes); } catch {}
    for (const v of lista) {
      candidatas.push(path.join(versoes, v, PASTA_ESTAVEL));
      let sub = [];
      try { sub = fs.readdirSync(path.join(versoes, v)); } catch {}
      for (const s of sub) candidatas.push(path.join(versoes, v, s, "data"));
    }
  }
  let melhor = null, quando = 0;
  for (const c of candidatas) {
    if (path.resolve(c) === path.resolve(nova)) continue;
    try {
      const t = fs.statSync(path.join(c, "loja.json")).mtimeMs;
      if (t > quando) { melhor = c; quando = t; }
    } catch {}
  }
  return melhor;
}

// Seguro = fora da pasta do app e fora das pastas de versão que a Hostinger troca a cada deploy
const dadosSeguros = () => !inside(ROOT, DATA_DIR) && !DATA_DIR.split(path.sep).includes("hbuilds") && path.resolve(ROOT, "..", PASTA_ESTAVEL) !== DATA_DIR;

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
  return {
    produtos: a.produtos && typeof a.produtos === "object" ? a.produtos : {},
    novos: Array.isArray(a.novos) ? a.novos : [],
    excluidos: Array.isArray(a.excluidos) ? a.excluidos : [], // SKUs do Catálogo Pro excluídos no painel (podem ser restaurados)
  };
};

/* ---------- loja.json público = Catálogo Pro + ajustes do painel + cotação manual ---------- */
// Campos que o painel pode alterar. Se o Catálogo Pro mudar o mesmo campo depois da edição
// (nova exportação com outro valor), vale o do Catálogo Pro: a alteração mais recente ganha.
// promo = oferta com prazo: { price, currency ("USD" ou "BRL" fixo), start (ISO ou ""), end (ISO) }; o site decide pelo horário se está valendo
const CAMPOS = ["name", "description", "brand", "sector", "subsector", "price", "stock", "active", "tags", "photos", "promo"];
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
  const excluidos = new Set(aj.excluidos);
  const pub = { ...out, products: out.products.filter((p) => p.active !== false && !excluidos.has(p.sku) && !foraDoSite(p, site.ocultar)) };
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
  if (r === "PUT completar") return lerCorpoJSON(req, res, 20e6, (d) => json(res, 200, salvarVarios(d)));
  if (r === "POST excluir") return lerCorpoJSON(req, res, 1e6, (d) => json(res, 200, excluirProdutos(d)));
  if (r === "POST restaurar") return lerCorpoJSON(req, res, 1e6, (d) => json(res, 200, restaurarProdutos(d)));
  if (r === "POST foto") return enviarFoto(req, res);
  if (r === "PUT nao-duplicados") return lerCorpoJSON(req, res, 4096, (d) => json(res, 200, marcarNaoDuplicado(d)));
  if (r === "PUT banner")return lerCorpoJSON(req, res, 65536, (d) => json(res, 200, salvarBanner(d)));
  if (r === "POST banner-imagem") return enviarImagemBanner(req, res);
  if (r === "PUT ordem-setores") return lerCorpoJSON(req, res, 65536, (d) => json(res, 200, salvarOrdemSetores(d)));
  if (r === "POST categoria") return lerCorpoJSON(req, res, 4096, (d) => json(res, 200, criarCategoria(d)));
  if (r === "POST categoria-excluir") return lerCorpoJSON(req, res, 4096, (d) => json(res, 200, excluirCategoria(d)));
  if (r === "POST subcategoria") return lerCorpoJSON(req, res, 4096, (d) => json(res, 200, criarSubcategoria(d)));
  if (r === "POST subcategoria-excluir") return lerCorpoJSON(req, res, 4096, (d) => json(res, 200, excluirSubcategoria(d)));
  if (r === "PUT exibicao") return lerCorpoJSON(req, res, 4096, (d) => json(res, 200, salvarExibicao(d)));
  if (r === "PUT site")return lerCorpoJSON(req, res, 65536, (d) => json(res, 200, salvarSite(d)));
  if (r === "GET pedidos") return json(res, 200, { pedidos: lerJSON(F.pedidos, []), pedidoStatus: listaStatus() });
  if (r === "PUT pedido-status") return lerCorpoJSON(req, res, 65536, (d) => json(res, 200, salvarStatus(d)));
  if (r === "POST ia/descricao") {
    return lerCorpoJSON(req, res, 4096, (d) =>
      gerarDescricao(d.sku).then(
        (texto) => json(res, 200, { ok: true, texto }),
        (e) => { const [st, msg] = erroIA(e); json(res, st, { erro: msg }); }
      )
    );
  }
  if (r === "POST ia/foto") {
    return lerCorpo(req, MAX_FOTO, (err, buf) => {
      if (err) return json(res, 413, { erro: "Imagem grande demais (máx. 8 MB)." });
      lerFotoIA(buf).then(
        (dados) => json(res, 200, { ok: true, ...dados }),
        (e) => { const [st, msg] = erroIA(e); json(res, st, { erro: msg }); }
      );
    });
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
    pedidoStatus: listaStatus(),
    custos: lerJSON(F.custos, {}),
    banner: lerJSON(F.banner, null) || {},
    naoDuplicados: lerJSON(F.naoDuplicados, []),
    ia: !!process.env.ANTHROPIC_API_KEY,
    dados: { pasta: DATA_DIR, segura: dadosSeguros() }, // segura = sobrevive a deploys
  });
}

/* ---------- Possíveis duplicados: grupos que você marcou como "não são duplicados" ---------- */
// A chave é a lista de SKUs do grupo, em ordem; se o grupo mudar (entra ou sai produto), ele volta a aparecer
function marcarNaoDuplicado(d) {
  const chave = texto(d.chave, 2000);
  if (!chave) throw new Error("Grupo inválido.");
  const lista = new Set(lerJSON(F.naoDuplicados, []));
  d.ignorar === false ? lista.delete(chave) : lista.add(chave);
  const out = [...lista].slice(-5000);
  gravarJSON(F.naoDuplicados, out);
  return { ok: true, naoDuplicados: out };
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

/* ---------- IA: lê o rótulo de uma foto para achar o produto (Fotos em lote) ---------- */
// Só extrai o que está escrito na foto; a escolha do produto fica com você no painel. Nada é salvo aqui.
const SISTEMA_FOTO = `Você ajuda a Rota Importados, uma loja de produtos importados (perfumes, cosméticos, suplementos, eletrônicos e outros), a ligar fotos de produtos ao cadastro do catálogo.

Olhe a foto e transcreva o que está escrito no produto ou na embalagem: marca, nome do produto, volume ou peso (ex.: 100ml, 60 cápsulas, 15mg) e o tipo (ex.: Eau de Parfum, creme, suplemento). Esses dados serão comparados com os nomes do catálogo, então copie as palavras como aparecem no rótulo.

Use somente o que dá para ler na foto. Não adivinhe marca, nome ou volume pelo formato do frasco ou pela cor: um palpite errado liga a foto ao produto errado no site. Deixe vazio o campo que não estiver legível. Em "texto", coloque as outras palavras legíveis mais importantes do rótulo (até 15 palavras). Marque "legivel" como false se não der para ler nada que identifique o produto.`;

const ESQUEMA_FOTO = {
  type: "object",
  properties: {
    legivel: { type: "boolean" },
    marca: { type: "string" },
    nome: { type: "string" },
    volume: { type: "string" },
    tipo: { type: "string" },
    texto: { type: "string" },
  },
  required: ["legivel", "marca", "nome", "volume", "tipo", "texto"],
  additionalProperties: false,
};

async function lerFotoIA(buf) {
  const tipo = buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg"
    : buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47 ? "image/png"
    : buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : "";
  if (!tipo) throw new Error("Envie a imagem em JPG, PNG ou WebP.");
  const r = await ia().beta.messages.create({
    model: IA_MODELO,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // se o modelo recusar, a API tenta automaticamente outro modelo
    output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_FOTO } },
    system: SISTEMA_FOTO,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: tipo, data: buf.toString("base64") } },
        { type: "text", text: "Transcreva os dados do produto desta foto." },
      ],
    }],
  });
  if (r.stop_reason === "refusal") throw new Error("A IA não leu esta foto.");
  if (r.stop_reason === "max_tokens") throw new Error("A IA não terminou a leitura. Tente de novo.");
  let d;
  try { d = JSON.parse(r.content.filter((b) => b.type === "text").map((b) => b.text).join("")); }
  catch { throw new Error("A IA respondeu num formato inesperado. Tente de novo."); }
  return {
    legivel: d.legivel === true,
    marca: texto(d.marca, 80), nome: texto(d.nome, 160), volume: texto(d.volume, 40),
    tipo: texto(d.tipo, 60), texto: texto(d.texto, 200),
  };
}

/* ---------- Produtos ---------- */
const texto =(v, max) => String(v == null ? "" : v).trim().slice(0, max);
const ID_FOTO = /^[A-Za-z0-9_-]{1,120}$/;

// Valida e normaliza os campos enviados pelo painel
function limparCampos(c) {
  const out = {};
  if ("name" in c) { out.name = texto(c.name, 200); if (!out.name) throw new Error("Informe o nome do produto."); }
  if ("description" in c) out.description = texto(c.description, 5000);
  if ("brand" in c) out.brand = texto(c.brand, 120);
  if ("sector" in c) out.sector = texto(c.sector, 120);
  if ("subsector" in c) out.subsector = texto(c.subsector, 120);
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
  if ("promo" in c) out.promo = limparPromo(c.promo);
  return out;
}

// Oferta: preço promocional em US$ e validade (início opcional = vale desde já; fim obrigatório)
function limparPromo(v) {
  if (v == null || v === "") return null;
  if (typeof v !== "object" || Array.isArray(v)) throw new Error("Oferta inválida.");
  const price = Number(v.price);
  if (!(price > 0 && price < 1e7)) throw new Error("Informe o preço da oferta.");
  const data = (s, nome) => {
    if (s == null || s === "") return "";
    const t = Date.parse(s);
    if (!isFinite(t)) throw new Error(`Data de ${nome} da oferta inválida.`);
    return new Date(t).toISOString();
  };
  const start = data(v.start, "início"), end = data(v.end, "fim");
  if (!end) throw new Error("Informe até quando vale a oferta.");
  if (start && Date.parse(start) >= Date.parse(end)) throw new Error("O fim da oferta precisa ser depois do início.");
  // currency: "USD" acompanha a cotação; "BRL" é preço fixo em reais (Pix), não muda com o dólar
  const currency = v.currency === "BRL" ? "BRL" : "USD";
  return { price: Math.round(price * 100) / 100, currency, start, end };
}

// Produto criado no painel ou trazido por "produtos extras" (fica em ajustes.novos, não no Catálogo Pro)
const ehNovo = (aj, sku) => aj.novos.some((p) => p.sku === sku);

function salvarProduto(d) {
  const aj = lerAjustes();
  aplicarCampos(aj, null, texto(d.sku, 120), limparCampos(d.campos || {}));
  gravarJSON(F.ajustes, aj);
  return { ok: true, ajustes: aj };
}

// Aplica campos a um produto dentro de "aj" (sem gravar). "loja" pode vir já lida, para lotes.
function aplicarCampos(aj, loja, sku, campos) {
  if (ehNovo(aj, sku)) {
    const i = aj.novos.findIndex((p) => p.sku === sku);
    if (i < 0) throw new Error("Produto não encontrado.");
    aj.novos[i] = { ...aj.novos[i], ...campos, updated: new Date().toISOString() };
  } else {
    if (loja === null) loja = lerJSON(F.loja, null);
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
}

function criarProduto(d) {
  const campos = limparCampos({ active: true, ...(d.campos || {}) });
  if (!campos.name) throw new Error("Informe o nome do produto.");
  const aj = lerAjustes();
  let n = aj.novos.reduce((m, p) => Math.max(m, /^ADM-\d+$/.test(p.sku) ? Number(p.sku.slice(4)) : 0), 0) + 1;
  const agora = new Date().toISOString();
  const p = { sku: "ADM-" + String(n).padStart(4, "0"), name: "", description: "", sector: "", brand: "", tipo: "", notes: "", volume: null, stock: null, price: null, promo: null, tags: "", photos: [], ...campos, added: agora.slice(0, 10), updated: agora };
  aj.novos.push(p);
  gravarJSON(F.ajustes, aj);
  return { ok: true, sku: p.sku, ajustes: aj };
}

// Novo produto: exclui. Produto do Catálogo Pro: descarta as edições (volta ao original).
function removerAjuste(skuIn) {
  const sku = texto(skuIn, 120);
  const aj = lerAjustes();
  if (ehNovo(aj, sku)) aj.novos = aj.novos.filter((p) => p.sku !== sku);
  else delete aj.produtos[sku];
  gravarJSON(F.ajustes, aj);
  return { ok: true, ajustes: aj };
}

// Excluir: produto criado no painel ou extra é apagado de vez; produto do Catálogo Pro vai para "Excluídos"
// (some do site e do painel, continua excluído mesmo se o Catálogo Pro reenviar, e pode ser restaurado)
const listaSkus = (d) => {
  const skus = (Array.isArray(d.skus) ? d.skus : []).map((s) => texto(s, 120)).filter(Boolean).slice(0, 10000);
  if (!skus.length) throw new Error("Nenhum produto selecionado.");
  return new Set(skus);
};
function excluirProdutos(d) {
  const skus = listaSkus(d);
  const aj = lerAjustes();
  const novos = new Set(aj.novos.map((p) => p.sku));
  const exc = new Set(aj.excluidos);
  let apagados = 0, paraExcluidos = 0;
  for (const s of skus) {
    if (novos.has(s)) apagados++;
    else if (!exc.has(s)) { exc.add(s); paraExcluidos++; }
  }
  aj.novos = aj.novos.filter((p) => !skus.has(p.sku));
  aj.excluidos = [...exc];
  gravarJSON(F.ajustes, aj);
  return { ok: true, ajustes: aj, apagados, paraExcluidos };
}
function restaurarProdutos(d) {
  const skus = listaSkus(d);
  const aj = lerAjustes();
  aj.excluidos = aj.excluidos.filter((s) => !skus.has(s));
  gravarJSON(F.ajustes, aj);
  return { ok: true, ajustes: aj };
}

// Ação em lote (por enquanto: mostrar/ocultar)
function alterarVarios(d) {
  if (!Array.isArray(d.skus) || !d.skus.length) throw new Error("Nenhum produto selecionado.");
  // Ação: mostrar/ocultar (active) ou mudar categoria/subcategoria (campos.sector / campos.subsector)
  const mudarCat = d.campos && typeof d.campos === "object" && ("sector" in d.campos || "subsector" in d.campos);
  if (typeof d.active !== "boolean" && !mudarCat) throw new Error("Ação inválida.");
  // Lê e grava uma vez só (com "Selecionar todos" podem vir milhares de produtos)
  const aj = lerAjustes();
  const loja = lerJSON(F.loja, null);
  const doCatalogo = new Map(loja && Array.isArray(loja.products) ? loja.products.map((p) => [p.sku, p]) : []);
  const pedido = {};
  if (mudarCat) for (const k of ["sector", "subsector"]) { if (k in d.campos) pedido[k] = d.campos[k]; }
  else pedido.active = d.active;
  const campos = limparCampos(pedido);
  if ("sector" in campos && !campos.sector) throw new Error("Escolha a categoria.");
  for (const s of d.skus.slice(0, 20000)) {
    const sku = texto(s, 120);
    try { aplicarCampos(aj, { products: doCatalogo.has(sku) ? [doCatalogo.get(sku)] : [] }, sku, campos); } catch {}
  }
  gravarJSON(F.ajustes, aj);
  return { ok: true, ajustes: aj };
}

// Vários produtos com campos diferentes de uma vez (ex.: completar duplicados com foto/descrição do irmão)
function salvarVarios(d) {
  if (!Array.isArray(d.itens) || !d.itens.length) throw new Error("Nada para salvar.");
  const aj = lerAjustes();
  const loja = lerJSON(F.loja, null);
  const doCatalogo = new Map(loja && Array.isArray(loja.products) ? loja.products.map((p) => [p.sku, p]) : []);
  let ok = 0;
  for (const it of d.itens.slice(0, 20000)) {
    const sku = texto(it && it.sku, 120);
    const enviados = {};
    for (const k of ["photos", "description"]) if (it && k in (it.campos || {})) enviados[k] = it.campos[k];
    try { aplicarCampos(aj, { products: doCatalogo.has(sku) ? [doCatalogo.get(sku)] : [] }, sku, limparCampos(enviados)); ok++; } catch {}
  }
  gravarJSON(F.ajustes, aj);
  return { ok: true, salvos: ok, ajustes: aj };
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
  // Google Analytics 4 (ID de métricas, público por natureza: aparece no código de qualquer site)
  site.ga = texto(d.ga, 20).replace(/\s/g, "").toUpperCase();
  if (site.ga && !/^G-[A-Z0-9]{4,15}$/.test(site.ga)) throw new Error("ID do Google Analytics inválido: use o formato G-XXXXXXXXXX.");
  site.cotacao = {};
  for (const k of ["pix", "efetivo"]) {
    const v = d.cotacao && d.cotacao[k];
    const n = v === "" || v == null ? null : Number(v);
    if (n == null) continue;
    if (!(n > 0 && n < 100)) throw new Error("Cotação inválida.");
    // Data no horário de Brasília (o lembrete diário do painel compara com o dia de hoje)
    site.cotacao[k] = { rate: Math.round(n * 10000) / 10000, date: new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) };
  }
  // Cartão: preço do Pix + acréscimo (%), em até N parcelas
  const c = d.cartao || {};
  const acrescimo = Number(c.acrescimo), parcelas = parseInt(c.parcelas, 10);
  if (!(acrescimo >= 0 && acrescimo <= 200)) throw new Error("Acréscimo do cartão inválido (0 a 200%).");
  if (!(parcelas >= 1 && parcelas <= 24)) throw new Error("Parcelas inválidas (1 a 24).");
  site.cartao = { acrescimo: Math.round(acrescimo * 100) / 100, parcelas };
  const atual = lerJSON(F.site, null) || {};
  if (atual.ocultar) site.ocultar = atual.ocultar; // regras de exibição são salvas pela aba Pendências
  if (atual.ordemSetores) site.ordemSetores = atual.ordemSetores; // ordem dos departamentos tem botão próprio
  if (atual.categorias) site.categorias = atual.categorias; // categorias criadas no painel também
  if (atual.subcategorias) site.subcategorias = atual.subcategorias;
  gravarJSON(F.site, site);
  return { ok: true, site };
}

// Ordem dos departamentos no site e no catálogo PDF (lista de nomes; os que faltarem vêm depois)
function salvarOrdemSetores(d) {
  const lista = (Array.isArray(d.ordem) ? d.ordem : []).map((s) => texto(s, 120)).filter(Boolean).slice(0, 500);
  const site = lerJSON(F.site, null) || {};
  site.ordemSetores = [...new Set(lista)];
  gravarJSON(F.site, site);
  return { ok: true, site };
}

// Departamentos (categorias) criados no painel: existem mesmo sem produtos, para escolher no editor
function criarCategoria(d) {
  const nome = texto(d.nome, 120);
  if (!nome) throw new Error("Informe o nome da categoria.");
  const site = lerJSON(F.site, null) || {};
  const cats = Array.isArray(site.categorias) ? site.categorias : [];
  if (cats.some((c) => c.toLowerCase() === nome.toLowerCase())) throw new Error("Essa categoria já existe.");
  site.categorias = [...cats, nome];
  if (Array.isArray(site.ordemSetores) && !site.ordemSetores.includes(nome)) site.ordemSetores.push(nome);
  gravarJSON(F.site, site);
  return { ok: true, site };
}

// Exclui a categoria; os produtos dela (inclusive ocultos) passam para "destino"
function excluirCategoria(d) {
  const nome = texto(d.nome, 120), destino = texto(d.destino, 120);
  if (!nome) throw new Error("Categoria inválida.");
  if (destino && destino === nome) throw new Error("Escolha outra categoria para os produtos.");
  const aj = lerAjustes();
  const loja = lerJSON(F.loja, null);
  const doCatalogo = loja && Array.isArray(loja.products) ? loja.products : [];
  const setorAtual = (p) => (p.sku && aj.produtos[p.sku] && "sector" in aj.produtos[p.sku].campos ? aj.produtos[p.sku].campos.sector : p.sector) || "Outros";
  const novos = new Set(aj.novos.map((p) => p.sku));
  const mover = doCatalogo.filter((p) => !novos.has(p.sku) && setorAtual(p) === nome).map((p) => ({ p, catalogo: true }))
    .concat(aj.novos.filter((p) => (p.sector || "Outros") === nome).map((p) => ({ p })));
  if (mover.length && !destino) throw new Error("Escolha para qual categoria os produtos vão.");
  // A subcategoria era da categoria excluída: os produtos ficam sem subcategoria no destino
  for (const { p, catalogo } of mover) {
    try { aplicarCampos(aj, { products: catalogo ? [p] : [] }, p.sku, { sector: destino, subsector: "" }); } catch {}
  }
  if (mover.length) gravarJSON(F.ajustes, aj);
  const site = lerJSON(F.site, null) || {};
  site.categorias = (Array.isArray(site.categorias) ? site.categorias : []).filter((c) => c !== nome);
  if (site.subcategorias) delete site.subcategorias[nome];
  if (destino && !site.categorias.includes(destino) && !doCatalogo.some((p) => p.sector === destino) && !aj.novos.some((p) => p.sector === destino)) site.categorias.push(destino);
  if (Array.isArray(site.ordemSetores)) site.ordemSetores = site.ordemSetores.filter((c) => c !== nome);
  gravarJSON(F.site, site);
  return { ok: true, movidos: mover.length, site, ajustes: aj };
}

// Subcategorias: lista por categoria em site.subcategorias = { "Saúde": ["Peptídeos", ...] }
function criarSubcategoria(d) {
  const cat = texto(d.categoria, 120), nome = texto(d.nome, 120);
  if (!cat) throw new Error("Escolha a categoria.");
  if (!nome) throw new Error("Informe o nome da subcategoria.");
  const site = lerJSON(F.site, null) || {};
  const subs = (site.subcategorias = site.subcategorias && typeof site.subcategorias === "object" ? site.subcategorias : {});
  const lista = Array.isArray(subs[cat]) ? subs[cat] : [];
  if (lista.some((s) => s.toLowerCase() === nome.toLowerCase())) throw new Error("Essa subcategoria já existe nesta categoria.");
  subs[cat] = [...lista, nome].slice(0, 200);
  gravarJSON(F.site, site);
  return { ok: true, site };
}

// Exclui a subcategoria; os produtos dela continuam na categoria, só sem subcategoria
function excluirSubcategoria(d) {
  const cat = texto(d.categoria, 120), nome = texto(d.nome, 120);
  const aj = lerAjustes();
  const loja = lerJSON(F.loja, null);
  const novos = new Set(aj.novos.map((p) => p.sku));
  const valor = (p, k) => (p.sku && aj.produtos[p.sku] && k in aj.produtos[p.sku].campos ? aj.produtos[p.sku].campos[k] : p[k]);
  const doCatalogo = (loja && Array.isArray(loja.products) ? loja.products : []).filter((p) => !novos.has(p.sku));
  let n = 0;
  for (const p of doCatalogo) if ((valor(p, "sector") || "Outros") === cat && valor(p, "subsector") === nome) { try { aplicarCampos(aj, { products: [p] }, p.sku, { subsector: "" }); n++; } catch {} }
  for (const p of aj.novos) if ((p.sector || "Outros") === cat && p.subsector === nome) { try { aplicarCampos(aj, null, p.sku, { subsector: "" }); n++; } catch {} }
  if (n) gravarJSON(F.ajustes, aj);
  const site = lerJSON(F.site, null) || {};
  if (site.subcategorias && Array.isArray(site.subcategorias[cat])) {
    site.subcategorias[cat] = site.subcategorias[cat].filter((s) => s !== nome);
    if (!site.subcategorias[cat].length) delete site.subcategorias[cat];
  }
  gravarJSON(F.site, site);
  return { ok: true, liberados: n, site, ajustes: aj };
}

// Mostrar/ocultar no site os produtos sem foto, sem descrição ou sem estoque
function salvarExibicao(d) {
  const site = lerJSON(F.site, null) || {};
  site.ocultar = { semFoto: d.semFoto === true, semDescricao: d.semDescricao === true, semEstoque: d.semEstoque === true };
  gravarJSON(F.site, site);
  return { ok: true, site };
}

/* ---------- Pedidos ---------- */
// Situações (colunas do quadro), configuráveis no painel. A primeira é onde entram os pedidos novos.
const STATUS_PADRAO = [
  { id: "novo", nome: "Novo", cor: "amarelo" },
  { id: "atendimento", nome: "Em atendimento", cor: "azul" },
  { id: "confirmado", nome: "Confirmado", cor: "ciano" },
  { id: "entregue", nome: "Entregue", cor: "verde" },
  { id: "cancelado", nome: "Cancelado", cor: "cinza", venda: false },
];
// venda = os pedidos desta situação contam nos Resultados (faturamento, lucro, itens mais vendidos)
const CORES_STATUS = ["amarelo", "laranja", "vermelho", "rosa", "roxo", "azul", "ciano", "verde", "cinza"];
function listaStatus() {
  const l = lerJSON(F.pedidoStatus, null);
  // Lista salva antes da opção "conta nas vendas": "cancelado" continua fora das vendas
  return Array.isArray(l) && l.length ? l.map((s) => ("venda" in s ? s : { ...s, venda: s.id !== "cancelado" })) : STATUS_PADRAO;
}
const statusValido = (s) => listaStatus().some((x) => x.id === s);
const statusInicial = () => listaStatus()[0].id;

// Recebe a lista inteira (ordem = ordem das colunas). Pedidos de situações removidas vão para "destino".
function salvarStatus(d) {
  if (!Array.isArray(d.lista) || !d.lista.length) throw new Error("Deixe pelo menos uma situação.");
  if (d.lista.length > 20) throw new Error("No máximo 20 situações.");
  const usados = new Set();
  const lista = d.lista.map((s) => {
    const nome = texto(s && s.nome, 40);
    if (!nome) throw new Error("Há uma situação sem nome.");
    let id = texto(s.id, 40).replace(/[^a-z0-9-]/g, "");
    if (!id) {
      const base = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "situacao";
      id = base;
      for (let n = 2; usados.has(id); n++) id = base + "-" + n;
    }
    if (usados.has(id)) throw new Error("Situação repetida.");
    usados.add(id);
    return { id, nome, cor: CORES_STATUS.includes(s.cor) ? s.cor : "cinza", venda: s.venda !== false };
  });
  const ids = lista.map((s) => s.id);
  // Destino pela posição na lista enviada (pode ser uma situação recém-criada, ainda sem id)
  const destino = ids.includes(d.destino) ? d.destino : ids[Number(d.destinoIndice)] || ids[0];
  const pedidos = lerJSON(F.pedidos, []);
  let movidos = 0;
  for (const p of pedidos) if (!ids.includes(p.status)) { p.status = destino; movidos++; }
  if (movidos) gravarJSON(F.pedidos, pedidos);
  gravarJSON(F.pedidoStatus, lista);
  return { ok: true, pedidoStatus: lista, movidos, pedidos: movidos ? pedidos : undefined };
}
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
  if ("status" in d && !statusValido(d.status)) throw new Error("Situação inválida.");
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

// Nome completo, documento (CPF no Brasil, DNI na Argentina, CI no Paraguai), endereço e telefone.
// livre = edição de pedido: nada é obrigatório, mas o que for preenchido é conferido (CPF, CEP, estado).
function limparCliente(c, livre) {
  c = c && typeof c === "object" ? c : {};
  const t = (k, n) => texto(c[k], n);
  const pais = PAISES[c.pais] ? c.pais : "Brasil";
  const cli = {
    nome: t("nome", 120), pais, docTipo: PAISES[pais], doc: t("doc", 20),
    cep: t("cep", 10), estado: t("estado", 60), rua: t("rua", 160), numero: t("numero", 20),
    complemento: t("complemento", 80), bairro: t("bairro", 100), cidade: t("cidade", 100), obs: t("obs", 1000),
    telefone: t("telefone", 30).replace(/\D/g, ""),
  };
  if (cli.telefone && (cli.telefone.length < 8 || cli.telefone.length > 15)) throw new Error("Telefone inválido: use DDI + DDD + número (ex.: 5511999998888).");
  const regiao = pais === "Brasil" ? "o estado" : pais === "Argentina" ? "a província" : "o departamento";
  const falta = [["nome", "o nome completo"], ["doc", "o " + cli.docTipo], ["rua", "a rua"], ["numero", "o número"], ["bairro", "o bairro"], ["cidade", "a cidade"], ["estado", regiao]].find(([k]) => !cli[k]);
  if (falta && !livre) throw new Error(`Informe ${falta[1]} do cliente.`);
  if (pais === "Brasil") {
    if ((cli.doc || !livre) && !cpfValido(cli.doc)) throw new Error("CPF inválido.");
    if ((cli.estado || !livre) && !UFS.includes(cli.estado)) throw new Error("Estado inválido.");
    const cep = cli.cep.replace(/\D/g, "");
    if ((cep || !livre) && cep.length !== 8) throw new Error("CEP inválido.");
    const d = cli.doc.replace(/\D/g, "");
    if (d) cli.doc = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    if (cep) cli.cep = cep.slice(0, 5) + "-" + cep.slice(5);
  }
  return cli;
}

const valorPedido = (v) => { const n = Number(v); return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0; };
function itensPedido(lista) {
  if (!Array.isArray(lista) || !lista.length) throw new Error("Pedido vazio.");
  const num = (v) => (typeof v === "number" && isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null);
  const itens = lista.slice(0, 100).map((i) => ({
    sku: skuExtra(texto(i.sku, 120)),
    nome: texto(i.nome, 200),
    variacao: texto(i.v != null ? i.v : i.variacao, 120),
    q: Math.max(1, Math.min(9999, parseInt(i.q, 10) || 1)),
    preco: num(i.preco),
    custo: num(i.custo), // custo unitário em R$ (o que a loja pagou), para o lucro
  }));
  if (itens.some((i) => !i.nome)) throw new Error("Há um item sem nome.");
  return itens;
}
// Fretes pagos pela loja (pode haver vários envios por pedido), cada um com custo em R$ e código de rastreio
function enviosPedido(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.slice(0, 20).map((e) => {
    const data = new Date(e && e.data);
    return {
      transportadora: texto(e && e.transportadora, 60),
      codigo: texto(e && e.codigo, 60).replace(/\s+/g, "").toUpperCase(),
      custo: valorPedido(e && e.custo),
      data: isNaN(data) ? new Date().toISOString() : data.toISOString(),
    };
  }).filter((e) => e.transportadora || e.codigo || e.custo);
}
// Guarda o último custo de cada SKU para sugerir no próximo pedido (e preencher os pedidos do site)
function lembrarCustos(itens) {
  const novos = itens.filter((i) => i.sku && i.custo != null);
  if (!novos.length) return;
  const custos = lerJSON(F.custos, {});
  for (const i of novos) custos[i.sku] = i.custo;
  gravarJSON(F.custos, custos);
}
// Total = itens + frete − desconto (nunca negativo)
function totalPedido(p) {
  const sub = p.itens.reduce((s, i) => s + (i.preco || 0) * i.q, 0);
  return Math.max(0, Math.round((sub + (p.frete || 0) - (p.desconto || 0)) * 100) / 100);
}

function gravarPedido(d, origem) {
  const num = (v) => (typeof v === "number" && isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null);
  const itens = itensPedido(d.itens);
  if (origem === "painel") lembrarCustos(itens);
  else {
    // Pedido do site: custo sugerido = último custo informado para o SKU
    const custos = lerJSON(F.custos, {});
    for (const i of itens) i.custo = i.sku && typeof custos[i.sku] === "number" ? custos[i.sku] : null;
  }
  // Carrinho do site: só nome e cidade, opcionais. Pedido lançado no painel: dados completos.
  const c = d.cliente && typeof d.cliente === "object" ? d.cliente : {};
  const cliente = origem === "painel" ? limparCliente(c) : { nome: texto(c.nome, 120), cidade: texto(c.cidade, 100) };
  const pedidos = lerJSON(F.pedidos, []);
  const pedido = {
    id: pedidos.reduce((m, p) => Math.max(m, p.id || 0), 0) + 1,
    data: new Date().toISOString(),
    origem,
    status: origem === "painel" && statusValido(d.status) ? d.status : statusInicial(),
    cliente,
    itens,
    frete: origem === "painel" ? valorPedido(d.frete) : 0,
    desconto: origem === "painel" ? valorPedido(d.desconto) : 0,
    envios: origem === "painel" ? enviosPedido(d.envios) : [],
    total: 0,
    moeda: d.moeda === "USD" ? "USD" : "BRL",
    nota: origem === "painel" ? texto(d.nota, 2000) : "",
  };
  // No painel o total é sempre recalculado a partir dos itens (com frete e desconto)
  pedido.total = origem === "painel" ? totalPedido(pedido) : num(d.total);
  pedidos.unshift(pedido);
  gravarJSON(F.pedidos, pedidos.slice(0, 5000));
  return pedido;
}

function alterarPedido(d) {
  const pedidos = lerJSON(F.pedidos, []);
  const p = pedidos.find((x) => x.id === Number(d.id));
  if (!p) throw new Error("Pedido não encontrado.");
  if ("status" in d) {
    if (!statusValido(d.status)) throw new Error("Situação inválida.");
    p.status = d.status;
  }
  if ("nota" in d) p.nota = texto(d.nota, 2000);
  // Edição completa (aba Pedidos → Editar): cliente, itens, frete e desconto; o total é recalculado
  if ("cliente" in d) p.cliente = limparCliente(d.cliente, true);
  if ("itens" in d) { p.itens = itensPedido(d.itens); lembrarCustos(p.itens); }
  if ("envios" in d) p.envios = enviosPedido(d.envios);
  if ("frete" in d) p.frete = valorPedido(d.frete);
  if ("desconto" in d) p.desconto = valorPedido(d.desconto);
  if (["itens", "frete", "desconto"].some((k) => k in d)) p.total = totalPedido(p);
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
  let loja = null, extras = null, fotos = 0;
  fs.mkdirSync(path.join(DATA_DIR, "fotos"), { recursive: true });

  for (const e of entries) {
    if (e.name === "loja.json") {
      const data = JSON.parse(e.data().toString("utf8"));
      if (data.type !== "catalogo-pro-site" || !Array.isArray(data.products)) {
        throw new Error("loja.json não é uma exportação do Catálogo Pro.");
      }
      loja = data;
    } else if (e.name === "produtos-extras.json") {
      const data = JSON.parse(e.data().toString("utf8"));
      if (data.type !== "rota-produtos-extras" || !Array.isArray(data.produtos)) throw new Error("produtos-extras.json em formato inválido.");
      extras = data.produtos;
    } else {
      const m = /^fotos\/([A-Za-z0-9_-]{1,120})\.jpe?g$/.exec(e.name);
      if (!m) continue; // ignora qualquer outro arquivo
      fs.writeFileSync(path.join(DATA_DIR, "fotos", m[1] + ".jpg"), e.data());
      fotos++;
    }
  }

  if (!loja && !extras && !fotos) throw new Error("O ZIP não tem loja.json, produtos-extras.json nem fotos.");
  // O Rota é independente: uma exportação do Catálogo Pro não altera mais os produtos.
  // Só um backup feito no próprio painel restaura a lista (substitui todos os produtos).
  let restaurados = null, catalogoIgnorado = false;
  if (loja) {
    if (loja.exportadoPor === "rota-painel") restaurados = restaurarBackup(loja);
    else if (ehIndependente()) catalogoIgnorado = true;
    else { gravarJSON(F.loja, loja); tornarIndependente(); } // primeira importação: já converte
  }
  const resumoExtras = extras ? adicionarExtras(extras) : null;
  if (catalogoIgnorado && !extras && !fotos) throw new Error("O Rota Importados é independente do Catálogo Pro: a lista de produtos deste ZIP não foi importada. Para restaurar, use um backup baixado do painel (Importar/Exportar → Exportar).");

  const usados = loja && !catalogoIgnorado ? loja.products : null;
  const faltando = usados
    ? [...new Set(usados.flatMap((p) => (Array.isArray(p.photos) ? p.photos : [])))].filter(
        (id) => !fs.existsSync(path.join(DATA_DIR, "fotos", id + ".jpg"))
      ).length
    : null;
  return { ok: true, produtos: usados ? usados.length : null, restaurados, catalogoIgnorado, fotos, fotosFaltando: faltando, extras: resumoExtras };
}

// Prefixo dos códigos de produtos extras: o antigo "EPIC-" passa a ser sempre "ADM1-"
const PREFIXO_ANTIGO = /^EPIC-/i, PREFIXO_NOVO = "ADM1-";
const skuExtra = (sku) => String(sku).replace(PREFIXO_ANTIGO, PREFIXO_NOVO);

// Troca, uma vez, os códigos EPIC- já gravados (produtos, pedidos e grupos "não são duplicados")
function migrarSkusEpic() {
  try {
    const aj = lerAjustes();
    let n = 0;
    const existentes = new Set(aj.novos.map((p) => p.sku));
    aj.novos.forEach((p) => {
      if (!PREFIXO_ANTIGO.test(p.sku)) return;
      const novo = skuExtra(p.sku);
      if (existentes.has(novo)) return; // já existe um com o código novo: mantém os dois como estão
      p.sku = novo; n++;
    });
    if (n) gravarJSON(F.ajustes, aj);
    const pedidos = lerJSON(F.pedidos, null);
    if (Array.isArray(pedidos) && pedidos.some((p) => (p.itens || []).some((i) => PREFIXO_ANTIGO.test(i.sku || "")))) {
      pedidos.forEach((p) => (p.itens || []).forEach((i) => { if (i.sku) i.sku = skuExtra(i.sku); }));
      gravarJSON(F.pedidos, pedidos);
    }
    const nd = lerJSON(F.naoDuplicados, null);
    if (Array.isArray(nd) && nd.some((k) => /EPIC-/i.test(k))) {
      gravarJSON(F.naoDuplicados, nd.map((k) => k.split("|").map(skuExtra).sort().join("|")));
    }
    if (n) console.log(`${n} código(s) EPIC- trocados por ${PREFIXO_NOVO}.`);
  } catch (e) {
    console.warn("Não foi possível trocar os códigos EPIC-: " + e.message);
  }
}

/* ---------- Independência do Catálogo Pro ---------- */
// Uma vez só: os produtos do Catálogo Pro, já com as edições do painel, viram produtos do próprio Rota
// (ajustes.novos), com os mesmos códigos. Produtos excluídos no painel ficam de fora.
// A exportação original fica guardada em loja-catalogo-pro-original.json. Depois disso, loja.json guarda só
// os dados gerais (departamentos, cotação, marca) e nenhuma importação do Catálogo Pro altera os produtos.
const ARQ_ORIGINAL_CP = () => path.join(DATA_DIR, "loja-catalogo-pro-original.json");
function tornarIndependente() {
  try {
    const loja = lerJSON(F.loja, null);
    if (!loja || loja.type !== "catalogo-pro-site" || !Array.isArray(loja.products) || loja.independente) return null;
    const aj = lerAjustes();
    const jaTem = new Set(aj.novos.map((p) => p.sku));
    const excluidos = new Set(aj.excluidos);
    const agora = new Date().toISOString();
    const convertidos = [];
    let semCodigo = 0, fora = 0;
    for (const p of loja.products) {
      if (!p || typeof p !== "object") continue;
      let sku = texto(p.sku, 120);
      if (!sku) sku = "CP-" + String(++semCodigo).padStart(4, "0"); // sem código no Catálogo Pro: ganha um
      if (excluidos.has(sku)) { fora++; continue; }
      if (jaTem.has(sku)) continue; // já é do painel (vale a versão do painel, como antes)
      jaTem.add(sku);
      convertidos.push({ ...aplicarAjuste(p, aj.produtos[sku]), sku, origem: "catalogo-pro", updated: agora });
    }
    if (!fs.existsSync(ARQ_ORIGINAL_CP())) fs.copyFileSync(F.loja, ARQ_ORIGINAL_CP());
    // Mesma ordem do site: primeiro os que vinham do Catálogo Pro, depois os criados no painel
    aj.novos = convertidos.concat(aj.novos);
    aj.produtos = {};
    aj.excluidos = [];
    gravarJSON(F.ajustes, aj); // primeiro os produtos; se parar aqui, a próxima vez não duplica (jaTem)
    gravarJSON(F.loja, { ...loja, products: [], independente: true, independenteEm: agora });
    console.log(`Rota independente do Catálogo Pro: ${convertidos.length} produto(s) convertidos, ${fora} excluído(s) deixados de fora.`);
    return { convertidos: convertidos.length, excluidosForaDoSite: fora };
  } catch (e) {
    console.warn("Não foi possível tornar o Rota independente do Catálogo Pro: " + e.message);
    return null;
  }
}
const ehIndependente = () => { const l = lerJSON(F.loja, null); return !!(l && l.independente); };

// Backup exportado pelo painel (independente): restaura todos os produtos como produtos do Rota
function restaurarBackup(data) {
  const aj = lerAjustes();
  const vistos = new Set();
  aj.novos = data.products.filter((p) => p && typeof p === "object" && p.sku && !vistos.has(p.sku) && vistos.add(p.sku));
  aj.produtos = {};
  aj.excluidos = [];
  gravarJSON(F.ajustes, aj);
  const { products, generated, exportadoPor, ...geral } = data;
  gravarJSON(F.loja, { ...geral, products: [], independente: true, independenteEm: geral.independenteEm || new Date().toISOString() });
  return aj.novos.length;
}

// "Produtos extras": somam ao catálogo (ficam junto dos criados no painel) em vez de substituí-lo.
// Mesmo SKU de um extra já existente: atualiza só os campos enviados (ex.: só o preço ou só a foto).
// SKU que já existe no Catálogo Pro: ignora, exceto item só com fotos ({sku, photos}), que vira edição de foto.
// "soSemFoto: true": só aplica se o produto ainda está sem foto (não troca foto existente).
const CAMPOS_EXTRAS = ["name", "brand", "sector", "subsector", "price", "stock", "active", "tags", "description", "photos"];
function adicionarExtras(lista) {
  const aj = lerAjustes();
  const loja = lerJSON(F.loja, null);
  const doCatalogo = new Map(loja && Array.isArray(loja.products) ? loja.products.map((p) => [p.sku, p]) : []);
  const indice = new Map(aj.novos.map((p, i) => [p.sku, i]));
  const agora = new Date().toISOString();
  const r = { novos: 0, atualizados: 0, fotos: 0, jaTinhamFoto: 0, ignorados: 0, erros: 0 };
  const soFotos = (item) => Array.isArray(item.photos) && Object.keys(item).every((k) => k === "sku" || k === "photos" || k === "soSemFoto");
  for (const item of lista.slice(0, 20000)) {
    try {
      const sku = skuExtra(texto(item.sku, 60));
      if (!/^[A-Za-z0-9_-]{1,60}$/.test(sku)) throw new Error("SKU inválido");
      if (doCatalogo.has(sku) && !indice.has(sku)) {
        if (!soFotos(item)) { r.ignorados++; continue; }
        const ed = aj.produtos[sku];
        const atuais = ed && ed.campos && "photos" in ed.campos ? ed.campos.photos : doCatalogo.get(sku).photos;
        if (item.soSemFoto && Array.isArray(atuais) && atuais.length) { r.jaTinhamFoto++; continue; }
        aplicarCampos(aj, loja, sku, limparCampos({ photos: item.photos }));
        r.fotos++;
        continue;
      }
      const enviados = {};
      for (const k of CAMPOS_EXTRAS) if (k in item) enviados[k] = item[k];
      const campos = limparCampos(enviados);
      if (indice.has(sku)) {
        const i = indice.get(sku);
        if (item.soSemFoto && soFotos(item) && (aj.novos[i].photos || []).length) { r.jaTinhamFoto++; continue; }
        aj.novos[i] = { ...aj.novos[i], ...campos, updated: agora };
        if (soFotos(item)) r.fotos++; else r.atualizados++;
      }
      else {
        if (!campos.name) { r.ignorados++; continue; } // atualização de um produto que não existe aqui
        indice.set(sku, aj.novos.length);
        aj.novos.push({ sku, tipo: "", notes: "", volume: null, brand: "", sector: "", price: null, stock: null, tags: "", description: "", photos: [], active: true, ...campos, added: agora.slice(0, 10), updated: agora });
        r.novos++;
      }
    } catch { r.erros++; }
  }
  gravarJSON(F.ajustes, aj);
  return r;
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
  // exportadoPor: marca o backup do painel (só ele restaura produtos depois da independência)
  const dados = { ...loja.completo, generated: new Date().toISOString(), exportadoPor: "rota-painel" };
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

// Ajustes únicos nos dados gravados (rodam antes de o servidor atender o primeiro pedido)
migrarSkusEpic();
tornarIndependente();
