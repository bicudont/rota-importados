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
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef4ff"/><stop offset="1" stop-color="#dce8fb"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><text x="200" y="225" font-family="Arial" font-weight="700" font-size="120" text-anchor="middle" fill="#0055cc">${esc(String(nome).charAt(0))}</text></svg>`
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
          tags,
          adicionado: p.added ? Date.parse(p.added) || 0 : 0,
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
  ["#heroWhats", "#floatWhats", "#footerWhats", "#emptyWhats", "#headWhats", "#menuWhats"].forEach((s) => {
    const a = $(s);
    a.href = waLink(hello);
    a.target = "_blank";
    a.rel = "noopener";
  });

  /* ---------- Destaque principal: só dados reais ---------- */
  // Fotos: os produtos mais recentes que têm foto (o bloco some se não houver 3 fotos reais)
  const comFoto = PRODUTOS.filter((p) => p.imagens.length && !esgotado(p)).sort((a, b) => (b.adicionado || 0) - (a.adicionado || 0)).slice(0, 3);
  if (loja && comFoto.length === 3) {
    $("#heroVisual").innerHTML = comFoto
      .map(
        (p, i) => `<button class="hero__card hero__card--${"abc"[i]}" data-open="${esc(p.id)}" aria-label="Ver ${esc(p.nome)}">
          <img src="${esc(p.imagens[0])}" alt="" onerror="__imgErr(this)" />
          <span class="hero__tag"><b>${esc(p.nome)}</b>${p.preco == null ? "" : `<span>${esc(fmt(p.preco))}</span>`}</span>
        </button>`
      )
      .join("");
    $("#heroVisual").hidden = false;
  }
  // Atalhos para os departamentos com mais produtos
  {
    const conta = PRODUTOS.reduce((m, p) => ((m[p.categoria] = (m[p.categoria] || 0) + 1), m), {});
    const top = [...CATS].sort((a, b) => (conta[b.id] || 0) - (conta[a.id] || 0)).slice(0, 4);
    if (top.length > 1) {
      $("#heroCats").innerHTML = `<span>Explore:</span>` + top.map((c) => `<a href="#catalogo" data-cat="${esc(c.id)}">${esc(c.nome)}</a>`).join("");
      $("#heroCats").hidden = false;
    }
  }
  if (loja && loja.generated && !isNaN(Date.parse(loja.generated))) {
    $("#heroPill").textContent = `Catálogo atualizado em ${new Date(loja.generated).toLocaleDateString("pt-BR")}`;
    $("#heroPill").hidden = false;
  }
  {
    const nMarcas = new Set(PRODUTOS.map((p) => p.marca).filter(Boolean)).size;
    const stats = [[PRODUTOS.length, PRODUTOS.length === 1 ? "produto" : "produtos"], [CATS.length, CATS.length === 1 ? "departamento" : "departamentos"]];
    if (nMarcas) stats.splice(1, 0, [nMarcas, nMarcas === 1 ? "marca" : "marcas"]);
    $("#heroStats").innerHTML = stats.map(([n, t]) => `<li><b>${n.toLocaleString("pt-BR")}</b><span>${t}</span></li>`).join("");
  }

  // Diferenciais: descrevem como a loja funciona hoje (nada de garantias ou prazos não confirmados)
  {
    const perks = [
      ["💬", "Atendimento pelo WhatsApp", "Tire dúvidas sobre qualquer produto"],
      ["🛒", "Pedido em poucos cliques", "Monte o carrinho e envie pelo WhatsApp"],
    ];
    if (COTACAO) perks.push(["💱", "Cotação do dia", "Preços em US$ e em R$"]);
    if (PRODUTOS.some((p) => p.estoque != null)) perks.push(["📦", "Estoque atualizado", "Disponibilidade de cada produto"]);
    $("#perks").innerHTML = perks.map(([i, b, s]) => `<div class="perk"><span aria-hidden="true">${i}</span><div><b>${b}</b><small>${s}</small></div></div>`).join("");
    $("#perks").style.setProperty("--cols", perks.length);
  }

  if (COTACAO) {
    const c = COTACAO, partes = [];
    if (c.pix) partes.push(`Pix: US$ 1 = ${money(c.pix.rate, "BRL")}`);
    if (c.efetivo) partes.push(`Dinheiro: US$ 1 = ${money(c.efetivo.rate, "BRL")}`);
    const quando = (c.pix || c.efetivo).date;
    $("#rates").innerHTML = `💱 Cotação ${quando ? "de " + esc(new Date(quando + (quando.length === 10 ? "T12:00" : "")).toLocaleDateString("pt-BR")) : "do dia"} · ${partes.map(esc).join(" · ")}`;
    $("#rates").hidden = false;
  }

  // Faixa superior: só informações reais (cotação do Catálogo Pro e atendimento pelo WhatsApp)
  {
    const itens = [`<a href="${waLink(hello)}" target="_blank" rel="noopener">Atendimento pelo WhatsApp</a>`];
    if (COTACAO) {
      const c = COTACAO.pix || COTACAO.efetivo;
      itens.unshift(`<span>Cotação ${COTACAO.pix ? "Pix" : "em dinheiro"}: <b>US$ 1 = ${esc(money(c.rate, "BRL"))}</b></span>`);
    }
    $("#topbar").innerHTML = itens.join('<span class="topbar__sep" aria-hidden="true"></span>');
  }

  /* ---------- Filtros ---------- */
  const PAGE = 24;
  let state = { cat: "todos", marca: "", q: "", sort: "destaque", limite: PAGE };

  $("#chips").innerHTML = [{ id: "todos", nome: "Todos" }, ...CATS]
    .map((c) => `<button class="chip${c.id === "todos" ? " active" : ""}" data-cat="${esc(c.id)}" role="tab">${esc(c.nome)}</button>`)
    .join("");
  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (b) selectCategory(b.dataset.cat);
  });

  // Seleciona um departamento em qualquer menu e mantém todos sincronizados
  function selectCategory(id, scroll) {
    state.cat = id;
    state.limite = PAGE;
    document.querySelectorAll("[data-cat]").forEach((el) => {
      const on = el.dataset.cat === id;
      el.classList.toggle("active", on);
      if (el.matches(".nav__link, .dept__item, .menu__item")) el.setAttribute("aria-current", on ? "true" : "false");
    });
    render();
    if (scroll) $("#catalogo").scrollIntoView({ behavior: "smooth" });
  }

  /* ---------- Navegação de departamentos (só os setores cadastrados) ---------- */
  const qtd = PRODUTOS.reduce((m, p) => ((m[p.categoria] = (m[p.categoria] || 0) + 1), m), {});
  const deptos = [{ id: "todos", nome: "Todos os produtos" }, ...CATS];
  const deptBtn = $("#deptBtn"), deptMenu = $("#deptMenu");

  $("#navLinks").innerHTML = CATS
    .map((c) => `<li><a href="#catalogo" class="nav__link" data-cat="${esc(c.id)}">${esc(c.nome)}</a></li>`)
    .join("");
  deptMenu.innerHTML = `<ul>${deptos
    .map((c) => `<li><a href="#catalogo" class="dept__item${c.id === "todos" ? " active" : ""}" data-cat="${esc(c.id)}"><span>${esc(c.nome)}</span><small>${c.id === "todos" ? PRODUTOS.length : qtd[c.id] || 0}</small></a></li>`)
    .join("")}</ul>`;
  $("#menuList").innerHTML = deptos
    .map((c) => `<li><a href="#catalogo" class="menu__item${c.id === "todos" ? " active" : ""}" data-cat="${esc(c.id)}"><span>${esc(c.nome)}</span><small>${c.id === "todos" ? PRODUTOS.length : qtd[c.id] || 0}</small></a></li>`)
    .join("");

  const setDept = (open) => {
    deptMenu.hidden = !open;
    deptBtn.setAttribute("aria-expanded", String(open));
  };
  deptBtn.addEventListener("click", () => setDept(deptMenu.hidden));
  document.addEventListener("click", (e) => { if (!e.target.closest("#dept")) setDept(false); });
  $("#dept").addEventListener("keydown", (e) => {
    if (e.key === "Escape") { setDept(false); deptBtn.focus(); }
  });

  ["#navLinks", "#deptMenu", "#menuList"].forEach((s) =>
    $(s).addEventListener("click", (e) => {
      const a = e.target.closest("[data-cat]");
      if (!a) return;
      e.preventDefault();
      setDept(false);
      closeAll();
      selectCategory(a.dataset.cat, true);
    })
  );
  $("#openMenu").addEventListener("click", () => show($("#menu")));

  const marcas = [...new Set(PRODUTOS.map((p) => p.marca).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (marcas.length > 1) {
    $("#brand").innerHTML = `<option value="">Todas as marcas</option>` + marcas.map((m) => `<option>${esc(m)}</option>`).join("");
    $("#brand").hidden = false;
    $("#brand").addEventListener("change", (e) => { state.marca = e.target.value; state.limite = PAGE; render(); });
  }

  /* ---------- Busca: mesmo filtro do catálogo + sugestões ---------- */
  const input = $("#search"), suggest = $("#suggest");
  let sugIdx = -1, sugList = [];
  const textoBusca = (p) => norm(`${p.nome} ${p.marca} ${p.sku} ${p.tipo} ${p.descricao} ${catName(p.categoria)}`);

  function fecharSugestoes() {
    suggest.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    sugIdx = -1;
  }

  function mostrarSugestoes() {
    const q = norm(state.q);
    if (q.length < 2) return fecharSugestoes();
    const todos = PRODUTOS.filter((p) => textoBusca(p).includes(q));
    sugList = todos.slice(0, 6);
    sugIdx = -1;
    suggest.innerHTML = todos.length
      ? sugList
          .map(
            (p, i) => `<a href="#catalogo" class="sug" id="sug-${i}" role="option" aria-selected="false" data-sug="${esc(p.id)}">
          <img src="${esc(foto(p))}" alt="" loading="lazy" onerror="__imgErr(this)" />
          <span class="sug__txt"><b>${esc(p.nome)}</b><small>${esc([p.marca, p.sku ? "Cód. " + p.sku : ""].filter(Boolean).join(" · ") || catName(p.categoria))}</small></span>
          <span class="sug__price">${p.preco == null ? "Consultar" : esc(fmt(p.preco))}</span>
        </a>`
          )
          .join("") + `<button type="submit" form="searchForm" class="sug__all">Ver todos os ${todos.length} resultados</button>`
      : `<p class="sug__none">Nenhum produto encontrado para “${esc(state.q)}”.</p>`;
    suggest.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function marcarSugestao(i) {
    const itens = suggest.querySelectorAll(".sug");
    if (!itens.length) return;
    sugIdx = (i + itens.length) % itens.length;
    itens.forEach((el, k) => el.setAttribute("aria-selected", String(k === sugIdx)));
    input.setAttribute("aria-activedescendant", "sug-" + sugIdx);
  }

  input.addEventListener("input", () => {
    state.q = input.value.trim();
    state.limite = PAGE;
    render();
    mostrarSugestoes();
  });
  input.addEventListener("focus", mostrarSugestoes);
  input.addEventListener("keydown", (e) => {
    if (suggest.hidden) return;
    if (e.key === "ArrowDown") { e.preventDefault(); marcarSugestao(sugIdx + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); marcarSugestao(sugIdx - 1); }
    else if (e.key === "Escape") fecharSugestoes();
    else if (e.key === "Enter" && sugIdx >= 0) { e.preventDefault(); abrirSugestao(sugList[sugIdx].id); }
  });
  suggest.addEventListener("click", (e) => {
    const a = e.target.closest("[data-sug]");
    if (!a) return;
    e.preventDefault();
    abrirSugestao(a.dataset.sug);
  });
  document.addEventListener("click", (e) => { if (!e.target.closest("#searchWrap")) fecharSugestoes(); });

  function abrirSugestao(id) {
    fecharSugestoes();
    input.blur();
    openModal(id);
  }

  // Enviar a busca mostra todos os resultados no catálogo, sem filtro de departamento
  $("#searchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    fecharSugestoes();
    input.blur();
    state.q = input.value.trim();
    if (state.cat !== "todos") selectCategory("todos");
    else { state.limite = PAGE; render(); }
    $("#catalogo").scrollIntoView({ behavior: "smooth" });
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
    $("#grid").innerHTML = list.map((p, i) => cardHTML(p, Math.min(i % PAGE, 12) * 40)).join("");
  }

  // Card de produto: usado no catálogo e nas vitrines da página inicial
  function cardHTML(p, delay = 0) {
    return `
      <article class="card${esgotado(p) ? " card--out" : ""}" style="animation-delay:${delay}ms">
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
      </article>`;
  }

  function onCardClick(e) {
    const open = e.target.closest("[data-open]");
    const add = e.target.closest("[data-add]");
    if (add) {
      const p = byId(add.dataset.add);
      if (p.variacoes && p.variacoes.length > 1) openModal(p.id);
      else addToCart(p.id, (p.variacoes || [])[0] || "", 1);
    } else if (open) openModal(open.dataset.open);
  }
  $("#grid").addEventListener("click", onCardClick);

  /* ---------- Overlay / modal / drawer ---------- */
  const overlay = $("#overlay"), modal = $("#modal"), drawer = $("#drawer"), menu = $("#menu");
  function closeAll() {
    [overlay, modal, drawer, menu].forEach((el) => (el.hidden = true));
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

  /* ---------- Página inicial: vitrines geradas só com dados reais ---------- */
  function buildHome() {
    const MAX = 12;
    const disponiveisPrimeiro = (a, b) => esgotado(a) - esgotado(b);
    const shelf = (titulo, lista, acao, tipo) =>
      lista.length
        ? `<section class="shelf${tipo ? " shelf--" + tipo : ""}" aria-label="${esc(titulo)}">
        <div class="shelf__head"><h2>${esc(titulo)}</h2>${acao || ""}</div>
        <div class="shelf__wrap">
          <button class="shelf__nav shelf__nav--prev" data-dir="-1" aria-label="Anterior" hidden>‹</button>
          <div class="shelf__track">${lista.slice(0, MAX).map((p) => cardHTML(p)).join("")}</div>
          <button class="shelf__nav shelf__nav--next" data-dir="1" aria-label="Próximo" hidden>›</button>
        </div>
      </section>`
        : "";
    const verTodos = (cat, n) => `<a href="#catalogo" class="shelf__all" data-cat="${esc(cat)}">Ver todos (${n})</a>`;
    const html = [];

    // B — Departamentos (imagem = foto real de um produto do departamento)
    if (CATS.length) {
      html.push(`<section class="depts" aria-label="Departamentos"><div class="shelf__head"><h2>Departamentos</h2></div><div class="depts__grid">${CATS.map((c) => {
        const ps = PRODUTOS.filter((p) => p.categoria === c.id);
        const capa = ps.find((p) => p.imagens.length);
        return `<a href="#catalogo" class="dept-card" data-cat="${esc(c.id)}">
          <span class="dept-card__img">${capa ? `<img src="${esc(capa.imagens[0])}" alt="" loading="lazy" onerror="__imgErr(this)" />` : `<span class="dept-card__ini">${esc(c.nome.charAt(0))}</span>`}</span>
          <b>${esc(c.nome)}</b><small>${ps.length} produto${ps.length === 1 ? "" : "s"}</small>
        </a>`;
      }).join("")}</div></section>`);
    }

    // C — Lançamentos: pela data de cadastro no Catálogo Pro
    const lancamentos = PRODUTOS.filter((p) => p.adicionado && !esgotado(p)).sort((a, b) => b.adicionado - a.adicionado);
    if (lancamentos.length >= 4) html.push(shelf("Lançamentos", lancamentos, "", "novo"));

    // D — Ofertas: só produtos com preço anterior maior que o atual
    const ofertas = PRODUTOS.filter((p) => off(p) > 0 && !esgotado(p)).sort((a, b) => off(b) - off(a));
    if (ofertas.length >= 2) html.push(shelf("Ofertas", ofertas, "", "promo"));

    // D — Vitrines pelas tags cadastradas (ex.: "Mais vendido"), sem inventar classificações
    const porTag = {};
    PRODUTOS.forEach((p) => (p.tags || []).slice(0, 1).forEach((t) => (porTag[t] = porTag[t] || []).push(p)));
    Object.entries(porTag)
      .filter(([, ps]) => ps.length >= 2)
      .forEach(([t, ps]) => html.push(shelf(t, ps.sort(disponiveisPrimeiro), "", "destaque")));

    // D — Marcas
    if (marcas.length > 1) {
      const n = (m) => PRODUTOS.filter((p) => p.marca === m).length;
      html.push(`<section class="brands" aria-label="Marcas"><div class="shelf__head"><h2>Marcas</h2></div><div class="brands__list">${marcas
        .map((m) => `<a href="#catalogo" class="brand-chip" data-marca="${esc(m)}">${esc(m)}<small>${n(m)}</small></a>`)
        .join("")}</div></section>`);
    }

    // D — Uma vitrine por departamento
    CATS.forEach((c) => {
      const ps = PRODUTOS.filter((p) => p.categoria === c.id).sort(disponiveisPrimeiro);
      html.push(shelf(c.nome, ps, ps.length > MAX || CATS.length > 1 ? verTodos(c.id, ps.length) : ""));
    });

    $("#home").innerHTML = html.join("");
    $("#home").querySelectorAll(".shelf__track").forEach(atualizarSetas);
    $("#home").querySelectorAll(".shelf__track").forEach((tr) => tr.addEventListener("scroll", () => atualizarSetas(tr), { passive: true }));
  }

  function atualizarSetas(track) {
    const wrap = track.parentElement;
    const max = track.scrollWidth - track.clientWidth - 2;
    wrap.querySelector(".shelf__nav--prev").hidden = track.scrollLeft <= 2;
    wrap.querySelector(".shelf__nav--next").hidden = track.scrollLeft >= max;
  }
  window.addEventListener("resize", () => $("#home").querySelectorAll(".shelf__track").forEach(atualizarSetas));

  $("#home").addEventListener("click", (e) => {
    const nav = e.target.closest(".shelf__nav");
    const cat = e.target.closest("[data-cat]");
    const marca = e.target.closest("[data-marca]");
    if (nav) {
      const tr = nav.parentElement.querySelector(".shelf__track");
      tr.scrollBy({ left: Number(nav.dataset.dir) * tr.clientWidth * 0.9, behavior: "smooth" });
    } else if (cat) {
      e.preventDefault();
      selectCategory(cat.dataset.cat, true);
    } else if (marca) {
      e.preventDefault();
      state.marca = marca.dataset.marca;
      $("#brand").value = state.marca;
      selectCategory("todos", true);
    } else onCardClick(e);
  });

  // Destaque principal: atalhos de departamento e fotos de produtos reais
  $(".hero").addEventListener("click", (e) => {
    const cat = e.target.closest("[data-cat]");
    const open = e.target.closest("[data-open]");
    if (cat) {
      e.preventDefault();
      selectCategory(cat.dataset.cat, true);
    } else if (open) openModal(open.dataset.open);
  });

  buildHome();
  render();
  renderCart();
})();
