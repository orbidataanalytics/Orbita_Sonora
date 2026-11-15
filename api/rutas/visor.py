from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import Response, StreamingResponse
import json
import re

from api.visor.catalogo import Catalogador
from api.visor.imagenes import LectorImagen
from api.visor.red import ClientePublico, ErrorMedio
from api.visor.tipos import tipo_medio
from api.visor.videos import LectorVideo

MIB = 1024 * 1024
LIMITE_IMAGEN = 40 * MIB
LIMITE_VIDEO = 80 * MIB


def crear_rutas():
    router = APIRouter(prefix="/api/visor", tags=["Visor y sonificación"])
    cliente = ClientePublico()
    catalogo = Catalogador(cliente, max_paginas=20)
    imagenes = LectorImagen()
    videos = LectorVideo()

    def error_http(error):
        return HTTPException(status_code=error.estado, detail=str(error))

    @router.get("/importar")
    def importar(url: Annotated[str, Query(min_length=8, max_length=2048)]):
        try:
            return catalogo.importar(url)
        except ErrorMedio as error:
            raise error_http(error) from error
        except (ValueError, KeyError, TypeError) as error:
            raise HTTPException(422, "El sitio no entregó metadatos multimedia válidos.") from error

    def imagen_respuesta(cuerpo, nombre):
        salida, datos = imagenes.convertir(cuerpo, nombre)
        return Response(salida, media_type="image/png", headers={
            "X-Orbita-Imagen": json.dumps(datos, ensure_ascii=True, separators=(",", ":")),
            "X-Content-Type-Options": "nosniff",
        })

    def video_respuesta(cuerpo, inicio):
        salida, metadatos = videos.convertir(cuerpo, inicio)
        return Response(salida, media_type="video/mp4", headers={
            "X-Orbita-Video": "Fragmento normalizado de hasta 60 segundos",
            "X-Orbita-Video-Meta": json.dumps(metadatos, separators=(",", ":")),
            "X-Content-Type-Options": "nosniff",
        })

    @router.get("/imagen")
    def imagen(url: Annotated[str, Query(min_length=8, max_length=2048)]):
        try:
            with cliente.abrir(url) as (respuesta, final):
                if tipo_medio(final, respuesta.headers.get("content-type", "")) != "imagen":
                    raise ErrorMedio("La URL no entrega una imagen.")
                cuerpo = cliente.leer(respuesta, LIMITE_IMAGEN)
            return imagen_respuesta(cuerpo, final)
        except ErrorMedio as error:
            raise error_http(error) from error

    @router.get("/video")
    def video(
        url: Annotated[str, Query(min_length=8, max_length=2048)],
        convertir: bool = False,
        inicio: Annotated[float, Query(ge=0, le=86400)] = 0,
        range_header: Annotated[str | None, Header(alias="Range", max_length=65)] = None,
    ):
        try:
            if range_header and not re.fullmatch(r"bytes=(?:\d+-\d*|-\d+)", range_header):
                raise ErrorMedio("Rango de bytes inválido.", 416)
            if not convertir:
                return transmitir_video(url, range_header)
            with cliente.abrir(url) as (respuesta, final):
                mime = respuesta.headers.get("content-type", "")
                if tipo_medio(final, mime) != "video":
                    raise ErrorMedio("La URL no entrega un video.")
                cuerpo = cliente.leer(respuesta, LIMITE_VIDEO)
            return video_respuesta(cuerpo, inicio)
        except ErrorMedio as error:
            raise error_http(error) from error

    def transmitir_video(url, rango):
        flujo = cliente.abrir(url, rango)
        respuesta, final = flujo.__enter__()
        mime = respuesta.headers.get("content-type", "").split(";", 1)[0]
        if tipo_medio(final, mime) != "video":
            flujo.__exit__(None, None, None)
            raise ErrorMedio("La URL no entrega un video.")

        def bloques():
            try:
                yield from respuesta.iter_bytes(64 * 1024)
            finally:
                flujo.__exit__(None, None, None)

        headers = {"X-Content-Type-Options": "nosniff", "Content-Encoding": "identity"}
        for campo in ("Content-Range", "Accept-Ranges", "Content-Length"):
            if valor := respuesta.headers.get(campo):
                headers[campo] = valor
        return StreamingResponse(bloques(), status_code=respuesta.status_code,
                                 media_type=mime if mime.startswith("video/") else "video/mp4", headers=headers)

    @router.post("/archivo")
    def archivo(
        archivo: Annotated[UploadFile, File()],
        tipo: Annotated[Literal["imagen", "video"] | None, Form()] = None,
        inicio: Annotated[float, Form(ge=0, le=86400)] = 0,
    ):
        nombre = archivo.filename or "archivo"
        tipo = tipo or tipo_medio(nombre, archivo.content_type or "")
        if tipo is None:
            raise HTTPException(422, "El formato del archivo no se reconoce como imagen o video.")
        limite = LIMITE_IMAGEN if tipo == "imagen" else LIMITE_VIDEO
        try:
            if archivo.size is not None and archivo.size > limite:
                raise ErrorMedio(f"El archivo supera {limite // MIB} MiB.", 413)
            cuerpo = archivo.file.read(limite + 1)
            if len(cuerpo) > limite:
                raise ErrorMedio(f"El archivo supera {limite // MIB} MiB.", 413)
            return imagen_respuesta(cuerpo, nombre) if tipo == "imagen" else video_respuesta(cuerpo, inicio)
        except ErrorMedio as error:
            raise error_http(error) from error

    return router
