# Rota Importados — Catálogo

Loja-catálogo da Rota Importados: o cliente navega pelos produtos, monta o carrinho e **finaliza o pedido pelo WhatsApp**. Os produtos vêm do **Catálogo Pro** (arquivo `loja.json` + fotos). Roda como app Node.js na Hostinger, sem dependências.

## Páginas

| Endereço | O que mostra |
|---|---|
| `/#/` | Início: destaque, departamentos, lançamentos, vitrines por tag/marca/departamento |
| `/#/catalogo?cat=&marca=&q=&ordem=&disp=1` | Listagem com filtros (departamento, marca, disponibilidade) e ordenação |
| `/#/produto/SKU` | Página do produto: galeria, preço, disponibilidade, especificações e relacionados |
| `/admin` | Painel administrativo com senha (veja abaixo) |

Os endereços com `#` funcionam sem configuração extra no servidor e podem ser compartilhados.

## Painel administrativo (`/admin`)

Entre com a senha definida em `ADMIN_SENHA`. A sessão dura 12 horas (e termina se o app for reiniciado/reimplantado). Após 8 senhas erradas, o acesso daquele IP fica bloqueado por 15 minutos.

| Seção | O que faz |
|---|---|
| **Visão geral** | Pedidos novos, produtos no site, esgotados, sem foto, sem preço, ocultos, editados; data da última importação e cotações |
| **Pedidos** | Pedidos feitos pelo carrinho do site e lançados no painel (**+ Novo pedido**), com situação (Novo, Em atendimento, Confirmado, Entregue, Cancelado) e anotação interna |
| **Produtos** | Busca e filtros; editar nome, marca, departamento, preço (US$), estoque, etiquetas, descrição, fotos e visibilidade; criar produtos; ocultar/mostrar vários de uma vez |
| **Importar** | Envio do ZIP do Catálogo Pro (mesma função de antes) |
| **Exportar** | Catálogo em PDF (A4) para enviar a clientes: filtros com/sem estoque, com/sem foto e por departamento; PDF completo, um PDF por departamento ou o de um departamento só. Capa com sumário, 9 produtos por página, preço igual ao do site (opcional) e link de cada produto para o site |
| **Loja** | Nome, slogan, WhatsApp, Instagram, cidade, horário e cotação manual do dólar |

**Como as edições convivem com o Catálogo Pro:** o que você altera no painel continua valendo depois de novas importações. Se o Catálogo Pro exportar um valor *diferente* para o mesmo campo, vale o do Catálogo Pro (a alteração mais recente ganha). Em cada produto há o botão **Desfazer edições** para voltar aos dados do Catálogo Pro.

**Dados do cliente** (no carrinho e no novo pedido do painel): nome completo, país (Brasil, Argentina ou Paraguai; Brasil vem selecionado), documento (CPF validado no Brasil; DNI na Argentina; CI no Paraguai) e endereço completo (rua, número, complemento opcional, bairro, cidade, estado/província/departamento e CEP — obrigatório só no Brasil).

**Pedidos do site:** são registrados quando o cliente clica em "Enviar pedido pelo WhatsApp". O envio da mensagem continua sendo feito pelo cliente no WhatsApp, então um pedido registrado pode não ter chegado ao seu WhatsApp. Os valores são os estimados no momento do pedido.

Arquivos gravados em `DATA_DIR`: `loja.json` (exportação original), `ajustes.json` (edições e produtos criados), `site.json` (dados da loja), `fotos/` e `privado/pedidos.json` (nunca servido ao público).

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

⚠️ Se um novo deploy apagar a pasta `data/`, você perde também os **pedidos, edições e fotos enviadas pelo painel** (o ZIP do Catálogo Pro pode ser reenviado). Para evitar isso, aponte `DATA_DIR` para uma pasta fora da pasta do app.

## Dados da loja

Pelo painel, em **Loja**, ou em **`js/config.js`** (valores padrão): nome, slogan, número do WhatsApp, Instagram, cidade e horário. **Campos vazios não aparecem no site.** Prioridade: painel → `config.js` → Catálogo Pro (o WhatsApp do Catálogo Pro só é usado se os outros dois estiverem vazios). Os produtos de exemplo desse arquivo só aparecem enquanto não existir um `loja.json`.

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
