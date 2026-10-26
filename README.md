# Rota Importados — Catálogo

Catálogo online com carrinho e finalização do pedido pelo WhatsApp. Site estático (HTML, CSS e JavaScript puros), sem servidor nem banco de dados — pode ser hospedado de graça no GitHub Pages.

## Como editar

Tudo que você precisa mudar fica em **`js/config.js`**:

- **`whatsapp`** — número que recebe os pedidos (DDI + DDD + número, só dígitos, ex: `5511999998888`)
- **`instagram`**, **`slogan`**, **`horario`**
- **`CATEGORIAS`** — lista de categorias
- **`PRODUTOS`** — nome, preço (`null` = "Sob consulta"), preço antigo (mostra % de desconto), tag, descrição, imagens e variações

Para usar fotos próprias, coloque os arquivos numa pasta `img/` e use `imagens: ["img/meu-produto.jpg"]`.

## Testar no computador

```bash
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Depois abra http://localhost:5500

## Publicar (GitHub Pages)

No repositório do GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / root**. Em ~1 minuto o site fica no ar em `https://SEU-USUARIO.github.io/rota-importados/`.
