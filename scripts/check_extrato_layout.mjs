/** Verificação visual com Edge/Chrome headless via CDP, sem dependências extras.
 * Usa servidor sintético próprio e módulos reais com respostas financeiras fixas.
 * BROWSER_PATH pode apontar para Chrome/Edge; capturas ficam em .test-logs/extrato.
 */
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const base = 'http://127.0.0.1:5055';
// Mesma versão do template, incorporada no documento de teste para evitar falhas da CDN no Edge.
const bootstrap = await readFile('.test-tools/bootstrap-5.3.3.min.css', 'utf8').catch(async () => {
    const response = await fetch('https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css');
    if (!response.ok) throw new Error('Não foi possível obter Bootstrap 5.3.3.');
    return response.text();
});
try { await fetch(`${base}/api/health`); throw new Error('Porta 5055 ocupada. Encerre somente seu servidor de teste.'); }
catch (error) { if (!error.cause) throw error; }
const python = process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python';
const server = spawn(resolve(python), ['scripts/smoke_server.py'], { windowsHide: true, stdio: 'ignore' });
let browser, socket;
try {
    for (let i = 0; ; i++) {
        try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* aguardar início */ }
        if (i === 100) throw new Error('Servidor não iniciou.');
        await delay(100);
    }
    const profile = await mkdtemp(join(tmpdir(), 'pdv-extrato-browser-'));
    browser = spawn(process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
        { windowsHide: true, stdio: 'ignore' });
    let port;
    for (let i = 0; ; i++) {
        try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { /* aguardar navegador */ }
        if (i === 100) throw new Error('Navegador não iniciou.');
        await delay(100);
    }
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
    let sequence = 0;
    const pending = new Map();
    socket.onmessage = event => {
        const message = JSON.parse(event.data);
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
    };
    const cdp = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
        const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
        return r.result.value;
    };
    await cdp('Page.enable');
    await cdp('Network.enable');
    await cdp('Network.setBlockedURLs', { urls: ['*.js'] });
    await cdp('Page.navigate', { url: `${base}/login` });
    await delay(200);
    await cdp('Network.setBlockedURLs', { urls: [] });
    await mkdir('.test-logs/extrato', { recursive: true });
    const report = [];
    for (const page of ['pdv', 'admin']) {
        const html = (await (await fetch(`${base}/${page === 'admin' ? 'admin' : ''}`)).text())
            .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<link[^>]+href="https:\/\/cdn.jsdelivr.net\/npm\/bootstrap[^>]+>/, () => `<style>${bootstrap}</style>`);
        const { frameTree } = await cdp('Page.getFrameTree');
        await cdp('Page.setDocumentContent', { frameId: frameTree.frame.id, html });
        await evaluate(`(async () => {
            await Promise.all([...document.querySelectorAll('link[rel="stylesheet"]')].map(link => link.sheet ? null : new Promise(resolve => { link.onload = resolve; link.onerror = resolve; setTimeout(resolve, 8000); })));
            const style = document.createElement('style'); style.textContent = '* { animation: none !important; transition: none !important; }'; document.head.append(style);
            const probe = document.createElement('div'); probe.className = 'd-flex'; document.body.append(probe);
            if (getComputedStyle(probe).display !== 'flex') throw new Error('Bootstrap não carregou; verificação inválida.'); probe.remove();
            const {API} = await import('/static/js/shared/api.js');
            const sample = {total:350,resumo:{total_periodo:500,total_pago_periodo:150,total_aberto_periodo:350},paginacao:{total:60,tem_mais:true},itens:Array.from({length:20},(_,i)=>({id:String(i),descricao:'Venda pendurada — bebidas e refeições do membro',tipo:'debito',data:'01/02/2026 20:35',valor:25,valor_aberto:i?25:0,valor_abatido:i?0:25,situacao:i?'em_aberto':'quitado'}))};
            API.buscarExtratoMembro = async () => sample;
            API.getListaMembros = async () => [{id:'membro-a',nome:'Membro de exemplo'}];
            API.request = async () => sample;
            const loading = document.getElementById('loading'); if (loading) loading.remove();
            if (${JSON.stringify(page)} === 'pdv') {
                const {S} = await import('/static/js/features/pdv/state.js'); S.operadorAtual='Operador'; S.carrinho=[{id:1,qtd:1}];
                const a = await import('/static/js/features/pdv/actions/membros.js'); a.abrirModalMembros('FIADO');
                await new Promise(resolve=>setTimeout(resolve,0)); document.getElementById('select-membro').value='membro-a'; await a.verificarDividaSelecionada();
            } else { const a = await import('/static/js/features/admin/membros.js'); await a.verExtrato('membro-a','Membro de exemplo'); }
        })()`);
        for (const width of [360, 480, 768, 900, 1440]) {
            await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
            for (const modo of ['mes', 'meses', 'datas']) {
                const metrics = await evaluate(`(() => {
                    const modal = document.getElementById(${JSON.stringify(page === 'pdv' ? 'modal-selecionar-membro' : 'modalExtrato')});
                    modal.classList.add('sheet-open');
                    const form = modal.querySelector('form'); form.elements.modo.value=${JSON.stringify(modo)}; form.elements.modo.dispatchEvent(new Event('change',{bubbles:true}));
                    const body = modal.querySelector('.modal-scroll-body'); body.scrollTop=0;
                    const content = modal.querySelector('.modal-content'); const rect=content.getBoundingClientRect();
                    const fields=[...form.querySelectorAll('input,select,button')].filter(el=>el.getClientRects().length).map(el=>{ const r=el.getBoundingClientRect(); return {left:r.left,right:r.right,width:r.width,height:r.height}; });
                    return {width:innerWidth,modalWidth:rect.width,modalLeft:rect.left,modalBottom:rect.bottom,overflow:body.scrollWidth-body.clientWidth,fields,scrollable:body.scrollHeight>body.clientHeight};
                })()`);
                if (metrics.overflow > 1 || metrics.modalLeft < -1 || metrics.modalBottom > 901 || metrics.fields.some(f=>f.width<80 || f.height<40 || f.left<0 || f.right>width+1)) throw new Error(`${page}/${width}/${modo}: ${JSON.stringify(metrics)}`);
                report.push({ page, width, modo, ...metrics });
            }
            const screenshot = await cdp('Page.captureScreenshot', { format: 'png' });
            await writeFile(`.test-logs/extrato/${page}-${width}.png`, Buffer.from(screenshot.data, 'base64'));
            const acessivel = await evaluate(`(() => {
                const modal=document.getElementById(${JSON.stringify(page === 'pdv' ? 'modal-selecionar-membro' : 'modalExtrato')});
                for (const scroll of [modal.querySelector('.modal-scroll-body'),modal.querySelector('.modal-content')]) scroll.scrollTop=scroll.scrollHeight;
                return [...modal.querySelectorAll('[data-anterior],[data-proxima],.extrato-acoes button')].every(el=>{const r=el.getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight+1 && r.left>=0 && r.right<=innerWidth+1;});
            })()`);
            if (!acessivel) throw new Error(`Paginação ou confirmação inacessível: ${page}/${width}`);
            const final = await cdp('Page.captureScreenshot', { format: 'png' });
            await writeFile(`.test-logs/extrato/${page}-${width}-fim.png`, Buffer.from(final.data, 'base64'));
        }
    }
    await writeFile('.test-logs/extrato/layout.json', JSON.stringify(report, null, 2));
    console.log(`${report.length} cenários de layout aprovados; capturas em .test-logs/extrato.`);
} finally {
    socket?.close(); browser?.kill(); server.kill();
}
