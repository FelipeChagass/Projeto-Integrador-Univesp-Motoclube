CREATE TABLE usuarios (
  id uuid NOT NULL,
  nome text NOT NULL,
  perfil text NOT NULL DEFAULT 'operador'::text CHECK (perfil = ANY (ARRAY['admin'::text, 'operador'::text])),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  email character varying NOT NULL UNIQUE,
  CONSTRAINT usuarios_pkey PRIMARY KEY (id),
  CONSTRAINT usuarios_id_fkey FOREIGN KEY (id) REFERENCES __AUTH_USERS__(id)
);
CREATE TABLE membros (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  saldo_devedor numeric NOT NULL DEFAULT 0 CHECK (saldo_devedor >= 0::numeric),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT membros_pkey PRIMARY KEY (id)
);
CREATE TABLE produtos (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nome text NOT NULL,
  preco_atual numeric NOT NULL CHECK (preco_atual >= 0::numeric),
  estoque_bar integer NOT NULL DEFAULT 0 CHECK (estoque_bar >= 0),
  estoque_deposito integer NOT NULL DEFAULT 0 CHECK (estoque_deposito >= 0),
  url_imagem text,
  categoria text,
  estoque_min_bar integer NOT NULL DEFAULT 0 CHECK (estoque_min_bar >= 0),
  estoque_min_deposito integer NOT NULL DEFAULT 0 CHECK (estoque_min_deposito >= 0),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT produtos_pkey PRIMARY KEY (id)
);
CREATE TABLE caixas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  usuario_abertura_id uuid NOT NULL,
  usuario_fechamento_id uuid,
  aberto_em timestamp with time zone NOT NULL DEFAULT now(),
  fechado_em timestamp with time zone,
  valor_abertura numeric NOT NULL DEFAULT 0 CHECK (valor_abertura >= 0::numeric),
  valor_fechamento numeric CHECK (valor_fechamento IS NULL OR valor_fechamento >= 0::numeric),
  status text NOT NULL DEFAULT 'aberto'::text CHECK (status = ANY (ARRAY['aberto'::text, 'fechado'::text])),
  observacoes text,
  CONSTRAINT caixas_pkey PRIMARY KEY (id),
  CONSTRAINT caixas_usuario_abertura_id_fkey FOREIGN KEY (usuario_abertura_id) REFERENCES usuarios(id),
  CONSTRAINT caixas_usuario_fechamento_id_fkey FOREIGN KEY (usuario_fechamento_id) REFERENCES usuarios(id)
);
CREATE TABLE vendas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  id_externo text UNIQUE,
  caixa_id uuid,
  usuario_id uuid,
  membro_id uuid,
  tipo_venda text NOT NULL CHECK (tipo_venda = ANY (ARRAY['normal'::text, 'fiado'::text, 'recebimento_divida'::text, 'ajuste'::text])),
  metodo_pagamento text NOT NULL CHECK (metodo_pagamento = ANY (ARRAY['dinheiro'::text, 'pix'::text, 'cartao_credito'::text, 'cartao_debito'::text, 'fiado'::text, 'ajuste'::text])),
  nome_cliente text,
  valor_total numeric NOT NULL CHECK (valor_total >= 0::numeric),
  observacoes text,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT vendas_pkey PRIMARY KEY (id),
  CONSTRAINT vendas_caixa_id_fkey FOREIGN KEY (caixa_id) REFERENCES caixas(id),
  CONSTRAINT vendas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  CONSTRAINT vendas_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES membros(id)
);
CREATE TABLE itens_venda (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL,
  produto_id bigint,
  nome_produto text NOT NULL,
  quantidade integer NOT NULL CHECK (quantidade > 0),
  preco_unitario numeric NOT NULL CHECK (preco_unitario >= 0::numeric),
  preco_total numeric NOT NULL CHECK (preco_total >= 0::numeric),
  observacoes text,
  CONSTRAINT itens_venda_pkey PRIMARY KEY (id),
  CONSTRAINT itens_venda_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES vendas(id),
  CONSTRAINT itens_venda_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES produtos(id)
);
CREATE TABLE movimentacoes_membro (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  membro_id uuid NOT NULL,
  venda_id uuid,
  usuario_id uuid,
  tipo_movimentacao text NOT NULL CHECK (tipo_movimentacao = ANY (ARRAY['debito'::text, 'credito'::text, 'ajuste'::text])),
  origem text NOT NULL CHECK (origem = ANY (ARRAY['venda_fiado'::text, 'pagamento'::text, 'ajuste_manual'::text])),
  descricao text,
  valor numeric NOT NULL CHECK (valor >= 0::numeric),
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT movimentacoes_membro_pkey PRIMARY KEY (id),
  CONSTRAINT movimentacoes_membro_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES membros(id),
  CONSTRAINT movimentacoes_membro_venda_id_fkey FOREIGN KEY (venda_id) REFERENCES vendas(id),
  CONSTRAINT movimentacoes_membro_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
CREATE TABLE ajustes_estoque (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  produto_id bigint NOT NULL,
  usuario_id uuid,
  estoque_bar_anterior integer NOT NULL,
  estoque_bar_novo integer NOT NULL,
  estoque_deposito_anterior integer NOT NULL,
  estoque_deposito_novo integer NOT NULL,
  estoque_min_bar_anterior integer,
  estoque_min_bar_novo integer,
  estoque_min_deposito_anterior integer,
  estoque_min_deposito_novo integer,
  motivo text,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ajustes_estoque_pkey PRIMARY KEY (id),
  CONSTRAINT ajustes_estoque_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES produtos(id),
  CONSTRAINT ajustes_estoque_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
CREATE TABLE configuracoes_sistema (
  id integer NOT NULL DEFAULT 1 CHECK (id = 1),
  url_logo text,
  imprimir_automatico boolean NOT NULL DEFAULT true,
  largura_impressao text NOT NULL DEFAULT 'ticket-80mm'::text CHECK (largura_impressao = ANY (ARRAY['ticket-80mm'::text, 'ticket-58mm'::text])),
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT configuracoes_sistema_pkey PRIMARY KEY (id)
);
