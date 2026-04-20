/**
 * @jest-environment node
 * 
 * Testes de integração HTTP — Valida que o servidor Flask 
 * responde corretamente nas rotas de login, PDV e admin.
 * 
 * Requer o servidor rodando em http://localhost:5000
 */
import { describe, test, expect, beforeAll } from '@jest/globals';

const BASE = 'http://localhost:5000';

async function fetchText(url, opts = {}) {
    const res = await fetch(url, { redirect: 'manual', ...opts });
    return { status: res.status, headers: res.headers, body: await res.text().catch(() => '') };
}

describe('Servidor — Rotas de Saúde', () => {
    test('GET /api/health retorna 200', async () => {
        const { status, body } = await fetchText(`${BASE}/api/health`);
        expect(status).toBe(200);
    });
});

describe('Servidor — Página de Login', () => {
    test('GET /login retorna 200 com HTML', async () => {
        const { status, body } = await fetchText(`${BASE}/login`);
        expect(status).toBe(200);
        expect(body).toContain('login');
    });

    test('login.js é servido corretamente', async () => {
        const { status, body } = await fetchText(`${BASE}/static/js/login.js`);
        expect(status).toBe(200);
        expect(body).toContain('realizarLogin');
    });
});

describe('Servidor — Módulos ES6 do PDV', () => {
    test('app.js é servido como módulo', async () => {
        const { status, body } = await fetchText(`${BASE}/static/js/app.js`);
        expect(status).toBe(200);
        expect(body).toContain('import');
        expect(body).toContain('iniciarSistema');
    });

    test('utils.js é servido', async () => {
        const { status, body } = await fetchText(`${BASE}/static/js/utils.js`);
        expect(status).toBe(200);
        expect(body).toContain('export function esc');
    });

    test('state.js é servido', async () => {
        const { status, body } = await fetchText(`${BASE}/static/js/state.js`);
        expect(status).toBe(200);
        expect(body).toContain('export const S');
    });

    test('ui.js é servido', async () => {
        const { status, body } = await fetchText(`${BASE}/static/js/ui.js`);
        expect(status).toBe(200);
        expect(body).toContain('export function renderizarCatalogo');
    });

    test('actions.js é servido', async () => {
        const { status, body } = await fetchText(`${BASE}/static/js/actions.js`);
        expect(status).toBe(200);
        expect(body).toContain('export function adicionarAoCarrinho');
    });

    test('reports.js é servido', async () => {
        const { status, body } = await fetchText(`${BASE}/static/js/reports.js`);
        expect(status).toBe(200);
        expect(body).toContain('export function montarImpressao');
    });

    test('api.js é servido', async () => {
        const { status, body } = await fetchText(`${BASE}/static/js/api.js`);
        expect(status).toBe(200);
        expect(body).toContain('API');
    });
});

describe('Servidor — Template PDV', () => {
    test('GET / requer autenticação (redirect ou HTML)', async () => {
        const { status } = await fetchText(`${BASE}/`);
        // Deve retornar 200 com HTML do PDV (ou redirect para login)
        expect([200, 302]).toContain(status);
    });

    test('Template PDV usa type="module" para app.js', async () => {
        const { status, body } = await fetchText(`${BASE}/`);
        if (status === 200) {
            expect(body).toContain('type="module"');
            expect(body).toContain('app.js');
            // Verifica que ponto_venda.js NÃO é mais referenciado
            expect(body).not.toContain('ponto_venda.js');
        }
    });

    test('Template PDV não contém onclick inline', async () => {
        const { status, body } = await fetchText(`${BASE}/`);
        if (status === 200) {
            // Remove scripts inline (window.onerror is OK) 
            const bodyWithoutHead = body.split('</head>')[1] || body;
            expect(bodyWithoutHead).not.toContain('onclick=');
            expect(bodyWithoutHead).not.toContain('onchange=');
            expect(bodyWithoutHead).not.toContain('oninput=');
        }
    });
});

describe('Servidor — Painel Admin', () => {
    test('GET /admin retorna 200 ou redirect', async () => {
        const { status } = await fetchText(`${BASE}/admin`);
        expect([200, 302]).toContain(status);
    });

    test('admin.js é servido', async () => {
        const { status, body } = await fetchText(`${BASE}/static/js/admin.js`);
        expect(status).toBe(200);
    });
});

describe('Servidor — API Auth', () => {
    test('GET /api/auth/config retorna credenciais Supabase', async () => {
        const { status, body } = await fetchText(`${BASE}/api/auth/config`);
        expect(status).toBe(200);
        const data = JSON.parse(body);
        expect(data.status).toBe('ok');
        expect(data).toHaveProperty('supabase_url');
        expect(data).toHaveProperty('supabase_anon_key');
    });

    test('GET /api/auth/me sem token retorna 401', async () => {
        const { status } = await fetchText(`${BASE}/api/auth/me`);
        expect(status).toBe(401);
    });
});

describe('Servidor — Segurança', () => {
    test('CSS estáticos são servidos', async () => {
        const { status } = await fetchText(`${BASE}/static/css/ponto_venda.css`);
        expect(status).toBe(200);
    });

    test('imagens estáticas são servidas', async () => {
        const { status } = await fetchText(`${BASE}/static/img/motorhead.png`);
        expect(status).toBe(200);
    });

    test('caminhos inexistentes retornam 404', async () => {
        const { status } = await fetchText(`${BASE}/rota-que-nao-existe`);
        expect([404, 302]).toContain(status);
    });
});
