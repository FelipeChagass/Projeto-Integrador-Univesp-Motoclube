import { mensagemErro } from "../../shared/utils.js";
// Durable outbox. Confirmations remain as receipts; pending operations are never deleted.
const NOME_BANCO_OPERACOES = "motoBarOperacoes";
const NOME_COLECAO_OPERACOES = "operacoes";

export function novoIdExterno() {
  if (!globalThis.crypto?.randomUUID)
    throw new Error(
      "Navegador sem identificador seguro. Utilize HTTPS e um navegador atualizado.",
    );
  return globalThis.crypto.randomUUID();
}

/** Erros do IndexedDB chegam como DOMException em inglês; o operador recebe o motivo em português. */
function erroArmazenamento(erro) {
  const nomes = {
    QuotaExceededError:
      "Sem espaço no armazenamento do navegador. Libere espaço e tente de novo.",
    ConstraintError: "Esta operação já está registrada neste dispositivo.",
    VersionError:
      "O armazenamento local está em versão mais nova. Atualize a página.",
  };
  const novo = new Error(
    nomes[erro?.name] ||
      "Falha ao gravar no armazenamento do navegador. Recarregue a página e tente de novo.",
  );
  novo.cause = erro;
  return novo;
}

async function abrirBanco() {
  if (!globalThis.indexedDB)
    throw new Error("IndexedDB indisponível. A operação não foi registrada.");
  return new Promise((resolver, rejeitar) => {
    const requisicaoAbertura = indexedDB.open(NOME_BANCO_OPERACOES, 1);
    requisicaoAbertura.onupgradeneeded = () =>
      requisicaoAbertura.result.createObjectStore(NOME_COLECAO_OPERACOES, {
        keyPath: "id_externo",
      });
    requisicaoAbertura.onsuccess = () => resolver(requisicaoAbertura.result);
    requisicaoAbertura.onerror = () =>
      rejeitar(erroArmazenamento(requisicaoAbertura.error));
    requisicaoAbertura.onblocked = () =>
      rejeitar(new Error("Armazenamento ocupado. Feche outras abas do PDV."));
  });
}

async function transacao(modoTransacao, executarOperacao) {
  const bancoOperacoes = await abrirBanco();
  try {
    return await new Promise((resolver, rejeitar) => {
      const transacaoBanco = bancoOperacoes.transaction(
        NOME_COLECAO_OPERACOES,
        modoTransacao,
      );
      let resultadoOperacao;
      transacaoBanco.oncomplete = () => resolver(resultadoOperacao);
      transacaoBanco.onabort = transacaoBanco.onerror = () =>
        rejeitar(erroArmazenamento(transacaoBanco.error));
      executarOperacao(
        transacaoBanco.objectStore(NOME_COLECAO_OPERACOES),
        (valorResultado) => {
          resultadoOperacao = valorResultado;
        },
      );
    });
  } finally {
    bancoOperacoes.close();
  }
}

export async function listarOperacoes({ incluirConfirmadas = false } = {}) {
  const todasOperacoes = await transacao(
    "readonly",
    (colecaoOperacoes, concluir) => {
      colecaoOperacoes.getAll().onsuccess = (eventoConsulta) =>
        concluir(eventoConsulta.target.result);
    },
  );
  return todasOperacoes.filter(
    (operacao) => incluirConfirmadas || operacao.estado !== "confirmado",
  );
}

export function persistirOperacao(dadosOperacao) {
  if (
    !dadosOperacao.id_externo ||
    !dadosOperacao.usuario_origem_id ||
    !dadosOperacao.caixa_id
  ) {
    return Promise.reject(
      new Error("Operação sem identificador, usuário ou caixa de origem."),
    );
  }
  const registro = {
    id_externo: dadosOperacao.id_externo,
    payload: JSON.parse(JSON.stringify(dadosOperacao)),
    estado: "pendente",
    tentativas: 0,
    ultimo_erro: null,
    proxima_tentativa: 0,
    criado_em: new Date().toISOString(),
  };
  return transacao("readwrite", (colecaoOperacoes, concluir) => {
    colecaoOperacoes.add(registro);
    concluir(registro);
  });
}

function atualizar(operacaoId, alterarRegistro) {
  return transacao("readwrite", (colecaoOperacoes, concluir) => {
    colecaoOperacoes.get(operacaoId).onsuccess = (eventoConsulta) => {
      const registro = eventoConsulta.target.result;
      if (!registro || registro.estado === "confirmado")
        return concluir(registro);
      alterarRegistro(registro);
      colecaoOperacoes.put(registro);
      concluir(registro);
    };
  });
}

export function validarConfirmacao(dadosOperacao, confirmacaoServidor) {
  return !!(
    confirmacaoServidor &&
    ["ok", "duplicado"].includes(confirmacaoServidor.status) &&
    confirmacaoServidor.id_externo === dadosOperacao.id_externo &&
    typeof confirmacaoServidor.venda_id === "string" &&
    confirmacaoServidor.venda_id.length > 0 &&
    confirmacaoServidor.caixa_id === dadosOperacao.caixa_id &&
    confirmacaoServidor.usuario_id === dadosOperacao.usuario_origem_id &&
    confirmacaoServidor.total_calculado !== null &&
    confirmacaoServidor.total_calculado !== undefined &&
    Number.isFinite(Number(confirmacaoServidor.total_calculado)) &&
    Number(confirmacaoServidor.total_calculado) >= 0
  );
}

export function confirmarOperacao(dadosOperacao, confirmacaoServidor) {
  if (!validarConfirmacao(dadosOperacao, confirmacaoServidor)) {
    const erroConfirmacao = new Error(
      "Confirmação inválida ou de outra operação. Registro preservado para reconciliação.",
    );
    erroConfirmacao.code = "INVALID_ACK";
    return Promise.reject(erroConfirmacao);
  }
  return atualizar(dadosOperacao.id_externo, (registro) => {
    registro.estado = "confirmado";
    registro.confirmacao = confirmacaoServidor;
    registro.confirmado_em = new Date().toISOString();
  });
}

export function registrarTentativa(operacaoId) {
  return atualizar(operacaoId, (registro) => {
    registro.tentativas += 1;
    registro.ultima_tentativa = new Date().toISOString();
    // Crash/reload while awaiting a reply must replay the SAME operation later.
    registro.proxima_tentativa = Date.now() + 30000;
  });
}

export function registrarFalha(operacaoId, erroOperacao) {
  return atualizar(operacaoId, (registro) => {
    registro.ultimo_erro = {
      code: erroOperacao.code || "UNEXPECTED_ERROR",
      status: erroOperacao.status || 0,
      message: mensagemErro(erroOperacao),
      details: erroOperacao.details || null,
      request_id: erroOperacao.requestId || null,
      ocorrido_em: new Date().toISOString(),
    };
    registro.estado = [401, 403].includes(erroOperacao.status)
      ? "autenticacao"
      : erroOperacao.status === 409
        ? "conflito"
        : erroOperacao.retryable && registro.tentativas < 8
          ? "aguardando_reenvio"
          : "reconciliacao";
    registro.proxima_tentativa =
      Date.now() +
      Math.min(300000, 2000 * 2 ** registro.tentativas) +
      Math.random() * 1000;
  });
}

export async function reenviarOperacao(operacaoId, usuarioId) {
  const registro = (await listarOperacoes()).find(
    (operacao) => operacao.id_externo === operacaoId,
  );
  if (
    !registro ||
    !usuarioId ||
    registro.payload.usuario_origem_id !== usuarioId
  ) {
    throw new Error(
      "Somente o operador de origem pode reenviar esta operação.",
    );
  }
  return atualizar(operacaoId, (registroOperacao) => {
    registroOperacao.estado = "pendente";
    registroOperacao.proxima_tentativa = 0;
  });
}

export async function possuiPendenciasCaixa(caixaId) {
  return (await listarOperacoes()).some(
    (operacao) => operacao.payload.caixa_id === caixaId,
  );
}
