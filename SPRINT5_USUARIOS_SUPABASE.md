# Sprint 5 - Diagnostico de usuarios e Supabase Auth

## Estado real do projeto

- Tabela local de usuarios: `public.usuarios`
- Coluna que referencia o usuario do Supabase Auth: `id`
- Coluna equivalente a `auth_user_id`: nao existe coluna separada
- Vinculo atual com `auth.users`: `public.usuarios.id` ja referencia `auth.users(id)`
- Colunas reais relevantes na tabela local: `id`, `nome`, `email`, `perfil`, `ativo`, `criado_em`, `atualizado_em`

## Onde o sistema cria, edita e exclui usuarios

- Criacao: `POST /api/admin/usuarios` em `backend/app/routes/admin.py`
- Implementacao de criacao: `criar_usuario_admin()` em `backend/app/services/usuario_service.py`
- Edicao: `PUT /api/admin/usuarios/<user_id>` em `backend/app/routes/admin.py`
- Implementacao de edicao: `editar_usuario()` em `backend/app/services/usuario_service.py`
- Exclusao: antes desta sprint, nao havia endpoint administrativo dedicado de exclusao
- Exclusao apos esta sprint: `DELETE /api/admin/usuarios/<user_id>` em `backend/app/routes/admin.py`
- Desativacao/Reativacao operacional: continua via `PUT /api/admin/usuarios/<user_id>` alterando `ativo`

## Comportamento antes da sprint

- Criacao administrativa ja usava Admin API do Supabase Auth
- Edicao administrativa alterava apenas a tabela local
- Desativacao administrativa alterava apenas a tabela local
- Nao existia fluxo de exclusao administrativa no backend
- O login dependia da tabela local para montar o perfil em `/api/auth/me`, mas um usuario inativo ainda podia manter operacao com token valido porque o middleware nao barrava `ativo = false`

## Comportamento apos a sprint

- Criacao administrativa cria no Supabase Auth e cria a linha correspondente em `public.usuarios`
- Edicao administrativa sincroniza email, senha, metadata de nome e banimento no Supabase Auth
- Edicao administrativa sincroniza nome, email, perfil e ativo na tabela local
- Desativacao operacional aplica banimento no Supabase Auth e marca `ativo = false` localmente
- Reativacao operacional remove o banimento no Supabase Auth e marca `ativo = true` localmente
- Exclusao administrativa faz soft delete no Supabase Auth e mantem o registro local inativo para preservar historico
- O middleware agora bloqueia qualquer usuario local inativo mesmo que ainda exista token valido

## Frontend admin impactado

- A grade de usuarios em `templates/admin.html` e `static/js/admin.js` agora permite editar:
  - nome
  - email
  - perfil
  - senha opcional
- Usuarios inativos podem ser reativados ou excluidos de forma definitiva no Auth

## Variaveis de ambiente sensiveis

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

A `SUPABASE_SERVICE_ROLE_KEY` deve existir apenas no backend e nao deve ser exposta no frontend, templates, localStorage, sessionStorage ou respostas HTTP.

## Validacao manual sugerida

1. Criar usuario pelo painel admin.
2. Confirmar o usuario em Authentication > Users no Supabase.
3. Confirmar a linha correspondente em `public.usuarios` com o mesmo UUID no campo `id`.
4. Editar email e confirmar reflexo em Auth e na tabela local.
5. Editar senha e confirmar que a tabela local nao recebe senha.
6. Desativar usuario e confirmar bloqueio de operacao e banimento no Auth.
7. Reativar usuario e confirmar retorno de acesso.
8. Excluir usuario inativo e confirmar soft delete no Auth, mantendo o registro local inativo.
