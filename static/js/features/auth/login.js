/** Entrada do login: autentica no Supabase e consulta o perfil local autorizado. */
import { API } from "../../shared/api.js";
import { UIModal } from "../../shared/modals.js";
import { mensagemErro } from "../../shared/utils.js";
function showToast(mensagem) {
  const elementoToast = document.getElementById("login-toast");
  elementoToast.innerText = mensagem;
  elementoToast.className = "login-toast show";
  setTimeout(() => {
    elementoToast.className = "login-toast";
  }, 3000);
}

function setLoading(exibirCarregamento) {
  document.getElementById("login-loading").className = exibirCarregamento
    ? "login-loading active"
    : "login-loading";
}

function redirecionarParaPdv() {
  setLoading(true);
  window.location.replace("/");
}

function alternarSenha() {
  const campoSenha = document.getElementById("login-senha");
  const iconeFechado = document.getElementById("icon-olho-fechado");
  const iconeAberto = document.getElementById("icon-olho-aberto");
  const mostrar = campoSenha.type === "password";
  campoSenha.type = mostrar ? "text" : "password";
  iconeFechado.classList.toggle("d-none", mostrar);
  iconeAberto.classList.toggle("d-none", !mostrar);
  document
    .getElementById("btn-toggle-senha")
    ?.setAttribute("aria-pressed", String(mostrar));
}

const lembrarMeAtivo = localStorage.getItem("motoBarLembrarMe") === "true";

if (lembrarMeAtivo) {
  API._initSupabase()
    .then((clienteSupabase) => {
      if (!clienteSupabase) return;
      return clienteSupabase.auth.getSession();
    })
    .then((resultadoSessao) => {
      if (
        !resultadoSessao ||
        !resultadoSessao.data ||
        !resultadoSessao.data.session
      )
        return;

      return API.getMe().then((respostaPerfil) => {
        if (respostaPerfil.status === "ok" && respostaPerfil.usuario) {
          window.location.replace("/");
        }
      });
    })
    .catch(() => {
      localStorage.removeItem("motoBarLembrarMe");
      API.logout().catch(() => {});
    });
} else {
  API._initSupabase()
    .then((clienteSupabase) => {
      if (clienteSupabase) {
        clienteSupabase.auth.getSession().then((resultadoSessao) => {
          if (
            resultadoSessao &&
            resultadoSessao.data &&
            resultadoSessao.data.session
          ) {
            API.logout().catch(() => {});
          }
        });
      }
    })
    .catch(() => {});
}

document
  .getElementById("login-senha")
  .addEventListener("keydown", (eventoTeclado) => {
    if (eventoTeclado.key === "Enter") realizarLogin();
  });

function realizarLogin() {
  const email = document.getElementById("login-email").value.trim();
  const senha = document.getElementById("login-senha").value;
  const lembrarSessao = document.getElementById("lembrar-me").checked;
  if (!email || !senha) return showToast("Preencha e-mail e senha.");

  setLoading(true);

  API.login(email, senha)
    .then((respostaLogin) => {
      if (respostaLogin.status === "ok") {
        if (lembrarSessao) {
          localStorage.setItem("motoBarLembrarMe", "true");
        } else {
          localStorage.removeItem("motoBarLembrarMe");
        }

        return API.getMe().then((respostaPerfil) => {
          if (respostaPerfil.status === "pendente") {
            const nomeUsuario =
              (respostaLogin.usuario &&
                respostaLogin.usuario.user_metadata &&
                respostaLogin.usuario.user_metadata.nome) ||
              email.split("@")[0];
            return API.request("POST", "/auth/sincronizar", {
              nome: nomeUsuario,
              perfil: "operador",
            }).then(() => {
              redirecionarParaPdv();
            });
          }
          if (respostaPerfil.status !== "ok" || !respostaPerfil.usuario)
            throw new Error("Perfil ainda não autorizado.");
          redirecionarParaPdv();
        });
      } else {
        setLoading(false);
        showToast(respostaLogin.mensagem || "Erro no login.");
      }
    })
    .catch((erroLogin) => {
      setLoading(false);
      showToast(mensagemErro(erroLogin, "Não foi possível entrar."));
    });
}

document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("btn-toggle-senha")
    ?.addEventListener("click", alternarSenha);
  document
    .getElementById("btn-login")
    ?.addEventListener("click", realizarLogin);
});
