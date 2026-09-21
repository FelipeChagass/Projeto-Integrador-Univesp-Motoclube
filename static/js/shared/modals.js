/**
 * Diálogos compartilhados de confirmação/aviso e seu ciclo de vida no DOM.
 * Sem transporte HTTP ou regra financeira; consumidores importam este módulo diretamente.
 */
export const UIModal = {
    confirm: function (msg, callbackOk, callbackCancel) { this.show('CONFIRMAÇÃO', msg, true, callbackOk, callbackCancel); },
    alert: function (msg, callbackOk) { this.show('ALERTA', msg, false, callbackOk, null); },
    prompt: function (msg, callbackOk, callbackCancel) { this.show('INSERIR DADOS', msg, true, callbackOk, callbackCancel, true); },
    show: function (title, msg, isConfirm, onOk, onCancel, isPrompt) {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.85)',
            zIndex: '999999', display: 'flex', justifyContent: 'center', alignItems: 'center'
        });

        const modalDiv = document.createElement('div');
        Object.assign(modalDiv.style, {
            background: 'linear-gradient(145deg, #222, #1a1a1a)',
            border: '1px solid rgba(255,255,255,0.08)',
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
        const headerEl = document.createElement('div');
        Object.assign(headerEl.style, {
            background: 'rgba(0,0,0,0.25)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            padding: '1rem 1.5rem'
        });
        const titleEl = document.createElement('h3');
        Object.assign(titleEl.style, {
            margin: '0',
            fontSize: '1rem',
            fontWeight: '600',
            color: '#b30000',
            letterSpacing: '0.5px',
            textTransform: 'uppercase'
        });
        titleEl.textContent = title;
        headerEl.appendChild(titleEl);

        // Body
        const bodyEl = document.createElement('div');
        Object.assign(bodyEl.style, { padding: '1.25rem 1.5rem' });

        const msgEl = document.createElement('p');
        Object.assign(msgEl.style, {
            margin: '0 0 1.25rem 0',
            fontSize: '0.95rem',
            color: '#ccc',
            lineHeight: '1.5'
        });
        msgEl.textContent = msg;
        bodyEl.appendChild(msgEl);

        let inputEl = null;
        if (isPrompt) {
            inputEl = document.createElement('input');
            inputEl.type = 'password';
            inputEl.id = 'ui-prompt-input';
            Object.assign(inputEl.style, {
                width: '100%', padding: '10px 14px', marginBottom: '1rem',
                borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(0,0,0,0.3)', color: '#fff',
                fontSize: '0.9rem', boxSizing: 'border-box'
            });
            bodyEl.appendChild(inputEl);
        }

        const buttonsDiv = document.createElement('div');
        Object.assign(buttonsDiv.style, { display: 'flex', gap: '8px', justifyContent: 'center' });

        const okBtn = document.createElement('button');
        okBtn.textContent = isConfirm ? 'CONFIRMAR' : 'OK';
        Object.assign(okBtn.style, {
            flex: '1', padding: '11px 16px',
            border: '1px solid rgba(179,0,0,0.5)',
            borderRadius: '10px',
            background: 'linear-gradient(145deg, #8a0000, #b30000)',
            color: '#fff', cursor: 'pointer',
            fontWeight: '700', fontSize: '0.82rem',
            letterSpacing: '0.5px'
        });
        okBtn.onclick = () => {
            const val = isPrompt ? inputEl.value : null;
            document.body.removeChild(overlay);
            if (onOk) onOk(val);
        };

        if (isConfirm) {
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'CANCELAR';
            Object.assign(cancelBtn.style, {
                flex: '1', padding: '11px 16px',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px',
                background: 'linear-gradient(145deg, #1c1c1c, #111)',
                color: '#aaa', cursor: 'pointer',
                fontWeight: '600', fontSize: '0.82rem'
            });
            cancelBtn.onclick = () => {
                const val = isPrompt ? inputEl.value : null;
                document.body.removeChild(overlay);
                if (onCancel) onCancel(val);
            };
            buttonsDiv.append(cancelBtn);
        }

        buttonsDiv.append(okBtn);
        bodyEl.appendChild(buttonsDiv);
        modalDiv.append(headerEl, bodyEl);
        overlay.append(modalDiv);

        document.body.appendChild(overlay);

        if (isPrompt && inputEl) {
            setTimeout(() => inputEl.focus(), 100);
        }
    }
};
