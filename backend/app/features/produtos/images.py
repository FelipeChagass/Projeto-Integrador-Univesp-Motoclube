"""Validate and re-encode images before sending them to the configured storage bucket."""
from io import BytesIO
import warnings
from uuid import uuid4

from PIL import Image, UnidentifiedImageError
from app.core.errors import ApiError

MAX_BYTES = 4 * 1024 * 1024


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
                result = BytesIO()
                img.convert('RGBA').save(result, format='PNG')
                if result.tell() > MAX_BYTES:
                    raise ApiError('IMAGEM_TAMANHO', 'Imagem processada excede 4 MB.', 422)
                return result.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ApiError('IMAGEM_INVALIDA', 'Conteúdo de imagem inválido.', 422) from None


def enviar_imagem(client, bucket, produto_id, conteudo):
    # Immutable object: failed DB updates cannot overwrite the existing product image.
    path = f'produtos/{produto_id}/{uuid4().hex}.png'
    try:
        storage = client.storage.from_(bucket)
        storage.upload(path, conteudo, {'content-type': 'image/png', 'upsert': 'false'})
        return storage.get_public_url(path)
    except Exception:
        raise ApiError('STORAGE_INDISPONIVEL', 'Não foi possível salvar a imagem. Tente novamente.', 503) from None
