# Rota Importados — Catálogo

Loja-catálogo da Rota Importados: o cliente navega pelos produtos, monta o carrinho e **finaliza o pedido pelo WhatsApp**. Os produtos vêm do **Catálogo Pro** (arquivo `loja.json` + fotos). Roda como app Node.js na Hostinger, sem dependências.

## Páginas

| Endereço | O que mostra |
|---|---|
| `/#/` | Início: destaque, departamentos, lançamentos, vitrines por tag/marca/departamento |
| `/#/catalogo?cat=&marca=&q=&ordem=&disp=1` | Listagem com filtros (departamento, marca, disponibilidade) e ordenação |
| `/#/produto/SKU` | Página do produto: galeria, preço, disponibilidade, especificações e relacionados |
| `/admin` | Painel com senha para enviar o ZIP exportado pelo Catálogo Pro |

Os endereços com `#` funcionam sem configuração extra no servidor e podem ser compartilhados.

## Atualizar produtos (dia a dia)

1. No **Catálogo Pro**: **Configurações → Site da loja → Exportar para o site**. Na primeira vez use **"Exportar com todas as fotos"**.
2. Abra **https://rotaimportados.com/admin**, digite a senha do painel e envie o(s) `loja-AAAA-MM-DD.zip`. Se vier em partes, selecione todas.
3. Pronto: o site mostra produtos, preços, estoque, setores e cotação do dia.

Dica: no Catálogo Pro, em **Site da loja → Endereço do site**, coloque `https://rotaimportados.com` para ganhar os botões "Abrir site" e "Painel do site".

### De onde vem cada informação

- **Departamentos**: setores do Catálogo Pro. **Marcas**: campo Marca.
- **Preço**: a base é em US$. Com cotação Pix no `loja.json`, o preço principal é em **R$ no Pix**, com US$ e valor em dinheiro embaixo. Sem cotação, mostra US$.
- **Disponibilidade**: campo Estoque (0 = Esgotado; até 3 = "Últimas unidades").
- **Lançamentos**: data de cadastro do produto. **Vitrines de destaque**: primeira tag de cada produto (ex.: "Mais vendido").
- **Ofertas**: só aparecem se houver preço anterior maior que o atual (o Catálogo Pro ainda não exporta esse dado).
- Nada é inventado: seções sem dados reais não aparecem.

## Configuração na Hostinger (uma vez)

Em **Websites → rotaimportados.com → Node.js → Variáveis de ambiente**:

| Variável | Valor |
|---|---|
| `ADMIN_SENHA` | a senha do painel `/admin` (sem ela o painel fica desativado) |
| `DATA_DIR` | opcional: pasta onde salvar `loja.json` e fotos (padrão: `data/` dentro do app) |

⚠️ Se um novo deploy apagar a pasta `data/`, basta reenviar o ZIP com **todas as fotos**. Para evitar isso, aponte `DATA_DIR` para uma pasta fora da pasta do app.

## Dados da loja

Em **`js/config.js`**: nome, slogan, número do WhatsApp, Instagram, cidade e horário. **Campos vazios não aparecem no site.** Se o Catálogo Pro tiver um WhatsApp preenchido, ele é usado no lugar do número do `config.js`. Os produtos de exemplo desse arquivo só aparecem enquanto não existir um `loja.json`.

## Visual

- Cores, fontes, raios, sombras e tempos ficam no topo de **`css/style.css`** (variáveis `:root`).
- Logo oficial em `img/logo.png` (gerado do arquivo original), ícones em `img/favicon.png` e `img/apple-touch-icon.png`.
- Ao alterar CSS ou JS, aumente o número `?v=` nos links do `index.html` para os clientes receberem a versão nova.

## Testar no computador

Precisa do Node.js 18+:

```bash
npm start
```

Depois abra http://localhost:3000 (para testar o painel, defina `ADMIN_SENHA` antes).
