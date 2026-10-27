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
  const marcas = [...new Set(PRODUTOS.map((p) => p.marca).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const temEstoque = PRODUTOS.some((p) => p.estoque != null);

  /* ---------- Endereços (rotas com #, sem mudar o servidor) ---------- */
  const PAGE = 24;
  const ORDENS = ["destaque", "recentes", "menor", "maior", "nome"];
  let state = { cat: "todos", marca: "", q: "", sort: "destaque", disp: false, limite: PAGE };
  let VIEW = "home";
  const TITULO = document.title;

  const prodHref = (p) => "#/produto/" + encodeURIComponent(p.id);
  function catalogHref(o = {}) {
    const st = { cat: "todos", marca: "", q: "", sort: "destaque", disp: false, ...o };
    const prm = new URLSearchParams();
    if (st.cat !== "todos") prm.set("cat", st.cat);
    if (st.marca) prm.set("marca", st.marca);
    if (st.q) prm.set("q", st.q);
    if (st.sort !== "destaque") prm.set("ordem", st.sort);
    if (st.disp) prm.set("disp", "1");
    const s = prm.toString();
    return "#/catalogo" + (s ? "?" + s : "");
  }
  // Atualiza o endereço sem criar novo item no histórico (filtros dentro da listagem)
  const syncURL = () => { if (VIEW === "catalogo") history.replaceState(null, "", catalogHref(state)); };

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
        (p, i) => `<a href="${prodHref(p)}" class="hero__card hero__card--${"abc"[i]}" aria-label="Ver ${esc(p.nome)}">
          <img src="${esc(p.imagens[0])}" alt="" onerror="__imgErr(this)" />
          <span class="hero__tag"><b>${esc(p.nome)}</b>${p.preco == null ? "" : `<span>${esc(fmt(p.preco))}</span>`}</span>
        </a>`
      )
      .join("");
    $("#heroVisual").hidden = false;
  }
  // Atalhos para os departamentos com mais produtos
  const qtd = PRODUTOS.reduce((m, p) => ((m[p.categoria] = (m[p.categoria] || 0) + 1), m), {});
  {
    const top = [...CATS].sort((a, b) => (qtd[b.id] || 0) - (qtd[a.id] || 0)).slice(0, 4);
    if (top.length > 1) {
      $("#heroCats").innerHTML = `<span>Explore:</span>` + top.map((c) => `<a href="${catalogHref({ cat: c.id })}">${esc(c.nome)}</a>`).join("");
      $("#heroCats").hidden = false;
    }
  }
  if (loja && loja.generated && !isNaN(Date.parse(loja.generated))) {
    $("#heroPill").textContent = `Catálogo atualizado em ${new Date(loja.generated).toLocaleDateString("pt-BR")}`;
    $("#heroPill").hidden = false;
  }
  {
    const stats = [[PRODUTOS.length, PRODUTOS.length === 1 ? "produto" : "produtos"], [CATS.length, CATS.length === 1 ? "departamento" : "departamentos"]];
    if (marcas.length) stats.splice(1, 0, [marcas.length, marcas.length === 1 ? "marca" : "marcas"]);
    $("#heroStats").innerHTML = stats.map(([n, t]) => `<li><b>${n.toLocaleString("pt-BR")}</b><span>${t}</span></li>`).join("");
  }

  // Diferenciais: descrevem como a loja funciona hoje (nada de garantias ou prazos não confirmados)
  {
    const perks = [
      ["💬", "Atendimento pelo WhatsApp", "Tire dúvidas sobre qualquer produto"],
      ["🛒", "Pedido em poucos cliques", "Monte o carrinho e envie pelo WhatsApp"],
    ];
    if (COTACAO) perks.push(["💱", "Cotação do dia", "Preços em US$ e em R$"]);
    if (temEstoque) perks.push(["📦", "Estoque atualizado", "Disponibilidade de cada produto"]);
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

  /* ---------- Navegação de departamentos (só os setores cadastrados) ---------- */
  const deptos = [{ id: "todos", nome: "Todos os produtos" }, ...CATS];
  const deptBtn = $("#deptBtn"), deptMenu = $("#deptMenu");
  const nDept = (id) => (id === "todos" ? PRODUTOS.length : qtd[id] || 0);

  $("#navLinks").innerHTML = CATS.map((c) => `<li><a href="${catalogHref({ cat: c.id })}" class="nav__link" data-cat="${esc(c.id)}">${esc(c.nome)}</a></li>`).join("");
  deptMenu.innerHTML = `<ul>${deptos
    .map((c) => `<li><a href="${catalogHref({ cat: c.id })}" class="dept__item" data-cat="${esc(c.id)}"><span>${esc(c.nome)}</span><small>${nDept(c.id)}</small></a></li>`)
    .join("")}</ul>`;
  $("#menuList").innerHTML = deptos
    .map((c) => `<li><a href="${catalogHref({ cat: c.id })}" class="menu__item" data-cat="${esc(c.id)}"><span>${esc(c.nome)}</span><small>${nDept(c.id)}</small></a></li>`)
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
  $("#openMenu").addEventListener("click", () => show($("#menu")));

  // Marca o departamento atual em todos os menus
  function marcarDepartamento() {
    const atual = VIEW === "catalogo" ? state.cat : VIEW === "produto" && produtoAtual ? produtoAtual.categoria : null;
    document.querySelectorAll(".nav__link, .dept__item, .menu__item").forEach((el) => {
      const on = el.dataset.cat === atual;
      el.classList.toggle("active", on);
      if (on) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });
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
    const termo = input.value.trim();
    const q = norm(termo);
    if (q.length < 2) return fecharSugestoes();
    const todos = PRODUTOS.filter((p) => textoBusca(p).includes(q));
    sugList = todos.slice(0, 6);
    sugIdx = -1;
    suggest.innerHTML = todos.length
      ? sugList
          .map(
            (p, i) => `<a href="${prodHref(p)}" class="sug" id="sug-${i}" role="option" aria-selected="false">
          <img src="${esc(foto(p))}" alt="" loading="lazy" onerror="__imgErr(this)" />
          <span class="sug__txt"><b>${esc(p.nome)}</b><small>${esc([p.marca, p.sku ? "Cód. " + p.sku : ""].filter(Boolean).join(" · ") || catName(p.categoria))}</small></span>
          <span class="sug__price">${p.preco == null ? "Consultar" : esc(fmt(p.preco))}</span>
        </a>`
          )
          .join("") + `<button type="submit" form="searchForm" class="sug__all">Ver todos os ${todos.length} resultados</button>`
      : `<p class="sug__none">Nenhum produto encontrado para “${esc(termo)}”.</p>`;
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
    // Na listagem, a busca filtra na hora (como antes); nas outras páginas, só mostra sugestões
    if (VIEW === "catalogo") {
      state.q = input.value.trim();
      state.limite = PAGE;
      render();
      syncURL();
    }
    mostrarSugestoes();
  });
  input.addEventListener("focus", mostrarSugestoes);
  input.addEventListener("keydown", (e) => {
    if (suggest.hidden) return;
    if (e.key === "ArrowDown") { e.preventDefault(); marcarSugestao(sugIdx + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); marcarSugestao(sugIdx - 1); }
    else if (e.key === "Escape") fecharSugestoes();
    else if (e.key === "Enter" && sugIdx >= 0) { e.preventDefault(); location.hash = prodHref(sugList[sugIdx]); }
  });
  document.addEventListener("click", (e) => { if (!e.target.closest("#searchWrap")) fecharSugestoes(); });

  // Enviar a busca mostra todos os resultados, sem filtro de departamento ou marca
  $("#searchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    fecharSugestoes();
    input.blur();
    location.hash = catalogHref({ q: input.value.trim(), sort: state.sort });
  });

  /* ---------- Listagem: filtros, ordenação e contagem ---------- */
  const matches = (p, o, ignorar) => {
    const q = norm(o.q);
    return (
      (ignorar === "cat" || o.cat === "todos" || p.categoria === o.cat) &&
      (ignorar === "marca" || !o.marca || p.marca === o.marca) &&
      (ignorar === "disp" || !o.disp || !esgotado(p)) &&
      (!q || textoBusca(p).includes(q))
    );
  };

  function filtered() {
    let list = PRODUTOS.filter((p) => matches(p, state));
    const price = (p) => (p.preco == null ? Infinity : p.preco);
    if (state.sort === "menor") list = [...list].sort((a, b) => price(a) - price(b));
    if (state.sort === "maior") list = [...list].sort((a, b) => (b.preco ?? -1) - (a.preco ?? -1));
    if (state.sort === "nome") list = [...list].sort((a, b) => a.nome.localeCompare(b.nome));
    if (state.sort === "recentes") list = [...list].sort((a, b) => (b.adicionado || 0) - (a.adicionado || 0));
    // esgotados sempre por último
    return [...list].sort((a, b) => esgotado(a) - esgotado(b));
  }

  function setFiltro(changes) {
    Object.assign(state, changes, { limite: PAGE });
    render();
    syncURL();
  }

  function renderFiltros() {
    const conta = (ign, f) => PRODUTOS.filter((p) => matches(p, state, ign) && f(p)).length;
    const opcao = (name, value, label, n, on) =>
      `<label class="fopt${n ? "" : " fopt--zero"}"><input type="radio" name="${name}" value="${esc(value)}"${on ? " checked" : ""} /><span>${esc(label)}</span><small>${n}</small></label>`;

    $("#fCats").innerHTML = deptos.map((c) => opcao("fcat", c.id, c.nome, conta("cat", (p) => c.id === "todos" || p.categoria === c.id), state.cat === c.id)).join("");
    $("#fMarcasBox").hidden = marcas.length < 2;
    $("#fMarcas").innerHTML =
      opcao("fmarca", "", "Todas as marcas", conta("marca", () => true), !state.marca) +
      marcas.map((m) => opcao("fmarca", m, m, conta("marca", (p) => p.marca === m), state.marca === m)).join("");
    $("#fDispBox").hidden = !temEstoque;
    $("#fDisp").checked = state.disp;
    $("#fDispN").textContent = conta("disp", (p) => !esgotado(p));

    // Filtros ativos (com botão para remover cada um)
    const ativos = [];
    if (state.cat !== "todos") ativos.push(["cat", catName(state.cat)]);
    if (state.marca) ativos.push(["marca", state.marca]);
    if (state.q) ativos.push(["q", `“${state.q}”`]);
    if (state.disp) ativos.push(["disp", "Somente disponíveis"]);
    $("#activeFilters").innerHTML = ativos.length
      ? ativos.map(([k, t]) => `<button class="af" data-rm-filter="${k}" aria-label="Remover filtro ${esc(t)}">${esc(t)} <span aria-hidden="true">✕</span></button>`).join("") +
        `<button class="link-btn af__clear" data-rm-filter="all">Limpar tudo</button>`
      : "";
    const n = ativos.filter(([k]) => k !== "q").length;
    $("#filtersN").textContent = n;
    $("#filtersN").hidden = !n;
  }

  $("#filters").addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "fcat") setFiltro({ cat: t.value });
    else if (t.name === "fmarca") setFiltro({ marca: t.value });
    else if (t.id === "fDisp") setFiltro({ disp: t.checked });
  });
  const limparFiltros = () => {
    input.value = "";
    setFiltro({ cat: "todos", marca: "", q: "", disp: false });
  };
  $("#activeFilters").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rm-filter]");
    if (!b) return;
    const k = b.dataset.rmFilter;
    if (k === "all") return limparFiltros();
    if (k === "q") input.value = "";
    setFiltro(k === "cat" ? { cat: "todos" } : k === "disp" ? { disp: false } : { [k]: "" });
  });
  $("#clearFilters").addEventListener("click", limparFiltros);
  $("#emptyClear").addEventListener("click", limparFiltros);
  $("#sort").addEventListener("change", (e) => setFiltro({ sort: e.target.value }));
  $("#more").addEventListener("click", () => { state.limite += PAGE; render(); });

  // Painel de filtros no celular
  const filtersEl = $("#filters");
  $("#openFilters").addEventListener("click", () => {
    closeAll();
    overlay.hidden = false;
    filtersEl.classList.add("open");
    document.body.style.overflow = "hidden";
  });
  $("#closeFilters").addEventListener("click", closeAll);
  $("#applyFilters").addEventListener("click", () => { closeAll(); $("#catalogo").scrollIntoView(); });

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
  // Disponibilidade real (só quando o Catálogo Pro informa o estoque)
  const dispHTML = (p) =>
    p.estoque == null ? "" : esgotado(p) ? `<span class="avail avail--out">Esgotado</span>` : p.estoque <= 3 ? `<span class="avail avail--low">Últimas ${p.estoque} unidades</span>` : `<span class="avail">Em estoque</span>`;

  function tituloListagem() {
    if (state.q) return `Resultados para “${state.q}”`;
    if (state.cat !== "todos") return catName(state.cat);
    if (state.marca) return state.marca;
    if (state.sort === "recentes") return "Lançamentos";
    return "Todos os produtos";
  }

  function crumbs(itens) {
    return `<ol>${itens
      .map(([t, href], i) => (i === itens.length - 1 ? `<li aria-current="page">${esc(t)}</li>` : `<li><a href="${href}">${esc(t)}</a></li>`))
      .join("")}</ol>`;
  }

  function render() {
    const all = filtered();
    const list = all.slice(0, state.limite);
    const titulo = tituloListagem();
    $("#catTitle").textContent = titulo;
    const migalhas = [["Início", "#/"], ["Produtos", catalogHref()]];
    if (state.cat !== "todos") migalhas.push([catName(state.cat), catalogHref({ cat: state.cat })]);
    if (state.marca) migalhas.push([state.marca, catalogHref({ cat: state.cat, marca: state.marca })]);
    if (state.q) migalhas.push([`Busca: ${state.q}`, ""]);
    $("#crumbs").innerHTML = crumbs(migalhas);
    $("#resultInfo").textContent = `${all.length.toLocaleString("pt-BR")} produto${all.length === 1 ? "" : "s"} encontrado${all.length === 1 ? "" : "s"}`;
    $("#sort").value = state.sort;
    $("#empty").hidden = all.length > 0;
    $("#more").hidden = all.length <= state.limite;
    $("#grid").removeAttribute("aria-busy");
    $("#grid").innerHTML = list.map((p, i) => cardHTML(p, Math.min(i % PAGE, 12) * 30)).join("");
    renderFiltros();
    if (VIEW === "catalogo") document.title = `${titulo} · ${S.nome}`;
  }

  // Card de produto: usado na listagem, nas vitrines e nos relacionados
  function cardHTML(p, delay = 0) {
    return `
      <article class="card${esgotado(p) ? " card--out" : ""}" style="animation-delay:${delay}ms">
        <a class="card__media" href="${prodHref(p)}" tabindex="-1" aria-hidden="true">
          <img src="${esc(foto(p))}" alt="" loading="lazy" onerror="__imgErr(this)" />
          ${esgotado(p) ? `<span class="badge badge--out">Esgotado</span>` : p.tag ? `<span class="badge">${esc(p.tag)}</span>` : ""}
          ${off(p) ? `<span class="badge badge--off">-${off(p)}%</span>` : ""}
        </a>
        <div class="card__body">
          <span class="card__cat">${esc(meta(p))}</span>
          <h3 class="card__name"><a href="${prodHref(p)}" title="${esc(p.nome)}">${esc(p.nome)}</a></h3>
          ${p.sku ? `<span class="card__sku">Cód. ${esc(p.sku)}</span>` : ""}
          ${priceHTML(p)}
          ${esgotado(p) ? "" : dispHTML(p)}
          <div class="card__actions">
            ${esgotado(p)
              ? `<a class="btn btn--ghost btn--wide" href="${waLink(`Olá! O produto *${p.nome}*${skuTxt(p)} vai voltar ao estoque?`)}" target="_blank" rel="noopener">Avise-me</a>`
              : `<button class="btn btn--primary" data-add="${esc(p.id)}">Adicionar</button>
            <a class="btn btn--ghost" href="${waLink(`Olá! Tenho interesse no produto: *${p.nome}*${skuTxt(p)}`)}" target="_blank" rel="noopener" aria-label="Perguntar no WhatsApp sobre ${esc(p.nome)}">
              <svg viewBox="0 0 24 24"><use href="#ico-whats"/></svg>
            </a>`}
          </div>
        </div>
      </article>`;
  }

  // "Adicionar" em qualquer card (listagem, vitrines, relacionados)
  document.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]");
    if (!add) return;
    const p = byId(add.dataset.add);
    if (p.variacoes && p.variacoes.length > 1) location.hash = prodHref(p);
    else addToCart(p.id, (p.variacoes || [])[0] || "", 1);
  });

  /* ---------- Vitrines (carrosséis) ---------- */
  const MAX_VITRINE = 12;
  const shelfHTML = (titulo, lista, acao, tipo) =>
    lista.length
      ? `<section class="shelf${tipo ? " shelf--" + tipo : ""}" aria-label="${esc(titulo)}">
        <div class="shelf__head"><h2>${esc(titulo)}</h2>${acao || ""}</div>
        <div class="shelf__wrap">
          <button class="shelf__nav shelf__nav--prev" data-dir="-1" aria-label="Anterior" hidden>‹</button>
          <div class="shelf__track">${lista.slice(0, MAX_VITRINE).map((p) => cardHTML(p)).join("")}</div>
          <button class="shelf__nav shelf__nav--next" data-dir="1" aria-label="Próximo" hidden>›</button>
        </div>
      </section>`
      : "";

  function atualizarSetas(track) {
    const wrap = track.parentElement;
    const max = track.scrollWidth - track.clientWidth - 2;
    wrap.querySelector(".shelf__nav--prev").hidden = track.scrollLeft <= 2;
    wrap.querySelector(".shelf__nav--next").hidden = track.scrollLeft >= max;
  }
  function iniciarVitrines(root) {
    root.querySelectorAll(".shelf__track").forEach((tr) => {
      atualizarSetas(tr);
      tr.addEventListener("scroll", () => atualizarSetas(tr), { passive: true });
    });
  }
  window.addEventListener("resize", () => document.querySelectorAll(".shelf__track").forEach(atualizarSetas));
  document.addEventListener("click", (e) => {
    const nav = e.target.closest(".shelf__nav");
    if (!nav) return;
    const tr = nav.parentElement.querySelector(".shelf__track");
    tr.scrollBy({ left: Number(nav.dataset.dir) * tr.clientWidth * 0.9, behavior: "smooth" });
  });

  /* ---------- Página inicial: vitrines geradas só com dados reais ---------- */
  function buildHome() {
    const disponiveisPrimeiro = (a, b) => esgotado(a) - esgotado(b);
    const verTodos = (href, n) => `<a href="${href}" class="shelf__all">Ver todos${n ? ` (${n})` : ""}</a>`;
    const html = [];

    // Departamentos (imagem = foto real de um produto do departamento)
    if (CATS.length) {
      html.push(`<section class="depts" aria-label="Departamentos"><div class="shelf__head"><h2>Departamentos</h2></div><div class="depts__grid">${CATS.map((c) => {
        const ps = PRODUTOS.filter((p) => p.categoria === c.id);
        const capa = ps.find((p) => p.imagens.length);
        return `<a href="${catalogHref({ cat: c.id })}" class="dept-card">
          <span class="dept-card__img">${capa ? `<img src="${esc(capa.imagens[0])}" alt="" loading="lazy" onerror="__imgErr(this)" />` : `<span class="dept-card__ini">${esc(c.nome.charAt(0))}</span>`}</span>
          <b>${esc(c.nome)}</b><small>${ps.length} produto${ps.length === 1 ? "" : "s"}</small>
        </a>`;
      }).join("")}</div></section>`);
    }

    // Lançamentos: pela data de cadastro no Catálogo Pro
    const lancamentos = PRODUTOS.filter((p) => p.adicionado && !esgotado(p)).sort((a, b) => b.adicionado - a.adicionado);
    if (lancamentos.length >= 4) html.push(shelfHTML("Lançamentos", lancamentos, verTodos(catalogHref({ sort: "recentes" })), "novo"));

    // Ofertas: só produtos com preço anterior maior que o atual
    const ofertas = PRODUTOS.filter((p) => off(p) > 0 && !esgotado(p)).sort((a, b) => off(b) - off(a));
    if (ofertas.length >= 2) html.push(shelfHTML("Ofertas", ofertas, "", "promo"));

    // Vitrines pelas tags cadastradas (ex.: "Mais vendido"), sem inventar classificações
    const porTag = {};
    PRODUTOS.forEach((p) => (p.tags || []).slice(0, 1).forEach((t) => (porTag[t] = porTag[t] || []).push(p)));
    Object.entries(porTag)
      .filter(([, ps]) => ps.length >= 2)
      .forEach(([t, ps]) => html.push(shelfHTML(t, ps.sort(disponiveisPrimeiro), "", "destaque")));

    // Marcas
    if (marcas.length > 1) {
      const n = (m) => PRODUTOS.filter((p) => p.marca === m).length;
      html.push(`<section class="brands" aria-label="Marcas"><div class="shelf__head"><h2>Marcas</h2></div><div class="brands__list">${marcas
        .map((m) => `<a href="${catalogHref({ marca: m })}" class="brand-chip">${esc(m)}<small>${n(m)}</small></a>`)
        .join("")}</div></section>`);
    }

    // Uma vitrine por departamento
    CATS.forEach((c) => {
      const ps = PRODUTOS.filter((p) => p.categoria === c.id).sort(disponiveisPrimeiro);
      html.push(shelfHTML(c.nome, ps, verTodos(catalogHref({ cat: c.id }), ps.length)));
    });

    $("#home").innerHTML = html.join("");
    iniciarVitrines($("#home"));
  }

  /* ---------- Página de produto ---------- */
  let produtoAtual = null;

  function renderProduto(p) {
    produtoAtual = p;
    const imgs = p.imagens.length ? p.imagens : [fallback(p.nome)];
    const out = esgotado(p);
    let v = (p.variacoes || [])[0] || "", q = 1;
    const specs = [
      ["Marca", p.marca],
      ["Código", p.sku],
      ["Departamento", catName(p.categoria)],
      ["Tipo", p.tipo],
      ["Volume", p.volume ? `${p.volume} ml` : ""],
      ["Notas", p.notas],
    ].filter((s) => s[1]);
    // Relacionados: mesmo departamento, primeiro os da mesma marca e os disponíveis
    const rel = PRODUTOS.filter((x) => x.categoria === p.categoria && x.id !== p.id).sort(
      (a, b) => (b.marca === p.marca) - (a.marca === p.marca) || esgotado(a) - esgotado(b)
    );
    const migalhas = [["Início", "#/"], ["Produtos", catalogHref()], [catName(p.categoria), catalogHref({ cat: p.categoria })], [p.nome, ""]];

    $("#produto").innerHTML = `
      <nav class="crumbs" aria-label="Você está aqui">${crumbs(migalhas)}</nav>
      <div class="pdp">
        <div class="pdp__gallery">
          <div class="pdp__main"><img id="pImg" src="${esc(imgs[0])}" alt="${esc(p.nome)}" onerror="__imgErr(this)" />
            ${!out && off(p) ? `<span class="badge badge--off">-${off(p)}%</span>` : ""}
          </div>
          ${imgs.length > 1 ? `<div class="pdp__thumbs" role="group" aria-label="Fotos do produto">${imgs.map((src, i) => `<button class="pdp__thumb${i ? "" : " active"}" data-src="${esc(src)}" aria-label="Foto ${i + 1}"${i ? "" : ' aria-current="true"'}><img src="${esc(src)}" alt="" loading="lazy" onerror="__imgErr(this)" /></button>`).join("")}</div>` : ""}
        </div>
        <div class="pdp__info">
          <div class="pdp__meta">
            ${p.marca ? `<a href="${catalogHref({ marca: p.marca })}" class="pdp__brand">${esc(p.marca)}</a>` : ""}
            ${p.sku ? `<span>Cód. ${esc(p.sku)}</span>` : ""}
            ${p.tag && !out ? `<span class="badge badge--inline">${esc(p.tag)}</span>` : ""}
          </div>
          <h1 class="pdp__title">${esc(p.nome)}</h1>
          ${dispHTML(p)}
          <div class="pdp__price">${priceHTML(p)}</div>
          ${p.variacoes && p.variacoes.length ? `<div class="pdp__block"><span class="label">Opção</span><div class="opts">${p.variacoes.map((o, i) => `<button class="opt${i ? "" : " active"}" data-v="${esc(o)}">${esc(o)}</button>`).join("")}</div></div>` : ""}
          ${out ? "" : `<div class="pdp__block"><span class="label">Quantidade</span>
            <div class="qty"><button data-q="-1" aria-label="Diminuir">−</button><span id="pQty" aria-live="polite">1</span><button data-q="1" aria-label="Aumentar">+</button></div></div>`}
          <div class="pdp__btns">
            ${out ? "" : `<button class="btn btn--primary btn--block" id="pAdd">Adicionar ao carrinho</button>`}
            <a class="btn btn--whats btn--block" id="pBuy" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#ico-whats"/></svg>${out ? "Avise-me quando chegar" : "Comprar agora no WhatsApp"}</a>
          </div>
          <p class="pdp__note">${COTACAO ? "Preços calculados pela cotação do dia. " : ""}Pagamento e entrega são combinados pelo WhatsApp.</p>
        </div>
      </div>
      ${p.descricao || specs.length ? `<div class="pdp__extra">
        ${p.descricao ? `<section class="pdp__section"><h2>Descrição</h2><p>${esc(p.descricao)}</p></section>` : ""}
        ${specs.length ? `<section class="pdp__section"><h2>Especificações</h2><dl class="specs">${specs.map(([k, val]) => `<dt>${k}</dt><dd>${esc(val)}</dd>`).join("")}</dl></section>` : ""}
      </div>` : ""}
      ${rel.length ? `<div class="pdp__related">${shelfHTML(`Mais em ${catName(p.categoria)}`, rel, `<a href="${catalogHref({ cat: p.categoria })}" class="shelf__all">Ver todos</a>`)}</div>` : ""}`;

    const updBuy = () => {
      $("#pBuy").href = waLink(
        out
          ? `Olá! O produto *${p.nome}*${skuTxt(p)} vai voltar ao estoque?`
          : `Olá, ${S.nome}! Quero comprar:\n\n• ${q}x *${p.nome}*${v ? ` (${v})` : ""}${skuTxt(p)}${p.preco ? ` — ${fmt(p.preco * q)}` : ""}\n\nPodemos combinar pagamento e entrega?`
      );
    };
    updBuy();
    $("#produto").onclick = (e) => {
      const o = e.target.closest(".opt");
      const qb = e.target.closest("[data-q]");
      const th = e.target.closest(".pdp__thumb");
      if (o) {
        v = o.dataset.v;
        $("#produto").querySelectorAll(".opt").forEach((x) => x.classList.toggle("active", x === o));
      }
      if (qb) {
        q = Math.max(1, q + Number(qb.dataset.q));
        if (p.estoque > 0) q = Math.min(q, p.estoque);
        $("#pQty").textContent = q;
      }
      if (th) {
        $("#pImg").src = th.dataset.src;
        $("#produto").querySelectorAll(".pdp__thumb").forEach((x) => {
          x.classList.toggle("active", x === th);
          if (x === th) x.setAttribute("aria-current", "true");
          else x.removeAttribute("aria-current");
        });
      }
      if (e.target.closest("#pAdd")) addToCart(p.id, v, q);
      updBuy();
    };
    iniciarVitrines($("#produto"));
    document.title = `${p.nome} · ${S.nome}`;
  }

  /* ---------- Roteador ---------- */
  function showView(v) {
    VIEW = v;
    document.querySelectorAll("[data-view]").forEach((el) => (el.hidden = el.dataset.view !== v));
  }

  function route() {
    const h = location.hash.replace(/^#\/?/, "");
    const [path, qs = ""] = h.split("?");
    const [view, ...rest] = path.split("/");
    closeAll();
    setDept(false);
    fecharSugestoes();

    if (view === "produto") {
      const p = byId(decodeURIComponent(rest.join("/")));
      if (p) {
        showView("produto");
        renderProduto(p);
        marcarDepartamento();
        window.scrollTo(0, 0);
        return;
      }
    }
    if (view === "catalogo") {
      const prm = new URLSearchParams(qs);
      const cat = prm.get("cat");
      state = {
        cat: CATS.some((c) => c.id === cat) ? cat : "todos",
        marca: marcas.includes(prm.get("marca")) ? prm.get("marca") : "",
        q: (prm.get("q") || "").trim(),
        sort: ORDENS.includes(prm.get("ordem")) ? prm.get("ordem") : "destaque",
        disp: prm.get("disp") === "1",
        limite: PAGE,
      };
      input.value = state.q;
      showView("catalogo");
      render();
      marcarDepartamento();
      window.scrollTo(0, 0);
      return;
    }
    produtoAtual = null;
    showView("home");
    marcarDepartamento();
    document.title = TITULO;
    if (h) window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  /* ---------- Overlay / painéis laterais ---------- */
  const overlay = $("#overlay"), drawer = $("#drawer"), menu = $("#menu");
  function closeAll() {
    [overlay, drawer, menu].forEach((el) => (el.hidden = true));
    filtersEl.classList.remove("open");
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

  buildHome();
  renderCart();
  route();
})();
