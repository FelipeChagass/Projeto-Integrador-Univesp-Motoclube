/**
 * Diálogos compartilhados de confirmação/aviso e seu ciclo de vida no DOM.
 * Sem transporte HTTP ou regra financeira; consumidores importam este módulo diretamente.
 */
export const UIModal = {
    confirm: function (mensagem, aoConfirmar, aoCancelar) { this.show('CONFIRMAÇÃO', mensagem, true, aoConfirmar, aoCancelar); },
    alert: function (mensagem, aoConfirmar) { this.show('ALERTA', mensagem, false, aoConfirmar, null); },
    prompt: function (mensagem, aoConfirmar, aoCancelar) { this.show('INSERIR DADOS', mensagem, true, aoConfirmar, aoCancelar, true); },
    show: function (titulo, mensagem, exigeConfirmacao, aoConfirmar, aoCancelar, solicitaEntrada) {
        const sobreposicaoModal = document.createElement('div');
        Object.assign(sobreposicaoModal.style, {
            position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.85)',
            zIndex: '999999', display: 'flex', justifyContent: 'center', alignItems: 'center'
        });

        const elementoModal = document.createElement('div');
        Object.assign(elementoModal.style, {
            background: 'var(--card-bg)',
            border: '1px solid var(--border-subtle)',
            padding: '0',
            borderRadius: '14px',
            width: '90%',
            maxWidth: '480px',
            textAlign: 'center',
            color: '#fff',
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            overflow: 'hidden'
        });

        // Header strip
        const cabecalhoModal = document.createElement('div');
        Object.assign(cabecalhoModal.style, {
            background: 'var(--surface-bg)',
            borderBottom: '1px solid var(--divider-color)',
            padding: '1rem 1.5rem'
        });
        const elementoTitulo = document.createElement('h3');
        Object.assign(elementoTitulo.style, {
            margin: '0',
            fontSize: '1rem',
            fontWeight: '600',
            color: 'var(--accent-readable)',
            letterSpacing: '0.5px',
            textTransform: 'uppercase'
        });
        elementoTitulo.textContent = titulo;
        cabecalhoModal.appendChild(elementoTitulo);

        // Body
        const corpoModal = document.createElement('div');
        Object.assign(corpoModal.style, { padding: '1.25rem 1.5rem' });

        const elementoMensagem = document.createElement('p');
        Object.assign(elementoMensagem.style, {
            margin: '0 0 1.25rem 0',
            fontSize: '0.95rem',
            color: 'var(--text-primary)',
            lineHeight: '1.5'
        });
        elementoMensagem.textContent = mensagem;
        corpoModal.appendChild(elementoMensagem);

        let campoEntrada = null;
        if (solicitaEntrada) {
            campoEntrada = document.createElement('input');
            campoEntrada.type = 'password';
            campoEntrada.id = 'ui-prompt-input';
            Object.assign(campoEntrada.style, {
                width: '100%', padding: '10px 14px', marginBottom: '1rem',
                borderRadius: '8px', border: '1px solid var(--input-border)',
                background: 'var(--input-bg)', color: 'var(--text-primary)',
                fontSize: '0.9rem', boxSizing: 'border-box'
            });
            corpoModal.appendChild(campoEntrada);
        }

        const grupoBotoes = document.createElement('div');
        Object.assign(grupoBotoes.style, { display: 'flex', gap: '8px', justifyContent: 'center' });

        const botaoConfirmar = document.createElement('button');
        botaoConfirmar.textContent = exigeConfirmacao ? 'CONFIRMAR' : 'OK';
        Object.assign(botaoConfirmar.style, {
            flex: '1', padding: '11px 16px',
            border: '1px solid var(--accent)',
            borderRadius: '10px',
            background: 'linear-gradient(145deg, var(--accent), #8a0000)',
            color: '#fff', cursor: 'pointer',
            fontWeight: '700', fontSize: '0.82rem',
            letterSpacing: '0.5px'
        });
        botaoConfirmar.onclick = () => {
            const valorEntrada = solicitaEntrada ? campoEntrada.value : null;
            document.body.removeChild(sobreposicaoModal);
            if (aoConfirmar) aoConfirmar(valorEntrada);
        };

        if (exigeConfirmacao) {
            const botaoCancelar = document.createElement('button');
            botaoCancelar.textContent = 'CANCELAR';
            Object.assign(botaoCancelar.style, {
                flex: '1', padding: '11px 16px',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                background: 'linear-gradient(145deg, var(--control-bg), var(--surface-bg))',
                color: 'var(--text-primary)', cursor: 'pointer',
                fontWeight: '600', fontSize: '0.82rem'
            });
            botaoCancelar.onclick = () => {
                const valorEntrada = solicitaEntrada ? campoEntrada.value : null;
                document.body.removeChild(sobreposicaoModal);
                if (aoCancelar) aoCancelar(valorEntrada);
            };
            grupoBotoes.append(botaoCancelar);
        }

        grupoBotoes.append(botaoConfirmar);
        corpoModal.appendChild(grupoBotoes);
        elementoModal.append(cabecalhoModal, corpoModal);
        sobreposicaoModal.append(elementoModal);

        document.body.appendChild(sobreposicaoModal);

        if (solicitaEntrada && campoEntrada) {
            setTimeout(() => campoEntrada.focus(), 100);
        }
    }
};
