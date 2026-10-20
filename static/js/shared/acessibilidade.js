/** Preferência de leitura local, compartilhada pelo painel e pelo PDV. */
const CHAVE_ESCALA_FONTE = 'pdv:escala-fonte';
let escalaFonte = 1;
try {
    const escalaSalva = Number(localStorage.getItem(CHAVE_ESCALA_FONTE));
    if (escalaSalva >= 1 && escalaSalva <= 1.5) escalaFonte = escalaSalva;
} catch { /* A preferência funciona mesmo sem armazenamento disponível. */ }

export function ajustarFonte(variacaoEscala = 0) {
    escalaFonte = Math.min(1.5, Math.max(1, Math.round((escalaFonte + variacaoEscala) * 10) / 10));
    document.documentElement.style.setProperty('--escala-fonte', escalaFonte);
    document.documentElement.style.fontSize = `${16 * escalaFonte}px`;
    document.querySelectorAll('[data-fonte-valor]').forEach(indicadorEscalaFonte => { indicadorEscalaFonte.textContent = `${Math.round(escalaFonte * 100)}%`; });
    document.querySelectorAll('[data-fonte]').forEach(botaoAjusteFonte => {
        botaoAjusteFonte.disabled = Number(botaoAjusteFonte.dataset.fonte) < 0 ? escalaFonte <= 1 : escalaFonte >= 1.5;
    });
    try { localStorage.setItem(CHAVE_ESCALA_FONTE, String(escalaFonte)); } catch { /* Opcional. */ }
}

ajustarFonte();
document.addEventListener('click', eventoClique => {
    const botaoFonte = eventoClique.target.closest('[data-fonte]');
    if (botaoFonte) ajustarFonte(Number(botaoFonte.dataset.fonte));
});
