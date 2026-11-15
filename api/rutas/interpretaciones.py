from pathlib import Path
from tempfile import TemporaryDirectory
from threading import BoundedSemaphore
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from api.visor.interpretaciones import Interpretaciones, MezcladorVideo, NOMBRE_MP4
from api.visor.red import ErrorMedio

MIB = 1024 * 1024


def crear_rutas(raiz: Path):
    router = APIRouter(prefix="/api/interpretaciones", tags=["Interpretaciones"])
    repositorio = Interpretaciones(raiz)
    mezclador = MezcladorVideo()
    cupo = BoundedSemaphore(1)

    @router.get("/{carpeta}")
    def ver(carpeta: str):
        try:
            return {"videos": repositorio.listar(carpeta)}
        except ErrorMedio as error:
            raise HTTPException(error.estado, str(error)) from error

    def copiar(archivo, destino, limite):
        if archivo.size is not None and archivo.size > limite:
            raise ErrorMedio(f"{destino.stem} supera {limite // MIB} MiB.", 413)
        total = 0
        with destino.open("wb") as salida:
            while bloque := archivo.file.read(MIB):
                total += len(bloque)
                if total > limite:
                    raise ErrorMedio(f"{destino.stem} supera {limite // MIB} MiB.", 413)
                salida.write(bloque)
        if not total:
            raise ErrorMedio(f"{destino.stem} está vacío.")

    @router.post("/mezclar")
    def mezclar(
        video: Annotated[UploadFile, File()],
        rojo: Annotated[UploadFile, File()],
        verde: Annotated[UploadFile, File()],
        azul: Annotated[UploadFile, File()],
        nombre: Annotated[str, Form(min_length=5, max_length=100)] = "interpretacion.mp4",
        vol_r: Annotated[float, Form(ge=-30, le=9)] = -3,
        vol_g: Annotated[float, Form(ge=-30, le=9)] = -3,
        vol_b: Annotated[float, Form(ge=-30, le=9)] = -3,
        ms_r: Annotated[int, Form(ge=-10000, le=10000)] = 0,
        ms_g: Annotated[int, Form(ge=-10000, le=10000)] = 0,
        ms_b: Annotated[int, Form(ge=-10000, le=10000)] = 0,
    ):
        if not NOMBRE_MP4.fullmatch(nombre):
            raise HTTPException(422, "Usa un nombre como ensayo_01.mp4.")
        if not cupo.acquire(blocking=False):
            raise HTTPException(503, "El mezclador está ocupado. Intenta en un momento.")
        temporal = TemporaryDirectory(prefix="orbita-video-")
        try:
            carpeta = Path(temporal.name)
            original = carpeta / "video.bin"
            copiar(video, original, 95 * MIB)
            rutas = []
            for etiqueta, archivo, volumen, ajuste in zip(
                ("percusion", "guitarra", "bajo"), (rojo, verde, azul), (vol_r, vol_g, vol_b), (ms_r, ms_g, ms_b)
            ):
                archivo_local = carpeta / f"{etiqueta}.bin"
                copiar(archivo, archivo_local, 36 * MIB)
                rutas.append((archivo_local, volumen, ajuste))
            salida = mezclador.mezclar(original, rutas, carpeta / nombre)
        except ErrorMedio as error:
            temporal.cleanup()
            raise HTTPException(error.estado, str(error)) from error
        except BaseException:
            temporal.cleanup()
            raise
        finally:
            cupo.release()
        return FileResponse(salida, media_type="video/mp4", filename=nombre, background=BackgroundTask(temporal.cleanup))
    return router
