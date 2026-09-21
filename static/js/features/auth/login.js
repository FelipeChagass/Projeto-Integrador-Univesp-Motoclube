/** Entrada do login: autentica no Supabase e consulta o perfil local autorizado. */
import { API } from '../../shared/api.js';
import { UIModal } from '../../shared/modals.js';
function showToast(msg) {
    const t = document.getElementById('login-toast');
    t.innerText = msg;
    t.className = 'login-toast show';
    setTimeout(() => { t.className = 'login-toast'; }, 3000);
}

function setLoading(show) {
    document.getElementById('login-loading').className = show ? 'login-loading active' : 'login-loading';
}

function redirecionarParaPdv() {
    setLoading(true);
    window.location.replace('/');
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
                        return API.request('POST', '/auth/sincronizar', { nome, perfil: 'operador' }).then(() => {
                            redirecionarParaPdv();
                        });
                    }
                    if (meRes.status !== 'ok' || !meRes.usuario) throw new Error('Perfil ainda não autorizado.');
                    redirecionarParaPdv();
                });
            } else {
                setLoading(false);
                showToast(res.mensagem || 'Erro no login.');
            }
        })
        .catch(err => {
            setLoading(false);
            showToast(err.message || 'Não foi possível entrar.');
        });
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-toggle-senha')?.addEventListener('click', toggleSenha);
    document.getElementById('btn-login')?.addEventListener('click', realizarLogin);
});
