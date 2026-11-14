"""Construye un ejemplo GIS a partir de la imagen Blue Marble incluida."""
import argparse
import json
from pathlib import Path
import subprocess

RAIZ = Path(__file__).resolve().parents[1]
CARPETA = RAIZ / "datos" / "paquetes" / "demo-caribe"


class Demostracion:
    def ejecutar(self):
        imagen = CARPETA / "caribe.jpg"
        video = CARPETA / "caribe.mp4"
        filtro = "scale=436:256,format=rgb24,geq=r='r(X,Y)*(0.85+0.15*sin(T*1.2))':g='g(X,Y)':b='b(X,Y)',format=yuv420p"
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-framerate", "12",
            "-i", str(imagen), "-vf", filtro, "-t", "8", "-an", "-c:v", "libx264",
            "-threads", "2", "-movflags", "+faststart", str(video),
        ], check=True)
        uri = "datos/paquetes/demo-caribe/"
        fuente = "https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/"
        geografia = {"tipo": "esquinas", "coordenadas": [[-89,24],[-60,24],[-60,7],[-89,7]],
                     "origen": "Recorte equirectangular de Blue Marble (NASA)"}
        paquete = {
            "id": "demo-caribe", "titulo": "Caribe · demostración GIS",
            "portada": uri + "caribe.jpg", "fuente": fuente, "proveedor": "NASA Earth Observatory",
            "medio_inicial": "caribe-imagen",
            "medios": [
                {"id": "caribe-imagen", "tipo": "imagen", "titulo": "Caribe y norte de Suramérica",
                 "url": uri + "caribe.jpg", "fuente": fuente, "geografia": geografia,
                 "descripcion": "Recorte de Blue Marble de febrero de 2004."},
                {"id": "caribe-video", "tipo": "video", "titulo": "Caribe · variación RGB de demostración",
                 "url": uri + "caribe.mp4", "poster": uri + "caribe.jpg", "fuente": fuente, "geografia": geografia,
                 "descripcion": "Animación ilustrativa que modula el rojo del recorte fijo. Las esquinas no cambian."},
            ],
        }
        (CARPETA / "paquete.json").write_text(json.dumps(paquete, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    argparse.ArgumentParser(description=__doc__).parse_args()
    Demostracion().ejecutar()
