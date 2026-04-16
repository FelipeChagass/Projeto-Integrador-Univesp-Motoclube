# 🏍️ Bar Moto Clube — Sistema PDV

Sistema de Ponto de Venda (PDV) e Painel Administrativo para bar de moto clube.  
Stack: **Python Flask + PostgreSQL (Supabase) + Vanilla JS + Bootstrap 5**.

---

## 📐 Arquitetura

```
┌──────────────────────────────────────────────────────────┐
│  FRONTEND (Vanilla JS + Bootstrap 5 + HTML/CSS)          │
│  4 telas: Login, Cadastro, PDV, Admin                    │
│  Supabase Auth (JWT) no client-side                      │
│  Comunicação via fetch() → REST API                      │
└────────────────────┬─────────────────────────────────────┘
                     │ HTTP / JSON + Bearer Token
┌────────────────────▼─────────────────────────────────────┐
│  BACKEND (Python Flask)                                  │
│  backend/app/                                            │
│  ├── routes/         → Blueprints (endpoints REST)       │
│  ├── services/       → Lógica de negócio                 │
│  ├── models/         → ORM (SQLAlchemy)                  │
│  ├── auth_middleware  → Decorators JWT (@requer_login,    │
│  │                      @requer_admin)                   │
│  └── __init__.py     → App Factory (create_app)          │
└────────────────────┬─────────────────────────────────────┘
                     │ SQLAlchemy ORM
┌────────────────────▼─────────────────────────────────────┐
│  BANCO DE DADOS (PostgreSQL via Supabase)                │
│  9 tabelas normalizadas com UUIDs                        │
│  Supabase Auth para autenticação                         │
│  Supabase Storage para imagens de produtos               │
└──────────────────────────────────────────────────────────┘
```

---

## 🖥️ Telas do Sistema

| Tela          | Rota       | Template             | CSS                  | JS                  | Acesso         |
|---------------|------------|----------------------|----------------------|---------------------|----------------|
| **Login**     | `/login`   | `login.html`         | `login.css`          | `login.js`          | Público        |
| **Cadastro**  | `/cadastro`| `cadastro.html`      | `cadastro.css`       | `cadastro.js`       | Público        |
| **PDV**       | `/`        | `ponto_venda.html`   | `ponto_venda.css`    | `ponto_venda.js`    | `@requer_login`|
| **Admin**     | `/admin`   | `admin.html`         | `admin.css`          | `admin.js`          | `@requer_admin`|

Todas as telas carregam `api.js` (client Supabase + wrapper HTTP). PDV também carrega `common.css`.

---

## 🗄️ Banco de Dados

9 tabelas PostgreSQL — schema completo em `estrutura_novo_banco.txt`:

| Tabela                   | Descrição                                      |
|--------------------------|-------------------------------------------------|
| `usuarios`               | Operadores e admins (sync com Supabase Auth)   |
| `membros`                | Membros do moto clube (conta fiado)            |
| `produtos`               | Catálogo com estoque bar + depósito            |
| `caixas`                 | Abertura/fechamento de caixa                   |
| `vendas`                 | Registro de vendas e recebimentos              |
| `itens_venda`            | Itens individuais de cada venda                |
| `movimentacoes_membro`   | Débitos/créditos na conta de membros           |
| `ajustes_estoque`        | Auditoria de alterações de estoque             |
| `configuracoes_sistema`  | Logo, impressão, largura papel                 |

---

## 🔐 Autenticação

O sistema usa **Supabase Auth** com fluxo JWT:

1. **Frontend** — `api.js` inicializa o client Supabase via `/api/auth/config`
2. **Login/Cadastro** — Supabase Auth SDK (email + senha)
3. **Toda request API** — envia `Authorization: Bearer <jwt>` no header
4. **Backend** — decorators `@requer_login` e `@requer_admin` validam o JWT via Supabase `get_user()`
5. **Admin** — além do JWT válido, verifica `perfil = 'admin'` na tabela `usuarios`

---

## ⚡ Como Rodar

### 1. Pré-requisitos

- **Python 3.10+**
- Conta no **Supabase** com projeto criado
- Banco PostgreSQL com as tabelas criadas (SQL em `estrutura_novo_banco.txt`)

### 2. Configurar `.env`

```env
SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_ANON_KEY=sua_anon_key
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
DATABASE_URL=postgresql://postgres.SEU_PROJETO:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
SECRET_KEY=chave-secreta-flask
FLASK_DEBUG=true
```

### 3. Instalar dependências

```bash
pip install -r requirements.txt
```

### 4. Criar as tabelas no Supabase

Acesse o **SQL Editor** do Supabase e execute o conteúdo de `estrutura_novo_banco.txt`.

### 5. Rodar o servidor

```bash
python wsgi.py
```

O servidor inicia em `http://localhost:5000`.

### 6. Em Produção (Gunicorn)

```bash
gunicorn wsgi:application --bind 0.0.0.0:5000 --workers 4
```

---

## � Estrutura do Projeto

```
pi univesp/
├── .env                              # Variáveis de ambiente
├── wsgi.py                           # Entry point (Gunicorn / dev)
├── Procfile                          # Deploy (Heroku/Render)
├── requirements.txt                  # Dependências Python
├── README.md                         # Este arquivo
├── BACKEND_FLOWS.md                  # Documentação dos fluxos backend por tela
├── estrutura_novo_banco.txt          # SQL para criar tabelas
│
├── templates/
│   ├── login.html
│   ├── cadastro.html
│   ├── ponto_venda.html
│   └── admin.html
│
├── static/
│   ├── css/
│   │   ├── common.css                # Variáveis, toast, modais, print
│   │   ├── login.css
│   │   ├── cadastro.css
│   │   ├── ponto_venda.css
│   │   └── admin.css
│   ├── js/
│   │   ├── api.js                    # UIModal + API wrapper + Supabase client
│   │   ├── login.js
│   │   ├── cadastro.js
│   │   ├── ponto_venda.js
│   │   └── admin.js
│   └── img/
│       └── motorhead.png
│
└── backend/
    ├── run.py
    └── app/
        ├── __init__.py               # App factory
        ├── config.py                 # Lê .env
        ├── database.py               # Engine SQLAlchemy
        ├── auth_middleware.py         # @requer_login, @requer_admin
        ├── models/                   # ORM (8 models)
        ├── services/                 # Lógica de negócio (6 services)
        └── routes/                   # Blueprints REST (8 blueprints)
```

---

## 🏗️ Decisões Arquiteturais

| Decisão | Justificativa |
|---------|---------------|
| **Flask** (não Django/FastAPI) | Simplicidade didática |
| **SQLAlchemy ORM** | Proteção contra SQL injection, portabilidade |
| **Supabase Auth** (JWT) | Stateless, sem sessões server-side |
| **Fila de vendas local** | Offline-first — UX instantâneo, sincroniza depois |
| **Bootstrap 5 + CSS custom** | Grid/utilidades + identidade visual |
| **Tabela `caixas` separada** | Semântica própria, sem misturar com vendas |
| **`id_externo` nas vendas** | Idempotência para offline-first |

---

## 🎨 Design System

- **Tema**: Dark premium (`#0d0d0d` / `#0f0f17`) + vermelho `#b30000`
- **Fonts**: Inter 

---

## 👥 Autores

Projeto Integrador — UNIVESP

## 📄 Licença

Uso educacional — Projeto Integrador UNIVESP.
