import { API, UIModal } from './api.js';
function showToast(msg) {
    const t = document.getElementById('login-toast');
    t.innerText = msg;
    t.className = 'login-toast show';
    setTimeout(() => { t.className = 'login-toast'; }, 3000);
}

function setLoading(show) {
    document.getElementById('login-loading').className = show ? 'login-loading active' : 'login-loading';
}

function toggleSenha() {
    const campo = document.getElementById('login-senha');
    const iconeFechado = document.getElementById('icon-olho-fechado');
    const iconeAberto = document.getElementById('icon-olho-aberto');
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

const lembrarMeAtivo = localStorage.getItem('motoBarLembrarMe') === 'true';

if (lembrarMeAtivo) {
    API._initSupabase().then(client => {
        if (!client) return;
        return client.auth.getSession();
    }).then(result => {
        if (!result || !result.data || !result.data.session) return;

        return API.getMe().then(res => {
            if (res.status === 'ok' && res.usuario) {
                window.location.replace('/');
            }
        });
    }).catch(() => {
        localStorage.removeItem('motoBarLembrarMe');
        API.logout().catch(() => { });
    });
} else {
    API._initSupabase().then(client => {
        if (client) {
            client.auth.getSession().then(result => {
                if (result && result.data && result.data.session) {
                    API.logout().catch(() => { });
                }
            });
        }
    }).catch(() => { });
}

document.getElementById('login-senha').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') realizarLogin();
});

function realizarLogin() {
    const email = document.getElementById('login-email').value.trim();
    const senha = document.getElementById('login-senha').value;
    const lembrar = document.getElementById('lembrar-me').checked;
    if (!email || !senha) return showToast('Preencha e-mail e senha.');

    setLoading(true);
    
    API.login(email, senha)
        .then(res => {
            if (res.status === 'ok') {
                if (lembrar) {
                    localStorage.setItem('motoBarLembrarMe', 'true');
                } else {
                    localStorage.removeItem('motoBarLembrarMe');
                }

                return API.getMe().then(meRes => {
                    if (meRes.status === 'pendente') {
                        const nome = (res.usuario && res.usuario.user_metadata && res.usuario.user_metadata.nome) || email.split('@')[0];
                        return fetch(`${window.location.origin}/api/auth/sincronizar`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${(res.session && res.session.access_token) ? res.session.access_token : ''}`
                            },
                            body: JSON.stringify({ nome, perfil: 'operador' })
                        }).then(() => {
                            setLoading(false);
                            window.location.href = '/';
                        });
                    }
                    setLoading(false);
                    window.location.href = '/';
                });
            } else {
                setLoading(false);
                showToast(res.mensagem || 'Erro no login.');
            }
        })
        .catch(err => {
            setLoading(false);
            showToast(`Erro de conexão: ${err.message || err}`);
        });
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-toggle-senha')?.addEventListener('click', toggleSenha);
    document.getElementById('btn-login')?.addEventListener('click', realizarLogin);
});
