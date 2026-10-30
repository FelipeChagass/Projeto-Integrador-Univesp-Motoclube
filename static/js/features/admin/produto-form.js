/**
 * Painel de cadastro e edição de produto (templates/admin/paineis/produtos.html), inclusive o
 * nome, o preço e a foto de um combo (os itens do combo ficam em combos.js). A foto escolhida
 * só é enviada depois que o produto é salvo; não há remoção de foto já gravada no servidor.
 */
import { API } from "../../shared/api.js";
import { temCategoriaCombo } from "../../shared/combos.js";
import { mensagemErro } from "../../shared/utils.js";
import { requisitar } from "./requests.js";
import { toast, avisarCampo } from "./ui.js";
import { abrirPainel, fecharPainel } from "./painel.js";
import { buscarProduto, carregarProdutos } from "./produtos.js";

const PAINEL = "painel-produto";
let produtoEmEdicao = null;

const campo = (id) => document.getElementById(id);

/** Mostra a foto (escolhida agora ou já gravada) ou a área de envio quando não há foto. */
function mostrarImagem(url, { removivel = false } = {}) {
  const previa = campo("produto-previa");
  campo("produto-previa-img").src = url || "";
  previa.classList.toggle("d-none", !url);
  previa.classList.toggle("d-flex", Boolean(url));
  campo("produto-upload-zone").classList.toggle("d-none", Boolean(url));
  campo("produto-remover-imagem").classList.toggle("d-none", !removivel);
}

function preencher(produto) {
  const combo = Boolean(produto && temCategoriaCombo(produto));
  campo("produto-nome").value = produto?.nome || "";
  campo("produto-preco").value = produto?.preco_atual ?? "";
  campo("produto-categoria").value = combo
    ? "bebida"
    : produto?.categoria || "bebida";
  document
    .querySelector(`#${PAINEL} [data-campo-categoria]`)
    .classList.toggle("d-none", combo);
  campo("produto-arquivo").value = "";
  mostrarImagem(produto?.url_imagem || "");
}

export function abrirNovoProduto() {
  produtoEmEdicao = null;
  preencher(null);
  abrirPainel(PAINEL, { titulo: "Novo produto", aoSalvar: salvarProduto });
}

export function abrirEdicaoProduto(id) {
  const produto = buscarProduto(id);
  if (!produto) return;
  produtoEmEdicao = produto;
  preencher(produto);
  abrirPainel(PAINEL, {
    titulo: temCategoriaCombo(produto) ? "Editar combo" : "Editar produto",
    complemento: produto.nome,
    aoSalvar: salvarProduto,
  });
}

export async function salvarProduto() {
  const nome = campo("produto-nome").value.trim();
  const preco_atual = parseFloat(campo("produto-preco").value) || 0;
  if (!nome) return avisarCampo("produto-nome", "Informe o nome do produto.");
  if (preco_atual <= 0)
    return avisarCampo("produto-preco", "O preço deve ser maior que zero.");
  const dados = { nome, preco_atual };
  if (!produtoEmEdicao || !temCategoriaCombo(produtoEmEdicao))
    dados.categoria = campo("produto-categoria").value;

  const dadosResposta = await requisitar(
    produtoEmEdicao ? "PUT" : "POST",
    produtoEmEdicao
      ? `/admin/produtos/${produtoEmEdicao.id}`
      : `/admin/produtos`,
    dados,
  );
  if (!dadosResposta) return;
  if (dadosResposta.status !== "ok")
    return toast(dadosResposta.mensagem || "Produto não salvo.", false);

  const produtoId = produtoEmEdicao?.id ?? dadosResposta.produto?.id;
  const arquivo = campo("produto-arquivo").files?.[0];
  if (arquivo && produtoId) await enviarImagem(produtoId, arquivo);
  toast(produtoEmEdicao ? "Produto atualizado." : "Produto criado.", true);
  fecharPainel(PAINEL);
  carregarProdutos();
}

async function enviarImagem(produtoId, arquivoImagem) {
  const dadosFormulario = new FormData();
  dadosFormulario.append("imagem", arquivoImagem);
  try {
    await API.request(
      "POST",
      `/admin/produtos/${produtoId}/imagem`,
      dadosFormulario,
    );
    return true;
  } catch (erro) {
    toast(mensagemErro(erro, "Não foi possível enviar a imagem."), false);
    return false;
  }
}

/** Liga a escolha de foto do painel; chamado uma vez por events.js. */
export function configurarFormProduto() {
  const arquivo = campo("produto-arquivo");
  if (!arquivo) return;
  const escolher = () => arquivo.click();
  campo("produto-upload-zone").addEventListener("click", escolher);
  campo("produto-trocar-imagem").addEventListener("click", escolher);
  arquivo.addEventListener("change", () => {
    const escolhido = arquivo.files?.[0];
    if (!escolhido) return;
    const leitor = new FileReader();
    leitor.onload = (evento) =>
      mostrarImagem(evento.target.result, { removivel: true });
    leitor.readAsDataURL(escolhido);
  });
  // Remover descarta só a foto escolhida agora e volta para a gravada (ou nenhuma).
  campo("produto-remover-imagem").addEventListener("click", () => {
    arquivo.value = "";
    mostrarImagem(produtoEmEdicao?.url_imagem || "");
    campo("produto-upload-zone").focus();
  });
}
