# 🔄 Fluxos Backend por Tela

Documentação detalhada de cada endpoint REST chamado por cada tela do sistema, na ordem em que ocorrem durante o uso.

---

## 📋 Índice

1. [Login](#1--login)
2. [Cadastro](#2--cadastro)
3. [PDV (Ponto de Venda)](#3--pdv-ponto-de-venda)
4. [Admin (Painel Administrativo)](#4--admin-painel-administrativo)

---

## 1. 🔑 Login

**Template**: `login.html` · **JS**: `login.js` · **Proteção**: Nenhuma (público)

### Fluxo

```
1. GET /api/auth/config           → Retorna SUPABASE_URL + ANON_KEY
2. Supabase Auth signInWithPassword(email, senha)  → JWT
3. GET /api/auth/me               → Valida JWT, retorna dados do usuário do banco
4. POST /api/auth/sincronizar     → (se 1º login) Cria registro na tabela `usuarios`
5. Redireciona para / (PDV) ou /admin conforme perfil
```

### Detalhamento

| Rota | Método | Decorator | Service | Descrição |
|------|--------|-----------|---------|-----------|
| `/api/auth/config` | GET | Nenhum | — | Retorna `supabase_url` e `supabase_anon_key` do `.env` |
| `/api/auth/me` | GET | `@requer_login` | — | Valida JWT via `supabase.auth.get_user()`, busca usuário na tabela `usuarios`, retorna `{id, email, nome, perfil}` |
| `/api/auth/sincronizar` | POST | `@requer_login` | — | Se o `auth_id` do Supabase não existe em `usuarios`, cria com `perfil='operador'`. Retorna dados do usuário |

### Fluxo de Erro
- JWT inválido/expirado → 401 `"Token inválido ou expirado"`
- Supabase fora → erro no `signInWithPassword` tratado no frontend

---

## 2. 📝 Cadastro

**Template**: `cadastro.html` · **JS**: `cadastro.js` · **Proteção**: Nenhuma (público)

### Fluxo

```
1. GET /api/auth/config           → Retorna SUPABASE_URL + ANON_KEY
2. Supabase Auth signUp(email, senha, {nome})  → Cria usuário no Supabase Auth
3. POST /api/auth/sincronizar     → Cria registro na tabela `usuarios` com perfil='operador'
4. Redireciona para /login
```

> **Nota**: O cadastro cria o usuário no Supabase Auth **e** sincroniza com a tabela local `usuarios`. Novos usuários sempre entram como `operador` — apenas um admin pode promover.

---

## 3. 🛒 PDV (Ponto de Venda)

**Template**: `ponto_venda.html` · **JS**: `ponto_venda.js` · **Proteção**: `@requer_login`

### Inicialização

```
1. GET /api/auth/config           → Init Supabase client
2. GET /api/auth/me               → Valida sessão, obtém perfil do operador
3. GET /api/dados-iniciais        → Carrega produtos, membros e logo do sistema
4. GET /api/caixa/aberto          → Verifica se há caixa aberto para o operador
```

### Abertura de Caixa

```
POST /api/caixa/abrir
Body: { valor_abertura: 100.00 }
→ Cria registro em `caixas` com status 'aberto'
→ Retorna { id, valor_abertura, data_abertura }
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `valor_abertura` | float | Fundo de troco inicial |

### Registrar Venda

```
POST /api/vendas
Body: {
  itens: [{ id_produto, quantidade, preco_unitario }],
  tipo: "normal" | "fiado",
  id_membro: uuid | null,
  id_externo: "1718901234567_abc123",
  id_caixa: uuid
}
```

**Lógica do `venda_service.registrar_venda()`:**

1. Verifica se `id_externo` já existe → se sim, retorna `"Duplicado"` (idempotência)
2. Cria registro em `vendas` (tipo, total, operador, caixa)
3. Para cada item:
   - Cria `item_venda`
   - Desconta `estoque_bar` do produto
4. Se `tipo == 'fiado'`:
   - Cria `movimentacao_membro` (débito) vinculada à venda
   - Atualiza `saldo_devedor` do membro
5. Commit da transação

### Quitar Dívida de Membro

```
POST /api/vendas/pagamento
Body: { id_membro: uuid, valor: 50.00, id_caixa: uuid, id_externo: "..." }
```

**Lógica:**
1. Cria venda tipo `'pagamento'`
2. Cria `movimentacao_membro` (crédito)
3. Reduz `saldo_devedor` do membro

### Editar Estoque (via PDV)

```
PUT /api/produtos/estoque
Body: { id_produto: uuid, estoque_bar: 10, estoque_deposito: 50 }
```

**Lógica do `produto_service.atualizar_estoque()`:**
1. Calcula diferença entre valores novos e atuais
2. Se `auto_transferir == true` (flag do body): transfere automaticamente do depósito para o bar
3. Se não: aplica valores diretamente (admin manual)
4. Registra em `ajustes_estoque` para auditoria

### Extrato de Membro

```
GET /api/membros/extrato?id_membro=uuid
→ Lista movimentacoes_membro ordenadas por data
→ Retorna { membro, saldo_devedor, movimentacoes[] }
```

### Relatórios

```
POST /api/relatorios
Body: { tipo: "TURNO" | "DIA" | "PERIODO", data_inicio?, data_fim?, id_caixa? }
```

**Tipos:**
- **TURNO**: Vendas do caixa atual (filtra por `id_caixa`)
- **DIA**: Vendas do dia selecionado
- **PERIODO**: Vendas entre `data_inicio` e `data_fim`

**Retorna**: totais por tipo de pagamento, lista de vendas com itens, resumo de estoque

### Fechamento de Caixa

```
POST /api/caixa/fechar
Body: { id_caixa: uuid, valor_fechamento: 350.00 }
→ Atualiza `caixas` com data_fechamento e valor
→ Calcula diferença (valor_fechamento - valor_abertura - total_vendas_dinheiro)
```

### Diagrama Completo PDV

```
┌─────────┐   GET /dados-iniciais   ┌──────────────────┐
│  ABRIR  │ ◄─────────────────────── │ Carrega produtos │
│  TELA   │                          │ membros + logo   │
└────┬────┘                          └──────────────────┘
     │
     ▼
┌─────────────┐  POST /caixa/abrir   ┌────────────────┐
│ ABRIR CAIXA │ ────────────────────► │ Cria registro  │
│ (fundo R$)  │                       │ tabela caixas  │
└─────┬───────┘                       └────────────────┘
      │
      ▼
┌─────────────┐  POST /vendas         ┌──────────────────────────┐
│  REGISTRAR  │ ─────────────────────► │ vendas + itens_venda     │
│   VENDA     │                        │ - estoque_bar            │
│             │                        │ + movimentacao (se fiado)│
└─────┬───────┘                        └──────────────────────────┘
      │
      ├──► POST /vendas/pagamento  → movimentacao crédito
      ├──► PUT /produtos/estoque   → ajuste manual estoque
      ├──► GET /membros/extrato    → consulta conta membro
      ├──► POST /relatorios        → relatório turno/dia/período
      │
      ▼
┌──────────────┐  POST /caixa/fechar  ┌────────────────┐
│ FECHAR CAIXA │ ───────────────────► │ Encerra turno  │
│              │                       │ calcula diff   │
└──────────────┘                       └────────────────┘
```

---

## 4. ⚙️ Admin (Painel Administrativo)

**Template**: `admin.html` · **JS**: `admin.js` · **Proteção**: `@requer_admin`

> Todas as rotas `/api/admin/*` exigem JWT válido **E** `perfil='admin'` na tabela `usuarios`.

### Inicialização

```
1. GET /api/auth/config
2. GET /api/auth/me              → Valida JWT + verifica perfil admin
3. GET /api/admin/produtos       → Lista todos os produtos
4. GET /api/admin/membros        → Lista todos os membros
5. GET /api/admin/usuarios       → Lista todos os usuários
6. GET /api/admin/config         → Carrega configurações do sistema
```

---

### 📦 CRUD Produtos

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/admin/produtos` | Lista todos os produtos |
| POST | `/api/admin/produtos` | Cria novo produto |
| PUT | `/api/admin/produtos/<id>` | Edita produto (nome, preço, categoria, ativo) |
| DELETE | `/api/admin/produtos/<id>` | Desativa produto (soft delete: `ativo=false`) |
| POST | `/api/admin/produtos/<id>/estoque` | Ajusta estoque bar + depósito |
| POST | `/api/admin/produtos/<id>/imagem` | Upload de imagem via Supabase Storage |

**Ajuste de Estoque (Admin)**:
```
POST /api/admin/produtos/<id>/estoque
Body: { estoque_bar: 20, estoque_deposito: 100 }
```
- Define valores absolutos (não auto-transfere)
- Registra em `ajustes_estoque` com `origem='admin'`

**Upload de Imagem**:
```
POST /api/admin/produtos/<id>/imagem
Content-Type: multipart/form-data
Body: { imagem: <file> }
```
- Upload vai para Supabase Storage bucket `produtos`
- URL pública é salva no campo `imagem_url` do produto

---

### 👥 CRUD Membros

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/admin/membros` | Lista todos os membros |
| POST | `/api/admin/membros` | Cria novo membro |
| PUT | `/api/admin/membros/<id>` | Edita dados do membro |
| DELETE | `/api/admin/membros/<id>` | Desativa membro |
| GET | `/api/admin/membros/<id>/extrato` | Extrato completo com movimentações |
| POST | `/api/admin/membros/<id>/ajuste` | Ajuste manual de saldo (crédito/débito) |

**Ajuste Manual de Saldo**:
```
POST /api/admin/membros/<id>/ajuste
Body: { valor: -50.00, descricao: "Correção manual" }
```
- Cria `movimentacao_membro` com tipo `'ajuste'`
- Atualiza `saldo_devedor` do membro

---

### 👤 CRUD Usuários

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/admin/usuarios` | Lista todos os usuários |
| POST | `/api/admin/usuarios` | Cria usuário (via Supabase Admin API + tabela local) |
| PUT | `/api/admin/usuarios/<id>` | Edita perfil/nome |
| DELETE | `/api/admin/usuarios/<id>` | Desativa usuário |

**Criação de Usuário (Admin)**:
```
POST /api/admin/usuarios
Body: { email: "novo@bar.com", senha: "123456", nome: "João", perfil: "operador" }
```
1. Cria no Supabase Auth via **Service Role Key** (admin API)
2. Cria registro na tabela `usuarios` com `auth_id` vinculado
3. Permite definir `perfil='admin'` ou `perfil='operador'`

---

### 📊 Consulta de Vendas

```
GET /api/admin/vendas?data_inicio=2024-01-01&data_fim=2024-12-31&tipo=fiado&id_membro=uuid
```
- Filtros opcionais: data, tipo, membro, operador
- Retorna vendas com itens e movimentações vinculadas
- Paginação via `page` e `per_page`

---

### ⚙️ Configurações do Sistema

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/admin/config` | Retorna configurações atuais |
| PUT | `/api/admin/config` | Atualiza configurações |

**Campos configuráveis**:
- `logo_url` — URL da logo (Supabase Storage)
- `nome_estabelecimento` — Nome exibido no PDV
- `impressao_automatica` — bool
- `largura_papel` — mm (80, 58, etc.)

---

## 🔒 Middleware de Autenticação

Definido em `backend/app/auth_middleware.py`:

### `@requer_login`

```python
# Fluxo:
1. Extrai token do header Authorization: Bearer <jwt>
2. Chama supabase.auth.get_user(token)
3. Se válido → injeta g.usuario_auth (dados Supabase) e g.usuario (dados do banco)
4. Se inválido → 401 "Token inválido ou expirado"
```

### `@requer_admin`

```python
# Fluxo (herda @requer_login):
1. Executa tudo de @requer_login
2. Busca usuario na tabela `usuarios` pelo auth_id
3. Verifica se perfil == 'admin'
4. Se não → 403 "Acesso restrito a administradores"
```

---

## 🔄 Fluxo de Dados — Venda Completa (Fiado)

```
Frontend                          Backend                         Banco
────────                          ───────                         ─────
POST /api/vendas ──────────────►  venda_service.registrar()
  { itens, tipo:'fiado',                │
    id_membro, id_externo }             ├── Check id_externo ────► SELECT vendas
                                        │   (idempotência)
                                        │
                                        ├── INSERT venda ────────► vendas
                                        │
                                        ├── INSERT itens ────────► itens_venda
                                        │
                                        ├── UPDATE estoque ──────► produtos
                                        │   (estoque_bar -= qtd)
                                        │
                                        ├── INSERT movimentação ─► movimentacoes_membro
                                        │   (tipo='debito')
                                        │
                                        └── UPDATE saldo ────────► membros
                                            (saldo_devedor += total)
                                        │
                                        └── COMMIT (transação única)
◄───────────────────────────────  { status: 'ok', id_venda }
```

---

## 📝 Observações

- **Idempotência**: Toda venda tem `id_externo` gerado pelo frontend. Se reenviada, retorna `"Duplicado"` sem duplicar no banco.
- **Offline-first**: O PDV mantém uma fila local de vendas. Se a API falhar, a venda fica na fila e é reenviada automaticamente.
- **Transações**: Toda operação de venda (itens + estoque + movimentação) roda numa transação única — ou tudo commita ou tudo faz rollback.
- **Soft delete**: Produtos e membros não são deletados fisicamente — o campo `ativo` é setado para `false`.
- **Auditoria**: Toda alteração de estoque é registrada em `ajustes_estoque` com operador, origem e valores antes/depois.
