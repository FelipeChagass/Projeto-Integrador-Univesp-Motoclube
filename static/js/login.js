function showToast(msg) {
    var t = document.getElementById('login-toast');
    t.innerText = msg;
    t.className = 'login-toast show';
    setTimeout(function () { t.className = 'login-toast'; }, 3000);
}

function setLoading(show) {
    document.getElementById('login-loading').className = show ? 'login-loading active' : 'login-loading';
}

function toggleSenha() {
    var campo = document.getElementById('login-senha');
    var iconeFechado = document.getElementById('icon-olho-fechado');
    var iconeAberto = document.getElementById('icon-olho-aberto');
    if (campo.type === 'password') {
        campo.type = 'text';
        iconeFechado.style.display = 'none';
        iconeAberto.style.display = 'block';
    } else {
        campo.type = 'password';
        iconeFechado.style.display = 'block';
        iconeAberto.style.display = 'none';
    }
}

var lembrarMeAtivo = localStorage.getItem('motoBarLembrarMe') === 'true';

if (lembrarMeAtivo) {
    API._initSupabase().then(function (client) {
        if (!client) return;
        return client.auth.getSession();
    }).then(function (result) {
        if (!result || !result.data || !result.data.session) return;

        return API.getMe().then(function (res) {
            if (res.status === 'ok' && res.usuario) {
                window.location.replace('/');
            }
        });
    }).catch(function () {

        localStorage.removeItem('motoBarLembrarMe');
        API.logout().catch(function () { });
    });
} else {

    API._initSupabase().then(function (client) {
        if (client) {
            client.auth.getSession().then(function (result) {
                if (result && result.data && result.data.session) {
                    API.logout().catch(function () { });
                }
            });
        }
    }).catch(function () { });
}

document.getElementById('login-senha').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') realizarLogin();
});

function realizarLogin() {
    var email = document.getElementById('login-email').value.trim();
    var senha = document.getElementById('login-senha').value;
    var lembrar = document.getElementById('lembrar-me').checked;
    if (!email || !senha) return showToast("Preencha e-mail e senha.");

    setLoading(true);
    API.login(email, senha)
        .then(function (res) {
            if (res.status === 'ok') {

                if (lembrar) {
                    localStorage.setItem('motoBarLembrarMe', 'true');
                } else {
                    localStorage.removeItem('motoBarLembrarMe');
                }

                return API.getMe().then(function (meRes) {
                    if (meRes.status === 'pendente') {

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
                            window.location.href = '/';
                        });
                    }
                    setLoading(false);
                    window.location.href = '/';
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
