/** Estado de edição restrito à linha; cancelar restaura o que foi carregado. */
export function prepararEdicao(linha) {
  const botaoSalvar = linha.querySelector('[data-action^="salvar-"]');
  if (!botaoSalvar) return;
  const campos = [...linha.querySelectorAll("[data-campo]")];
  campos.forEach((campo) => {
    campo.disabled = true;
  });
  botaoSalvar.classList.add("d-none");
  const botaoEditar = document.createElement("button");
  botaoEditar.type = "button";
  botaoEditar.className = "btn btn-escuro flex-fill";
  botaoEditar.textContent = "Editar";
  const botaoCancelar = document.createElement("button");
  botaoCancelar.type = "button";
  botaoCancelar.className = "btn btn-escuro flex-fill d-none";
  botaoCancelar.textContent = "Cancelar";
  let valoresOriginais;
  const alternar = (edicaoAtiva) => {
    campos.forEach((campo) => {
      campo.disabled = !edicaoAtiva;
    });
    botaoSalvar.classList.toggle("d-none", !edicaoAtiva);
    botaoCancelar.classList.toggle("d-none", !edicaoAtiva);
    botaoEditar.classList.toggle("d-none", edicaoAtiva);
  };
  botaoEditar.addEventListener("click", () => {
    valoresOriginais = campos.map((campo) => campo.value);
    alternar(true);
    campos[0]?.focus();
  });
  botaoCancelar.addEventListener("click", () => {
    campos.forEach((campo, indice) => {
      campo.value = valoresOriginais[indice];
    });
    alternar(false);
    botaoEditar.focus();
  });
  botaoSalvar.before(botaoEditar);
  botaoSalvar.after(botaoCancelar);
}
