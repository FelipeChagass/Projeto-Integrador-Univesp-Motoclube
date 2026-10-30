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

/**
 * Dinheiro sempre no padrão brasileiro, num só lugar: "R$ 12,30" e "1.234,50".
 * Valor ausente ou inválido vira zero. Para o `value` de <input type="number"> continue
 * usando toFixed(2): o campo exige ponto decimal.
 */
const FORMATO_REAIS = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const FORMATO_VALOR = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(valorMonetario) {
  return FORMATO_REAIS.format(Number(valorMonetario) || 0);
}

/**
 * Data "AAAA-MM-DD" no fuso do aparelho, para <input type="date">. toISOString() usa UTC:
 * depois das 21h em São Paulo ele já devolve o dia seguinte.
 */
export function dataLocalISO(data = new Date()) {
  const doisDigitos = (numero) => String(numero).padStart(2, "0");
  return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
}

/** Só o número ("12,30"), para colunas que já dizem "(R$)" no cabeçalho. */
export function formatarValor(valorMonetario) {
  return FORMATO_VALOR.format(Number(valorMonetario) || 0);
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
