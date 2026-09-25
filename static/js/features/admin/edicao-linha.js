/** Estado de edição restrito à linha; cancelar restaura o que foi carregado. */
export function prepararEdicao(linha) {
    const salvar = linha.querySelector('[data-action^="salvar-"]');
    if (!salvar) return;
    const campos = [...linha.querySelectorAll('[data-campo]')];
    campos.forEach(campo => { campo.disabled = true; });
    salvar.classList.add('d-none');
    const editar = document.createElement('button');
    editar.type = 'button';
    editar.className = 'btn btn-sm';
    editar.textContent = 'Editar';
    const cancelar = document.createElement('button');
    cancelar.type = 'button';
    cancelar.className = 'btn btn-sm d-none';
    cancelar.textContent = 'Cancelar';
    let valores;
    const alternar = ativo => {
        campos.forEach(campo => { campo.disabled = !ativo; });
        salvar.classList.toggle('d-none', !ativo);
        cancelar.classList.toggle('d-none', !ativo);
        editar.classList.toggle('d-none', ativo);
    };
    editar.addEventListener('click', () => {
        valores = campos.map(campo => campo.value);
        alternar(true);
        campos[0]?.focus();
    });
    cancelar.addEventListener('click', () => {
        campos.forEach((campo, indice) => { campo.value = valores[indice]; });
        alternar(false);
        editar.focus();
    });
    salvar.before(editar);
    salvar.after(cancelar);
}
