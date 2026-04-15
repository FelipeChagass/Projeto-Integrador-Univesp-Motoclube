function showToast(msg) {
    var t = document.getElementById('cadastro-toast');
    t.innerText = msg;
    t.className = 'cadastro-toast show';
    setTimeout(function () { t.className = 'cadastro-toast'; }, 3000);
}

function setLoading(show) {
    document.getElementById('cadastro-loading').className = show ? 'cadastro-loading active' : 'cadastro-loading';
}

// Se já está logado, redireciona para o POS
API.getMe().then(function (res) {
    if (res.status === 'ok' && res.usuario) {
        window.location.href = '/';
    }
}).catch(function () { });

// Enter no campo senha faz cadastro
document.getElementById('cadastro-senha').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') realizarCadastro();
});

function realizarCadastro() {
    var nome = document.getElementById('cadastro-nome').value.trim();
    var email = document.getElementById('cadastro-email').value.trim();
    var senha = document.getElementById('cadastro-senha').value;

    if (!nome || !email || !senha) return showToast("Preencha todos os campos.");
    if (senha.length < 6) return showToast("Senha deve ter ao menos 6 caracteres.");

    setLoading(true);
    API.signup(email, senha, nome)
        .then(function (res) {
            setLoading(false);
            if (res.status === 'ok') {
                window.location.href = '/';
            } else {
                showToast(res.mensagem || "Erro no cadastro.");
            }
        })
        .catch(function (err) {
            setLoading(false);
            showToast("Erro de conexão: " + (err.message || err));
        });
}
