"""Crea teselas Web Mercator a partir de la imagen equirectangular incluida."""
import math
from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parents[1] / "web" / "geo"


class Teselas:
    def ejecutar(self):
        with Image.open(RAIZ / "tierra.jpg") as archivo:
            textura = np.asarray(archivo.convert("RGB"))
        alto, ancho, _ = textura.shape
        tamano = 256
        for zoom in range(3):
            cantidad = 2 ** zoom
            fraccion = (np.arange(tamano) + .5) / (cantidad * tamano)
            for columna in range(cantidad):
                xs = np.clip((fraccion + columna / cantidad) * ancho, 0, ancho - 1).astype(int)
                carpeta = RAIZ / "teselas" / str(zoom) / str(columna)
                carpeta.mkdir(parents=True, exist_ok=True)
                for fila in range(cantidad):
                    v = fraccion + fila / cantidad
                    latitud = np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * v))))
                    ys = np.clip((90 - latitud) / 180 * alto, 0, alto - 1).astype(int)
                    Image.fromarray(textura[ys[:, None], xs]).save(carpeta / f"{fila}.jpg", quality=85)


if __name__ == "__main__":
    Teselas().ejecutar()
