# Rota Importados — Catálogo

Catálogo online com carrinho e finalização do pedido pelo WhatsApp. Os produtos vêm do **Catálogo Pro** (arquivo `loja.json` + fotos). Roda como app Node.js na Hostinger, sem dependências.

## Atualizar produtos (dia a dia)

1. No **Catálogo Pro**: **Configurações → Site da loja → Exportar para o site**. Na primeira vez use **"Exportar com todas as fotos"**.
2. Abra **https://rotaimportados.com/admin**, digite a senha do painel e envie o(s) `loja-AAAA-MM-DD.zip`. Se vier em partes, selecione todas.
3. Pronto: o site mostra produtos, preços, estoque, setores e cotação do dia.

Dica: no Catálogo Pro, em **Site da loja → Endereço do site**, coloque `https://rotaimportados.com` para ganhar os botões "Abrir site" e "Painel do site".

### Como os preços aparecem

- A base do Catálogo Pro é em **US$**. Se houver cotação **Pix**, o preço principal é em **R$ no Pix**, e embaixo aparecem o valor em US$ e o valor em dinheiro (cotação "efetivo").
- Sem cotação, o site mostra os preços em US$.
- Produto sem preço → "Sob consulta". Estoque 0 → "Esgotado" com botão "Avise-me". Produto inativo não aparece.

## Configuração na Hostinger (uma vez)

Em **Websites → rotaimportados.com → Node.js → Variáveis de ambiente**:

| Variável | Valor |
|---|---|
| `ADMIN_SENHA` | a senha do painel `/admin` (sem ela o painel fica desativado) |
| `DATA_DIR` | opcional: pasta onde salvar `loja.json` e fotos (padrão: `data/` dentro do app) |

⚠️ Se um novo deploy apagar a pasta `data/`, basta reenviar o ZIP com **todas as fotos**. Para evitar isso, aponte `DATA_DIR` para uma pasta fora da pasta do app.

## Outros ajustes

Em **`js/config.js`**: nome, slogan, Instagram, horário e número do WhatsApp (se o Catálogo Pro tiver um WhatsApp preenchido, ele é usado no lugar). Os produtos de exemplo desse arquivo só aparecem enquanto não existir um `loja.json`.

## Testar no computador

Precisa do Node.js 18+:

```bash
npm start
```

Depois abra http://localhost:3000 (para testar o painel, defina `ADMIN_SENHA` antes).
