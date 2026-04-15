function showToast(msg) {
    var t = document.getElementById('login-toast');
    t.innerText = msg;
    t.className = 'login-toast show';
    setTimeout(function () { t.className = 'login-toast'; }, 3000);
}

function setLoading(show) {
    document.getElementById('login-loading').className = show ? 'login-loading active' : 'login-loading';
}

// Se já está logado com sessão válida, redireciona para o POS
API._initSupabase().then(function (client) {
    if (!client) return;
    return client.auth.getSession();
}).then(function (result) {
    if (!result || !result.data || !result.data.session) return;
    // Sessão Supabase existe — verifica se é válida no backend
    return API.getMe().then(function (res) {
        if (res.status === 'ok' && res.usuario) {
            window.location.replace('/pdv');
        }
    });
}).catch(function () {
    // Token inválido/expirado — limpa tudo para um login limpo
    API.logout().catch(function () { });
});

// Enter no campo senha faz login
document.getElementById('login-senha').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') realizarLogin();
});

function realizarLogin() {
    var email = document.getElementById('login-email').value.trim();
    var senha = document.getElementById('login-senha').value;
    if (!email || !senha) return showToast("Preencha e-mail e senha.");

    setLoading(true);
    API.login(email, senha)
        .then(function (res) {
            if (res.status === 'ok') {
                // Login Supabase OK. Agora verifica se perfil existe no banco.
                return API.getMe().then(function (meRes) {
                    if (meRes.status === 'pendente') {
                        // Perfil não existe ainda — sincroniza automaticamente
                        var nome = (res.usuario && res.usuario.user_metadata && res.usuario.user_metadata.nome) || email.split('@')[0];
                        return fetch(window.location.origin + '/api/auth/sincronizar', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': 'Bearer ' + (res.usuario && res.usuario.access_token ? res.usuario.access_token : '')
                            },
                            body: JSON.stringify({ nome: nome, perfil: 'operador' })
                        }).then(function () {
                            setLoading(false);
                            window.location.href = '/pdv';
                        });
                    }
                    setLoading(false);
                    window.location.href = '/pdv';
                });
            } else {
                setLoading(false);
                showToast(res.mensagem || "Erro no login.");
            }
        })
        .catch(function (err) {
            setLoading(false);
            showToast("Erro de conexão: " + (err.message || err));
        });
}
