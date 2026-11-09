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
| **Pedidos** | Pedidos feitos pelo carrinho do site e lançados no painel (**+ Novo pedido**), em **quadro (kanban)** ou lista, com busca. No quadro, cada coluna é uma situação: arraste o cartão (ou use a lista do cartão) para mudar; clique no cartão para ver os detalhes. **⚙️ Situações**: criar, renomear, colorir, ordenar e remover situações (a primeira recebe os pedidos novos; os pedidos de uma situação removida vão para a que você escolher). Cada pedido tem anotação interna, **custo unitário em R$** de cada item (o último custo de cada produto é lembrado e já vem preenchido nos próximos pedidos, inclusive nos do site) e **fretes e rastreio** (🚚: um ou mais envios, cada um com transportadora, código de rastreio e custo pago pela loja; o código vira link de rastreio e entra no texto do WhatsApp). O pedido mostra recebido − custo dos produtos − frete = **lucro**. Cada pedido pode ser **editado** (cliente, WhatsApp do cliente, itens, quantidades, preços, frete e desconto; total recalculado), baixado em **PDF** e enviado como **texto para o WhatsApp** (copiar ou abrir a conversa do cliente) para confirmar com ele |
| **Resultados** | Por período (7/30/90 dias, este mês, mês passado, ano, tudo): faturamento, lucro e margem, custo dos produtos, custo de frete, pedidos e ticket médio; gráfico de faturamento e lucro por dia/semana/mês (com tabela), **itens mais vendidos** e **produtos que mais dão lucro**. Só contam as situações marcadas como “Conta nas vendas” em ⚙️ Situações (Cancelado vem desmarcada). Pedidos em US$ são convertidos pela cotação Pix atual |
| **Produtos** | Busca e filtros; editar nome, marca, departamento, preço (US$), estoque, etiquetas, descrição, fotos e visibilidade; criar produtos; ocultar/mostrar vários de uma vez |
| **Banner** | Banners do topo da página inicial (até 8, em carrossel): formato "texto ao lado da imagem", "texto sobre a imagem" ou "só imagem" (arte pronta), com etiqueta, título, subtítulo, 2 botões, imagem e versão para celular; links por lista (catálogo, departamento, marca, produto, WhatsApp ou endereço externo); ativar/desativar e reordenar; tempo de troca. Também o aviso da faixa superior. Sem banner ativo, o site mostra o destaque automático |
| **Pendências** | **Possíveis duplicados**: grupos de produtos com o mesmo nome (sem acentos/pontuação) ou o mesmo código com e sem zeros à esquerda, lado a lado com preço e estoque; ocultar ou **excluir** (🗑️) os que sobram, ou marcar "Não são duplicados". **Excluir**: produto criado no painel ou extra é apagado de vez; produto do Catálogo Pro sai do site e do painel e vai para "🗑️ Excluídos" (continua excluído mesmo se reenviado, e pode ser restaurado). **Exibição no site**: marcar/desmarcar se produtos sem foto, sem descrição ou sem estoque aparecem no site (nada é apagado; o backup continua completo). Lista de produtos sem foto e/ou sem descrição, com busca e filtro por departamento. **IA de descrições**: gera textos para os produtos sem descrição (selecionados ou a página inteira); cada texto aparece para revisar e editar, e só vai para o site quando você clica em Salvar |
| **Importar/Exportar** | Importar: envio do ZIP do Catálogo Pro (mesma função de antes), ou de um ZIP de **produtos extras** (`produtos-extras.json` do tipo `rota-produtos-extras` + `fotos/`), que **soma** produtos ao catálogo em vez de substituí-lo (mesmo SKU atualiza; SKU do Catálogo Pro é ignorado). Exportar: **ZIP de backup** no mesmo formato (`loja.json` + fotos, com edições e produtos do painel, com ou sem fotos), que pode ser reimportado aqui; e **planilha CSV** para Excel (todos ou só visíveis) |
| **Catálogo PDF** | Catálogo em PDF (A4) para enviar a clientes: filtros com/sem estoque, com/sem foto e por departamento; PDF completo, um PDF por departamento ou o de um departamento só. Capa com sumário, 9 produtos por página, preço igual ao do site (opcional) e link de cada produto para o site |
| **Importar/Exportar → Fotos em lote** | Envie várias fotos de uma vez; cada uma é ligada ao produto pelo nome do arquivo (código, ex. `ADM2-8882 (2).jpg`, ou nome do produto). As não reconhecidas mostram sugestões, e o botão **🤖 Identificar com IA** lê o rótulo da foto (marca, nome, volume) e sugere os produtos do catálogo para você confirmar; escolha usar só em produtos sem foto, adicionar ou substituir |
| **Loja** | Nome, slogan, WhatsApp, Instagram, cidade, horário, **Google Analytics** (ID `G-…`: o site passa a enviar as páginas e produtos visitados, “adicionou ao carrinho” e “enviou pedido pelo WhatsApp”; vazio = desligado), acréscimo e parcelas do cartão, cotação manual do dólar e **departamentos (categorias)**: criar, excluir (os produtos vão para outra categoria), ordenar (vale para o menu, a navegação, a página inicial, os filtros e o catálogo PDF) e **subcategorias** por categoria (criar com Enter, excluir no ×; no site viram um filtro dentro do departamento). Na aba Produtos, “Mudar categoria…” move os selecionados de categoria/subcategoria |

**Independente do Catálogo Pro:** na primeira vez que o servidor sobe com esta versão, todos os produtos do Catálogo Pro (já com as edições do painel; os excluídos ficam de fora) viram produtos do próprio Rota, com os mesmos códigos. A exportação original fica guardada em `loja-catalogo-pro-original.json`. Depois disso, tudo é editado só no painel. Um ZIP do Catálogo Pro não altera mais a lista de produtos (só fotos e produtos extras do ZIP são usados), e um **backup baixado do painel** restaura todos os produtos (substitui a lista).

**Dados do cliente** (no carrinho e no novo pedido do painel): nome completo, país (Brasil, Argentina ou Paraguai; Brasil vem selecionado), documento (CPF validado no Brasil; DNI na Argentina; CI no Paraguai) e endereço completo (rua, número, complemento opcional, bairro, cidade, estado/província/departamento e CEP — obrigatório só no Brasil).

**Pedidos do site:** são registrados quando o cliente clica em "Enviar pedido pelo WhatsApp". O envio da mensagem continua sendo feito pelo cliente no WhatsApp, então um pedido registrado pode não ter chegado ao seu WhatsApp. Os valores são os estimados no momento do pedido.

Arquivos gravados em `DATA_DIR`: `loja.json` (dados gerais: departamentos, cotação, marca), `ajustes.json` (todos os produtos), `loja-catalogo-pro-original.json` (cópia da última exportação do Catálogo Pro, guardada na independência), `site.json` (dados da loja), `fotos/` e `privado/` (nunca servido ao público): `pedidos.json`, `pedido-status.json` (situações do quadro) e `custos.json` (último custo de cada produto).

## Atualizar produtos (dia a dia)

Tudo pelo painel (**https://rotaimportados.com/admin**): crie e edite produtos na aba **Produtos**, ajuste a cotação na aba **Loja**, adicione muitos produtos de uma vez com um ZIP de **produtos extras** e fotos com **Fotos em lote**. Baixe um backup (Importar/Exportar → Exportar) antes de cada atualização do site.

### De onde vem cada informação

- **Departamentos**: setores do Catálogo Pro. **Marcas**: campo Marca.
- **Preço**: a base é em US$. Com cotação Pix no `loja.json`, o preço principal é em **R$ no Pix**, com US$ e valor em dinheiro embaixo. Sem cotação, mostra US$.
- **Disponibilidade**: campo Estoque (0 = Esgotado; até 3 = "Últimas unidades").
- **Lançamentos**: data de cadastro do produto. **Vitrines de destaque**: primeira tag de cada produto (ex.: "Mais vendido").
- **Ofertas**: definidas no painel (editor do produto → **Oferta / promoção**). Cada uma tem preço da oferta, início (opcional) e fim. O preço pode ser em **US$** (o valor em reais acompanha a cotação) ou em **R$** (fixo no Pix, não muda com o dólar). Dentro do prazo, o site mostra o preço da oferta, o preço normal riscado, o selo de desconto, a vitrine **Ofertas** e uma contagem regressiva na página do produto. Fora do prazo, volta ao preço normal sozinho. A lista de Produtos tem os filtros **Em oferta agora**, **Ofertas agendadas** e **Ofertas encerradas**.
- Nada é inventado: seções sem dados reais não aparecem.

## Configuração na Hostinger (uma vez)

Em **Websites → rotaimportados.com → Node.js → Variáveis de ambiente**:

| Variável | Valor |
|---|---|
| `ADMIN_SENHA` | a senha do painel `/admin` (sem ela o painel fica desativado) |
| `DATA_DIR` | opcional: pasta onde salvar catálogo, fotos, edições, pedidos e banners. Padrão: `~/rota-importados-dados`, na pasta pessoal da conta (a Hostinger monta cada deploy numa pasta de versão nova, então nada dentro ou ao lado do app sobrevive); na primeira vez, copia os dados mais recentes das versões anteriores. Se não der para criar essa pasta, usa `data/` dentro do app |
| `ANTHROPIC_API_KEY` | opcional: chave da API da Anthropic (console.anthropic.com) para a IA de descrições e de identificação de fotos. Sem ela, a IA fica desativada e o resto funciona normalmente |
| `IA_MODELO` | opcional: modelo do Claude usado pela IA (padrão: `claude-opus-5-5`) |

A IA usa a biblioteca oficial `@anthropic-ai/sdk` (em `package.json`); a Hostinger a instala no deploy. Ela escreve só com os dados do produto (nome, marca, departamento, tipo, notas, volume, etiquetas) e é instruída a não inventar características; mesmo assim, revise cada texto. O custo é cobrado pela Anthropic na conta da chave, por descrição gerada.

⚠️ Um novo deploy recria a pasta do app: por isso os dados ficam, por padrão, na pasta pessoal da conta (`~/rota-importados-dados`). Na **Visão geral** do painel, "Dados guardados" mostra "✓ fora da pasta do app" quando está tudo seguro; se aparecer o aviso ⚠️, defina `DATA_DIR`.

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
