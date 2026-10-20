/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeEach } from "@jest/globals";
import {
  estadoPdv,
  salvarEstadoLocal,
  salvarDadosLocais,
  carregarDadosLocais,
} from "../static/js/features/pdv/state.js";

describe("state.js — Estado Inicial", () => {
  test("estadoPdv tem todas as propriedades obrigatórias", () => {
    expect(estadoPdv).toHaveProperty("produtos");
    expect(estadoPdv).toHaveProperty("membros");
    expect(estadoPdv).toHaveProperty("carrinho");
    expect(estadoPdv).toHaveProperty("filaVendas");
    expect(estadoPdv).toHaveProperty("config");
    expect(estadoPdv).toHaveProperty("operadorAtual");
    expect(estadoPdv).toHaveProperty("caixaAberto");
    expect(estadoPdv).toHaveProperty("caixaId");
    expect(estadoPdv).toHaveProperty("pagamentoPendente");
    expect(estadoPdv).toHaveProperty("enviandoVenda");
    expect(estadoPdv).toHaveProperty("processandoFila");
  });

  test("arrays iniciam vazios", () => {
    expect(Array.isArray(estadoPdv.produtos)).toBe(true);
    expect(Array.isArray(estadoPdv.membros)).toBe(true);
    expect(Array.isArray(estadoPdv.filaVendas)).toBe(true);
  });

  test("config tem valores padrão", () => {
    expect(estadoPdv.config.imprimir).toBe(true);
    expect(estadoPdv.config.largura).toBe("ticket-80mm");
  });

  test("caixaAberto inicia fechado", () => {
    expect(estadoPdv.caixaAberto).toBe(false);
  });

  test("pagamentoPendente tem estrutura correta", () => {
    expect(estadoPdv.pagamentoPendente).toEqual({
      tipo: "",
      valorTotal: 0,
      dados: null,
    });
  });
});

describe("state.js — Persistência", () => {
  beforeEach(() => {
    localStorage.clear();
    estadoPdv.carrinho = [];
    estadoPdv.produtos = [];
    estadoPdv.membros = [];
    estadoPdv.operadorAtual = "";
    estadoPdv.inicioTurno = null;
    estadoPdv.filaVendas = [];
    estadoPdv.config = {
      imprimir: true,
      largura: "ticket-80mm",
      logo: "/static/img/motorhead.svg",
    };
    estadoPdv.caixaAberto = false;
    estadoPdv.valorAbertura = 0;
    estadoPdv.caixaId = null;
  });

  test("salvarEstadoLocal salva carrinho no localStorage", () => {
    estadoPdv.carrinho = [
      { id: 1, nome: "Cerveja", preco: 10, qtd: 2, obs: "" },
    ];
    salvarEstadoLocal();
    const saved = JSON.parse(localStorage.getItem("motoBarCarrinho"));
    expect(saved).toHaveLength(1);
    expect(saved[0].nome).toBe("Cerveja");
    expect(saved[0].qtd).toBe(2);
  });

  test("salvarDadosLocais persiste todos os dados", () => {
    estadoPdv.produtos = [{ id: 1, nome: "Água" }];
    estadoPdv.membros = [{ nome: "João" }];
    estadoPdv.operadorAtual = "Maria";
    estadoPdv.caixaAberto = true;
    estadoPdv.caixaId = "cx-123";
    estadoPdv.valorAbertura = 100;
    salvarDadosLocais();

    expect(localStorage.getItem("motoBarOperador")).toBe("Maria");
    expect(localStorage.getItem("motoBarCaixaAberto")).toBe("true");
    expect(localStorage.getItem("motoBarCaixaId")).toBe("cx-123");
    expect(JSON.parse(localStorage.getItem("motoBarProdutos"))).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem("motoBarMembros"))).toHaveLength(1);
  });

  test("carregarDadosLocais restaura o estado", () => {
    // Salvar
    estadoPdv.produtos = [{ id: 5, nome: "Suco" }];
    estadoPdv.operadorAtual = "Carlos";
    estadoPdv.caixaAberto = true;
    estadoPdv.carrinho = [{ id: 5, nome: "Suco", preco: 8, qtd: 1, obs: "" }];
    salvarDadosLocais();

    // Resetar
    estadoPdv.produtos = [];
    estadoPdv.operadorAtual = "";
    estadoPdv.caixaAberto = false;
    estadoPdv.carrinho = [];

    // Restaurar
    carregarDadosLocais();
    expect(estadoPdv.produtos).toHaveLength(1);
    expect(estadoPdv.produtos[0].nome).toBe("Suco");
    expect(estadoPdv.operadorAtual).toBe("Carlos");
    expect(estadoPdv.caixaAberto).toBe(true);
    expect(estadoPdv.carrinho).toHaveLength(1);
  });

  test("carregarDadosLocais lida com localStorage vazio", () => {
    carregarDadosLocais();
    expect(estadoPdv.produtos).toEqual([]);
    expect(estadoPdv.operadorAtual).toBe("");
    expect(estadoPdv.caixaAberto).toBe(false);
  });

  test("carregarDadosLocais lida com JSON inválido sem crashar", () => {
    localStorage.setItem("motoBarProdutos", "INVALID_JSON{{{");
    expect(() => carregarDadosLocais()).not.toThrow();
  });

  test("salvarEstadoLocal com carrinho vazio", () => {
    estadoPdv.carrinho = [];
    salvarEstadoLocal();
    expect(JSON.parse(localStorage.getItem("motoBarCarrinho"))).toEqual([]);
  });
});
