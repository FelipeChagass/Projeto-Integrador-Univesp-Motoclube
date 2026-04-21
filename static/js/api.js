export const UIModal = {
    confirm: function (msg, callbackOk, callbackCancel) { this.show('CONFIRMAÇÃO', msg, true, callbackOk, callbackCancel); },
    alert: function (msg, callbackOk) { this.show('ALERTA', msg, false, callbackOk, null); },
    prompt: function (msg, callbackOk, callbackCancel) { this.show('INSERIR DADOS', msg, true, callbackOk, callbackCancel, true); },
    show: function (title, msg, isConfirm, onOk, onCancel, isPrompt) {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.85)',
            zIndex: '999999', display: 'flex', justifyContent: 'center', alignItems: 'center'
        });

        const modalDiv = document.createElement('div');
        Object.assign(modalDiv.style, {
            background: '#222', border: '2px solid #b30000', padding: '20px',
            borderRadius: '8px', width: '90%', maxWidth: '400px', textAlign: 'center',
            color: '#fff', fontFamily: 'sans-serif'
        });

        const titleEl = document.createElement('h3');
        titleEl.style.margin = '0 0 15px 0';
        titleEl.textContent = title;

        const msgEl = document.createElement('p');
        msgEl.style.cssText = 'margin:0 0 15px 0; font-size:1rem; color:#ccc;';
        msgEl.textContent = msg;

        modalDiv.append(titleEl, msgEl);

        let inputEl = null;
        if (isPrompt) {
            inputEl = document.createElement('input');
            inputEl.type = 'password';
            inputEl.id = 'ui-prompt-input';
            inputEl.style.cssText = 'width:100%; padding:10px; margin-bottom:15px; border-radius:5px; border:1px solid #777; background:#222; color:#fff;';
            modalDiv.append(inputEl);
        }

        const buttonsDiv = document.createElement('div');
        buttonsDiv.style.cssText = 'display:flex; justify-content:center; gap:10px;';

        const okBtn = document.createElement('button');
        okBtn.textContent = isConfirm ? 'CONFIRMAR' : 'OK';
        okBtn.style.cssText = 'padding:10px 20px; border:none; border-radius:5px; background:#b30000; color:#fff; cursor:pointer; font-weight:bold;';
        okBtn.onclick = () => {
            const val = isPrompt ? inputEl.value : null;
            document.body.removeChild(overlay);
            if (onOk) onOk(val);
        };

        if (isConfirm) {
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'CANCELAR';
            cancelBtn.style.cssText = 'padding:10px 20px; border:none; border-radius:5px; background:#555; color:#fff; cursor:pointer; font-weight:bold;';
            cancelBtn.onclick = () => {
                const val = isPrompt ? inputEl.value : null;
                document.body.removeChild(overlay);
                if (onCancel) onCancel(val);
            };
            buttonsDiv.append(cancelBtn);
        }

        buttonsDiv.append(okBtn);
        modalDiv.append(buttonsDiv);
        overlay.append(modalDiv);

        document.body.appendChild(overlay);

        if (isPrompt && inputEl) {
            setTimeout(() => inputEl.focus(), 100);
        }
    }
};


export const API = (function () {

    const BASE_URL = window.location.origin + '/api';

    let supabaseClient = null;
    let _initPromise = null;

    async function initSupabase() {
        if (supabaseClient) return supabaseClient;
        if (!window.supabase) {
            console.error("Supabase SDK não foi carregado via CDN no HTML.");
            return null;
        }

        if (_initPromise) return _initPromise;

        _initPromise = (async () => {
            try {
                const res = await fetch(BASE_URL + '/auth/config');
                const config = await res.json();
                if (config.status === 'ok') {
                    supabaseClient = window.supabase.createClient(config.supabase_url, config.supabase_anon_key);
                }
            } catch (e) {
                console.error("Erro ao carregar configurações do Supabase:", e);
            }
            return supabaseClient;
        })();

        return _initPromise;
    }

    const _cache = {};
    const CACHE_TTL = 30000;

    function _getCached(key) {
        let entry = _cache[key];
        if (entry && (Date.now() - entry.ts) < CACHE_TTL) return entry.data;
        return null;
    }

    function _setCache(key, data) {
        _cache[key] = { data: data, ts: Date.now() };
    }

    function _clearCache(key) {
        if (key) { delete _cache[key]; } else { Object.keys(_cache).forEach(function (k) { delete _cache[k]; }); }
    }

    let REQUEST_TIMEOUT = 15000;
    let MAX_RETRIES = 2;

    async function _request(method, endpoint, body, _retryCount) {
        if (typeof _retryCount === 'undefined') _retryCount = 0;
        const headers = {
            'Content-Type': 'application/json',
        };

        const client = await initSupabase();
        if (client) {
            const { data: { session } } = await client.auth.getSession();
            if (session && session.access_token) {
                headers['Authorization'] = 'Bearer ' + session.access_token;
            }
        }

        let cacheKey = method === 'GET' ? endpoint : null;
        if (cacheKey) {
            let cached = _getCached(cacheKey);
            if (cached) return cached;
        }

        let controller = new AbortController();
        let timeoutId = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT);

        const options = {
            method: method,
            headers: headers,
            signal: controller.signal,
        };

        if (body && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(BASE_URL + endpoint, options);
            clearTimeout(timeoutId);

            if (response.status === 401) {

                if (_retryCount === 0 && client) {
                    try {
                        let refreshResult = await client.auth.refreshSession();
                        if (refreshResult.data && refreshResult.data.session) {
                            console.info('Token renovado automaticamente.');
                            return _request(method, endpoint, body, 1);
                        }
                    } catch (refreshErr) {
                        console.warn('Falha ao renovar token:', refreshErr);
                    }
                }

                window.location.replace('/login');
                throw new Error("Não autorizado (401). Faça login novamente.");
            }
            const data = await response.json();

            if (cacheKey) _setCache(cacheKey, data);

            return data;
        } catch (error) {
            clearTimeout(timeoutId);

            let isNetworkError = error.name === 'AbortError' || error.name === 'TypeError' || error.message === 'Failed to fetch';
            let isTimeout = error.name === 'AbortError';

            if (isNetworkError && _retryCount < MAX_RETRIES) {
                let delay = Math.pow(2, _retryCount) * 1000;
                console.warn('Tentativa ' + (_retryCount + 1) + '/' + MAX_RETRIES + ' para ' + endpoint + ' em ' + delay + 'ms...');
                await new Promise(function (r) { setTimeout(r, delay); });
                return _request(method, endpoint, body, _retryCount + 1);
            }

            let msgErro = isTimeout ? 'Tempo limite excedido (' + (REQUEST_TIMEOUT / 1000) + 's)' : (error.message || 'Erro de conexão');
            console.error('Erro na requisição:', endpoint, msgErro);
            throw new Error(msgErro);
        }
    }

    return {

        _initSupabase: initSupabase,

        login: async function (email, senha) {
            const client = await initSupabase();
            if (!client) return { status: 'erro', mensagem: 'Supabase não inicializado' };
            const { data, error } = await client.auth.signInWithPassword({ email: email, password: senha });
            if (error) return { status: 'erro', mensagem: error.message };
            return { status: 'ok', usuario: data.user };
        },

        signup: async function (email, senha, nome) {
            const client = await initSupabase();
            if (!client) return { status: 'erro', mensagem: 'Supabase não inicializado' };
            const { data, error } = await client.auth.signUp({
                email: email,
                password: senha,
                options: { data: { nome: nome } }
            });
            if (error) return { status: 'erro', mensagem: error.message };

            try {
                await _request('POST', '/auth/sincronizar', { nome: nome, perfil: 'operador' });
            } catch (e) {
                console.warn("Erro ao sincronizar perfil", e);
            }
            return { status: 'ok', usuario: data.user };
        },

        logout: async function () {
            const client = await initSupabase();
            if (client) {
                try {
                    await client.auth.signOut({ scope: 'local' });
                } catch (e) {
                    console.warn('Erro no signOut:', e);
                }
            }

            let keys = Object.keys(localStorage);
            keys.forEach(function (k) {
                if (k.startsWith('motoBar') || k.startsWith('sb-')) {
                    localStorage.removeItem(k);
                }
            });

            supabaseClient = null;
            _initPromise = null;
            return { status: 'ok' };
        },

        getMe: function () {
            return _request('GET', '/auth/me');
        },

        getDadosIniciais: function () {
            return _request('GET', '/dados-iniciais');
        },

        getProdutos: function () {
            return _request('GET', '/produtos');
        },

        invalidateCache: function (endpoint) {
            _clearCache(endpoint || null);
        },

        getListaMembros: function () {
            return _request('GET', '/membros').then(function (res) {
                return res.membros || [];
            });
        },

        salvarDadosProduto: function (produtoId, estBar, estDep, minBar, minDep) {
            return _request('PUT', '/produtos/estoque', {
                produto_id: produtoId,
                estoque_bar: estBar,
                estoque_deposito: estDep,
                estoque_min_bar: minBar,
                estoque_min_deposito: minDep,
            }).then(function (res) { _clearCache(); return res; });
        },

        processarVenda: function (venda) {
            return _request('POST', '/vendas', venda).then(function (res) {
                _clearCache();
                if (res.status === 'ok') return 'OK';
                if (res.status === 'duplicado') return 'Duplicado: Venda já registrada.';
                return 'Erro: ' + (res.mensagem || 'Erro desconhecido');
            });
        },

        buscarExtratoMembro: function (nomeMembro) {
            let encoded = encodeURIComponent(nomeMembro);
            return _request('GET', '/membros/extrato?nome=' + encoded);
        },

        quitarContaMembro: function (nomeMembro, metodo) {
            return _request('POST', '/vendas/pagamento', {
                nome_membro: nomeMembro,
                metodo: metodo,
            }).then(function (res) {
                _clearCache();
                return res.mensagem || 'Conta quitada';
            });
        },

        gerarRelatorioCaixa: function (tipo, dadosFiltro) {
            let body = Object.assign({}, dadosFiltro || {});
            body.tipo = tipo;
            return _request('POST', '/relatorios', body);
        },

        abrirCaixa: function (valorAbertura) {
            return _request('POST', '/caixa/abrir', {
                valor_abertura: valorAbertura,
            });
        },

        fecharCaixa: function (caixaId, valorFechamento, observacoes) {
            return _request('POST', '/caixa/fechar', {
                caixa_id: caixaId,
                valor_fechamento: valorFechamento,
                observacoes: observacoes || null,
            });
        },

        getCaixaAberto: function () {
            return _request('GET', '/caixa/aberto');
        },

        verificarSenhaEstoque: function (senha) {
            return _request('POST', '/admin/verificar-senha', { senha: senha });
        },

        health: function () {
            return _request('GET', '/health');
        },
    };
})();
