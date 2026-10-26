(async () => {
  const S = window.STORE;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "outros";
  const money = (v, cur) => v.toLocaleString("pt-BR", { style: "currency", currency: cur });

  // Imagem reserva caso o link falhe ou o produto não tenha foto
  const fallback = (nome) =>
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2a36"/><stop offset="1" stop-color="#16161e"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><text x="200" y="225" font-family="Arial" font-weight="700" font-size="120" text-anchor="middle" fill="#f5b642">${esc(String(nome).charAt(0))}</text></svg>`
    );
  window.__imgErr = (img) => { img.onerror = null; img.src = fallback(img.alt || "R"); };

  /* ---------- Dados: loja.json do Catálogo Pro, ou produtos do config.js ---------- */
  // MOEDA: moeda exibida. Se a base estiver em US$ e houver cotação, converte para R$.
  let PRODUTOS, CATS, MOEDA = "BRL", COTACAO = null;

  async function carregarLoja() {
    try {
      const r = await fetch("data/loja.json", { cache: "no-cache" });
      if (!r.ok) return null;
      const d = await r.json();
      return d && d.type === "catalogo-pro-site" && Array.isArray(d.products) ? d : null;
    } catch {
      return null;
    }
  }

  const loja = await carregarLoja();
  if (loja) {
    const base = (loja.currency || "USD").toUpperCase();
    const rates = loja.rates || {};
    const pix = rates.pix && rates.pix.rate > 0 ? rates.pix : null;
    const efetivo = rates.efetivo && rates.efetivo.rate > 0 ? rates.efetivo : null;
    const principal = base === "USD" ? pix || efetivo : null;
    MOEDA = principal ? "BRL" : base;
    COTACAO = base === "USD" && (pix || efetivo) ? { pix, efetivo, principal: principal === pix ? "pix" : "efetivo" } : null;

    const recente = Date.now() - 30 * 864e5;
    PRODUTOS = loja.products
      .filter((p) => p.active !== false && p.name)
      .map((p, i) => {
        const usd = typeof p.price === "number" && p.price > 0 ? p.price : null;
        const preco = usd == null ? null : principal ? Math.round(usd * principal.rate * 100) / 100 : usd;
        const tags = String(p.tags || "").split(/[,;|]/).map((t) => t.trim()).filter(Boolean);
        const novo = p.added && Date.parse(p.added) > recente;
        return {
          id: String(p.sku || slug(p.name) + "-" + i),
          sku: p.sku || "",
          nome: p.name,
          categoria: slug(p.sector || "Outros"),
          setor: p.sector || "Outros",
          marca: p.brand || "",
          tipo: p.tipo || "",
          notas: p.notes || "",
          volume: p.volume,
          estoque: typeof p.stock === "number" ? p.stock : null,
          descricao: p.description || "",
          preco,
          usd: base === "USD" ? usd : null,
          tag: tags[0] || (novo ? "Novo" : ""),
          imagens: (p.photos || []).map((id) => `data/fotos/${encodeURIComponent(id)}.jpg`),
        };
      });

    const usados = new Set(PRODUTOS.map((p) => p.categoria));
    const vistos = new Set();
    CATS = (loja.sectors || [])
      .map((s) => ({ id: slug(s.name), nome: s.name }))
      .concat(PRODUTOS.map((p) => ({ id: p.categoria, nome: p.setor })))
      .filter((c) => usados.has(c.id) && !vistos.has(c.id) && vistos.add(c.id));

    const b = loja.brand || {};
    if (String(b.whatsapp || "").replace(/\D/g, "").length >= 10) S.whatsapp = String(b.whatsapp).replace(/\D/g, "");
    if (b.slogan) S.slogan = b.slogan;
  } else {
    PRODUTOS = window.PRODUTOS;
    CATS = window.CATEGORIAS;
  }

  const fmt = (v) => money(v, MOEDA);
  const catName = (id) => (CATS.find((c) => c.id === id) || {}).nome || "";
  const byId = (id) => PRODUTOS.find((p) => p.id === id);
  const foto = (p) => p.imagens[0] || fallback(p.nome);
  const esgotado = (p) => p.estoque === 0;
  const waLink = (text) => `https://wa.me/${S.whatsapp}${text ? "?text=" + encodeURIComponent(text) : ""}`;
  const skuTxt = (p) => (p.sku ? ` [${p.sku}]` : "");

  /* ---------- Textos gerais ---------- */
  $("#heroSlogan").textContent = S.slogan;
  $("#footerInfo").textContent = `${S.slogan} · ${S.horario}`;
  $("#year").textContent = new Date().getFullYear();
  $("#footerInsta").href = S.instagram;
  const hello = `Olá, ${S.nome}! Vim pelo catálogo e gostaria de mais informações.`;
  ["#heroWhats", "#floatWhats", "#footerWhats", "#emptyWhats"].forEach((s) => {
    const a = $(s);
    a.href = waLink(hello);
    a.target = "_blank";
    a.rel = "noopener";
  });

  // Fotos do topo: usa os primeiros produtos com foto
  const comFoto = PRODUTOS.filter((p) => p.imagens.length).slice(0, 3);
  if (loja && comFoto.length === 3) {
    document.querySelectorAll(".hero__card img").forEach((img, i) => { img.src = comFoto[i].imagens[0]; img.onerror = () => window.__imgErr(img); });
  }

  if (COTACAO) {
    const c = COTACAO, partes = [];
    if (c.pix) partes.push(`Pix: US$ 1 = ${money(c.pix.rate, "BRL")}`);
    if (c.efetivo) partes.push(`Dinheiro: US$ 1 = ${money(c.efetivo.rate, "BRL")}`);
    const quando = (c.pix || c.efetivo).date;
    $("#rates").innerHTML = `💱 Cotação ${quando ? "de " + esc(new Date(quando + (quando.length === 10 ? "T12:00" : "")).toLocaleDateString("pt-BR")) : "do dia"} · ${partes.map(esc).join(" · ")}`;
    $("#rates").hidden = false;
  }

  /* ---------- Filtros ---------- */
  const PAGE = 24;
  let state = { cat: "todos", marca: "", q: "", sort: "destaque", limite: PAGE };

  $("#chips").innerHTML = [{ id: "todos", nome: "Todos" }, ...CATS]
    .map((c) => `<button class="chip${c.id === "todos" ? " active" : ""}" data-cat="${esc(c.id)}" role="tab">${esc(c.nome)}</button>`)
    .join("");
  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === b));
    state.cat = b.dataset.cat;
    state.limite = PAGE;
    render();
  });

  const marcas = [...new Set(PRODUTOS.map((p) => p.marca).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (marcas.length > 1) {
    $("#brand").innerHTML = `<option value="">Todas as marcas</option>` + marcas.map((m) => `<option>${esc(m)}</option>`).join("");
    $("#brand").hidden = false;
    $("#brand").addEventListener("change", (e) => { state.marca = e.target.value; state.limite = PAGE; render(); });
  }

  $("#search").addEventListener("input", (e) => {
    state.q = e.target.value.trim();
    state.limite = PAGE;
    render();
    if (state.q) $("#catalogo").scrollIntoView({ behavior: "smooth" });
  });
  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
  $("#more").addEventListener("click", () => { state.limite += PAGE; render(); });

  function filtered() {
    const q = norm(state.q);
    let list = PRODUTOS.filter(
      (p) =>
        (state.cat === "todos" || p.categoria === state.cat) &&
        (!state.marca || p.marca === state.marca) &&
        (!q || norm(`${p.nome} ${p.marca} ${p.sku} ${p.tipo} ${p.descricao} ${catName(p.categoria)}`).includes(q))
    );
    const price = (p) => (p.preco == null ? Infinity : p.preco);
    if (state.sort === "menor") list = [...list].sort((a, b) => price(a) - price(b));
    if (state.sort === "maior") list = [...list].sort((a, b) => (b.preco ?? -1) - (a.preco ?? -1));
    if (state.sort === "nome") list = [...list].sort((a, b) => a.nome.localeCompare(b.nome));
    // esgotados sempre por último
    return [...list].sort((a, b) => esgotado(a) - esgotado(b));
  }

  function priceHTML(p) {
    if (p.preco == null) return `<div class="price"><b>Sob consulta</b></div>`;
    let h = `<div class="price"><b>${fmt(p.preco)}</b>${p.precoAntigo ? `<s>${fmt(p.precoAntigo)}</s>` : ""}${COTACAO && COTACAO.principal === "pix" ? "<small>no Pix</small>" : ""}</div>`;
    if (p.usd != null && COTACAO) {
      const extra = [money(p.usd, "USD")];
      if (COTACAO.principal === "pix" && COTACAO.efetivo) extra.push(`${money(Math.round(p.usd * COTACAO.efetivo.rate * 100) / 100, "BRL")} em dinheiro`);
      h += `<div class="price-alt">${extra.map(esc).join(" · ")}</div>`;
    }
    return h;
  }

  const off = (p) => (p.preco && p.precoAntigo ? Math.round((1 - p.preco / p.precoAntigo) * 100) : 0);
  const meta = (p) => [p.marca, p.volume ? `${p.volume} ml` : ""].filter(Boolean).join(" · ") || catName(p.categoria);

  function render() {
    const all = filtered();
    const list = all.slice(0, state.limite);
    $("#resultInfo").textContent = `${all.length} produto${all.length === 1 ? "" : "s"}`;
    $("#empty").hidden = all.length > 0;
    $("#more").hidden = all.length <= state.limite;
    $("#grid").innerHTML = list
      .map(
        (p, i) => `
      <article class="card${esgotado(p) ? " card--out" : ""}" style="animation-delay:${Math.min(i % PAGE, 12) * 40}ms">
        <div class="card__media" data-open="${esc(p.id)}">
          <img src="${esc(foto(p))}" alt="${esc(p.nome)}" loading="lazy" onerror="__imgErr(this)" />
          ${esgotado(p) ? `<span class="badge badge--out">Esgotado</span>` : p.tag ? `<span class="badge">${esc(p.tag)}</span>` : ""}
          ${off(p) ? `<span class="badge badge--off">-${off(p)}%</span>` : ""}
        </div>
        <div class="card__body">
          <span class="card__cat">${esc(meta(p))}</span>
          <h3 class="card__name" data-open="${esc(p.id)}">${esc(p.nome)}</h3>
          ${priceHTML(p)}
          <div class="card__actions">
            ${esgotado(p)
              ? `<a class="btn btn--ghost btn--wide" href="${waLink(`Olá! O produto *${p.nome}*${skuTxt(p)} vai voltar ao estoque?`)}" target="_blank" rel="noopener">Avise-me</a>`
              : `<button class="btn btn--primary" data-add="${esc(p.id)}">Adicionar</button>
            <a class="btn btn--ghost" href="${waLink(`Olá! Tenho interesse no produto: *${p.nome}*${skuTxt(p)}`)}" target="_blank" rel="noopener" aria-label="Perguntar no WhatsApp">
              <svg viewBox="0 0 24 24"><use href="#ico-whats"/></svg>
            </a>`}
          </div>
        </div>
      </article>`
      )
      .join("");
  }

  $("#grid").addEventListener("click", (e) => {
    const open = e.target.closest("[data-open]");
    const add = e.target.closest("[data-add]");
    if (add) {
      const p = byId(add.dataset.add);
      if (p.variacoes && p.variacoes.length > 1) openModal(p.id);
      else addToCart(p.id, (p.variacoes || [])[0] || "", 1);
    } else if (open) openModal(open.dataset.open);
  });

  /* ---------- Overlay / modal / drawer ---------- */
  const overlay = $("#overlay"), modal = $("#modal"), drawer = $("#drawer");
  function closeAll() {
    [overlay, modal, drawer].forEach((el) => (el.hidden = true));
    document.body.style.overflow = "";
  }
  function show(el) {
    closeAll();
    overlay.hidden = false;
    el.hidden = false;
    document.body.style.overflow = "hidden";
  }
  overlay.addEventListener("click", closeAll);
  document.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeAll(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAll(); });

  function openModal(id) {
    const p = byId(id);
    const imgs = p.imagens.length ? p.imagens : [fallback(p.nome)];
    const out = esgotado(p);
    let v = (p.variacoes || [])[0] || "", q = 1;
    const specs = [
      ["Marca", p.marca],
      ["Código", p.sku],
      ["Tipo", p.tipo],
      ["Volume", p.volume ? `${p.volume} ml` : ""],
      ["Notas", p.notas],
      ["Estoque", p.estoque == null ? "" : out ? "Esgotado" : p.estoque <= 3 ? `Últimas ${p.estoque} unidades` : "Disponível"],
    ].filter((s) => s[1]);
    $("#modalBody").innerHTML = `
      <div>
        <div class="modal__media"><img id="mImg" src="${esc(imgs[0])}" alt="${esc(p.nome)}" onerror="__imgErr(this)" /></div>
        ${imgs.length > 1 ? `<div class="modal__thumbs">${imgs.map((src, i) => `<img src="${esc(src)}" alt="${esc(p.nome)}" class="${i ? "" : "active"}" onerror="__imgErr(this)" />`).join("")}</div>` : ""}
      </div>
      <div class="modal__info">
        <span class="card__cat">${esc(catName(p.categoria))}${p.tag ? " · " + esc(p.tag) : ""}</span>
        <h3 id="modalTitle">${esc(p.nome)}</h3>
        ${priceHTML(p)}
        ${p.preco && !COTACAO ? `<small class="muted">Pix ou cartão — combine as condições no WhatsApp</small>` : ""}
        ${p.descricao ? `<p>${esc(p.descricao)}</p>` : ""}
        ${specs.length ? `<dl class="specs">${specs.map(([k, val]) => `<dt>${k}</dt><dd>${esc(val)}</dd>`).join("")}</dl>` : ""}
        ${p.variacoes && p.variacoes.length ? `<span class="label">Opção</span><div class="opts">${p.variacoes.map((o, i) => `<button class="opt${i ? "" : " active"}" data-v="${esc(o)}">${esc(o)}</button>`).join("")}</div>` : ""}
        ${out ? "" : `<span class="label">Quantidade</span>
        <div class="qty"><button data-q="-1" aria-label="Diminuir">−</button><span id="mQty">1</span><button data-q="1" aria-label="Aumentar">+</button></div>`}
        <div class="modal__btns">
          ${out ? "" : `<button class="btn btn--primary btn--block" id="mAdd">Adicionar ao carrinho</button>`}
          <a class="btn btn--whats btn--block" id="mBuy" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><use href="#ico-whats"/></svg>${out ? "Avise-me quando chegar" : "Comprar agora no WhatsApp"}</a>
        </div>
      </div>`;
    const updBuy = () => {
      $("#mBuy").href = waLink(
        out
          ? `Olá! O produto *${p.nome}*${skuTxt(p)} vai voltar ao estoque?`
          : `Olá, ${S.nome}! Quero comprar:\n\n• ${q}x *${p.nome}*${v ? ` (${v})` : ""}${skuTxt(p)}${p.preco ? ` — ${fmt(p.preco * q)}` : ""}\n\nPodemos combinar pagamento e entrega?`
      );
    };
    updBuy();
    $("#modalBody").onclick = (e) => {
      const o = e.target.closest(".opt");
      const qb = e.target.closest("[data-q]");
      const th = e.target.closest(".modal__thumbs img");
      if (o) {
        v = o.dataset.v;
        document.querySelectorAll(".opt").forEach((x) => x.classList.toggle("active", x === o));
      }
      if (qb) {
        q = Math.max(1, q + Number(qb.dataset.q));
        if (p.estoque > 0) q = Math.min(q, p.estoque);
        $("#mQty").textContent = q;
      }
      if (th) {
        $("#mImg").src = th.src;
        document.querySelectorAll(".modal__thumbs img").forEach((x) => x.classList.toggle("active", x === th));
      }
      if (e.target.closest("#mAdd")) {
        addToCart(p.id, v, q);
        closeAll();
      }
      updBuy();
    };
    show(modal);
  }

  /* ---------- Carrinho ---------- */
  const KEY = "rota_cart_v1";
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem(KEY)) || []; } catch { cart = []; }
  cart = cart.filter((i) => byId(i.id) && !esgotado(byId(i.id)));
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch {} };

  function addToCart(id, v, q) {
    const p = byId(id);
    const ex = cart.find((i) => i.id === id && i.v === v);
    if (ex) ex.q += q;
    else cart.push({ id, v, q });
    if (p.estoque > 0) cart.forEach((i) => { if (i.id === id) i.q = Math.min(i.q, p.estoque); });
    save();
    renderCart();
    toast(`✓ ${p.nome} adicionado`);
    const b = $("#openCart");
    b.classList.remove("bump");
    void b.offsetWidth;
    b.classList.add("bump");
  }

  const total = () => cart.reduce((s, i) => s + (byId(i.id).preco || 0) * i.q, 0);
  const temConsulta = () => cart.some((i) => byId(i.id).preco == null);

  function renderCart() {
    const count = cart.reduce((s, i) => s + i.q, 0);
    $("#cartCount").textContent = count;
    $("#cartFoot").hidden = !cart.length;
    if (!cart.length) {
      $("#cartItems").innerHTML = `<div class="drawer__empty"><span>🛍️</span><p>Seu carrinho está vazio.</p><button class="btn btn--primary" data-close>Ver produtos</button></div>`;
      return;
    }
    $("#cartItems").innerHTML = cart
      .map((i, idx) => {
        const p = byId(i.id);
        return `<div class="item">
          <img src="${esc(foto(p))}" alt="${esc(p.nome)}" onerror="__imgErr(this)" />
          <div><b>${esc(p.nome)}</b>${i.v ? `<small>${esc(i.v)}</small>` : ""}<small>${p.preco == null ? "Sob consulta" : fmt(p.preco)}</small></div>
          <div class="item__right">
            <div class="qty"><button data-ci="${idx}" data-d="-1" aria-label="Diminuir">−</button><span>${i.q}</span><button data-ci="${idx}" data-d="1" aria-label="Aumentar">+</button></div>
            <button class="item__rm" data-rm="${idx}">Remover</button>
          </div>
        </div>`;
      })
      .join("");
    $("#cartTotal").textContent = fmt(total()) + (temConsulta() ? " +" : "");
    $("#cartNote").textContent = COTACAO && COTACAO.principal === "pix" ? "Valores no Pix. Outras formas de pagamento: combine no WhatsApp." : "";
  }

  $("#cartItems").addEventListener("click", (e) => {
    const d = e.target.closest("[data-d]");
    const rm = e.target.closest("[data-rm]");
    if (d) {
      const it = cart[d.dataset.ci];
      const p = byId(it.id);
      it.q += Number(d.dataset.d);
      if (p.estoque > 0 && it.q > p.estoque) { it.q = p.estoque; toast(`Só temos ${p.estoque} em estoque`); }
      if (it.q < 1) cart.splice(d.dataset.ci, 1);
    }
    if (rm) cart.splice(rm.dataset.rm, 1);
    if (d || rm) { save(); renderCart(); }
  });
  $("#clearCart").addEventListener("click", () => { cart = []; save(); renderCart(); });
  $("#openCart").addEventListener("click", () => show(drawer));

  $("#checkout").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const lines = cart.map((i) => {
      const p = byId(i.id);
      return `• ${i.q}x *${p.nome}*${i.v ? ` (${i.v})` : ""}${skuTxt(p)} — ${p.preco == null ? "sob consulta" : fmt(p.preco * i.q)}`;
    });
    const msg = [
      `🛒 *Novo pedido — ${S.nome}*`,
      "",
      ...lines,
      "",
      `*Total estimado:* ${fmt(total())}${COTACAO && COTACAO.principal === "pix" ? " (Pix)" : ""}${temConsulta() ? " + itens sob consulta" : ""}`,
      "",
      `*Nome:* ${f.get("nome")}`,
      f.get("cidade") ? `*Cidade/Bairro:* ${f.get("cidade")}` : "",
      f.get("obs") ? `*Obs.:* ${f.get("obs")}` : "",
      "",
      "Aguardo confirmação de disponibilidade, pagamento e entrega. Obrigado!",
    ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
    window.open(waLink(msg), "_blank", "noopener");
  });

  /* ---------- Misc ---------- */
  let tt;
  function toast(t) {
    const el = $("#toast");
    el.textContent = t;
    el.classList.add("show");
    clearTimeout(tt);
    tt = setTimeout(() => el.classList.remove("show"), 2200);
  }
  window.addEventListener("scroll", () => $("#header").classList.toggle("scrolled", scrollY > 10), { passive: true });

  render();
  renderCart();
})();
