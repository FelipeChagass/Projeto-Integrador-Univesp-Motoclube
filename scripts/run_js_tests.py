"""Start/stop our own smoke server and run all Jest tests; never attach to a user's server."""
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def main():
    with socket.socket() as probe:
        if probe.connect_ex(('127.0.0.1', 5055)) == 0:
            raise RuntimeError('Porta 5055 ocupada. Não será usado/encerrado um servidor desconhecido.')
    server = subprocess.Popen([sys.executable, str(ROOT / 'scripts/smoke_server.py')], cwd=ROOT)
    try:
        for _ in range(100):
            if server.poll() is not None:
                raise RuntimeError('Servidor isolado encerrou antes dos testes.')
            try:
                with urlopen('http://127.0.0.1:5055/api/health', timeout=1) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(.1)
        else:
            raise RuntimeError('Servidor isolado não ficou pronto.')
        env = dict(os.environ, PDV_TEST_BASE_URL='http://127.0.0.1:5055')
        return subprocess.call(['node', '--experimental-vm-modules', str(ROOT / 'node_modules/jest/bin/jest.js'),
                                '--runInBand'], cwd=ROOT, env=env)
    finally:
        server.terminate()
        server.wait(timeout=10)


if __name__ == '__main__':
    sys.exit(main())
