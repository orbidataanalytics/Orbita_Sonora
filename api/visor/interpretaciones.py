import os
from pathlib import Path
import re
import shutil
import subprocess

import av

from .red import ErrorMedio

CARPETA = re.compile(r"[a-z0-9]+(?:_[a-z0-9]+)*")
NOMBRE_MP4 = re.compile(r"[a-z0-9]+(?:_[a-z0-9]+)*\.mp4")
FORMATOS = "mov,mp4,m4a,3gp,3g2,mj2,matroska,webm,avi,mpeg,mp3,wav,aac,flac,ogg,aiff"


class Interpretaciones:
    def __init__(self, raiz):
        self.raiz = Path(raiz)

    def listar(self, carpeta):
        if not CARPETA.fullmatch(carpeta):
            raise ErrorMedio("La carpeta solo admite letras minúsculas, números y guion bajo.")
        directorio = self.raiz / carpeta
        if not directorio.is_dir():
            return []
        return [p.name for p in sorted(directorio.iterdir())
                if p.is_file() and not p.is_symlink() and NOMBRE_MP4.fullmatch(p.name)]


class MezcladorVideo:
    def __init__(self, limite_segundos=300):
        self.limite_segundos = limite_segundos

    def verificar(self, ruta, tipo):
        try:
            with av.open(str(ruta), options={"format_whitelist": FORMATOS, "protocol_whitelist": "file", "probesize": "2000000"}) as medio:
                pistas = getattr(medio.streams, tipo)
                if not pistas:
                    raise ErrorMedio(f"El archivo {ruta.stem} no contiene una pista de {tipo}.")
                if tipo == "video":
                    pista = pistas[0]
                    segundos = float(pista.duration * pista.time_base) if pista.duration else (medio.duration or 0) / av.time_base
                    if not 0 < segundos <= self.limite_segundos:
                        raise ErrorMedio(f"Usa un video de hasta {self.limite_segundos} segundos con duración determinada.")
                    if pista.width * pista.height > 9_000_000:
                        raise ErrorMedio("Usa resolución 4K o inferior.")
                    return segundos
        except (av.FFmpegError, ValueError, OverflowError) as error:
            raise ErrorMedio(f"No se pudo leer el archivo {ruta.stem}.") from error
        return None

    def ffmpeg(self):
        ejecutable = os.environ.get("ORBITA_FFMPEG") or shutil.which("ffmpeg")
        if ejecutable:
            return ejecutable
        from imageio_ffmpeg import get_ffmpeg_exe
        return get_ffmpeg_exe()

    def filtros(self, pistas):
        filtros = []
        for i, (db, ajuste) in enumerate(pistas, start=1):
            tiempo = f"atrim=start={-ajuste / 1000:.3f}," if ajuste < 0 else ""
            retraso = f"adelay={ajuste}:all=1," if ajuste > 0 else ""
            filtros.append(f"[{i}:a:0]{tiempo}asetpts=PTS-STARTPTS,aresample=48000,"
                           f"aformat=channel_layouts=stereo,{retraso}volume={db:.2f}dB[a{i}]")
        filtros.append("[a1][a2][a3]amix=inputs=3:duration=longest:normalize=0,"
                       "alimiter=limit=0.90:level=0:latency=1,apad[mezcla]")
        return ";".join(filtros)

    def mezclar(self, video, pistas, salida):
        segundos = self.verificar(video, "video")
        for ruta, _, _ in pistas:
            self.verificar(ruta, "audio")
        comando = [self.ffmpeg(), "-hide_banner", "-loglevel", "error", "-nostdin", "-y"]
        for ruta in [video, *(ruta for ruta, _, _ in pistas)]:
            comando.extend(["-format_whitelist", FORMATOS, "-protocol_whitelist", "file", "-i", str(ruta)])
        comando.extend([
            "-filter_complex_threads", "1", "-filter_complex", self.filtros([(db, ms) for _, db, ms in pistas]),
            "-map", "0:v:0", "-map", "[mezcla]", "-map_metadata", "-1", "-map_chapters", "-1",
            "-vf", "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30",
            "-c:v", "libx264", "-threads", "2", "-preset", "veryfast", "-pix_fmt", "yuv420p",
            "-crf", "23", "-maxrate", "2100k", "-bufsize", "3500k", "-c:a", "aac", "-b:a", "160k",
            "-movflags", "+faststart", "-t", f"{segundos:.3f}", str(salida),
        ])
        try:
            subprocess.run(comando, check=True, capture_output=True, timeout=210)
        except (OSError, RuntimeError, subprocess.SubprocessError) as error:
            raise ErrorMedio("La mezcla falló. Verifica que el video y los tres audios se puedan reproducir.") from error
        if not salida.is_file() or not 0 < salida.stat().st_size < 95 * 1024 * 1024:
            raise ErrorMedio("El MP4 resultante no cabe en una publicación de GitHub Pages.")
        return salida
