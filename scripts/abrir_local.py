"""Abre el visor de Órbita Sonora en el navegador."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser


def main():
    raiz = Path(__file__).resolve().parents[1]
    manejador = partial(SimpleHTTPRequestHandler, directory=str(raiz))
    try:
        servidor = ThreadingHTTPServer(("127.0.0.1", 8000), manejador)
    except OSError:
        servidor = ThreadingHTTPServer(("127.0.0.1", 0), manejador)
    with servidor:
        url = f"http://127.0.0.1:{servidor.server_port}/"
        print(f"Visor de Órbita Sonora en {url}", flush=True)
        webbrowser.open(url)
        try:
            servidor.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
