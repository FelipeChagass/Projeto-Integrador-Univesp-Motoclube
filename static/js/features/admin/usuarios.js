import { prepararEdicao } from "./edicao-linha.js";
/**
 * Cadastro e ativação de usuários via API administrativa, sem acesso direto ao Auth.
 * Exporta usuarios como binding vivo para navigation.js; autorização pertence ao backend.
 */
import { UIModal } from "../../shared/modals.js";
import { BASE, authFetch } from "./requests.js";
import {
  esc,
  toast,
  mostrarEsqueleto,
  CLASSES_TABELA as T,
  badgeStatus,
} from "./ui.js";

export let usuarios = [];

export async function carregarUsuarios() {
  mostrarEsqueleto("tabelaUsuarios");
  const resposta = await authFetch(`${BASE}/api/admin/usuarios`);
  if (!resposta) return;
  const dadosResposta = await resposta.json();
  usuarios = dadosResposta.usuarios || [];
  renderizarUsuarios();
}

export function abrirFormNovoUsuario() {
  document.getElementById("formNovoUsuario").classList.remove("d-none");
  document.body.classList.add("modal-open");
  document.getElementById("novo-user-nome").value = "";
  document.getElementById("novo-user-email").value = "";
  document.getElementById("novo-user-senha").value = "";
  document.getElementById("novo-user-perfil").value = "operador";
  document.getElementById("novo-user-nome").focus();
}

export function fecharFormNovoUsuario() {
  document.getElementById("formNovoUsuario").classList.add("d-none");
  document.body.classList.remove("modal-open");
}

export async function criarNovoUsuario() {
  const nome = document.getElementById("novo-user-nome").value.trim();
  const email = document.getElementById("novo-user-email").value.trim();
  const senha = document.getElementById("novo-user-senha").value.trim();
  const perfil = document.getElementById("novo-user-perfil").value;

  if (!nome || !email || !senha)
    return toast("Nome, e-mail e senha são obrigatórios", false);
  if (senha.length < 6)
    return toast("A senha deve ter pelo menos 6 caracteres", false);

  const resposta = await authFetch(`${BASE}/api/admin/usuarios`, {
    method: "POST",
    body: JSON.stringify({ nome, email, senha, perfil }),
  });
  if (!resposta) return;
  const dadosResposta = await resposta.json();
  toast(dadosResposta.mensagem, dadosResposta.status === "ok");
  if (dadosResposta.status === "ok") {
    fecharFormNovoUsuario();
    carregarUsuarios();
  }
}

export function renderizarUsuarios() {
  const corpoTabela = document.getElementById("tabelaUsuarios");
  corpoTabela.innerHTML = "";
  usuarios.forEach((usuario) => {
    const linhaUsuario = document.createElement("tr");
    linhaUsuario.className = T.linha;
    if (!usuario.ativo) linhaUsuario.classList.add("opacity-50");
    linhaUsuario.innerHTML = `
            <td class="${T.celula}" data-label="Nome"><input class="${T.campo}" value="${esc(usuario.nome)}" data-uid="${usuario.id}" data-campo="nome" aria-label="Nome"></td>
            <td class="${T.celula}" data-label="Email"><input class="${T.campo}" type="email" value="${esc(usuario.email)}" data-uid="${usuario.id}" data-campo="email" aria-label="Email"></td>
            <td class="${T.celula}" data-label="Nova Senha"><input class="${T.campo}" type="password" value="" data-uid="${usuario.id}" data-campo="senha" placeholder="Opcional" aria-label="Nova senha"></td>
            <td class="${T.celula}" data-label="Perfil"><select class="${T.selecao}" data-uid="${usuario.id}" data-campo="perfil" aria-label="Perfil">
                <option value="operador" ${usuario.perfil === "operador" ? "selected" : ""}>Operador</option>
                <option value="admin" ${usuario.perfil === "admin" ? "selected" : ""}>Admin</option>
            </select></td>
            <td class="${T.celulaStatus}" data-label="Status">${badgeStatus(usuario.ativo)}</td>
            <td class="${T.celulaAcoes}"><div class="${T.acoes}">
                <button class="btn btn-escuro flex-fill" data-action="salvar-usuario" data-id="${usuario.id}">Salvar</button>
                <button class="btn btn-excluir flex-fill" data-action="excluir-usuario" data-id="${usuario.id}" data-nome="${esc(usuario.nome)}">Excluir</button>
                ${!usuario.ativo ? `<button class="btn btn-escuro flex-fill" data-action="toggle-usuario" data-id="${usuario.id}" data-ativo="true">Reativar</button>` : ""}
            </div></td>`;
    prepararEdicao(linhaUsuario);
    corpoTabela.appendChild(linhaUsuario);
  });
}

export async function salvarUsuario(id) {
  const dados = {};
  document.querySelectorAll(`[data-uid="${id}"]`).forEach((campoUsuario) => {
    dados[campoUsuario.dataset.campo] = campoUsuario.value;
  });
  const resposta = await authFetch(`${BASE}/api/admin/usuarios/${id}`, {
    method: "PUT",
    body: JSON.stringify(dados),
  });
  if (!resposta) return;
  const dadosResposta = await resposta.json();
  toast(dadosResposta.mensagem, dadosResposta.status === "ok");
  if (dadosResposta.status === "ok") carregarUsuarios();
}

export async function alternarUsuario(id, ativo) {
  const resposta = await authFetch(`${BASE}/api/admin/usuarios/${id}`, {
    method: "PUT",
    body: JSON.stringify({ ativo }),
  });
  if (!resposta) return;
  const dadosResposta = await resposta.json();
  toast(dadosResposta.mensagem, dadosResposta.status === "ok");
  if (dadosResposta.status === "ok") carregarUsuarios();
}

export async function excluirUsuario(id, nome) {
  UIModal.confirm(
    `Excluir definitivamente o acesso autenticavel de "${nome}"?`,
    async function () {
      const resposta = await authFetch(`${BASE}/api/admin/usuarios/${id}`, {
        method: "DELETE",
      });
      if (!resposta) return;
      const dadosResposta = await resposta.json();
      toast(dadosResposta.mensagem, dadosResposta.status === "ok");
      if (dadosResposta.status === "ok") carregarUsuarios();
    },
  );
}
