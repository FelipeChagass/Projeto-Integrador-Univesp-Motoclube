# Decisões de integridade e organização

Data: 19/09/2026. Escopo: monólito Flask/SQLAlchemy/PostgreSQL, sem mudança de produção.

## 1. Fila local e confirmações

IndexedDB é a única origem das operações pendentes. `localStorage` contém apenas estado não autoritativo da UI e não é importado como fila. A persistência precede limpeza do carrinho/impressão. Cada operação conserva `id_externo`, usuário, caixa e payload entre tentativas.

ACK exige `status=ok|duplicado`, `id_externo`, `venda_id`, `usuario_id`, `caixa_id` e total válido. O registro vira recibo confirmado, sem exclusão física. Erros ficam visíveis e exportáveis. Backoff se aplica somente a falhas transitórias; autenticação, conflitos e validação exigem intervenção explícita. Outro operador não envia operações cuja origem não lhe pertence.

Não há adaptador para filas de versões anteriores em `localStorage`; operações atuais sem `id_externo`, usuário ou caixa são recusadas antes da persistência. O servidor compara também um hash de conteúdo, evitando confirmar outro payload que reutilize a mesma chave. Hashes históricos desconhecidos não são fabricados.

Limites: IndexedDB não é backup externo. Limpeza de dados do navegador, perda física do dispositivo e políticas de eviction permanecem riscos. Testes usam fake-indexeddb; homologação em navegadores reais, múltiplas abas e impressora permanece necessária. Os preços são recalculados no servidor; operação offline com mudança de preço exige conferência operacional.

## 2. Auth e permissões

Token válido identifica a pessoa, mas não concede acesso ao PDV sem perfil local ativo. `/auth/me` e `/auth/sincronizar` aceitam identidade autenticada sem exigir perfil existente. Criação própria produz somente operador inativo; admin ativa pela administração.

Permissões são centralizadas em `features/auth/middleware.py`. Operadores vendem e consultam seu caixa; admins ajustam estoque/saldo e administram usuários. Admin pode fechar caixa de outro operador explicitamente, mas não registrar venda em nome dele. Cada requisição consulta o estado ativo do perfil. Cache da identidade externa é limitado a 1024 entradas/120 segundos e respeita expiração do token, com chave por digest; revogação no provedor pode levar até esse TTL.

Operações que combinam Supabase Auth e banco não têm transação distribuída. A administração de usuários executa compensações explícitas, mas falhas parciais ainda precisam de reconciliação. Não confundir esse comportamento com a atomicidade garantida para vendas no PostgreSQL.

## 3. Transação financeira e caixa

Ordem de locks: chave externa PostgreSQL → caixa → membro → produtos em ID crescente. Abertura bloqueia o usuário, que existe antes do primeiro caixa. Índice único parcial protege contra inserts fora do serviço. Venda e fechamento bloqueiam a mesma linha de caixa. A unidade externa controla commit/rollback; serviços financeiros são componíveis sem commit antecipado.

Quitação informa saldo esperado: concorrência com outro pagamento/venda resulta em conflito, não quitação duplicada. Débitos, créditos, itens, venda e estoque permanecem na mesma transação. O frontend só abre/fecha caixa após ACK, bloqueia fechamento com pendências conhecidas e não faz logout após erro.

`totalEntradas = dinheiro + pix + cartao`. Recebimentos integram seus métodos e são informados separadamente, sem segunda soma. Fundo de abertura compõe `totalGeral`; dinheiro físico no fechamento automático soma apenas fundo + recebimentos em dinheiro.

## 4. Organização por funcionalidades

Backend: `features/<dominio>` agrega rotas, serviço e schemas. `core/` guarda configuração, sessão/UoW, erros e tipos compartilhados. `models/` preserva o mapeamento relacional centralizado. Produtos/estoque ficam juntos; não há abstração de repositório genérico nem microsserviços.

Frontend: `features/pdv`, `features/auth`, `features/admin`; `shared` contém API HTTP, utilitários e gestos. Templates continuam agrupados por finalidade em `templates/`, sem gerar camadas vazias. Arquivos de configuração das ferramentas permanecem na raiz por convenção. URLs REST são preservadas; imports Python e caminhos estáticos foram atualizados.

Complemento de 20/09/2026: ações do PDV foram subdivididas em `actions/`, mantendo `actions.js` como fachada; admin separa composição, eventos, navegação e recursos. Templates usam parciais Jinja em `admin/` e `pdv/`; CSS usa manifestos ordenados e componentes por feature/camada. A divisão preserva contratos financeiros e seletores. Cada arquivo extraído documenta sua responsabilidade e dependências; detalhes e limites em [refatoracao-modulos.md](refatoracao-modulos.md).
