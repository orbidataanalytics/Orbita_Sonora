import time

from fastapi import APIRouter

GOES_SECTOR = "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/nsa/GEOCOLOR/1800x1080.jpg"


def crear_rutas(version):
    router = APIRouter(tags=["Sistema y GOES"])

    @router.get("/health")
    def salud():
        return {"status": "online", "version": version}

    @router.get("/api/datos")
    def obtener_datos():
        return {
            "proyecto": "Órbita Sonora", "organizacion": "ORBIDATA", "planeta": "Tierra (GOES-19)",
            "estado": "Conectado", "origen": "NOAA / NASA Open Data",
            "album": "Análisis de datos", "autores": "ORBIDATA ANALYTICS",
            "genero": "Sonificación de imágenes y videos",
        }

    @router.get("/api/goes")
    def obtener_goes():
        return {
            "satelite": "GOES-19 (GOES-East)",
            "coordenadas": "75.2° W · Colombia y norte de Suramérica",
            "tipo_captura": "GeoColor · sector nsa",
            "image_url": f"{GOES_SECTOR}?t={int(time.time()) // 600}",
        }
    return router
