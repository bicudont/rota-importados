(() => {
  const S = window.STORE;
  const PRODUTOS = window.PRODUTOS;
  const CATS = window.CATEGORIAS;
  const $ = (s, el = document) => el.querySelector(s);

  const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const catName = (id) => (CATS.find((c) => c.id === id) || {}).nome || "";
  const byId = (id) => PRODUTOS.find((p) => p.id === id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Imagem reserva caso o link falhe
  const fallback = (nome) =>
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2a36"/><stop offset="1" stop-color="#16161e"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><text x="200" y="225" font-family="Arial" font-weight="700" font-size="120" text-anchor="middle" fill="#f5b642">${esc(nome.charAt(0))}</text></svg>`
    );
  window.__imgErr = (img) => { img.onerror = null; img.src = fallback(img.alt || "R"); };

  const waLink = (text) => `https://wa.me/${S.whatsapp}${text ? "?text=" + encodeURIComponent(text) : ""}`;

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

  /* ---------- Filtros ---------- */
  let state = { cat: "todos", q: "", sort: "destaque" };

  $("#chips").innerHTML = [{ id: "todos", nome: "Todos" }, ...CATS]
    .map((c) => `<button class="chip${c.id === "todos" ? " active" : ""}" data-cat="${c.id}" role="tab">${esc(c.nome)}</button>`)
    .join("");
  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === b));
    state.cat = b.dataset.cat;
    render();
  });
  $("#search").addEventListener("input", (e) => {
    state.q = e.target.value.trim().toLowerCase();
    render();
    if (state.q) $("#catalogo").scrollIntoView({ behavior: "smooth" });
  });
  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });

  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  function filtered() {
    const q = norm(state.q);
    let list = PRODUTOS.filter(
      (p) =>
        (state.cat === "todos" || p.categoria === state.cat) &&
        (!q || norm(`${p.nome} ${p.descricao || ""} ${catName(p.categoria)}`).includes(q))
    );
    const price = (p) => (p.preco == null ? Infinity : p.preco);
    if (state.sort === "menor") list = [...list].sort((a, b) => price(a) - price(b));
    if (state.sort === "maior") list = [...list].sort((a, b) => (b.preco ?? -1) - (a.preco ?? -1));
    if (state.sort === "nome") list = [...list].sort((a, b) => a.nome.localeCompare(b.nome));
    return list;
  }

  const priceHTML = (p) =>
    p.preco == null
      ? `<div class="price"><b>Sob consulta</b></div>`
      : `<div class="price"><b>${brl(p.preco)}</b>${p.precoAntigo ? `<s>${brl(p.precoAntigo)}</s>` : ""}</div>`;

  const off = (p) => (p.preco && p.precoAntigo ? Math.round((1 - p.preco / p.precoAntigo) * 100) : 0);

  function render() {
    const list = filtered();
    $("#resultInfo").textContent = `${list.length} produto${list.length === 1 ? "" : "s"}`;
    $("#empty").hidden = list.length > 0;
    $("#grid").innerHTML = list
      .map(
        (p, i) => `
      <article class="card" style="animation-delay:${Math.min(i, 12) * 40}ms">
        <div class="card__media" data-open="${p.id}">
          <img src="${esc(p.imagens[0])}" alt="${esc(p.nome)}" loading="lazy" onerror="__imgErr(this)" />
          ${p.tag ? `<span class="badge">${esc(p.tag)}</span>` : ""}
          ${off(p) ? `<span class="badge badge--off">-${off(p)}%</span>` : ""}
        </div>
        <div class="card__body">
          <span class="card__cat">${esc(catName(p.categoria))}</span>
          <h3 class="card__name" data-open="${p.id}">${esc(p.nome)}</h3>
          ${priceHTML(p)}
          <div class="card__actions">
            <button class="btn btn--primary" data-add="${p.id}">Adicionar</button>
            <a class="btn btn--ghost" href="${waLink(`Olá! Tenho interesse no produto: *${p.nome}*`)}" target="_blank" rel="noopener" aria-label="Perguntar no WhatsApp">
              <svg viewBox="0 0 24 24"><use href="#ico-whats"/></svg>
            </a>
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
    let v = (p.variacoes || [])[0] || "", q = 1;
    $("#modalBody").innerHTML = `
      <div>
        <div class="modal__media"><img id="mImg" src="${esc(p.imagens[0])}" alt="${esc(p.nome)}" onerror="__imgErr(this)" /></div>
        ${p.imagens.length > 1 ? `<div class="modal__thumbs">${p.imagens.map((src, i) => `<img src="${esc(src)}" alt="${esc(p.nome)}" class="${i ? "" : "active"}" onerror="__imgErr(this)" />`).join("")}</div>` : ""}
      </div>
      <div class="modal__info">
        <span class="card__cat">${esc(catName(p.categoria))}${p.tag ? " · " + esc(p.tag) : ""}</span>
        <h3 id="modalTitle">${esc(p.nome)}</h3>
        ${priceHTML(p)}
        ${p.preco ? `<small class="muted">Pix ou cartão — combine as condições no WhatsApp</small>` : ""}
        <p>${esc(p.descricao || "")}</p>
        ${p.variacoes && p.variacoes.length ? `<span class="label">Opção</span><div class="opts">${p.variacoes.map((o, i) => `<button class="opt${i ? "" : " active"}" data-v="${esc(o)}">${esc(o)}</button>`).join("")}</div>` : ""}
        <span class="label">Quantidade</span>
        <div class="qty"><button data-q="-1" aria-label="Diminuir">−</button><span id="mQty">1</span><button data-q="1" aria-label="Aumentar">+</button></div>
        <div class="modal__btns">
          <button class="btn btn--primary btn--block" id="mAdd">Adicionar ao carrinho</button>
          <a class="btn btn--whats btn--block" id="mBuy" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><use href="#ico-whats"/></svg>Comprar agora no WhatsApp</a>
        </div>
      </div>`;
    const updBuy = () => {
      $("#mBuy").href = waLink(
        `Olá, ${S.nome}! Quero comprar:\n\n• ${q}x *${p.nome}*${v ? ` (${v})` : ""}${p.preco ? ` — ${brl(p.preco * q)}` : ""}\n\nPodemos combinar pagamento e entrega?`
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
  cart = cart.filter((i) => byId(i.id));
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch {} };

  function addToCart(id, v, q) {
    const ex = cart.find((i) => i.id === id && i.v === v);
    if (ex) ex.q += q;
    else cart.push({ id, v, q });
    save();
    renderCart();
    toast(`✓ ${byId(id).nome} adicionado`);
    const b = $("#openCart");
    b.classList.remove("bump");
    void b.offsetWidth;
    b.classList.add("bump");
  }

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
          <img src="${esc(p.imagens[0])}" alt="${esc(p.nome)}" onerror="__imgErr(this)" />
          <div><b>${esc(p.nome)}</b>${i.v ? `<small>${esc(i.v)}</small>` : ""}<small>${p.preco == null ? "Sob consulta" : brl(p.preco)}</small></div>
          <div class="item__right">
            <div class="qty"><button data-ci="${idx}" data-d="-1" aria-label="Diminuir">−</button><span>${i.q}</span><button data-ci="${idx}" data-d="1" aria-label="Aumentar">+</button></div>
            <button class="item__rm" data-rm="${idx}">Remover</button>
          </div>
        </div>`;
      })
      .join("");
    const total = cart.reduce((s, i) => s + (byId(i.id).preco || 0) * i.q, 0);
    const consulta = cart.some((i) => byId(i.id).preco == null);
    $("#cartTotal").textContent = brl(total) + (consulta ? " +" : "");
  }

  $("#cartItems").addEventListener("click", (e) => {
    const d = e.target.closest("[data-d]");
    const rm = e.target.closest("[data-rm]");
    if (d) {
      const it = cart[d.dataset.ci];
      it.q += Number(d.dataset.d);
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
      return `• ${i.q}x *${p.nome}*${i.v ? ` (${i.v})` : ""} — ${p.preco == null ? "sob consulta" : brl(p.preco * i.q)}`;
    });
    const total = cart.reduce((s, i) => s + (byId(i.id).preco || 0) * i.q, 0);
    const msg = [
      `🛒 *Novo pedido — ${S.nome}*`,
      "",
      ...lines,
      "",
      `*Total estimado:* ${brl(total)}${cart.some((i) => byId(i.id).preco == null) ? " + itens sob consulta" : ""}`,
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
