// Gera o catálogo em PDF direto no navegador (usado pelo painel /admin, aba Exportar).
// Sem bibliotecas: escreve o PDF à mão, com fontes padrão (Helvetica) e fotos em JPG.
(() => {
  const W = 595.28, H = 841.89; // A4 em pontos
  const M = 36; // margem
  const COR = { navy: "#001B50", royal: "#0055CC", sky: "#00B8FF", orange: "#FF8900", text: "#172338", muted: "#5B6B82", line: "#E2E8F0", bg: "#EEF4FF", err: "#C81E1E", white: "#FFFFFF" };
  const POR_PAG = 9; // 3 colunas x 3 linhas

  /* ---------- Texto: Helvetica com codificação WinAnsi (cobre acentos do português e espanhol) ---------- */
  const ESPECIAIS = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };
  const codigo = (ch) => {
    const c = ch.charCodeAt(0);
    if ((c >= 32 && c < 127) || (c >= 160 && c <= 255)) return c;
    return ESPECIAIS[c] || 0;
  };
  // Remove o que a fonte padrão do PDF não tem (emojis, outros alfabetos) em vez de imprimir "?"
  const limpar = (s) => String(s == null ? "" : s).normalize("NFC").replace(/[\r\n\t]+/g, " ").replace(/[^]/gu, (ch) => (codigo(ch) ? ch : "")).replace(/ {2,}/g, " ");
  const enc = (s) =>
    [...limpar(s)].map((ch) => {
      const c = codigo(ch);
      if (c === 40 || c === 41 || c === 92) return "\\" + String.fromCharCode(c);
      return c < 127 ? String.fromCharCode(c) : "\\" + c.toString(8).padStart(3, "0");
    }).join("");

  // Larguras medidas com Arial (métricas equivalentes às da Helvetica)
  const ctx = document.createElement("canvas").getContext("2d");
  const cacheLarg = {};
  function largura(s, size, bold) {
    const k = bold ? "b" : "r";
    const t = cacheLarg[k] || (cacheLarg[k] = {});
    ctx.font = (bold ? "bold " : "") + "1000px Arial, Helvetica, sans-serif";
    let w = 0;
    for (const ch of limpar(s)) w += t[ch] != null ? t[ch] : (t[ch] = ctx.measureText(ch).width);
    return (w * size) / 1000;
  }
  // Quebra o texto em até maxLinhas linhas que caibam em maxW (com reticências se sobrar)
  function quebrar(s, size, bold, maxW, maxLinhas) {
    const cabe = (t) => largura(t, size, bold) <= maxW;
    const linhas = [];
    let atual = "";
    for (let p of limpar(s).trim().split(/\s+/).filter(Boolean)) {
      while (!cabe(p) && p.length > 1) { // palavra maior que a linha: divide
        let n = p.length - 1;
        while (n > 1 && !cabe(p.slice(0, n))) n--;
        if (atual) { linhas.push(atual); atual = ""; }
        linhas.push(p.slice(0, n));
        p = p.slice(n);
      }
      const t = atual ? atual + " " + p : p;
      if (cabe(t)) atual = t;
      else { linhas.push(atual); atual = p; }
    }
    if (atual) linhas.push(atual);
    if (linhas.length <= maxLinhas) return linhas;
    const out = linhas.slice(0, maxLinhas);
    let u = out[maxLinhas - 1];
    while (u && !cabe(u + "…")) u = u.slice(0, -1).trimEnd();
    out[maxLinhas - 1] = u + "…";
    return out;
  }

  /* ---------- Página ---------- */
  const cor = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => +(v / 255).toFixed(3)).join(" "); };
  const f = (n) => +n.toFixed(2);
  class Pagina {
    constructor() { this.ops = []; this.imgs = new Set(); this.links = []; }
    ret(x, y, w, h, fill, stroke) {
      const op = fill && stroke ? "B" : fill ? "f" : "S";
      this.ops.push(`${fill ? cor(fill) + " rg " : ""}${stroke ? cor(stroke) + " RG 0.75 w " : ""}${f(x)} ${f(H - y - h)} ${f(w)} ${f(h)} re ${op}`);
    }
    txt(x, y, size, bold, color, s) {
      this.ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${cor(color)} rg ${f(x)} ${f(H - y)} Td (${enc(s)}) Tj ET`);
    }
    centro(y, size, bold, color, s, x0 = 0, w = W) { this.txt(x0 + (w - largura(s, size, bold)) / 2, y, size, bold, color, s); }
    direita(xd, y, size, bold, color, s) { this.txt(xd - largura(s, size, bold), y, size, bold, color, s); }
    img(nome, x, y, w, h) { this.imgs.add(nome); this.ops.push(`q ${f(w)} 0 0 ${f(h)} ${f(x)} ${f(H - y - h)} cm /${nome} Do Q`); }
    link(x, y, w, h, url) { this.links.push([x, H - y - h, x + w, H - y, url]); }
  }

  /* ---------- Fotos ---------- */
  const cacheFotos = new Map(); // url -> {w,h,bytes} | null
  async function canvasJPG(c, q) {
    const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", q));
    return { w: c.width, h: c.height, bytes: new Uint8Array(await blob.arrayBuffer()) };
  }
  // Foto quadrada em fundo branco, reduzida (360 px ≈ 200 dpi no tamanho do card)
  async function foto(url) {
    if (cacheFotos.has(url)) return cacheFotos.get(url);
    let out = null;
    try {
      const r = await fetch(url);
      if (r.ok) {
        const bmp = await createImageBitmap(await r.blob());
        const L = 360, c = document.createElement("canvas");
        c.width = c.height = L;
        const g = c.getContext("2d");
        g.fillStyle = "#fff"; g.fillRect(0, 0, L, L);
        const k = Math.min(L / bmp.width, L / bmp.height);
        g.drawImage(bmp, (L - bmp.width * k) / 2, (L - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
        out = await canvasJPG(c, 0.8);
      }
    } catch {}
    cacheFotos.set(url, out);
    return out;
  }
  async function logo(url) {
    try {
      const bmp = await createImageBitmap(await (await fetch(url)).blob());
      const c = document.createElement("canvas");
      c.width = bmp.width * 2; c.height = bmp.height * 2;
      const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(bmp, 0, 0, c.width, c.height);
      return await canvasJPG(c, 0.92);
    } catch { return null; }
  }

  /* ---------- Montagem do arquivo PDF ---------- */
  const bytesDe = (s) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
  async function comprimir(bytes) {
    if (typeof CompressionStream === "undefined") return { bytes, flate: false };
    const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
    return { bytes: new Uint8Array(await new Response(cs).arrayBuffer()), flate: true };
  }
  const utf16 = (s) => "<FEFF" + [...String(s)].map((ch) => { const c = ch.codePointAt(0); return c > 0xffff ? "003F" : c.toString(16).padStart(4, "0").toUpperCase(); }).join("") + ">";

  async function escrever(paginas, imagens, titulo) {
    const objs = [];
    const novo = (v = null) => { objs.push(v); return objs.length; };
    const idCat = novo(), idPages = novo();
    const idF1 = novo("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const idF2 = novo("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const idInfo = novo(`<< /Title ${utf16(titulo)} /Producer (Rota Importados) /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}) >>`);
    const idImg = new Map();
    for (const [nome, im] of imagens) {
      idImg.set(nome, novo({ dict: `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>`, bytes: im.bytes }));
    }
    const kids = paginas.map(() => novo()); // reservados antes, para os links internos (índice) apontarem para a página
    for (const [i, p] of paginas.entries()) {
      const c = await comprimir(bytesDe(p.ops.join("\n")));
      const idC = novo({ dict: `<< /Length ${c.bytes.length}${c.flate ? " /Filter /FlateDecode" : ""} >>`, bytes: c.bytes });
      const annots = p.links.map((l) => novo(`<< /Type /Annot /Subtype /Link /Rect [${l.slice(0, 4).map(f).join(" ")}] /Border [0 0 0] ${
        typeof l[4] === "number" ? `/Dest [${kids[l[4] - 1]} 0 R /XYZ null null null]` : `/A << /S /URI /URI (${enc(encodeURI(l[4]))}) >>`} >>`));
      const xo = [...p.imgs].map((n) => `/${n} ${idImg.get(n)} 0 R`).join(" ");
      objs[kids[i] - 1] = `<< /Type /Page /Parent ${idPages} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${idF1} 0 R /F2 ${idF2} 0 R >>${xo ? ` /XObject << ${xo} >>` : ""} >> /Contents ${idC} 0 R${annots.length ? ` /Annots [${annots.map((a) => a + " 0 R").join(" ")}]` : ""} >>`;
    }
    objs[idPages - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + " 0 R").join(" ")}] /Count ${kids.length} >>`;
    objs[idCat - 1] = `<< /Type /Catalog /Pages ${idPages} 0 R >>`;

    const partes = [bytesDe("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")];
    let pos = partes[0].length;
    const offsets = [];
    const add = (b) => { partes.push(b); pos += b.length; };
    objs.forEach((o, i) => {
      offsets.push(pos);
      if (typeof o === "string") add(bytesDe(`${i + 1} 0 obj\n${o}\nendobj\n`));
      else { add(bytesDe(`${i + 1} 0 obj\n${o.dict}\nstream\n`)); add(o.bytes); add(bytesDe("\nendstream\nendobj\n")); }
    });
    const xref = pos;
    add(bytesDe(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objs.length + 1} /Root ${idCat} 0 R /Info ${idInfo} 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
    return new Blob(partes, { type: "application/pdf" });
  }

  /* ---------- Layout do catálogo ---------- */
  // opts: { titulo, grupos: [{ nome, produtos: [{ nome, marca, sku, preco, precoNota, precoSub, esgotado, ultimas, foto, url }] }],
  //         loja: { nome, whatsapp, site, aviso }, logo, onProgresso(fração, texto) }
  async function gerar(opts) {
    const prog = opts.onProgresso || (() => {});
    const imagens = new Map();
    const nomeImg = new Map(); // url -> nome do recurso
    const todos = opts.grupos.flatMap((g) => g.produtos);
    const urls = [...new Set(todos.map((p) => p.foto).filter(Boolean))];

    // Prepara as fotos em paralelo (6 por vez)
    let feitas = 0;
    const fila = [...urls];
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (fila.length) {
        const u = fila.shift();
        const im = await foto(u);
        if (im) { const n = "Im" + (imagens.size + 1); imagens.set(n, im); nomeImg.set(u, n); }
        prog((++feitas / Math.max(1, urls.length)) * 0.9, `Preparando fotos… ${feitas} de ${urls.length}`);
      }
    }));
    const lg = opts.logo ? await logo(opts.logo) : null;
    if (lg) imagens.set("Logo", lg);
    prog(0.92, "Montando páginas…");

    const L = opts.loja;
    const data = new Date().toLocaleDateString("pt-BR");
    const CW = (W - 2 * M - 2 * 12) / 3, CH = 226, TOPO = 78, LIM = H - 40, SUBH = 22;

    // 1) Planeja as páginas de produtos: cada departamento começa numa página nova; dentro dele,
    //    cada subcategoria ganha uma faixa de título e começa numa linha nova
    const plano = []; // [{ grupo, itens: [{ tipo: "sub"|"card", ... }], cont }]
    const indice = []; // [{ nome, n, pg, sub? }] (pg = índice na lista de páginas de produtos, ajustado depois)
    for (const g of opts.grupos) {
      const subs = [];
      for (const p of g.produtos) { const nome = p.sub || ""; const u = subs[subs.length - 1]; if (u && u.nome === nome) u.produtos.push(p); else subs.push({ nome, produtos: [p] }); }
      const comSubs = subs.length > 1 || (subs[0] && subs[0].nome && subs[0].nome !== "Sem subcategoria");
      let pg = null, y = 0;
      const nova = () => { pg = { grupo: g, itens: [], cont: plano.some((x) => x.grupo === g) }; plano.push(pg); y = TOPO; };
      nova();
      indice.push({ nome: g.nome, n: g.produtos.length, pg: plano.length - 1 });
      for (const sb of subs) {
        if (comSubs) {
          if (pg.itens.length) nova(); // cada subcategoria começa numa página nova (fica bem tabulado)
          pg.itens.push({ tipo: "sub", nome: sb.nome || "Outros", n: sb.produtos.length, y });
          indice.push({ nome: sb.nome || "Outros", n: sb.produtos.length, pg: plano.length - 1, sub: true });
          y += SUBH;
        }
        for (let i = 0; i < sb.produtos.length; i += 3) {
          if (y + CH > LIM) {
            nova();
            if (comSubs) { pg.itens.push({ tipo: "sub", nome: (sb.nome || "Outros") + " (continuação)", y }); y += SUBH; }
          }
          sb.produtos.slice(i, i + 3).forEach((p, k) => pg.itens.push({ tipo: "card", p, x: M + k * (CW + 12), y }));
          y += CH + 10;
        }
      }
    }

    // 2) Capa com departamentos e subcategorias selecionados (clicáveis). Se não couber, continua numa
    //    página no mesmo estilo da capa. Escolhe colunas (1 a 3) e altura de linha para caber.
    const temLista = indice.length > 1;
    const LISTA_Y = 468, LISTA_FIM = 752, CONT_Y = 110;
    function arranjo(n, altura) {
      for (let lh = 16; lh >= 10; lh--) for (const cols of [1, 2, 3]) if (Math.ceil(n / cols) * lh <= altura) return { cols, lh, cabem: n };
      return { cols: 3, lh: 10, cabem: Math.floor(altura / 10) * 3 };
    }
    const blocos = []; // [{ itens, cols, lh, y0 }] — o 1º na capa, os demais em páginas de continuação
    if (temLista) {
      let resto = indice, y0 = LISTA_Y;
      while (resto.length) {
        const a = arranjo(resto.length, LISTA_FIM - y0);
        blocos.push({ itens: resto.slice(0, a.cabem), cols: a.cols, lh: a.lh, y0 });
        resto = resto.slice(a.cabem);
        y0 = CONT_Y;
      }
    }
    const nCont = Math.max(0, blocos.length - 1);
    const primeira = 2 + nCont; // página da 1ª página de produtos
    const total = 1 + nCont + plano.length;
    const paginas = [];
    const rodape = (pg, num) => {
      pg.ret(M, H - 34, W - 2 * M, 0.75, COR.line);
      pg.txt(M, H - 20, 7.5, false, COR.muted, quebrar([L.whatsapp && "WhatsApp " + L.whatsapp, L.aviso].filter(Boolean).join(" · "), 7.5, false, W - 2 * M - 70, 1)[0] || "");
      pg.direita(W - M, H - 20, 7.5, true, COR.muted, `${num} / ${total}`);
    };
    const cabecalho = (pg) => {
      pg.ret(0, 0, W, 40, COR.navy);
      pg.txt(M, 25, 12, true, COR.white, L.nome || "Catálogo");
      pg.direita(W - M, 25, 9, false, "#CFD9EC", quebrar(opts.titulo, 9, false, 260, 1)[0]);
    };
    function lista(pg, b, titulo) {
      const gap = 14, larg = b.cols === 1 ? 360 : b.cols === 2 ? 254 : (W - 2 * M - 2 * gap) / 3;
      const x0 = (W - larg * b.cols - (b.cols - 1) * gap) / 2, porCol = Math.ceil(b.itens.length / b.cols);
      const fs = Math.min(9.5, b.lh * 0.64);
      pg.txt(x0, b.y0 - 23, 11, true, COR.orange, titulo);
      b.itens.forEach((it, i) => {
        const col = Math.floor(i / porCol), x = x0 + col * (larg + gap), y = b.y0 + (i % porCol) * b.lh;
        const xi = it.sub ? x + 10 : x, pag = primeira + it.pg;
        pg.txt(xi, y, it.sub ? fs - 0.5 : fs, !it.sub, it.sub ? "#CFD9EC" : COR.white, quebrar(`${it.nome} (${it.n})`, it.sub ? fs - 0.5 : fs, !it.sub, larg - (xi - x) - 26, 1)[0]);
        pg.direita(x + larg, y, it.sub ? fs - 0.5 : fs, !it.sub, it.sub ? "#CFD9EC" : COR.white, String(pag));
        pg.link(x, y - b.lh + 3, larg, b.lh, pag);
      });
    }

    // Capa
    const capa = new Pagina();
    capa.ret(0, 0, W, H, COR.navy);
    capa.ret(0, H - 8, W, 8, COR.orange);
    // Logo sobre cartão branco (o azul-escuro do logo some no fundo da capa)
    if (lg) { const lw = 180, lh = (lg.h / lg.w) * lw; capa.ret((W - lw - 36) / 2, 92, lw + 36, lh + 28, COR.white); capa.img("Logo", (W - lw) / 2, 106, lw, lh); }
    capa.centro(340, 30, true, COR.white, "Catálogo de produtos");
    capa.centro(370, 15, false, COR.sky, opts.titulo);
    capa.centro(396, 10, false, "#CFD9EC", `Atualizado em ${data} · ${todos.length.toLocaleString("pt-BR")} produtos`);
    if (blocos.length) lista(capa, blocos[0], "DEPARTAMENTOS");
    if (L.whatsapp) {
      capa.centro(770, 10, false, "#CFD9EC", "Pedidos e informações pelo WhatsApp");
      capa.centro(790, 15, true, COR.orange, L.whatsapp);
    }
    if (L.site) capa.centro(808, 9, false, "#CFD9EC", L.site);
    paginas.push(capa);
    blocos.slice(1).forEach((b) => {
      const pg = new Pagina();
      pg.ret(0, 0, W, H, COR.navy);
      pg.ret(0, H - 8, W, 8, COR.orange);
      lista(pg, b, "DEPARTAMENTOS (continuação)");
      paginas.push(pg);
    });

    // 3) Páginas de produtos
    plano.forEach((pl, idx) => {
      const pg = new Pagina(), g = pl.grupo;
      cabecalho(pg);
      pg.txt(M, 64, 15, true, COR.navy, quebrar(g.nome, 15, true, 380, 1)[0]);
      pg.direita(W - M, 64, 9, false, COR.muted, pl.cont ? "continuação" : `${g.produtos.length} produto${g.produtos.length === 1 ? "" : "s"}`);
      rodape(pg, primeira + idx);
      for (const it of pl.itens) {
        if (it.tipo === "sub") {
          pg.ret(M, it.y, W - 2 * M, SUBH - 6, COR.navy);
          pg.ret(M, it.y, 4, SUBH - 6, COR.orange);
          pg.txt(M + 12, it.y + 11.5, 9.5, true, COR.white, quebrar(it.nome, 9.5, true, W - 2 * M - 90, 1)[0]);
          if (it.n) pg.direita(W - M - 8, it.y + 11.5, 8, false, "#CFD9EC", `${it.n} produto${it.n === 1 ? "" : "s"}`);
          continue;
        }
        const { p, x, y } = it;
        pg.ret(x, y, CW, CH, COR.white, COR.line);
        const s = 124, ix = x + (CW - s) / 2, iy = y + 10;
        const im = p.foto && nomeImg.get(p.foto);
        if (im) pg.img(im, ix, iy, s, s);
        else { pg.ret(ix, iy, s, s, COR.bg); pg.centro(iy + s / 2 + 14, 40, true, "#9DB5DD", limpar(p.nome).charAt(0).toUpperCase() || "?", ix, s); }
        if (p.esgotado || p.ultimas || p.oferta) {
          const t = p.esgotado ? "ESGOTADO" : p.ultimas ? "ÚLTIMAS UNIDADES" : "OFERTA";
          const bw = largura(t, 6.5, true) + 10;
          pg.ret(x + 6, y + 6, bw, 13, p.esgotado ? COR.err : COR.orange);
          pg.txt(x + 11, y + 15.5, 6.5, true, p.esgotado ? COR.white : COR.navy, t);
        }
        const linhas = quebrar(p.nome, 9, true, CW - 16, 3);
        linhas.forEach((ln, j) => pg.txt(x + 8, y + 148 + j * 11, 9, true, COR.text, ln));
        const meta = [p.marca, p.sku && "Cód. " + p.sku].filter(Boolean).join(" · ");
        if (meta) pg.txt(x + 8, y + 148 + linhas.length * 11 + 1, 7, false, COR.muted, quebrar(meta, 7, false, CW - 16, 1)[0]);
        if (p.preco) {
          // Até 2 linhas de preços extras (ex.: varejo e cartão); com 2, o preço principal sobe um pouco
          const subs = p.precoSub ? p.precoSub.split(" · ").slice(0, 2).map((t) => quebrar(t, 6.8, false, CW - 16, 1)[0]) : [];
          const yp = subs.length > 1 ? y + 198 : y + 204;
          pg.txt(x + 8, yp, 12, true, p.esgotado ? COR.muted : COR.royal, p.preco);
          if (p.precoNota) pg.txt(x + 11 + largura(p.preco, 12, true), yp, 7, false, COR.muted, p.precoNota);
          subs.forEach((ln, j) => pg.txt(x + 8, yp + 12 + j * 9, 6.8, false, COR.muted, ln));
        } else if (p.preco === "") {
          pg.txt(x + 8, y + 204, 10, true, COR.muted, "Sob consulta");
        }
        if (p.url) pg.link(x, y, CW, CH, p.url);
      }
      paginas.push(pg);
    });
    const blob = await escrever(paginas, imagens, `${L.nome || "Catálogo"} · ${opts.titulo}`);
    prog(1, "Pronto");
    return { blob, paginas: paginas.length };
  }

  /* ---------- PDF de um pedido (aba Pedidos do painel) ---------- */
  // opts: { loja: { nome, whatsapp, site }, logo, numero, data, cliente: [linhas], itens: [{ q, nome, unit, total }],
  //         totais: [[rótulo, valor, destaque?]], notas: [linhas] } — valores já formatados pelo painel
  async function pedido(opts) {
    const imagens = new Map();
    const lg = opts.logo ? await logo(opts.logo) : null;
    if (lg) imagens.set("Logo", lg);
    const L = opts.loja || {};
    const paginas = [];
    let pg, y;
    const X = { q: M, nome: M + 40, unit: W - M - 95, total: W - M };
    const larguraNome = X.unit - 70 - X.nome;
    function cabecalhoTabela() {
      pg.ret(M, y - 13, W - 2 * M, 20, "#EEF4FF");
      pg.txt(X.q + 4, y, 8.5, true, COR.navy, "QTD");
      pg.txt(X.nome, y, 8.5, true, COR.navy, "PRODUTO");
      pg.direita(X.unit, y, 8.5, true, COR.navy, "UNITÁRIO");
      pg.direita(X.total - 4, y, 8.5, true, COR.navy, "TOTAL");
      y += 22;
    }
    function novaPagina(continuacao) {
      pg = new Pagina();
      paginas.push(pg);
      pg.ret(0, 0, W, 78, COR.navy);
      if (lg) { const lh = 46, lw = (lg.w / lg.h) * lh; pg.ret(M - 6, 16, lw + 12, lh + 0, COR.white); pg.img("Logo", M, 16, lw, lh); }
      pg.txt(M + 100, 38, 15, true, COR.white, L.nome || "Pedido");
      if (L.whatsapp) pg.txt(M + 100, 54, 8.5, false, "#CFD9EC", "WhatsApp " + L.whatsapp + (L.site ? " · " + L.site : ""));
      pg.direita(W - M, 38, 15, true, COR.white, `Pedido #${opts.numero}`);
      pg.direita(W - M, 54, 8.5, false, "#CFD9EC", opts.data || "");
      pg.ret(0, 78, W, 3, COR.orange);
      y = 110;
      if (continuacao) { pg.txt(M, y, 9, false, COR.muted, "(continuação)"); y += 22; cabecalhoTabela(); }
    }
    novaPagina(false);

    // Cliente
    pg.txt(M, y, 8.5, true, COR.orange, "CLIENTE");
    y += 15;
    (opts.cliente || []).forEach((linha, i) => {
      quebrar(linha, i ? 9.5 : 11, !i, W - 2 * M, 3).forEach((l) => { pg.txt(M, y, i ? 9.5 : 11, !i, COR.text, l); y += i ? 13 : 15; });
    });
    y += 14;

    // Itens
    cabecalhoTabela();
    for (const it of opts.itens || []) {
      const linhas = quebrar(it.nome, 9.5, false, larguraNome, 4);
      if (y + linhas.length * 12 > H - 150) novaPagina(true);
      pg.txt(X.q + 4, y, 9.5, true, COR.text, String(it.q));
      linhas.forEach((l, k) => pg.txt(X.nome, y + k * 12, 9.5, false, COR.text, l));
      pg.direita(X.unit, y, 9.5, false, COR.muted, it.unit);
      pg.direita(X.total - 4, y, 9.5, true, COR.text, it.total);
      y += linhas.length * 12 + 6;
      pg.ret(M, y - 4, W - 2 * M, 0.5, COR.line);
      y += 6;
    }

    // Totais
    if (y > H - 170) novaPagina(true);
    y += 8;
    for (const [rot, val, forte] of opts.totais || []) {
      pg.direita(X.unit, y, forte ? 11 : 9.5, !!forte, forte ? COR.navy : COR.muted, rot);
      pg.direita(X.total - 4, y, forte ? 13 : 9.5, !!forte, forte ? COR.royal : COR.text, val);
      y += forte ? 20 : 15;
    }
    y += 6;
    for (const n of opts.notas || []) {
      quebrar(n, 9, false, W - 2 * M, 3).forEach((l) => { if (y > H - 50) novaPagina(true); pg.txt(M, y, 9, false, COR.muted, l); y += 12; });
    }
    // Rodapé com número de página
    paginas.forEach((p, i) => {
      p.ret(M, H - 34, W - 2 * M, 0.75, COR.line);
      p.txt(M, H - 20, 7.5, false, COR.muted, `${L.nome || ""} · Pedido #${opts.numero}`);
      p.direita(W - M, H - 20, 7.5, true, COR.muted, `${i + 1} / ${paginas.length}`);
    });
    return escrever(paginas, imagens, `${L.nome || "Pedido"} · Pedido #${opts.numero}`);
  }

  window.CatalogoPDF = { gerar, pedido };
})();
