/** Contratos da outbox IndexedDB vigente: identidade, ACK, retry e reconciliação. */
import { beforeEach, expect, jest, test } from '@jest/globals';
import { IDBFactory } from 'fake-indexeddb';
import * as queue from '../static/js/features/pdv/offline-queue.js';

const payload = { id_externo: 'sale-original', usuario_origem_id: 'user-a', caixa_id: 'box-a', itens: [{ id: 1, qtd: 1 }] };
const ack = { status: 'ok', id_externo: payload.id_externo, usuario_id: 'user-a', caixa_id: 'box-a', venda_id: 'server-sale', total_calculado: 10 };
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); localStorage.clear(); });

test('persists immutable payload across module reload and rejects overwriting identifier', async () => {
    await queue.persistirOperacao(payload);
    await expect(queue.persistirOperacao({ ...payload, caixa_id: 'another' })).rejects.toBeDefined();
    jest.resetModules();
    const reloaded = await import('../static/js/features/pdv/offline-queue.js');
    expect((await reloaded.listarOperacoes())[0].payload).toEqual(payload);
});

test.each(['ok', 'duplicado'])('only valid %s ACK retires pending record, retaining receipt', async status => {
    await queue.persistirOperacao(payload);
    await queue.confirmarOperacao(payload, { ...ack, status });
    expect(await queue.listarOperacoes()).toEqual([]);
    const [receipt] = await queue.listarOperacoes({ incluirConfirmadas: true });
    expect(receipt.confirmacao.venda_id).toBe('server-sale');
    expect(receipt.payload).toEqual(payload);
});

test.each([{ status: 'erro' }, { id_externo: 'foreign' }, { usuario_id: 'foreign' },
    { caixa_id: 'foreign' }, { venda_id: null }, { total_calculado: null }, { total_calculado: -1 }])('rejects ambiguous or foreign ACK %j', async change => {
    await queue.persistirOperacao(payload);
    await expect(queue.confirmarOperacao(payload, { ...ack, ...change })).rejects.toMatchObject({ code: 'INVALID_ACK' });
    expect(await queue.listarOperacoes()).toHaveLength(1);
});

test.each([[401, 'autenticacao'], [403, 'autenticacao'], [409, 'conflito'], [422, 'reconciliacao'], [500, 'aguardando_reenvio'], [0, 'aguardando_reenvio']])('preserves HTTP/network failure %s without replacing identity', async (status, state) => {
    await queue.persistirOperacao(payload);
    await queue.registrarTentativa(payload.id_externo);
    await queue.registrarFalha(payload.id_externo, { status, retryable: status === 0 || status >= 500, message: 'public error' });
    const [record] = await queue.listarOperacoes();
    expect(record).toMatchObject({ estado: state, tentativas: 1, payload });
    expect(record.proxima_tentativa).toBeGreaterThan(Date.now());
});

test('bounded automatic retries and explicit same-owner reconciliation', async () => {
    await queue.persistirOperacao(payload);
    for (let i = 0; i < 8; i++) await queue.registrarTentativa(payload.id_externo);
    await queue.registrarFalha(payload.id_externo, { retryable: true, message: 'network' });
    expect((await queue.listarOperacoes())[0].estado).toBe('reconciliacao');
    await expect(queue.reenviarOperacao(payload.id_externo, 'user-b')).rejects.toThrow('origem');
    await queue.reenviarOperacao(payload.id_externo, 'user-a');
    expect((await queue.listarOperacoes())[0]).toMatchObject({ estado: 'pendente', payload });
});

test('storage failure prevents accepting a sale', async () => {
    globalThis.indexedDB = undefined;
    await expect(queue.persistirOperacao(payload)).rejects.toThrow('indisponível');
});
