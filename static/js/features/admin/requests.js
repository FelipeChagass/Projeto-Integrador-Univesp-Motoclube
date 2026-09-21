/**
 * Adaptador do painel sobre o cliente HTTP compartilhado, sem duplicar autenticação.
 * Exibe falhas e retorna null; consumidores devem interromper o fluxo nesse caso.
 */
import { API } from '../../shared/api.js';
import { toast } from './ui.js';

export const BASE = '';

export async function authFetch(url, opts = {}) {
    try {
        const data = await API.request(opts.method || 'GET', url.replace(/^\/api/, ''), opts.body ? JSON.parse(opts.body) : undefined);
        return { json: async () => data };
    } catch (error) {
        toast(error.message || 'Operação não concluída.', false);
        // Every caller checks this sentinel before committing a UI success state.
        return null;
    }
}
