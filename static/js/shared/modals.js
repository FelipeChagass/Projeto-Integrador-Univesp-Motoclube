import { abrirDialogo } from "./dialogs.js";

/** API histórica de callbacks; toda apresentação pertence ao Bootstrap Modal. */
export const UIModal = {
  confirm(mensagem, aoConfirmar, aoCancelar) {
    this.show("CONFIRMAÇÃO", mensagem, true, aoConfirmar, aoCancelar);
  },
  alert(mensagem, aoConfirmar) {
    this.show("ALERTA", mensagem, false, aoConfirmar, null);
  },
  prompt(mensagem, aoConfirmar, aoCancelar) {
    this.show("INSERIR DADOS", mensagem, true, aoConfirmar, aoCancelar, true);
  },
  show(
    titulo,
    mensagem,
    exigeConfirmacao,
    aoConfirmar,
    aoCancelar,
    solicitaEntrada,
  ) {
    abrirDialogo({
      titulo,
      mensagem,
      exigeConfirmacao,
      aoConfirmar,
      aoCancelar,
      solicitaEntrada,
    });
  },
};
