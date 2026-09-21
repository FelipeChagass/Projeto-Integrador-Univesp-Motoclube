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
    assert result.startswith(b'\x89PNG')


@pytest.mark.parametrize('content', [b'', b'<svg onload="evil()"></svg>', b'GIF89abad', b'x' * (4 * 1024 * 1024 + 1)], ids=['empty', 'svg', 'corrupted', 'too-large'])
def test_invalid_images_rejected(content):
    with pytest.raises(ApiError) as error:
        validar_imagem(BytesIO(content))
    assert error.value.status_code == 422
