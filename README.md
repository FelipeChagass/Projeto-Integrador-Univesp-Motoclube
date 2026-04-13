# 🏍️ Bar Moto Clube — Sistema PDV

Sistema de Ponto de Venda (PDV) para bar de moto clube, refatorado de **Google Apps Script + Google Sheets** para **Python Flask + PostgreSQL (Supabase)**.

---

## 📐 Arquitetura

```
┌──────────────────────────────────────────────────┐
│  FRONTEND (Vanilla JS + HTML/CSS)                │
│  templates/index.html + static/js/api.js         │
│  Comunica via fetch() → REST API                 │
└────────────────────┬─────────────────────────────┘
                     │ HTTP / JSON
┌────────────────────▼─────────────────────────────┐
│  BACKEND (Python Flask)                          │
│  backend/app/                                     │
│  ├── routes/    → Blueprints (endpoints REST)    │
│  ├── services/  → Lógica de negócio              │
│  ├── models/    → ORM (SQLAlchemy)               │
│  ├── auth.py    → Middleware JWT (Supabase Auth)  │
│  └── main.py    → App Factory                    │
└────────────────────┬─────────────────────────────┘
                     │ SQLAlchemy
┌────────────────────▼─────────────────────────────┐
│  BANCO DE DADOS (PostgreSQL via Supabase)        │
│  9 tabelas normalizadas com UUIDs                │
│  Transações ACID para vendas e estoque           │
└──────────────────────────────────────────────────┘
```

### Separação de Responsabilidades

| Camada       | Pasta               | Função                                                      |
|-------------|----------------------|-------------------------------------------------------------|
| **Rotas**    | `backend/app/routes/` | Recebe HTTP, valida entrada, chama services, retorna JSON  |
| **Serviços** | `backend/app/services/` | Toda lógica de negócio, transações, validações de domínio  |
| **Modelos**  | `backend/app/models/` | Mapeamento ORM das tabelas do banco                        |
| **Auth**     | `backend/app/auth.py` | Decorators para proteger rotas via JWT do Supabase         |
| **Frontend** | `static/js/api.js`   | Camada de abstração que substitui `google.script.run`       |

---

## 🗄️ Banco de Dados

As **9 tabelas** seguem o schema definido em `estrutura_novo_banco.txt`:

| Tabela                   | Descrição                                      |
|-------------------------|-------------------------------------------------|
| `usuarios`              | Operadores do sistema                           |
| `membros`               | Membros do moto clube (conta fiado)             |
| `produtos`              | Catálogo com estoque bar/depósito               |
| `caixas`                | Abertura/fechamento de caixa                    |
| `vendas`                | Registro de cada venda ou recebimento           |
| `itens_venda`           | Itens individuais de cada venda                 |
| `movimentacoes_membro`  | Débitos/créditos na conta de membro             |
| `ajustes_estoque`       | Auditoria de alterações de estoque              |
| `configuracoes_sistema` | Logo, impressão, largura papel                  |

---

## ⚡ Como Rodar

### 1. Pré-requisitos

- **Python 3.10+**
- Conta no **Supabase** com projeto criado
- Banco PostgreSQL com as tabelas já criadas (use o SQL de `estrutura_novo_banco.txt`)

### 2. Configurar `.env`

Na raiz do projeto, crie/edite o arquivo `.env`:

```env
SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_ANON_KEY=sua_anon_key_aqui
DATABASE_URL=postgresql://postgres.SEU_PROJETO:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
SECRET_KEY=chave-secreta-flask
FLASK_DEBUG=true
```

### 3. Instalar dependências

```bash
cd backend
pip install -r requirements.txt
```

### 4. Criar as tabelas no Supabase

Acesse o **SQL Editor** do Supabase e execute o conteúdo de `estrutura_novo_banco.txt`.

### 5. Rodar o servidor

```bash
cd backend
python run.py
```

O servidor inicia em `http://localhost:5000`. Acesse no navegador para usar o PDV.

### 6. Em Produção (Gunicorn)

```bash
cd backend
gunicorn "app.main:create_app()" --bind 0.0.0.0:5000 --workers 4
```

---

## 🔌 Endpoints da API

### Dados Iniciais
| Método | Rota                  | Descrição                      |
|--------|-----------------------|--------------------------------|
| GET    | `/api/dados-iniciais` | Produtos, membros e logo       |
| GET    | `/api/health`         | Health check                   |

### Produtos
| Método | Rota                    | Descrição                      |
|--------|-------------------------|--------------------------------|
| GET    | `/api/produtos`         | Lista produtos (JSON objetos)  |
| GET    | `/api/produtos/array`   | Lista produtos (formato array) |
| PUT    | `/api/produtos/estoque` | Atualizar estoque de produto   |

### Membros
| Método | Rota                     | Descrição                     |
|--------|--------------------------|-------------------------------|
| GET    | `/api/membros`           | Lista membros (JSON objetos)  |
| GET    | `/api/membros/array`     | Lista membros (formato array) |
| GET    | `/api/membros/extrato`   | Extrato de dívida de membro   |

### Vendas
| Método | Rota                     | Descrição                     |
|--------|--------------------------|-------------------------------|
| POST   | `/api/vendas`            | Registrar nova venda          |
| POST   | `/api/vendas/pagamento`  | Quitar dívida de membro       |

### Caixa
| Método | Rota                   | Descrição                     |
|--------|------------------------|-------------------------------|
| POST   | `/api/caixa/abrir`     | Abrir caixa com fundo         |
| POST   | `/api/caixa/fechar`    | Fechar caixa                  |
| GET    | `/api/caixa/aberto`    | Verificar caixa aberto        |

### Relatórios
| Método | Rota              | Descrição                         |
|--------|-------------------|-----------------------------------|
| POST   | `/api/relatorios`  | Gerar relatório (DIA/PERIODO)     |

---

## 🏗️ Decisões Arquiteturais

### 1. Por que Flask e não Django/FastAPI?
- **Simplicidade didática**: Flask é explícito e fácil de entender para iniciantes
- **Flexibilidade**: Sem "magia" — cada componente é visível e controlável
- **Compatibilidade**: A aplicação não precisa de async (FastAPI) nem de admin (Django)

### 2. Por que SQLAlchemy ORM em vez de SQL puro?
- **Segurança**: Proteção automática contra SQL injection
- **Portabilidade**: Trocar de PostgreSQL para outro banco sem reescrever queries
- **Manutenibilidade**: Modelos Python são mais legíveis que strings SQL

### 3. Por que manter o frontend quase idêntico?
- **Zero risco de regressão** visual ou funcional
- **api.js** funciona como uma "ponte": o frontend chama `API.processarVenda()` da mesma forma que chamava `google.script.run...processarVenda()`
- Facilita a migração incremental

### 4. Por que a fila de vendas local (otimista)?
- **Resiliência offline**: O sistema registra a venda localmente e sincroniza depois
- **UX instantâneo**: O operador não espera a resposta do servidor para atender o próximo cliente
- Padrão **"offline-first"** herdado da versão original

### 5. Por que caixa é tabela separada (não uma venda)?
- Na versão Apps Script, a abertura era registrada como "venda ABERTURA"
- Agora, `caixas` tem semântica própria: abertura/fechamento, valor, operador
- Permite consultas diretas sem filtrar vendas especiais

### 6. Por que `id_externo` na tabela de vendas?
- Evita vendas duplicadas: o frontend gera um ID único (timestamp + random)
- Se a fila reenviar a mesma venda, o backend rejeita com status `Duplicado`
- **Idempotência** para o padrão offline-first

---

## 🚀 Pontos de Evolução Futura

1. **Autenticação completa com Supabase Auth**
   - Os decorators `@requer_autenticacao` já estão prontos
   - Basta ativar a autenticação no frontend (tela de login com e-mail/senha)

2. **CRUD completo de produtos e membros**
   - Atualmente o sistema só edita estoque
   - Adicionar rotas para criar/editar/excluir produtos e membros

3. **Dashboard administrativo**
   - Tela separada com gráficos de vendas, estoque, movimentações
   - Pode usar Chart.js ou similar

4. **Sistema de permissões por perfil**
   - O campo `perfil` já existe na tabela `usuarios` (admin/operador)
   - Implementar middleware que restrinja rotas por perfil

5. **Notificações de estoque baixo**
   - Enviar alerta por e-mail ou WhatsApp quando `estoque_bar < minimo_bar`

6. **PWA (Progressive Web App)**
   - Adicionar `manifest.json` e service worker para instalação no celular
   - Já funciona offline parcialmente com a fila local

7. **Integração com impressora térmica real**
   - Substituir `window.print()` por conexão direta via WebSocket/USB

8. **Testes automatizados**
   - Adicionar `pytest` com testes para cada service
   - Testar transações de venda, estoque e membros

---

## 📁 Estrutura Final do Projeto

```
pi univesp/
├── .env                          # Variáveis de ambiente
├── README.md                     # Este arquivo
├── estrutura_novo_banco.txt      # SQL para criar tabelas
├── templates/
│   └── index.html                # Frontend (refatorado para usar API)
├── static/
│   ├── css/
│   │   └── style.css             # Estilos (sem alteração)
│   └── js/
│       └── api.js                # Camada de comunicação com backend
└── backend/
    ├── requirements.txt          # Dependências Python
    ├── run.py                    # Script para iniciar o servidor
    └── app/
        ├── __init__.py
        ├── config.py             # Configurações (lê .env)
        ├── database.py           # Engine SQLAlchemy + sessão
        ├── auth.py               # Middleware JWT (Supabase Auth)
        ├── main.py               # App factory Flask
        ├── models/
        │   ├── __init__.py
        │   ├── usuario.py
        │   ├── membro.py
        │   ├── produto.py
        │   ├── caixa.py
        │   ├── venda.py
        │   ├── movimentacao_membro.py
        │   ├── ajuste_estoque.py
        │   └── configuracao.py
        ├── services/
        │   ├── __init__.py
        │   ├── venda_service.py
        │   ├── caixa_service.py
        │   ├── produto_service.py
        │   ├── membro_service.py
        │   └── relatorio_service.py
        └── routes/
            ├── __init__.py
            ├── produtos.py
            ├── membros.py
            ├── vendas.py
            ├── caixa.py
            ├── relatorios.py
            ├── dados_iniciais.py
            └── auth_routes.py
```

---

## 👥 Autores

Projeto Integrador — UNIVESP

---

## 📄 Licença

Uso educacional — Projeto Integrador UNIVESP.
