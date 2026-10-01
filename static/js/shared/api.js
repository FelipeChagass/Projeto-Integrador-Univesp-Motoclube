/**
 * Cliente HTTP/autenticação compartilhado; ApiError preserva status e possibilidade de retry.
 */
export class ApiError extends Error {
    constructor(message, { status = 0, code = 'NETWORK_ERROR', details = null, retryable = false, requestId = null } = {}) {
        super(message);
        this.name = 'ApiError';
        Object.assign(this, { status, code, details, retryable, requestId });
    }
}

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
                if (res.ok && config.status === 'ok') {
                    supabaseClient = window.supabase.createClient(config.supabase_url, config.supabase_anon_key);
                }
            } catch (e) {
                console.error('Não foi possível carregar a configuração de autenticação.');
            }
            return supabaseClient;
        })();

        const client = await _initPromise;
        if (!client) _initPromise = null;
        return client;
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

    const REQUEST_TIMEOUT = 15000;

    async function _request(method, endpoint, body, _retryCount) {
        if (typeof _retryCount === 'undefined') _retryCount = 0;
        const headers = {
            'Content-Type': 'application/json',
        };

        try {
            const client = await initSupabase();
            if (!client) throw new Error('Auth unavailable');
            const { data: { session }, error } = await client.auth.getSession();
            if (error) throw error;
            if (session?.access_token) headers['Authorization'] = 'Bearer ' + session.access_token;
        } catch (_) {
            throw new ApiError('Autenticação temporariamente indisponível.', { code: 'AUTH_UNAVAILABLE', retryable: true });
        }

        // Financial state and identity must never come from a stale client cache.
        let cacheKey = null;
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

        if (body && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
            if (body instanceof FormData) {
                delete headers['Content-Type'];
                options.body = body;
            } else options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(BASE_URL + endpoint, options);
            let data = null;
            try { data = response.status === 204 ? null : await response.json(); }
            catch (_) {
                if (response.ok) throw new ApiError('Resposta inválida do servidor.', { status: response.status, code: 'INVALID_RESPONSE' });
            }
            if (!response.ok || data?.status === 'erro') {
                const status = response.status;
                const defaultCodes = { 400: 'BAD_REQUEST', 401: 'AUTH_REQUIRED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 422: 'VALIDATION_ERROR' };
                throw new ApiError(data?.message || 'Não foi possível concluir a operação.', {
                    status, code: data?.code || defaultCodes[status] || 'SERVER_ERROR',
                    details: data?.details || null,
                    retryable: ![400, 401, 403, 404, 409, 422].includes(status) && (data?.retryable ?? (status >= 500 || status === 429)),
                    requestId: data?.request_id || response.headers?.get?.('X-Request-ID') || null
                });
            }

            if (cacheKey) _setCache(cacheKey, data);

            clearTimeout(timeoutId);
            return data;
        } catch (error) {
            clearTimeout(timeoutId);

            if (error instanceof ApiError) throw error;
            const timeout = error.name === 'AbortError';
            const online = typeof navigator === 'undefined' || navigator.onLine !== false;
            const details = {
                tipo: 'transporte', method, endpoint, online,
                browser_error: error?.name || 'Error'
            };
            console.error('API inacessível antes de receber resposta HTTP.', details, error);
            // A durable queue controls retries of financial operations with the same id.
            throw new ApiError(timeout ? 'O servidor excedeu o tempo limite.' :
                (online ? 'Não foi possível alcançar o servidor.' : 'O dispositivo está sem conexão.'), {
                code: timeout ? 'TIMEOUT' : 'SERVER_UNREACHABLE', details, retryable: true
            });
        }
    }

    return {

        _initSupabase: initSupabase,
        request: _request,

        login: async function (email, senha) {
            const client = await initSupabase();
            if (!client) return { status: 'erro', mensagem: 'Supabase não inicializado' };
            const { data, error } = await client.auth.signInWithPassword({ email: email, password: senha });
            if (error) return { status: 'erro', mensagem: error.message };
            return { status: 'ok', usuario: data.user, session: data.session };
        },

        logout: async function (options) {
            const preserveKeys = new Set(
                options && Array.isArray(options.preserveKeys) ? options.preserveKeys : []
            );
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
                if ((k.startsWith('motoBar') && !preserveKeys.has(k)) || k.startsWith('sb-')) {
                    localStorage.removeItem(k);
                }
            });

            supabaseClient = null;
            _initPromise = null;
            _clearCache();
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

        verificarSenhaEstoque: function (senha) {
            return _request('POST', '/produtos/estoque/verificar-senha', { senha: senha });
        },

        invalidateCache: function (endpoint) {
            _clearCache(endpoint || null);
        },

        getListaMembros: function () {
            return _request('GET', '/membros').then(function (res) {
                return res.membros || [];
            });
        },

        salvarDadosProduto: function (produtoId, estBar, estDep, minBar, minDep, esperadoBar, esperadoDep, senhaEstoque) {
            return _request('PUT', '/produtos/estoque', {
                produto_id: produtoId,
                senha_estoque: senhaEstoque,
                estoque_bar: estBar,
                estoque_deposito: estDep,
                estoque_min_bar: minBar,
                estoque_min_deposito: minDep,
                estoque_bar_esperado: esperadoBar,
                estoque_deposito_esperado: esperadoDep,
            }).then(function (res) { _clearCache(); return res; });
        },

        processarVenda: function (venda) {
            return _request('POST', '/vendas', venda).then(function (res) {
                _clearCache();
                return res;
            });
        },

        buscarExtratoMembro: function (membroId) {
            return _request('GET', '/membros/extrato?membro_id=' + encodeURIComponent(membroId));
        },

        quitarContaMembro: function (pagamento) {
            return _request('POST', '/vendas/pagamento', pagamento).then(function (res) {
                _clearCache();
                return res;
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

        getCaixaAberto: function (caixaId) {
            const query = caixaId ? '?caixa_id=' + encodeURIComponent(caixaId) : '';
            return _request('GET', '/caixa/aberto' + query);
        },

        health: function () {
            return _request('GET', '/health');
        },
    };
})();
