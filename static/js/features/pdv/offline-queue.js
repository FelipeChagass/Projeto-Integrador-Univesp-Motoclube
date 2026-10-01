// Durable outbox. Confirmations remain as receipts; pending operations are never deleted.
const DB_NAME = 'motoBarOperacoes';
const STORE = 'operacoes';

export function novoIdExterno() {
    if (!globalThis.crypto?.randomUUID) throw new Error('Navegador sem identificador seguro. Utilize HTTPS e um navegador atualizado.');
    return globalThis.crypto.randomUUID();
}

async function abrirBanco() {
    if (!globalThis.indexedDB) throw new Error('IndexedDB indisponível. A operação não foi registrada.');
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id_externo' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Armazenamento ocupado. Feche outras abas do PDV.'));
    });
}

async function transacao(modo, operacao) {
    const db = await abrirBanco();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, modo);
            let resultado;
            tx.oncomplete = () => resolve(resultado);
            tx.onabort = tx.onerror = () => reject(tx.error || new Error('Falha ao persistir operação.'));
            operacao(tx.objectStore(STORE), value => { resultado = value; });
        });
    } finally { db.close(); }
}

export async function listarOperacoes({ incluirConfirmadas = false } = {}) {
    const todas = await transacao('readonly', (store, done) => {
        store.getAll().onsuccess = event => done(event.target.result);
    });
    return todas.filter(v => incluirConfirmadas || v.estado !== 'confirmado');
}

export function persistirOperacao(payload) {
    if (!payload.id_externo || !payload.usuario_origem_id || !payload.caixa_id) {
        return Promise.reject(new Error('Operação sem identificador, usuário ou caixa de origem.'));
    }
    const registro = {
        id_externo: payload.id_externo, payload: JSON.parse(JSON.stringify(payload)),
        estado: 'pendente', tentativas: 0, ultimo_erro: null, proxima_tentativa: 0,
        criado_em: new Date().toISOString()
    };
    return transacao('readwrite', (store, done) => { store.add(registro); done(registro); });
}

function atualizar(id, alterar) {
    return transacao('readwrite', (store, done) => {
        store.get(id).onsuccess = event => {
            const registro = event.target.result;
            if (!registro || registro.estado === 'confirmado') return done(registro);
            alterar(registro);
            store.put(registro);
            done(registro);
        };
    });
}

export function validarConfirmacao(payload, ack) {
    return !!(ack && ['ok', 'duplicado'].includes(ack.status) &&
        ack.id_externo === payload.id_externo && typeof ack.venda_id === 'string' && ack.venda_id.length > 0 &&
        ack.caixa_id === payload.caixa_id && ack.usuario_id === payload.usuario_origem_id &&
        ack.total_calculado !== null && ack.total_calculado !== undefined &&
        Number.isFinite(Number(ack.total_calculado)) && Number(ack.total_calculado) >= 0);
}

export function confirmarOperacao(payload, ack) {
    if (!validarConfirmacao(payload, ack)) {
        const error = new Error('Confirmação inválida ou de outra operação. Registro preservado para reconciliação.');
        error.code = 'INVALID_ACK';
        return Promise.reject(error);
    }
    return atualizar(payload.id_externo, registro => {
        registro.estado = 'confirmado';
        registro.confirmacao = ack;
        registro.confirmado_em = new Date().toISOString();
    });
}

export function registrarTentativa(id) {
    return atualizar(id, registro => {
        registro.tentativas += 1;
        registro.ultima_tentativa = new Date().toISOString();
        // Crash/reload while awaiting a reply must replay the SAME operation later.
        registro.proxima_tentativa = Date.now() + 30000;
    });
}

export function registrarFalha(id, error) {
    return atualizar(id, registro => {
        registro.ultimo_erro = {
            code: error.code || 'UNEXPECTED_ERROR', status: error.status || 0,
            message: error.message, details: error.details || null,
            request_id: error.requestId || null, ocorrido_em: new Date().toISOString()
        };
        registro.estado = [401, 403].includes(error.status) ? 'autenticacao' :
            error.status === 409 ? 'conflito' :
                error.retryable && registro.tentativas < 8 ? 'aguardando_reenvio' : 'reconciliacao';
        registro.proxima_tentativa = Date.now() + Math.min(300000, 2000 * 2 ** registro.tentativas) + Math.random() * 1000;
    });
}

export async function reenviarOperacao(id, usuarioId) {
    const registro = (await listarOperacoes()).find(v => v.id_externo === id);
    if (!registro || !usuarioId || registro.payload.usuario_origem_id !== usuarioId) {
        throw new Error('Somente o operador de origem pode reenviar esta operação.');
    }
    return atualizar(id, item => { item.estado = 'pendente'; item.proxima_tentativa = 0; });
}

export async function possuiPendenciasCaixa(caixaId) {
    return (await listarOperacoes()).some(v => v.payload.caixa_id === caixaId);
}
