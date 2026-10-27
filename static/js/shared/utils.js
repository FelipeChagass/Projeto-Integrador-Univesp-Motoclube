export function esc(texto) {
  return String(texto || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const ERROS_NATIVOS = [
  "TypeError",
  "ReferenceError",
  "SyntaxError",
  "RangeError",
  "EvalError",
  "URIError",
];

/**
 * Texto de erro seguro para a tela. Mensagens do servidor e do próprio app já
 * estão em português; exceções nativas do navegador (TypeError, DOMException...)
 * vêm em inglês e não ajudam o operador, então viram a mensagem padrão.
 */
export function mensagemErro(
  erro,
  padrao = "Erro inesperado. Tente novamente.",
) {
  if (typeof erro === "string") return erro || padrao;
  if (!erro || !erro.message) return padrao;
  const nativo =
    ERROS_NATIVOS.includes(erro.name) ||
    (typeof DOMException !== "undefined" && erro instanceof DOMException);
  return nativo ? padrao : erro.message;
}

export function sanitizeUrl(url) {
  if (!url) return "https://placehold.co/150x150/333/FFF?text=Foto";
  try {
    const urlAnalisada = new URL(url, window.location.origin);
    if (!["http:", "https:", "data:"].includes(urlAnalisada.protocol)) {
      return "https://placehold.co/150x150/333/FFF?text=Erro";
    }
    return url;
  } catch {
    return "https://placehold.co/150x150/333/FFF?text=Erro";
  }
}

export function formatCurrency(valorMonetario) {
  return `R$ ${(Number(valorMonetario) || 0).toFixed(2)}`;
}

export const LocalDB = {
  set: (chaveArmazenamento, valorArmazenado) => {
    try {
      localStorage.setItem(chaveArmazenamento, valorArmazenado);
    } catch {
      console.warn("Storage Bloqueado");
    }
  },
  get: (chaveArmazenamento) => {
    try {
      return localStorage.getItem(chaveArmazenamento);
    } catch {
      return null;
    }
  },
  remove: (chaveArmazenamento) => {
    try {
      localStorage.removeItem(chaveArmazenamento);
    } catch {
      /* ignore */
    }
  },
};
