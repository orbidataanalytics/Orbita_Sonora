"""Genera videos/catalogo.json para descubrir los MP4 de las interpretaciones."""
import json
from pathlib import Path
import re

CARPETA = re.compile(r"[a-z0-9]+(?:_[a-z0-9]+)*")
NOMBRE_MP4 = re.compile(r"[a-z0-9]+(?:_[a-z0-9]+)*\.mp4")


class IndiceVideos:
    def __init__(self, raiz):
        self.raiz = Path(raiz)

    def ejecutar(self):
        indice = {}
        for carpeta in sorted(self.raiz.iterdir()):
            if not carpeta.is_dir() or carpeta.is_symlink() or not CARPETA.fullmatch(carpeta.name):
                continue
            videos = [p.name for p in sorted(carpeta.iterdir())
                      if p.is_file() and not p.is_symlink() and NOMBRE_MP4.fullmatch(p.name)]
            if videos:
                indice[carpeta.name] = videos
        destino = self.raiz / 'catalogo.json'
        temporal = destino.with_suffix('.tmp')
        temporal.write_text(json.dumps(indice, indent=2) + '\n', encoding='utf-8')
        temporal.replace(destino)
        print(f'{len(indice)} carpetas con videos indexados.')


if __name__ == '__main__':
    IndiceVideos(Path(__file__).resolve().parents[1] / 'videos').ejecutar()
