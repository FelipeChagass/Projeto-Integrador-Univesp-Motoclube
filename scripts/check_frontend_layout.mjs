/**
 * Validação sintética REAL: Edge headless/CDP + scripts/smoke_server.py.
 * Executar da raiz: node scripts/check_frontend_layout.mjs (Node >= 22).
 * Na rede corporativa, iniciar Node com NODE_USE_SYSTEM_CA=1; nunca desativar TLS.
 * Requer .venv já configurado. BROWSER_PATH permite selecionar Edge/Chrome.
 * FRONTEND_LAYOUT_OUTPUT permite separar execuções; padrão .test-logs/frontend-layout.
 * Bootstrap CSS/JS e SDK Supabase reais são incorporados no HTML servido ao browser.
 * Só a fronteira HTTP da API recebe fixtures. Nenhuma função UI/API é substituída.
 * Nenhuma venda, pagamento, alteração administrativa ou impressão física é enviada.
 * Retorna 1 para falhas observadas, 2 para falha de infraestrutura, 0 para aprovação.
 * Captura somente a árvore atual: não representa comparação histórica antes/depois.
 */
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  rm,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as pausa } from "node:timers/promises";
import { createServer } from "node:net";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const saida = resolve(
  raiz,
  process.env.FRONTEND_LAYOUT_OUTPUT || ".test-logs/frontend-layout",
);
const origem = "http://127.0.0.1:5055";
const larguras = [360, 375, 390, 768, 769, 820, 900, 1024, 1280];
const altura = 900;
const relatorio = {
  inicio: new Date().toISOString(),
  larguras,
  altura,
  baseline:
    "Não capturado; somente árvore atual, dados sintéticos e navegador novo.",
  verificacoes: [],
  rede: [],
  errosBrowser: [],
  recursos: [],
  processos: {},
};
let servidor, navegador, perfil, socket, cdp, avaliar, contexto;
let logServidor = "";
const pendentes = new Map();
const tarefasRede = new Set();
const cacheRecursos = new Map();
const usuario = {
  id: "layout-admin",
  nome: "Operador de Validação",
  perfil: "admin",
};
const produtos = Array.from({ length: 12 }, (_, indice) => ({
  id: indice + 1,
  nome:
    [
      "Cerveja artesanal",
      "Água mineral sem gás",
      "Refrigerante lata",
      "Hambúrguer artesanal com queijo e salada",
    ][indice % 4] + ` ${indice + 1}`,
  categoria: indice % 4 === 3 ? "comida" : "bebida",
  preco_atual: 8 + indice * 2.5,
  estoque_bar: 40,
  estoque_deposito: 80,
  estoque_min_bar: 5,
  estoque_min_deposito: 10,
  ativo: true,
  url_imagem: indice % 3 === 0 ? "/static/img/motorhead.svg" : "",
}));
produtos.push({
  id: 20,
  nome: "Combo encontro — duas cervejas e hambúrguer",
  categoria: "combo",
  preco_atual: 30,
  estoque_bar: 20,
  estoque_deposito: 40,
  ativo: true,
  url_imagem: "",
  itens_combo: [
    {
      produto_id: 1,
      nome: produtos[0].nome,
      quantidade: 2,
      categoria: "bebida",
      ativo: true,
    },
    {
      produto_id: 4,
      nome: produtos[3].nome,
      quantidade: 1,
      categoria: "comida",
      ativo: true,
    },
  ],
});

function exigir(condicao, mensagem, medidas) {
  if (!condicao) throw Object.assign(new Error(mensagem), { medidas });
}

async function esperar(teste, mensagem, limite = 12000) {
  const inicio = Date.now();
  while (Date.now() - inicio < limite) {
    if (await teste()) return;
    await pausa(50); // Poll limitado do harness; não altera animações da aplicação.
  }
  throw new Error(`Timeout: ${mensagem}`);
}

async function impressaoFontes() {
  const arquivos = [];
  async function visitar(pasta) {
    for (const entrada of await readdir(join(raiz, pasta), {
      withFileTypes: true,
    })) {
      const caminho = join(pasta, entrada.name);
      if (entrada.isDirectory()) await visitar(caminho);
      else if (/\.(css|js|html)$/.test(caminho)) {
        arquivos.push([
          caminho.replaceAll("\\", "/"),
          createHash("sha256")
            .update(await readFile(join(raiz, caminho)))
            .digest("hex"),
        ]);
      }
    }
  }
  for (const pasta of ["templates", "static/css", "static/js"])
    await visitar(pasta);
  return Object.fromEntries(arquivos.sort(([a], [b]) => a.localeCompare(b)));
}

async function recurso(url) {
  if (cacheRecursos.has(url)) return cacheRecursos.get(url);
  const tarefa = (async () => {
    const nome = createHash("sha256").update(url).digest("hex");
    const caminho = join(saida, "recursos", nome);
    let dados;
    try {
      dados = await readFile(caminho);
    } catch {
      const resposta = await fetch(url, { signal: AbortSignal.timeout(25000) });
      if (!resposta.ok)
        throw new Error(`Recurso ${url}: HTTP ${resposta.status}`);
      dados = Buffer.from(await resposta.arrayBuffer());
      await writeFile(caminho, dados);
    }
    relatorio.recursos.push({
      url,
      bytes: dados.length,
      sha256: createHash("sha256").update(dados).digest("hex"),
    });
    return dados;
  })();
  cacheRecursos.set(url, tarefa);
  return tarefa;
}

function fixture(caminho, metodo) {
  if (metodo !== "GET") return undefined;
  const respostas = {
    "/api/auth/config": {
      status: "ok",
      supabase_url: "https://example.test",
      supabase_anon_key: "synthetic-public-key",
    },
    "/api/auth/me": { status: "ok", usuario },
    "/api/dados-iniciais": {
      produtos,
      membros: [{ id: "membro-layout", nome: "Membro sintético" }],
      logoUrl: "/static/img/motorhead.svg",
    },
    "/api/produtos": { produtos },
    "/api/admin/produtos": { produtos },
    "/api/caixa/aberto": {
      status: "ok",
      caixa: { id: "caixa-layout", valor_abertura: 100 },
    },
    "/api/health": { status: "ok" },
  };
  return respostas[caminho];
}

async function capturar(nome) {
  const { data } = await cdp("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const caminho = join(saida, `${nome}.png`);
  await writeFile(caminho, Buffer.from(data, "base64"));
  return relative(raiz, caminho).replaceAll("\\", "/");
}

async function verificar(nome, acao) {
  const item = { ...contexto, nome };
  try {
    item.medidas = await acao();
    item.status = "ok";
  } catch (erro) {
    item.status = "falha";
    item.erro = erro.message;
    item.medidas = erro.medidas;
  }
  item.captura = await capturar(
    `${contexto.pagina}-${contexto.largura}-${nome}`,
  ).catch((erro) => `Não capturada: ${erro.message}`);
  relatorio.verificacoes.push(item);
  console.log(
    `${item.status === "ok" ? "OK" : "FALHA"} ${contexto.pagina}/${contexto.largura}/${nome}${item.erro ? `: ${item.erro}` : ""}`,
  );
  return item;
}

async function tecla(key, modifiers = 0) {
  const codigos = { Tab: 9, Enter: 13, Escape: 27, " ": 32 };
  const code = key === " " ? "Space" : key;
  await cdp("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code,
    windowsVirtualKeyCode: codigos[key],
    modifiers,
  });
  await cdp("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code,
    windowsVirtualKeyCode: codigos[key],
    modifiers,
  });
}

async function clicar(seletor) {
  const ponto = await avaliar(`(() => {
    const e=document.querySelector(${JSON.stringify(seletor)}); if(!e) throw Error('Seletor ausente: '+${JSON.stringify(seletor)});
    e.scrollIntoView({block:'center',inline:'nearest'});
    const r=e.getBoundingClientRect(); if(!r.width || !r.height) throw Error('Elemento oculto');
    return {x:r.x+r.width/2,y:r.y+r.height/2};
  })()`);
  await cdp("Input.dispatchMouseEvent", {
    type: "mousePressed",
    button: "left",
    clickCount: 1,
    ...ponto,
  });
  await cdp("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button: "left",
    clickCount: 1,
    ...ponto,
  });
}

async function tabAte(seletor, maximo = 100) {
  for (let passo = 0; passo < maximo; passo++) {
    await tecla("Tab");
    if (
      await avaliar(
        `document.activeElement?.matches(${JSON.stringify(seletor)})`,
      )
    )
      return passo + 1;
  }
  throw new Error(`Não alcançável por Tab em ${maximo} passos: ${seletor}`);
}

async function estabilizar() {
  await avaliar(`(async()=>{
    await document.fonts.ready;
    await Promise.all([...document.images].map(e=>e.complete?null:e.decode().catch(()=>{})));
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  })()`);
}

async function medirLayout() {
  return avaliar(`(() => {
    const visivel=e=>!!e.getClientRects().length && getComputedStyle(e).visibility!=='hidden' && !e.closest('[inert]');
    const descrever=e=>e.id ? '#'+e.id : e.tagName.toLowerCase()+'.'+[...e.classList].slice(0,3).join('.');
    const detalhes=e=>{const r=e.getBoundingClientRect();return {seletor:descrever(e),x:r.x,y:r.y,largura:r.width,altura:r.height,direita:r.right,base:r.bottom,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth};};
    const rolaveis=[...document.querySelectorAll('body *')].filter(e=>visivel(e)&&e.scrollWidth>e.clientWidth+1&&['auto','scroll'].includes(getComputedStyle(e).overflowX)).map(detalhes);
    const escapam=[...document.querySelectorAll('button,input,select,.pdv-produto-card,.login-container,header')].filter(e=>{
      if(!visivel(e))return false;
      if(e.closest('.offcanvas:not(.show)'))return false;
      for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement)if(['auto','scroll'].includes(getComputedStyle(p).overflowX)&&p.scrollWidth>p.clientWidth+1)return false;
      const r=e.getBoundingClientRect();return r.left < -1 || r.right > innerWidth+1;
    }).map(detalhes);
    return {viewport:innerWidth,documento:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,escapam,rolaveis,
      catalogo:document.querySelectorAll('#grid-produtos .card').length,linhasAdmin:document.querySelectorAll('#tabelaProdutos tr').length,
      carrinho:document.querySelector('#carrinho-section')?detalhes(document.querySelector('#carrinho-section')):null};
  })()`);
}

async function focoAtual() {
  return avaliar(`(() => {
    const e=document.activeElement,r=e.getBoundingClientRect(),s=getComputedStyle(e),c=e.closest('.card'),sc=c&&getComputedStyle(c);
    const centro=document.elementFromPoint(Math.max(0,Math.min(innerWidth-1,r.x+r.width/2)),Math.max(0,Math.min(innerHeight-1,r.y+r.height/2)));
    return {tag:e.tagName,id:e.id,classes:e.className,nome:e.getAttribute('aria-label')||e.textContent.trim(),focusVisible:e.matches(':focus-visible'),outline:s.outline,boxShadow:s.boxShadow,cardOutline:sc?.outline,cardShadow:sc?.boxShadow,
      x:r.x,y:r.y,largura:r.width,altura:r.height,visivel:r.width>0&&r.height>0&&r.x>=-1&&r.right<=innerWidth+1&&r.y>=-1&&r.bottom<=innerHeight+1,coberto:!!centro&&centro!==e&&!e.contains(centro)};
  })()`);
}

async function testarTeclado() {
  await avaliar(
    `document.querySelector('#filtro-catalogo button:last-child').focus()`,
  );
  const passosProduto = await tabAte(".pdv-produto-acionador");
  const produto = await focoAtual();
  const fotoProduto = await capturar(`pdv-${contexto.largura}-foco-produto`);
  const qtd = () =>
    avaliar(
      `import('/static/js/features/pdv/state.js').then(({estadoPdv:s})=>s.carrinho.reduce((n,i)=>n+Number(i.qtd),0))`,
    );
  const antes = await qtd();
  await tecla("Enter");
  await esperar(
    async () => (await qtd()) === antes + 1,
    "Enter deve adicionar produto",
  );
  if (contexto.largura < 768) {
    await avaliar(`document.querySelector('#btn-alternar-carrinho').focus()`);
    await tecla(" ");
    await esperar(
      () =>
        avaliar(
          `document.querySelector('#btn-alternar-carrinho').getAttribute('aria-expanded')==='true'`,
        ),
      "Space deve expandir carrinho",
    );
    await pausa(400);
  } else
    await avaliar(`document.querySelector('#btn-alternar-carrinho').focus()`);
  const passosCarrinho = await tabAte(
    '#carrinho-lista [data-action="increment"]',
    15,
  );
  const carrinho = await focoAtual();
  await capturar(`pdv-${contexto.largura}-foco-carrinho`);
  await tecla("Enter");
  await esperar(
    async () => (await qtd()) === antes + 2,
    "Enter deve incrementar quantidade",
  );
  const aposIncremento = await focoAtual();
  const medidas = {
    passosProduto,
    passosCarrinho,
    produto,
    carrinho,
    aposIncremento,
    fotoProduto,
    quantidade: await qtd(),
  };
  exigir(
    produto.visivel && produto.focusVisible && !produto.coberto,
    "Foco de produto oculto/coberto ou sem :focus-visible",
    medidas,
  );
  exigir(
    carrinho.visivel && carrinho.focusVisible && !carrinho.coberto,
    "Foco de quantidade oculto/coberto",
    medidas,
  );
  exigir(
    aposIncremento.tag === "BUTTON" && aposIncremento.nome === carrinho.nome,
    "Foco perdido após atualizar quantidade do carrinho",
    medidas,
  );
  return medidas;
}

async function testarOffcanvas() {
  const resultados = [];
  for (const [botao, modal] of [
    ["sidebar-config", "modal-config"],
    ["sidebar-gestao", "modal-relatorios"],
  ]) {
    await avaliar(`(() => {
      window.__fluxo=[]; const menu=document.querySelector('#sidebar-mobile'),modal=document.getElementById(${JSON.stringify(modal)});
      for(const tipo of ['show','shown','hide','hidden']) menu.addEventListener(tipo+'.bs.offcanvas',()=>window.__fluxo.push({tipo,t:performance.now(),modalVisivel:getComputedStyle(modal).display!=='none'}),{once:true});
    })()`);
    await clicar("#btn-hamburger");
    await esperar(
      () => avaliar(`window.__fluxo.some(e=>e.tipo==='shown')`),
      "Offcanvas shown real",
    );
    await capturar(`pdv-${contexto.largura}-${botao}-aberto`);
    await clicar(`#${botao}`);
    await esperar(
      () =>
        avaliar(
          `window.__fluxo.some(e=>e.tipo==='hidden') && getComputedStyle(document.getElementById(${JSON.stringify(modal)})).display!=='none'`,
        ),
      "Ação após hidden real",
    );
    await pausa(400);
    const medidas = await avaliar(
      `({eventos:window.__fluxo,backdrops:document.querySelectorAll('.offcanvas-backdrop').length,expandido:document.querySelector('#btn-hamburger').getAttribute('aria-expanded'),modalAberto:document.body.classList.contains('modal-open'),overflow:getComputedStyle(document.body).overflow})`,
    );
    resultados.push({ botao, ...medidas });
    await capturar(`pdv-${contexto.largura}-${botao}-depois-hidden`);
    await tecla("Escape");
    await esperar(
      () =>
        avaliar(
          `getComputedStyle(document.getElementById(${JSON.stringify(modal)})).display==='none'`,
        ),
      "Escape fecha modal de página",
    );
    exigir(
      !medidas.eventos.find((e) => e.tipo === "hide")?.modalVisivel &&
        medidas.eventos.some((e) => e.tipo === "hidden") &&
        medidas.backdrops === 0 &&
        medidas.expandido === "false",
      "Ação concorrente com Offcanvas/backdrop ou aria-expanded incorreto",
      resultados,
    );
  }
  await clicar("#btn-hamburger");
  await esperar(
    () =>
      avaliar(
        `document.querySelector('#sidebar-mobile').classList.contains('show') && !document.querySelector('#sidebar-mobile').classList.contains('showing')`,
      ),
    "Offcanvas aberto para Escape",
  );
  await tecla("Escape");
  await esperar(
    () =>
      avaliar(
        `!document.querySelector('#sidebar-mobile').classList.contains('show') && !document.querySelector('.offcanvas-backdrop')`,
      ),
    "Escape Offcanvas",
  );
  const foco = await focoAtual();
  exigir(
    foco.id === "btn-hamburger",
    "Escape do Offcanvas não restaurou foco ao acionador",
    { resultados, foco },
  );
  return { resultados, foco };
}

async function testarDialogo(tipo, escapar = false, pai = false) {
  const retorno =
    contexto.pagina === "login"
      ? "#login-email"
      : contexto.pagina === "admin"
        ? "#tabelaProdutos input"
        : "#filtro-catalogo button:last-child";
  await avaliar(`(async()=>{
    if(${pai}) (await import('/static/js/features/pdv/ui.js')).abrirModal('modal-config');
    const acionador=document.querySelector(${JSON.stringify(pai ? "#cfg-largura" : retorno)}); acionador.focus(); window.__retorno=acionador;
    window.__respostas=[];
    const registrar=(acao,valor)=>window.__respostas.push({acao,valor,dialogos:document.querySelectorAll('.ui-dialogo').length,backdrops:document.querySelectorAll('.modal-backdrop').length});
    const {UIModal}=await import('/static/js/shared/modals.js');
    UIModal[${JSON.stringify(tipo)}](${JSON.stringify("Validação sintética. Texto extenso para verificar rolagem, foco e ações acessíveis. ".repeat(90))},v=>registrar('confirmar',v),v=>registrar('cancelar',v));
  })()`);
  await esperar(
    () =>
      avaliar(
        `!!document.querySelector('.ui-dialogo.show') && document.querySelector('.ui-dialogo').contains(document.activeElement)`,
      ),
    "UIModal real visível e focado",
  );
  await estabilizar();
  if (tipo === "prompt")
    await cdp("Input.insertText", { text: "entrada-sintetica" });
  const medidas = await avaliar(`(() => {
    const m=document.querySelector('.ui-dialogo'),b=m.querySelector('.modal-body'),r=m.querySelector('.modal-content').getBoundingClientRect();
    return {topo:r.top,base:r.bottom,esquerda:r.left,direita:r.right,scroll:b.scrollHeight-b.clientHeight,overflow:b.scrollWidth-b.clientWidth,foco:document.activeElement.id||document.activeElement.textContent,bodyOverflow:getComputedStyle(document.body).overflow};
  })()`);
  for (let indice = 0; indice < 5; indice++) await tecla("Tab");
  medidas.focoContido = await avaliar(
    `document.querySelector('.ui-dialogo').contains(document.activeElement)`,
  );
  await tecla("Tab", 8);
  medidas.focoReversoContido = await avaliar(
    `document.querySelector('.ui-dialogo').contains(document.activeElement)`,
  );
  await capturar(
    `${contexto.pagina}-${contexto.largura}-${tipo}${escapar ? "-escape" : ""}${pai ? "-sobre-modal" : ""}-aberto`,
  );
  if (escapar) await tecla("Escape");
  else {
    await tabAte(".ui-dialogo .btn-danger", 5);
    await tecla("Enter");
  }
  await esperar(
    () => avaliar(`!document.querySelector('.ui-dialogo')`),
    "UIModal removido após hidden",
  );
  const final = await avaliar(
    `({respostas:window.__respostas,restaurou:document.activeElement===window.__retorno,bodyOverflow:getComputedStyle(document.body).overflow,modalOpen:document.body.classList.contains('modal-open'),backdrops:document.querySelectorAll('.modal-backdrop').length,paiVisivel:document.querySelector('#modal-config')?getComputedStyle(document.querySelector('#modal-config')).display!=='none':null})`,
  );
  if (pai) {
    await tecla("Escape");
    await esperar(
      () =>
        avaliar(
          `getComputedStyle(document.querySelector('#modal-config')).display==='none'`,
        ),
      "Fechar modal pai",
    );
  }
  const resultado = { ...medidas, final };
  exigir(
    medidas.topo >= -1 &&
      medidas.base <= altura + 1 &&
      medidas.esquerda >= -1 &&
      medidas.direita <= contexto.largura + 1 &&
      medidas.overflow <= 1,
    "UIModal extrapola viewport",
    resultado,
  );
  exigir(
    medidas.scroll > 0 && medidas.focoContido && medidas.focoReversoContido,
    "Rolagem ou contenção do foco falhou",
    resultado,
  );
  exigir(
    final.restaurou && final.backdrops === 0,
    "Foco ou backdrop não restaurado",
    resultado,
  );
  exigir(
    pai
      ? final.paiVisivel && final.modalOpen && final.bodyOverflow === "hidden"
      : !final.modalOpen && final.bodyOverflow !== "hidden",
    "Scroll lock incorreto após hidden",
    resultado,
  );
  const esperado = escapar ? (tipo === "alert" ? 0 : 1) : 1;
  exigir(
    final.respostas.length === esperado &&
      final.respostas.every(
        (r) =>
          r.dialogos === 0 &&
          r.backdrops === 0 &&
          r.acao === (escapar ? "cancelar" : "confirmar"),
      ),
    "Callback incorreto ou anterior à remoção do diálogo",
    resultado,
  );
  if (tipo === "prompt" && !escapar)
    exigir(
      final.respostas[0].valor === "entrada-sintetica",
      "Prompt perdeu valor",
      resultado,
    );
  return resultado;
}

async function testarImpressao(mm) {
  await avaliar(`(async()=>{
    const {estadoPdv:s}=await import('/static/js/features/pdv/state.js'); s.config.largura='ticket-${mm}mm';
    const {montarImpressao}=await import('/static/js/features/pdv/reports.js');
    montarImpressao([{id:1,nome:'Cerveja artesanal',qtd:1,preco:8,obs:''},{id:4,nome:'Hambúrguer artesanal com queijo e salada',qtd:1,preco:15.5,obs:'Sem cebola'}],'SIMULAÇÃO — NÃO PAGO','Visitante sintético');
  })()`);
  const telaOculta = await avaliar(
    `getComputedStyle(document.querySelector('#area-impressao')).display==='none'`,
  );
  await cdp("Emulation.setEmulatedMedia", { media: "print" });
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: Math.round((mm * 96) / 25.4),
    height: altura,
    deviceScaleFactor: 1,
    mobile: false,
  });
  try {
    await estabilizar();
    const medidas = await avaliar(`(() => {
      const a=document.querySelector('#area-impressao');
      return {telaOculta:${telaOculta},papelMm:${mm},papelPx:innerWidth,areaDisplay:getComputedStyle(a).display,areaVisivel:getComputedStyle(a).visibility,cor:getComputedStyle(a).color,fundo:getComputedStyle(a).backgroundColor,headerDisplay:getComputedStyle(document.querySelector('#app-header')).display,
        tickets:[...a.querySelectorAll('.ticket')].map(e=>{const r=e.getBoundingClientRect();return {largura:r.width,esquerda:r.left,direita:r.right,overflow:e.scrollWidth-e.clientWidth,conteudoOverflow:e.querySelector('.ticket-content').scrollWidth-e.querySelector('.ticket-content').clientWidth};})};
    })()`);
    await capturar(`pdv-${contexto.largura}-papel-${mm}mm`);
    const pdf = await cdp("Page.printToPDF", {
      printBackground: true,
      paperWidth: mm / 25.4,
      paperHeight: 297 / 25.4,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      preferCSSPageSize: true,
    });
    await writeFile(
      join(saida, `pdv-${contexto.largura}-papel-${mm}mm.pdf`),
      Buffer.from(pdf.data, "base64"),
    );
    exigir(
      telaOculta &&
        medidas.areaDisplay === "block" &&
        medidas.areaVisivel === "visible" &&
        medidas.headerDisplay === "none" &&
        medidas.tickets.length === 3,
      "Isolamento de impressão incorreto",
      medidas,
    );
    exigir(
      medidas.cor === "rgb(0, 0, 0)" && medidas.fundo === "rgb(255, 255, 255)",
      "Papel não está preto sobre branco",
      medidas,
    );
    exigir(
      medidas.tickets.every(
        (t) =>
          t.largura > 100 &&
          t.direita <= medidas.papelPx + 1 &&
          t.esquerda >= -1 &&
          t.overflow <= 1 &&
          t.conteudoOverflow <= 1,
      ),
      "Ticket extrapola papel ou recorta texto",
      medidas,
    );
    return medidas;
  } finally {
    await cdp("Emulation.setEmulatedMedia", { media: "screen" });
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: contexto.largura,
      height: altura,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }
}

async function encerrar(filho) {
  if (!filho?.pid || filho.exitCode !== null) return;
  if (process.platform === "win32") {
    await new Promise((r) => {
      const p = spawn("taskkill", ["/PID", String(filho.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      p.once("exit", r);
      p.once("error", r);
    });
  } else filho.kill("SIGTERM");
  await esperar(
    () => filho.exitCode !== null || filho.signalCode !== null,
    "Processo deve encerrar",
    5000,
  ).catch(() => filho.kill("SIGKILL"));
}

try {
  await mkdir(join(saida, "recursos"), { recursive: true });
  relatorio.fontesInicio = await impressaoFontes();
  relatorio.commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: raiz,
    encoding: "utf8",
  }).trim();
  // Recusar porta alheia, mesmo se o servidor encontrado responder /api/health.
  await new Promise((ok, falha) => {
    const s = createServer();
    s.once("error", () =>
      falha(
        new Error(
          "Porta 5055 ocupada; nenhum processo alheio será usado/encerrado.",
        ),
      ),
    );
    s.listen(5055, "127.0.0.1", () => s.close(ok));
  });
  const [bootstrapCss, bootstrapJs, supabaseJs] = await Promise.all([
    recurso(
      "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css",
    ),
    recurso(
      "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js",
    ),
    recurso("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"),
  ]);
  const python = join(
    raiz,
    process.platform === "win32"
      ? ".venv/Scripts/python.exe"
      : ".venv/bin/python",
  );
  await readFile(python); // Não recorrer a Python global silenciosamente.
  servidor = spawn(python, ["scripts/smoke_server.py"], {
    cwd: raiz,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  servidor.on("error", (erro) => {
    logServidor += erro.stack;
  });
  for (const fluxo of [servidor.stdout, servidor.stderr])
    fluxo.on("data", (dados) => {
      logServidor += dados.toString();
    });
  relatorio.processos.servidor = servidor.pid;
  await esperar(async () => {
    if (servidor.exitCode !== null)
      throw new Error(`Servidor encerrou: ${logServidor}`);
    try {
      return (
        await fetch(`${origem}/api/health`, {
          signal: AbortSignal.timeout(1000),
        })
      ).ok;
    } catch {
      return false;
    }
  }, "Servidor sintético");
  perfil = await mkdtemp(join(tmpdir(), "frontend-layout-edge-"));
  navegador = spawn(
    process.env.BROWSER_PATH ||
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--remote-debugging-port=0",
      `--user-data-dir=${perfil}`,
      "about:blank",
    ],
    { cwd: raiz, windowsHide: true, stdio: "ignore" },
  );
  let erroNavegador;
  navegador.on("error", (erro) => {
    erroNavegador = erro;
  });
  relatorio.processos.navegador = navegador.pid;
  let porta;
  await esperar(async () => {
    if (erroNavegador) throw erroNavegador;
    try {
      porta = (
        await readFile(join(perfil, "DevToolsActivePort"), "utf8")
      ).split("\n")[0];
      return !!porta;
    } catch {
      return false;
    }
  }, "Edge CDP");
  const alvos = await (
    await fetch(`http://127.0.0.1:${porta}/json/list`)
  ).json();
  socket = new WebSocket(
    alvos.find((a) => a.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((ok, falha) => {
    socket.addEventListener("open", ok, { once: true });
    socket.addEventListener("error", falha, { once: true });
  });
  let sequencia = 0;
  cdp = (method, params = {}) =>
    new Promise((ok, falha) => {
      const id = ++sequencia;
      const tempo = setTimeout(() => {
        pendentes.delete(id);
        falha(new Error(`CDP timeout ${method}`));
      }, 30000);
      pendentes.set(id, { ok, falha, tempo });
      socket.send(JSON.stringify({ id, method, params }));
    });
  avaliar = async (expression) => {
    const r = await cdp("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw new Error(
        r.exceptionDetails.exception?.description ||
          JSON.stringify(r.exceptionDetails),
      );
    return r.result.value;
  };
  async function interceptar({ requestId, request, resourceType }) {
    const url = new URL(request.url);
    const responder = (body, tipo, status = 200) =>
      cdp("Fetch.fulfillRequest", {
        requestId,
        responseCode: status,
        responseHeaders: [
          { name: "Content-Type", value: tipo },
          { name: "Access-Control-Allow-Origin", value: "*" },
        ],
        body: Buffer.from(body).toString("base64"),
      });
    if (url.origin === origem && url.pathname.startsWith("/api/")) {
      const dados = fixture(url.pathname, request.method);
      relatorio.rede.push({
        ...contexto,
        url: url.pathname,
        metodo: request.method,
        fixture: dados !== undefined,
      });
      return responder(
        JSON.stringify(
          dados ?? {
            status: "erro",
            message: "Operação bloqueada pelo harness",
            retryable: false,
          },
        ),
        "application/json",
        dados === undefined ? 403 : 200,
      );
    }
    if (url.origin === origem && resourceType === "Document") {
      exigir(
        ["/", "/login", "/admin"].includes(url.pathname),
        "Navegação local não autorizada",
      );
      let html = await (await fetch(request.url)).text();
      html = html
        .replace(
          /<link\b[^>]*href="https:\/\/cdn\.jsdelivr\.net\/npm\/bootstrap@[^>]+>/gi,
          () => `<style data-bootstrap-local>${bootstrapCss}</style>`,
        )
        .replace(
          /<script\b[^>]*src="https:\/\/cdn\.jsdelivr\.net\/npm\/bootstrap@[^>]+>\s*<\/script>/gi,
          () =>
            `<script data-bootstrap-local>${bootstrapJs.toString().replaceAll("</script", "<\\/script")}</script>`,
        )
        .replace(
          /<script\b[^>]*src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2"[^>]*>\s*<\/script>/gi,
          () =>
            `<script>${supabaseJs.toString().replaceAll("</script", "<\\/script")}</script>`,
        );
      return responder(html, "text/html; charset=utf-8");
    }
    if (
      url.origin === origem &&
      url.pathname.startsWith("/static/") &&
      request.method === "GET"
    )
      return cdp("Fetch.continueRequest", { requestId });
    if (
      [
        "fonts.googleapis.com",
        "fonts.gstatic.com",
        "cdn.jsdelivr.net",
      ].includes(url.hostname) &&
      request.method === "GET"
    ) {
      const tipo = /\.woff2?(\?|$)/.test(url.pathname)
        ? "font/woff2"
        : "text/css";
      return responder(await recurso(request.url), tipo);
    }
    // Nunca encaminhar autenticação/serviços externos (inclusive example.test).
    relatorio.rede.push({
      ...contexto,
      url: request.url,
      metodo: request.method,
      bloqueado: true,
    });
    return responder("Bloqueado pelo harness", "text/plain", 403);
  }
  socket.onmessage = ({ data }) => {
    const mensagem = JSON.parse(data);
    if (mensagem.id) {
      const p = pendentes.get(mensagem.id);
      if (!p) return;
      clearTimeout(p.tempo);
      pendentes.delete(mensagem.id);
      mensagem.error
        ? p.falha(new Error(JSON.stringify(mensagem.error)))
        : p.ok(mensagem.result);
    } else if (mensagem.method === "Fetch.requestPaused") {
      const tarefa = interceptar(mensagem.params).catch(async (erro) => {
        relatorio.errosBrowser.push({
          ...contexto,
          tipo: "interceptacao",
          erro: erro.message,
        });
        await cdp("Fetch.failRequest", {
          requestId: mensagem.params.requestId,
          errorReason: "Failed",
        }).catch(() => {});
      });
      tarefasRede.add(tarefa);
      tarefa.finally(() => tarefasRede.delete(tarefa));
    } else if (mensagem.method === "Runtime.exceptionThrown")
      relatorio.errosBrowser.push({
        ...contexto,
        tipo: "exception",
        detalhes: mensagem.params.exceptionDetails,
      });
    else if (
      mensagem.method === "Runtime.consoleAPICalled" &&
      mensagem.params.type === "error"
    )
      relatorio.errosBrowser.push({
        ...contexto,
        tipo: "console",
        argumentos: mensagem.params.args.map((a) => a.value || a.description),
      });
    else if (
      mensagem.method === "Network.responseReceived" &&
      mensagem.params.response.status >= 400
    )
      relatorio.errosBrowser.push({
        ...contexto,
        tipo: "http",
        url: mensagem.params.response.url,
        status: mensagem.params.response.status,
      });
  };
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Network.enable");
  await cdp("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  relatorio.browser = await cdp("Browser.getVersion");
  for (const pagina of ["login", "pdv", "admin"]) {
    for (const largura of larguras) {
      contexto = { pagina, largura };
      await cdp("Emulation.setDeviceMetricsOverride", {
        width: largura,
        height: altura,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await cdp("Storage.clearDataForOrigin", {
        origin: origem,
        storageTypes: "all",
      });
      await cdp("Page.navigate", {
        url: `${origem}/${pagina === "pdv" ? "" : pagina}`,
      });
      const inicializacao = await verificar("inicializacao", async () => {
        await esperar(
          () =>
            avaliar(
              `document.readyState==='complete' && location.pathname===${JSON.stringify(pagina === "pdv" ? "/" : `/${pagina}`)} && !!window.bootstrap?.Modal && !!window.supabase`,
            ),
          "Documento, Bootstrap e SDK reais",
        );
        if (pagina === "pdv") {
          await esperar(
            () =>
              avaliar(
                `document.querySelectorAll('#grid-produtos .card').length>0 && getComputedStyle(document.querySelector('#loading')).display==='none'`,
              ),
            "Catálogo renderizado pela inicialização real",
          );
          await clicar('#filtro-catalogo [data-categoria="todos"]');
        } else if (pagina === "admin")
          await esperar(
            () =>
              avaliar(
                `document.querySelectorAll('#tabelaProdutos input').length>0`,
              ),
            "Tabela real de produtos",
          );
        await estabilizar();
        const bootstrap = await avaliar(
          `({versao:window.bootstrap.Modal.VERSION,css:!!document.querySelector('style[data-bootstrap-local]'),js:!!document.querySelector('script[data-bootstrap-local]')})`,
        );
        exigir(
          bootstrap.versao === "5.3.3" && bootstrap.css && bootstrap.js,
          "Bootstrap inline local não validado",
          bootstrap,
        );
        return bootstrap;
      });
      if (inicializacao.status !== "ok") continue;
      await verificar("layout", async () => {
        const medidas = await medirLayout();
        exigir(
          medidas.overflow <= 1 && medidas.escapam.length === 0,
          "Overflow horizontal ou controle fora do viewport",
          medidas,
        );
        if (pagina === "pdv")
          exigir(
            medidas.catalogo === produtos.length,
            "Catálogo não contém todas as fixtures",
            medidas,
          );
        if (pagina === "admin")
          exigir(
            medidas.linhasAdmin === produtos.length,
            "Tabela não contém todas as fixtures",
            medidas,
          );
        return medidas;
      });
      if (pagina === "pdv") {
        await verificar("teclado-produto-carrinho", testarTeclado);
        // Fechar somente o carrinho através de sua ação real, mesmo após falha do teste.
        if (
          largura < 768 &&
          (await avaliar(
            `document.querySelector('#carrinho-section').classList.contains('mobile-aberto')`,
          ))
        ) {
          await clicar("#btn-alternar-carrinho");
          await pausa(400);
        }
        if (largura < 768) await verificar("offcanvas", testarOffcanvas);
      }
      for (const tipo of ["alert", "confirm", "prompt"]) {
        await verificar(`dialogo-${tipo}`, () => testarDialogo(tipo));
        await verificar(`dialogo-${tipo}-escape`, () =>
          testarDialogo(tipo, true),
        );
      }
      if (pagina === "pdv") {
        await verificar("dialogo-sobre-modal", () =>
          testarDialogo("confirm", true, true),
        );
        for (const mm of [58, 80])
          await verificar(`impressao-${mm}mm`, () => testarImpressao(mm));
      }
    }
  }
  await Promise.allSettled([...tarefasRede]);
  relatorio.fontesFim = await impressaoFontes();
  relatorio.alteradosDuranteExecucao = [
    ...new Set([
      ...Object.keys(relatorio.fontesInicio),
      ...Object.keys(relatorio.fontesFim),
    ]),
  ].filter((c) => relatorio.fontesInicio[c] !== relatorio.fontesFim[c]);
  relatorio.resumo = {
    total: relatorio.verificacoes.length,
    falhas: relatorio.verificacoes.filter((v) => v.status === "falha").length,
    errosBrowser: relatorio.errosBrowser.length,
    apiNaoPrevista: relatorio.rede.filter((r) => r.fixture === false).length,
  };
  process.exitCode =
    relatorio.resumo.falhas ||
    relatorio.resumo.errosBrowser ||
    relatorio.resumo.apiNaoPrevista ||
    relatorio.alteradosDuranteExecucao.length
      ? 1
      : 0;
} catch (erro) {
  relatorio.infraestrutura = erro.stack;
  console.error(erro.stack);
  process.exitCode = 2;
} finally {
  socket?.close();
  for (const p of pendentes.values()) {
    clearTimeout(p.tempo);
    p.falha(new Error("Harness encerrado"));
  }
  pendentes.clear();
  await encerrar(navegador);
  await encerrar(servidor);
  relatorio.processos.encerrados = {
    navegador:
      !navegador ||
      navegador.exitCode !== null ||
      navegador.signalCode !== null,
    servidor:
      !servidor || servidor.exitCode !== null || servidor.signalCode !== null,
  };
  if (perfil)
    await rm(perfil, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    }).catch((erro) => {
      relatorio.perfilTemporario = { caminho: perfil, erro: erro.message };
    });
  relatorio.fim = new Date().toISOString();
  await mkdir(saida, { recursive: true });
  await writeFile(
    join(saida, "layout.json"),
    JSON.stringify(relatorio, null, 2),
  );
  await writeFile(join(saida, "smoke-server.log"), logServidor);
  console.log(
    JSON.stringify(
      {
        ...relatorio.resumo,
        fontesAlteradas: relatorio.alteradosDuranteExecucao,
        processos: relatorio.processos.encerrados,
        relatorio: join(saida, "layout.json"),
      },
      null,
      2,
    ),
  );
}
