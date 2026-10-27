// Servidor Node.js mínimo (sem dependências) para hospedagens que exigem app Node, como a Hostinger.
// - Serve o site (index.html, css, js, img)
// - Serve os dados exportados pelo Catálogo Pro em /data (loja.json + fotos)
// - Painel /admin para enviar o ZIP exportado pelo Catálogo Pro (senha na variável ADMIN_SENHA)
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const SENHA = process.env.ADMIN_SENHA || "";
const MAX_UPLOAD = 80 * 1024 * 1024;
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

const inside = (base, file) => file === base || file.startsWith(base + path.sep);

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

    if (rel.startsWith("data/")) {
      const file = path.normalize(path.join(DATA_DIR, rel.slice(5)));
      if (!inside(DATA_DIR, file)) return notFound(res);
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
    const inm = req && req.headers["if-none-match"];
    if (inm && inm.split(",").some((t) => t.trim() === etag)) {
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

function redirectHome(res) {
  res.writeHead(302, { Location: "/" });
  res.end();
}

function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Não encontrado");
}

function json(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

/* ---------- Importação do ZIP do Catálogo Pro ---------- */
function senhaOk(given) {
  if (!SENHA) return false;
  const a = crypto.createHash("sha256").update(String(given || "")).digest();
  const b = crypto.createHash("sha256").update(SENHA).digest();
  return crypto.timingSafeEqual(a, b);
}

function importar(req, res) {
  if (req.method !== "POST") return json(res, 405, { erro: "Use POST." });
  if (!SENHA) return json(res, 503, { erro: "Painel desativado: defina a variável ADMIN_SENHA na hospedagem." });
  if (!senhaOk(req.headers["x-senha"])) return json(res, 401, { erro: "Senha incorreta." });

  const chunks = [];
  let size = 0, aborted = false;
  req.on("data", (c) => {
    size += c.length;
    if (size > MAX_UPLOAD) {
      aborted = true;
      json(res, 413, { erro: "Arquivo grande demais (máx. 80 MB). Exporte em partes." });
      req.destroy();
    } else chunks.push(c);
  });
  req.on("end", () => {
    if (aborted) return;
    try {
      const result = aplicarZip(Buffer.concat(chunks));
      json(res, 200, result);
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

  if (loja) {
    const tmp = path.join(DATA_DIR, "loja.json.tmp");
    fs.writeFileSync(tmp, JSON.stringify(loja));
    fs.renameSync(tmp, path.join(DATA_DIR, "loja.json"));
  }
  if (!loja && !fotos) throw new Error("O ZIP não tem loja.json nem fotos.");

  const faltando = loja
    ? [...new Set(loja.products.flatMap((p) => p.photos || []))].filter(
        (id) => !fs.existsSync(path.join(DATA_DIR, "fotos", id + ".jpg"))
      ).length
    : null;
  return { ok: true, produtos: loja ? loja.products.length : null, fotos, fotosFaltando: faltando };
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
