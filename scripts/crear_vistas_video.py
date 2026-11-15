"""Prepara clips de referencia de visualizaciones NASA para el visor web."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory

from api.visor.red import ClientePublico

RAIZ = Path(__file__).resolve().parents[1]


class VistasVideo:
    def __init__(self):
        self.cliente = ClientePublico(timeout=25)

    def preparar(self, numero, segundos):
        carpeta = RAIZ / "datos" / "paquetes" / f"svs-{numero}"
        manifiesto = carpeta / "paquete.json"
        paquete = json.loads(manifiesto.read_text(encoding="utf-8"))
        medio = next(m for m in paquete["medios"] if m["tipo"] == "video")
        nombre = "vista-video.mp4"
        with TemporaryDirectory() as directorio:
            original = Path(directorio) / "original"
            with self.cliente.abrir(medio["url"]) as (respuesta, _):
                original.write_bytes(self.cliente.leer(respuesta, 80 * 1024 * 1024))
            temporal = Path(directorio) / nombre
            subprocess.run([
                "ffmpeg", "-y", "-loglevel", "error", "-threads", "2", "-i", str(original),
                "-t", str(segundos), "-map", "0:v:0", "-an",
                "-vf", "scale=640:-2,fps=15", "-c:v", "libx264", "-threads", "2",
                "-preset", "veryfast", "-crf", "25", "-pix_fmt", "yuv420p",
                "-movflags", "+faststart", str(temporal),
            ], check=True, timeout=100)
            shutil.copyfile(temporal, carpeta / nombre)
        medio["vista_local"] = (carpeta / nombre).relative_to(RAIZ).as_posix()
        medio["descripcion"] = ((medio.get("descripcion") or "") + f" Vista previa de {segundos} s.").strip()
        manifiesto.write_text(json.dumps(paquete, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Vista de {segundos} s lista para NASA SVS {numero}.")


def main():
    opciones = argparse.ArgumentParser(description=__doc__)
    opciones.add_argument("ids", type=int, nargs="*", default=[5313, 4950])
    opciones.add_argument("--segundos", type=int, default=12, choices=range(1, 61), metavar="1–60")
    argumentos = opciones.parse_args()
    generador = VistasVideo()
    with ThreadPoolExecutor(max_workers=3) as ejecutor:
        list(ejecutor.map(lambda numero: generador.preparar(numero, argumentos.segundos), argumentos.ids))


if __name__ == "__main__":
    main()
