"""Isolated public-route smoke server: no Supabase credentials or production database."""
import os
import sys
from pathlib import Path

os.environ.update(DATABASE_URL='postgresql+psycopg2://127.0.0.1/pdv_test',
                  SUPABASE_URL='https://example.test', SUPABASE_ANON_KEY='synthetic-public-key',
                  SUPABASE_SERVICE_ROLE_KEY='synthetic-not-a-secret', SECRET_KEY='synthetic-test',
                  FLASK_DEBUG='false', SQLALCHEMY_ECHO='false')
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app import create_app

if __name__ == '__main__':
    create_app({'TESTING': True}).run(host='127.0.0.1', port=5055, debug=False, use_reloader=False)
