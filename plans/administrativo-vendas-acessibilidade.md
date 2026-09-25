# Administrativo, vendas e acessibilidade — 25/09/2026

## Comportamento

- Produtos, membros e usuários têm Editar, Salvar, Cancelar e Excluir. Cadastros históricos inativos continuam visíveis pelo filtro e podem ser reativados ou excluídos.
- Vendas têm edição de quantidades, preços unitários, observações, cliente e método compatível com o tipo original. Quantidade zero remove um item; para remover todos, use Excluir.
- A redução de duas unidades para uma devolve uma unidade ao estoque do bar. O aumento consome a diferença, condicionado ao estoque disponível. Preços dos demais itens permanecem os registrados na venda.
- Editar/excluir fiado ou recebimento altera a movimentação correspondente e a dívida na mesma transação. O extrato abre a venda vinculada; ajustes manuais têm editor próprio.
- Saldo negativo é recusado, com rollback integral. Para excluir uma venda fiada já paga, primeiro corrija/exclua o recebimento correspondente.
- Totais dos relatórios são calculados sobre as vendas atuais. Fechamentos automáticos passam a ser identificados e recalculados; valores contados manualmente e fechamentos históricos sem essa identificação são preservados.
- A exclusão é definitiva. Uma chave técnica sem conteúdo da venda impede que uma fila offline antiga recrie a operação excluída. Reenvios de vendas editadas recebem conflito para reconciliação.
- Exclusão de cadastros com dependências é recusada com orientação, sem apagar outras vendas por cascata. Usuários vinculados a caixas/registros operacionais e a própria conta administrativa não podem ser excluídos. A exclusão de perfil/Auth considera a FK entre os serviços e tenta restaurar o perfil se o Auth falhar; uma falha parcial exige reconciliação conforme a mensagem e o log.
- CSV usa o período/tipo selecionado, iniciando no mês atual, percorre todas as páginas e só baixa após a conclusão. UTF-8 com BOM, separador ponto e vírgula, valores com vírgula decimal, escape de aspas/quebras e proteção contra fórmulas.
- PDV inicia em Bebidas e oferece Comidas, Outros e Todos. A barra permanece visível na rolagem; mudar categoria preserva o carrinho.
- Configurações do administrativo e PDV têm A−/A+, de 100% a 150%. Preferência local ao navegador, compartilhada entre as telas. Unidades rem e os poucos tamanhos fixos dos formulários acompanham a escala.

## Estrutura

`vendas/admin_service.py` concentra validação e recálculos financeiros. Versões dos registros impedem sobrescrita concorrente. Locks mantêm a ordem chave externa → caixa → venda → membro → produtos ordenados.

`admin/financeiro.js` concentra o editor financeiro, `edicao-linha.js` o estado dos cadastros, `csv.js` a serialização e `shared/acessibilidade.js` a preferência de leitura. Templates seguem as parciais existentes; Bootstrap permanece como framework.

## Atualização do banco

Aplicar `alembic upgrade head` no processo habitual de atualização, após backup. A revisão `0003_edicao_admin` acrescenta versões, marcador de fechamento calculado e tabela de chaves excluídas. Não foi aplicada ao banco operacional nesta implementação. A reversão automática é bloqueada para não perder a proteção de reenvio offline.

## Verificação

Testes PostgreSQL em cluster temporário isolado: edição/exclusão, estoque, dívidas, caixa, concorrência, rollback, reenvio offline, permissões, versões, dependências e compensação do Auth. Testes JavaScript cobrem edição/cancelamento, CSV completo e sem download parcial, filtro e acessibilidade.

Resultado final: 80 testes Python e 164 testes JavaScript aprovados, além de `git diff --check`. As dependências originais foram restauradas com `npm ci`; o Playwright foi usado temporariamente e não foi adicionado ao projeto. Servidores de teste encerrados após a validação.

Edge headless com APIs sintéticas, Bootstrap 5.3.3 local e viewports de 360/1440px: editar/cancelar, salvar quantidade, baixar CSV, fonte a 150%, persistência entre páginas, ausência de overflow horizontal e filtro fixo. Serviços externos de autenticação não foram acessados. Fingerprints HTML/CSS atualizados após essa revisão; capturas em `.test-logs` são artefatos locais ignorados pelo Git.
