/* =========================================================
   CONFIGURAÇÃO DA LOJA — edite aqui
   ========================================================= */
window.STORE = {
  nome: "Rota Importados",
  slogan: "Importados originais, direto pra você.",
  // Número do WhatsApp com DDI + DDD, só números (ex: 5511999998888)
  whatsapp: "5500000000000",
  instagram: "https://instagram.com/rotaimportados",
  cidade: "Brasil",
  horario: "Seg a Sáb · 9h às 19h",
};

/* =========================================================
   PRODUTOS
   - id: único, sem espaços
   - categoria: precisa existir em CATEGORIAS
   - preco: número (use null para "Sob consulta")
   - precoAntigo: opcional, mostra desconto
   - tag: opcional ("Novo", "Mais vendido", "Últimas unidades"...)
   - imagens: links ou caminhos locais (ex: "img/produto.jpg")
   - variacoes: opcional (tamanhos, cores, ml...)
   ========================================================= */
window.CATEGORIAS = [
  { id: "perfumes", nome: "Perfumes" },
  { id: "eletronicos", nome: "Eletrônicos" },
  { id: "relogios", nome: "Relógios" },
  { id: "tenis", nome: "Tênis" },
  { id: "acessorios", nome: "Acessórios" },
];

window.PRODUTOS = [
  {
    id: "perfume-noir-100",
    nome: "Perfume Noir Intense 100ml",
    categoria: "perfumes",
    preco: 389.9,
    precoAntigo: 459.9,
    tag: "Mais vendido",
    descricao: "Fragrância amadeirada e marcante, com notas de âmbar, baunilha e especiarias. Alta fixação, ideal para a noite.",
    imagens: ["https://images.unsplash.com/photo-1541643600914-78b084683601?w=900&q=80"],
    variacoes: ["50ml", "100ml"],
  },
  {
    id: "perfume-bloom-80",
    nome: "Perfume Bloom Eau de Parfum",
    categoria: "perfumes",
    preco: 329.9,
    tag: "Novo",
    descricao: "Floral frutado, leve e sofisticado. Notas de peônia, pera e almíscar branco.",
    imagens: ["https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=900&q=80"],
    variacoes: ["80ml"],
  },
  {
    id: "fone-studio-pro",
    nome: "Headphone Studio Pro Wireless",
    categoria: "eletronicos",
    preco: 899.0,
    precoAntigo: 1099.0,
    descricao: "Cancelamento de ruído ativo, até 30h de bateria e som de alta fidelidade. Conexão Bluetooth 5.3.",
    imagens: ["https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=900&q=80"],
    variacoes: ["Preto", "Branco"],
  },
  {
    id: "fone-buds",
    nome: "Fone Buds Pro com Estojo",
    categoria: "eletronicos",
    preco: 649.0,
    tag: "Últimas unidades",
    descricao: "Fones intra-auriculares com áudio espacial, resistência à água e estojo de carregamento sem fio.",
    imagens: ["https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=900&q=80"],
  },
  {
    id: "camera-retro",
    nome: "Câmera Instantânea Retrô",
    categoria: "eletronicos",
    preco: null,
    descricao: "Fotos impressas na hora, design clássico e flash automático. Valor sob consulta.",
    imagens: ["https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=900&q=80"],
  },
  {
    id: "relogio-classic",
    nome: "Relógio Classic Minimal",
    categoria: "relogios",
    preco: 549.9,
    descricao: "Design minimalista, pulseira de couro legítimo e caixa em aço inoxidável. Resistente à água 5 ATM.",
    imagens: ["https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900&q=80"],
    variacoes: ["Couro marrom", "Couro preto"],
  },
  {
    id: "smartwatch-sport",
    nome: "Smartwatch Sport Series",
    categoria: "relogios",
    preco: 1249.0,
    precoAntigo: 1490.0,
    tag: "Novo",
    descricao: "Monitor cardíaco, GPS, notificações e mais de 100 modos de treino. Tela AMOLED always-on.",
    imagens: ["https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=900&q=80"],
    variacoes: ["41mm", "45mm"],
  },
  {
    id: "tenis-runner-red",
    nome: "Tênis Runner Red Edition",
    categoria: "tenis",
    preco: 699.9,
    tag: "Mais vendido",
    descricao: "Amortecimento responsivo, cabedal respirável e solado de alta tração. Conforto para o dia todo.",
    imagens: ["https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&q=80"],
    variacoes: ["38", "39", "40", "41", "42", "43"],
  },
  {
    id: "oculos-aviador",
    nome: "Óculos de Sol Aviador",
    categoria: "acessorios",
    preco: 279.9,
    precoAntigo: 349.9,
    descricao: "Lentes polarizadas com proteção UV400 e armação metálica leve.",
    imagens: ["https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=900&q=80"],
  },
  {
    id: "mochila-urban",
    nome: "Mochila Urban Travel",
    categoria: "acessorios",
    preco: 359.0,
    descricao: "Compartimento para notebook 15\", tecido impermeável e porta USB externa.",
    imagens: ["https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=900&q=80"],
    variacoes: ["Preta", "Cinza"],
  },
];
