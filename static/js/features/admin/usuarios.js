/**
 * Usuários no painel: lista, tabela (linhas só de leitura), reativação e exclusão via API
 * administrativa, sem acesso direto ao Auth. Cadastro e edição ficam em usuario-form.js.
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
import { htmlAcoes, ACAO } from "./acoes-linha.js";

export let usuarios = [];

const NOME_PERFIL = { operador: "Operador", admin: "Administrador" };

export function buscarUsuario(id) {
  return usuarios.find((usuario) => String(usuario.id) === String(id));
}

export async function carregarUsuarios() {
  mostrarEsqueleto("tabelaUsuarios");
  const resposta = await authFetch(`${BASE}/api/admin/usuarios`);
  if (!resposta) return;
  const dadosResposta = await resposta.json();
  usuarios = dadosResposta.usuarios || [];
  renderizarUsuarios();
}

export function renderizarUsuarios() {
  const corpoTabela = document.getElementById("tabelaUsuarios");
  corpoTabela.innerHTML = "";
  usuarios.forEach((usuario) => {
    const linhaUsuario = document.createElement("tr");
    linhaUsuario.className = T.linha;
    if (!usuario.ativo) linhaUsuario.classList.add("opacity-50");
    linhaUsuario.innerHTML = `
            <td class="${T.celula} fw-semibold" data-label="Nome">${esc(usuario.nome)}</td>
            <td class="${T.celula} text-break" data-label="Email">${esc(usuario.email)}</td>
            <td class="${T.celula}" data-label="Perfil">${NOME_PERFIL[usuario.perfil] || esc(usuario.perfil)}</td>
            <td class="${T.celulaStatus}" data-label="Status">${badgeStatus(usuario.ativo)}</td>
            <td class="${T.celulaAcoes}">${htmlAcoes(
              { id: usuario.id, nome: usuario.nome },
              {
                editar: ACAO.editar("editar-usuario"),
                excluir: ACAO.excluir("excluir-usuario"),
                mais: usuario.ativo ? [] : [ACAO.reativar("reativar-usuario")],
              },
            )}</td>`;
    corpoTabela.appendChild(linhaUsuario);
  });
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
    `Excluir definitivamente o acesso de "${nome}"?`,
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
