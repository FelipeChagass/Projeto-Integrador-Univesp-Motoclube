/**
 * Cliente HTTP/autenticação compartilhado; ApiError preserva status e possibilidade de retry.
 */
export class ApiError extends Error {
  constructor(
    mensagem,
    {
      status: statusHttp = 0,
      code: codigoErro = "NETWORK_ERROR",
      details: detalhesErro = null,
      retryable: permiteNovaTentativa = false,
      requestId: identificadorRequisicao = null,
    } = {},
  ) {
    super(mensagem);
    this.name = "ApiError";
    Object.assign(this, {
      status: statusHttp,
      code: codigoErro,
      details: detalhesErro,
      retryable: permiteNovaTentativa,
      requestId: identificadorRequisicao,
    });
  }
}

export const API = (function () {
  const BASE_URL = window.location.origin + "/api";

  let supabaseClient = null;
  let inicializacaoSupabaseEmCurso = null;

  async function initSupabase() {
    if (supabaseClient) return supabaseClient;
    if (!window.supabase) {
      console.error("Supabase SDK não foi carregado via CDN no HTML.");
      return null;
    }

    if (inicializacaoSupabaseEmCurso) return inicializacaoSupabaseEmCurso;

    inicializacaoSupabaseEmCurso = (async () => {
      try {
        const respostaConfiguracao = await fetch(BASE_URL + "/auth/config");
        const configuracaoAutenticacao = await respostaConfiguracao.json();
        if (
          respostaConfiguracao.ok &&
          configuracaoAutenticacao.status === "ok"
        ) {
          supabaseClient = window.supabase.createClient(
            configuracaoAutenticacao.supabase_url,
            configuracaoAutenticacao.supabase_anon_key,
          );
        }
      } catch {
        console.error(
          "Não foi possível carregar a configuração de autenticação.",
        );
      }
      return supabaseClient;
    })();

    const clienteAutenticacao = await inicializacaoSupabaseEmCurso;
    if (!clienteAutenticacao) inicializacaoSupabaseEmCurso = null;
    return clienteAutenticacao;
  }

  const cacheRespostas = {};
  const DURACAO_CACHE_MS = 30000;

  function _getCached(chaveCache) {
    let entradaCache = cacheRespostas[chaveCache];
    if (entradaCache && Date.now() - entradaCache.ts < DURACAO_CACHE_MS)
      return entradaCache.data;
    return null;
  }

  function _setCache(chaveCache, dadosResposta) {
    cacheRespostas[chaveCache] = { data: dadosResposta, ts: Date.now() };
  }

  function _clearCache(chaveCache) {
    if (chaveCache) {
      delete cacheRespostas[chaveCache];
    } else {
      Object.keys(cacheRespostas).forEach(function (chaveArmazenada) {
        delete cacheRespostas[chaveArmazenada];
      });
    }
  }

  const TEMPO_LIMITE_REQUISICAO_MS = 15000;

  async function _request(
    metodoHttp,
    caminhoEndpoint,
    corpoRequisicao,
    tentativasRequisicao,
  ) {
    if (typeof tentativasRequisicao === "undefined") tentativasRequisicao = 0;
    const cabecalhosRequisicao = {
      "Content-Type": "application/json",
    };

    try {
      const clienteAutenticacao = await initSupabase();
      if (!clienteAutenticacao) throw new Error("Auth unavailable");
      const {
        data: { session: sessaoAutenticacao },
        error: erroSessao,
      } = await clienteAutenticacao.auth.getSession();
      if (erroSessao) throw erroSessao;
      if (sessaoAutenticacao?.access_token)
        cabecalhosRequisicao["Authorization"] =
          "Bearer " + sessaoAutenticacao.access_token;
    } catch {
      throw new ApiError("Autenticação temporariamente indisponível.", {
        code: "AUTH_UNAVAILABLE",
        retryable: true,
      });
    }

    // Financial state and identity must never come from a stale client cache.
    let chaveCache = null;
    if (chaveCache) {
      let respostaEmCache = _getCached(chaveCache);
      if (respostaEmCache) return respostaEmCache;
    }

    let controladorCancelamento = new AbortController();
    let temporizadorRequisicaoId = setTimeout(function () {
      controladorCancelamento.abort();
    }, TEMPO_LIMITE_REQUISICAO_MS);

    const opcoesRequisicao = {
      method: metodoHttp,
      headers: cabecalhosRequisicao,
      signal: controladorCancelamento.signal,
    };

    if (
      corpoRequisicao &&
      (metodoHttp === "POST" || metodoHttp === "PUT" || metodoHttp === "DELETE")
    ) {
      if (corpoRequisicao instanceof FormData) {
        delete cabecalhosRequisicao["Content-Type"];
        opcoesRequisicao.body = corpoRequisicao;
      } else opcoesRequisicao.body = JSON.stringify(corpoRequisicao);
    }

    try {
      const respostaHttp = await fetch(
        BASE_URL + caminhoEndpoint,
        opcoesRequisicao,
      );
      let dadosResposta = null;
      try {
        dadosResposta =
          respostaHttp.status === 204 ? null : await respostaHttp.json();
      } catch {
        if (respostaHttp.ok)
          throw new ApiError("Resposta inválida do servidor.", {
            status: respostaHttp.status,
            code: "INVALID_RESPONSE",
          });
      }
      if (!respostaHttp.ok || dadosResposta?.status === "erro") {
        const statusHttp = respostaHttp.status;
        const codigosErroPorStatus = {
          400: "BAD_REQUEST",
          401: "AUTH_REQUIRED",
          403: "FORBIDDEN",
          404: "NOT_FOUND",
          409: "CONFLICT",
          422: "VALIDATION_ERROR",
        };
        throw new ApiError(
          dadosResposta?.message || "Não foi possível concluir a operação.",
          {
            status: statusHttp,
            code:
              dadosResposta?.code ||
              codigosErroPorStatus[statusHttp] ||
              "SERVER_ERROR",
            details: dadosResposta?.details || null,
            retryable:
              ![400, 401, 403, 404, 409, 422].includes(statusHttp) &&
              (dadosResposta?.retryable ??
                (statusHttp >= 500 || statusHttp === 429)),
            requestId:
              dadosResposta?.request_id ||
              respostaHttp.headers?.get?.("X-Request-ID") ||
              null,
          },
        );
      }

      if (chaveCache) _setCache(chaveCache, dadosResposta);

      clearTimeout(temporizadorRequisicaoId);
      return dadosResposta;
    } catch (erroRequisicao) {
      clearTimeout(temporizadorRequisicaoId);

      if (erroRequisicao instanceof ApiError) throw erroRequisicao;
      const tempoLimiteExcedido = erroRequisicao.name === "AbortError";
      const dispositivoOnline =
        typeof navigator === "undefined" || navigator.onLine !== false;
      const detalhesTransporte = {
        tipo: "transporte",
        method: metodoHttp,
        endpoint: caminhoEndpoint,
        online: dispositivoOnline,
        browser_error: erroRequisicao?.name || "Error",
      };
      console.error(
        "API inacessível antes de receber resposta HTTP.",
        detalhesTransporte,
        erroRequisicao,
      );
      // A durable queue controls retries of financial operations with the same id.
      throw new ApiError(
        tempoLimiteExcedido
          ? "O servidor excedeu o tempo limite."
          : dispositivoOnline
            ? "Não foi possível alcançar o servidor."
            : "O dispositivo está sem conexão.",
        {
          code: tempoLimiteExcedido ? "TIMEOUT" : "SERVER_UNREACHABLE",
          details: detalhesTransporte,
          retryable: true,
        },
      );
    }
  }

  return {
    _initSupabase: initSupabase,
    request: _request,

    login: async function (email, senha) {
      const clienteAutenticacao = await initSupabase();
      if (!clienteAutenticacao)
        return { status: "erro", mensagem: "Supabase não inicializado" };
      const { data: dadosAutenticacao, error: erroAutenticacao } =
        await clienteAutenticacao.auth.signInWithPassword({
          email: email,
          password: senha,
        });
      if (erroAutenticacao)
        return { status: "erro", mensagem: erroAutenticacao.message };
      return {
        status: "ok",
        usuario: dadosAutenticacao.user,
        session: dadosAutenticacao.session,
      };
    },

    logout: async function (opcoesLogout) {
      const chavesPreservadas = new Set(
        opcoesLogout && Array.isArray(opcoesLogout.preserveKeys)
          ? opcoesLogout.preserveKeys
          : [],
      );
      const clienteAutenticacao = await initSupabase();
      if (clienteAutenticacao) {
        try {
          await clienteAutenticacao.auth.signOut({ scope: "local" });
        } catch (erroLogout) {
          console.warn("Erro no signOut:", erroLogout);
        }
      }

      let chavesArmazenamento = Object.keys(localStorage);
      chavesArmazenamento.forEach(function (chaveArmazenamento) {
        if (
          (chaveArmazenamento.startsWith("motoBar") &&
            !chavesPreservadas.has(chaveArmazenamento)) ||
          chaveArmazenamento.startsWith("sb-")
        ) {
          localStorage.removeItem(chaveArmazenamento);
        }
      });

      supabaseClient = null;
      inicializacaoSupabaseEmCurso = null;
      _clearCache();
      return { status: "ok" };
    },

    getMe: function () {
      return _request("GET", "/auth/me");
    },

    getDadosIniciais: function () {
      return _request("GET", "/dados-iniciais");
    },

    getProdutos: function () {
      return _request("GET", "/produtos");
    },

    verificarSenhaEstoque: function (senha) {
      return _request("POST", "/produtos/estoque/verificar-senha", {
        senha: senha,
      });
    },

    invalidateCache: function (caminhoEndpoint) {
      _clearCache(caminhoEndpoint || null);
    },

    getListaMembros: function () {
      return _request("GET", "/membros").then(function (respostaMembros) {
        return respostaMembros.membros || [];
      });
    },

    salvarDadosProduto: function (
      produtoId,
      estoqueBar,
      estoqueDeposito,
      estoqueMinimoBar,
      estoqueMinimoDeposito,
      estoqueEsperadoBar,
      estoqueEsperadoDeposito,
      senhaEstoque,
    ) {
      return _request("PUT", "/produtos/estoque", {
        produto_id: produtoId,
        senha_estoque: senhaEstoque,
        estoque_bar: estoqueBar,
        estoque_deposito: estoqueDeposito,
        estoque_min_bar: estoqueMinimoBar,
        estoque_min_deposito: estoqueMinimoDeposito,
        estoque_bar_esperado: estoqueEsperadoBar,
        estoque_deposito_esperado: estoqueEsperadoDeposito,
      }).then(function (respostaEstoque) {
        _clearCache();
        return respostaEstoque;
      });
    },

    processarVenda: function (venda) {
      return _request("POST", "/vendas", venda).then(function (respostaVenda) {
        _clearCache();
        return respostaVenda;
      });
    },

    buscarExtratoMembro: function (membroId, filtros = {}) {
      const parametrosConsulta = new URLSearchParams({
        membro_id: membroId,
        ...filtros,
      });
      return _request("GET", "/membros/extrato?" + parametrosConsulta);
    },

    quitarContaMembro: function (pagamento) {
      return _request("POST", "/vendas/pagamento", pagamento).then(
        function (respostaPagamento) {
          _clearCache();
          return respostaPagamento;
        },
      );
    },

    gerarRelatorioCaixa: function (tipoRelatorio, dadosFiltro) {
      let corpoRelatorio = Object.assign({}, dadosFiltro || {});
      corpoRelatorio.tipo = tipoRelatorio;
      return _request("POST", "/relatorios", corpoRelatorio);
    },

    abrirCaixa: function (valorAbertura) {
      return _request("POST", "/caixa/abrir", {
        valor_abertura: valorAbertura,
      });
    },

    fecharCaixa: function (caixaId, valorFechamento, observacoes) {
      return _request("POST", "/caixa/fechar", {
        caixa_id: caixaId,
        valor_fechamento: valorFechamento,
        observacoes: observacoes || null,
      });
    },

    getCaixaAberto: function (caixaId) {
      const consultaCaixa = caixaId
        ? "?caixa_id=" + encodeURIComponent(caixaId)
        : "";
      return _request("GET", "/caixa/aberto" + consultaCaixa);
    },

    health: function () {
      return _request("GET", "/health");
    },
  };
})();
