import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))

from app import create_app
from app.database import SessionLocal
from app.models.usuario import Usuario
from app.models.caixa import Caixa
from app.models.venda import Venda
from app.models.produto import Produto
from app.services import caixa_service, venda_service, relatorio_service
from app.schemas.venda_schemas import VendaNormalPayload, ItemPayload

app = create_app()

def run_test():
    with app.app_context():
        db = SessionLocal()
        try:
            print("1. Buscando usuario admin...")
            admin = db.query(Usuario).filter_by(email="admin@gmail.com").first()
            if not admin:
                print("Admin não encontrado.")
                return
            admin_id = str(admin.id)
            print(f"Admin ID: {admin_id}")

            print("\n2. Fechando caixas abertos antigos...")
            caixas_abertos = db.query(Caixa).filter_by(status='aberto').all()
            for c in caixas_abertos:
                c.status = 'fechado'
            db.commit()

            print("\n3. Abrindo novo caixa...")
            res_abrir = caixa_service.abrir_caixa(db, {'usuario_id': admin_id, 'valor_abertura': 0.5})
            print("Abrir caixa:", res_abrir)
            caixa_id = res_abrir['caixa_id']

            print("\n4. Buscando um produto para vender...")
            produto = db.query(Produto).first()
            if not produto:
                print("Nenhum produto cadastrado.")
                return
            print(f"Produto: {produto.nome} (ID: {produto.id}) - Preço: {produto.preco_atual}")
            # Ensure stock is available to avoid failure
            produto.estoque_bar = 100
            db.commit()

            print("\n5. Realizando vendas...")
            venda1 = VendaNormalPayload(
                usuario_id=admin_id,
                caixa_id=caixa_id,
                metodo="DINHEIRO",
                cliente="CLIENTE 1",
                itens=[ItemPayload(id=produto.id, qtd=1)]
            )
            res_venda1 = venda_service.processar_venda(db, venda1)
            print("Venda 1:", res_venda1)

            venda2 = VendaNormalPayload(
                usuario_id=admin_id,
                caixa_id=caixa_id,
                metodo="DINHEIRO",
                cliente="CLIENTE 2",
                itens=[ItemPayload(id=produto.id, qtd=1)]
            )
            res_venda2 = venda_service.processar_venda(db, venda2)
            print("Venda 2:", res_venda2)

            print("\n6. Gerando relatório de caixa (TURNO)...")
            filtro = {
                'operador_id': admin_id,
                'caixa_id': caixa_id,
                # frontend enviaria inicio=...
                'inicio': '2026-05-19T00:00:00'
            }
            relatorio = relatorio_service.gerar_relatorio(db, 'TURNO', filtro)
            print("\n=== RESUMO DO RELATORIO ===")
            print(f"Abertura: {relatorio['abertura']}")
            print(f"Total Entradas: {relatorio['totalEntradas']}")
            print(f"Vendas em Dinheiro: {relatorio['dinheiro']}")
            print(f"Historico: {len(relatorio['historico'])} itens")
            for h in relatorio['historico']:
                print(f"  - {h}")

            print("\n7. Verificando DB diretamente...")
            vendas_db = db.query(Venda).filter_by(caixa_id=caixa_id).all()
            print(f"Vendas reais no banco para este caixa: {len(vendas_db)}")
            for v in vendas_db:
                print(f"  - Venda {v.id} | Total: {v.valor_total}")

        finally:
            db.close()

if __name__ == "__main__":
    run_test()
