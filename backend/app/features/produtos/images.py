"""Validate and re-encode images before sending them to the configured storage bucket."""
from io import BytesIO
import logging
import warnings
from uuid import uuid4

from flask import current_app
from PIL import Image, ImageOps, UnidentifiedImageError
from app.core.errors import ApiError
from app.features.auth.admin_client import get_supabase_admin_client

MAX_BYTES = 4 * 1024 * 1024
# O card do PDV mostra a foto com ~150 px; 1024 cobre telas de alta densidade sem pesar.
LADO_MAXIMO = 1024
QUALIDADE_WEBP = 82

logger = logging.getLogger(__name__)


def validar_imagem(arquivo):
    data = arquivo.read(MAX_BYTES + 1)
    if not data or len(data) > MAX_BYTES:
        raise ApiError('IMAGEM_TAMANHO', 'Envie uma imagem de até 4 MB.', 422)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as img:
                if img.format not in ('PNG', 'JPEG', 'WEBP', 'GIF') or max(img.size) > 4096:
                    raise ApiError('IMAGEM_FORMATO', 'Use PNG, JPEG, WebP ou GIF de até 4096 pixels por lado.', 422)
                img.verify()
            with Image.open(BytesIO(data)) as img:
                # Aplica a rotação EXIF antes de descartar os metadados na recodificação.
                imagem = ImageOps.exif_transpose(img).convert('RGBA')
                imagem.thumbnail((LADO_MAXIMO, LADO_MAXIMO), Image.Resampling.LANCZOS)
                result = BytesIO()
                imagem.save(result, format='WEBP', quality=QUALIDADE_WEBP, method=6)
                if result.tell() > MAX_BYTES:
                    raise ApiError('IMAGEM_TAMANHO', 'Imagem processada excede 4 MB.', 422)
                return result.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ApiError('IMAGEM_INVALIDA', 'Conteúdo de imagem inválido.', 422) from None


def enviar_imagem(client, bucket, produto_id, conteudo):
    # Immutable object: failed DB updates cannot overwrite the existing product image.
    path = f'produtos/{produto_id}/{uuid4().hex}.webp'
    try:
        storage = client.storage.from_(bucket)
        storage.upload(path, conteudo, {'content-type': 'image/webp', 'upsert': 'false'})
        return storage.get_public_url(path)
    except Exception:
        raise ApiError('STORAGE_INDISPONIVEL', 'Não foi possível salvar a imagem. Tente novamente.', 503) from None


def caminho_no_bucket(url, bucket, produto_id):
    """Caminho do objeto a partir da URL pública; None se a URL não é uma foto deste produto no bucket."""
    marcador = f'/storage/v1/object/public/{bucket}/'
    if not url or marcador not in url:
        return None
    caminho = url.split(marcador, 1)[1].split('?', 1)[0]
    return caminho if caminho.startswith(f'produtos/{produto_id}/') and '..' not in caminho else None


def descartar_imagem(produto_id, url):
    """Remove do bucket uma foto que deixou de ser usada; só depois do commit que a substituiu.

    Melhor esforço: uma falha aqui deixa um arquivo órfão (registrado em log), nunca desfaz
    a operação. URLs externas ou de outro produto não são tocadas.
    """
    bucket = current_app.config['STORAGE_BUCKET']
    caminho = caminho_no_bucket(url, bucket, produto_id)
    if not caminho:
        return False
    try:
        get_supabase_admin_client().storage.from_(bucket).remove([caminho])
        return True
    except Exception:
        logger.warning('imagem_orfa produto_id=%s caminho=%s', produto_id, caminho)
        return False
