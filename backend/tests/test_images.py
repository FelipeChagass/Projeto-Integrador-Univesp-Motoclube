from io import BytesIO
from PIL import Image
import pytest
from app.core.errors import ApiError
from app.features.produtos.images import validar_imagem


def test_valid_image_reencoded_without_filename_or_metadata():
    data = BytesIO()
    Image.new('RGB', (2, 2), 'red').save(data, format='JPEG')
    data.seek(0)
    result = validar_imagem(data)
    assert result[:4] == b'RIFF' and result[8:12] == b'WEBP'


def test_large_image_is_reduced_keeping_proportion():
    data = BytesIO()
    Image.new('RGBA', (3000, 1500), (200, 0, 0, 128)).save(data, format='PNG')
    data.seek(0)
    with Image.open(BytesIO(validar_imagem(data))) as reduzida:
        assert reduzida.size == (1024, 512) and reduzida.mode == 'RGBA'


@pytest.mark.parametrize('content', [b'', b'<svg onload="evil()"></svg>', b'GIF89abad', b'x' * (4 * 1024 * 1024 + 1)], ids=['empty', 'svg', 'corrupted', 'too-large'])
def test_invalid_images_rejected(content):
    with pytest.raises(ApiError) as error:
        validar_imagem(BytesIO(content))
    assert error.value.status_code == 422
