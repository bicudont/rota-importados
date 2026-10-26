// Servidor Node.js mínimo (sem dependências) para hospedagens que exigem app Node, como a Hostinger.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC = ["index.html", "css", "js", "img"]; // só isso fica acessível
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

http
  .createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
    if (rel === "") rel = "index.html";
    const file = path.normalize(path.join(ROOT, rel));
    const allowed = PUBLIC.some((p) => file === path.join(ROOT, p) || file.startsWith(path.join(ROOT, p) + path.sep));

    if (!allowed) return send404(res);
    fs.readFile(file, (err, data) => {
      if (err) return send404(res);
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": rel === "index.html" ? "no-cache" : "public, max-age=3600",
      });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log(`Rota Importados rodando na porta ${PORT}`));

function send404(res) {
  res.writeHead(302, { Location: "/" });
  res.end();
}
