"""Regenera los manifiestos SVS y, si se solicita, sus vistas previas."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import json
from pathlib import Path
from urllib.parse import urlsplit

from PIL import Image, ImageOps

from api.visor.catalogo import Catalogador
from api.visor.red import ClientePublico, ErrorMedio

RAIZ = Path(__file__).resolve().parents[1]
MIB = 1024 * 1024


class CatalogadorNASA(Catalogador):
    def __init__(self, cliente, cache):
        super().__init__(cliente, max_paginas=75)
        self.cache = cache

    def datos_svs(self, numero):
        archivo = self.cache / f"api-{numero}.raw" if self.cache else None
        if archivo and archivo.is_file():
            return json.loads(archivo.read_bytes())
        return super().datos_svs(numero)

    def importar(self, original):
        if urlsplit(original).path == "/gallery/earth-information-center/":
            return self.svs(original, 40467)
        return super().importar(original)


class GeneradorCatalogo:
    def __init__(self, raiz, cache=None):
        self.raiz = raiz
        self.cliente = ClientePublico(timeout=18)
        self.catalogador = CatalogadorNASA(self.cliente, cache)
        self.destino = raiz / "datos" / "paquetes"

    def escribir(self, ruta, objeto):
        temporal = ruta.with_suffix(".tmp")
        temporal.write_text(json.dumps(objeto, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporal.replace(ruta)

    def vista_previa(self, destino, nombre, url, lado):
        if not url:
            return None
        archivo = destino / f"{nombre}.jpg"
        try:
            if not archivo.is_file():
                with self.cliente.abrir(url) as (respuesta, _):
                    cuerpo = self.cliente.leer(respuesta, 25 * MIB)
                with Image.open(BytesIO(cuerpo)) as entrada:
                    imagen = ImageOps.exif_transpose(entrada).convert("RGB")
                    imagen.thumbnail((lado, lado), Image.Resampling.LANCZOS)
                    imagen.save(archivo, quality=85, optimize=True)
            return archivo.relative_to(self.raiz).as_posix()
        except (OSError, ValueError, ErrorMedio) as error:
            print(f"Vista previa pendiente: {url} ({error})")
            return None

    def preparar(self, url, vistas):
        paquete = self.catalogador.importar(url)
        carpeta = self.destino / f"svs-{paquete['svs_id']}"
        carpeta.mkdir(parents=True, exist_ok=True)
        if vistas:
            puerto = self.vista_previa(carpeta, "portada", paquete.get("portada"), 1200)
            if puerto:
                paquete["portada_local"] = puerto
            elegido = next((medio for medio in paquete["medios"] if medio["url"] == paquete.get("portada")), None)
            if not elegido:
                elegido = next((medio for medio in paquete["medios"] if medio["tipo"] == "imagen"), None)
            if elegido:
                if puerto and elegido["url"] == paquete.get("portada"):
                    elegido["vista_local"] = puerto
                else:
                    local = self.vista_previa(carpeta, "imagen", elegido["url"], 1200)
                    if local:
                        elegido["vista_local"] = local
                paquete["medio_inicial"] = elegido["id"]
        archivo = carpeta / "paquete.json"
        anterior = json.loads(archivo.read_text(encoding="utf-8")) if archivo.is_file() else {}
        previos = {m["id"]: m for m in anterior.get("medios", [])}
        archivos = {v["url"]: v["copia_local"] for m in previos.values()
                    for v in (m, *m.get("variantes", [])) if v.get("copia_local")}
        for campo in ("portada_local", "medio_inicial"):
            if campo in anterior:
                paquete.setdefault(campo, anterior[campo])
        for medio in paquete["medios"]:
            for campo in ("vista_local", "poster_local", "geografia"):
                if campo in previos.get(medio["id"], {}):
                    medio.setdefault(campo, previos[medio["id"]][campo])
            for variante in (medio, *medio.get("variantes", [])):
                copia = archivos.get(variante["url"])
                if copia and (self.raiz / copia).is_file():
                    variante["copia_local"] = copia
        self.escribir(archivo, paquete)
        imagenes = sum(m["tipo"] == "imagen" for m in paquete["medios"])
        print(f"{paquete['svs_id']}: {imagenes} imágenes, {len(paquete['medios']) - imagenes} videos")
        return {
            "id": paquete["id"], "titulo": paquete["titulo"],
            "manifiesto": archivo.relative_to(self.raiz).as_posix(),
            "portada": paquete.get("portada_local") or paquete["portada"],
            "imagenes": imagenes, "videos": len(paquete["medios"]) - imagenes,
            "descargas_incluidas": sum(any(v.get("copia_local") for v in (m, *m.get("variantes", [])))
                                      for m in paquete["medios"]),
        }

    def ejecutar(self, vistas):
        fuentes = json.loads((self.raiz / "datos" / "fuentes-svs.json").read_text(encoding="utf-8"))
        urls = dict.fromkeys(fuentes)
        with ThreadPoolExecutor(max_workers=5) as ejecutor:
            entradas = list(ejecutor.map(lambda url: self.preparar(url, vistas), urls))
        self.escribir(self.destino / "catalogo.json", {"version": 1, "paquetes": entradas})


def main():
    argumentos = argparse.ArgumentParser(description=__doc__)
    argumentos.add_argument("--vistas", action="store_true", help="Descarga la imagen principal de cada paquete")
    argumentos.add_argument("--cache", type=Path, help="Carpeta opcional de respuestas JSON de NASA SVS")
    opciones = argumentos.parse_args()
    GeneradorCatalogo(RAIZ, opciones.cache).ejecutar(opciones.vistas)


if __name__ == "__main__":
    main()
