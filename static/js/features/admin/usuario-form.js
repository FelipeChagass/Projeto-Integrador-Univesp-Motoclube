/**
 * Painel de usuário (templates/admin/paineis/usuarios.html): cadastro e edição do acesso.
 * No cadastro a senha é obrigatória; na edição é opcional e só é trocada se preenchida
 * (o backend ignora senha vazia). A identidade no Auth é responsabilidade do backend.
 */
import { requisitar } from "./requests.js";
import { toast, avisarCampo } from "./ui.js";
import { abrirPainel, fecharPainel } from "./painel.js";
import { buscarUsuario, carregarUsuarios } from "./usuarios.js";

const PAINEL = "painel-usuario";
const SENHA_MINIMA = 6;
let usuarioEmEdicao = null;

const campo = (id) => document.getElementById(id);

function preencher(usuario) {
  campo("usuario-nome").value = usuario?.nome || "";
  campo("usuario-email").value = usuario?.email || "";
  campo("usuario-senha").value = "";
  campo("usuario-perfil").value = usuario?.perfil || "operador";
  campo("usuario-senha-rotulo").textContent = usuario
    ? "Nova senha (opcional)"
    : "Senha inicial";
  campo("usuario-senha").placeholder = usuario
    ? "Manter a atual"
    : `Mínimo ${SENHA_MINIMA} caracteres`;
}

export function abrirNovoUsuario() {
  usuarioEmEdicao = null;
  preencher(null);
  abrirPainel(PAINEL, { titulo: "Novo usuário", aoSalvar: salvarUsuario });
}

export function abrirEdicaoUsuario(id) {
  const usuario = buscarUsuario(id);
  if (!usuario) return;
  usuarioEmEdicao = usuario;
  preencher(usuario);
  abrirPainel(PAINEL, {
    titulo: "Editar usuário",
    complemento: usuario.nome,
    aoSalvar: salvarUsuario,
  });
}

export async function salvarUsuario() {
  const dados = {
    nome: campo("usuario-nome").value.trim(),
    email: campo("usuario-email").value.trim(),
    senha: campo("usuario-senha").value.trim(),
    perfil: campo("usuario-perfil").value,
  };
  if (!dados.nome) return avisarCampo("usuario-nome", "Informe o nome.");
  if (!dados.email) return avisarCampo("usuario-email", "Informe o e-mail.");
  if (!usuarioEmEdicao && !dados.senha)
    return avisarCampo("usuario-senha", "Informe a senha inicial.");
  if (dados.senha && dados.senha.length < SENHA_MINIMA)
    return avisarCampo(
      "usuario-senha",
      `A senha deve ter pelo menos ${SENHA_MINIMA} caracteres.`,
    );

  const dadosResposta = await requisitar(
    usuarioEmEdicao ? "PUT" : "POST",
    usuarioEmEdicao
      ? `/admin/usuarios/${usuarioEmEdicao.id}`
      : `/admin/usuarios`,
    dados,
  );
  if (!dadosResposta) return;
  toast(dadosResposta.mensagem, dadosResposta.status === "ok");
  if (dadosResposta.status === "ok") {
    fecharPainel(PAINEL);
    carregarUsuarios();
  }
}
