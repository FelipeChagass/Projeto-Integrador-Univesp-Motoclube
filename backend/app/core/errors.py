"""Erros públicos estáveis; detalhes de infraestrutura nunca entram na resposta."""

from flask import g, jsonify, request
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError, OperationalError, SQLAlchemyError
from werkzeug.exceptions import HTTPException


class ApiError(Exception):
    def __init__(self, code, message, status_code=400, details=None, retryable=False):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details
        self.retryable = retryable

    def to_dict(self):
        return {
            'status': 'erro', 'code': self.code, 'message': self.message,
            'details': self.details, 'retryable': self.retryable,
        }


def json_object():
    data = request.get_json()
    if not isinstance(data, dict):
        raise ApiError('JSON_INVALIDO', 'Envie um objeto JSON.', 400)
    return data


def register_error_handlers(app):
    @app.errorhandler(ApiError)
    def api_error(error):
        payload = error.to_dict()
        payload['request_id'] = getattr(g, 'request_id', None)
        return jsonify(payload), error.status_code

    @app.errorhandler(ValidationError)
    def validation_error(error):
        details = [
            {'field': '.'.join(map(str, item['loc'])), 'type': item['type']}
            for item in error.errors(include_input=False, include_context=False, include_url=False)
        ]
        return api_error(ApiError('VALIDACAO', 'Dados inválidos.', 422, details))

    @app.errorhandler(HTTPException)
    def http_error(error):
        messages = {
            400: 'Requisição inválida.', 401: 'Autenticação necessária.',
            403: 'Acesso negado.', 404: 'Recurso não encontrado.',
            405: 'Método não permitido.', 413: 'Arquivo ou requisição muito grande.',
            415: 'Envie Content-Type application/json.', 429: 'Muitas tentativas.',
        }
        return api_error(ApiError(
            f'HTTP_{error.code}', messages.get(error.code, 'Requisição recusada.'),
            error.code or 500, retryable=error.code in (429, 502, 503, 504),
        ))

    @app.errorhandler(IntegrityError)
    def integrity_error(error):
        app.logger.warning('integrity_error request_id=%s', getattr(g, 'request_id', None))
        return api_error(ApiError('CONFLITO_INTEGRIDADE', 'Operação em conflito com os dados existentes.', 409))

    @app.errorhandler(OperationalError)
    def unavailable(error):
        app.logger.error('database_unavailable request_id=%s', getattr(g, 'request_id', None))
        return api_error(ApiError('SERVICO_INDISPONIVEL', 'Serviço temporariamente indisponível.', 503, retryable=True))

    @app.errorhandler(SQLAlchemyError)
    @app.errorhandler(Exception)
    def unexpected_error(error):
        # Exceções SQL/SDK podem conter parâmetros e credenciais; omitir seu texto.
        app.logger.error('unhandled_error type=%s request_id=%s', type(error).__name__, getattr(g, 'request_id', None))
        return api_error(ApiError('ERRO_INTERNO', 'Não foi possível concluir a operação.', 500, retryable=True))
