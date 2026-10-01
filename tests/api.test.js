/** Contratos do cliente HTTP/Auth e preservação da outbox IndexedDB no logout. */
import { beforeEach, expect, jest, test } from '@jest/globals';
import { API } from '../static/js/shared/api.js';
import { persistirOperacao, listarOperacoes } from '../static/js/features/pdv/offline-queue.js';
import { IDBFactory } from 'fake-indexeddb';

const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
beforeEach(async () => {
    window.supabase = { createClient: () => ({ auth: {
        getSession: async () => ({ data: { session: { access_token: 'synthetic' } } }),
        signOut: async () => ({})
    } }) };
    globalThis.fetch = jest.fn(async () => response(200, { status: 'ok', supabase_url: 'https://example.test', supabase_anon_key: 'public-test' }));
    await API._initSupabase();
    fetch.mockClear();
});

test.each([200, 201, 202, 204])('HTTP %s successful contract', async status => {
    fetch.mockResolvedValueOnce(response(status, { status: 'ok', id: 'a' }));
    expect(await API.request('GET', '/synthetic')).toEqual(status === 204 ? null : { status: 'ok', id: 'a' });
});

test.each([400, 401, 403, 404, 409, 422, 500, 503])('HTTP %s rejects preserving status/code and does not retry POST', async status => {
    fetch.mockResolvedValueOnce(response(status, { status: 'erro', code: 'PUBLIC_CODE', message: 'public message', details: { field: 'qtd' }, retryable: true }));
    await expect(API.request('POST', '/synthetic', {})).rejects.toMatchObject({ status, code: 'PUBLIC_CODE', details: { field: 'qtd' }, retryable: status >= 500 });
    expect(fetch).toHaveBeenCalledTimes(1);
});

test('transport failure identifies an unreachable server and never retries writes itself', async () => {
    fetch.mockRejectedValueOnce(new TypeError('failed'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(API.request('POST', '/vendas', {})).rejects.toMatchObject({
        status: 0, code: 'SERVER_UNREACHABLE', retryable: true,
        message: 'Não foi possível alcançar o servidor.',
        details: { tipo: 'transporte', method: 'POST', endpoint: '/vendas', online: true, browser_error: 'TypeError' }
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
});

test('HTML error body does not expose server internals', async () => {
    fetch.mockResolvedValueOnce({ status: 500, ok: false, json: async () => { throw new SyntaxError('private SQL'); } });
    await expect(API.request('GET', '/synthetic')).rejects.toMatchObject({ status: 500, message: 'Não foi possível concluir a operação.' });
});

test('logout removes local session data without changing the IndexedDB outbox', async () => {
    globalThis.indexedDB = new IDBFactory();
    const payload = { id_externo: 'sale', usuario_origem_id: 'a', caixa_id: 'c' };
    await persistirOperacao(payload);
    localStorage.setItem('motoBarUsuario', 'old-profile');
    await API.logout();
    expect(localStorage.getItem('motoBarUsuario')).toBeNull();
    expect((await listarOperacoes())[0].payload).toEqual(payload);
});
