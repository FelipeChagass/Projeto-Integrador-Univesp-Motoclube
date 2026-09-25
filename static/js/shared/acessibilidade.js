/** Preferência de leitura local, compartilhada pelo painel e pelo PDV. */
const CHAVE = 'pdv:escala-fonte';
let escala = 1;
try {
    const salvo = Number(localStorage.getItem(CHAVE));
    if (salvo >= 1 && salvo <= 1.5) escala = salvo;
} catch (_) { /* A preferência funciona mesmo sem armazenamento disponível. */ }

export function ajustarFonte(delta = 0) {
    escala = Math.min(1.5, Math.max(1, Math.round((escala + delta) * 10) / 10));
    document.documentElement.style.setProperty('--escala-fonte', escala);
    document.documentElement.style.fontSize = `${16 * escala}px`;
    document.querySelectorAll('[data-fonte-valor]').forEach(el => { el.textContent = `${Math.round(escala * 100)}%`; });
    document.querySelectorAll('[data-fonte]').forEach(el => {
        el.disabled = Number(el.dataset.fonte) < 0 ? escala <= 1 : escala >= 1.5;
    });
    try { localStorage.setItem(CHAVE, String(escala)); } catch (_) { /* Opcional. */ }
}

ajustarFonte();
document.addEventListener('click', event => {
    const botao = event.target.closest('[data-fonte]');
    if (botao) ajustarFonte(Number(botao.dataset.fonte));
});
