"""Inicia el servidor local de Órbita Sonora."""
import argparse
import os

import uvicorn


def main():
    opciones = argparse.ArgumentParser(description=__doc__)
    opciones.add_argument("--host", default="127.0.0.1")
    opciones.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8000")))
    opciones.add_argument("--strictPort", action="store_true", help=argparse.SUPPRESS)
    argumentos = opciones.parse_args()
    uvicorn.run("main:app", host=argumentos.host, port=argumentos.port)


if __name__ == "__main__":
    main()
