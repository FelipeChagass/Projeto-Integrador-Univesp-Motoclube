/**
 * API Client - Camada de comunicação com o backend Flask.
 *
 * Substitui todas as chamadas google.script.run por fetch() REST.
 * Cada função retorna uma Promise, facilitando o uso com async/await.
 *
 * Autenticação via Supabase JWT (Bearer token em cada requisição).
 *
 * Uso:
 *   const dados = await API.getDadosIniciais();
 *   const resultado = await API.processarVenda(venda);
 */
window.UIModal = {
    confirm: function (msg, callbackOk, callbackCancel) { this.show('CONFIRMAÇÃO', msg, true, callbackOk, callbackCancel); },
    alert: function (msg, callbackOk) { this.show('ALERTA', msg, false, callbackOk, null); },
    prompt: function (msg, callbackOk, callbackCancel) { this.show('INSERIR DADOS', msg, true, callbackOk, callbackCancel, true); },
    show: function (title, msg, isConfirm, onOk, onCancel, isPrompt) {
        var d = document.createElement('div');
        d.style.position = 'fixed'; d.style.inset = '0'; d.style.background = 'rgba(0,0,0,0.85)';
        d.style.zIndex = '999999'; d.style.display = 'flex'; d.style.justifyContent = 'center'; d.style.alignItems = 'center';
        var pHtml = isPrompt ? '<input type="password" id="ui-prompt-input" style="width:100%; padding:10px; margin-bottom:15px; border-radius:5px; border:1px solid #777; background:#222; color:#fff;" />' : '';
        d.innerHTML = '<div style="background:#222; border: 2px solid #b30000; padding:20px; border-radius:8px; width:90%; max-width:400px; text-align:center; color:#fff; font-family:sans-serif;">' +
            '<h3 style="margin:0 0 15px 0; color:#fff;">' + title + '</h3>' +
            '<p style="margin:0 0 15px 0; font-size:1rem; color:#ccc;">' + msg + '</p>' + pHtml +
            '<div style="display:flex; justify-content:center; gap:10px;">' +
            '<button id="ui-btn-cancel" style="display:' + (isConfirm ? 'block' : 'none') + '; padding:10px 20px; border:none; border-radius:5px; background:#555; color:#fff; cursor:pointer; font-weight:bold;">CANCELAR</button>' +
            '<button id="ui-btn-ok" style="padding:10px 20px; border:none; border-radius:5px; background:#b30000; color:#fff; cursor:pointer; font-weight:bold;">' + (isConfirm ? 'CONFIRMAR' : 'OK') + '</button>' +
            '</div></div>';
        document.body.appendChild(d);
        if (isPrompt) { setTimeout(function () { document.getElementById('ui-prompt-input').focus(); }, 100); }
        document.getElementById('ui-btn-ok').onclick = function () { var val = isPrompt ? document.getElementById('ui-prompt-input').value : null; document.body.removeChild(d); if (onOk) onOk(val); };
        var btnCancel = document.getElementById('ui-btn-cancel');
        if (btnCancel) { btnCancel.onclick = function () { var val = isPrompt ? document.getElementById('ui-prompt-input').value : null; document.body.removeChild(d); if (onCancel) onCancel(val); }; }
    }
};

const API = (function () {
    // URL base da API (ajustar em produção)
    const BASE_URL = window.location.origin + '/api';

    // Cliente do Supabase iniciado dinamicamente
    let supabaseClient = null;
    let _initPromise = null; // mutex: evita múltiplos fetches simultâneos

    async function initSupabase() {
        if (supabaseClient) return supabaseClient;
        if (!window.supabase) {
            console.error("Supabase SDK não foi carregado via CDN no HTML.");
            return null;
        }
        // Se já existe uma inicialização em andamento, aguarda ela terminar
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


    // ── Cache simples para respostas GET (evita chamadas repetidas) ──
    const _cache = {};
    const CACHE_TTL = 30000; // 30 segundos

    function _getCached(key) {
        var entry = _cache[key];
        if (entry && (Date.now() - entry.ts) < CACHE_TTL) return entry.data;
        return null;
    }

    function _setCache(key, data) {
        _cache[key] = { data: data, ts: Date.now() };
    }

    function _clearCache(key) {
        if (key) { delete _cache[key]; } else { Object.keys(_cache).forEach(function (k) { delete _cache[k]; }); }
    }

    /**
     * Função base para requisições HTTP.
     * Tokens do Supabase são enviados via cabeçalho Authorization.
     * Inclui timeout (15s) e retry automático (até 2 tentativas).
     */
    var REQUEST_TIMEOUT = 15000; // 15 segundos
    var MAX_RETRIES = 2;

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

        // Cache para requisições GET
        var cacheKey = method === 'GET' ? endpoint : null;
        if (cacheKey) {
            var cached = _getCached(cacheKey);
            if (cached) return cached;
        }

        // AbortController para timeout
        var controller = new AbortController();
        var timeoutId = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT);

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
                // Tenta refresh do token (uma vez) antes de desistir
                if (_retryCount === 0 && client) {
                    try {
                        var refreshResult = await client.auth.refreshSession();
                        if (refreshResult.data && refreshResult.data.session) {
                            console.info('Token renovado automaticamente.');
                            return _request(method, endpoint, body, 1);
                        }
                    } catch (refreshErr) {
                        console.warn('Falha ao renovar token:', refreshErr);
                    }
                }
                // Refresh falhou ou já tentou — redireciona para login
                window.location.replace('/login');
                throw new Error("Não autorizado (401). Faça login novamente.");
            }
            const data = await response.json();

            // Armazena no cache se for GET
            if (cacheKey) _setCache(cacheKey, data);

            return data;
        } catch (error) {
            clearTimeout(timeoutId);

            // Identifica se é timeout ou erro de rede (retry-able)
            var isNetworkError = error.name === 'AbortError' || error.name === 'TypeError' || error.message === 'Failed to fetch';
            var isTimeout = error.name === 'AbortError';

            if (isNetworkError && _retryCount < MAX_RETRIES) {
                var delay = Math.pow(2, _retryCount) * 1000; // 1s, 2s
                console.warn('Tentativa ' + (_retryCount + 1) + '/' + MAX_RETRIES + ' para ' + endpoint + ' em ' + delay + 'ms...');
                await new Promise(function (r) { setTimeout(r, delay); });
                return _request(method, endpoint, body, _retryCount + 1);
            }

            var msgErro = isTimeout ? 'Tempo limite excedido (' + (REQUEST_TIMEOUT / 1000) + 's)' : (error.message || 'Erro de conexão');
            console.error('Erro na requisição:', endpoint, msgErro);
            throw new Error(msgErro);
        }
    }

    // --- Funções públicas da API ---

    return {
        /**
         * Expõe initSupabase para uso externo (ex: upload de imagem no admin)
         */
        _initSupabase: initSupabase,

        /**
         * Login com email e senha usando Supabase Auth
         */
        login: async function (email, senha) {
            const client = await initSupabase();
            if (!client) return { status: 'erro', mensagem: 'Supabase não inicializado' };
            const { data, error } = await client.auth.signInWithPassword({ email: email, password: senha });
            if (error) return { status: 'erro', mensagem: error.message };
            return { status: 'ok', usuario: data.user };
        },

        /**
         * Cadastro de novo usuário usando Supabase Auth
         */
        signup: async function (email, senha, nome) {
            const client = await initSupabase();
            if (!client) return { status: 'erro', mensagem: 'Supabase não inicializado' };
            const { data, error } = await client.auth.signUp({
                email: email,
                password: senha,
                options: { data: { nome: nome } }
            });
            if (error) return { status: 'erro', mensagem: error.message };

            // Tenta sincronizar o perfil no backend local
            try {
                await _request('POST', '/auth/sincronizar', { nome: nome, perfil: 'operador' });
            } catch (e) {
                console.warn("Erro ao sincronizar perfil", e);
            }
            return { status: 'ok', usuario: data.user };
        },

        /**
         * Logout — encerra sessão Supabase e limpa dados locais
         */
        logout: async function () {
            const client = await initSupabase();
            if (client) {
                try {
                    await client.auth.signOut({ scope: 'local' });
                } catch (e) {
                    console.warn('Erro no signOut:', e);
                }
            }
            // Limpa todo o armazenamento local do PDV
            var keys = Object.keys(localStorage);
            keys.forEach(function (k) {
                if (k.startsWith('motoBar') || k.startsWith('sb-')) {
                    localStorage.removeItem(k);
                }
            });
            // Reseta o client para forçar re-inicialização no próximo login
            supabaseClient = null;
            _initPromise = null;
            return { status: 'ok' };
        },

        /**
         * Busca dados do usuário logado
         */
        getMe: function () {
            return _request('GET', '/auth/me');
        },

        /**
         * Busca dados iniciais (produtos + membros + config).
         * Retorna dicts: {produtos: [{id, nome, preco_atual, ...}], membros: [{id, nome, ...}]}
         */
        getDadosIniciais: function () {
            return _request('GET', '/dados-iniciais');
        },

        /**
         * Busca apenas produtos (mais leve que getDadosIniciais).
         * Usado para sincronização de estoque em background.
         */
        getProdutos: function () {
            return _request('GET', '/produtos');
        },

        /**
         * Invalida cache de GET. Chamado após ações que alteram dados.
         */
        invalidateCache: function (endpoint) {
            _clearCache(endpoint || null);
        },

        /**
         * Lista membros ativos (formato dict).
         * Retorna: [{id, nome, saldo_devedor, ...}, ...]
         */
        getListaMembros: function () {
            return _request('GET', '/membros').then(function (res) {
                return res.membros || [];
            });
        },

        /**
         * Salva dados de estoque de um produto.
         */
        salvarDadosProduto: function (produtoId, estBar, estDep, minBar, minDep) {
            return _request('PUT', '/produtos/estoque', {
                produto_id: produtoId,
                estoque_bar: estBar,
                estoque_deposito: estDep,
                estoque_min_bar: minBar,
                estoque_min_deposito: minDep,
            }).then(function (res) { _clearCache(); return res; });
        },

        /**
         * Processa uma venda (normal ou fiado).
         * O operador é identificado pela sessão no servidor.
         */
        processarVenda: function (venda) {
            return _request('POST', '/vendas', venda).then(function (res) {
                _clearCache();
                if (res.status === 'ok') return 'OK';
                if (res.status === 'duplicado') return 'Duplicado: Venda já registrada.';
                return 'Erro: ' + (res.mensagem || 'Erro desconhecido');
            });
        },

        /**
         * Busca extrato de pendências de um membro.
         */
        buscarExtratoMembro: function (nomeMembro) {
            var encoded = encodeURIComponent(nomeMembro);
            return _request('GET', '/membros/extrato?nome=' + encoded);
        },

        /**
         * Quita conta de um membro.
         */
        quitarContaMembro: function (nomeMembro, metodo) {
            return _request('POST', '/vendas/pagamento', {
                nome_membro: nomeMembro,
                metodo: metodo,
            }).then(function (res) {
                _clearCache();
                return res.mensagem || 'Conta quitada';
            });
        },

        /**
         * Gera relatório de caixa.
         */
        gerarRelatorioCaixa: function (tipo, dadosFiltro) {
            var body = Object.assign({}, dadosFiltro || {});
            body.tipo = tipo;
            return _request('POST', '/relatorios', body);
        },

        /**
         * Abre um caixa.
         */
        abrirCaixa: function (valorAbertura) {
            return _request('POST', '/caixa/abrir', {
                valor_abertura: valorAbertura,
            });
        },

        /**
         * Fecha um caixa.
         */
        fecharCaixa: function (caixaId, valorFechamento) {
            return _request('POST', '/caixa/fechar', {
                caixa_id: caixaId,
                valor_fechamento: valorFechamento,
            });
        },

        /**
         * Verifica se há caixa aberto.
         */
        getCaixaAberto: function () {
            return _request('GET', '/caixa/aberto');
        },

        /**
         * Verifica senha do modo estoque no servidor.
         */
        verificarSenhaEstoque: function (senha) {
            return _request('POST', '/admin/verificar-senha', { senha: senha });
        },

        /**
         * Health check
         */
        health: function () {
            return _request('GET', '/health');
        },
    };
})();
